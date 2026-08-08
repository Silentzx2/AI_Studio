"""Centralized runtime capability system.

Single source of truth for:
  - Environment detection (colab / vps / local)
  - GPU/VRAM/CUDA detection
  - Model VRAM requirements (sourced from PROVIDER_METADATA)
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
# Model VRAM requirements (single source of truth: PROVIDER_METADATA)
# ---------------------------------------------------------------------------

def get_model_vram_required(provider_id: str) -> int:
    """Return the VRAM required by a model in MB.

    Reads from PROVIDER_METADATA in runtime.installer — the single source
    of truth. Returns 0 if the provider is unknown.
    """
    try:
        from runtime.installer import PROVIDER_METADATA  # noqa: PLC0415
        meta = PROVIDER_METADATA.get(provider_id, {})
        return int(meta.get("vram_required_mb", 0))
    except Exception:
        return 0


def get_model_metadata(provider_id: str) -> dict[str, Any]:
    """Return the full metadata dict for a provider from PROVIDER_METADATA."""
    try:
        from runtime.installer import PROVIDER_METADATA  # noqa: PLC0415
        return PROVIDER_METADATA.get(provider_id, {})
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Colab preparation policy
# ---------------------------------------------------------------------------

def get_colab_prep_limit_mb() -> int:
    """Return the maximum VRAM (MB) a model may require to be prepared
    automatically in Colab. Models at or above this limit are skipped."""
    return _COLAB_PREP_LIMIT_MB


def is_model_preparable_for_colab(provider_id: str) -> bool:
    """Return True if the model can be cloned/installed in Colab.

    A model is preparable if:
    - We are NOT in Colab (VPS/local hosts have no restriction), OR
    - Its required VRAM is strictly less than the Colab preparation limit (15 GB).
    """
    if not is_colab():
        return True
    vram = get_model_vram_required(provider_id)
    if vram == 0:
        return True
    return vram < _COLAB_PREP_LIMIT_MB


def get_colab_incompatibility_reason(provider_id: str) -> str | None:
    """Return a human-readable reason why a model is incompatible with
    Colab preparation, or None if it is compatible."""
    if not is_colab():
        return None
    vram = get_model_vram_required(provider_id)
    if vram == 0:
        return None
    if vram >= _COLAB_PREP_LIMIT_MB:
        return (
            f"Required VRAM: {vram / 1024:.1f} GB\n"
            f"Colab preparation limit: <{_COLAB_PREP_LIMIT_MB / 1024:.0f} GB\n"
            f"Reason: exceeds Colab runtime policy"
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
        from runtime.installer import PROVIDER_METADATA  # noqa: PLC0415
        for pid, meta in PROVIDER_METADATA.items():
            vram_req = int(meta.get("vram_required_mb", 0))
            colab_incompat = None
            if colab and vram_req >= _COLAB_PREP_LIMIT_MB:
                colab_incompat = (
                    f"Required VRAM: {vram_req / 1024:.1f} GB — "
                    f"exceeds Colab preparation limit ({_COLAB_PREP_LIMIT_MB / 1024:.0f} GB)"
                )
            providers[pid] = {
                "label": meta.get("label", pid),
                "vram_required_mb": vram_req,
                "category": meta.get("category"),
                "colab_preparable": not colab_incompat,
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
        "providers": providers,
    }
