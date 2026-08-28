"""File upload endpoints.

NOTE on upload progress tracking:
This endpoint consumes the entire file body in one shot (await file.read()),
so the server cannot report byte-level progress mid-upload.  Real-time upload
progress bars must be implemented **client-side** using XMLHttpRequest (or
Axon onUploadProgress) which exposes the native browser progress event.
See the frontend upload service for the XHR-based implementation.
"""
from __future__ import annotations

import asyncio
import io
import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image

from app.config import get_settings
from app.core.mesh_processor import render_thumbnail
from app.utils.response import error, success

router = APIRouter(tags=["Upload"])
logger = logging.getLogger(__name__)
settings = get_settings()

SUPPORTED_FORMATS = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_MIME_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "model/gltf+binary": ".glb",
    "model/gltf+json": ".gltf",
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/image")
async def upload_image(file: UploadFile = File(...)):
    """Upload and process an image file.

    Validates format, size, MIME type, and returns dimensions for UI display.
    Stores file in local storage for reference during generation.
    """
    # Validate MIME type
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_MIME_TYPES:
        return JSONResponse(
            status_code=422,
            content=error(
                f"Unsupported MIME type: {content_type or '(none)'}. "
                f"Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES.keys()))}"
            )
        )

    # Validate file extension
    file_ext = Path(file.filename or "").suffix.lower()
    if file_ext not in SUPPORTED_FORMATS:
        return JSONResponse(
            status_code=422,
            content=error(
                f"Unsupported image format: {file_ext or '(none)'}. "
                f"Allowed: {', '.join(sorted(SUPPORTED_FORMATS))}"
            )
        )

    # Verify extension matches MIME type (jpeg accepts both .jpg and .jpeg)
    expected_ext = ALLOWED_MIME_TYPES[content_type]
    allowed_exts = {expected_ext}
    if content_type == "image/jpeg":
        allowed_exts = {".jpg", ".jpeg"}
    if file_ext not in allowed_exts:
        return JSONResponse(
            status_code=422,
            content=error(
                f"Extension/MIME mismatch: ext={file_ext}, content_type={content_type}. "
                f"Expected extension: {expected_ext}"
            )
        )

    try:
        # Read file content
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            return JSONResponse(
                status_code=413,
                content=error(f"File too large ({len(content) / 1024 / 1024:.1f} MB). Maximum: {MAX_FILE_SIZE // 1024 // 1024} MB")
            )

        if len(content) == 0:
            return JSONResponse(
                status_code=422,
                content=error("Empty file uploaded")
            )

        # Validate image and get dimensions
        try:
            image = Image.open(io.BytesIO(content))
            image.verify()  # Verify it's a valid image
            image = Image.open(io.BytesIO(content))  # Re-open after verify
            width, height = image.size

            # Validate image dimensions
            if width < 256 or height < 256:
                return JSONResponse(
                    status_code=422,
                    content=error("Image must be at least 256x256 pixels")
                )
            if width > 8192 or height > 8192:
                return JSONResponse(
                    status_code=422,
                    content=error("Image must not exceed 8192x8192 pixels")
                )
        except Exception as e:
            logger.warning(f"Invalid image file: {e}")
            return JSONResponse(
                status_code=422,
                content=error(f"Invalid image file: {e}")
            )

        # Generate unique filename
        unique_id = str(uuid.uuid4())
        stored_filename = f"upload_{unique_id}{file_ext}"
        upload_dir = Path(settings.storage_local_path) / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / stored_filename

        # Save file
        with open(file_path, "wb") as f:
            f.write(content)

        logger.info(f"Uploaded image: {stored_filename} ({width}x{height}, {len(content)} bytes)")

        return success(
            {
                "url": f"/api/v1/upload/uploads/{stored_filename}",
                "width": width,
                "height": height,
                "filename": stored_filename,
                "size_bytes": len(content),
            },
            "Image uploaded successfully"
        )

    except Exception as exc:
        logger.exception(f"Upload error: {exc}")
        return error(f"Upload failed: {exc}")


