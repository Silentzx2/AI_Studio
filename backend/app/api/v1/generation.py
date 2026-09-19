"""Generation endpoints for the new FastAPI backend."""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from pydantic import BaseModel

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import GenerationJob
from app.schemas import (
    GenerationRequest,
    GenerationJobCreate,
    GenerationJobResponse,
    GenerationHistoryResponse,
    CostEstimateRequest,
    CostEstimateResponse,
    CancelResponse,
    SuccessResponse,
    ErrorResponse,
)
from app.core import (
    get_comfyui_client,
    get_workflow_manager,
    get_artifact_manager,
    create_job_listener,
    stop_job_listener,
    get_progress_tracker,
    get_rate_limiter,
)

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

_WORKSPACE_MODE_MAP = {
    "mesh-generation": "text-to-3d",
    "texture-generation": "texture-generation",
    "rigging": "rigging",
    "animation": "animation",
    "remesh": "remesh",
    "post-processing": "texture-generation",
    "world-generation": "text-to-3d",
}

CREDIT_COSTS = {
    "low-poly": {"base": 10, "texture": 5, "rig": 10},
    "standard": {"base": 20, "texture": 5, "rig": 10},
    "high-poly": {"base": 50, "texture": 5, "rig": 10},
    "ultra": {"base": 100, "texture": 10, "rig": 20},
    "draft": {"base": 5, "texture": 2, "rig": 5},
}


@router.get("/history", response_model=GenerationHistoryResponse)
async def generation_history(limit: int = 20, offset: int = 0):
    """Return the most recent generation jobs."""
    try:
        from sqlalchemy import desc, select

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(GenerationJob)
                .order_by(desc(GenerationJob.created_at))
                .offset(offset)
                .limit(limit)
            )
            jobs = result.scalars().all()
            job_items = []
            for j in jobs:
                meta = j.processing_metadata if isinstance(j.processing_metadata, dict) else {}
                pp = meta.get("postprocess")
                pp_status = pp.get("status") if isinstance(pp, dict) else j.status
                job_items.append(
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
                )
            return GenerationHistoryResponse(
                jobs=job_items,
                total=len(job_items),
                offset=offset,
                limit=limit,
            )
    except Exception as exc:
        logger.warning("DB unavailable for history: %s", exc)
        raise HTTPException(status_code=503, detail="Failed to retrieve generation history")


@router.get("/cost-estimate", response_model=CostEstimateResponse)
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

    return CostEstimateResponse(
        quality=quality,
        credits=total,
        breakdown={
            "base": costs["base"],
            "texture": costs["texture"] if generate_texture else 0,
            "rig": costs["rig"] if auto_rig else 0,
        },
    )


async def _check_rate_limit(client_ip: str, max_requests: int = 10, window_seconds: int = 60) -> bool:
    """Check rate limit."""
    limiter = get_rate_limiter()
    return limiter.is_allowed(f"gen:{client_ip}", max_requests, window_seconds)


