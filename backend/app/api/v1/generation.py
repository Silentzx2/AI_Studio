"""Generation endpoints."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config import get_settings
from app.core.capability_matrix import is_compatible_with_workspace
from app.schemas.generation import GenerationRequest
from app.utils.response import error, success

router = APIRouter(tags=["Generation"])
logger = logging.getLogger(__name__)
settings = get_settings()

_WORKSPACE_MODE_MAP = {
    'mesh-generation': 'text-to-3d',
    'texture-generation': 'texture-generation',
    'rigging': 'rigging',
    'animation': 'rigging',
    'remesh': 'remesh',
    'post-processing': 'texture-generation',
    'world-generation': 'text-to-3d',
}


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
                            "low_vram": j.low_vram,
                            "vram_mode": j.vram_mode,
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
        return error("Failed to retrieve generation history from the database.")


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


# TODO: Add rate limiting middleware
@router.post("")
async def create_generation(req: GenerationRequest, request: Request):
    """Submit a new 3D generation job."""
    # Redis-backed rate limiting: 10 requests per minute per IP
    client_ip = request.client.host if request.client else "unknown"
    if not await _check_rate_limit(client_ip, max_requests=10, window_seconds=60):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Maximum 10 generation requests per minute.",
        )
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Workspace selection is authoritative when the UI opens a dedicated tool.
    if req.workspace == "animation" or req.mode == "animation":
        raise HTTPException(
            status_code=400,
            detail="Animation generation is currently unsupported. Auto-rigging is available for humanoids, but skeletal animation clip generation is unsupported.",
        )

    if req.workspace and req.mode == "text-to-3d" and req.workspace in _WORKSPACE_MODE_MAP:
        req.mode = _WORKSPACE_MODE_MAP[req.workspace]

    builtin_provider = {
        "remesh": "builtin-remesh",
        "render": "builtin-render",
    }.get(req.mode)
    provider = builtin_provider or req.provider or settings.ai_provider

    # Reject post-processing-only providers (e.g. DetailGen3D) as standalone
    # generation targets. They are only valid as a detail/refinement stage.
    from app.core.providers.registry import is_standalone_generation_provider
    if not builtin_provider and not is_standalone_generation_provider(provider):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Provider '{provider}' is a post-processing-only provider and "
                f"cannot be used for standalone generation. It is available as a "
                f"detail/refinement stage after generation."
            ),
        )

    # Low VRAM guard: reject an explicit low-vram request for a provider that
    # has no verified low-VRAM execution path instead of silently running in
    # normal mode (and likely OOMing). 'auto' is never rejected — the worker
    # resolves a fitting mode at runtime.
    try:
        if builtin_provider:
            supports_low_vram = lambda _provider: True
        else:
            from runtime.capability import supports_low_vram  # noqa: PLC0415
        if req.low_vram and not supports_low_vram(provider):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Model '{provider}' does not support verified low-VRAM "
                    f"execution. Disable Low VRAM mode or choose a model that "
                    f"supports it (Hunyuan3D 2.1)."
                ),
            )
        if req.vram_mode == "low" and not supports_low_vram(provider):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Model '{provider}' does not support verified low-VRAM "
                    f"execution, so vram_mode='low' is unavailable."
                ),
            )
    except HTTPException:
        raise
    except Exception:
        pass  # Soft fail: never block generation on a capability-check error

    # Installation guard: block only when required installation prerequisites are missing.
    # Runtime VRAM and preflight are execution concerns handled by RuntimeEngine.
    try:
        if builtin_provider:
            state = {provider: {"repo_ready": True, "venv_ready": True, "weights_ready": True}}
        else:
            from runtime.installer import get_install_status_cached  # noqa: PLC0415
            state = get_install_status_cached()
        inst = state.get(provider, {})
        missing = []
        if not inst.get("repo_ready", True):
            missing.append("repo")
        if not inst.get("venv_ready", True):
            missing.append("venv")
        if not inst.get("weights_ready", True):
            missing.append("weights")
        comps = inst.get("components", {}) or {}
        native_state = (comps.get("native_build", {}) or {}).get("state")
        if native_state in ("failed", "running", "pending"):
            missing.append(f"native_build:{native_state}")
        if missing:
            detail = (
                f"Model '{provider}' is not installed/usable yet. "
                f"Missing: {', '.join(missing)}."
            )
            logger.warning("Blocked generation for missing installation prerequisites: provider=%s missing=%s", provider, missing)
            raise HTTPException(status_code=400, detail=detail)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Installation check failed for %s: %s", provider, exc)
        # Soft-fail the diagnostic guard; RuntimeEngine/provider loading remains authoritative.

    # Validate workspace/provider compatibility if workspace is specified.
    # Built-in remesh/render paths do not have manifest-backed model providers.
    if req.workspace and not builtin_provider:
        try:
            from runtime.manifest_loader import get_provider_metadata
            meta = get_provider_metadata(provider)
            if not is_compatible_with_workspace(meta, req.workspace):
                raise HTTPException(
                    status_code=400,
                    detail=f"Provider '{provider}' is incompatible with workspace '{req.workspace}'.",
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Workspace/provider compatibility check failed: %s", exc)

    # Texture VRAM gate: generating with texture uses the manifest's
    # capabilities.texture_pbr (or .texture) footprint, which is materially
    # larger than shape-only (e.g. 16 GB vs 8 GB). Verify the active
    # capability fits the GPU before queuing so the user gets a clear answer
    # instead of a runtime OOM.
    if not builtin_provider and req.generate_texture:
        try:
            from runtime.capability import (
                get_capability_vram_mb,
                get_detected_free_vram_mb,
                get_vram_safety_margin_mb,
            )
            # NOTE: use load_manifest(), NOT get_provider_metadata(). The
            # metadata view flattens capabilities into supports_* booleans,
            # so caps.get("texture_pbr") would be None there — reading it
            # from the metadata view made has_texture_cap False for every
            # model and silently disabled texture for Hunyuan3D 2.1/TRELLIS.
            from runtime.manifest_loader import load_manifest

            manifest = load_manifest(provider)
            caps = manifest.get("capabilities") or {}
            has_texture_cap = any(
                isinstance(c, dict) and c.get("enabled")
                for key, c in caps.items()
                if key in ("texture_pbr", "texture")
            )
            if not has_texture_cap:
                # ponytail: don't reject — coerce to mesh-only. A client that
                # sends generate_texture=true for a model that cannot texture
                # (TripoSG, Hunyuan3D-2mini) should still succeed, just without
                # texture, rather than 400. The UI hides the toggle for these
                # models anyway; this is a defensive default for API callers.
                logger.info(
                    "Coercing generate_texture=false for '%s': manifest has no texture capability",
                    provider,
                )
                req.generate_texture = False
                needed = 0
                free = 0
                margin = 0
            else:
                needed = get_capability_vram_mb(provider, "texture_pbr") or get_capability_vram_mb(provider, "texture")
                free = get_detected_free_vram_mb()
                margin = get_vram_safety_margin_mb()
            if free and needed and free < needed + margin:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Insufficient VRAM for textured generation with '{provider}': "
                        f"texture needs ~{round(needed / 1024)} GB, "
                        f"{round(free / 1024)} GB available "
                        f"(includes {round(margin / 1024)} GB safety margin). "
                        f"Disable texture to generate mesh-only (~{round(get_capability_vram_mb(provider, 'shape') / 1024)} GB), "
                        f"or switch to a smaller model."
                    ),
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Texture VRAM check failed for %s: %s", provider, exc)

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
                low_vram=req.low_vram,
                vram_mode=req.vram_mode,
                processing_metadata={
                    "detail_pass": req.detail_pass,
                    "detail_guidance": req.detail_guidance,
                    "workspace": req.workspace,
                    "postprocess": req.postprocess,
                    "skip_postprocessing": req.skip_postprocessing,
                    "auto_optimize": req.auto_optimize,
                    "auto_optimize_settings": req.auto_optimize_settings.model_dump() if req.auto_optimize_settings else None,
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
            # ponytail: Ensure flush so job is queryable immediately after
            await session.refresh(job)
    except Exception as exc:
        logger.exception("Failed to persist generation job %s", job_id)
        raise HTTPException(
            status_code=503,
            detail=f"Failed to create generation job: {exc}",
        )

    try:
        task_res = generate_3d_model.delay(job_id)
        if getattr(task_res, "id", None):
            try:
                async with AsyncSessionLocal() as session:
                    job = await session.get(GenerationJob, job_id)
                    if job:
                        meta = dict(job.processing_metadata or {})
                        meta["celery_task_id"] = task_res.id
                        job.processing_metadata = meta
                        await session.commit()
            except Exception as meta_exc:
                logger.warning("Could not persist celery_task_id for %s: %s", job_id, meta_exc)
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
                    job.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
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

    Marks the job as cancelled in the DB (single source of truth). Also revokes
    the Celery worker task to terminate running background compute immediately.
    """
    from app.database import AsyncSessionLocal
    from app.models.job import GenerationJob

    try:
        celery_task_id = None
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
            job.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            celery_task_id = (job.processing_metadata or {}).get("celery_task_id")
            await session.commit()

        if celery_task_id:
            try:
                from app.celery_app import celery_app
                celery_app.control.revoke(celery_task_id, terminate=True, signal="SIGUSR1")
                logger.info("Revoked Celery task %s for job %s", celery_task_id, job_id)
            except Exception as e:
                logger.warning("Failed to revoke Celery task %s: %s", celery_task_id, e)

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
                "message": meta.get("current_message") or _get_stage_message(job.stage, job.progress),
                "logs": meta.get("logs") or [],
                "pipeline_stages": meta.get("pipeline_stages") or [],
                "mode": job.mode,
                "prompt": job.prompt,
                "provider": job.provider,
                "error_message": job.error_message,
                "detail_pass": meta.get("detail_pass", False),
                "low_vram": job.low_vram,
                "vram_mode": job.vram_mode,
                "auto_optimize": meta.get("auto_optimize", False),
                "auto_optimize_result": meta.get("auto_optimize_result"),
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
                    "source_model_url": meta.get("source_model_url") or job.model_url,
                    "game_ready_url": meta.get("game_ready_url"),
                    "active_model_url": meta.get("active_model_url") or job.model_url,
                    "lod_urls": meta.get("lod_urls") or [],
                    "collision_url": meta.get("collision_url"),
                    "qa_report": meta.get("qa_report"),
                    "pipeline_stages": meta.get("pipeline_stages") or [],
                    "pbr_maps": meta.get("pbr_maps"),
                    "pbr_resolution": meta.get("pbr_resolution"),
                }

            return success(response)

    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Failed to get job status for %s: %s", job_id, exc)
        return error("Failed to retrieve job status")


