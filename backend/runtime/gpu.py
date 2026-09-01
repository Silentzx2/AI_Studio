"""
GPU utilities: CUDA detection, VRAM monitoring, device selection.

GPU-ONLY MODE: Requires NVIDIA GPU with CUDA support.
The `reason` field on GPUInfo is populated when GPU is unavailable,
giving the frontend specific diagnostic text.
"""
from __future__ import annotations

import logging
import os
import subprocess
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# GPU info cache — avoids redundant torch imports + NVML queries
# ponytail: Simple TTL cache. Upgrade to shared cache if multi-process.
_gpu_cache_ts = 0.0
_gpu_cache_info: GPUInfo | None = None
_GPU_CACHE_TTL = 30.0  # seconds — GPU info changes infrequently


class GPURequiredError(Exception):
    """Raised when GPU is required but not available."""


@dataclass
class GPUInfo:
    available: bool
    device_count: int
    devices: list
    total_vram_mb: int
    free_vram_mb: int
    cuda_version: str | None
    driver_version: str | None
    reason: str | None = field(default=None)


def _normalize_cuda_env() -> None:
    """
    Normalize CUDA_VISIBLE_DEVICES before any torch/CUDA call.

    docker-compose (and docker-compose.gpu.yml) sets:
        CUDA_VISIBLE_DEVICES: all
    This value is recognized by the NVIDIA Container Toolkit at the
    Docker daemon level, but the CUDA runtime itself does NOT accept
    the literal string 'all' — it expects either:
      - empty string  → expose all available GPUs (default)
      - '0', '0,1'   → specific device indices
      - '-1'         → disable all GPUs
    When CUDA_VISIBLE_DEVICES='all' reaches PyTorch,
    torch.cuda.is_available() returns False even on a real GPU.
    Removing the variable restores the default (all GPUs visible).
    """
    val = os.environ.get("CUDA_VISIBLE_DEVICES", "")
    if val.strip().lower() == "all":
        os.environ.pop("CUDA_VISIBLE_DEVICES", None)
        logger.info(
            "CUDA_VISIBLE_DEVICES normalized: 'all' -> unset "
            "(CUDA runtime will enumerate all available GPUs)"
        )


# Normalize at module import time so every process that imports gpu.py
# benefits — this fires before any lazy torch import.
_normalize_cuda_env()


def get_gpu_info() -> GPUInfo:
    """Return current GPU / CUDA state (cached for 2s to reduce subprocess calls)."""
    global _gpu_cache_ts, _gpu_cache_info
    now = time.monotonic()
    if _gpu_cache_info is not None and (now - _gpu_cache_ts) < _GPU_CACHE_TTL:
        return _gpu_cache_info

    info = _query_gpu_info()
    _gpu_cache_info = info
    _gpu_cache_ts = now
    return info


def _query_gpu_info() -> GPUInfo:
    """Actual GPU query (uncached)."""
    # Re-normalize in case env was set after module load
    _normalize_cuda_env()
    cuda_visible = os.environ.get("CUDA_VISIBLE_DEVICES", "")
    try:
        import torch

        if not hasattr(torch, "cuda"):
            return _no_gpu("PyTorch compiled without CUDA support.")

        if not torch.cuda.is_available():
            return _no_gpu(_build_cuda_unavailable_reason(cuda_visible))

        devices = []
        total_vram = 0
        free_vram = 0
        # ponytail: NVML init is reference-counted; init once per call, shutdown once after.
        _nvml_initialized = False
        try:
            import pynvml
            pynvml.nvmlInit()
            _nvml_initialized = True
        except ImportError:
            pass
        except Exception:
            pass
        for i in range(torch.cuda.device_count()):
            try:
                props = torch.cuda.get_device_properties(i)
                free, total = torch.cuda.mem_get_info(i)
                vram_mb = total // (1024 * 1024)
                free_mb = free // (1024 * 1024)
                total_vram += vram_mb
                free_vram += free_mb
                utilization = 0
                temperature = 0
                if _nvml_initialized:
                    try:
                        handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                        util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                        utilization = util.gpu
                        temperature = pynvml.nvmlDeviceGetTemperature(
                            handle, pynvml.NVML_TEMPERATURE_GPU
                        )
                    except Exception:
                        pass
                devices.append(
                    {
                        "index": i,
                        "name": props.name,
                        "vram_mb": vram_mb,
                        "free_vram_mb": free_mb,
                        "compute_capability": f"{props.major}.{props.minor}",
                        "multi_processor_count": props.multi_processor_count,
                        "utilization": utilization,
                        "temperature": temperature,
                    }
                )
            except Exception as exc:
                logger.warning("Error reading GPU %d info: %s", i, exc)

        if _nvml_initialized:
            try:
                import pynvml
                pynvml.nvmlShutdown()
            except Exception:
                pass

        return GPUInfo(
            available=True,
            device_count=len(devices),
            devices=devices,
            total_vram_mb=total_vram,
            free_vram_mb=free_vram,
            cuda_version=getattr(torch.version, "cuda", None),
            driver_version=_get_driver_version(),
            reason=None,
        )

    except ImportError:
        return _no_gpu(
            "PyTorch is not installed. "
            "Run: uv pip install torch --index-url https://download.pytorch.org/whl/cu124"
        )
    except Exception as exc:
        logger.exception("GPU check failed")
        return _no_gpu(f"Unexpected error during GPU detection: {exc}")


