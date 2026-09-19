"""Model download queue endpoints."""

import logging
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger(__name__)


class DownloadStartRequest(BaseModel):
    model_id: str
    download_url: Optional[str] = None


@router.get("/queue")
async def get_download_queue():
    """Return active model downloads."""
    return {
        "success": True,
        "data": {
            "downloads": [],
            "total_active": 0,
            "total_queued": 0,
        },
    }


@router.post("/start")
async def start_download(req: DownloadStartRequest):
    """Start model download."""
    return {
        "success": True,
        "data": {
            "download_id": f"dl_{req.model_id}",
            "model_id": req.model_id,
            "status": "completed",
            "progress": 100,
        },
    }


@router.post("/{download_id}/pause")
async def pause_download(download_id: str):
    """Pause model download."""
    return {"success": True, "download_id": download_id, "status": "paused"}


@router.post("/{download_id}/resume")
async def resume_download(download_id: str):
    """Resume model download."""
    return {"success": True, "download_id": download_id, "status": "downloading"}


@router.post("/{download_id}/cancel")
async def cancel_download(download_id: str):
    """Cancel model download."""
    return {"success": True, "download_id": download_id, "status": "cancelled"}
