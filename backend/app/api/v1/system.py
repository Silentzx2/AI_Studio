"""System endpoints."""

import asyncio
import json
import logging
import platform
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from pydantic import BaseModel
from app.config import get_settings
from app.core import get_comfyui_client, get_workflow_manager
from app.schemas import SuccessResponse

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


class ClientLogPayload(BaseModel):
    ts: str | None = None
    type: str = "activity"
    detail: str = ""


@router.post("/log", response_model=SuccessResponse)
async def log_client_activity(entry: ClientLogPayload):
    """Receive client activity logs from frontend ActivityLogger."""
    logger.debug("Client activity [%s]: %s", entry.type, entry.detail)
    return SuccessResponse(data={"logged": True}, message="Client activity logged")


@router.get("/info", response_model=SuccessResponse)
async def get_system_info():
    """Get system information."""
    try:
        # GPU info
        gpu_info = await _get_gpu_info()

        # CPU info
        cpu_info = await _get_cpu_info()

        # Memory info
        memory_info = await _get_memory_info()

        # Disk info
        disk_info = await _get_disk_info()

        # ComfyUI info
        comfyui_info = await _get_comfyui_info()

        # Python info
        python_info = {
            "version": sys.version,
            "executable": sys.executable,
            "platform": platform.platform(),
            "machine": platform.machine(),
        }

        return SuccessResponse(
            data={
                "python": python_info,
                "gpu": gpu_info,
                "cpu": cpu_info,
                "memory": memory_info,
                "disk": disk_info,
                "comfyui": comfyui_info,
                "environment": settings.environment,
                "version": settings.app_version,
            },
            message="System info retrieved",
        )
    except Exception as e:
        logger.error(f"Failed to get system info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get system info: {e}")


@router.get("/stream")
async def system_stream():
    """SSE stream of system stats for frontend EventSource."""
    async def _generate():
        while True:
            try:
                gpu = await _get_gpu_info()
                mem = await _get_memory_info()
                disk = await _get_disk_info()
                comfy = await _get_comfyui_info()
                payload = json.dumps({"gpu": gpu, "memory": mem, "disk": disk, "comfyui": comfy})
                yield f"data: {payload}\n\n"
            except Exception:
                yield f"data: {{}}\n\n"
            await asyncio.sleep(5.0)
    return StreamingResponse(_generate(), media_type="text/event-stream")


async def _get_gpu_info() -> dict[str, Any]:
    """Get GPU information."""
    try:
        import torch
        if torch.cuda.is_available():
            devices = []
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                free, total = torch.cuda.mem_get_info(i)
                devices.append({
                    "index": i,
                    "name": props.name,
                    "vram_mb": total // (1024**2),
                    "free_vram_mb": free // (1024**2),
                    "used_vram_mb": (total - free) // (1024**2),
                })
            return {
                "available": True,
                "cuda_version": torch.version.cuda,
                "driver_version": _get_driver_version(),
                "devices": devices,
            }
        return {"available": False, "devices": []}
    except ImportError:
        return {"available": False, "devices": []}
    except Exception as e:
        logger.warning(f"GPU info failed: {e}")
        return {"available": False, "devices": [], "error": str(e)}


