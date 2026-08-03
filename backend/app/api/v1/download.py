from fastapi import Query

"""API endpoints for download management."""


from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.managers.download_manager import DownloadManager
from app.database import get_db
from app.workers.download_workers import execute_download, start_queued_downloads
from app.workers.download_workers import resume_download as resume_task

# Bug 5 fix: strip /api/v1 from the router prefix (outer mount in main.py adds it)
router = APIRouter(prefix="/download", tags=["download"])


class DownloadRequest(BaseModel):
    """Request model for starting a new download."""
    model_id: str = Field(..., description="Unique model identifier")
    model_name: str = Field(..., description="Human-readable model name")
    url: str = Field(..., description="Download URL")
    filename: str = Field(..., description="Target filename to save as")
    total_size: int = Field(..., ge=0, description="Expected file size in bytes (0 = unknown)")
    checksum: str | None = Field(None, description="SHA256 checksum for validation")
    provider: str = Field("direct", description="Source provider name")


class BatchDownloadRequest(BaseModel):
    """Request for downloading multiple files for a single model."""
    model_id: str
    model_name: str
    files: list[DownloadRequest]


VALID_STATUSES = ["pending", "downloading", "paused", "completed", "failed", "cancelled"]


@router.post("/start")
async def start_download(
    request: DownloadRequest,
    db: Session = Depends(get_db)
):
    """Start a new model download and queue it for execution."""
    
    manager = DownloadManager(db, "./storage")
    
    try:
        # Create download record
        download_id = await manager.start_download(
            model_id=request.model_id,
            model_name=request.model_name,
            url=request.url,
            filename=request.filename,
            total_size=request.total_size,
            checksum=request.checksum,
            provider=request.provider
        )
        
        # Dispatch to worker for execution
        execute_download.delay(download_id)
        
        return {
            "success": True,
            "data": {
                "download_id": download_id,
                "status": "queued",
                "message": f"Download started for {request.model_name}"
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start-batch")
async def start_batch_download(
    request: BatchDownloadRequest,
    db: Session = Depends(get_db)
):
    """Start batch downloads for a model (multiple files)."""
    
    manager = DownloadManager(db, "./storage")
    download_ids = []
    
    try:
        
        for file_request in request.files:
            download_id = await manager.start_download(
                model_id=request.model_id,
                model_name=file_request.model_name or request.model_name,
                url=file_request.url,
                filename=file_request.filename,
                total_size=file_request.total_size,
                checksum=file_request.checksum,
                provider=file_request.provider
            )
            
            download_ids.append(download_id)
            execute_download.delay(download_id)
        
        return {
            "success": True,
            "data": {
                "download_ids": download_ids,
                "count": len(download_ids),
                "model_id": request.model_id,
                "message": f"Started {len(download_ids)} downloads"
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/queue")
async def get_download_queue(
    status: str | None = Query(None, description="Filter by status"),
    db: Session = Depends(get_db)
):
    """Get all downloads in queue, optionally filtered by status."""
    
    manager = DownloadManager(db, "./storage")
    
    # Parse status filter — use plain strings, not DownloadStatus enum
    status_filter = None
    if status:
        if status.lower() not in VALID_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {status}. Valid: {VALID_STATUSES}"
            )
        status_filter = status.lower()
    
    queue = manager.get_queue(status=status_filter)
    
    return {
        "success": True,
        "data": {
            "queue": queue,
            "count": len(queue)
        }
    }


@router.get("/queue/active")
async def get_active_downloads(db: Session = Depends(get_db)):
    """Get currently active downloads (pending/downloading/paused)."""
    
    manager = DownloadManager(db, "./storage")
    active = manager.get_active_downloads()
    
    return {
        "success": True,
        "data": {
            "downloads": active,
            "count": len(active)
        }
    }


@router.get("/{download_id}")
async def get_download_status(download_id: str, db: Session = Depends(get_db)):
    """Get detailed status of a specific download."""
    
    manager = DownloadManager(db, "./storage")
    status = manager.get_download(download_id)
    
    if not status:
        raise HTTPException(status_code=404, detail="Download not found")
    
    return {"success": True, "data": status}


@router.post("/{download_id}/pause")
async def pause_download(download_id: str, db: Session = Depends(get_db)):
    """Pause an active download."""
    
    manager = DownloadManager(db, "./storage")
    
    try:
        result = await manager.pause_download(download_id)
        
        if not result:
            raise HTTPException(
                status_code=400,
                detail="Cannot pause download - may not be in downloadable state"
            )
        
        return {"success": True, "message": f"Download {download_id} paused"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{download_id}/resume")
async def resume_download_endpoint(download_id: str, db: Session = Depends(get_db)):
    """Resume a paused download."""
    
    manager = DownloadManager(db, "./storage")
    
    try:
        result = await manager.resume_download(download_id)
        
        if not result:
            raise HTTPException(
                status_code=400,
                detail="Cannot resume download - may not be paused"
            )
        
        # Re-dispatch to worker
        resume_task.delay(download_id)
        
        return {"success": True, "message": f"Download {download_id} resumed"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{download_id}/cancel")
async def cancel_download(download_id: str, db: Session = Depends(get_db)):
    """Cancel a download and cleanup partial files."""
    
    manager = DownloadManager(db, "./storage")
    
    try:
        result = await manager.cancel_download(download_id)
        
        if not result:
            raise HTTPException(
                status_code=404,
                detail="Download not found"
            )
        
        return {"success": True, "message": f"Download {download_id} cancelled"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/queue/cleanup")
async def cleanup_completed_downloads(db: Session = Depends(get_db)):
    """Remove completed/failed/cancelled downloads from queue."""
    
    manager = DownloadManager(db, "./storage")
    cleared = manager.clear_completed()
    
    return {
        "success": True,
        "message": f"Cleared {cleared} old downloads",
        "data": {"cleared_count": cleared}
    }


@router.get("/statistics")
async def get_download_statistics(db: Session = Depends(get_db)):
    """Get download statistics and metrics."""
    
    manager = DownloadManager(db, "./storage")
    stats = manager.get_statistics()
    
    return {"success": True, "data": stats}


@router.get("/model/{model_id}")
async def get_model_downloads(model_id: str, db: Session = Depends(get_db)):
    """Get all downloads associated with a specific model."""
    
    manager = DownloadManager(db, "./storage")
    downloads = manager.get_downloads_by_model(model_id)
    
    return {
        "success": True,
        "data": {
            "downloads": downloads,
            "model_id": model_id,
            "count": len(downloads)
        }
    }


@router.post("/process-queue")
async def process_download_queue():
    """Manually trigger processing of pending downloads."""
    
    task = start_queued_downloads.delay()
    
    return {
        "success": True,
        "message": "Queue processing triggered",
        "task_id": task.id
    }
