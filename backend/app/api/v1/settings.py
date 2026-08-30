"""Settings endpoints — user preferences stored server-side."""

import threading

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.cache import get_cached, set_cached, invalidate_pattern

router = APIRouter(prefix="/settings", tags=["settings"])

# In-memory store (replace with DB-backed store if persistence across restarts needed)
# ponytail: per-process — multi-worker deployments need a shared backend (DB/Redis).
# TODO: Migrate to DB-backed storage for persistence and multi-worker consistency
_workspace_store: dict = {
    "defaultLocation": "/workspace/projects",
    "autoSave": True,
    "autoSaveInterval": 30,
    "maxRecentProjects": 20,
    "clearHistoryOnExit": False,
    "recentProjects": [],
}

_generation_store: dict = {
    "default_provider": "hunyuan3d-2.1",
    "render_quality": "high",
    "output_format": "glb",
    "resolution": "1024",
    "steps": 30,
    "low_vram": False,
    "batch_generation_enabled": False,
}

_settings_lock = threading.Lock()


class WorkspaceConfig(BaseModel):
    defaultLocation: str = Field(default="/workspace/projects")
    autoSave: bool = Field(default=True)
    autoSaveInterval: int = Field(default=30, ge=10, le=300)
    maxRecentProjects: int = Field(default=20, ge=5, le=50)
    clearHistoryOnExit: bool = Field(default=False)


class GenerationConfig(BaseModel):
    default_provider: str | None = None
    render_quality: str | None = None
    output_format: str | None = None
    resolution: str | None = None
    steps: int | None = None
    low_vram: bool | None = None
    batch_generation_enabled: bool | None = None


@router.get("/workspace")
async def get_workspace():
    cached = get_cached("settings_workspace", ttl_seconds=30)
    if cached is not None:
        return cached
    with _settings_lock:
        result = dict(_workspace_store)
    set_cached("settings_workspace", result)
    return result


@router.post("/workspace")
async def save_workspace(config: WorkspaceConfig):
    with _settings_lock:
        _workspace_store.update(config.model_dump())
        result = {"success": True, "data": dict(_workspace_store)}
    invalidate_pattern("settings_")
    set_cached("settings_workspace", result["data"])
    return result


@router.post("/workspace/clear-history")
async def clear_workspace_history():
    with _settings_lock:
        _workspace_store["recentProjects"] = []
        result = {"success": True, "data": dict(_workspace_store)}
    invalidate_pattern("settings_")
    return result


@router.get("/generation")
async def get_generation():
    cached = get_cached("settings_generation", ttl_seconds=30)
    if cached is not None:
        return cached
    with _settings_lock:
        result = dict(_generation_store)
    set_cached("settings_generation", result)
    return result


@router.post("/generation")
async def save_generation(config: GenerationConfig):
    with _settings_lock:
        _generation_store.update({k: v for k, v in config.model_dump().items() if v is not None})
        result = {"success": True, "data": dict(_generation_store)}
    invalidate_pattern("settings_")
    set_cached("settings_generation", result["data"])
    return result
