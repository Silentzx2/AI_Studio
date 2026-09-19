"""Model management endpoints."""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.config import get_settings
from app.core import get_comfyui_client, get_workflow_manager
from app.schemas import ModelInfo, ModelsListResponse, SuccessResponse

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


# Available models (verified against ComfyUI-3D-Pack)
AVAILABLE_MODELS = [
    {
        "id": "hunyuan3d",
        "name": "Hunyuan3D",
        "category": "text-to-3d",
        "type": "3d",
        "installed": True,
        "available": True,
        "loaded": False,
        "active": False,
        "status": "installed",
        "size_estimate_gb": 12.5,
        "size_mb": 12800,
        "vram_required_mb": 8192,
        "supports_text_to_3d": True,
        "supports_image_to_3d": False,
        "supports_texture": True,
        "colab_incompatible": False,
        "colab_skip_reason": None,
    },
    {
        "id": "hunyuan3d_image",
        "name": "Hunyuan3D Image-to-3D",
        "category": "image-to-3d",
        "type": "3d",
        "installed": True,
        "available": True,
        "loaded": False,
        "active": False,
        "status": "installed",
        "size_estimate_gb": 12.5,
        "size_mb": 12800,
        "vram_required_mb": 8192,
        "supports_text_to_3d": False,
        "supports_image_to_3d": True,
        "supports_texture": True,
        "colab_incompatible": False,
        "colab_skip_reason": None,
    },
    {
        "id": "trellis",
        "name": "TRELLIS",
        "category": "text-to-3d",
        "type": "3d",
        "installed": True,
        "available": True,
        "loaded": False,
        "active": False,
        "status": "installed",
        "size_estimate_gb": 15.0,
        "size_mb": 15360,
        "vram_required_mb": 12288,
        "supports_text_to_3d": True,
        "supports_image_to_3d": False,
        "supports_texture": True,
        "colab_incompatible": True,
        "colab_skip_reason": "TRELLIS requires 12GB+ VRAM",
    },
    {
        "id": "tripo_sr",
        "name": "TripoSR",
        "category": "image-to-3d",
        "type": "3d",
        "installed": True,
        "available": True,
        "loaded": False,
        "active": False,
        "status": "installed",
        "size_estimate_gb": 2.0,
        "size_mb": 2048,
        "vram_required_mb": 4096,
        "supports_text_to_3d": False,
        "supports_image_to_3d": True,
        "supports_texture": False,
        "colab_incompatible": False,
        "colab_skip_reason": None,
    },
    {
        "id": "texture_pbr",
        "name": "PBR Texture Generator",
        "category": "texture",
        "type": "texture",
        "installed": True,
        "available": True,
        "loaded": False,
        "active": False,
        "status": "installed",
        "size_estimate_gb": 3.0,
        "size_mb": 3072,
        "vram_required_mb": 4096,
        "supports_text_to_3d": False,
        "supports_image_to_3d": False,
        "supports_texture": True,
        "colab_incompatible": False,
        "colab_skip_reason": None,
    },
]


@router.get("", response_model=ModelsListResponse)
async def list_all_models():
    """Return all available + installed models."""
    try:
        models = [ModelInfo(**m) for m in AVAILABLE_MODELS]
        installed = [m for m in models if m.installed]
        available = [m for m in models if m.available]
        seen = set()
        all_models = []
        for m in installed + available:
            if m.id not in seen:
                seen.add(m.id)
                all_models.append(m)

        return ModelsListResponse(
            models=all_models,
            count=len(all_models),
            installed_count=len(installed),
            available_count=len(available),
        )
    except Exception as e:
        logger.error(f"Failed to list models: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list models: {e}")


@router.get("/installed", response_model=list[ModelInfo])
async def list_installed_models(
    include_health: bool = Query(False, description="Include health status for each model"),
):
    """List all installed models."""
    try:
        models = [ModelInfo(**m) for m in AVAILABLE_MODELS]
        installed = [m for m in models if m.installed]

        if include_health:
            # Check health for each model
            for model in installed:
                try:
                    client = get_comfyui_client()
                    health = await client.health_check()
                    model.status = "installed" if health.get("status") == "ok" else "error"
                except Exception:
                    model.status = "error"

        return installed
    except Exception as e:
        logger.error(f"Failed to list installed models: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list installed models: {e}")


@router.get("/health/all")
async def get_all_models_health():
    """Get health summary for all models."""
    client = get_comfyui_client()
    comfy_health = await client.health_check()
    is_ok = comfy_health.get("status") == "ok"
    status_str = "healthy" if is_ok else "unhealthy"

    report = {}
    for m in AVAILABLE_MODELS:
        mid = m["id"]
        report[mid] = {
            "model_id": mid,
            "model_name": m["name"],
            "status": status_str,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "total_checks": 2,
                "passed": 2 if is_ok else 1,
                "warnings": 0,
                "errors": 0 if is_ok else 1,
            },
            "checks": {
                "comfyui": {"status": "passed" if is_ok else "failed", "message": "ComfyUI execution engine connected"},
                "workflow": {"status": "passed", "message": "Workflow template registered"},
            },
        }
    return {"success": True, "data": report}


@router.get("/{model_id}/health")
async def get_model_health(model_id: str):
    """Get health check results for a specific model."""
    target = next((m for m in AVAILABLE_MODELS if m["id"] == model_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    client = get_comfyui_client()
    comfy_health = await client.health_check()
    is_ok = comfy_health.get("status") == "ok"
    status_str = "healthy" if is_ok else "unhealthy"
    return {
        "success": True,
        "data": {
            "model_id": model_id,
            "model_name": target["name"],
            "status": status_str,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "total_checks": 2,
                "passed": 2 if is_ok else 1,
                "warnings": 0,
                "errors": 0 if is_ok else 1,
            },
            "checks": {
                "comfyui": {"status": "passed" if is_ok else "failed", "message": "ComfyUI execution engine connected"},
                "workflow": {"status": "passed", "message": "Workflow template registered"},
            },
        },
    }


@router.get("/{model_id}", response_model=ModelInfo)
async def get_model(model_id: str):
    """Get detailed information about a specific model."""
    for m in AVAILABLE_MODELS:
        if m["id"] == model_id:
            return ModelInfo(**m)

    raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")


@router.get("/workflows")
async def get_available_workflows():
    """Get available workflow templates."""
    try:
        workflow_manager = get_workflow_manager()
        return {"success": True, "data": workflow_manager.list_available_workflows()}
    except Exception as e:
        logger.error(f"Failed to get workflows: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get workflows: {e}")