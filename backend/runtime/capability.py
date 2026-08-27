"""Centralized runtime capability system.

Single source of truth for:
  - Environment detection (colab / vps / local)
  - GPU/VRAM/CUDA detection
  - Model VRAM requirements (sourced from manifest via manifest_loader)
  - Colab preparation policy (15 GB VRAM threshold)

All callers — colab.sh, backend API, runtime engine, frontend — should
query this module instead of duplicating detection or hardcoding limits.
"""
from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Colab preparation policy
# ---------------------------------------------------------------------------

# ponytail: 15 GB is a Colab preparation policy, not a guarantee that models
# below this are always safe. Colab T4/P100 runtimes provide ~16 GB VRAM;
# subtracting overhead for PyTorch, CUDA context, and OS gives a safe prep
# ceiling of 15 GB. VPS/full-GPU hosts are NOT restricted by this value.
_COLAB_PREP_LIMIT_MB: int = 15_000

# ponytail: low-weight ceiling for auto-install on Colab. The VRAM gate alone
# is not enough — e.g. hunyuan3d-2 ships ~24 GB of weights, which overflows
# Colab's free-tier disk. Auto-prep therefore requires BOTH a low VRAM
# requirement AND a small weight download.
_COLAB_PREP_WEIGHT_LIMIT_GB: float = 10.0


# ---------------------------------------------------------------------------
# Environment helpers (delegate to platform_detection to avoid duplication)
# ---------------------------------------------------------------------------

def is_colab() -> bool:
    """Return True if the current runtime is Google Colab."""
    try:
        from runtime.platform_detection import _is_colab  # noqa: PLC0415
        return _is_colab()
    except Exception:
        return False


def get_platform_info() -> dict[str, Any]:
    """Return the full PlatformInfo dict from platform_detection."""
    try:
        from runtime.platform_detection import get_platform_info  # noqa: PLC0415
        info = get_platform_info()
        return {
            "os_name": info.os_name,
            "os_version": info.os_version,
            "python_version": info.python_version,
            "architecture": info.architecture,
            "is_codespaces": info.is_codespaces,
            "is_github_actions": info.is_github_actions,
            "is_wsl": info.is_wsl,
            "is_colab": info.is_colab,
            "is_macos": info.is_macos,
            "is_windows": info.is_windows,
            "is_linux": info.is_linux,
            "gpu_available": info.gpu_available,
            "gpu_count": info.gpu_count,
            "gpu_devices": info.gpu_devices,
            "cuda_version": info.cuda_version,
            "nvidia_driver": info.nvidia_driver,
            "nvidia_smi_available": info.nvidia_smi_available,
            "gpu_status_reason": info.gpu_status_reason,
        }
    except Exception:
        return {"is_colab": is_colab(), "gpu_available": False}


# ---------------------------------------------------------------------------
# GPU / VRAM helpers (delegate to gpu module)
# ---------------------------------------------------------------------------

def get_detected_vram_mb() -> int:
    """Return total VRAM of the first GPU in MB, or 0 if none detected."""
    try:
        from runtime.gpu import get_gpu_info  # noqa: PLC0415
        gpu = get_gpu_info()
        if gpu.available and gpu.devices:
            return gpu.devices[0].get("vram_mb", 0)
        return 0
    except Exception:
        return 0


def get_detected_gpu_name() -> str:
    """Return the name of the first GPU, or 'CPU' if none detected."""
    try:
        from runtime.gpu import get_gpu_info  # noqa: PLC0415
        gpu = get_gpu_info()
        if gpu.available and gpu.devices:
            return gpu.devices[0].get("name", "Unknown")
        return "CPU"
    except Exception:
        return "CPU"


def get_cuda_version() -> str | None:
    """Return the detected CUDA version, or None."""
    try:
        from runtime.gpu import get_gpu_info  # noqa: PLC0415
        gpu = get_gpu_info()
        return gpu.cuda_version
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Model VRAM requirements (single source of truth: manifest via manifest_loader)
# ---------------------------------------------------------------------------

def get_model_vram_required(provider_id: str) -> int:
    """Return the VRAM required by a model in MB.

    Reads from manifest via manifest_loader — the single source of truth.
    Returns 0 if the provider is unknown.
    """
    try:
        from runtime.manifest_loader import get_provider_metadata  # noqa: PLC0415
        meta = get_provider_metadata(provider_id)
        return int(meta.get("vram_required_mb", 0))
    except Exception:
        return 0


def get_model_weight_size_gb(provider_id: str) -> float:
    """Return the downloaded weight size of a model in GB.

    Reads from manifest via manifest_loader (the download source of truth).
    Returns 0.0 if unknown.
    """
    try:
        from runtime.manifest_loader import load_manifest  # noqa: PLC0415
        manifest = load_manifest(provider_id)
        weights = manifest.get("weights", {}) or {}
        return float(weights.get("size_estimate_gb", 0) or 0)
    except Exception:
        return 0.0


