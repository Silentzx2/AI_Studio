"""RuntimeEngine — singleton coordinator for local AI pipeline.

FIXES APPLIED (Issue #9):
- Check allow_mock_provider setting before including mock in available providers
- Log warning when mock is disabled
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from runtime.capability import get_model_vram_required
from runtime.gpu import get_device, get_gpu_info, select_device
from runtime.storage import get_storage_config

from app.core.providers.registry import _RUNTIME_PROVIDER_MAP as _PROVIDER_MAP

logger = logging.getLogger(__name__)

PROVIDER_PRIORITY = ["hunyuan3d-2.1", "trellis", "hunyuan3d-2-mini", "triposg", "detailgen3d", "mock"]

# ponytail: mode support matrix. Used by get_best_provider_name to avoid
# silently falling back to a provider that can't handle the requested mode
# (e.g. TRELLIS for text-to-3d). hunyuan3d-2-mini is image-to-shape only.
PROVIDER_MODES: dict[str, set[str]] = {
    "hunyuan3d": {"text-to-3d", "image-to-3d"},
    "hunyuan3d-1.0": {"text-to-3d", "image-to-3d"},
    "hunyuan3d-2.1": {"text-to-3d", "image-to-3d", "texture-generation"},
    "hunyuan3d-2-mini": {"image-to-3d", "texture-generation"},
    "trellis": {"image-to-3d", "texture-generation"},
    "triposg": {"image-to-3d"},
    "detailgen3d": {"remesh", "post-processing"},
    "mock": {"text-to-3d", "image-to-3d", "remesh", "texture-generation", "rigging"},
}


class _GPUScheduler:
    """Minimal GPU slot tracker — prevents two providers loading simultaneously."""

    def __init__(self) -> None:
        self.current_model: str | None = None

    def acquire(self, name: str) -> None:
        self.current_model = name

    def release(self, name: str) -> None:
        if self.current_model == name:
            self.current_model = None


class RuntimeEngine:
    def __init__(self) -> None:
        self.gpu = _GPUScheduler()
        self._loaded: dict[str, Any] = {}
        self._loaded_modes: dict[str, str] = {}
        self._lock = asyncio.Lock()
        self._initialized = False
        self._storage = get_storage_config()

    async def initialize(self) -> None:
        if self._initialized:
            return
        logger.info("=" * 50)
        logger.info("RuntimeEngine initializing...")
        logger.info("  Third-party dir: %s", self._storage.third_party_dir)
        # ponytail: weights live per-model under third_party/<repo>/weights.
        # The old central weights_dir is empty post-migration; logging it is
        # misleading ("wrong weight folder"). Log the resolved per-model dirs.
        available = self._discover_providers()
        try:
            from runtime.manifest_loader import get_all_provider_metadata  # noqa: PLC0415
            resolved = {
                name: str(self._storage.get_weight_path(meta.get("weight_key")))
                for name, meta in get_all_provider_metadata().items()
                if name in available and meta.get("weight_key")
            }
        except Exception:
            resolved = {}
        logger.info("  Per-model weight dirs: %s", resolved or "(none)")
        gpu = get_gpu_info()
        if gpu.available:
            logger.info("  CUDA %s — %d GPU(s)", gpu.cuda_version, gpu.device_count)
            for dev in gpu.devices:
                logger.info(
                    "    GPU %d: %s (%dGB)",
                    dev["index"], dev["name"], dev["vram_mb"] // 1024,
                )
        else:
            logger.warning("  No GPU: %s", gpu.reason)
            logger.warning(
                "  CUDA_VISIBLE_DEVICES=%s",
                os.environ.get("CUDA_VISIBLE_DEVICES", "<not set>"),
            )
        available = self._discover_providers()
        logger.info("  Available providers: %s", available)
        self._initialized = True
        logger.info("RuntimeEngine initialized")
        logger.info("=" * 50)

    def _discover_providers(self) -> list[str]:
        """Discover available providers, respecting allow_mock_provider setting."""
        providers = []
        for name in PROVIDER_PRIORITY:
            if name == "mock":
                # Issue #9 Fix: Check setting before including mock
                from app.config import get_settings
                settings = get_settings()
                if not settings.allow_mock_provider:
                    logger.debug("Mock provider disabled by allow_mock_provider=False")
                    continue
                providers.append(name)
            elif self._check_provider_available(name):
                providers.append(name)
        return providers

    def _check_provider_available(self, provider_name: str) -> bool:
        from runtime.manifest_loader import get_all_provider_metadata  # noqa: PLC0415
        meta = get_all_provider_metadata().get(provider_name)
        if not meta:
            return False
        repo_name = meta.get("repo")
        weight_key = meta.get("weight_key")
        repo_ready = (
            self._storage.get_repo_path(repo_name).exists() if repo_name else True
        )
        weights_ready = (
            self._storage.get_weight_path(weight_key) is not None if weight_key else True
        )
        return repo_ready and weights_ready

    async def get_best_provider_name(self, requested: str, mode: str = "text-to-3d") -> str:
        gpu = get_gpu_info()

        # CPU-only machine: there is no VRAM to gate on — models run on system
        # RAM/CPU. The free_mb==0 branch below would otherwise reject every real
        # provider ("only 0 MB free") and generation could never start.
        # ponytail: VRAM gating is GPU-only; pick by availability (weights on disk).
        if not gpu.available:
            if requested == "mock" or (self._check_provider_available(requested) and mode in PROVIDER_MODES.get(requested, set())):
                return requested
            for candidate in PROVIDER_PRIORITY:
                if candidate == "mock":
                    if not self._is_mock_allowed():
                        continue
                elif not self._check_provider_available(candidate):
                    continue
                if mode not in PROVIDER_MODES.get(candidate, set()):
                    continue
                logger.info(
                    "CPU mode: requested provider '%s' not installed, falling back to '%s'",
                    requested, candidate,
                )
                return candidate
            raise RuntimeError(
                f"No provider is installed on this machine. Requested '{requested}' "
                f"is not installed and no installed fallback exists."
            )

        free_mb = gpu.free_vram_mb
        # Use plan_vram_usage with mode="auto" so low-VRAM mode is considered
        # when normal footprint doesn't fit (e.g. a 24GB-recommended model on a
        # 14GB GPU runs in low-VRAM mode instead of failing).
        try:
            from runtime.capability import plan_vram_usage
            plan = plan_vram_usage(requested, "auto")
            needed = plan.get("vram_required_mb") or 0
            resolved_mode = plan.get("mode", "normal")
            fits = bool(plan.get("fits", False)) or plan.get("cpu_only", False)
        except Exception:
            # Fallback to simple check
            needed = get_model_vram_required(requested)
            fits = needed == 0 or free_mb >= needed
            resolved_mode = "normal"
        requested_available = requested == "mock" and self._is_mock_allowed() or self._check_provider_available(requested)
        if fits and requested_available:
            if mode in PROVIDER_MODES.get(requested, set()):
                return requested
        elif fits and not requested_available:
            logger.warning("Requested provider '%s' is not installed/available", requested)
            logger.warning(
                "Provider '%s' fits VRAM but does not support mode '%s'",
                requested, mode,
            )
        logger.warning(
            "Provider '%s' needs %d MB VRAM, only %d MB free",
            requested, needed, free_mb,
        )
        for candidate in PROVIDER_PRIORITY:
            if candidate == "mock":
                from app.config import get_settings
                if not get_settings().allow_mock_provider:
                    continue
            if not self._check_provider_available(candidate):
                continue
            if mode not in PROVIDER_MODES.get(candidate, set()):
                continue
            # ponytail: Auto VRAM — accept a candidate that fits either its
            # normal footprint OR its verified low-VRAM footprint. Previously
            # only the normal requirement was consulted, so a 12 GB model
            # on an 8 GB GPU was rejected even though low mode fits.
            try:
                from runtime.capability import plan_vram_usage
                plan = plan_vram_usage(candidate, "auto")
                fits = bool(plan.get("fits", False)) or plan.get("cpu_only", False)
            except Exception:
                fits = False
            if not fits:
                req = get_model_vram_required(candidate)
                fits = req == 0 or free_mb >= req
            if fits:
                logger.warning("Fallback to '%s' (mode=%s)", candidate, mode)
                return candidate
        # BUG-10 FIX: was returning `requested` here even though we just determined it exceeds
        # available VRAM — that caused an OOM crash deep inside model loading instead of a
        # clean, user-visible error. Raise explicitly so the job is marked failed immediately.
        raise RuntimeError(
            f"Insufficient VRAM to run any available provider for mode '{mode}'. "
            f"Free: {free_mb} MB. "
            f"Requested '{requested}' requires {needed} MB. "
            f"Reduce resolution, free VRAM, or enable the mock provider."
        )

    async def load_provider(self, name: str, vram_mode: str = "auto", low_vram: bool = False) -> Any:
        async with self._lock:
            requested = "low" if low_vram else vram_mode
            # The scheduler is a single-GPU slot tracker. Keep exactly one
            # provider loaded at a time, and reload when an explicit low/normal
            # mode differs from the currently loaded instance.
            if name in self._loaded:
                loaded_mode = self._loaded_modes.get(name, "normal")
                if requested in ("auto", loaded_mode):
                    return self._loaded[name]
                provider = self._loaded.pop(name)
                self._loaded_modes.pop(name, None)
                try:
                    if hasattr(provider, "unload"):
                        loop = asyncio.get_running_loop()
                        await loop.run_in_executor(None, provider.unload)
                except Exception as exc:
                    logger.warning("Error reloading '%s' for vram mode change: %s", name, exc)
                self.gpu.release(name)
            for loaded_name in list(self._loaded.keys()):
                provider = self._loaded.pop(loaded_name)
                self._loaded_modes.pop(loaded_name, None)
                try:
                    if hasattr(provider, "unload"):
                        loop = asyncio.get_running_loop()
                        await loop.run_in_executor(None, provider.unload)
                except Exception as exc:
                    logger.warning("Error unloading previous provider '%s': %s", loaded_name, exc)
                self.gpu.release(loaded_name)
            # ponytail: Auto VRAM planner — resolve normal vs low mode and the
            # VRAM footprint to gate device selection on the mode actually used.
            requested = "low" if low_vram else vram_mode
            try:
                from runtime.capability import plan_vram_usage
                plan = plan_vram_usage(name, requested)
                resolved_mode = plan.get("mode")
                vram_needed = plan.get("vram_required_mb") or 0
                if resolved_mode == "unavailable":
                    raise RuntimeError(plan.get("reason", f"Requested VRAM mode '{requested}' is unavailable for {name}"))
            except RuntimeError:
                raise
            except Exception:
                vram_needed = get_model_vram_required(name)
                resolved_mode = "normal"
            # Use VRAM-aware device selection
            try:
                device = select_device("auto", max_vram_mb=vram_needed)
            except Exception:
                device = get_device()
            self.gpu.acquire(name)
            logger.info("Loading provider '%s' on %s (vram_mode=%s)...", name, device, resolved_mode)
            try:
                loop = asyncio.get_running_loop()
                provider = await asyncio.wait_for(
                    loop.run_in_executor(
                        None,
                        lambda: _instantiate_provider(name, device, low_vram=(resolved_mode == "low")),
                    ),
                    timeout=300.0,
                )
                # Safe: assignment happens inside `async with self._lock` after
                # the executor future resolves, so no concurrent mutation is possible.
                self._loaded[name] = provider
                self._loaded_modes[name] = resolved_mode
                logger.info("Provider '%s' loaded (vram_mode=%s)", name, resolved_mode)
                return provider
            except Exception as exc:
                logger.error("Failed to load provider '%s': %s", name, exc)
                self.gpu.release(name)
                raise

    async def unload_provider(self, name: str) -> None:
        async with self._lock:
            if name not in self._loaded:
                return
            provider = self._loaded.pop(name)
            self._loaded_modes.pop(name, None)
            if hasattr(provider, "unload"):
                try:
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, provider.unload)
                except Exception as exc:
                    logger.warning("Error unloading '%s': %s", name, exc)
            self.gpu.release(name)
            # Explicit CUDA cleanup to prevent memory leaks between models
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    import gc
                    gc.collect()
            except Exception:
                pass
            logger.info("Provider '%s' unloaded", name)

    def health(self) -> dict:
        gpu = get_gpu_info()
        provider_status = {
            name: {
                "available": name == "mock" or self._check_provider_available(name),
                "loaded": name in self._loaded,
            }
            for name in PROVIDER_PRIORITY
            # Issue #9: Only include mock if allowed
            if name != "mock" or self._is_mock_allowed()
        }
        return {
            "initialized": self._initialized,
            "gpu": {
                "available": gpu.available,
                "device_count": gpu.device_count,
                "free_vram_mb": gpu.free_vram_mb,
                "total_vram_mb": gpu.total_vram_mb,
                "cuda_version": gpu.cuda_version,
                "driver_version": gpu.driver_version,
                "devices": gpu.devices,
            },
            "loaded_providers": list(self._loaded.keys()),
            "scheduler_current": self.gpu.current_model,
            "provider_status": provider_status,
        }

    def _is_mock_allowed(self) -> bool:
        """Check if mock provider is allowed by settings."""
        try:
            from app.config import get_settings
            return get_settings().allow_mock_provider
        except Exception:
            return False


def _instantiate_provider(name: str, device: str, low_vram: bool = False) -> Any:
    import importlib
    entry = _PROVIDER_MAP.get(name)
    if not entry:
        raise ValueError(f"Unknown provider: {name}")
    module_path, class_name = entry
    mod = importlib.import_module(module_path)
    cls = getattr(mod, class_name)
    if name == "mock":
        return cls()
    try:
        return cls(device=device, low_vram=low_vram)
    except TypeError:
        # Older providers may not accept the low_vram kwarg yet — keep loading.
        return cls(device=device)


_engine: RuntimeEngine | None = None


def get_engine() -> RuntimeEngine:
    global _engine
    if _engine is None:
        _engine = RuntimeEngine()
    return _engine


def require_engine() -> RuntimeEngine:
    engine = get_engine()
    if not engine._initialized:
        raise RuntimeError(
            "RuntimeEngine not initialized. "
            "Call `await engine.initialize()` during application startup."
        )
    return engine
