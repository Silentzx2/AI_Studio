"""Runtime endpoints compatible with frontend services."""

import logging
import os
import shutil
from typing import Any, Optional
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings
from app.core import get_comfyui_client
from app.api.v1.models import AVAILABLE_MODELS
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

    three_d_models = []
    for m in AVAILABLE_MODELS:
        three_d_models.append({
            "id": m["id"],
            "label": m["name"],
            "available": m["available"],
            "installed": m["installed"],
            "status": m["status"],
            "vram_required_mb": m.get("vram_required_mb", 8192),
            "supports_texture": m.get("supports_texture", False),
            "supports_text_to_3d": m.get("supports_text_to_3d", False),
            "supports_image_to_3d": m.get("supports_image_to_3d", False),
            "colab_incompatible": m.get("colab_incompatible", False),
            "colab_skip_reason": m.get("colab_skip_reason"),
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
    """Check if Hugging Face token is configured."""
    has_token = bool(os.environ.get("HUGGINGFACE_TOKEN") or getattr(settings, "huggingface_token", None))
    return SuccessResponse(success=True, data={"configured": has_token, "valid": has_token})


@router.post("/hf-token")
async def set_hf_token(payload: HFTokenPayload):
    """Save Hugging Face token in environment."""
    os.environ["HUGGINGFACE_TOKEN"] = payload.token
    return SuccessResponse(success=True, message="Token saved")
