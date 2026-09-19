"""Storage utilities for the new FastAPI backend."""

import logging
import os
from pathlib import Path
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class StorageManager:
    """Manages storage paths and operations."""

    def __init__(self):
        self.storage_root = Path(settings.storage_local_path).resolve()
        self.uploads_dir = self.storage_root / "uploads"
        self.models_dir = self.storage_root / "models"
        self.thumbnails_dir = self.storage_root / "thumbnails"
        self.exports_dir = self.storage_root / "exports"
        self.images_dir = self.storage_root / "images"

        # Create all directories
        for dir_path in [
            self.storage_root,
            self.uploads_dir,
            self.models_dir,
            self.thumbnails_dir,
            self.exports_dir,
            self.images_dir,
        ]:
            dir_path.mkdir(parents=True, exist_ok=True)

    def get_upload_path(self, filename: str) -> Path:
        """Get path for uploaded file."""
        return self.uploads_dir / filename

    def get_model_path(self, job_id: str, filename: str) -> Path:
        """Get path for model file."""
        job_dir = self.models_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        return job_dir / filename

    def get_thumbnail_path(self, job_id: str) -> Path:
        """Get path for thumbnail."""
        return self.thumbnails_dir / f"{job_id}.png"

    def get_export_path(self, export_id: str, filename: str) -> Path:
        """Get path for export."""
        export_dir = self.exports_dir / export_id
        export_dir.mkdir(parents=True, exist_ok=True)
        return export_dir / filename

    def get_static_url(self, file_path: Path) -> str:
        """Convert file path to static URL."""
        try:
            rel_path = file_path.relative_to(self.storage_root)
            return f"/static/{rel_path}"
        except ValueError:
            logger.warning(f"File {file_path} not under storage root")
            return ""

    def resolve_model_path(self, model_url: str) -> Path | None:
        """Resolve a /static/... URL to absolute file path."""
        if not model_url or ".." in model_url:
            return None

        from urllib.parse import unquote, urlparse

        parsed = urlparse(model_url)
        path_str = unquote(parsed.path if parsed.scheme else model_url)

        if "/static/" in path_str:
            rel = path_str.split("/static/", 1)[-1].lstrip("/")
            candidate = (self.storage_root / rel).resolve()
            if candidate.is_relative_to(self.storage_root) and candidate.exists():
                return candidate

        candidate = (self.storage_root / path_str.lstrip("/")).resolve()
        if candidate.is_relative_to(self.storage_root) and candidate.exists():
            return candidate

        # Search known storage subdirectories
        for folder in ("models", "exports", "uploads"):
            candidate = (self.storage_root / folder / Path(path_str).name).resolve()
            if candidate.is_relative_to(self.storage_root) and candidate.exists():
                return candidate
            matches = list((self.storage_root / folder).glob(f"*/{Path(path_str).name}"))
            if matches and matches[0].resolve().is_relative_to(self.storage_root):
                return matches[0].resolve()

        return None

    def cleanup_job_files(self, job_id: str):
        """Clean up files for a job."""
        import shutil

        job_model_dir = self.models_dir / job_id
        if job_model_dir.exists():
            shutil.rmtree(job_model_dir, ignore_errors=True)

        thumb_path = self.thumbnails_dir / f"{job_id}.png"
        if thumb_path.exists():
            thumb_path.unlink(missing_ok=True)

    def get_storage_info(self) -> dict[str, Any]:
        """Get storage usage information."""
        total_size = 0
        file_count = 0

        for root, dirs, files in os.walk(self.storage_root):
            for file in files:
                file_path = Path(root) / file
                try:
                    total_size += file_path.stat().st_size
                    file_count += 1
                except OSError:
                    pass

        # Get disk usage
        try:
            stat = os.statvfs(self.storage_root)
            total_space = stat.f_frsize * stat.f_blocks
            free_space = stat.f_frsize * stat.f_bavail
            used_space = total_space - free_space
        except OSError:
            total_space = free_space = used_space = 0

        return {
            "total_files": file_count,
            "total_size_bytes": total_size,
            "total_size_gb": round(total_size / (1024**3), 2),
            "disk_total_gb": round(total_space / (1024**3), 2),
            "disk_free_gb": round(free_space / (1024**3), 2),
            "disk_used_gb": round(used_space / (1024**3), 2),
        }


_storage_manager: "StorageManager | None" = None


def get_storage_manager() -> StorageManager:
    global _storage_manager
    if _storage_manager is None:
        _storage_manager = StorageManager()
    return _storage_manager