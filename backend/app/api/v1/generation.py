"""Generation endpoints."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app.config import get_settings
from app.core.capability_matrix import is_compatible_with_workspace
from app.utils.response import error, success

router = APIRouter(tags=["Generation"])
logger = logging.getLogger(__name__)
settings = get_settings()

MAX_PROMPT_LENGTH = 2000

_VALID_MODES = ('text-to-3d', 'image-to-3d', 'remesh', 'rigging', 'texture-generation', 'render')
_VALID_QUALITIES = ('low-poly', 'standard', 'high-poly', 'ultra', 'draft')
_WORKSPACE_MODE_MAP = {
    'mesh-generation': 'text-to-3d',
    'texture-generation': 'texture-generation',
    'rigging': 'rigging',
    'animation': 'rigging',
    'remesh': 'remesh',
    'post-processing': 'texture-generation',
}


class GenerationRequest(BaseModel):
    prompt: str
    negative_prompt: str | None = None
    mode: str = "text-to-3d"
    quality: str = "standard"
    style_preset: str | None = None
    generate_texture: bool = True
    auto_rig: bool = False
    provider: str | None = None
    reference_image_url: str | None = None
    detail_pass: bool = False
    detail_guidance: float = 7.5
    workspace: str | None = None

    @field_validator('prompt')
    @classmethod
    def validate_prompt_length(cls, v: str) -> str:
        if len(v) > MAX_PROMPT_LENGTH:
            raise ValueError(f"Prompt exceeds maximum length of {MAX_PROMPT_LENGTH} characters")
        return v

    @field_validator('mode')
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if v not in _VALID_MODES:
            raise ValueError(f"Invalid mode: {v}")
        return v

    @field_validator('quality')
    @classmethod
    def validate_quality(cls, v: str) -> str:
        if v not in _VALID_QUALITIES:
            raise ValueError(f"Invalid quality: {v}")
        return v


# FIX: Define /history route FIRST before /{job_id}/status
# FastAPI matches routes in order, so literal paths must come before parameterized ones
@router.get("/history")
async def generation_history(limit: int = 20, offset: int = 0):
    """Return the most recent generation jobs."""
    try:
        from sqlalchemy import desc, select

        from app.database import AsyncSessionLocal
        from app.models.job import GenerationJob

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(GenerationJob)
                .order_by(desc(GenerationJob.created_at))
                .offset(offset)
                .limit(limit)
            )
            jobs = result.scalars().all()
            return success(
                {
                    "jobs": [
                        {
                            "id": j.id,
                            "status": j.status,
                            "mode": j.mode,
                            "prompt": j.prompt,
                            "provider": j.provider,
                            "progress": j.progress,
                            "stage": j.stage,
                            "model_url": j.model_url,
                            "thumbnail_url": j.thumbnail_url,
                            "created_at": j.created_at.isoformat() if j.created_at else None,
                            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                        }
                        for j in jobs
                    ],
                    "total": len(jobs),
                    "offset": offset,
                    "limit": limit,
                }
            )
    except Exception as exc:
        logger.warning("DB unavailable for history: %s", exc)
        return success({"jobs": [], "total": 0, "offset": offset, "limit": limit})


CREDIT_COSTS = {
    "low-poly": {"base": 10, "texture": 5, "rig": 10},
    "standard": {"base": 20, "texture": 5, "rig": 10},
    "high-poly": {"base": 50, "texture": 5, "rig": 10},
}


@router.get("/cost-estimate")
async def estimate_cost(quality: str = "standard", generate_texture: bool = True, auto_rig: bool = False):
    """Estimate generation cost in credits."""
    if quality not in CREDIT_COSTS:
        raise HTTPException(status_code=400, detail=f"Invalid quality: {quality}")

    costs = CREDIT_COSTS[quality]
    total = costs["base"]
    if generate_texture:
        total += costs["texture"]
    if auto_rig:
        total += costs["rig"]

    return success({
        "quality": quality,
        "credits": total,
        "breakdown": {
            "base": costs["base"],
            "texture": costs["texture"] if generate_texture else 0,
            "rig": costs["rig"] if auto_rig else 0,
        },
    })


@router.post("")
async def create_generation(req: GenerationRequest):
    """Submit a new 3D generation job."""
    job_id = str(uuid.uuid4())
    provider = req.provider or settings.ai_provider
    now = datetime.utcnow()

    # Colab VRAM guard: block generation for models that exceed the Colab
    # preparation limit so we don't silently OOM and crash the runtime.
    try:
        from runtime.capability import get_colab_incompatibility_reason  # noqa: PLC0415
        reason = get_colab_incompatibility_reason(provider)
        if reason:
            logger.warning("Blocked Colab-incompatible generation: provider=%s reason=%s", provider, reason)
            raise HTTPException(
                status_code=400,
                detail=(
                    f"This model requires more VRAM than the current Google Colab runtime "
                    f"is designed to provide. Running it may cause GPU OOM, process "
                    f"termination, or runtime crash.\n\n{reason}"
                ),
            )
    except HTTPException:
        raise
    except Exception:
        pass  # Soft fail: don't block generation if capability check errors

    # Validate workspace/provider compatibility if workspace is specified
    if req.workspace:
        try:
            from runtime.installer import PROVIDER_METADATA
            meta = PROVIDER_METADATA.get(provider, {})
            if not is_compatible_with_workspace(meta, req.workspace):
                logger.warning(
                    "Incompatible workspace '%s' for provider '%s'",
                    req.workspace, provider,
                )
        except Exception:
            pass  # Soft validation: don't block generation if check fails

        # Auto-map workspace to generation mode if not explicitly provided
        if req.mode == "text-to-3d" and req.workspace in _WORKSPACE_MODE_MAP:
            req.mode = _WORKSPACE_MODE_MAP[req.workspace]

    from app.database import AsyncSessionLocal
    from app.models.job import GenerationJob
    from app.workers.tasks import generate_3d_model

    try:
        async with AsyncSessionLocal() as session:
            job = GenerationJob(
                id=job_id,
                status="queued",
                mode=req.mode,
                prompt=req.prompt,
                negative_prompt=req.negative_prompt,
                quality=req.quality,
                style_preset=req.style_preset,
                generate_texture=req.generate_texture,
                auto_rig=req.auto_rig,
                provider=provider,
                reference_image_url=req.reference_image_url,
                progress=0,
                stage="queued",
                has_rig=False,
                processing_metadata={
                    "detail_pass": req.detail_pass,
                    "detail_guidance": req.detail_guidance,
                    "workspace": req.workspace,
                },
                created_at=now,
                updated_at=now,
            )
            session.add(job)
            await session.commit()
            # ponytail: Ensure flush so job is queryable immediately after
            await session.refresh(job)
    except Exception as exc:
        logger.exception("Failed to persist generation job %s", job_id)
        raise HTTPException(
            status_code=503,
            detail=f"Failed to create generation job: {exc}",
        )

    try:
        generate_3d_model.delay(job_id)
    except Exception as exc:
        logger.exception("Failed to enqueue generation job %s", job_id)
        # Keep the persisted row so status polling does not 404.
        try:
            async with AsyncSessionLocal() as session:
                job = await session.get(GenerationJob, job_id)
                if job:
                    job.status = "failed"
                    job.stage = "failed"
                    job.error_message = f"Failed to enqueue worker task: {exc}"
                    job.updated_at = datetime.utcnow()
                    await session.commit()
        except Exception:
            logger.exception("Could not mark generation job %s as failed after enqueue error", job_id)
        raise HTTPException(
            status_code=503,
            detail=f"Failed to queue generation job: {exc}",
        )

    logger.info("Generation job %s queued (provider=%s, mode=%s)", job_id, provider, req.mode)
    return success(
        {
            "job_id": job_id,
            "status": "queued",
            "provider": provider,
            "created_at": now.isoformat(),
        },
        "Generation job queued.",
    )


@router.post("/{job_id}/cancel")
async def cancel_generation(job_id: str):
    """Cancel a generation job.

    Marks the job as cancelled in the DB (single source of truth). The worker
    checks the status at each progress/stage boundary and stops; the frontend
    stops polling. ponytail: we mark the DB row instead of faking cancellation
    only on the client — the model process would otherwise keep running server-side.
    """
    from app.database import AsyncSessionLocal
    from app.models.job import GenerationJob

    try:
        async with AsyncSessionLocal() as session:
            from sqlalchemy import select
            result = await session.execute(
                select(GenerationJob).where(GenerationJob.id == job_id)
            )
            job = result.scalar_one_or_none()
            if not job:
                raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
            if job.status in ("completed", "failed", "cancelled"):
                return success({"job_id": job_id, "status": job.status})
            job.status = "cancelled"
            job.stage = "cancelled"
            job.updated_at = datetime.utcnow()
            await session.commit()
        logger.info("Generation job %s cancelled", job_id)
        return success({"job_id": job_id, "status": "cancelled"})
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to cancel generation job %s", job_id)
        return error(f"Failed to cancel job: {exc}")


# FIX: This now comes AFTER /history so it's not shadowed
@router.get("/{job_id}/status")
async def get_generation_status(job_id: str):
    """Get the status of a generation job.

    This endpoint is polled by the frontend during generation to show
    progress, stage, and estimated completion.
    """
    try:
        from sqlalchemy import select

        from app.database import AsyncSessionLocal
        from app.models.job import GenerationJob

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(GenerationJob).where(GenerationJob.id == job_id)
            )
            job = result.scalar_one_or_none()

            if not job:
                raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

            meta = job.processing_metadata or {}
            response = {
                "job_id": job.id,
                "status": job.status,
                "progress": job.progress or 0,
                "stage": job.stage or "queued",
                "message": _get_stage_message(job.stage, job.progress),
                "mode": job.mode,
                "prompt": job.prompt,
                "provider": job.provider,
                "error": job.error_message,
                "error_message": job.error_message,
                "detail_pass": meta.get("detail_pass", False),
                "model_url_detailed": meta.get("model_url_detailed"),
                "created_at": job.created_at.isoformat() if job.created_at else None,
                "updated_at": job.updated_at.isoformat() if job.updated_at else None,
            }

            if job.status == "completed":
                response["result"] = {
                    "model_url": job.model_url,
                    "thumbnail_url": job.thumbnail_url,
                    "polygon_count": job.polygon_count,
                    "vertex_count": job.vertex_count,
                    "texture_resolution": job.texture_resolution,
                    "has_rig": job.has_rig,
                    "file_size": job.file_size,
                    "download_urls": job.download_urls or {},
                }

            return success(response)

    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Failed to get job status for %s: %s", job_id, exc)
        return error(f"Failed to retrieve job status: {exc}")


@router.get("/{job_id}/stream")
async def generation_progress_stream(job_id: str):
    """SSE stream of generation progress for a specific job."""
    from fastapi.responses import StreamingResponse
    import redis.asyncio as redis
    import asyncio
    import json

    async def _event_generator():
        r = redis.from_url(settings.redis_url, decode_responses=True)
        pubsub = r.pubsub()
        channel = f"job_progress:{job_id}"
        await pubsub.subscribe(channel)
        
        try:
            # Yield initial state from DB if available
            from app.database import AsyncSessionLocal
            from app.models.job import GenerationJob
            async with AsyncSessionLocal() as session:
                job = await session.get(GenerationJob, job_id)
                if job:
                    yield f"data: {json.dumps({'status': job.status, 'progress': job.progress, 'stage': job.stage, 'message': 'Initial state'})}\n\n"
                    if job.status in ("completed", "failed", "cancelled"):
                        return

            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message:
                    data = message["data"]
                    yield f"data: {data}\n\n"
                    # Stop if job reaches terminal state
                    try:
                        payload = json.loads(data)
                        if payload.get("status") in ("completed", "failed", "cancelled"):
                            break
                    except:
                        pass
                await asyncio.sleep(0.1)
        finally:
            await pubsub.unsubscribe(channel)
            await r.close()

    return StreamingResponse(_event_generator(), media_type="text/event-stream")


def _get_stage_message(stage: str, progress: int) -> str:
    """Generate a user-friendly message for the current stage."""
    messages = {
        "queued": "Job queued — waiting for GPU slot",
        "preparing": "Preparing model and assets...",
        "generating": f"Generating 3D model... {progress}%",
        "texturing": "Applying textures and materials...",
        "rigging": "Adding skeletal rig...",
        "postprocessing": "Finalizing model...",
        "completed": "Generation complete!",
        "failed": "Generation failed",
    }
    return messages.get(stage, f"Processing... {progress}%")
