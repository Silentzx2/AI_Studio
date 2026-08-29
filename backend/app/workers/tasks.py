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
from datetime import datetime, timezone
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
    job.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
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


_OOM_MARKERS = (
    "out of memory", "cuda out of memory", "cuda oom",
    "cuinit error", "runtimeerror: cuda", "oom",
    "no memory to allocate", "nvidia-smi", "memory exhausted",
)


def _is_oom_error(exc: BaseException) -> bool:
    """True when an exception is a GPU OOM / memory-exhaustion failure.

    Drives the low-VRAM fallback retry: only genuine memory failures retry in
    low mode, so a code bug is not masked by an expensive double run.
    """
    msg = str(exc).lower()
    return any(marker in msg for marker in _OOM_MARKERS)


def _resolve_job_vram_mode(job) -> str:
    """Map a job's low_vram/vram_mode snapshot to an engine load mode.

    low_vram=True forces 'low'; otherwise the stored vram_mode ('auto' by
    default) is passed through so the engine's Auto VRAM planner decides.
    """
    if getattr(job, "low_vram", False):
        return "low"
    return getattr(job, "vram_mode", "auto") or "auto"


def _can_retry_low_vram(job_id: str, provider_name: str) -> bool:
    """Whether a job that OOM'd may be retried in low VRAM mode.

    Gated on the provider supporting a low-VRAM footprint so a buggy provider
    is not pointlessly double-run.
    """
    from runtime.capability import plan_vram_usage
    try:
        plan = plan_vram_usage(provider_name, "low")
        supported = bool(plan.get("fits", False)) or plan.get("cpu_only", False)
    except Exception:
        supported = False
    if not supported:
        logger.warning(
            "Job %s OOM'd but provider '%s' has no verified low VRAM mode — skipping retry",
            job_id, provider_name,
        )
        return False
    return True


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
                "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            })
            _update_job(session, job_id, progress=progress, stage=stage)

        async def progress_callback(progress: int, stage: str, message: str, level: str = "info") -> None:
            sync_publish(progress, stage, message, level)

        _ensure_not_cancelled(session, job_id)
        _update_job(session, job_id, status="processing", stage="preparing", started_at=datetime.now(timezone.utc).replace(tzinfo=None))
        sync_publish(2, "preparing", "Job started.", "info")

        provider_name = job.provider

        # Installation guard in worker (defense in depth)
        if provider_name != "mock":
            try:
                from runtime.installer import get_install_status
                status = get_install_status()
                inst = status.get(provider_name, {})
                if not inst.get("installed", False):
                    missing = []
                    if not inst.get("repo_ready", True):
                        missing.append("repo")
                    if not inst.get("venv_ready", True):
                        missing.append("venv")
                    if not inst.get("weights_ready", True):
                        missing.append("weights")
                    raise RuntimeError(
                        f"Model '{provider_name}' is not installed. "
                        f"Missing: {', '.join(missing) or 'unknown'}. "
                        f"Install it first via Model Manager or POST /api/v1/runtime/install."
                    )
            except RuntimeError:
                raise
            except Exception as exc:
                logger.warning("Worker install check failed for %s: %s", provider_name, exc)

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
            meta = job.processing_metadata or {}
            request = GenerationRequest(
                mode=job.mode,
                prompt=enhanced,
                negative_prompt=job.negative_prompt,
                quality=job.quality,
                style_preset=job.style_preset,
                generate_texture=job.generate_texture,
                auto_rig=job.auto_rig,
                reference_image_url=_resolve_reference_image(job.reference_image_url, job_id),
                mood=meta.get("mood"),
                shape=meta.get("shape"),
                style=meta.get("style"),
                preset=meta.get("preset"),
                size=meta.get("size"),
                density=meta.get("density"),
            )

            # 4. Load provider via RuntimeEngine (enforces VRAM scheduling)
            # ponytail: Low VRAM mode — resolve the job's requested mode and
            # pass it to the engine so the Auto VRAM planner picks the fitting
            # footprint (normal vs low). On OOM, retry once in low mode.
            vram_mode = _resolve_job_vram_mode(job)
            if vram_mode == "low":
                sync_publish(5, "preparing", "Low VRAM mode requested — using memory-optimized loading.", "info")

            # FALLBACK (Issue #6): Use direct provider instantiation if engine unavailable
            provider = None
            if job.mode != "render":
                if engine:
                    provider = await engine.load_provider(provider_name, vram_mode=vram_mode)
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
                try:
                    provider_result = await provider.generate(request, out_dir, progress_callback)
                except Exception as gen_exc:
                    # OOM recovery: retry once in low VRAM mode when supported.
                    if (
                        _is_oom_error(gen_exc)
                        and vram_mode != "low"
                        and                         _can_retry_low_vram(job_id, provider_name)
                    ):
                        logger.warning(
                            "Job %s OOM'd in vram_mode=%s — retrying in low VRAM mode", job_id, vram_mode
                        )
                        _update_job(session, job_id, low_vram=True, vram_mode="low")
                        if engine:
                            try:
                                await engine.unload_provider(provider_name)
                            except Exception:
                                pass
                            provider = await engine.load_provider(provider_name, vram_mode="low")
                        sync_publish(5, "preparing", "Out of memory detected — retrying with low VRAM mode.", "warn")
                        provider_result = await provider.generate(request, out_dir, progress_callback)
                    else:
                        raise

            # 5b. Output validation — reject corrupt/empty GLB output before
            # the UI ever sees it.
            if provider_result and provider_result.model_path:
                _wait_for_stable_file(provider_result.model_path)
                try:
                    from app.core.mesh_processor import validate_glb
                    glb_check = validate_glb(provider_result.model_path)
                    if not glb_check.get("valid"):
                        raise RuntimeError(
                            f"Provider produced invalid output ({glb_check.get('reason', 'unknown')}). "
                            f"Tried model file: {provider_result.model_path}"
                        )
                except RuntimeError:
                    raise
                except Exception as exc:
                    logger.warning("Output validation skipped for job %s: %s", job_id, exc)

            # 6. Unload model from VRAM before running Blender
            if provider:
                if engine and settings.auto_unload_after_job:
                    await engine.unload_provider(provider_name)
                elif hasattr(provider, "unload"):
                    provider.unload()

            # 7. Blender post-processing
            blender_result = {}
            try:
                # Parse render settings from structured JSON metadata
                render_res = None
                render_samples = 128
                meta_render = job.processing_metadata or {}
                render_settings = meta_render.get("render_settings")
                if render_settings and job.mode == "render":
                    if isinstance(render_settings, str):
                        render_settings = json.loads(render_settings)
                    res = render_settings.get("resolution")
                    if res and "x" in res:
                        parts = res.split("x")
                        render_res = [int(parts[0]), int(parts[1])]
                    if render_settings.get("samples"):
                        render_samples = int(render_settings["samples"])

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
                    from runtime.capability import get_model_vram_required
                    from runtime.gpu import check_vram_sufficient
                    detail_vram = get_model_vram_required("detailgen3d")
                    if detail_vram > 0:
                        vram_ok, vram_msg = check_vram_sufficient(detail_vram, device=device or "cuda:0")
                        if not vram_ok:
                            logger.warning("DetailGen3D skipped: %s", vram_msg)
                            sync_publish(85, "postprocessing", f"DetailGen3D skipped: {vram_msg}", "warning")
                            meta["detail_pass_error"] = vram_msg
                            _update_job(session, job_id, processing_metadata=meta)
                            detail_pass = False
                    if detail_pass:
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

            glb_path = blender_result.get("glb") or provider_result.model_path

            # 7b. Auto-optimize mesh (post-generation cleanup)
            # Runs after generation + detail pass but BEFORE thumbnail generation.
            # If optimization fails, the original model is returned (graceful fallback).
            meta = job.processing_metadata or {}
            auto_optimize = meta.get("auto_optimize", False)
            auto_optimize_settings = meta.get("auto_optimize_settings") or {}
            optimize_result = None

            if auto_optimize and glb_path and Path(glb_path).exists():
                sync_publish(85, "optimizing", "Auto-optimizing mesh (decimation + UV fix)...", "info")
                try:
                    from app.core.mesh_optimizer import optimize_mesh

                    target_polycount = auto_optimize_settings.get("target_polycount", 30000)
                    fix_uvs = auto_optimize_settings.get("fix_uvs", True)
                    preserve_details = auto_optimize_settings.get("preserve_details", 75.0)

                    optimized_path = str(Path(glb_path).with_suffix(".optimized.glb"))
                    optimize_result = optimize_mesh(
                        input_path=glb_path,
                        output_path=optimized_path,
                        target_polycount=target_polycount,
                        fix_uvs=fix_uvs,
                        preserve_details=preserve_details,
                    )

                    if optimize_result.get("success"):
                        # Replace the working GLB with the optimized version
                        import shutil
                        shutil.move(optimized_path, glb_path)
                        meta["auto_optimize_result"] = optimize_result
                        _update_job(session, job_id, processing_metadata=meta)
                        sync_publish(88, "optimizing",
                            f"Auto-optimize complete: {optimize_result['reduction_percent']}% poly reduction",
                            "success")
                    else:
                        # Optimization failed — keep original, log the error
                        logger.warning("Auto-optimize failed for job %s: %s",
                            job_id, optimize_result.get("error", "unknown"))
                        sync_publish(88, "optimizing",
                            f"Auto-optimize skipped: {optimize_result.get('error', 'unknown error')}",
                            "warning")
                        # Clean up failed optimization output
                        if Path(optimized_path).exists():
                            Path(optimized_path).unlink()
                        meta["auto_optimize_error"] = optimize_result.get("error")
                        _update_job(session, job_id, processing_metadata=meta)
                except Exception as opt_exc:
                    logger.warning("Auto-optimize step failed (non-blocking): %s", opt_exc)
                    sync_publish(88, "optimizing", "Auto-optimize skipped due to error", "warning")
                    meta["auto_optimize_error"] = str(opt_exc)
                    _update_job(session, job_id, processing_metadata=meta)

            # 8. Thumbnail (Non-blocking)
            from app.core.mesh_processor import get_mesh_stats, render_thumbnail
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
                completed_at=datetime.now(timezone.utc).replace(tzinfo=None),
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
                "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
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
                "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
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
                "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
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

