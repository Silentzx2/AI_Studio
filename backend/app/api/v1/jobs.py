"""Job management endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.utils.response import success

router = APIRouter(tags=["Jobs"])
logger = logging.getLogger(__name__)


@router.get("")
async def list_jobs(limit: int = 50, offset: int = 0, status: str = ""):
    """Return all generation jobs from the database."""
    try:
        from sqlalchemy import desc, select

        from app.database import AsyncSessionLocal
        from app.models.job import GenerationJob

        async with AsyncSessionLocal() as session:
            q = select(GenerationJob).order_by(desc(GenerationJob.created_at))
            if status:
                q = q.where(GenerationJob.status == status)
            q = q.offset(offset).limit(limit)
            result = await session.execute(q)
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
                            "error_message": j.error_message,
                            "model_url": j.model_url,
                            "thumbnail_url": j.thumbnail_url,
                            "created_at": j.created_at.isoformat() if j.created_at else None,
                            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                        }
                        for j in jobs
                    ],
                    "offset": offset,
                    "limit": limit,
                    "count": len(jobs),
                }
            )
    except Exception as exc:
        logger.warning("DB unavailable for list_jobs: %s", exc)
        return success({"jobs": [], "offset": offset, "limit": limit, "count": 0})


@router.get("/{job_id}")
async def get_job(job_id: str):
    """Return a single job by ID."""
    try:
        from app.database import AsyncSessionLocal
        from app.models.job import GenerationJob

        async with AsyncSessionLocal() as session:
            job = await session.get(GenerationJob, job_id)
            if not job:
                raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
            return success(
                {
                    "id": job.id,
                    "status": job.status,
                    "mode": job.mode,
                    "prompt": job.prompt,
                    "provider": job.provider,
                    "progress": job.progress,
                    "stage": job.stage,
                    "error_message": job.error_message,
                    "model_url": job.model_url,
                    "thumbnail_url": job.thumbnail_url,
                    "download_urls": job.download_urls,
                    "polygon_count": job.polygon_count,
                    "vertex_count": job.vertex_count,
                    "has_rig": job.has_rig,
                    "file_size": job.file_size,
                    "created_at": job.created_at.isoformat() if job.created_at else None,
                    "started_at": job.started_at.isoformat() if job.started_at else None,
                    "completed_at": job.completed_at.isoformat() if job.completed_at else None,
                }
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("DB unavailable for get_job: %s", exc)
        return success({"id": job_id, "status": "unknown"})


@router.delete("/{job_id}")
async def delete_job(job_id: str):
    """Delete a generation job by ID."""
    try:
        from app.database import AsyncSessionLocal
        from app.models.job import GenerationJob

        async with AsyncSessionLocal() as session:
            job = await session.get(GenerationJob, job_id)
            if not job:
                raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

            # Optionally delete associated files
            if job.model_url:
                try:
                    from pathlib import Path
                    from app.config import get_settings
                    _settings = get_settings()
                    base = Path(_settings.storage_local_path)
                    model_path = base / job.model_url.replace("/static/", "")
                    if model_path.exists():
                        model_path.unlink()
                except Exception as e:
                    logger.warning(f"Failed to delete model file for {job_id}: {e}")

            if job.thumbnail_url:
                try:
                    from pathlib import Path
                    from app.config import get_settings
                    _settings = get_settings()
                    base = Path(_settings.storage_local_path)
                    thumb_path = base / job.thumbnail_url.replace("/static/", "")
                    if thumb_path.exists():
                        thumb_path.unlink()
                except Exception as e:
                    logger.warning(f"Failed to delete thumbnail for {job_id}: {e}")

            await session.delete(job)
            await session.commit()
            return success({"deleted": True, "job_id": job_id})
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Failed to delete job %s: %s", job_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to delete job: {exc}")