def get_device(required_vram_mb: int = 0) -> str:
    """
    Return the best available torch device string (e.g. 'cuda:0').
    Falls back to 'cpu' when no GPU is present.
    """
    gpu = get_gpu_info()
    if not gpu.available:
        return "cpu"
    if not gpu.devices:
        return "cpu"
    # Pick device with most free VRAM
    best = max(gpu.devices, key=lambda d: d["free_vram_mb"])
    return f"cuda:{best['index']}"


def empty_cuda_cache() -> None:
    """Release unused CUDA memory back to the driver."""
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
            logger.debug("CUDA cache cleared")
    except Exception as exc:
        logger.warning("empty_cuda_cache failed: %s", exc)


def require_gpu() -> GPUInfo:
    """Return GPU info or raise GPURequiredError if unavailable."""
    info = get_gpu_info()
    if not info.available:
        raise GPURequiredError(info.reason or "No GPU available")
    return info


def select_device(cuda_device: str = "auto", max_vram_mb: int = 0) -> str:
    gpu_info = get_gpu_info()
    if not gpu_info.available:
        raise GPURequiredError(gpu_info.reason or "GPU not available")
    if cuda_device == "auto":
        best = max(gpu_info.devices, key=lambda d: d["free_vram_mb"])
        if max_vram_mb and best["vram_mb"] < max_vram_mb:
            raise GPURequiredError(
                f"GPU {best['name']} has {best['vram_mb']}MB VRAM, "
                f"but {max_vram_mb}MB required."
            )
        return f"cuda:{best['index']}"
    try:
        idx = int(cuda_device)
        if idx >= gpu_info.device_count:
            raise GPURequiredError(
                f"Device cuda:{idx} does not exist "
                f"(device_count={gpu_info.device_count})"
            )
        return f"cuda:{idx}"
    except ValueError:
        if cuda_device.startswith("cuda"):
            return cuda_device
        raise GPURequiredError(f"Invalid cuda_device value: {cuda_device!r}")


def check_vram_sufficient(
    required_mb: int, device: str = "cuda:0", safety_margin_mb: int = 2048
) -> tuple[bool, str]:
    try:
        import torch

        idx = int(device.split(":")[-1]) if ":" in device else 0
        free, total = torch.cuda.mem_get_info(idx)
        free_mb = free // (1024 * 1024)
        needed = required_mb + safety_margin_mb
        if free_mb >= needed:
            return True, f"{free_mb}MB free >= {needed}MB needed"
        return (
            False,
            f"Insufficient VRAM: {free_mb}MB free, need {needed}MB "
            f"({required_mb}MB + {safety_margin_mb}MB margin)",
        )
    except Exception as exc:
        return False, f"VRAM check failed: {exc}"


def get_vram_usage() -> dict:
    try:
        import torch

        if not torch.cuda.is_available():
            return {"available": False}
        usage = []
        for i in range(torch.cuda.device_count()):
            free, total = torch.cuda.mem_get_info(i)
            used = total - free
            usage.append(
                {
                    "index": i,
                    "total_mb": total // (1024 * 1024),
                    "used_mb": used // (1024 * 1024),
                    "free_mb": free // (1024 * 1024),
                    "percent": round(used / total * 100, 1) if total else 0,
                }
            )
        return {"available": True, "devices": usage}
    except Exception as exc:
        return {"available": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_cuda_unavailable_reason(cuda_visible: str) -> str:
    parts = ["torch.cuda.is_available() returned False."]
    if cuda_visible == "-1":
        parts.append("CUDA_VISIBLE_DEVICES=-1 explicitly disables GPU.")
    elif cuda_visible:
        parts.append(
            f"CUDA_VISIBLE_DEVICES={cuda_visible!r} \u2014 check device index."
        )
    parts.append("Ensure NVIDIA drivers and CUDA toolkit are installed.")
    parts.append(
        "Verify PyTorch CUDA: uv pip install torch --index-url https://download.pytorch.org/whl/cu124"
    )
    return " ".join(parts)


def _no_gpu(reason: str) -> GPUInfo:
    return GPUInfo(
        available=False,
        device_count=0,
        devices=[],
        total_vram_mb=0,
        free_vram_mb=0,
        cuda_version=None,
        driver_version=None,
        reason=reason,
    )


def _get_driver_version() -> str | None:
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
            stderr=subprocess.DEVNULL,
            timeout=5,
            text=True,
        )
        return out.strip().splitlines()[0]
    except Exception:
        return None