@router.get("/{job_id}/stream")
async def generation_progress_stream(job_id: str, request: Request):
    """SSE stream of generation progress for a specific job."""
    from fastapi.responses import StreamingResponse
    import redis.asyncio as redis
    import asyncio
    import json

    # Validate job exists before opening SSE stream
    from app.database import AsyncSessionLocal
    from app.models.job import GenerationJob
    async with AsyncSessionLocal() as session:
        job = await session.get(GenerationJob, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")

    async def _event_generator():
        from app.core.redis_client import get_async_redis
        r = await get_async_redis()
        pubsub = r.pubsub()
        channel = f"job_progress:{job_id}"
        await pubsub.subscribe(channel)

        try:
            # Yield initial state from DB if available
            try:
                from app.database import AsyncSessionLocal
                from app.models.job import GenerationJob
                async with AsyncSessionLocal() as session:
                    job = await session.get(GenerationJob, job_id)
                    if job:
                        yield f"data: {json.dumps({'status': job.status, 'progress': job.progress, 'stage': job.stage, 'message': 'Initial state'})}\n\n"
                        if job.status in ("completed", "failed", "cancelled"):
                            return
            except Exception as exc:
                logger.warning("SSE initial state fetch failed for %s: %s", job_id, exc)

            while True:
                # Check for client disconnect
                if await request.is_disconnected():
                    break
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message:
                    data = message["data"]
                    yield f"data: {data}\n\n"
                    # Stop if job reaches terminal state
                    try:
                        payload = json.loads(data)
                        if payload.get("status") in ("completed", "failed", "cancelled"):
                            break
                    except Exception:
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


async def _check_rate_limit(client_ip: str, max_requests: int, window_seconds: int) -> bool:
    """Redis-backed sliding-window rate limiter.

    Returns True if the request is allowed, False if rate limited.
    Uses a Redis sorted set to track request timestamps per IP.
    """
    try:
        from app.core.redis_client import get_async_redis

        r = await get_async_redis()
        key = f"rate_limit:gen:{client_ip}"
        now = datetime.now(timezone.utc).timestamp()
        window_start = now - window_seconds

        pipe = r.pipeline()
        # Remove entries outside the window
        pipe.zremrangebyscore(key, 0, window_start)
        # Count current entries in window
        pipe.zcard(key)
        # Add current request
        pipe.zadd(key, {f"{now}:{uuid.uuid4()}": now})
        # Set expiry on the key
        pipe.expire(key, window_seconds)
        results = await pipe.execute()

        # results[1] is the count of existing entries before adding current
        current_count = results[1]
        return current_count < max_requests
    except Exception as exc:
        # Never block generation on rate-limit check failure
        logger.warning("Rate limit check failed for %s: %s", client_ip, exc)
        return True


class EnhancePromptRequest(BaseModel):
    prompt: str


@router.post("/enhance-prompt")
async def api_enhance_prompt(req: EnhancePromptRequest):
    """Expand user prompt with 3D domain descriptors (Meshy/Tripo AI style)."""
    from app.core.prompt_enhancer import enhance_prompt

    enhanced = await enhance_prompt(req.prompt)
    return success({"prompt": req.prompt, "enhanced_prompt": enhanced}, "Prompt enhanced successfully.")

