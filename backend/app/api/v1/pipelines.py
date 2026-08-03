"""Settings → Pipelines API.

This endpoint powers the new model capability panel in Settings.
It keeps install state, feature gating, and user-facing status in one place.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.capability_matrix import build_pipeline_snapshot
from app.core.registry.model_registry import ModelRegistry
from app.utils.response import success
from runtime.storage import get_storage_config

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


class PipelineToggleRequest(BaseModel):
    enabled: bool


def _state_file() -> Path:
    storage = get_storage_config()
    storage.ensure_dirs()
    return storage.runtime_cache_dir / "pipelines_state.json"


def _load_enabled_map() -> dict[str, bool]:
    p = _state_file()
    if not p.exists():
        return {}
    try:
        raw = json.loads(p.read_text())
        enabled = raw.get("enabled", {})
        if isinstance(enabled, dict):
            return {str(k).lower(): bool(v) for k, v in enabled.items()}
    except Exception:
        pass
    return {}


def _save_enabled_map(enabled_map: dict[str, bool]) -> None:
    payload = {
        "enabled": enabled_map,
        "updated_at": datetime.utcnow().isoformat(),
    }
    p = _state_file()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(payload, indent=2, sort_keys=True))


@router.get("")
async def list_pipelines() -> dict[str, Any]:
    """Return all known models and the computed feature matrix."""
    registry = ModelRegistry()
    installed = await registry.get_installed_models()
    available = await registry.get_available_models()

    # Merge by model id while preserving the installed record where it exists.
    merged: dict[str, dict[str, Any]] = {}
    for model in available + installed:
        model_id = str(model.get("id", "")).lower()
        if not model_id:
            continue
        merged[model_id] = {**merged.get(model_id, {}), **model}

    enabled_map = _load_enabled_map()
    snapshot = build_pipeline_snapshot(merged.values(), enabled_map)

    return success(
        {
            **snapshot,
            "updated_at": datetime.utcnow().isoformat(),
        }
    )


@router.post("/{model_id}/toggle")
async def toggle_pipeline(model_id: str, payload: PipelineToggleRequest) -> dict[str, Any]:
    """Enable or disable a pipeline in the local feature gate."""
    model_id_norm = model_id.strip().lower()
    registry = ModelRegistry()
    installed = await registry.get_installed_models()
    available = await registry.get_available_models()
    known_ids = {str(m.get("id", "")).lower() for m in installed + available}

    if model_id_norm not in known_ids:
        raise HTTPException(status_code=404, detail="Model not found")

    enabled_map = _load_enabled_map()
    enabled_map[model_id_norm] = bool(payload.enabled)
    _save_enabled_map(enabled_map)

    merged: dict[str, dict[str, Any]] = {}
    for model in available + installed:
        merged[str(model.get("id", "")).lower()] = {**merged.get(str(model.get("id", "")).lower(), {}), **model}

    snapshot = build_pipeline_snapshot(merged.values(), enabled_map)
    return success(
        {
            "model_id": model_id_norm,
            "enabled": bool(payload.enabled),
            "snapshot": snapshot,
        }
    )
