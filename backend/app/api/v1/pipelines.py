"""Settings → Pipelines API.

This endpoint powers the new model capability panel in Settings.
It keeps install state, feature gating, and user-facing status in one place.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.capability_matrix import build_pipeline_snapshot, filter_by_workspace, WORKSPACE_TYPES
from app.core.registry.model_registry import ModelRegistry
from app.utils.response import error, success
from runtime.storage import get_storage_config

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


class PipelineToggleRequest(BaseModel):
    enabled: bool


class WorkspaceModelsRequest(BaseModel):
    workspace: str
    installed_only: bool = False


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


def _models_from_installer() -> list[dict[str, Any]]:
    """Bridge runtime.installer.get_install_status() into the capability-matrix
    model shape used by build_pipeline_snapshot/filter_by_workspace.

    ponytail: ModelRegistry reads the DB `installed_models` table, which is
    empty in this deployment (installs run through runtime.installer and write
    to disk/state json, not the DB). get_install_status() is the authoritative
    source for what is actually installed on disk (it checks the filesystem),
    so we overlay it onto the registry/manifest models to surface the real
    install state.
    """
    from runtime.installer import get_install_status

    out: list[dict[str, Any]] = []
    try:
        status = get_install_status()
    except Exception:
        return out
    for name, st in status.items():
        meta = st.get("metadata") or {}
        out.append({
            "id": name,
            "label": meta.get("label") or name,
            "name": meta.get("label") or name,
            "category": meta.get("category") or "unknown",
            "installed": bool(st.get("installed", False)),
            "available": bool(st.get("installed", False)),
            "status": "ready" if st.get("installed") else "not_installed",
            "supports_text_to_3d": meta.get("supports_text_to_3d", False),
            "supports_image_to_3d": meta.get("supports_image_to_3d", False),
            "supports_texture": meta.get("supports_texture", False),
            "workspace_compatibility": meta.get("workspace_compatibility"),
            "vram_required_mb": meta.get("vram_required_mb", 0),
            "weight_key": meta.get("weight_key"),
            "repo": meta.get("repo"),
        })
    return out


def _overlay_install_state(merged: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Overlay the authoritative on-disk install state onto merged models.

    Merges per model id so the hardcoded manifest wins for display metadata
    while install/ready status comes from runtime.installer (filesystem truth).
    """
    for m in _models_from_installer():
        mid = str(m["id"]).lower()
        if mid not in merged:
            merged[mid] = m
        else:
            merged[mid] = {**merged[mid], "installed": m["installed"], "status": m["status"]}
    return merged


def _enrich_with_colab(models: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Add colab_incompatible and colab_skip_reason to each model dict."""
    try:
        from runtime.capability import get_colab_incompatibility_reason  # noqa: PLC0415
        enriched = []
        for m in models:
            mm = dict(m)
            reason = get_colab_incompatibility_reason(mm.get("id", ""))
            if reason:
                mm["colab_incompatible"] = True
                mm["colab_skip_reason"] = reason
            else:
                mm["colab_incompatible"] = False
                mm["colab_skip_reason"] = None
            enriched.append(mm)
        return enriched
    except Exception:
        return models


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

    # ponytail: ModelRegistry reads the DB `installed_models` table, which is
    # empty here (installs go through runtime.installer → disk/state). Overlay
    # get_install_status() so installed/ready reflects on-disk truth.
    merged = _overlay_install_state(merged)

    enabled_map = _load_enabled_map()
    snapshot = build_pipeline_snapshot(_enrich_with_colab(list(merged.values())), enabled_map)

    return success(
        {
            **snapshot,
            "workspace_types": list(WORKSPACE_TYPES),
            "updated_at": datetime.utcnow().isoformat(),
        }
    )


@router.get("/workspace-models")
async def get_workspace_models(workspace: str = Query(...), installed_only: bool = Query(False)):
    """Return models compatible with a specific workspace type.

    Workspace types:
    - mesh-generation
    - texture-generation
    - rigging
    - animation
    - segmentation
    - remesh
    - post-processing
    """
    registry = ModelRegistry()
    installed = await registry.get_installed_models()
    available = await registry.get_available_models()

    merged: dict[str, dict[str, Any]] = {}
    for model in available + installed:
        model_id = str(model.get("id", "")).lower()
        if not model_id:
            continue
        merged[model_id] = {**merged.get(model_id, {}), **model}

    # ponytail: ModelRegistry reads the DB `installed_models` table, which is
    # empty here (installs go through runtime.installer → disk/state). Overlay
    # get_install_status() so installed/ready reflects on-disk truth.
    merged = _overlay_install_state(merged)

    models = list(merged.values())
    if installed_only:
        models = [m for m in models if m.get("installed", False)]

    compatible = filter_by_workspace(models, workspace)
    enabled_map = _load_enabled_map()
    snapshot = build_pipeline_snapshot(_enrich_with_colab(compatible), enabled_map)
    return success(snapshot)


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

    snapshot = build_pipeline_snapshot(_enrich_with_colab(list(merged.values())), enabled_map)
    return success(
        {
            "model_id": model_id_norm,
            "enabled": bool(payload.enabled),
            "snapshot": snapshot,
        }
    )


@router.get("/workspace-types")
async def list_workspace_types() -> dict[str, Any]:
    """Return all supported workspace/task types."""
    return success({
        "workspace_types": list(WORKSPACE_TYPES),
        "descriptions": {
            "mesh-generation": "Generate 3D meshes from text or images",
            "texture-generation": "Generate PBR textures and materials",
            "rigging": "Auto-rig 3D character meshes",
            "animation": "Generate skeletal animations",
            "segmentation": "Part segmentation and mesh splitting",
            "remesh": "Retopology and mesh optimization",
            "post-processing": "Detail enhancement and mesh polishing",
        },
    })
