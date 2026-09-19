"""Project export endpoints."""

import logging
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import get_settings
from app.core import get_storage_manager
from app.schemas import ProjectExportRequest, SuccessResponse

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


def _resolve_model_path(model_url: str) -> Path | None:
    """Resolve a /static/... URL or path to an absolute file path safely."""
    if not model_url or ".." in model_url:
        return None

    storage = get_storage_manager()
    parsed = urlparse(model_url)
    path_str = unquote(parsed.path if parsed.scheme else model_url)

    if "/static/" in path_str:
        rel = path_str.split("/static/", 1)[-1].lstrip("/")
        candidate = (Path(settings.storage_local_path) / rel).resolve()
        if candidate.is_relative_to(Path(settings.storage_local_path)) and candidate.exists():
            return candidate

    candidate = (Path(settings.storage_local_path) / path_str.lstrip("/")).resolve()
    if candidate.is_relative_to(Path(settings.storage_local_path)) and candidate.exists():
        return candidate

    # Search known storage subdirectories
    for folder in ("models", "exports", "uploads"):
        candidate = (Path(settings.storage_local_path) / folder / Path(path_str).name).resolve()
        if candidate.is_relative_to(Path(settings.storage_local_path)) and candidate.exists():
            return candidate
        matches = list((Path(settings.storage_local_path) / folder).glob(f"*/{Path(path_str).name}"))
        if matches and matches[0].resolve().is_relative_to(Path(settings.storage_local_path)):
            return matches[0].resolve()

    return None


def _glb_to_embedded_gltf(glb_bytes: bytes) -> str:
    """Convert binary GLB to self-contained JSON glTF with embedded base64 buffer."""
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
async def export_project(req: ProjectExportRequest):
    """Export a 3D model asset in requested format, variant, and optional ZIP package."""
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
            detail=f"Unsupported export format '{fmt}'. Supported: {list(media_types.keys())}",
        )

    model_path = _resolve_model_path(req.modelUrl)
    if not model_path:
        raise HTTPException(status_code=404, detail="Model file not found")

    job_dir = model_path.parent
    base_name = req.assetName or model_path.stem or "model"
    clean_name = "".join(c for c in base_name if c.isalnum() or c in ("-", "_")).strip() or "model"

    export_id = uuid.uuid4().hex[:10]
    out_dir = Path(settings.storage_local_path) / "exports" / export_id
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        target_model = model_path
        if req.variant == "active":
            gr_candidate = job_dir / "game_ready.glb"
            if gr_candidate.exists() and model_path.name in ("model.glb", "source.glb"):
                target_model = gr_candidate
        elif req.variant == "source":
            source_candidate = job_dir / "source.glb"
            if source_candidate.exists():
                target_model = source_candidate
        elif req.variant == "game_ready":
            gr_candidate = job_dir / "game_ready.glb"
            if gr_candidate.exists():
                target_model = gr_candidate
            elif model_path.name == "game_ready.glb":
                target_model = model_path

        exported_file = None

        if fmt == "glb":
            exported_file = out_dir / f"{clean_name}.glb"
            import shutil
            shutil.copy(target_model, exported_file)
        elif fmt == "gltf":
            exported_file = out_dir / f"{clean_name}.gltf"
            glb_bytes = target_model.read_bytes()
            gltf_content = _glb_to_embedded_gltf(glb_bytes)
            exported_file.write_text(gltf_content, encoding="utf-8")
        elif fmt in ("obj", "stl", "ply"):
            try:
                import trimesh
                mesh = trimesh.load(str(target_model))
                exported_file = out_dir / f"{clean_name}.{fmt}"
                mesh.export(str(exported_file), file_type=fmt)
            except Exception as conv_err:
                logger.warning(f"Trimesh format conversion to {fmt} failed: {conv_err}")
                raise HTTPException(status_code=500, detail=f"Failed to convert asset to {fmt.upper()}: {conv_err}")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {fmt}")

        if not exported_file or not exported_file.exists():
            raise HTTPException(status_code=500, detail="Export failed: target file could not be generated")

        if req.packageZip:
            zip_filename = f"{clean_name}_export_package.zip"
            zip_path = out_dir / zip_filename
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.write(exported_file, arcname=f"{clean_name}/Model/{clean_name}.{fmt}")

                source_file = job_dir / "source.glb"
                if source_file.exists():
                    zf.write(source_file, arcname=f"{clean_name}/Source/{clean_name}_source.glb")

                gr_file = job_dir / "game_ready.glb"
                if gr_file.exists():
                    zf.write(gr_file, arcname=f"{clean_name}/GameReady/{clean_name}_game_ready.glb")

                thumb_file = job_dir / "thumbnail.png"
                if thumb_file.exists():
                    zf.write(thumb_file, arcname=f"{clean_name}/Preview/thumbnail.png")

            return FileResponse(
                path=str(zip_path),
                filename=zip_filename,
                media_type="application/zip",
            )

        return FileResponse(
            path=str(exported_file),
            filename=exported_file.name,
            media_type=media_types[fmt],
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Export failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}")