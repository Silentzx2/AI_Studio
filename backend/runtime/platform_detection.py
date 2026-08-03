"""
Platform Detection Module - Automatic Environment Detection

Detects the execution environment and provides:
- Platform identification (Codespaces, Actions, WSL, Docker, etc.)
- GPU/CUDA availability with detailed reason logging
- Graceful CPU fallback with clear messaging
- Comprehensive startup diagnostics

This module is imported early and logs all detection results.
"""
from __future__ import annotations

import logging
import os
import platform
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Normalize CUDA_VISIBLE_DEVICES at module import time.
# docker-compose sets this to 'all' for the NVIDIA Container Toolkit; the
# CUDA runtime does not understand 'all' and makes torch.cuda return False.
# ---------------------------------------------------------------------------
_cv = os.environ.get("CUDA_VISIBLE_DEVICES", "")
if _cv.strip().lower() == "all":
    os.environ.pop("CUDA_VISIBLE_DEVICES", None)


@dataclass
class PlatformInfo:
    """Comprehensive platform information."""
    # Basic platform
    os_name: str = ""
    os_version: str = ""
    python_version: str = ""
    architecture: str = ""

    # Environment detection
    is_docker: bool = False
    is_codespaces: bool = False
    is_github_actions: bool = False
    is_wsl: bool = False
    is_docker_desktop: bool = False
    is_macos: bool = False
    is_windows: bool = False
    is_linux: bool = False

    # GPU status
    gpu_available: bool = False
    gpu_count: int = 0
    gpu_devices: list = field(default_factory=list)
    cuda_version: str | None = None
    nvidia_driver: str | None = None
    nvidia_smi_available: bool = False
    nvidia_runtime_available: bool = False

    # Reason for GPU status
    gpu_status_reason: str = ""

    # Recommended compose command
    recommended_command: str = "docker compose up -d"

    # Detailed diagnostics
    diagnostics: dict = field(default_factory=dict)


def detect_platform() -> PlatformInfo:
    """Detect the current platform and environment."""
    info = PlatformInfo(
        os_name=platform.system(),
        os_version=platform.release(),
        python_version=sys.version.split()[0],
        architecture=platform.machine(),
    )

    # Detect environment type
    info.is_docker = _is_docker()
    info.is_codespaces = _is_codespaces()
    info.is_github_actions = _is_github_actions()
    info.is_wsl = _is_wsl()
    info.is_docker_desktop = _is_docker_desktop()
    info.is_macos = info.os_name == "Darwin"
    info.is_windows = info.os_name == "Windows"
    info.is_linux = info.os_name == "Linux"

    # Detect GPU
    _detect_gpu(info)

    # Determine recommended command
    _set_recommended_command(info)

    # Collect diagnostics
    _collect_diagnostics(info)

    return info


def _is_docker() -> bool:
    """Check if running inside a Docker container."""
    if Path("/.dockerenv").exists():
        return True
    try:
        cgroup = Path("/proc/1/cgroup").read_text()
        if "docker" in cgroup or "containerd" in cgroup:
            return True
    except Exception:
        pass
    return False


def _is_codespaces() -> bool:
    """Check if running in GitHub Codespaces."""
    if (os.environ.get("CODESPACES") or os.environ.get("CODESPACES_ENV")
            or os.environ.get("GITHUB_CODESPACE_NAME")):
        return True
    if Path("/vscode").exists() or Path("/home/codespace").exists():
        return True
    if "codespaces" in os.environ.get("HOSTNAME", "").lower():
        return True
    if os.environ.get("CODESPACE_TOKEN"):
        return True
    return False


def _is_github_actions() -> bool:
    return os.environ.get("GITHUB_ACTIONS", "").lower() == "true"


def _is_wsl() -> bool:
    try:
        proc_version = Path("/proc/version").read_text()
        if "microsoft" in proc_version.lower() or "wsl" in proc_version.lower():
            return True
    except Exception:
        pass
    if os.environ.get("WSL_DISTRO_NAME"):
        return True
    if Path("/proc/sys/fs/binfmt_misc/WSLInterop").exists():
        return True
    return False


