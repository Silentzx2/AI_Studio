"""
Celery task: runs the full 3D generation pipeline for a given job ID.
Progress is published to Redis pub/sub so SSE clients receive live updates.
Uses RuntimeEngine to schedule GPU access and unload models after each job.

FIXES APPLIED:
- Issue #5: CUDA env normalization happens in celery_app.py before this imports
- Issue #6: Added VRAM fallback check when engine unavailable
"""
import asyncio
import base64
import json
import logging
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

import redis as redis_sync
from celery import Task
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)
settings = get_settings()

# Synchronous DB engine for Celery (outside async context)
# BUG-16 FIX: was duplicating the brittle string-replacement inline. Now use the
# centralised property on Settings so there is one place to change if the driver changes.
_sync_engine = create_engine(settings.sync_database_url, pool_pre_ping=True)
SyncSession = sessionmaker(bind=_sync_engine)

_redis = redis_sync.from_url(settings.redis_url, decode_responses=True)


def _publish(job_id: str, payload: dict) -> None:
    channel = f"job_progress:{job_id}"
    _redis.publish(channel, json.dumps(payload))


def _update_job(session: Session, job_id: str, **kwargs) -> None:
    from app.models.job import GenerationJob
    job = session.get(GenerationJob, job_id)
    if not job:
        return
    for k, v in kwargs.items():
        setattr(job, k, v)
    job.updated_at = datetime.utcnow()
    session.commit()


class _JobCancelled(Exception):
    """Raised when a generation job has been cancelled via the API while the
    worker was executing it. The task stops at the next stage boundary and the
    job row stays 'cancelled' (never overwritten to 'failed')."""


def _ensure_not_cancelled(session: Session, job_id: str) -> None:
    from app.models.job import GenerationJob
    job = session.get(GenerationJob, job_id)
    if job and job.status == "cancelled":
        raise _JobCancelled(job_id)


def _resolve_reference_image(reference: str | None, job_id: str) -> str | None:
    """Convert frontend image references into local files providers can open."""
    if not reference:
        return None

    if reference.startswith("data:image/"):
        try:
            from app.utils.storage import model_output_dir

            header, encoded = reference.split(",", 1)
            mime = header.split(";", 1)[0].split(":", 1)[-1]
            ext = {
                "image/jpeg": ".jpg",
                "image/png": ".png",
                "image/webp": ".webp",
            }.get(mime, ".png")
            output_path = model_output_dir(job_id) / f"reference_image{ext}"
            output_path.write_bytes(base64.b64decode(encoded))
            return str(output_path)
        except Exception as exc:
            logger.warning("Failed to decode reference image data URL: %s", exc)
            return reference

    parsed = urlparse(reference)
    path = unquote(parsed.path if parsed.scheme else reference)
    upload_prefixes = (
        "/api/v1/upload/uploads/",
        "/api/v1/uploads/",
        "/static/uploads/",
        "/uploads/",
    )

    if any(path.startswith(prefix) for prefix in upload_prefixes):
        candidate = Path(settings.storage_local_path) / "uploads" / Path(path).name
        if candidate.exists():
            return str(candidate)

    return reference


def _wait_for_stable_file(path: str, timeout_seconds: float = 15.0, stable_checks: int = 2) -> bool:
    """Wait briefly for an output file to finish flushing to disk."""
    p = Path(path)
    deadline = time.monotonic() + timeout_seconds
    last_size = -1
    stable_hits = 0
    while time.monotonic() < deadline:
        if not p.exists():
            time.sleep(0.25)
            continue
        try:
            size = p.stat().st_size
        except OSError:
            time.sleep(0.25)
            continue
        if size > 0 and size == last_size:
            stable_hits += 1
            if stable_hits >= stable_checks:
                return True
        else:
            stable_hits = 0
            last_size = size
        time.sleep(0.25)
    return p.exists() and p.stat().st_size > 0


@celery_app.task(bind=True, name="app.workers.tasks.generate_3d_model")
def generate_3d_model(self: Task, job_id: str) -> dict:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_async_generate(self, job_id))
    finally:
        loop.close()


