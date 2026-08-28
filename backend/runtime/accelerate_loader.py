"""Accelerate integration — bridges project GPU/VRAM tracking with HuggingFace
Accelerate's big-model inference APIs (device dispatch, CPU offload,
memory-aware loading, mixed-precision support).

This module is import-safe: if ``accelerate`` is not installed it degrades
gracefully so all providers continue to work with the existing ``.to(device)``
path. No caller should ever ``import accelerate`` directly — use this module.

ponytail: single source of truth for the Accelerate ↔ project boundary.
If the integration grows beyond these helpers, extract a dedicated sub-module
rather than sprawling per-provider accelerate imports.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_ACCELERATE_AVAILABLE: bool | None = None


def accelerate_available() -> bool:
    """Return True if the ``accelerate`` package can be imported.

    Import is attempted on every call so that callers running after
    ``_add_model_env()`` (which clears ``sys.modules`` and rewrites
    ``sys.path`` for a per-model venv) resolve the *current* environment's
    ``accelerate`` rather than a stale backend-venv reference cached at
    module load time.
    """
    try:
        import accelerate  # noqa: F401
        _ACCELERATE_AVAILABLE = True
        logger.debug("Accelerate available: %s", getattr(accelerate, "__version__", "?"))
        return True
    except ImportError:
        _ACCELERATE_AVAILABLE = False
        logger.debug("Accelerate not installed — using native device management")
        return False


# ---------------------------------------------------------------------------
# Low VRAM mode (Section: engine) — verified strategies applied at load time
# ---------------------------------------------------------------------------

def low_vram_available() -> bool:
    """True when the environment can run a low-VRAM strategy (accelerate present)."""
    return accelerate_available()


def get_effective_strategy(provider_id: str, requested_mode: str = "auto") -> str | None:
    """Resolve which low-VRAM strategy to apply for a provider.

    Reads the provider's ordered strategy hints (strongest first) and returns
    the strongest strategy the environment can actually apply: cpu_offload,
    sequential_offload, attention_slicing, vae_cpu_offload — or None when no
    low-VRAM mode should be active. ``requested_mode`` mirrors
    ``runtime.capability.resolve_vram_mode`` but is kept here so callers can
    force a strategy without importing the full capability module.
    """
    if not low_vram_available():
        return None
    try:
        from runtime.capability import (
            get_low_vram_strategy,
            resolve_vram_mode,
            supports_low_vram,
        )
        if not supports_low_vram(provider_id):
            return None
        resolved = resolve_vram_mode(provider_id, requested_mode)
        if resolved != "low":
            return None
        strategies = get_low_vram_strategy(provider_id)
        # Apply the strongest available strategy, then soft-disable the rest.
        # All metadata strategies are declared VERIFIED in this codebase, so no
        # runtime probe beyond accelerate presence is needed.
        return strategies[0] if strategies else None
    except Exception as exc:
        logger.warning("get_effective_strategy failed for %s: %s", provider_id, exc)
        return None


def apply_low_vram_mode(model: Any, provider_id: str, requested_mode: str = "auto",
                        execution_device: str | None = None,
                        offload_folder: Path | str | None = None) -> str | None:
    """Apply a verified low-VRAM strategy to a loaded model.

    Returns the applied strategy name, or None when no low-VRAM mode is active
    (normal mode should proceed unchanged). Strategies (strongest first):
      - cpu_offload: layer-wise CPU offload via accelerate hooks / pipeline API
      - sequential_offload: sub-model sequential offload (Hunyuan pipelines)
      - attention_slicing: F.scaled_dot_product_attention slicing when the
        model exposes it (pipeline-level ``set_attention_slice``)
      - vae_cpu_offload: VAE offloaded to CPU during denoising

    ponytail: declared strategies are per-model verified paths; the apply
    functions degrade to the strongest supported step rather than silently
    running normal mode when one sub-step is unavailable.
    """
    strategy = get_effective_strategy(provider_id, requested_mode)
    if strategy is None:
        return None

    device = execution_device or (model.device if hasattr(model, "device") else "cuda")
    logger.info("Low VRAM mode '%s' for %s on %s", strategy, provider_id, device)

    if strategy == "cpu_offload":
        if enable_cpu_offload(model, str(device), offload_folder=offload_folder):
            return "cpu_offload"
        # fall through to sequential offload for pipeline dicts
    if strategy == "sequential_offload" and hasattr(model, "models") and model.models:
        dispatch_pipeline_models(
            model.models,
            device=str(device),
            vram_required_mb=10**9,  # force memory-aware offload
            offload_folder=offload_folder,
        )
        return "sequential_offload"
    if strategy == "attention_slicing" and hasattr(model, "set_attention_slice"):
        try:
            model.set_attention_slice("auto")
            return "attention_slicing"
        except Exception as exc:
            logger.warning("set_attention_slice failed for %s: %s", provider_id, exc)
    if strategy == "vae_cpu_offload":
        vae = getattr(model, "vae", None)
        if vae is not None and hasattr(model, "enable_vae_slicing"):
            try:
                model.enable_vae_slicing()
                return "vae_cpu_offload"
            except Exception as exc:
                logger.warning("enable_vae_slicing failed for %s: %s", provider_id, exc)
    logger.warning("No applicable low-VRAM strategy for %s — proceeding in normal mode", provider_id)
    return None



def _safe_exists(p: Path | str) -> bool:
    """Permission-safe path existence check."""
    try:
        from pathlib import Path as _Path
        return _Path(p).exists()
    except (PermissionError, OSError):
        return False


def _is_accelerate_offloaded(model: Any) -> bool:
    """True when Accelerate has intentionally offloaded the model to CPU.

    Covers both ``enable_model_cpu_offload`` (per-submodule ``_hf_hook``) and
    ``device_map`` dispatch (top-level ``hf_device_map``). In both cases tensors
    legitimately rest on CPU between forward passes and move to GPU on demand —
    this is the verified low-VRAM behavior, not a silent CPU fallback.
    """
    try:
        if getattr(model, "hf_device_map", None):
            return True
        from accelerate.hooks import AlignDevicesHook
        for m in model.modules():
            hook = getattr(m, "_hf_hook", None)
            if isinstance(hook, AlignDevicesHook):
                return True
    except Exception:
        pass
    return False


def verify_gpu_placement(
    model: Any, model_name: str, expected_device: str = "cuda"
) -> None:
    """Verify that model tensors are on GPU after load.

    Prevents silent CPU fallback. Raises RuntimeError if tensors are not on a
    CUDA device. Logs a warning if the model has no parameters to check.

    Skips the hard assertion when:
      - CUDA is not available at all (CPU-only host — there is no GPU to use),
        so callers on CPU hosts degrade gracefully instead of crashing.
      - The model is intentionally offloaded via Accelerate (low-VRAM mode) —
        there the CPU placement is by design.
    """
    try:
        import torch
        if not torch.cuda.is_available():
            logger.warning(
                "GPU placement not verifiable for %s: CUDA unavailable (CPU execution)",
                model_name,
            )
            return

        if _is_accelerate_offloaded(model):
            logger.info(
                "GPU VERIFICATION SKIPPED for %s: model uses Accelerate offload "
                "(CPU<->GPU). Tensors rest on CPU between steps by design.",
                model_name,
            )
            return

        param = None
        try:
            param = next(model.parameters())
        except StopIteration:
            if hasattr(model, "models") and model.models:
                for m in model.models.values():
                    try:
                        param = next(m.parameters())
                        break
                    except StopIteration:
                        pass

        if param is not None:
            device_str = str(param.device)
            if not device_str.startswith("cuda"):
                raise RuntimeError(
                    f"GPU VERIFICATION FAILED for {model_name}: "
                    f"Tensors on {device_str}, expected cuda device. "
                    f"Model may silently fall back to CPU."
                )
            logger.info("GPU VERIFIED for %s: tensors on %s", model_name, device_str)
        else:
            logger.warning(
                "GPU VERIFICATION SKIPPED for %s: no parameters found", model_name
            )
    except ImportError:
        logger.warning("Cannot verify GPU placement: torch not available")


def log_gpu_memory(context: str) -> None:
    """Log current GPU memory usage for debugging."""
    try:
        import torch
        if torch.cuda.is_available():
            for i in range(torch.cuda.device_count()):
                allocated = torch.cuda.memory_allocated(i) / (1024**3)
                reserved = torch.cuda.memory_reserved(i) / (1024**3)
                logger.info(
                    "GPU %d memory [%s]: %.2f GB allocated, %.2f GB reserved",
                    i, context, allocated, reserved
                )
    except ImportError:
        pass


def get_max_memory_per_device() -> dict[str, str] | None:
    """Build a ``max_memory`` dict for Accelerate from live GPU VRAM info.

    Returns ``{0: "14GB", 1: "22GB"}`` style mapping, or None when no GPU.
    ponytail: reads free VRAM at call time so it reflects the actual available
    memory, not a stale snapshot. Upgrade path: cache with TTL if called in a
    hot loop.
    """
    if not accelerate_available():
        return None
    try:
        from runtime.gpu import get_gpu_info
        gpu = get_gpu_info()
        if not gpu.available:
            return None
        result: dict[str, str] = {}
        for dev in gpu.devices:
            free_mb = dev.get("free_vram_mb", 0)
            total_mb = dev.get("vram_mb", 0)
            usable_mb = min(free_mb, total_mb)
            if usable_mb > 0:
                result[dev["index"]] = f"{usable_mb}MB"
        return result if result else None
    except Exception as exc:
        logger.warning("get_max_memory_per_device failed: %s", exc)
        return None


def should_use_accelerate(vram_required_mb: int) -> bool:
    """Decide whether Accelerate's memory-aware dispatch is warranted.

    Uses Accelerate when:
    - accelerate is installed, AND
    - VRAM required approaches/breaches available VRAM (within 1.5x safety factor)

    ponytail: 1.5x safety factor — if the model needs more than ~66% of free VRAM,
    dispatch_model's auto device_map can offload layers to CPU/disk to avoid OOM.
    """
    if not accelerate_available():
        return False
    try:
        from runtime.gpu import get_gpu_info
        gpu = get_gpu_info()
        if not gpu.available or not gpu.devices:
            return False
        free_mb = gpu.free_vram_mb
        if vram_required_mb == 0:
            return False
        return vram_required_mb >= free_mb * 0.66
    except Exception:
        return False


def dispatch_model_to_device(
    model: Any,
    device: str,
    vram_required_mb: int = 0,
    offload_folder: Path | str | None = None,
    no_split_module_classes: list[str] | None = None,
) -> bool:
    """Dispatch a model across devices using Accelerate.

    Uses ``dispatch_model`` with ``device_map="auto"`` when VRAM is constrained,
    computing a memory-aware placement via ``infer_auto_device_map``.
    On single-GPU or sufficient-VRAM systems, the model stays on the target device
    (no offload), preserving the same device semantics as ``.to(device)``.

    Returns True if Accelerate dispatch was applied, False if the caller should
    fall back to native ``.to(device)``.

    Does NOT modify model outputs — same device, same dtype, same weights.
    """
    if not accelerate_available():
        return False

    try:
        from accelerate import dispatch_model, infer_auto_device_map
    except ImportError:
        return False

    # Determine if we need memory-aware offload
    use_offload = should_use_accelerate(vram_required_mb)

    if not use_offload:
        # Sufficient VRAM — just move to the target device (same as .to(device))
        try:
            model.to(device)
            logger.info("Accelerate: model placed on %s (no offload needed)", device)
            return True
        except Exception as exc:
            logger.warning("Accelerate device placement failed: %s — caller should fall back", exc)
            return False

    # VRAM constrained — use dispatch_model with auto device_map
    max_memory = get_max_memory_per_device()
    if max_memory is None:
        # No GPU info — can't compute device map, fall back
        return False

    try:
        device_map = infer_auto_device_map(
            model,
            max_memory=max_memory,
            no_split_module_classes=no_split_module_classes or [],
            dtype=getattr(model, "dtype", None) or "auto",
        )
        logger.info("Accelerate: computed device_map with %d entries for offload", len(device_map))

        model = dispatch_model(
            model,
            device_map=device_map,
            offload_folder=str(offload_folder) if offload_folder else None,
            offload_index=getattr(model, "_offload_index", None),
            no_split_module_classes=no_split_module_classes or [],
        )
        logger.info("Accelerate: model dispatched across devices — offload active")
        return True
    except Exception as exc:
        logger.warning("Accelerate dispatch_model failed: %s — caller should fall back", exc)
        return False


def cleanup_accelerate_model(model: Any) -> None:
    """Release Accelerate-managed resources on a model.

    Removes device hooks, moves to CPU, and clears CUDA cache.
    Called from provider ``unload()`` methods.
    """
    if model is None:
        return
    try:
        if not accelerate_available():
            from runtime.gpu import empty_cuda_cache
            empty_cuda_cache()
            return

        # Remove any AlignDevicesHook / offload hooks attached by Accelerate
        from accelerate.hooks import remove_hook_from_submodules
        try:
            remove_hook_from_submodules(model)
        except Exception:
            pass

        # Move model to CPU to release GPU memory
        try:
            model.cpu()
        except Exception:
            pass
        from runtime.gpu import empty_cuda_cache
        empty_cuda_cache()
        logger.info("Accelerate: model cleaned up, CUDA cache cleared")
    except Exception as exc:
        logger.warning("cleanup_accelerate_model warning: %s", exc)


def dispatch_pipeline_models(
    models: dict[str, Any],
    device: str,
    vram_required_mb: int = 0,
    offload_folder: Path | str | None = None,
    offload_sequence: list[str] | None = None,
) -> bool:
    """Dispatch multiple named sub-models (e.g. a pipeline's model dict).

    Used by TRELLIS and Hunyuan3D-2.1 pipelines which hold multiple sub-models
    in a ``models`` dict. Dispatches each sub-model individually with
    Accelerate, optionally chaining CPU offload via ``offload_sequence``.

    Args:
        models: dict of {name: nn.Module} like ``pipeline.models``
        device: target execution device (e.g. "cuda:0")
        vram_required_mb: VRAM budget for the decision
        offload_folder: where to put CPU-offloaded weights
        offload_sequence: optional ordered list of model names for sequential offload

    Returns True if Accelerate dispatch was applied to at least one model.
    """
    if not accelerate_available() or not models:
        return False

    any_dispatched = False
    for name, sub_model in models.items():
        if sub_model is None:
            continue
        try:
            dispatched = dispatch_model_to_device(
                sub_model,
                device=device,
                vram_required_mb=vram_required_mb,
                offload_folder=offload_folder,
            )
            if dispatched:
                any_dispatched = True
                logger.info("Accelerate: sub-model '%s' dispatched", name)
            else:
                # Fall back to native .to(device) for this sub-model
                sub_model.to(device)
        except Exception as exc:
            logger.warning("Accelerate dispatch failed for '%s': %s — using .to(device)", name, exc)
            try:
                sub_model.to(device)
            except Exception:
                pass
    return any_dispatched


def enable_cpu_offload(
    pipeline: Any,
    execution_device: str,
    offload_folder: Path | str | None = None,
) -> bool:
    """Enable Accelerate CPU offload on a pipeline that supports it.

    Tries the pipeline's own ``enable_model_cpu_offload`` method first
    (Hunyuan3D pipelines have this), then falls back to ``attach_execution_device_hook``
    from Accelerate.

    Returns True if offload was configured, False otherwise.
    """
    if not accelerate_available():
        return False
    try:
        if hasattr(pipeline, "enable_model_cpu_offload"):
            pipeline.enable_model_cpu_offload(
                gpu_id=0 if "cuda" in execution_device else -1,
                offload_folder=str(offload_folder) if offload_folder else None,
            )
            logger.info("Accelerate: CPU offload enabled via pipeline method")
            return True
    except Exception as exc:
        logger.warning("Pipeline enable_model_cpu_offload failed: %s", exc)

    try:
        from accelerate import init_empty_weights  # noqa: F401
        from accelerate.hooks import attach_execution_device_hook
        attach_execution_device_hook(
            pipeline,
            execution_device=execution_device,
            offload=True,
        )
        logger.info("Accelerate: CPU offload enabled via attach_execution_device_hook")
        return True
    except Exception as exc:
        logger.warning("Accelerate attach_execution_device_hook failed: %s", exc)
        return False


def safe_unload(*model_attrs: Any, provider_name: str | None = None) -> None:
    """Centralized unload for all providers — Accelerate hooks + CUDA cache.

    Call from every provider ``unload()`` method. Replaces the per-provider
    pattern of ``cleanup_accelerate_model(); torch.cuda.empty_cache()`` with a
    single call that removes Accelerate device hooks, moves to CPU, and clears
    the CUDA cache.

    Also releases VRAM reservations from vram_tracker if a provider_name is given.
    This is the single unload entry point for ALL providers (model-loading and
    simulated) — eliminates the duplicated ``import torch; empty_cache()`` block
    that appeared in 6 provider unload() methods.
    """
    for attr in model_attrs:
        if attr is None:
            continue
        cleanup_accelerate_model(attr)
    if provider_name:
        try:
            from app.core.managers.vram_tracker import vram_tracker
            vram_tracker.deallocate(provider_name, reason=f"{provider_name}_model_unload")
        except Exception:
            pass
    # Always clear CUDA cache as part of the unload lifecycle — covers the
    # all-None case where cleanup_accelerate_model is a no-op.
    try:
        from runtime.gpu import empty_cuda_cache
        empty_cuda_cache()
    except Exception:
        pass