def get_model_metadata(provider_id: str) -> dict[str, Any]:
    """Return the full metadata dict for a provider from manifest via manifest_loader."""
    try:
        from runtime.manifest_loader import get_provider_metadata  # noqa: PLC0415
        return get_provider_metadata(provider_id)
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Low VRAM mode + Auto VRAM planner
# ---------------------------------------------------------------------------

def get_vram_safety_margin_mb() -> int:
    """Safety headroom reserved below total VRAM before declaring a model
    un-runnable. Configurable via ``vram_safety_margin_mb`` setting; defaults
    to 2 GB. Applied by the Auto VRAM planner and engine gating."""
    try:
        from app.config import get_settings  # noqa: PLC0415
        return int(get_settings().vram_safety_margin_mb or 2048)
    except Exception:
        return 2048


def supports_low_vram(provider_id: str) -> bool:
    """True if the provider has a VERIFIED low-VRAM execution path.

    Never fake: a provider only reports low-VRAM support when the code in this
    repo (engine + provider + accelerate loader) implements and validates it.
    """
    meta = get_model_metadata(provider_id)
    return bool(meta.get("low_vram_supported", False))


def get_low_vram_required(provider_id: str) -> int:
    """VRAM (MB) required to run the provider in low-VRAM mode, 0 if unsupported."""
    return int(get_model_metadata(provider_id).get("low_vram_required_mb", 0))


def get_low_vram_strategy(provider_id: str) -> list[str]:
    """Ordered low-VRAM strategy hints from metadata (strongest first)."""
    return list(get_model_metadata(provider_id).get("low_vram_strategy", []))


def resolve_vram_mode(provider_id: str, requested_mode: str = "auto") -> str:
    """Resolve an explicit/auto low-VRAM mode to a concrete load mode.

    Valid returns: ``"normal"``, ``"low"``, or ``"unavailable"`` (the provider
    does not support low-VRAM execution). ``"auto"`` selects low-VRAM only when
    the detected free VRAM cannot fit the normal requirement; otherwise normal.
    """
    requested_mode = requested_mode or "auto"
    if requested_mode not in ("auto", "normal", "low"):
        requested_mode = "auto"
    if requested_mode == "low":
        return "low" if supports_low_vram(provider_id) else "unavailable"
    if requested_mode == "normal":
        return "normal"
    # auto: run low-VRAM only when the normal footprint does not fit free VRAM
    required = get_model_vram_required(provider_id)
    if not supports_low_vram(provider_id) or required == 0:
        return "normal"
    free_mb = get_detected_free_vram_mb()
    if free_mb == 0:
        return "normal"  # CPU-only host — no VRAM constraint to apply
    return "low" if free_mb < required else "normal"


def get_detected_free_vram_mb() -> int:
    """Free VRAM (MB) of the first GPU, or 0 when no GPU is detected."""
    try:
        from runtime.gpu import get_gpu_info  # noqa: PLC0415
        gpu = get_gpu_info()
        if gpu.available:
            return int(gpu.free_vram_mb or 0)
    except Exception:
        pass
    return 0


def plan_vram_usage(provider_id: str, mode: str = "auto") -> dict[str, Any]:
    """Auto VRAM planner: pick the mode that fits the current GPU.

    Returns a dict describing the mode selected, its VRAM footprint, whether
    it fits, and the shortfall (MB). ``mode`` may be ``auto``/``normal``/``low``.
    The planner always reserves ``get_vram_safety_margin_mb()`` headroom below
    total VRAM so the model does not OOM the CUDA context.

    ponytail: single call site for "which mode + does it fit" so the engine,
    the generation API, and the frontend all agree on one answer.
    """
    meta = get_model_metadata(provider_id)
    normal_mb = get_model_vram_required(provider_id)
    low_mb = get_low_vram_required(provider_id)
    low_supported = supports_low_vram(provider_id)

    resolved = resolve_vram_mode(provider_id, mode)
    if resolved == "unavailable":
        return {
            "mode": "unavailable",
            "normal_vram_mb": normal_mb,
            "low_vram_mb": 0,
            "low_vram_supported": False,
            "reason": f"{provider_id} does not support verified low-VRAM execution.",
        }

    chosen_mb = low_mb if resolved == "low" else normal_mb
    free_mb = get_detected_free_vram_mb()
    safety = get_vram_safety_margin_mb()

    if free_mb == 0:
        # No GPU — no VRAM gating (CPU-only path already handled upstream).
        fits, shortfall = True, 0
    else:
        fits = (chosen_mb + safety) <= free_mb
        shortfall = max(0, (chosen_mb + safety) - free_mb)

    strategy = get_low_vram_strategy(provider_id) if resolved == "low" else []
    return {
        "provider": provider_id,
        "label": meta.get("label", provider_id),
        "mode": resolved,
        "normal_vram_mb": normal_mb,
        "low_vram_mb": low_mb,
        "low_vram_supported": low_supported,
        "strategy": strategy,
        "vram_required_mb": chosen_mb,
        "safety_margin_mb": safety,
        "free_vram_mb": free_mb,
        "fits": bool(fits),
        "shortfall_mb": shortfall,
        "cpu_only": free_mb == 0,
    }


