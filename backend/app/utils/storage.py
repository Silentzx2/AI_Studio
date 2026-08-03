import uuid
from pathlib import Path

import aiofiles
from fastapi import UploadFile

from app.config import get_settings

settings = get_settings()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/tiff"}
MAX_IMAGE_BYTES = 20 * 1024 * 1024  # 20 MB


def _local_root() -> Path:
    path = Path(settings.storage_local_path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _public_url(relative: str) -> str:
    return f"/static/{relative}"


async def save_upload(upload: UploadFile, subfolder: str = "uploads") -> dict:
    if upload.content_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError(f"Unsupported content type: {upload.content_type}")

    data = await upload.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("File exceeds 20 MB limit")

    ext = Path(upload.filename or "image.jpg").suffix.lower() or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest_dir = _local_root() / subfolder
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename

    async with aiofiles.open(dest, "wb") as f:
        await f.write(data)

    return {
        "path": str(dest),
        "url": _public_url(f"{subfolder}/{filename}"),
        "size": len(data),
        "content_type": upload.content_type,
    }


def model_output_dir(job_id: str) -> Path:
    path = _local_root() / "models" / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def model_public_url(job_id: str, filename: str) -> str:
    return _public_url(f"models/{job_id}/{filename}")
