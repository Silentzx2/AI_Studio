"""Project export endpoints."""
from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.utils.response import success

router = APIRouter(tags=["Project"])
logger = logging.getLogger(__name__)
settings = get_settings()


class ExportRequest(BaseModel):
    modelUrl: str
    format: str = "glb"
    layers: list[dict[str, Any]] = []
    assembleAll: bool = False
    includeOriginals: bool = False


def _resolve_model_path(model_url: str) -> Path | None:
    """Resolve a /static/... URL to an absolute file path."""
    if not model_url:
        return None
    rel = model_url.replace("/static/", "", 1)
    p = Path(settings.storage_local_path) / rel
    return p if p.exists() else None


@router.post("/export")
async def export_project(req: ExportRequest):
    """Export a model respecting the current layer toggle state.

    Layers with `enabled=False` are stripped from the export:
      - texture=False → export without materials/textures
      - rigging=False → export without armature
      - animation=False → export without animations
      - lod=False → export without LOD groups

    For formats other than GLB, the original provider download URL is
    returned so the frontend can fall back to the pre-processed asset.
    """
    model_path = _resolve_model_path(req.modelUrl)
    if not model_path:
        raise HTTPException(status_code=404, detail="Model file not found")

    layer_map: dict[str, dict[str, Any]] = {l.get("type"): l for l in req.layers}

    auto_rig = layer_map.get("rigging", {}).get("enabled", False)
    generate_texture = layer_map.get("texture", {}).get("enabled", False)
    include_animations = layer_map.get("animation", {}).get("enabled", False)
    include_lod = layer_map.get("lod", {}).get("enabled", False)

    if req.format != "glb" or not settings.blender_enabled:
        return success({
            "url": req.modelUrl,
            "format": req.format,
            "layers_applied": [l.get("type") for l in req.layers if l.get("enabled")],
        })

    try:
        from app.core.blender.pipeline import process_model
        import uuid as uuid_mod

        job_id = uuid_mod.uuid4().hex[:12]
        out_dir = Path(settings.storage_local_path) / "exports" / job_id
        out_dir.mkdir(parents=True, exist_ok=True)

        result = await process_model(
            input_path=str(model_path),
            output_dir=str(out_dir),
            auto_rig=auto_rig and include_animations,
            generate_texture=generate_texture,
            quality="standard",
        )

        glb_path = result.get("glb")
        if not glb_path or not Path(glb_path).exists():
            raise HTTPException(status_code=500, detail="Export failed: no GLB produced")

        public_name = f"export_{job_id}.glb"
        public_path = Path(settings.storage_local_path) / public_name
        shutil.copy2(glb_path, public_path)

        return success({
            "url": f"/static/{public_name}",
            "format": "glb",
            "layers_applied": [l.get("type") for l in req.layers if l.get("enabled")],
        })

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Project export failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}")
