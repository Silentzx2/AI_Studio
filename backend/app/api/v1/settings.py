"""Settings endpoints for AI Studio backend."""

import logging
from typing import Any, Dict
from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.database import AsyncSessionLocal
from app.models import GenerationJob
from sqlalchemy import delete

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory settings stores (with sensible defaults)
_workspace_settings: Dict[str, Any] = {
    "theme": "dark",
    "auto_save": True,
    "show_fps": False,
    "viewport_grid": True,
    "wireframe_mode": False,
    "camera_fov": 45,
}

_generation_settings: Dict[str, Any] = {
    "default_model": "triposr",
    "default_quality": "standard",
    "texture_resolution": 1024,
    "remesh_target_faces": 10000,
    "auto_optimize": True,
}


@router.get("/workspace")
async def get_workspace_settings():
    """Get workspace preferences."""
    return {"success": True, "data": _workspace_settings}


@router.post("/workspace")
async def update_workspace_settings(request: Request):
    """Update workspace preferences."""
    try:
        data = await request.json()
        if isinstance(data, dict):
            _workspace_settings.update(data)
        return {"success": True, "data": _workspace_settings}
    except Exception as exc:
        logger.warning("Failed to update workspace settings: %s", exc)
        return {"success": False, "message": str(exc)}


@router.post("/workspace/clear-history")
async def clear_workspace_history():
    """Clear all past generation job records from the database."""
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(delete(GenerationJob))
            await session.commit()
        return {"success": True, "message": "History cleared"}
    except Exception as exc:
        logger.warning("Failed to clear history: %s", exc)
        return {"success": False, "message": str(exc)}


@router.get("/generation")
async def get_generation_settings():
    """Get generation defaults."""
    return {"success": True, "data": _generation_settings}


@router.post("/generation")
async def update_generation_settings(request: Request):
    """Update generation defaults."""
    try:
        data = await request.json()
        if isinstance(data, dict):
            _generation_settings.update(data)
        return {"success": True, "data": _generation_settings}
    except Exception as exc:
        logger.warning("Failed to update generation settings: %s", exc)
        return {"success": False, "message": str(exc)}
