"""Jobs endpoints for the new FastAPI backend."""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import desc, select

from app.database import AsyncSessionLocal
from app.models import GenerationJob
from app.schemas import GenerationJobResponse, SuccessResponse, ErrorResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("", response_model=list[GenerationJobResponse])
async def list_jobs(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
):
    """Return all generation jobs from the database."""
    try:
        async with AsyncSessionLocal() as session:
            q = select(GenerationJob).order_by(desc(GenerationJob.created_at))
            if status:
                q = q.where(GenerationJob.status == status)
            q = q.offset(offset).limit(limit)
            result = await session.execute(q)
            jobs = result.scalars().all()

            return [
                GenerationJobResponse(
                    job_id=j.id,
                    status=j.status,
                    provider=j.provider,
                    mode=j.mode,
                    prompt=j.prompt,
                    progress=j.progress or 0,
                    stage=j.stage or "queued",
                    error_message=j.error_message,
                    model_url=j.model_url,
                    thumbnail_url=j.thumbnail_url,
                    polygon_count=j.polygon_count,
                    vertex_count=j.vertex_count,
                    has_rig=j.has_rig,
                    file_size=j.file_size,
                    download_urls=j.download_urls,
                    created_at=j.created_at,
                    updated_at=j.updated_at,
                    started_at=j.started_at,
                    completed_at=j.completed_at,
                )
                for j in jobs
            ]
    except Exception as exc:
        logger.warning("DB unavailable for list_jobs: %s", exc)
        raise HTTPException(status_code=503, detail="Failed to retrieve jobs from database")


@router.get("/{job_id}", response_model=GenerationJobResponse)
async def get_job(job_id: str):
    """Return a single job by ID."""
    try:
        async with AsyncSessionLocal() as session:
            job = await session.get(GenerationJob, job_id)
            if not job:
                raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

            return GenerationJobResponse(
                job_id=job.id,
                status=job.status,
                provider=job.provider,
                mode=job.mode,
                prompt=job.prompt,
                progress=job.progress or 0,
                stage=job.stage or "queued",
                error_message=job.error_message,
                model_url=job.model_url,
                thumbnail_url=job.thumbnail_url,
                polygon_count=job.polygon_count,
                vertex_count=job.vertex_count,
                has_rig=job.has_rig,
                file_size=job.file_size,
                download_urls=job.download_urls,
                created_at=job.created_at,
                updated_at=job.updated_at,
                started_at=job.started_at,
                completed_at=job.completed_at,
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("DB unavailable for get_job: %s", exc)
        raise HTTPException(status_code=503, detail="Failed to retrieve the requested job")


@router.delete("/{job_id}", response_model=SuccessResponse)
async def delete_job(job_id: str):
    """Delete a generation job by ID."""
    try:
        from app.core import get_storage_manager

        storage = get_storage_manager()

        async with AsyncSessionLocal() as session:
            job = await session.get(GenerationJob, job_id)
            if not job:
                raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

            # Delete associated files from storage
            storage.cleanup_job_files(job_id)

            await session.delete(job)
            await session.commit()
            return SuccessResponse(data={"deleted": True, "job_id": job_id}, message="Job deleted")
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Failed to delete job %s: %s", job_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to delete job: {exc}")