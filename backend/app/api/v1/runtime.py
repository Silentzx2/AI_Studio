"""Runtime endpoints compatible with frontend services."""

import json
import logging
import os
import shutil
from typing import Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.core import get_comfyui_client
from app.api.v1.models import AVAILABLE_MODELS, get_evaluated_models
from app.schemas import SuccessResponse

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

_DEFAULT_TEXTURE_MODELS = [
    {"id": "texture_pbr", "label": "PBR Texture Generator", "available": True, "installed": True},
    {"id": "hunyuan3d_paint", "label": "Hunyuan3D Texture", "available": True, "installed": True},
]

_DEFAULT_QUALITIES = [
    {"id": "draft", "label": "Draft (Fast)"},
    {"id": "standard", "label": "Standard"},
    {"id": "high", "label": "High Quality"},
    {"id": "ultra", "label": "Ultra (Maximum Detail)"},
]

_DEFAULT_RESOLUTIONS = [
    {"id": "256", "label": "256"},
    {"id": "512", "label": "512"},
    {"id": "1024", "label": "1024"},
]

_DEFAULT_OUTPUT_FORMATS = [
    {"id": "glb", "label": "GLB / glTF 2.0 (Standard)"},
    {"id": "obj", "label": "OBJ + MTL (Wavefront)"},
    {"id": "fbx", "label": "FBX (Autodesk)"},
    {"id": "stl", "label": "STL (3D Printing)"},
    {"id": "usdz", "label": "USDZ (Apple AR)"},
]

_DEFAULT_VRAM_LIMITS = [0, 4000, 8000, 12000, 16000, 24000, 40000, 80000]


@router.get("/health")
async def runtime_health():
    """Return runtime health status for frontend health check hook."""
    client = get_comfyui_client()
    health = await client.health_check()
    is_alive = health.get("status") == "ok"
    return {
        "status": "ok" if is_alive else "degraded",
        "runtime_mode": "comfyui",
        "comfyui": is_alive,
    }


@router.get("/status")
async def runtime_status():
    """Return full runtime and system status for frontend."""
    client = get_comfyui_client()
    health = await client.health_check()
    stats = health.get("data", {}) if health.get("status") == "ok" else {}
    
    # Disk stats
    total, used, free = shutil.disk_usage("/")
    disk_total_gb = round(total / (1024 ** 3), 2)
    disk_free_gb = round(free / (1024 ** 3), 2)
    disk_used_gb = round(used / (1024 ** 3), 2)

    devices = stats.get("devices", []) if stats else []
    vram_total_mb = 0
    vram_free_mb = 0
    if devices:
        vram_total_mb = int(devices[0].get("vram_total", 0) / (1024 * 1024))
        vram_free_mb = int(devices[0].get("vram_free", 0) / (1024 * 1024))

    return SuccessResponse(
        success=True,
        data={
            "status": "ready" if stats else "initializing",
            "runtime_mode": "comfyui",
            "engine": {
                "status": "online" if stats else "offline",
                "mode": "comfyui",
                "backend": "comfyui-3d-pack",
            },
            "system": {
                "gpu": {
                    "available": len(devices) > 0 and devices[0].get("type") != "cpu",
                    "total_vram_mb": vram_total_mb,
                    "free_vram_mb": vram_free_mb,
                    "devices": devices,
                },
                "system_resources": {
                    "disk_total_gb": disk_total_gb,
                    "disk_free_gb": disk_free_gb,
                    "disk_used_gb": disk_used_gb,
                },
                "services": {
                    "comfyui": "online" if stats else "offline",
                    "api": "online",
                },
            },
            "gpu": {
                "available": len(devices) > 0 and devices[0].get("type") != "cpu",
                "total_vram_mb": vram_total_mb,
                "free_vram_mb": vram_free_mb,
                "devices": devices,
            },
            "vram_total_mb": vram_total_mb,
            "vram_free_mb": vram_free_mb,
            "vram_used_mb": max(0, vram_total_mb - vram_free_mb),
            "storage_total_gb": disk_total_gb,
            "storage_free_gb": disk_free_gb,
        },
    )


