"""Download Manager for managing model downloads with queue, resume, and validation."""

from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.downloader.checksum_validator import ChecksumValidator
from app.core.downloader.chunk_manager import ChunkManager
from app.core.downloader.mirror_fallback import MirrorFallback
from app.models.registry import DownloadQueue


class DownloadManager:
    """Manages model downloads with queue, resume, and validation."""
    
    def __init__(self, db: Session, storage_path: str):
        self.db = db
        self.storage_path = Path(storage_path)
        self.chunk_manager = ChunkManager(str(self.storage_path))
        self.mirror_fallback = MirrorFallback()
        self.checksum_validator = ChecksumValidator()
    
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
        """Start new download and return download_id."""
        download_id = f"{model_id}_{datetime.utcnow().timestamp()}"
        
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
        
        download = DownloadQueue(
            id=download_id,
            model_id=model_id,
            model_name=model_name,
            url=url,
            filename=filename,
            file_path=str(self.storage_path / filename),
            total_bytes=total_size,
            status="pending",
            checksum=checksum,
            provider=provider
        )
        
        self.db.add(download)
        self.db.commit()
        
        return download_id
    
    async def execute_download(
        self,
        download_id: str,
        progress_callback: Callable | None = None
    ) -> bool:
        """Execute queued download with progress tracking."""
        
        download = self.db.query(DownloadQueue).filter_by(id=download_id).first()
        if not download:
            return False
        
        try:
            # Update status to downloading
            download.status = "downloading"
            download.started_at = datetime.utcnow()
            self.db.commit()
            
            output_path = Path(download.file_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Try primary URL with fallback mirrors
            working_url = await self.mirror_fallback.find_working_url(
                download.url,
                self.mirror_fallback.get_mirrors_for_url(download.url)
            )
            
            if not working_url:
                download.status = "failed"
                download.error_message = "No working URL available"
                self.db.commit()
                return False
            
            # Wrap progress callback to also update DB
            original_cb = progress_callback
            def db_updating_cb(progress: dict):
                # Update bytes_downloaded in DB so polling reflects real progress
                try:
                    downloaded = progress.get("downloaded", 0)
                    total = progress.get("total", 0)
                    download.bytes_downloaded = downloaded
                    if total and total > 0:
                        download.total_bytes = total
                    self.db.commit()
                except Exception:
                    pass
                if original_cb:
                    # Run original callback in a way that handles both sync and async
                    import asyncio
                    try:
                        loop = asyncio.get_running_loop()
                        loop.create_task(original_cb(progress))
                    except RuntimeError:
                        pass
            
            # Download with resume capability
            success = await self.chunk_manager.download_with_resume(
                working_url,
                output_path,
                download.total_bytes,
                db_updating_cb
            )
            
            if not success:
                download.retry_count += 1
                if download.retry_count < 3:
                    download.status = "pending"
                    download.error_message = "Download interrupted, will retry..."
                else:
                    download.status = "failed"
                    download.error_message = "Max retries exceeded"
                self.db.commit()
                return False
            
            # Validate checksum if provided
            if download.checksum:
                is_valid, actual = await self.checksum_validator.verify_checksum(
                    output_path,
                    download.checksum
                )
                
                if not is_valid:
                    # Clean up invalid file
                    if output_path.exists():
                        output_path.unlink()
                    
                    download.status = "failed"
                    download.error_message = (
                        f"Checksum mismatch. Expected: {download.checksum}, Got: {actual}"
                    )
                    self.db.commit()
                    return False
            
            # Mark as completed
            download.status = "completed"
            download.completed_at = datetime.utcnow()
            download.bytes_downloaded = download.total_bytes
            self.db.commit()
            
            return True
            
        except Exception as e:
            download.status = "failed"
            download.error_message = str(e)
            self.db.commit()
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
            
            # Cleanup partial file
            path = Path(download.file_path)
            if path.exists():
                path.unlink()
            
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