def _is_docker_desktop() -> bool:
    if "docker desktop" in os.environ.get("DOCKER_HOST", "").lower():
        return True
    for p in ("/Applications/Docker.app", "C:\\Program Files\\Docker\\Docker"):
        if Path(p).exists():
            return True
    return False


def _detect_gpu(info: PlatformInfo) -> None:
    """Detect GPU availability with detailed reasoning."""
    reasons = []

    # Ensure CUDA_VISIBLE_DEVICES is normalized (module-level handles import,
    # this catches runtime changes)
    cv = os.environ.get("CUDA_VISIBLE_DEVICES", "")
    if cv.strip().lower() == "all":
        os.environ.pop("CUDA_VISIBLE_DEVICES", None)

    info.nvidia_smi_available = _check_nvidia_smi()
    if not info.nvidia_smi_available:
        reasons.append("nvidia-smi not found")

    if info.is_docker or _has_docker():
        info.nvidia_runtime_available = _check_nvidia_runtime()
        if not info.nvidia_runtime_available:
            reasons.append("NVIDIA container runtime not available")

    gpu_detected = False
    try:
        import torch

        if hasattr(torch, 'cuda'):
            if torch.cuda.is_available():
                gpu_detected = True
                info.cuda_version = torch.version.cuda
                info.gpu_count = torch.cuda.device_count()

                for i in range(info.gpu_count):
                    try:
                        props = torch.cuda.get_device_properties(i)
                        free, total = torch.cuda.mem_get_info(i)
                        info.gpu_devices.append({
                            "index": i,
                            "name": props.name,
                            "vram_mb": total // (1024 * 1024),
                            "free_vram_mb": free // (1024 * 1024),
                            "compute_capability": f"{props.major}.{props.minor}",
                        })
                    except Exception as e:
                        logger.warning(f"Error getting GPU {i} info: {e}")

                info.gpu_available = True
                info.gpu_status_reason = (
                    f"CUDA {info.cuda_version} available with {info.gpu_count} GPU(s)"
                )
                info.nvidia_driver = _get_driver_version()
            else:
                reasons.append("torch.cuda.is_available() returned False")
                info.gpu_status_reason = "; ".join(reasons)
        else:
            reasons.append("PyTorch compiled without CUDA support")
            info.gpu_status_reason = "; ".join(reasons)

    except ImportError:
        reasons.append("PyTorch not installed")
        info.gpu_status_reason = "; ".join(reasons)
    except Exception as e:
        reasons.append(f"CUDA detection error: {e}")
        info.gpu_status_reason = "; ".join(reasons)

    if info.nvidia_smi_available and not gpu_detected and info.is_docker:
        info.gpu_status_reason = (
            "GPU visible via nvidia-smi but not accessible in container. "
            "Use: docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d"
        )
        info.gpu_available = False

    if not gpu_detected:
        info.gpu_available = False
        logger.info(f"GPU detection result: {info.gpu_status_reason}")


def _check_nvidia_smi() -> bool:
    try:
        result = subprocess.run(
            ["nvidia-smi"],
            capture_output=True, text=True, timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _check_nvidia_runtime() -> bool:
    try:
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True, text=True, timeout=10,
        )
        return "nvidia" in result.stdout.lower() or "Runtimes: nvidia" in result.stdout
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _get_driver_version() -> str | None:
    try:
        output = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
            stderr=subprocess.DEVNULL, text=True, timeout=5,
        )
        return output.strip().split("\n")[0] if output else None
    except Exception:
        return None


def _has_docker() -> bool:
    return shutil.which("docker") is not None


def _set_recommended_command(info: PlatformInfo) -> None:
    if info.is_codespaces or info.is_github_actions:
        info.recommended_command = "docker compose up -d  # Codespaces/Actions - CPU mode"
    elif info.is_wsl and not info.gpu_available:
        info.recommended_command = "docker compose up -d  # WSL without GPU detected"
    elif info.gpu_available and info.nvidia_runtime_available:
        info.recommended_command = (
            "docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d  # GPU mode"
        )
    elif info.gpu_available and not info.nvidia_runtime_available:
        info.recommended_command = "docker compose up -d  # GPU present but NVIDIA runtime unavailable"
    else:
        info.recommended_command = "docker compose up -d  # CPU-only mode"