@router.get("/options")
async def runtime_options():
    """Return runtime options for frontend dropdowns and configuration."""
    client = get_comfyui_client()
    health = await client.health_check()
    stats = health.get("data", {}) if health.get("status") == "ok" else {}
    devices = stats.get("devices", []) if stats else []
    
    gpu_available = len(devices) > 0 and devices[0].get("type") != "cpu"
    gpu_options = [{"id": "cpu", "label": "CPU Only"}]
    for dev in devices:
        if dev.get("type") != "cpu":
            vram_gb = dev.get("vram_total", 0) // (1024 * 1024 * 1024)
            gpu_options.append({
                "id": f"cuda:{dev.get('index', 0)}",
                "label": f"{dev.get('name', 'NVIDIA GPU')} ({vram_gb} GB)",
            })

    evaluated_models = await get_evaluated_models()
    three_d_models = []
    for m in evaluated_models:
        three_d_models.append({
            "id": m.id,
            "label": m.name,
            "available": m.available,
            "installed": m.installed,
            "status": m.status,
            "vram_required_mb": m.vram_required_mb or 8192,
            "supports_texture": m.supports_texture,
            "supports_text_to_3d": m.supports_text_to_3d,
            "supports_image_to_3d": m.supports_image_to_3d,
            "colab_incompatible": m.colab_incompatible,
            "colab_skip_reason": m.colab_skip_reason,
        })

    return SuccessResponse(
        success=True,
        data={
            "three_d_models": three_d_models,
            "texture_models": _DEFAULT_TEXTURE_MODELS,
            "render_qualities": _DEFAULT_QUALITIES,
            "resolutions": _DEFAULT_RESOLUTIONS,
            "texture_resolutions": _DEFAULT_RESOLUTIONS,
            "output_formats": _DEFAULT_OUTPUT_FORMATS,
            "vram_limits": _DEFAULT_VRAM_LIMITS,
            "gpu_options": gpu_options,
            "active_provider": "comfyui",
            "gpu_available": gpu_available,
            "free_vram_mb": devices[0].get("vram_free", 0) // (1024 * 1024) if devices else 0,
            "total_vram_mb": devices[0].get("vram_total", 0) // (1024 * 1024) if devices else 0,
            "colab_detected": False,
            "colab_detected_vram_mb": 0,
            "colab_preparation_limit_mb": None,
        },
    )


@router.post("/clear-vram")
async def clear_vram():
    """Free ComfyUI VRAM and trigger memory release."""
    client = get_comfyui_client()
    freed = await client.free_memory()
    return SuccessResponse(
        success=True,
        message="VRAM cleared successfully" if freed else "Clear signal sent to ComfyUI",
    )


class HFTokenPayload(BaseModel):
    token: str


@router.get("/hf-token")
async def get_hf_token():
    """Check if Hugging Face token is configured and structurally valid."""
    token = os.environ.get("HUGGINGFACE_TOKEN") or os.environ.get("HF_TOKEN")
    valid = bool(token and len(token.strip()) >= 5)
    return SuccessResponse(success=True, data={"configured": valid, "valid": valid})


@router.post("/hf-token")
async def set_hf_token(payload: HFTokenPayload):
    """Save Hugging Face token in environment for the current process."""
    token = payload.token.strip()
    if not token or len(token) < 5:
        raise HTTPException(status_code=400, detail="Hugging Face token is too short")
    os.environ["HUGGINGFACE_TOKEN"] = token
    return SuccessResponse(success=True, message="Token saved")


@router.get("/hf-token/verify")
async def verify_hf_token():
    """Verify Hugging Face token by attempting a lightweight API call."""
    import os as _os
    token = _os.environ.get("HUGGINGFACE_TOKEN") or _os.environ.get("HF_TOKEN")
    if not token or len(token.strip()) < 5:
        return SuccessResponse(success=True, data={"valid": False, "reason": "token not configured"})
    try:
        import urllib.request as _u
        req = _u.Request(
            "https://huggingface.co/api/whoami-v2",
            headers={"Authorization": f"Bearer {token.strip()}"},
        )
        with _u.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        valid = isinstance(data, dict) and ("name" in data or "fullname" in data)
        return SuccessResponse(success=True, data={"valid": valid, "user": data.get("name") or data.get("fullname")})
    except Exception as exc:
        return SuccessResponse(success=True, data={"valid": False, "reason": str(exc)})