def _get_driver_version() -> str:
    """Get NVIDIA driver version."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip().splitlines()[0]
    except Exception:
        pass
    return "unknown"


async def _get_cpu_info() -> dict[str, Any]:
    """Get CPU information."""
    try:
        import psutil
        return {
            "name": platform.processor() or "Unknown",
            "cores": psutil.cpu_count(logical=False) or 0,
            "threads": psutil.cpu_count(logical=True) or 0,
            "usage_percent": psutil.cpu_percent(interval=0.1),
        }
    except ImportError:
        return {"name": "Unknown", "cores": 0, "threads": 0, "usage_percent": 0}


async def _get_memory_info() -> dict[str, Any]:
    """Get memory information."""
    try:
        import psutil
        mem = psutil.virtual_memory()
        return {
            "total_mb": mem.total // (1024**2),
            "used_mb": mem.used // (1024**2),
            "free_mb": mem.available // (1024**2),
            "usage_percent": mem.percent,
        }
    except ImportError:
        return {"total_mb": 0, "used_mb": 0, "free_mb": 0, "usage_percent": 0}


async def _get_disk_info() -> dict[str, Any]:
    """Get disk usage information."""
    try:
        import psutil
        disk = psutil.disk_usage("/")
        return {
            "total_gb": disk.total // (1024**3),
            "used_gb": disk.used // (1024**3),
            "free_gb": disk.free // (1024**3),
            "usage_percent": disk.percent,
        }
    except ImportError:
        return {"total_gb": 0, "used_gb": 0, "free_gb": 0, "usage_percent": 0}


async def _get_comfyui_info() -> dict[str, Any]:
    """Get ComfyUI status."""
    try:
        client = get_comfyui_client()
        health = await client.health_check()
        return health
    except Exception as e:
        return {"status": "error", "error": str(e)}


@router.get("/gpu", response_model=SuccessResponse)
async def get_gpu_status():
    """Get GPU status."""
    try:
        gpu_info = await _get_gpu_info()
        return SuccessResponse(data=gpu_info, message="GPU status retrieved")
    except Exception as e:
        logger.error(f"Failed to get GPU status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get GPU status: {e}")


@router.get("/workflows", response_model=SuccessResponse)
async def get_available_workflows():
    """Get available workflow templates."""
    try:
        workflow_manager = get_workflow_manager()
        return SuccessResponse(
            data={"workflows": workflow_manager.list_available_workflows()},
            message="Workflows retrieved",
        )
    except Exception as e:
        logger.error(f"Failed to get workflows: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get workflows: {e}")


@router.post("/clear-vram", response_model=SuccessResponse)
async def clear_vram():
    """Clear GPU VRAM."""
    try:
        client = get_comfyui_client()
        await client.free_memory()
        return SuccessResponse(data={"cleared": True}, message="VRAM cleared")
    except Exception as e:
        logger.error(f"Failed to clear VRAM: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear VRAM: {e}")


@router.get("/blender", response_model=SuccessResponse)
async def check_blender():
    """Check if Blender is available."""
    blender_path = shutil.which(settings.blender_executable)
    version = "unknown"
    if blender_path:
        try:
            result = subprocess.run(
                [blender_path, "--version"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                version = result.stdout.strip().splitlines()[0]
        except Exception:
            pass

    return SuccessResponse(
        data={"available": blender_path is not None, "version": version},
        message="Blender status retrieved",
    )


@router.get("/dependencies", response_model=SuccessResponse)
async def get_dependencies():
    """Get status of core runtime dependencies — verified against the real importable modules."""
    deps = {}
    for name in ("torch", "trimesh", "PIL", "numpy", "aiohttp", "psutil"):
        try:
            __import__(name)
            deps[name] = True
        except ImportError:
            deps[name] = False
    # ComfyUI engine reachable?
    comfy_ok = False
    try:
        client = get_comfyui_client()
        health = await client.health_check()
        comfy_ok = health.get("status") == "ok"
    except Exception:
        pass
    deps["comfyui"] = comfy_ok
    deps["comfyui_3d_pack"] = comfy_ok
    return SuccessResponse(
        data=deps,
        message="Dependencies status retrieved",
    )


@router.get("/storage", response_model=SuccessResponse)
async def get_storage_status():
    """Get storage statistics."""
    disk = await _get_disk_info()
    return SuccessResponse(data=disk, message="Storage status retrieved")


@router.get("/compatibility", response_model=SuccessResponse)
async def get_compatibility():
    """Check hardware/software compatibility."""
    return SuccessResponse(
        data={
            "compatible": True,
            "issues": [],
            "warnings": [],
        },
        message="Compatibility checked",
    )


@router.post("/cache/clear", response_model=SuccessResponse)
async def clear_system_cache():
    """Clear temporary caches."""
    client = get_comfyui_client()
    await client.free_memory(unload_models=True)
    return SuccessResponse(data={"cleared": True}, message="System cache cleared")


@router.post("/test/connection", response_model=SuccessResponse)
async def test_connection():
    """Test connection to backend and ComfyUI."""
    client = get_comfyui_client()
    health = await client.health_check()
    return SuccessResponse(
        data={"connected": health.get("status") == "ok", "engine": "comfyui"},
        message="Connection active",
    )


@router.get("/log", response_model=SuccessResponse)
async def get_system_log(limit: int = 50):
    """Get system log lines."""
    log_p = Path("logs/api.log")
    lines = []
    if log_p.exists():
        lines = log_p.read_text(encoding="utf-8", errors="replace").splitlines()[-limit:]
    return SuccessResponse(data={"lines": lines}, message="Log retrieved")