"""Download Manager for managing model downloads with queue, resume, and validation.

Weight storage contract: all downloads target the canonical per-model location
(third_party/<repo>/weights/) via storage.get_model_weights_dir(repo).
No fallback to legacy third_party/weights/ for new downloads.
"""

import asyncio
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.download_manager.downloader import SmartDownloader
from app.core.downloader.mirror_fallback import MirrorFallback
from app.models.registry import DownloadQueue

_DB_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="download-db")


class DownloadManager:
    """Manages model downloads with queue, resume, and validation."""

    def __init__(self, db: Session, storage_path: str = None):
        from runtime.storage import get_storage_config
        self.db = db
        storage = get_storage_config()
        self.storage_path = Path(storage_path) if storage_path else storage.storage_dir
        self.smart_downloader = SmartDownloader()
        self.mirror_fallback = MirrorFallback()

    async def start_download(
        self,
        model_id: str,
        model_name: str,
        url: str,
        filename: str,
        total_size: int,
        checksum: str | None = None,
        provider: str = "direct"
    ) -> str:
        """Start new download and return download_id.

        Destination always resolves to the canonical per-model weights directory.
        """
        download_id = str(uuid.uuid4())

        # Check if already downloading this model
        existing = (
            self.db.query(DownloadQueue)
            .filter_by(model_id=model_id)
            .filter(DownloadQueue.status.in_([
                "pending",
                "downloading",
                "paused"
            ]))
            .first()
        )

        if existing:
            return str(existing.id)

        from runtime.storage import get_storage_config

        storage = get_storage_config()
        try:
            from runtime.manifest_loader import get_provider_metadata
            meta = get_provider_metadata(model_id)
            repo = meta.get("repo")
        except Exception:
            repo = None

        # Canonical per-model weights directory (third_party/<repo>/weights/)
        if repo:
            target_dir = storage.get_model_weights_dir(repo)
        else:
            target_dir = storage.storage_dir / "models"

        # Sanitize filename to prevent directory traversal
        from pathlib import Path
        clean_filename = Path(filename).name
        if not clean_filename or clean_filename in (".", ".."):
            raise ValueError(f"Invalid download filename: {filename}")

        target_dir.mkdir(parents=True, exist_ok=True)
        resolved_target_dir = target_dir.resolve()
        dest_path = (resolved_target_dir / clean_filename).resolve()
        if not dest_path.is_relative_to(resolved_target_dir):
            raise ValueError(f"Filename escapes target directory: {filename}")
        file_path = str(dest_path)
        
        download = DownloadQueue(
            id=download_id,
            model_id=model_id,
            model_name=model_name,
            url=url,
            filename=clean_filename,
            file_path=file_path,
            total_bytes=total_size,
            status="pending",
            checksum=checksum,
            provider=provider
        )
        
        self.db.add(download)
        self.db.commit()
        
        return download_id
    
    async def _run_db(self, fn):
        """Run a sync DB operation in a thread pool executor."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(_DB_EXECUTOR, fn)

    async def execute_download(
        self,
        download_id: str,
        progress_callback: Callable | None = None
    ) -> bool:
        """Execute queued download with progress tracking."""
        
        download = await self._run_db(lambda: self.db.query(DownloadQueue).filter_by(id=download_id).first())
        if not download:
            return False
        
        try:
            # Update status to downloading
            download.status = "downloading"
            download.started_at = datetime.now(timezone.utc).replace(tzinfo=None)
            await self._run_db(self.db.commit)
            
            output_path = Path(download.file_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            mirrors = self.mirror_fallback.get_mirrors_for_url(download.url)
            
            # Wrap progress callback to also update DB
            original_cb = progress_callback
            def db_updating_cb(progress):
                try:
                    download.bytes_downloaded = progress.downloaded
                    if progress.total_size and progress.total_size > 0:
                        download.total_bytes = progress.total_size
                    self._run_db(self.db.commit)
                except Exception:
                    pass
                if original_cb:
                    try:
                        loop = asyncio.get_running_loop()
                        prog_dict = {
                            "downloaded": progress.downloaded,
                            "total": progress.total_size,
                            "percent": progress.percentage
                        }
                        loop.create_task(original_cb(prog_dict))
                    except RuntimeError:
                        pass
            
            # Download with resume, retry, checksum and mirrors capability
            success = await self.smart_downloader.download_file(
                url=download.url,
                destination=output_path,
                checksum=download.checksum,
                mirrors=mirrors,
                progress_callback=db_updating_cb
            )
            
            if not success:
                download.retry_count += 1
                if download.retry_count < 3:
                    download.status = "pending"
                    download.error_message = "Download interrupted, will retry..."
                else:
                    download.status = "failed"
                    download.error_message = "Max retries exceeded or checksum mismatch"
                await self._run_db(self.db.commit)
                return False
            
            # Mark as completed
            download.status = "completed"
            download.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            download.bytes_downloaded = download.total_bytes
            await self._run_db(self.db.commit)
            
            return True
            
        except Exception as e:
            download.status = "failed"
            download.error_message = str(e)
            await self._run_db(self.db.commit)
            return False
    
    async def pause_download(self, download_id: str) -> bool:
        """Pause active download."""
        download = self.db.query(DownloadQueue).filter_by(id=download_id).first()
        if download and download.status == "downloading":
            download.status = "paused"
            self.db.commit()
            return True
        return False
    
    async def resume_download(self, download_id: str) -> bool:
        """Resume paused download."""
        download = self.db.query(DownloadQueue).filter_by(id=download_id).first()
        if download and download.status == "paused":
            download.status = "pending"
            self.db.commit()
            return True
        return False
    
    async def cancel_download(self, download_id: str) -> bool:
        """Cancel download and cleanup partial files."""
        download = self.db.query(DownloadQueue).filter_by(id=download_id).first()
        if download:
            download.status = "cancelled"
            
            # Cleanup partial file and any temp files
            path = Path(download.file_path)
            for p in [path, path.with_suffix(path.suffix + ".part"), path.with_suffix(path.suffix + ".tmp")]:
                if p.exists():
                    p.unlink()
            
            self.db.commit()
            return True
        return False
    
    def get_queue(self, status: str | None = None) -> list[dict[str, Any]]:
        """Get download queue, optionally filtered by status."""
        query = self.db.query(DownloadQueue)
        
        if status:
            query = query.filter_by(status=status)
        
        # Bug 6a fix: use DownloadQueue.created_at, NOT DownloadStatus.created_at
        query = query.order_by(DownloadQueue.priority.desc(), DownloadQueue.created_at.asc())
        
        return [d.to_dict() for d in query.all()]
    
    def get_download(self, download_id: str) -> dict[str, Any] | None:
        """Get specific download status by ID."""
        download = self.db.query(DownloadQueue).filter_by(id=download_id).first()
        return download.to_dict() if download else None
    
    def get_downloads_by_model(self, model_id: str) -> list[dict[str, Any]]:
        """Get all downloads for a specific model."""
        # Bug 6a fix: use DownloadQueue.created_at, NOT DownloadStatus.created_at
        downloads = (
            self.db.query(DownloadQueue)
            .filter_by(model_id=model_id)
            .order_by(DownloadQueue.created_at.desc())
            .all()
        )
        return [d.to_dict() for d in downloads]
    
    def get_active_downloads(self) -> list[dict[str, Any]]:
        """Get currently active (pending/downloading/paused) downloads."""
        active_statuses = ["pending", "downloading", "paused"]
        # Bug 6a fix: use DownloadQueue.status, NOT DownloadStatus.status
        downloads = (
            self.db.query(DownloadQueue)
            .filter(DownloadQueue.status.in_(active_statuses))
            .all()
        )
        return [d.to_dict() for d in downloads]
    
    def clear_completed(self) -> int:
        """Clear completed downloads from queue. Returns count cleared."""
        # Bug 6a fix: use DownloadQueue.status, NOT DownloadStatus.status
        completed = (
            self.db.query(DownloadQueue)
            .filter(DownloadQueue.status.in_([
                "completed",
                "cancelled",
                "failed"
            ]))
            .all()
        )
        
        count = len(completed)
        for download in completed:
            self.db.delete(download)
        
        self.db.commit()
        return count
    
    def get_statistics(self) -> dict[str, Any]:
        """Get download statistics."""
        from sqlalchemy import func
        
        stats = {}
        
        # Count by status
        status_counts = (
            self.db.query(
                DownloadQueue.status,
                func.count(DownloadQueue.id)
            )
            .group_by(DownloadQueue.status)
            .all()
        )
        
        stats["by_status"] = {status: count for status, count in status_counts}
        
        # Total downloaded size
        total_downloaded = (
            self.db.query(func.sum(DownloadQueue.bytes_downloaded))
            .filter(DownloadQueue.status == "completed")
            .scalar()
        ) or 0
        
        stats["total_downloaded_bytes"] = total_downloaded
        stats["total_downloaded_mb"] = round(total_downloaded / (1024 * 1024), 2)
        
        # Average download speed (simplified)
        completed_downloads = (
            self.db.query(DownloadQueue)
            .filter(DownloadQueue.status == "completed")
            .filter(DownloadQueue.completed_at != None)
            .filter(DownloadQueue.started_at != None)
            .all()
        )
        
        stats["avg_speed_mb_per_sec"] = 0
        if completed_downloads:
            total_time = sum(
                (d.completed_at - d.started_at).total_seconds()
                for d in completed_downloads
            )
            total_size = sum(d.total_bytes or 0 for d in completed_downloads)
            
            if total_time > 0:
                stats["avg_speed_mb_per_sec"] = round(
                    (total_size / (1024 * 1024)) / total_time, 2
                )
        
        return stats
