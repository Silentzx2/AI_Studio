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
import inspect
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
    try:
        _redis.publish(channel, json.dumps(payload))
    except Exception as exc:
        # Redis is a progress transport, not the job source of truth. A broker
        # outage must not fail an otherwise valid generation task because the
        # frontend can fall back to DB status polling.
        logger.warning("Progress publish failed for job %s: %s", job_id, exc)


def _update_job(session: Session, job_id: str, **kwargs) -> None:
    from app.models.job import GenerationJob
    job = session.get(GenerationJob, job_id)
    if not job:
        return
    for k, v in kwargs.items():
        setattr(job, k, v)
    job.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    # No commit — let the outer SyncSession context manager handle a single
    # atomic commit at the end. This avoids partial-state persistence on crash
    # and reduces DB round-trips during generation.


class _JobCancelled(Exception):
    """Raised when a generation job has been cancelled via the API while the
    worker was executing it. The task stops at the next stage boundary and the
    job row stays 'cancelled' (never overwritten to 'failed')."""


def _ensure_not_cancelled(session: Session, job_id: str) -> None:
    from app.models.job import GenerationJob
    job = session.get(GenerationJob, job_id)
    if job:
        session.refresh(job)
        if job.status == "cancelled":
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

    if Path(reference).exists():
        return reference

    parsed = urlparse(reference)
    path = unquote(parsed.path if parsed.scheme else reference)

    storage_root = Path(settings.storage_local_path)
    if "/static/" in path:
        rel = path.split("/static/", 1)[-1].lstrip("/")
        candidate = storage_root / rel
        if candidate.exists():
            return str(candidate)

    upload_prefixes = (
        "/api/v1/upload/uploads/",
        "/api/v1/uploads/",
        "/uploads/",
    )

    if any(path.startswith(prefix) for prefix in upload_prefixes):
        candidate = storage_root / "uploads" / Path(path).name
        if candidate.exists():
            return str(candidate)

    # Search in storage subdirectories (models, uploads, exports)
    for folder in ("models", "exports", "uploads", "generated"):
        if f"/{folder}/" in path or path.startswith(f"{folder}/"):
            rel = path.split(f"{folder}/", 1)[-1].lstrip("/")
            candidate = storage_root / folder / rel
            if candidate.exists():
                return str(candidate)

    # Search by filename across storage_root
    fname = Path(path).name
    if fname:
        for sub in ("models", "uploads", "exports"):
            cand = storage_root / sub / fname
            if cand.exists():
                return str(cand)
            matches = list((storage_root / sub).glob(f"*/{fname}"))
            if matches:
                return str(matches[0])

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