@router.post("", response_model=GenerationJobCreate)
async def create_generation(req: GenerationRequest, request: Request, background_tasks: BackgroundTasks):
    """Submit a new 3D generation job."""
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not await _check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Maximum 10 generation requests per minute.",
        )

    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Map workspace to mode
    if req.workspace and req.mode == "text-to-3d" and req.workspace in _WORKSPACE_MODE_MAP:
        req.mode = _WORKSPACE_MODE_MAP[req.workspace]

    # Determine provider
    provider = req.provider or "comfyui"

    # Create job in database
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
                low_vram=req.low_vram,
                vram_mode=req.vram_mode,
                processing_metadata={
                    "workspace": req.workspace,
                    "detail_pass": req.detail_pass,
                    "detail_guidance": req.detail_guidance,
                    "triposf_pass": req.triposf_pass,
                    "mesh_enhancement_mode": req.mesh_enhancement_mode,
                    "postprocess": req.postprocess,
                    "skip_postprocessing": req.skip_postprocessing,
                    "auto_optimize": req.auto_optimize,
                    "auto_optimize_settings": req.auto_optimize_settings,
                    "remesh_settings": req.remesh_settings,
                    "source_mesh_url": req.source_mesh_url,
                    "game_ready": req.game_ready,
                    "target_platform": req.target_platform,
                    "generate_lod": req.generate_lod,
                    "lod_preset": req.lod_preset,
                    "lod_count": req.lod_count,
                    "generate_collision": req.generate_collision,
                    "generate_pbr": req.generate_pbr,
                    "preserve_details": req.preserve_details,
                    "repair_uvs": req.repair_uvs,
                    "topology_mode": req.topology_mode,
                    "seed": req.seed,
                    "num_inference_steps": req.num_inference_steps,
                    "guidance_scale": req.guidance_scale,
                    "octree_resolution": req.octree_resolution,
                    "num_chunks": req.num_chunks,
                    "face_count": req.face_count,
                    "enable_mesh_repair": req.enable_mesh_repair,
                    "strict_watertight": req.strict_watertight,
                    "use_pymeshlab_decimation": req.use_pymeshlab_decimation,
                    "quality_threshold": req.quality_threshold,
                    "pbr_resolution": req.pbr_resolution,
                    "compress_output": req.compress_output,
                    "prepackage_export": req.prepackage_export,
                    "include_lods_in_package": req.include_lods_in_package,
                    "include_collision_in_package": req.include_collision_in_package,
                    "include_qa_in_package": req.include_qa_in_package,
                },
                created_at=now,
                updated_at=now,
            )
            session.add(job)
            await session.commit()
            await session.refresh(job)
    except Exception as exc:
        logger.exception("Failed to persist generation job %s", job_id)
        raise HTTPException(status_code=503, detail=f"Failed to create generation job: {exc}")

    # Start background generation
    background_tasks.add_task(process_generation_job, job_id, req)

    logger.info("Generation job %s queued (provider=%s, mode=%s)", job_id, provider, req.mode)
    return GenerationJobCreate(
        job_id=job_id,
        status="queued",
        provider=provider,
        mode=req.mode,
        prompt=req.prompt,
        created_at=now,
    )


