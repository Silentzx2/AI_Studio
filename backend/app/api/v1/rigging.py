"""Rigging API endpoints."""
import asyncio
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import redis as redis_sync
from app.config import get_settings
from app.utils.response import success

router = APIRouter(tags=["Rigging"])
logger = logging.getLogger(__name__)
settings = get_settings()

class AniGenRigRequest(BaseModel):
    model_glb_url: str
    reference_image_url: str | None = None
    model_task_id: str | None = None

@router.post("/anigen-rig")
async def trigger_anigen_rig(req: AniGenRigRequest):
    """Trigger AniGen character rigging for a GLB model."""
    from app.workers.tasks import anigen_rig_task
    try:
        # Trigger async rigging worker
        task = anigen_rig_task.delay(
            req.model_glb_url,
            req.reference_image_url,
            req.model_task_id
        )

        # Initialize status in redis (sync client — run off the event loop)
        def _init_status():
            r = redis_sync.from_url(settings.redis_url, decode_responses=True)
            r.set(f"rig:{task.id}:status", "processing")
            r.set(f"rig:{task.id}:progress", "0")
            r.set(f"rig:{task.id}:message", "Queueing rigging job...")

        await asyncio.to_thread(_init_status)

        return success({
            "task_id": task.id,
            "status": "queued",
            "message": "Rigging job submitted successfully."
        })
    except Exception as exc:
        logger.exception("Failed to submit rigging job: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to submit rigging job: {exc}")

@router.get("/{task_id}/status")
async def get_rigging_status(task_id: str):
    """Poll status of an active AniGen rigging job."""

    def _get_status():
        r = redis_sync.from_url(settings.redis_url, decode_responses=True)
        return {
            "status": r.get(f"rig:{task_id}:status"),
            "progress": r.get(f"rig:{task_id}:progress"),
            "message": r.get(f"rig:{task_id}:message"),
            "result_url": r.get(f"rig:{task_id}:result"),
            "error_msg": r.get(f"rig:{task_id}:error"),
        }

    redis_data = await asyncio.to_thread(_get_status)
    status = redis_data["status"]

    if not status:
        # Fallback to checking celery task directly
        from app.workers.celery_app import celery_app
        res = celery_app.AsyncResult(task_id)
        if res.ready():
            if res.successful():
                return success({
                    "task_id": task_id,
                    "status": "completed",
                    "progress": 100,
                    "message": "Rigging complete",
                    "result_url": res.result.get("result_url") if isinstance(res.result, dict) else None
                })
            else:
                return success({
                    "task_id": task_id,
                    "status": "failed",
                    "progress": 0,
                    "message": "Rigging failed",
                    "error": str(res.result)
                })
        return success({
            "task_id": task_id,
            "status": "pending",
            "progress": 0,
            "message": "Rigging job is in queue"
        })

    progress = int(redis_data["progress"] or 0)
    message = redis_data["message"] or "Processing rigging..."
    result_url = redis_data["result_url"]
    error_msg = redis_data["error_msg"]

    return success({
        "task_id": task_id,
        "status": status,
        "progress": progress,
        "message": message,
        "result_url": result_url,
        "error": error_msg
    })
