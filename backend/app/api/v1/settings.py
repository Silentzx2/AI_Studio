"""Settings endpoints — appearance and user preferences stored server-side."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/settings", tags=["settings"])

# In-memory store (replace with DB-backed store if persistence across restarts needed)
# ponytail: per-process — multi-worker deployments need a shared backend (DB/Redis).
# TODO: Migrate to DB-backed storage for persistence and multi-worker consistency
_appearance_store: dict = {
    "theme": "dark",
    "accentColor": "#f97316",
    "fontSize": "md",
    "density": "normal",
}

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


class AppearanceConfig(BaseModel):
    theme: str = "dark"
    accentColor: str = "#f97316"
    fontSize: str = "md"
    density: str = "normal"


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


@router.get("/appearance")
async def get_appearance():
    return _appearance_store


@router.post("/appearance")
async def save_appearance(config: AppearanceConfig):
    _appearance_store.update(config.model_dump())
    return {"success": True, "data": _appearance_store}


@router.get("/workspace")
async def get_workspace():
    return _workspace_store


@router.post("/workspace")
async def save_workspace(config: WorkspaceConfig):
    _workspace_store.update(config.model_dump())
    return {"success": True, "data": _workspace_store}


@router.post("/workspace/clear-history")
async def clear_workspace_history():
    _workspace_store["recentProjects"] = []
    return {"success": True, "data": _workspace_store}


@router.get("/generation")
async def get_generation():
    return _generation_store


@router.post("/generation")
async def save_generation(config: GenerationConfig):
    _generation_store.update({k: v for k, v in config.model_dump().items() if v is not None})
    return {"success": True, "data": _generation_store}