def _is_oom_error(exc: BaseException) -> bool:
    """True when an exception is a GPU OOM / memory-exhaustion failure.

    Drives the low-VRAM fallback retry: only genuine memory failures retry in
    low mode, so a code bug is not masked by an expensive double run.
    """
    try:
        from runtime.model_env import is_resource_error
        return is_resource_error(str(exc))
    except ImportError:
        # Fallback if model_env not available
        msg = str(exc).lower()
        return any(m in msg for m in ("out of memory", "cuda out of memory", "oom", "memory exhausted"))


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
            # The frontend also polls the DB as a durable fallback to SSE.
            # Commit each published progress point so both channels observe
            # the same authoritative state.
            session.commit()

        async def progress_callback(progress: int, stage: str, message: str, level: str = "info") -> None:
            sync_publish(progress, stage, message, level)

        _ensure_not_cancelled(session, job_id)
        _update_job(session, job_id, status="processing", stage="preparing", started_at=datetime.now(timezone.utc).replace(tzinfo=None))
        sync_publish(2, "preparing", "Job started.", "info")

        provider_name = job.provider

        try:
            # Installation guard in worker (defense in depth). Only missing
            # installation prerequisites block here; RuntimeEngine handles
            # dynamic VRAM/preflight decisions at execution time.
            if provider_name not in {"mock", "builtin-remesh", "builtin-render"}:
                try:
                    from runtime.installer import get_install_status
                    status = get_install_status()
                    inst = status.get(provider_name, {})
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
                        raise RuntimeError(
                            f"Model '{provider_name}' is not installed/usable yet. "
                            f"Missing: {', '.join(missing)}."
                        )
                except RuntimeError:
                    raise
                except Exception as exc:
                    logger.warning("Worker install check failed for %s: %s", provider_name, exc)

            # 1. Built-in mesh workflow needs no AI provider. Other modes are
            # scheduled through RuntimeEngine.
            out_dir = str(model_output_dir(job_id))
            provider = None
            provider_result = None

            if job.mode != "remesh" and engine:
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
            source_mesh_raw = meta.get("source_mesh_url")
            ref_img_raw = job.reference_image_url

            resolved_source_mesh = _resolve_reference_image(source_mesh_raw, job_id) if source_mesh_raw else None
            resolved_ref_image = _resolve_reference_image(ref_img_raw, job_id) if ref_img_raw else None

            # Fallback: if source_mesh wasn't explicitly set but reference_image points to a 3D mesh
            if not resolved_source_mesh and resolved_ref_image:
                clean_ref = resolved_ref_image.split("?")[0].lower()
                if any(clean_ref.endswith(ext) for ext in (".glb", ".gltf", ".obj")):
                    resolved_source_mesh = resolved_ref_image
                    if job.mode in ("remesh", "texture-generation"):
                        resolved_ref_image = None

            request = GenerationRequest(
                mode=job.mode,
                prompt=enhanced,
                negative_prompt=job.negative_prompt,
                quality=job.quality,
                style_preset=job.style_preset,
                generate_texture=job.generate_texture,
                auto_rig=job.auto_rig,
                reference_image_url=resolved_ref_image,
                source_mesh_url=resolved_source_mesh,
                remesh_settings=meta.get("remesh_settings"),
                mood=meta.get("mood"),
                shape=meta.get("shape"),
                style=meta.get("style"),
                preset=meta.get("preset"),
                size=meta.get("size"),
                density=meta.get("density"),
            )

            # 4. Resolve VRAM mode for AI providers. Built-in mesh workflows do
            # not acquire a model slot.
            vram_mode = _resolve_job_vram_mode(job)
            if vram_mode == "low":
                sync_publish(5, "preparing", "Low VRAM mode requested — using memory-optimized loading.", "info")

            _ensure_not_cancelled(session, job_id)

            if job.mode == "remesh":
                source_mesh_raw = request.source_mesh_url or request.reference_image_url
                source_mesh = _resolve_reference_image(source_mesh_raw, job_id) if source_mesh_raw else None
                if not source_mesh or not Path(source_mesh).exists():
                    raise RuntimeError("Remesh requires a selected local GLB/mesh asset. Select a model in the workspace and try again.")
                remesh_settings = request.remesh_settings or {}
                target_faces = int(remesh_settings.get("targetFaces") or remesh_settings.get("target_polycount") or 30000)
                target_faces = max(1000, min(target_faces, 500000))
                sync_publish(12, "remeshing", f"Remeshing mesh to approximately {target_faces:,} triangles.", "info")
                from app.core.mesh_optimizer import optimize_mesh
                remeshed_path = str(Path(out_dir) / "remeshed.glb")
                preserve_raw = remesh_settings.get("detailPreservation", 75.0)
                preserve_val = float(preserve_raw) if float(preserve_raw) > 1.0 else float(preserve_raw) * 100.0
                result = optimize_mesh(
                    input_path=source_mesh,
                    output_path=remeshed_path,
                    target_polycount=target_faces,
                    fix_uvs=bool(remesh_settings.get("preserveUVs", True)),
                    preserve_details=preserve_val,
                    remesh_mode=str(remesh_settings.get("mode", "adaptive")),
                    voxel_size=float(remesh_settings.get("voxelSize", 0.05)),
                )
                if not result.get("success"):
                    raise RuntimeError(result.get("error") or "Mesh remeshing/optimization failed")
                from app.core.providers.base import ProviderResult
                provider_result = ProviderResult(
                    model_path=remeshed_path,
                    thumbnail_path="",
                    polygon_count=int(result.get("optimized_polycount") or 0),
                    vertex_count=int(result.get("optimized_vertex_count") or 0),
                    texture_resolution=None,
                    has_rig=False,
                    file_size=Path(remeshed_path).stat().st_size,
                    metadata={"operation": "remesh", "optimizer": result},
                )
                sync_publish(20, "remeshing", "Remesh complete.", "success")
            else:
                # 5. Load provider via RuntimeEngine (enforces VRAM scheduling)
                if job.mode != "render":
                    if engine:
                        provider = await engine.load_provider(provider_name, vram_mode=vram_mode)
                    else:
                        logger.info("Loading provider %s directly on device %s", provider_name, device)
                        provider = get_provider(
                            provider_name,
                            device=device or "cuda:0",
                            low_vram=(vram_mode == "low"),
                        )

                # 6. AI generation (skip model loading for render mode)
                if job.mode == "render":
                    glb_to_process = request.reference_image_url
                    if not glb_to_process or not Path(glb_to_process).exists():
                        raise RuntimeError("Render requires a selected local GLB/mesh asset.")
                    from app.core.providers.base import ProviderResult
                    provider_result = ProviderResult(
                        model_path=glb_to_process,
                        thumbnail_path="",
                        polygon_count=0,
                        vertex_count=0,
                        texture_resolution=None,
                        has_rig=False,
                        file_size=Path(glb_to_process).stat().st_size,
                        metadata={"operation": "render"},
                    )
                else:
                    try:
                        provider_result = await provider.generate(request, out_dir, progress_callback)
                    except Exception as gen_exc:
                        # OOM recovery: retry once in low VRAM mode when supported.
                        if (
                            _is_oom_error(gen_exc)
                            and vram_mode != "low"
                            and _can_retry_low_vram(job_id, provider_name)
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

            # 6. Model retention & warm-cache policy: keep loaded in VRAM for 5 minutes
            # Consecutive requests with the same model are instant; if a different model
            # is selected, RuntimeEngine.load_provider unloads this one first.
            keep_alive = getattr(settings, "model_keep_alive_seconds", 300)
            if provider:
                if engine:
                    engine.touch_provider(provider_name)
                    if keep_alive == 0 and settings.auto_unload_after_job:
                        await engine.unload_provider(provider_name)
                    else:
                        logger.info(
                            "Warm-cache: retained provider '%s' in VRAM (keep-alive=%ss)",
                            provider_name, keep_alive,
                        )
                elif hasattr(provider, "unload"):
                    if keep_alive == 0 and settings.auto_unload_after_job:
                        provider.unload()

            # Helper for constructing public URLs
            def to_url(path: str | None) -> str | None:
                if not path:
                    return None
                p = Path(path)
                root = model_output_dir(job_id)
                try:
                    rel = p.relative_to(root).as_posix()
                    return model_public_url(job_id, rel)
                except Exception:
                    return model_public_url(job_id, p.name)

            # 7a. Master Preservation: preserve original untouched source asset immediately
            import shutil
            source_glb_path = str(model_output_dir(job_id) / "source.glb")
            if provider_result.model_path and Path(provider_result.model_path).exists():
                try:
                    if not Path(source_glb_path).exists():
                        shutil.copy(provider_result.model_path, source_glb_path)
                except Exception as c_err:
                    logger.warning("Could not preserve source.glb: %s", c_err)

            meta = job.processing_metadata or {}
            meta["source_model_url"] = to_url(source_glb_path) if Path(source_glb_path).exists() else to_url(provider_result.model_path)

            # 7b. Analyze: classify asset and extract geometry characteristics
            from app.core.mesh_processor import classify_asset
            asset_class = classify_asset(prompt=job.prompt or "", model_path=source_glb_path if Path(source_glb_path).exists() else provider_result.model_path)
            meta["asset_classification"] = asset_class

            # 7c. Blender post-processing (cleanup, conditional Rigify, multi-format export)
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
                    input_path=source_glb_path if Path(source_glb_path).exists() else provider_result.model_path,
                    output_dir=out_dir,
                    auto_rig=job.auto_rig if job.mode != "render" else False,
                    asset_category=asset_class.get("category"),
                    generate_texture=job.generate_texture if job.mode != "render" else False,
                    quality=job.quality,
                    render_resolution=render_res,
                    render_samples=render_samples,
                    progress_callback=progress_callback,
                )
            except Exception as e:
                logger.warning("Blender post-processing failed, using provider output directly: %s", e)
                blender_result = {"glb": provider_result.model_path}

            # Optional DetailGen3D pass
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
                        if not vram_ok and engine:
                            logger.info("Unloading warm-cached provider '%s' to free VRAM for DetailGen3D", provider_name)
                            await engine.unload_provider(provider_name)
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

            # 7a. Authoritative UV validation & xatlas parameterization
            # If mesh lacks valid UVs, generate them using xatlas; preserve existing valid provider UVs.
            if glb_path and Path(glb_path).exists():
                try:
                    from app.core.mesh_optimizer import generate_uvs_with_xatlas, mesh_has_valid_uvs
                    import trimesh
                    tm = trimesh.load(glb_path, force="mesh")
                    if mesh_has_valid_uvs(tm):
                        meta["uv_status"] = "preserved_from_provider"
                        meta["uv_method"] = "preserved"
                        logger.info("Preserved valid provider UV layout for %s", glb_path)
                    else:
                        sync_publish(82, "postprocessing", "Authoritative UV parameterization with xatlas...", "info")
                        unwrapped_tm, uv_applied = generate_uvs_with_xatlas(tm)
                        if uv_applied:
                            unwrapped_tm.export(glb_path)
                            meta["uv_status"] = "generated_via_xatlas"
                            meta["uv_method"] = "xatlas"
                            meta["uv_parameterized_by"] = "xatlas"
                            logger.info("Generated authoritative xatlas UV coordinates for %s", glb_path)
                    _update_job(session, job_id, processing_metadata=meta)
                except Exception as uv_err:
                    logger.warning("Authoritative xatlas UV check failed: %s", uv_err)

            # 7b. Game-Ready / Auto-optimize mesh (preserving source.glb)
            game_ready = meta.get("game_ready", False)
            auto_optimize = meta.get("auto_optimize", False) or game_ready
            auto_optimize_settings = meta.get("auto_optimize_settings") or {}
            target_platform = meta.get("target_platform", "generic")

            if auto_optimize and glb_path and Path(glb_path).exists():
                sync_publish(85, "optimizing", "Generating game-ready optimized mesh...", "info")
                try:
                    from app.core.mesh_optimizer import optimize_mesh, get_target_polycount_for_platform

                    if game_ready and "target_polycount" not in auto_optimize_settings and "targetPolycount" not in auto_optimize_settings:
                        target_polycount = get_target_polycount_for_platform(target_platform)
                    else:
                        target_polycount = auto_optimize_settings.get("target_polycount") or auto_optimize_settings.get("targetPolycount") or 30000

                    fix_uvs = meta.get("repair_uvs", True)
                    if "fix_uvs" in auto_optimize_settings:
                        fix_uvs = auto_optimize_settings["fix_uvs"]
                    elif "fixUVs" in auto_optimize_settings:
                        fix_uvs = auto_optimize_settings["fixUVs"]

                    preserve_details = meta.get("preserve_details", 75.0)
                    if "preserve_details" in auto_optimize_settings:
                        preserve_details = auto_optimize_settings["preserve_details"]
                    elif "preserveDetails" in auto_optimize_settings:
                        preserve_details = auto_optimize_settings["preserveDetails"]

                    game_ready_path = str(model_output_dir(job_id) / "game_ready.glb")
                    optimize_result = optimize_mesh(
                        input_path=glb_path,
                        output_path=game_ready_path,
                        target_polycount=target_polycount,
                        fix_uvs=fix_uvs,
                        preserve_details=preserve_details,
                    )

                    if optimize_result.get("success"):
                        meta["auto_optimize_result"] = optimize_result
                        meta["game_ready_url"] = to_url(game_ready_path)
                        if game_ready:
                            glb_path = game_ready_path
                        _update_job(session, job_id, processing_metadata=meta)
                        sync_publish(88, "optimizing",
                            f"Game-ready optimization complete: {optimize_result.get('reduction_percent', 0)}% reduction",
                            "success")
                    else:
                        logger.warning("Game-ready optimization skipped: %s", optimize_result.get("error", "unknown"))
                        meta["auto_optimize_error"] = optimize_result.get("error")
                        _update_job(session, job_id, processing_metadata=meta)
                except Exception as opt_exc:
                    logger.warning("Game-ready optimization failed: %s", opt_exc)
                    meta["auto_optimize_error"] = str(opt_exc)
                    _update_job(session, job_id, processing_metadata=meta)

            # 7c. Multi-tier LOD cascade (LOD0–LOD3)
            if meta.get("generate_lod", False) and glb_path and Path(glb_path).exists():
                sync_publish(90, "lod_generation", "Generating multi-tier LODs (LOD0–LOD3)...", "info")
                try:
                    from app.core.mesh_optimizer import generate_lods
                    lod_count = int(meta.get("lod_count", 3))
                    lod_preset = meta.get("lod_preset", "medium")
                    lod_dir = str(model_output_dir(job_id) / "lods")
                    lod_res = generate_lods(
                        input_path=glb_path,
                        output_dir=lod_dir,
                        lod_count=lod_count,
                        lod_preset=lod_preset,
                        preserve_details=float(meta.get("preserve_details", 75.0)),
                        fix_uvs=bool(meta.get("repair_uvs", True)),
                    )
                    lod_urls = [
                        model_public_url(job_id, f"lods/{info['filename']}")
                        for info in lod_res.get("levels", {}).values()
                    ]
                    meta["lod_urls"] = lod_urls
                    meta["lods_result"] = lod_res
                    _update_job(session, job_id, processing_metadata=meta)
                    sync_publish(92, "lod_generation", f"Generated {len(lod_urls)} LOD levels.", "success")
                except Exception as lod_exc:
                    logger.warning("LOD generation failed: %s", lod_exc)

            # 7d. Collision mesh generation
            if meta.get("generate_collision", False) and glb_path and Path(glb_path).exists():
                sync_publish(94, "collision", "Generating simplified collision geometry...", "info")
                try:
                    from app.core.mesh_optimizer import generate_collision_mesh
                    collision_path = str(model_output_dir(job_id) / "collision.glb")
                    col_res = generate_collision_mesh(glb_path, collision_path)
                    if col_res.get("success"):
                        meta["collision_url"] = to_url(collision_path)
                        meta["collision_result"] = col_res
                        _update_job(session, job_id, processing_metadata=meta)
                        sync_publish(95, "collision", "Collision mesh ready.", "success")
                except Exception as col_exc:
                    logger.warning("Collision generation failed: %s", col_exc)

            # 7e. Asset QA & Diagnostics
            sync_publish(96, "qa_diagnostics", "Evaluating asset quality score...", "info")
            qa_report = {}
            try:
                from app.core.mesh_processor import run_mesh_diagnostics
                qa_report = run_mesh_diagnostics(glb_path, target_platform=target_platform)
                meta["qa_report"] = qa_report
                _update_job(session, job_id, processing_metadata=meta)
            except Exception as qa_exc:
                logger.warning("QA evaluation failed: %s", qa_exc)

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
                "ply": to_url(blender_result.get("ply")),
                "source": to_url(source_glb_path) if Path(source_glb_path).exists() else to_url(blender_result.get("glb")),
                "game_ready": meta.get("game_ready_url"),
                "collision": meta.get("collision_url"),
            }


            # 10. Finalize
            _update_job(
                session, job_id,
                status="completed",
                stage="completed",
                progress=100,
                completed_at=datetime.now(timezone.utc).replace(tzinfo=None),
                model_url=to_url(glb_path),
                thumbnail_url=model_public_url(job_id, "thumbnail.png") if rendered else "",
                polygon_count=stats.get("polygon_count", provider_result.polygon_count),
                vertex_count=stats.get("vertex_count", provider_result.vertex_count),
                texture_resolution=provider_result.texture_resolution,
                has_rig=provider_result.has_rig,
                file_size=stats.get("file_size", provider_result.file_size),
                download_urls=download_urls,
                processing_metadata=meta,
            )
            session.commit()

            result_payload = {
                "model_url": to_url(glb_path),
                "thumbnail_url": model_public_url(job_id, "thumbnail.png") if rendered else "",
                "polygon_count": stats.get("polygon_count", provider_result.polygon_count),
                "vertex_count": stats.get("vertex_count", provider_result.vertex_count),
                "texture_resolution": provider_result.texture_resolution,
                "has_rig": provider_result.has_rig,
                "download_urls": download_urls,
                "file_size": stats.get("file_size", provider_result.file_size),
                "source_model_url": meta.get("source_model_url"),
                "game_ready_url": meta.get("game_ready_url"),
                "lod_urls": meta.get("lod_urls") or [],
                "collision_url": meta.get("collision_url"),
                "qa_report": qa_report,
            }

            _publish(job_id, {
                "job_id": job_id,
                "status": "completed",
                "stage": "completed",
                "progress": 100,
                "message": "Generation complete! Model is ready for download.",
                "level": "success",
                "result": result_payload,
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
            elif provider is not None and hasattr(provider, "unload"):
                try:
                    result = provider.unload()
                    if inspect.isawaitable(result):
                        await result
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
            # Always unload on failure to free VRAM, including the direct-provider fallback.
            if engine:
                try:
                    await engine.unload_provider(provider_name)
                except Exception:
                    pass
            elif provider is not None and hasattr(provider, "unload"):
                try:
                    result = provider.unload()
                    if inspect.isawaitable(result):
                        await result
                except Exception:
                    pass
            _update_job(session, job_id, status="failed", stage="failed", error_message=str(exc))
            try:
                session.commit()
            except Exception:
                session.rollback()
                logger.exception("Could not persist failed state for job %s", job_id)
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




