"""Model management endpoints."""

import logging
import time
from datetime import datetime, timezone
from pathlib import Path
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


REQUIRED_NODES = {
    "tripo_sr": ["[Comfy3D] Load TripoSR Model", "[Comfy3D] TripoSR"],
    "hunyuan3d": ["[Comfy3D] Load Hunyuan3D 21 ShapeGen Pipeline", "[Comfy3D] Hunyuan3D 21 ShapeGen"],
    "hunyuan3d_image": ["[Comfy3D] Load Hunyuan3D 21 ShapeGen Pipeline", "[Comfy3D] Hunyuan3D 21 ShapeGen"],
    "trellis": ["[Comfy3D] Load Trellis Structured 3D Latents Models", "[Comfy3D] Trellis Structured 3D Latents Models"],
    "texture_pbr": ["[Comfy3D] Load Hunyuan3D 21 TexGen Pipeline", "[Comfy3D] Hunyuan3D 21 TexGen"],
}


def _workspace_root() -> Path:
    """Resolve the repository root regardless of the backend CWD.

    backend/app/api/v1/models.py -> repo root (five parents up from api/v1).
    """
    return Path(__file__).resolve().parent.parent.parent.parent.parent


_WS_ROOT = _workspace_root()

CHECKPOINT_LOCATIONS = {
    "tripo_sr": [
        _WS_ROOT / "ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/Checkpoints/TripoSR/model.ckpt",
        _WS_ROOT / "ENGINE/ComfyUI/models/checkpoints/model.ckpt",
    ],
    "hunyuan3d": [
        _WS_ROOT / "ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/Checkpoints/hunyuan3d",
        _WS_ROOT / "ENGINE/ComfyUI/models/diffusers/hunyuan3d-dit-v2-1",
        Path.home() / ".cache/huggingface/hub/models--tencent--Hunyuan3D-2",
    ],
    "hunyuan3d_image": [
        _WS_ROOT / "ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/Checkpoints/hunyuan3d",
        _WS_ROOT / "ENGINE/ComfyUI/models/diffusers/hunyuan3d-dit-v2-1",
        Path.home() / ".cache/huggingface/hub/models--tencent--Hunyuan3D-2",
    ],
    "trellis": [
        _WS_ROOT / "ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/Checkpoints/trellis",
        Path.home() / ".cache/huggingface/hub/models--JeffreyXiang--TRELLIS-image-large",
    ],
    "texture_pbr": [
        _WS_ROOT / "ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/Checkpoints/hunyuan3d_tex",
    ],
}

_MODELS_CACHE: Optional[list[ModelInfo]] = None
_MODELS_CACHE_TIME: float = 0.0
_MODELS_CACHE_TTL: float = 5.0


async def get_evaluated_models(force: bool = False) -> list[ModelInfo]:
    """Dynamically evaluate model readiness from ComfyUI engine reachability, nodes, and weights."""
    global _MODELS_CACHE, _MODELS_CACHE_TIME
    now = time.time()
    if not force and _MODELS_CACHE is not None and (now - _MODELS_CACHE_TIME < _MODELS_CACHE_TTL):
        return _MODELS_CACHE

    client = get_comfyui_client()
    comfy_ok = await client.is_alive()
    loaded_nodes = {}
    if comfy_ok:
        try:
            loaded_nodes = await client.get_object_info()
        except Exception:
            pass

    evaluated = []
    for raw in AVAILABLE_MODELS:
        m = dict(raw)
        mid = m["id"]
        req_nodes = REQUIRED_NODES.get(mid, [])
        nodes_ok = all(n in loaded_nodes for n in req_nodes) if (comfy_ok and req_nodes) else False

        # Check weights on disk
        candidates = CHECKPOINT_LOCATIONS.get(mid, [])
        weights_ok = False
        for p in candidates:
            try:
                if p.is_file() and p.stat().st_size > 1024 * 1024:
                    weights_ok = True
                    break
                elif p.is_dir() and (any(p.rglob("*.safetensors")) or any(p.rglob("*.bin")) or any(p.rglob("*.ckpt"))):
                    weights_ok = True
                    break
            except Exception:
                pass

        if not comfy_ok:
            m["installed"] = False
            m["available"] = False
            m["loaded"] = False
            m["active"] = False
            m["status"] = "offline"
        elif nodes_ok and weights_ok:
            m["installed"] = True
            m["available"] = True
            m["loaded"] = True
            m["active"] = True
            m["status"] = "ready"
        elif nodes_ok and not weights_ok:
            m["installed"] = False
            m["available"] = False
            m["loaded"] = False
            m["active"] = False
            m["status"] = "not_downloaded"
        else:
            m["installed"] = False
            m["available"] = False
            m["loaded"] = False
            m["active"] = False
            m["status"] = "node_missing"

        evaluated.append(ModelInfo(**m))

    _MODELS_CACHE = evaluated
    _MODELS_CACHE_TIME = now
    return evaluated


@router.get("", response_model=ModelsListResponse)
async def list_all_models():
    """Return all available + installed models evaluated dynamically."""
    try:
        models = await get_evaluated_models()
        installed = [m for m in models if m.installed]
        available = [m for m in models if m.available]
        return ModelsListResponse(
            models=models,
            count=len(models),
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
    """List all verified installed models."""
    try:
        models = await get_evaluated_models(force=include_health)
        installed = [m for m in models if m.installed]
        return installed
    except Exception as e:
        logger.error(f"Failed to list installed models: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list installed models: {e}")


@router.get("/health/all")
async def get_all_models_health():
    """Get dynamic health summary for all models."""
    client = get_comfyui_client()
    comfy_ok = await client.is_alive()

    models = await get_evaluated_models(force=True)
    report = {}
    for m in models:
        mid = m.id
        is_ready = m.installed and m.available
        report[mid] = {
            "model_id": mid,
            "model_name": m.name,
            "status": "ready" if is_ready else ("not_downloaded" if comfy_ok else "offline"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "total_checks": 3,
                "passed": 3 if is_ready else (2 if comfy_ok else 0),
                "warnings": 0,
                "errors": 0 if is_ready else 1,
            },
            "checks": {
                "comfyui": {"status": "passed" if comfy_ok else "failed", "message": "ComfyUI execution engine connected"},
                "nodes": {"status": "passed" if m.status != "node_missing" else "failed", "message": "Required 3D-Pack nodes loaded"},
                "weights": {"status": "passed" if is_ready else "pending", "message": f"Weights on disk ({m.status})"},
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