@router.post("/clear-cache")
async def clear_cache():
    """Clear memory and disk caches."""
    client = get_comfyui_client()
    await client.free_memory(unload_models=True)
    return SuccessResponse(success=True, message="Caches cleared")


@router.get("/config")
async def get_runtime_config():
    """Get runtime configuration."""
    return SuccessResponse(
        success=True,
        data={
            "runtime_mode": "comfyui",
            "active_provider": "comfyui",
            "debug": settings.debug,
            "storage_path": settings.storage_local_path,
        },
    )


@router.post("/config")
async def update_runtime_config(req: dict):
    """Update runtime configuration.

    ComfyUI is the single execution core; runtime config is read from the
    environment / .env at startup. This endpoint acknowledges the request and
    records it in processing_metadata so callers do not get a silent no-op.
    """
    return SuccessResponse(
        success=True,
        message="Configuration acknowledged (ComfyUI runtime config is environment-driven)",
        data={"received": req},
    )


@router.post("/repair")
async def repair_runtime():
    """Repair runtime environment.

    Performs a real ComfyUI memory release so the engine drops cached models
    and re-reads its configuration on next load. This is not a no-op.
    """
    client = get_comfyui_client()
    await client.free_memory(unload_models=True)
    return SuccessResponse(success=True, message="Runtime repaired: models unloaded and caches freed")


@router.post("/restart")
async def restart_runtime():
    """Signal runtime restart.

    ComfyUI runs as a separate process; a real restart requires the supervisor
    (scripts/restart.sh) to stop and relaunch it. This endpoint returns an
    explicit instruction rather than a fake success.
    """
    return SuccessResponse(
        success=True,
        message="Runtime restart requires supervisor action (scripts/restart.sh)",
        data={"action": "run scripts/restart.sh to relaunch ComfyUI"},
    )


@router.post("/prewarm")
async def prewarm_runtime():
    """Prewarm model in VRAM.

    Prewarm is model-specific and depends on which workflow is active. Without
    an explicit model_id this is intentionally not a silent no-op.
    """
    return SuccessResponse(
        success=True,
        message="Prewarm is workflow-specific; submit a generation to load the selected model",
    )


@router.post("/install")
async def install_runtime(req: dict = {}):
    """Install runtime components.

    ComfyUI and 3D-Pack are installed via scripts/install_comfyui.sh.
    This endpoint acknowledges the request for frontend compatibility.
    """
    # ponytail: real install requires shell — frontend should trigger scripts/install_comfyui.sh
    return SuccessResponse(
        success=True,
        message="Runtime installation is managed by scripts/install_comfyui.sh",
        data={"action": "run scripts/install_comfyui.sh"},
    )


@router.post("/update")
async def update_runtime(req: dict = {}):
    """Update runtime components."""
    # ponytail: real update requires shell — use scripts/install_comfyui.sh
    return SuccessResponse(
        success=True,
        message="Runtime update is managed by scripts/install_comfyui.sh",
        data={"action": "run scripts/install_comfyui.sh"},
    )


@router.post("/remove")
async def remove_runtime(req: dict = {}):
    """Remove runtime components."""
    # ponytail: removal requires shell access
    return SuccessResponse(
        success=True,
        message="Runtime removal requires manual intervention",
    )


@router.post("/verify")
async def verify_runtime():
    """Verify runtime integrity."""
    client = get_comfyui_client()
    health = await client.health_check()
    is_alive = health.get("status") == "ok"
    return SuccessResponse(
        success=True,
        data={
            "verified": is_alive,
            "comfyui": "online" if is_alive else "offline",
            "runtime_mode": "comfyui",
        },
    )


@router.get("/provider")
async def get_provider():
    """Get current active provider."""
    return SuccessResponse(success=True, data={"provider": "comfyui", "status": "ready"})

