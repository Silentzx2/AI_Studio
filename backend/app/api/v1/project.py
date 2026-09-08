"""Project export endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import logging

import os
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Any, Literal
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, model_validator

from app.config import get_settings
from app.utils.response import success

router = APIRouter(tags=["Project"])
logger = logging.getLogger(__name__)
settings = get_settings()


class ExportRequest(BaseModel):
    modelUrl: str
    assetName: str | None = None
    format: str = "glb"  # glb, fbx, obj, stl, ply
    variant: Literal["source", "game_ready", "lod_package"] = "source"
    layers: list[dict[str, Any]] = []
    assembleAll: bool = False
    includeOriginals: bool = False
    includeTextures: bool = True
    includeLODs: bool = False
    includeCollision: bool = False
    includeQAReport: bool = True
    packageZip: bool = False
    targetPlatform: str | None = "generic"
    lodPreset: str | None = "medium"
    lodCount: int | None = 3

    @model_validator(mode="before")
    @classmethod
    def accept_snake_case_and_aliases(cls, data: object) -> object:
        if isinstance(data, dict):
            mapping = {
                "model_url": "modelUrl",
                "asset_name": "assetName",
                "package_zip": "packageZip",
                "include_originals": "includeOriginals",
                "include_textures": "includeTextures",
                "include_lods": "includeLODs",
                "include_collision": "includeCollision",
                "include_qa_report": "includeQAReport",
                "target_platform": "targetPlatform",
                "lod_preset": "lodPreset",
                "lod_count": "lodCount",
            }
            for k, v in mapping.items():
                if k in data and v not in data:
                    data[v] = data[k]
        return data


def _resolve_model_path(model_url: str) -> Path | None:
    """Resolve a /static/... URL or path to an absolute file path safely."""
    if not model_url:
        return None
    if ".." in model_url:
        return None

    storage_root = Path(settings.storage_local_path).resolve()
    parsed = urlparse(model_url)
    path_str = unquote(parsed.path if parsed.scheme else model_url)

    if "/static/" in path_str:
        rel = path_str.split("/static/", 1)[-1].lstrip("/")
        candidate = (storage_root / rel).resolve()
        if candidate.is_relative_to(storage_root) and candidate.exists():
            return candidate

    candidate = (storage_root / path_str.lstrip("/")).resolve()
    if candidate.is_relative_to(storage_root) and candidate.exists():
        return candidate

    # Search known storage subdirectories
    for folder in ("models", "exports", "uploads"):
        candidate = (storage_root / folder / Path(path_str).name).resolve()
        if candidate.is_relative_to(storage_root) and candidate.exists():
            return candidate
        matches = list((storage_root / folder).glob(f"*/{Path(path_str).name}"))
        if matches and matches[0].resolve().is_relative_to(storage_root):
            return matches[0].resolve()

    return None


@router.post("/export")
async def export_project(req: ExportRequest):
    """Export a 3D model asset in requested format, variant, and optional ZIP package.

    Supports:
      - Variants: 'source' (master asset), 'game_ready' (optimized), 'lod_package' (LOD cascade)
      - Formats: 'glb', 'fbx', 'obj', 'stl', 'ply'
      - Optional components: Collision hull, LODs, QA report
      - Packaging: Single file or structured ZIP archive
    """
    fmt = req.format.lower().lstrip(".")
    media_types = {
        "glb": "model/gltf-binary",
        "gltf": "model/gltf+json",
        "fbx": "application/octet-stream",
        "obj": "text/plain",
        "stl": "model/stl",
        "ply": "application/octet-stream",
    }
    if fmt not in media_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported export format '{fmt}'. Canonical formats supported: {list(media_types.keys())}",
        )
    media_type = media_types[fmt]

    model_path = _resolve_model_path(req.modelUrl)
    if not model_path:
        raise HTTPException(status_code=404, detail="Model file not found")

    job_dir = model_path.parent
    base_name = req.assetName or model_path.stem or "model"
    # Clean asset name of invalid filesystem characters
    clean_name = "".join(c for c in base_name if c.isalnum() or c in ("-", "_")).strip() or "model"

    export_id = uuid.uuid4().hex[:10]
    out_dir = Path(settings.storage_local_path) / "exports" / export_id
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Resolve variant asset
    target_model = model_path
    if req.variant == "source":
        source_candidate = job_dir / "source.glb"
        if source_candidate.exists():
            target_model = source_candidate
    elif req.variant == "game_ready":
        gr_candidate = job_dir / "game_ready.glb"
        if gr_candidate.exists():
            target_model = gr_candidate
        else:
            # Generate game-ready model on demand if not pre-generated
            try:
                from app.core.mesh_optimizer import get_target_polycount_for_platform, optimize_mesh
                budget = get_target_polycount_for_platform(req.targetPlatform)
                gr_out = str(out_dir / f"{clean_name}_game_ready.glb")
                opt_res = optimize_mesh(
                    input_path=str(model_path),
                    output_path=gr_out,
                    target_polycount=budget,
                )
                if opt_res.get("success") and Path(gr_out).exists():
                    target_model = Path(gr_out)
            except Exception as opt_err:
                logger.warning("On-demand game-ready optimization failed: %s", opt_err)

    exported_file: Path | None = None

    if fmt == "glb":
        exported_file = out_dir / f"{clean_name}.glb"
        shutil.copy(target_model, exported_file)
    elif fmt == "fbx":
        blender_bin = shutil.which(settings.blender_executable)
        if not blender_bin:
            raise HTTPException(status_code=500, detail="Headless Blender required for FBX export but not installed")
        from app.core.mesh_optimizer import _get_blender_env
        env = _get_blender_env(blender_bin)
        exported_file = out_dir / f"{clean_name}.fbx"
        script = f"""
