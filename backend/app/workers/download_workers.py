import asyncio
import logging
from collections.abc import Callable

from celery import shared_task

from app.core.managers.download_manager import DownloadManager
from app.database import SessionLocal

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def execute_download(self, download_id: str):
    """Execute a download task with retry on failure."""
    from app.core.managers.download_manager import DownloadManager
    from app.database import SessionLocal
    
    try:
        db = SessionLocal()
        manager = DownloadManager(db, "./storage")

        async def progress_callback(progress: float):
            """Update bytes_downloaded in DB so frontend polling shows real progress."""
            try:
                data = progress if isinstance(progress, dict) else {"downloaded": 0, "total": 0, "percent": progress}
                downloaded = data.get("downloaded", 0)
                total = data.get("total", 0)
                from app.models.registry import DownloadQueue
                dl = db.query(DownloadQueue).filter_by(id=download_id).first()
                if dl:
                    dl.bytes_downloaded = downloaded
                    if total and total > 0:
                        dl.total_bytes = total
                    db.commit()
            except Exception as e:
                logger.debug("Progress update for %s failed: %s", download_id, e)

        # Run the async download function
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            result = loop.run_until_complete(
                manager.execute_download(download_id, progress_callback)
            )

            if result:
                logger.info(f"Download {download_id} completed successfully")
                return {
                    "success": True,
                    "message": f"Download {download_id} completed",
                    "download_id": download_id
                }
            else:
                # Bug 1 fix: use canonical model from app.models.registry
                from app.models.registry import DownloadQueue
                download = db.query(DownloadQueue).filter_by(id=download_id).first()

                if download and download.retry_count < 3:
                    raise Exception(f"Download failed, retrying ({download.retry_count}/3)")
                else:
                    return {
                        "success": False,
                        "message": f"Download {download_id} failed after all retries",
                        "download_id": download_id
                    }
        finally:
            loop.close()

    except Exception as exc:
        logger.error(f"Download task error for {download_id}: {exc}")
        raise self.retry(exc=exc)

    finally:
        db.close()


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=120,
    autoretry_for=(Exception,)
)
def execute_download_with_url(
    self,
    model_id: str,
    model_name: str,
    url: str,
    filename: str,
    total_size: int,
    checksum: str | None = None,
    provider: str = "direct"
):
    """Start and execute a download in one task."""
    db = SessionLocal()
    
    try:
        manager = DownloadManager(db, "./storage")
        
        # Start the download first
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            download_id = loop.run_until_complete(
                manager.start_download(
                    model_id=model_id,
                    model_name=model_name,
                    url=url,
                    filename=filename,
                    total_size=total_size,
                    checksum=checksum,
                    provider=provider
                )
            )
            
            # Now execute it
            result = loop.run_until_complete(
                manager.execute_download(download_id)
            )
            
            if result:
                logger.info(f"Download & execute complete for {model_id}")
                return {"success": True, "download_id": download_id}
            else:
                raise Exception("Download execution failed")
                
        finally:
            loop.close()
    
    except Exception as exc:
        logger.error(f"Download with URL error: {exc}")
        raise self.retry(exc=exc)
    
    finally:
        db.close()


@shared_task
def start_queued_downloads():
    """Process all pending downloads in queue."""
    db = SessionLocal()
    
    try:
        manager = DownloadManager(db, "./storage")
        queue = manager.get_queue()
        
        started = 0
        errors = []
        
        for download_info in queue:
            if download_info["status"] == "pending":
                try:
                    # Dispatch to worker
                    execute_download.delay(download_info["id"])
                    started += 1
                except Exception as e:
                    errors.append(str(e))
        
        logger.info(f"Started {started} downloads from queue")
        
        return {
            "started": started,
            "errors": len(errors),
            "error_details": errors[:5]  # Limit error details
        }
    
    except Exception as e:
        logger.error(f"Error processing download queue: {e}")
        return {"error": str(e), "started": 0}
    
    finally:
        db.close()


@shared_task
def pause_download(download_id: str):
    """Pause an active download."""
    db = SessionLocal()
    
    try:
        manager = DownloadManager(db, "./storage")
        loop = asyncio.new_event_loop()
        
        try:
            result = loop.run_until_complete(manager.pause_download(download_id))
            return {"success": result, "download_id": download_id}
        finally:
            loop.close()
    
    finally:
        db.close()


@shared_task
def resume_download(download_id: str):
    """Resume a paused download."""
    db = SessionLocal()
    
    try:
        manager = DownloadManager(db, "./storage")
        loop = asyncio.new_event_loop()
        
        try:
            result = loop.run_until_complete(manager.resume_download(download_id))
            
            if result:
                # Re-dispatch to worker
                execute_download.delay(download_id)
            
            return {"success": result, "download_id": download_id}
        finally:
            loop.close()
    
    finally:
        db.close()


@shared_task
def cancel_download(download_id: str):
    """Cancel a download and cleanup."""
    db = SessionLocal()
    
    try:
        manager = DownloadManager(db, "./storage")
        loop = asyncio.new_event_loop()
        
        try:
            result = loop.run_until_complete(manager.cancel_download(download_id))
            return {"success": result, "download_id": download_id}
        finally:
            loop.close()
    
    finally:
        db.close()


@shared_task
def cleanup_completed_downloads(older_than_hours: int = 24):
    """Clean up old completed/failed downloads from queue."""
    db = SessionLocal()
    
    try:
        from datetime import datetime, timedelta, timezone

        # Bug 1 fix: use canonical model from app.models.registry
        from app.models.registry import DownloadQueue
        
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=older_than_hours)
        
        deleted = (
            db.query(DownloadQueue)
            .filter(
                DownloadQueue.status.in_([
                    "completed",
                    "cancelled",
                    "failed"
                ]),
                DownloadQueue.completed_at < cutoff
            )
            .delete(synchronize_session=False)
        )
        
        db.commit()
        
        logger.info(f"Cleaned up {deleted} old downloads")
        return {"deleted": deleted}
    
    finally:
        db.close()


@shared_task
def get_download_statistics():
    """Get current download statistics."""
    db = SessionLocal()
    
    try:
        manager = DownloadManager(db, "./storage")
        stats = manager.get_statistics()
        return stats
    
    finally:
        db.close()


@shared_task
def install_model_task(model_id: str, manifest: dict, storage_path: str, progress_cb: Callable = None):
    """Install a model using the runtime installer (sync Celery task)."""
    import asyncio as _asyncio
    logger.info("install_model_task called for %s", model_id)
    try:
        from runtime.installer import install_provider
        result = install_provider(model_id)
        if result.get("success"):
            logger.info("Model %s installed successfully via runtime installer.", model_id)
        else:
            err = result.get("error", "Unknown")
            logger.error("install_model_task failed for %s: %s", model_id, err)
        return result
    except Exception as e:
        logger.error("install_model_task exception for %s: %s", model_id, e)
        raise