def _collect_diagnostics(info: PlatformInfo) -> None:
    info.diagnostics = {
        "platform": {
            "os_name": info.os_name,
            "os_version": info.os_version,
            "python_version": info.python_version,
            "architecture": info.architecture,
        },
        "environment": {
            "is_docker": info.is_docker,
            "is_codespaces": info.is_codespaces,
            "is_github_actions": info.is_github_actions,
            "is_wsl": info.is_wsl,
            "is_docker_desktop": info.is_docker_desktop,
        },
        "gpu": {
            "available": info.gpu_available,
            "count": info.gpu_count,
            "devices": info.gpu_devices,
            "cuda_version": info.cuda_version,
            "nvidia_driver": info.nvidia_driver,
            "nvidia_smi_available": info.nvidia_smi_available,
            "nvidia_runtime_available": info.nvidia_runtime_available,
            "status_reason": info.gpu_status_reason,
        },
        "environment_vars": {
            "CUDA_VISIBLE_DEVICES": os.environ.get("CUDA_VISIBLE_DEVICES", "(not set)"),
            "CUDA_DEVICE": os.environ.get("CUDA_DEVICE", "(not set)"),
            "AI_PROVIDER": os.environ.get("AI_PROVIDER", "(not set)"),
            "PLATFORM_MODE": os.environ.get("PLATFORM_MODE", "(not set)"),
        },
        "recommended_command": info.recommended_command,
    }


def log_platform_info(info: PlatformInfo) -> None:
    """Log comprehensive platform information."""
    logger.info("=" * 60)
    logger.info("PLATFORM DETECTION")
    logger.info("=" * 60)
    logger.info(f"OS: {info.os_name} {info.os_version}")
    logger.info(f"Python: {info.python_version}")
    logger.info(f"Architecture: {info.architecture}")

    env_parts = []
    if info.is_docker: env_parts.append("Docker")
    if info.is_codespaces: env_parts.append("Codespaces")
    if info.is_github_actions: env_parts.append("GitHub Actions")
    if info.is_wsl: env_parts.append("WSL")
    if info.is_docker_desktop: env_parts.append("Docker Desktop")
    env_str = ", ".join(env_parts) if env_parts else "Native"
    logger.info(f"Environment: {env_str}")

    logger.info("")
    logger.info("GPU DETECTION")
    if info.gpu_available:
        logger.info("  Status: GPU AVAILABLE")
        logger.info(f"  CUDA Version: {info.cuda_version}")
        logger.info(f"  GPU Count: {info.gpu_count}")
        for dev in info.gpu_devices:
            logger.info(f"    GPU {dev['index']}: {dev['name']} ({dev['vram_mb']//1024}GB)")
        if info.nvidia_driver:
            logger.info(f"  Driver: {info.nvidia_driver}")
    else:
        logger.info("  Status: CPU-ONLY MODE")
        logger.info(f"  Reason: {info.gpu_status_reason}")

    logger.info("")
    logger.info("RECOMMENDED COMMAND")
    logger.info(f"  {info.recommended_command}")
    logger.info("=" * 60)


_platform_info: PlatformInfo | None = None


def get_platform_info() -> PlatformInfo:
    global _platform_info
    if _platform_info is None:
        _platform_info = detect_platform()
        log_platform_info(_platform_info)
    return _platform_info


def is_gpu_available() -> bool:
    return get_platform_info().gpu_available


def get_platform_summary() -> dict:
    info = get_platform_info()
    return {
        "os": info.os_name,
        "environment": "docker" if info.is_docker else "native",
        "gpu_available": info.gpu_available,
        "gpu_count": info.gpu_count,
        "cuda_version": info.cuda_version,
        "recommended_command": info.recommended_command,
    }
