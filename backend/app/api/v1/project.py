"""Project export endpoints."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import logging

import os
import shutil
import uuid
from pathlib import Path
from typing import Any, Literal
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator

from app.config import get_settings
from app.utils.response import success

router = APIRouter(tags=["Project"])
logger = logging.getLogger(__name__)
settings = get_settings()


class ExportRequest(BaseModel):
    modelUrl: str
    assetName: str | None = None
    format: str = "glb"  # glb, gltf, fbx, obj, stl, ply
    variant: Literal["active", "source", "game_ready", "lod_package"] = "active"
    layers: list[dict[str, Any]] = Field(default_factory=list)
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

def _glb_to_embedded_gltf(glb_bytes: bytes) -> str:
    """Convert binary GLB to self-contained JSON glTF with embedded base64 buffer.

    Pure-Python spec-compliant implementation avoids headless Blender GLTF_EMBEDDED
    operator deprecation in Blender 4.x and guarantees zero missing external .bin sidecars.
    """
    import base64
    import json
    import struct

    if len(glb_bytes) < 12:
        raise ValueError("Invalid GLB: file too short")
    magic, version, total_len = struct.unpack_from("<4sII", glb_bytes, 0)
    if magic != b"glTF":
        raise ValueError("Invalid GLB: magic header mismatch")

    offset = 12
    json_data = None
    bin_data = None
    while offset < len(glb_bytes):
        chunk_len, chunk_type = struct.unpack_from("<I4s", glb_bytes, offset)
        offset += 8
        chunk_data = glb_bytes[offset:offset + chunk_len]
        offset += chunk_len
        if chunk_type == b"JSON":
            json_data = json.loads(chunk_data.decode("utf-8"))
        elif chunk_type in (b"BIN\x00", b"BIN"):
            bin_data = chunk_data

    if json_data is None:
        raise ValueError("Invalid GLB: no JSON chunk found")

    if bin_data is not None and "buffers" in json_data and json_data["buffers"]:
        b64 = base64.b64encode(bin_data).decode("ascii")
        json_data["buffers"][0]["uri"] = f"data:application/octet-stream;base64,{b64}"

    return json.dumps(json_data, indent=2)


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
    job_id = job_dir.name
    base_name = req.assetName or model_path.stem or "model"
    # Clean asset name of invalid filesystem characters
    clean_name = "".join(c for c in base_name if c.isalnum() or c in ("-", "_")).strip() or "model"

    if req.packageZip:
        from fastapi.responses import JSONResponse
        from app.core.post_processing.export_packager import get_package_status, compute_package_spec_hash
        spec = {"job_id": job_id, "variant": req.variant, "format": req.format,
                "include_lods": req.includeLODs}
        spec_hash = compute_package_spec_hash(spec)
        storage_root = Path(settings.storage_local_path)
        status = get_package_status(job_id, spec_hash, storage_root)
        if status["status"] == "ready":
            return JSONResponse({"status": "ready", "url": status["url"], "spec_hash": spec_hash})
        else:
            return JSONResponse(
                {"status": status["status"], "spec_hash": spec_hash, "message": "Package not yet ready; check again or trigger packaging."},
                status_code=202
            )

    export_id = uuid.uuid4().hex[:10]
    out_dir = Path(settings.storage_local_path) / "exports" / export_id
    out_dir.mkdir(parents=True, exist_ok=True)

    def _do_export() -> tuple[Path, str, str]:
        # 1. Resolve variant asset
        target_model = model_path
        if req.variant == "active":
            gr_candidate = job_dir / "game_ready.glb"
            if gr_candidate.exists() and model_path.name in ("model.glb", "source.glb"):
                target_model = gr_candidate
            else:
                target_model = model_path
        elif req.variant == "source":
            source_candidate = job_dir / "source.glb"
            if source_candidate.exists():
                target_model = source_candidate
            else:
                target_model = model_path
        elif req.variant == "game_ready":
            gr_candidate = job_dir / "game_ready.glb"
            if gr_candidate.exists():
                target_model = gr_candidate
            elif model_path.name == "game_ready.glb":
                target_model = model_path
            else:
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
        elif req.variant == "lod_package":
            if not req.packageZip:
                raise HTTPException(status_code=400, detail="variant='lod_package' requires packageZip=true")
            lod0 = job_dir / "lods" / "lod0.glb"
            if lod0.exists():
                target_model = lod0
            else:
                target_model = model_path

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
        elif fmt == "gltf":
            exported_file = out_dir / f"{clean_name}.gltf"
            try:
                glb_bytes = target_model.read_bytes()
                gltf_content = _glb_to_embedded_gltf(glb_bytes)
                exported_file.write_text(gltf_content, encoding="utf-8")
            except Exception as exc:
                logger.error("GLTF export conversion failed: %s", exc)
                raise HTTPException(status_code=500, detail=f"GLTF export conversion failed: {exc}")
        elif fmt in ("obj", "stl", "ply"):
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

        return exported_file, exported_file.name, media_types[fmt]

    result_path, download_filename, res_media_type = await asyncio.to_thread(_do_export)

    return FileResponse(
        path=str(result_path),
        filename=download_filename,
        media_type=res_media_type,
    )