async def process_generation_job(job_id: str, req: GenerationRequest):
    """Background task to process generation job via ComfyUI."""
    client = get_comfyui_client()
    workflow_manager = get_workflow_manager()
    artifact_manager = get_artifact_manager()

    try:
        async with AsyncSessionLocal() as session:
            job = await session.get(GenerationJob, job_id)
            if not job:
                logger.error("Job %s not found", job_id)
                return

            job.status = "processing"
            job.stage = "preparing"
            job.started_at = datetime.now(timezone.utc).replace(tzinfo=None)
            job.updated_at = job.started_at
            await session.commit()

        # Create event listener for progress
        listener, tracker = await create_job_listener(job_id)

        # Determine workflow template based on mode
        workflow_name = "hunyuan3d_text_to_3d"
        if req.mode == "image-to-3d":
            workflow_name = "hunyuan3d_image_to_3d"
        elif req.mode == "texture-generation":
            workflow_name = "texture_generation"
        elif req.mode == "remesh":
            workflow_name = "remesh"
        elif req.mode == "animation":
            workflow_name = "trellis_text_to_3d"  # or ardy workflow

        # Prepare workflow
        workflow_params = {
            "prompt": req.prompt,
            "negative_prompt": req.negative_prompt or "low quality, bad anatomy",
            "seed": req.seed or 0,
            "steps": req.num_inference_steps or 20,
            "cfg": req.guidance_scale or 7.0,
            "job_id": job_id,
        }

        if req.reference_image_url:
            workflow_params["reference_image"] = req.reference_image_url

        if req.source_mesh_url:
            workflow_params["mesh_path"] = req.source_mesh_url

        if req.mode == "remesh":
            workflow_params["target_faces"] = req.face_count or 10000

        if req.generate_texture:
            workflow_params["texture_resolution"] = req.pbr_resolution or 1024

        workflow = workflow_manager.prepare_workflow(workflow_name, **workflow_params)

        # Queue prompt in ComfyUI
        prompt_response = await client.queue_prompt(workflow, client_id=f"job_{job_id}")
        prompt_id = prompt_response.get("prompt_id")

        if not prompt_id:
            raise RuntimeError("Failed to get prompt_id from ComfyUI")

        # Update job with prompt_id
        async with AsyncSessionLocal() as session:
            job = await session.get(GenerationJob, job_id)
            if job:
                meta = dict(job.processing_metadata or {})
                meta["comfyui_prompt_id"] = prompt_id
                job.processing_metadata = meta
                job.stage = "generating"
                job.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                await session.commit()

        # Wait for completion (poll queue)
        max_wait = 300  # 5 minutes
        poll_interval = 2
        waited = 0

        while waited < max_wait:
            await asyncio.sleep(poll_interval)
            waited += poll_interval

            queue = await client.get_queue()
            running = queue.get("queue_running", [])
            pending = queue.get("queue_pending", [])

            # Check if our prompt is still running/pending
            is_running = any(item[1] == prompt_id for item in running)
            is_pending = any(item[1] == prompt_id for item in pending)

            if not is_running and not is_pending:
                break

            # Update progress
            async with AsyncSessionLocal() as session:
                job = await session.get(GenerationJob, job_id)
                if job:
                    progress = min(90, 10 + (waited / max_wait) * 80)
                    job.progress = int(progress)
                    job.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    await session.commit()

        # Get results
        history = await client.get_history(prompt_id)
        prompt_history = history.get(prompt_id, {})

        # Process artifacts
        metadata = artifact_manager.process_job_outputs(job_id, prompt_id, f"hunyuan3d_{job_id}")

        # Update job with results
        async with AsyncSessionLocal() as session:
            job = await session.get(GenerationJob, job_id)
            if job:
                job.status = "completed"
                job.stage = "completed"
                job.progress = 100
                job.model_url = metadata.get("model_url")
                job.thumbnail_url = metadata.get("thumbnail_url")
                job.polygon_count = metadata.get("polygon_count")
                job.vertex_count = metadata.get("vertex_count")
                job.file_size = metadata.get("file_size")
                job.download_urls = metadata.get("download_urls")
                job.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                job.updated_at = job.completed_at

                meta = dict(job.processing_metadata or {})
                meta.update(metadata)
                job.processing_metadata = meta
                await session.commit()

    except Exception as e:
        logger.exception("Generation job %s failed: %s", job_id, e)
        async with AsyncSessionLocal() as session:
            job = await session.get(GenerationJob, job_id)
            if job:
                job.status = "failed"
                job.stage = "failed"
                job.error_message = str(e)
                job.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                job.updated_at = job.completed_at
                await session.commit()
    finally:
        await stop_job_listener(job_id)


@router.post("/{job_id}/cancel", response_model=CancelResponse)
async def cancel_generation(job_id: str):
    """Cancel a generation job."""
    client = get_comfyui_client()

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
                return CancelResponse(job_id=job_id, status=job.status)

            # Try to interrupt ComfyUI
            prompt_id = (job.processing_metadata or {}).get("comfyui_prompt_id")
            if prompt_id:
                try:
                    await client.interrupt()
                except Exception:
                    pass

            job.status = "cancelled"
            job.stage = "cancelled"
            job.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            await session.commit()

        await stop_job_listener(job_id)
        return CancelResponse(job_id=job_id, status="cancelled")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to cancel generation job %s", job_id)
        raise HTTPException(status_code=500, detail=f"Failed to cancel job: {exc}")


@router.get("/{job_id}/status", response_model=GenerationJobResponse)
async def get_generation_status(job_id: str):
    """Get the status of a generation job."""
    tracker = get_progress_tracker(job_id)
    if tracker:
        progress_status = tracker.get_status()
        # Try to get from DB for complete info
        try:
            async with AsyncSessionLocal() as session:
                job = await session.get(GenerationJob, job_id)
                if job:
                    return GenerationJobResponse(
                        job_id=job.id,
                        status=job.status,
                        provider=job.provider,
                        mode=job.mode,
                        prompt=job.prompt,
                        progress=progress_status.get("progress", job.progress or 0),
                        stage=progress_status.get("stage", job.stage or "queued"),
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
        except Exception:
            pass

    # Fallback to DB
    try:
        async with AsyncSessionLocal() as session:
            job = await session.get(GenerationJob, job_id)
            if not job:
                raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

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
        logger.warning("Failed to get job status for %s: %s", job_id, exc)
        raise HTTPException(status_code=503, detail="Failed to retrieve job status")