import bpy, sys
try:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath={repr(str(target_model))})
    bpy.ops.export_scene.fbx(filepath={repr(str(exported_file))}, add_leaf_bones=False)
except Exception as e:
    print(f"FBX_EXPORT_ERROR: {{e}}", file=sys.stderr)
    sys.exit(1)
"""
        import subprocess
        proc = subprocess.run(
            [blender_bin, "-b", "--python-expr", script],
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if proc.returncode != 0 or not exported_file.exists() or exported_file.stat().st_size == 0:
            logger.error("Blender FBX export failed (code %d): %s", proc.returncode, proc.stderr)
            raise HTTPException(status_code=500, detail="FBX export conversion failed")
    elif fmt in ("gltf", "obj", "stl", "ply"):
        try:
            import trimesh
            mesh = trimesh.load(str(target_model))
            exported_file = out_dir / f"{clean_name}.{fmt}"
            mesh.export(str(exported_file), file_type=fmt)
        except Exception as conv_err:
            logger.warning("Trimesh format conversion to %s failed: %s", fmt, conv_err)
            raise HTTPException(status_code=500, detail=f"Failed to convert asset to {fmt.upper()}: {conv_err}")
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported export format: {fmt}")

    if not exported_file or not exported_file.exists():
        raise HTTPException(status_code=500, detail="Export failed: target file could not be generated")

    # 3. ZIP Archive Packaging if requested
    if req.packageZip:
        zip_filename = f"{clean_name}_export_package.zip"
        zip_path = out_dir / zip_filename

        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            # A. Main exported model
            zf.write(exported_file, arcname=f"{clean_name}/Model/{clean_name}.{fmt}")

            # B. Preserved Source master
            source_file = job_dir / "source.glb"
            if source_file.exists():
                zf.write(source_file, arcname=f"{clean_name}/Source/{clean_name}_source.glb")
            elif req.includeOriginals:
                zf.write(model_path, arcname=f"{clean_name}/Source/{model_path.name}")

            # C. Game-Ready Variant (if present)
            gr_file = job_dir / "game_ready.glb"
            if gr_file.exists():
                zf.write(gr_file, arcname=f"{clean_name}/GameReady/{clean_name}_game_ready.glb")

            # D. LOD cascade
            lods_dir = job_dir / "lods"
            if req.includeLODs or req.variant == "lod_package":
                if not lods_dir.exists():
                    try:
                        from app.core.mesh_optimizer import generate_lods
                        generate_lods(
                            input_path=str(target_model),
                            output_dir=str(out_dir / "lods"),
                            lod_count=req.lodCount or 3,
                            lod_preset=req.lodPreset or "medium",
                        )
                        lods_dir = out_dir / "lods"
                    except Exception as lod_err:
                        logger.warning("On-demand LOD generation in export failed: %s", lod_err)

                if lods_dir.exists():
                    for lod_file in sorted(lods_dir.glob("*.glb")):
                        zf.write(lod_file, arcname=f"{clean_name}/LODs/{lod_file.name}")

            # E. Collision Mesh
            collision_file = job_dir / "collision.glb"
            if req.includeCollision:
                if not collision_file.exists():
                    try:
                        from app.core.mesh_optimizer import generate_collision_mesh
                        col_target = out_dir / "collision.glb"
                        generate_collision_mesh(str(target_model), str(col_target))
                        collision_file = col_target
                    except Exception as col_err:
                        logger.warning("On-demand collision generation in export failed: %s", col_err)

                if collision_file.exists():
                    zf.write(collision_file, arcname=f"{clean_name}/Collision/{clean_name}_collision.glb")

            # F. Thumbnail / Preview
            thumb_file = job_dir / "thumbnail.png"
            if thumb_file.exists():
                zf.write(thumb_file, arcname=f"{clean_name}/Preview/thumbnail.png")

            # G. QA Report
            if req.includeQAReport:
                try:
                    from app.core.mesh_processor import run_mesh_diagnostics
                    report = run_mesh_diagnostics(str(target_model), target_platform=req.targetPlatform or "generic")
                    qa_json = out_dir / "quality_report.json"
                    qa_json.write_text(json.dumps(report, indent=2), encoding="utf-8")
                    zf.write(qa_json, arcname=f"{clean_name}/QA/quality_report.json")
                except Exception as qa_err:
                    logger.warning("QA report generation in export failed: %s", qa_err)

            # H. Export Metadata Manifest
            metadata_manifest = {
                "asset_name": clean_name,
                "exported_format": fmt,
                "variant": req.variant,
                "target_platform": req.targetPlatform or "generic",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "generator": "AI 3D Studio Production Export Engine",
            }
            meta_json = out_dir / "export_metadata.json"
            meta_json.write_text(json.dumps(metadata_manifest, indent=2), encoding="utf-8")
            zf.write(meta_json, arcname=f"{clean_name}/Metadata/export_metadata.json")

        return FileResponse(
            path=str(zip_path),
            filename=zip_filename,
            media_type="application/zip",
        )

    # 4. Return single file download
    return FileResponse(
        path=str(exported_file),
        filename=exported_file.name,
        media_type=media_type,
    )