@router.post("/model")
async def upload_model(file: UploadFile = File(...)):  # noqa: C901
    """Upload a 3D model file (.glb, .gltf, .fbx, .obj, .stl)."""
    # Validate file type
    allowed_extensions = {'.glb', '.gltf', '.fbx', '.obj', '.stl'}
    ext = Path(file.filename or '').suffix.lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(allowed_extensions))}"
        )

    # Validate file size (max 100MB) and write in chunks to avoid loading entire file into memory
    max_size = 100 * 1024 * 1024
    models_dir = Path(settings.storage_local_path) / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    unique_name = f"{uuid.uuid4().hex[:12]}{ext}"
    file_path = models_dir / unique_name

    total_size = 0
    chunk_size = 1024 * 1024  # 1MB chunks
    with open(file_path, "wb") as f:
        while chunk := await file.read(chunk_size):
            total_size += len(chunk)
            if total_size > max_size:
                f.close()
                file_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail="File too large. Maximum size: 100MB"
                )
            f.write(chunk)

    if total_size == 0:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Empty file")

    # Validate GLB/GLTF file integrity
    if ext in {'.glb', '.gltf'}:
        try:
            from app.core.mesh_processor import validate_glb
            validation = validate_glb(str(file_path))
            if not validation.get("valid", False):
                logger.warning(
                    "GLB validation reported a problem for %s but upload will continue: %s",
                    unique_name,
                    validation.get("reason", "unknown validation issue"),
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning(f"GLB validation failed for {unique_name}: {exc}")
            # Don't block upload on validation error, just log

    # Generate thumbnail for GLB/GLTF files
    thumbnail_url = None
    if ext in {'.glb', '.gltf'}:
        try:
            thumbnails_dir = Path(settings.storage_local_path) / "thumbnails"
            thumbnails_dir.mkdir(parents=True, exist_ok=True)
            thumb_filename = f"{Path(unique_name).stem}.png"
            thumb_path = thumbnails_dir / thumb_filename
            
            # Run thumbnail generation in background thread to avoid blocking
            loop = asyncio.get_event_loop()
            rendered = await loop.run_in_executor(
                None,
                lambda: render_thumbnail(str(file_path), str(thumb_path))
            )
            if rendered:
                thumbnail_url = f"/static/thumbnails/{thumb_filename}"
        except Exception as exc:
            logger.warning(f"Thumbnail generation failed for {unique_name}: {exc}")

    # Extract mesh stats (polygon count, vertex count) for properties display
    mesh_stats = None
    try:
        from app.core.mesh_processor import get_mesh_stats
        stats = get_mesh_stats(str(file_path))
        if stats and (stats.get("polygon_count", 0) > 0 or stats.get("vertex_count", 0) > 0):
            mesh_stats = {
                "polygon_count": stats.get("polygon_count", 0),
                "vertex_count": stats.get("vertex_count", 0),
            }
    except Exception as exc:
        logger.warning(f"Mesh stats extraction failed for {unique_name}: {exc}")

    # Return URL
    url = f"/static/models/{unique_name}"

    logger.info(f"Uploaded model: {os.path.basename(file.filename or '')} -> {unique_name} ({total_size} bytes)")

    return success({
        "url": url,
        "filename": file.filename,
        "size": len(contents),
        "format": ext.lstrip('.'),
        "thumbnail_url": thumbnail_url,
        "mesh_stats": mesh_stats,
    })




@router.get("/assets")
async def list_uploaded_assets():
    """List all uploaded images and models from real local storage."""
    try:
        from datetime import datetime
        
        # 1. Image Uploads
        upload_dir = Path(settings.storage_local_path) / "uploads"
        images = []
        if upload_dir.exists():
            for f in upload_dir.iterdir():
                if f.is_file() and f.suffix.lower() in SUPPORTED_FORMATS:
                    stat = f.stat()
                    images.append({
                        "id": f.name,
                        "name": f.name,
                        "filename": f.name,
                        "url": f"/api/v1/upload/uploads/{f.name}",
                        "size": stat.st_size,
                        "format": f.suffix.lstrip('.'),
                        "type": "image",
                        "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })
        
        # Sort images by newest first
        images.sort(key=lambda x: x["created_at"], reverse=True)

        # 2. Model Uploads
        models_dir = Path(settings.storage_local_path) / "models"
        thumbnails_dir = Path(settings.storage_local_path) / "thumbnails"
        models = []
        if models_dir.exists():
            for f in models_dir.iterdir():
                if f.is_file() and f.suffix.lower() in {'.glb', '.gltf', '.fbx', '.obj', '.stl'}:
                    stat = f.stat()
                    # Check for existing thumbnail
                    thumbnail_url = None
                    if f.suffix.lower() in {'.glb', '.gltf'}:
                        thumb_name = f.stem + ".png"
                        thumb_path = thumbnails_dir / thumb_name
                        if thumb_path.exists():
                            thumbnail_url = f"/static/thumbnails/{thumb_name}"

                    # Extract mesh stats for properties display
                    mesh_stats = None
                    if f.suffix.lower() in {'.glb', '.gltf', '.obj', '.stl', '.ply'}:
                        try:
                            from app.core.mesh_processor import get_mesh_stats
                            stats = get_mesh_stats(str(f))
                            if stats and (stats.get("polygon_count", 0) > 0 or stats.get("vertex_count", 0) > 0):
                                mesh_stats = {
                                    "polygon_count": stats.get("polygon_count", 0),
                                    "vertex_count": stats.get("vertex_count", 0),
                                }
                        except Exception:
                            pass

                    models.append({
                        "id": f.name,
                        "name": f.name,
                        "filename": f.name,
                        "url": f"/static/models/{f.name}",
                        "size": stat.st_size,
                        "format": f.suffix.lstrip('.'),
                        "type": "model",
                        "thumbnail_url": thumbnail_url,
                        "mesh_stats": mesh_stats,
                        "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })
        
        # Sort models by newest first
        models.sort(key=lambda x: x["created_at"], reverse=True)

        return success({
            "images": images,
            "models": models,
            "total_images": len(images),
            "total_models": len(models)
        })
    except Exception as exc:
        logger.exception("Failed to list uploaded assets: %s", exc)
        return error(f"Failed to list uploaded assets: {exc}")


@router.get("/uploads/{filename}")
async def download_uploaded_image(filename: str):
    """Retrieve an uploaded image by filename."""
    try:
        upload_dir = Path(settings.storage_local_path) / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        upload_dir_real = upload_dir.resolve()

        file_path = (upload_dir / filename).resolve()

        # Security: prevent directory traversal - validate BEFORE any fs operation
        if not str(file_path).startswith(str(upload_dir_real) + "/") and file_path != upload_dir_real:
            raise HTTPException(status_code=403, detail="Access denied")

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        # Determine MIME type
        ext = file_path.suffix.lower()
        mime_types = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
        }
        media_type = mime_types.get(ext, "application/octet-stream")

        return FileResponse(file_path, media_type=media_type)

    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"Download error: {exc}")
        raise HTTPException(status_code=500, detail="Download failed")


@router.delete("/assets/{filename}")
async def delete_uploaded_asset(filename: str):
    """Delete an uploaded image or model file."""
    try:
        storage_dir = Path(settings.storage_local_path).resolve()

        # Check uploads dir (images)
        file_path = (Path(settings.storage_local_path) / "uploads" / filename).resolve()
        if not file_path.exists():
            # Check models dir (models)
            file_path = (Path(settings.storage_local_path) / "models" / filename).resolve()

        # Security: prevent directory traversal - validate BEFORE any fs operation
        if not str(file_path).startswith(str(storage_dir) + "/") and file_path != storage_dir:
            raise HTTPException(status_code=403, detail="Access denied")

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        file_path.unlink()
        return success({"deleted": True, "filename": filename})
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to delete asset: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