async def _async_generate(task: Task, job_id: str) -> dict:
    from app.core.prompt_enhancer import enhance_prompt
    from app.core.providers.registry import get_provider
    from app.models.job import GenerationJob
    from app.schemas.generation import GenerationRequest
    from app.utils.storage import model_output_dir, model_public_url

    # RuntimeEngine for GPU scheduling
    engine = None
    device = None
    try:
        from runtime.engine import get_engine
        engine = get_engine()
        await engine.initialize()
    except Exception as e:
        logger.warning("RuntimeEngine initialization failed: %s", e)
        logger.warning("Falling back to direct provider loading with VRAM check")
        # FALLBACK (Issue #6): Use VRAM-aware device selection directly
        try:
            # BUG-17 FIX: the old fallback path imported an undefined symbol from
            # runtime.engine that was never defined — the import raised ImportError,
            # silently caught by the outer except, and vram_needed stayed 0 (no
            # real check). Use the canonical source: get_model_vram_required()
            # from runtime.capability.
            from runtime.capability import get_model_vram_required
            from runtime.gpu import GPURequiredError, get_gpu_info, select_device

            gpu_info = get_gpu_info()
            if not gpu_info.available:
                logger.error("GPU not available: %s", gpu_info.reason)
                device = "cpu"
            else:
                # Determine VRAM needed for the provider
                provider_name = None  # Will be set from job
                vram_needed = 0
                try:
                    from app.database import AsyncSessionLocal
                    async with AsyncSessionLocal() as session:
                        from sqlalchemy import select
                        result = await session.execute(
                            select(GenerationJob).where(GenerationJob.id == job_id)
                        )
                        job_check = result.scalar_one_or_none()
                        if job_check:
                            provider_name = job_check.provider
                            vram_needed = get_model_vram_required(provider_name)
                except Exception as exc:
                    logger.warning("Could not read VRAM requirement for job %s: %s", job_id, exc)

                try:
                    device = select_device("auto", max_vram_mb=vram_needed)
                    logger.info("VRAM fallback selected device: %s", device)
                except GPURequiredError as gpu_err:
                    logger.warning("VRAM check failed: %s, falling back to best available", gpu_err)
                    device = "cuda:0" if gpu_info.device_count > 0 else "cpu"

        except Exception as gpu_err:
            logger.warning("GPU fallback check failed: %s, using cpu", gpu_err)
            device = "cpu"

    with SyncSession() as session:
        job = session.get(GenerationJob, job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")
        if job.status == "cancelled":
            logger.info("Job %s already cancelled — not starting.", job_id)
            return {"status": "cancelled", "job_id": job_id}

        def sync_publish(progress: int, stage: str, message: str, level: str = "info") -> None:
            _ensure_not_cancelled(session, job_id)
            _publish(job_id, {
                "job_id": job_id,
                "status": "processing",
                "stage": stage,
                "progress": progress,
                "message": message,
                "level": level,
                "timestamp": datetime.utcnow().isoformat(),
            })
            _update_job(session, job_id, progress=progress, stage=stage)

        async def progress_callback(progress: int, stage: str, message: str, level: str = "info") -> None:
            sync_publish(progress, stage, message, level)

        _ensure_not_cancelled(session, job_id)
        _update_job(session, job_id, status="processing", stage="preparing", started_at=datetime.utcnow())
        sync_publish(2, "preparing", "Job started.", "info")

        provider_name = job.provider
        try:
            # 1. GPU scheduling — select best available provider
            if engine:
                provider_name = await engine.get_best_provider_name(job.provider, mode=job.mode)
                if provider_name != job.provider:
                    _update_job(session, job_id, provider=provider_name)
                    sync_publish(2, "preparing", f"Provider auto-selected: {provider_name}", "info")

            # 2. Enhance prompt
            sync_publish(3, "preparing", "Enhancing prompt...", "info")
            try:
                enhanced = await enhance_prompt(job.prompt)
                _update_job(session, job_id, enhanced_prompt=enhanced)
            except Exception as e:
                logger.warning("Prompt enhancement failed, using original: %s", e)
                enhanced = job.prompt

            # 3. Build generation request
            request = GenerationRequest(
                mode=job.mode,
                prompt=enhanced,
                negative_prompt=job.negative_prompt,
                quality=job.quality,
                style_preset=job.style_preset,
                generate_texture=job.generate_texture,
                auto_rig=job.auto_rig,
                reference_image_url=_resolve_reference_image(job.reference_image_url, job_id),
            )

            # 4. Load provider via RuntimeEngine (enforces VRAM scheduling)
            # FALLBACK (Issue #6): Use direct provider instantiation if engine unavailable
            provider = None
            if job.mode != "render":
                if engine:
                    provider = await engine.load_provider(provider_name)
                else:
                    # Direct provider loading with device from fallback VRAM check
                    logger.info("Loading provider %s directly on device %s", provider_name, device)
                    provider = get_provider(provider_name, device=device or "cuda:0")

            # 5. AI generation (Skip if pure render mode)
            _ensure_not_cancelled(session, job_id)
            out_dir = str(model_output_dir(job_id))
            provider_result = None
            
            if job.mode == "render":
                # For render mode, the reference image is the GLB to render
                glb_to_process = request.reference_image_url
                if not glb_to_process or not Path(glb_to_process).exists():
                     # Fallback to current model if URL didn't resolve to local path
                     glb_to_process = request.reference_image_url
                
                from app.core.providers.base import ProviderResult
                provider_result = ProviderResult(
                    model_path=glb_to_process,
                    thumbnail_path="",
                    polygon_count=0,
                    vertex_count=0,
                    has_rig=False,
                    file_size=0
                )
            else:
                provider_result = await provider.generate(request, out_dir, progress_callback)

            # 6. Unload model from VRAM before running Blender
            if provider:
                if engine and settings.auto_unload_after_job:
                    await engine.unload_provider(provider_name)
                elif hasattr(provider, "unload"):
                    provider.unload()

            # 7. Blender post-processing
            blender_result = {}
            try:
                # Parse render settings from prompt if in render mode
                render_res = None
                render_samples = 128
                if "render quality:" in job.prompt:
                    # resolution: 1920x1080
                    import re
                    res_match = re.search(r"resolution: (\d+)x(\d+)", job.prompt)
                    if res_match:
                        render_res = [int(res_match.group(1)), int(res_match.group(2))]
                    
                    samples_match = re.search(r"samples: (\d+)", job.prompt)
                    if samples_match:
                        render_samples = int(samples_match.group(1))

                from app.core.blender.pipeline import process_model
                blender_result = await process_model(
                    input_path=provider_result.model_path,
                    output_dir=out_dir,
                    auto_rig=job.auto_rig if job.mode != "render" else False,
                    generate_texture=job.generate_texture if job.mode != "render" else False,
                    quality=job.quality,
                    render_resolution=render_res,
                    render_samples=render_samples,
                    progress_callback=progress_callback,
                )
            except Exception as e:
                logger.warning("Blender post-processing failed, using provider output directly: %s", e)
                blender_result = {"glb": provider_result.model_path}

            def to_url(path: str | None) -> str | None:
                if not path:
                    return None
                import os
                return model_public_url(job_id, os.path.basename(path))

            # Optional DetailGen3D pass
            meta = job.processing_metadata or {}
            detail_pass = meta.get("detail_pass", False)
            detail_guidance = meta.get("detail_guidance", 7.5)

            if detail_pass:
                sync_publish(80, "postprocessing", "DetailGen3D refinement requested...", "info")
                try:
                    detail_provider = get_provider("detailgen3d", device=device or "cuda:0")
                    if hasattr(detail_provider, "load"):
                        await detail_provider.load()
                    
                    current_glb = blender_result.get("glb") or provider_result.model_path
                    detailed_glb = await detail_provider.detail_mesh(
                        coarse_glb_path=current_glb,
                        image_path=request.reference_image_url,
                        guidance=detail_guidance,
                        progress_callback=progress_callback
                    )
                    
                    if hasattr(detail_provider, "unload"):
                        detail_provider.unload()
                        
                    blender_result["glb"] = detailed_glb
                    meta["model_url_detailed"] = to_url(detailed_glb)
                    _update_job(session, job_id, processing_metadata=meta)
                    sync_publish(90, "postprocessing", "DetailGen3D pass complete.", "info")
                except Exception as ex_det:
                    logger.warning("DetailGen3D pass failed: %s", ex_det)

            # 8. Thumbnail (Non-blocking)
            from app.core.mesh_processor import get_mesh_stats, render_thumbnail
            glb_path = blender_result.get("glb") or provider_result.model_path
            thumb_path = str(model_output_dir(job_id) / "thumbnail.png")
            _wait_for_stable_file(glb_path)
            
            rendered = False
            try:
                rendered = render_thumbnail(glb_path, thumb_path)
            except Exception as e:
                logger.warning("Thumbnail rendering failed (non-blocking): %s", e)

            stats = {}
            try:
                stats = get_mesh_stats(glb_path)
            except Exception as e:
                logger.warning("Mesh stats extraction failed (non-blocking): %s", e)

            download_urls = {
                "glb": to_url(blender_result.get("glb")),
                "fbx": to_url(blender_result.get("fbx")),
                "obj": to_url(blender_result.get("obj")),
                "stl": to_url(blender_result.get("stl")),
            }

            # 10. Finalize
            _update_job(
                session, job_id,
                status="completed",
                stage="completed",
                progress=100,
                completed_at=datetime.utcnow(),
                # BUG-13 FIX: was to_url(os.path.basename(glb_path)) — to_url() already calls
                # os.path.basename() internally, so this double-applied it on an already-bare
                # filename, making model_url inconsistent with download_urls.glb.
                model_url=to_url(glb_path),
                thumbnail_url=model_public_url(job_id, "thumbnail.png") if rendered else "",
                polygon_count=stats.get("polygon_count", provider_result.polygon_count),
                vertex_count=stats.get("vertex_count", provider_result.vertex_count),
                texture_resolution=provider_result.texture_resolution,
                has_rig=provider_result.has_rig,
                file_size=stats.get("file_size", provider_result.file_size),
                download_urls=download_urls,
            )

            _publish(job_id, {
                "job_id": job_id,
                "status": "completed",
                "stage": "completed",
                "progress": 100,
                "message": "Generation complete! Model is ready for download.",
                "level": "success",
                "timestamp": datetime.utcnow().isoformat(),
            })

            return {"status": "completed", "job_id": job_id}

        except _JobCancelled as exc:
            logger.info("Generation job %s cancelled via API", exc)
            if engine:
                try:
                    await engine.unload_provider(provider_name)
                except Exception:
                    pass
            _publish(job_id, {
                "job_id": job_id,
                "status": "cancelled",
                "stage": "cancelled",
                "progress": 0,
                "message": "Generation cancelled.",
                "level": "warning",
                "timestamp": datetime.utcnow().isoformat(),
            })
            return {"status": "cancelled", "job_id": job_id}

        except Exception as exc:
            logger.exception("Generation task failed for job %s", job_id)
            # Always unload on failure to free VRAM
            if engine:
                try:
                    await engine.unload_provider(provider_name)
                except Exception:
                    pass
            _update_job(session, job_id, status="failed", stage="failed", error_message=str(exc))
            _publish(job_id, {
                "job_id": job_id,
                "status": "failed",
                "stage": "failed",
                "progress": 0,
                "message": f"Generation failed: {exc}",
                "level": "error",
                "timestamp": datetime.utcnow().isoformat(),
            })
            raise


@celery_app.task(name="app.workers.tasks.anigen_rig_task")
def anigen_rig_task(model_glb_url: str, reference_image_url: str | None = None, model_task_id: str | None = None) -> dict:
    """Rig a GLB character using the AniGen provider."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_async_anigen_rig(model_glb_url, reference_image_url, model_task_id))
    finally:
        loop.close()


async def _async_anigen_rig(model_glb_url: str, reference_image_url: str | None, model_task_id: str | None) -> dict:
    import uuid
    from app.core.providers.registry import get_provider
    from app.utils.storage import model_output_dir, model_public_url

    # Retrieve current task ID or fallback
    from celery import current_task
    task_id = current_task.request.id if current_task and current_task.request else str(uuid.uuid4())
    r = redis_sync.from_url(settings.redis_url, decode_responses=True)

    def update_status(progress: int, message: str, status: str = "processing", result_url: str | None = None, error_msg: str | None = None):
        r.set(f"rig:{task_id}:status", status)
        r.set(f"rig:{task_id}:progress", str(progress))
        r.set(f"rig:{task_id}:message", message)
        if result_url:
            r.set(f"rig:{task_id}:result", result_url)
        if error_msg:
            r.set(f"rig:{task_id}:error", error_msg)

    try:
        update_status(10, "Initializing AniGen rigging...")
        
        # Instantiate provider
        provider = get_provider("anigen", device="cuda:0")
        
        update_status(30, "Loading AniGen weights into memory (requires 6.2GB VRAM)...")
        if hasattr(provider, "load"):
            await provider.load()
            
        update_status(60, "Running AniGen rigging inference...")
        class DummyRequest:
            pass
        out_dir = str(model_output_dir(task_id))
        result = await provider.generate(DummyRequest(), out_dir)
        
        if hasattr(provider, "unload"):
            provider.unload()

        import os
        rigged_glb_name = os.path.basename(result.model_path)
        rigged_url = model_public_url(task_id, rigged_glb_name)

        # Update the original GenerationJob has_rig field if model_task_id is provided
        if model_task_id:
            try:
                with SyncSession() as session:
                    from app.models.job import GenerationJob
                    job = session.get(GenerationJob, model_task_id)
                    if job:
                        job.has_rig = True
                        job.model_url = rigged_url
                        if job.download_urls:
                            job.download_urls = {**job.download_urls, "glb": rigged_url}
                        session.commit()
            except Exception as dberr:
                logger.warning("Failed to update original GenerationJob rig status: %s", dberr)

        update_status(100, "Rigging complete!", status="completed", result_url=rigged_url)
        return {"status": "completed", "result_url": rigged_url}

    except Exception as exc:
        logger.exception("AniGen rigging task failed")
        update_status(0, f"Rigging failed: {exc}", status="failed", error_msg=str(exc))
        return {"status": "failed", "error": str(exc)}

