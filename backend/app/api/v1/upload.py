"""Upload endpoints for assets, models, and reference images."""

import logging
import os
import shutil
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from app.config import get_settings
from app.core import get_storage_manager

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


@router.post("/image")
async def upload_image(file: UploadFile = File(...)):
    """Upload a reference image."""
    try:
        storage = get_storage_manager()
        uploads_dir = Path(storage.storage_root) / "uploads"
        uploads_dir.mkdir(parents=True, exist_ok=True)

        clean_name = f"upload_{int(time.time())}_{file.filename}"
        dest_path = uploads_dir / clean_name

        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {
            "success": True,
            "data": {
                "url": f"/static/uploads/{clean_name}",
                "filename": clean_name,
                "size_bytes": dest_path.stat().st_size,
            },
        }
    except Exception as exc:
        logger.error("Failed to upload image: %s", exc)
        raise HTTPException(status_code=500, detail=f"Image upload failed: {exc}")


@router.post("/model")
async def upload_model(file: UploadFile = File(...)):
    """Upload a 3D model asset."""
    try:
        storage = get_storage_manager()
        models_dir = Path(storage.storage_root) / "models"
        models_dir.mkdir(parents=True, exist_ok=True)

        clean_name = f"{int(time.time())}_{file.filename}"
        dest_path = models_dir / clean_name

        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        ext = Path(file.filename).suffix.lower().replace(".", "")

        return {
            "success": True,
            "data": {
                "id": clean_name,
                "url": f"/static/models/{clean_name}",
                "filename": file.filename,
                "stored_filename": clean_name,
                "size": dest_path.stat().st_size,
                "format": ext,
            },
        }
    except Exception as exc:
        logger.error("Failed to upload model: %s", exc)
        raise HTTPException(status_code=500, detail=f"Model upload failed: {exc}")


@router.get("/assets")
async def list_assets():
    """List uploaded assets."""
    storage = get_storage_manager()
    models_dir = Path(storage.storage_root) / "models"
    uploads_dir = Path(storage.storage_root) / "uploads"

    models = []
    if models_dir.exists():
        for p in models_dir.glob("*.glb"):
            models.append({
                "id": p.name,
                "name": p.stem,
                "filename": p.name,
                "url": f"/static/models/{p.name}",
                "size": p.stat().st_size,
                "format": "GLB",
                "type": "model",
            })

    images = []
    if uploads_dir.exists():
        for p in uploads_dir.glob("*.*"):
            if p.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]:
                images.append({
                    "id": p.name,
                    "name": p.name,
                    "filename": p.name,
                    "url": f"/static/uploads/{p.name}",
                    "size": p.stat().st_size,
                    "format": p.suffix.upper().replace(".", ""),
                    "type": "image",
                })

    return {
        "success": True,
        "data": {
            "images": images,
            "models": models,
            "total_images": len(images),
            "total_models": len(models),
        },
    }