# ---------------------------------------------------------------------------
# Colab preparation policy
# ---------------------------------------------------------------------------

def get_colab_prep_limit_mb() -> int:
    """Return the maximum VRAM (MB) a model may require to be prepared
    automatically in Colab. Models at or above this limit are skipped."""
    return _COLAB_PREP_LIMIT_MB


def _colab_prep_forced() -> bool:
    """True when the dedicated Colab bootstrap (scripts/colab.sh) has opted in.

    ponytail: is_colab() self-detection can misfire on unusual Colab runtimes;
    colab.sh exports COLAB_PREP_GATE=1 so the preparation policy is applied
    deterministically rather than depending on environment detection.
    """
    return os.environ.get("COLAB_PREP_GATE") == "1"


def is_model_preparable_for_colab(provider_id: str) -> bool:
    """Return True if the model can be cloned/installed in Colab.

    A model is preparable if:
    - We are NOT in Colab and no Colab gate is forced (VPS/local hosts have no
      restriction), OR
    - Its required VRAM is strictly less than the Colab preparation limit (15 GB)
      AND its downloaded weight size is at or below the low-weight ceiling (10 GB).
    """
    if not (is_colab() or _colab_prep_forced()):
        return True
    vram = get_model_vram_required(provider_id)
    if vram == 0:
        return True
    if vram >= _COLAB_PREP_LIMIT_MB:
        return False
    weight = get_model_weight_size_gb(provider_id)
    if weight == 0:
        return True
    return weight <= _COLAB_PREP_WEIGHT_LIMIT_GB


def get_colab_incompatibility_reason(provider_id: str) -> str | None:
    """Return a human-readable reason why a model is incompatible with
    Colab preparation, or None if it is compatible."""
    if not (is_colab() or _colab_prep_forced()):
        return None
    vram = get_model_vram_required(provider_id)
    if vram == 0 and get_model_weight_size_gb(provider_id) == 0:
        return None
    if vram >= _COLAB_PREP_LIMIT_MB:
        return (
            f"Required VRAM: {vram / 1024:.1f} GB\n"
            f"Colab preparation limit: <{_COLAB_PREP_LIMIT_MB / 1024:.0f} GB\n"
            f"Reason: exceeds Colab runtime VRAM policy"
        )
    weight = get_model_weight_size_gb(provider_id)
    if weight > _COLAB_PREP_WEIGHT_LIMIT_GB:
        return (
            f"Weight size: {weight:.1f} GB\n"
            f"Colab low-weight ceiling: ≤{_COLAB_PREP_WEIGHT_LIMIT_GB:.0f} GB\n"
            f"Reason: exceeds Colab disk/weight policy — repo & venv not prepared"
        )
    return None


# ---------------------------------------------------------------------------
# Aggregated capability snapshot
# ---------------------------------------------------------------------------

def get_runtime_capabilities() -> dict[str, Any]:
    """Return a dict describing the current runtime capabilities.

    This is the single call sites should use when they need the full
    environment + model capability picture.
    """
    platform = get_platform_info()
    colab = platform.get("is_colab", False)
    vram_mb = get_detected_vram_mb()
    gpu_name = get_detected_gpu_name()
    cuda = get_cuda_version()

    providers: dict[str, dict[str, Any]] = {}
    try:
        from runtime.manifest_loader import get_all_provider_metadata  # noqa: PLC0415
        provider_meta = get_all_provider_metadata()
        for pid, meta in provider_meta.items():
            vram_req = int(meta.get("vram_required_mb", 0))
            weight_req = get_model_weight_size_gb(pid)
            colab_incompat = get_colab_incompatibility_reason(pid)
            providers[pid] = {
                "label": meta.get("label", pid),
                "vram_required_mb": vram_req,
                "weight_size_gb": weight_req,
                "low_vram_supported": bool(meta.get("low_vram_supported", False)),
                "low_vram_required_mb": int(meta.get("low_vram_required_mb", 0)),
                "low_vram_strategy": list(meta.get("low_vram_strategy", [])),
                "native_build_required": bool(meta.get("native_build_required", False)),
                "category": meta.get("category"),
                "colab_preparable": colab_incompat is None,
                "colab_incompatibility_reason": colab_incompat,
            }
    except Exception:
        pass

    return {
        "environment": "colab" if colab else "vps" if platform.get("is_linux") else "local",
        "is_colab": colab,
        "gpu_available": platform.get("gpu_available", False),
        "gpu_name": gpu_name,
        "total_vram_mb": vram_mb,
        "cuda_version": cuda,
        "colab_preparation_limit_mb": _COLAB_PREP_LIMIT_MB if colab else None,
        "vram_safety_margin_mb": get_vram_safety_margin_mb(),
        "providers": providers,
    }
