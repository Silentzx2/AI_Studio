"""Settings endpoints — user preferences stored server-side.

Settings are persisted in PostgreSQL so they survive restarts and are
shared across multiple API workers. Redis caching is kept as a read-through
layer for performance.
"""
import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.cache import get_cached, set_cached, invalidate_pattern
from app.database import AsyncSessionLocal
from app.models.setting import Setting

router = APIRouter(prefix="/settings", tags=["settings"])
logger = logging.getLogger(__name__)

# Default settings — used to seed the database on first read.
# Format: {key: (default_value, label)}
_DEFAULT_WORKSPACE: dict[str, tuple[Any, str]] = {
    "workspace.defaultLocation": ("/workspace/projects", "Default project location"),
    "workspace.autoSave": (True, "Auto-save enabled"),
    "workspace.autoSaveInterval": (30, "Auto-save interval (seconds)"),
    "workspace.maxRecentProjects": (20, "Maximum recent projects"),
    "workspace.clearHistoryOnExit": (False, "Clear history on exit"),
    "workspace.recentProjects": ([], "Recent projects list"),
}

_DEFAULT_GENERATION: dict[str, tuple[Any, str]] = {
    "generation.default_provider": ("hunyuan3d-2.1", "Default generation provider"),
    "generation.render_quality": ("high", "Render quality"),
    "generation.output_format": ("glb", "Output format"),
    "generation.resolution": ("1024", "Generation resolution"),
    "generation.steps": (30, "Inference steps"),
    "generation.low_vram": (False, "Low VRAM mode"),
    "generation.batch_generation_enabled": (False, "Batch generation enabled"),
}


async def _get_setting(session, key: str, default: Any) -> Any:
    """Read a single setting from DB, falling back to the default if missing."""
    result = await session.execute(select(Setting).where(Setting.key == key))
    row = result.scalar_one_or_none()
    if row is None:
        return default
    try:
        return json.loads(row.value)
    except (json.JSONDecodeError, TypeError):
        return row.value


async def _set_setting(session, key: str, value: Any, label: str | None = None) -> None:
    """Upsert a single setting into the DB."""
    result = await session.execute(select(Setting).where(Setting.key == key))
    row = result.scalar_one_or_none()
    serialized = json.dumps(value)
    if row is None:
        row = Setting(key=key, value=serialized, label=label)
        session.add(row)
    else:
        row.value = serialized
        if label:
            row.label = label


async def _load_settings(prefix: str, defaults: dict[str, tuple[Any, str]]) -> dict[str, Any]:
    """Load all settings with a given prefix from DB, seeding defaults."""
    result = {}
    async with AsyncSessionLocal() as session:
        for key, (default, label) in defaults.items():
            result[key] = await _get_setting(session, key, default)
        # Commit any seeded defaults
        try:
            await session.commit()
        except Exception:
            await session.rollback()
    return result


async def _save_settings(
    prefix: str,
    updates: dict[str, Any],
    defaults: dict[str, tuple[Any, str]],
) -> dict[str, Any]:
    """Persist settings and return the merged result."""
    async with AsyncSessionLocal() as session:
        for key, value in updates.items():
            if value is None:
                continue
            _, label = defaults.get(key, (None, None))
            await _set_setting(session, key, value, label)
        await session.commit()
        # Reload to return the full, merged state
        result = {}
        for key, (default, _) in defaults.items():
            result[key] = await _get_setting(session, key, default)
    return result


def _strip_prefix(settings: dict[str, str], prefix: str) -> dict[str, Any]:
    """Remove the 'workspace.' / 'generation.' prefix for the API response."""
    prefix_len = len(prefix)
    return {k[prefix_len:]: v for k, v in settings.items()}


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
    settings = await _load_settings("workspace", _DEFAULT_WORKSPACE)
    result = _strip_prefix(settings, "workspace.")
    set_cached("settings_workspace", result)
    return result


@router.post("/workspace")
async def save_workspace(config: WorkspaceConfig):
    updates = {f"workspace.{k}": v for k, v in config.model_dump().items()}
    await _save_settings("workspace", updates, _DEFAULT_WORKSPACE)
    invalidate_pattern("settings_")
    # Return fresh state
    settings = await _load_settings("workspace", _DEFAULT_WORKSPACE)
    result = {"success": True, "data": _strip_prefix(settings, "workspace.")}
    set_cached("settings_workspace", result["data"])
    return result


@router.post("/workspace/clear-history")
async def clear_workspace_history():
    async with AsyncSessionLocal() as session:
        await _set_setting(session, "workspace.recentProjects", [], "Recent projects list")
        await session.commit()
    invalidate_pattern("settings_")
    settings = await _load_settings("workspace", _DEFAULT_WORKSPACE)
    return {"success": True, "data": _strip_prefix(settings, "workspace.")}


@router.get("/generation")
async def get_generation():
    cached = get_cached("settings_generation", ttl_seconds=30)
    if cached is not None:
        return cached
    settings = await _load_settings("generation", _DEFAULT_GENERATION)
    result = _strip_prefix(settings, "generation.")
    set_cached("settings_generation", result)
    return result


@router.post("/generation")
async def save_generation(config: GenerationConfig):
    updates = {f"generation.{k}": v for k, v in config.model_dump().items()}
    await _save_settings("generation", updates, _DEFAULT_GENERATION)
    invalidate_pattern("settings_")
    settings = await _load_settings("generation", _DEFAULT_GENERATION)
    result = {"success": True, "data": _strip_prefix(settings, "generation.")}
    set_cached("settings_generation", result["data"])
    return result
