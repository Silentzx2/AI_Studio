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

# Post-processing: OpenX Clay (replaces the old 6-stage custom pipeline)
try:
    from clay.postprocess import PostProcessor
    from clay.config import PostprocessConfig
    from clay.schemas import Generated3DAsset
    from clay.lods import make_lods
    from clay.collision import make_collision
    _CLAY_AVAILABLE = True
except ImportError as _clay_err:
    _CLAY_AVAILABLE = False
    logger.warning("OpenX Clay not available: %s", _clay_err)

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

    storage_root = Path(settings.storage_local_path).resolve()

    try:
        raw_path = Path(reference).resolve()
        if raw_path.exists() and raw_path.is_file() and raw_path.is_relative_to(storage_root):
            return str(raw_path)
    except Exception:
        pass

    parsed = urlparse(reference)
    path = unquote(parsed.path if parsed.scheme else reference)

    if "/static/" in path:
        rel = path.split("/static/", 1)[-1].lstrip("/")
        candidate = (storage_root / rel).resolve()
        if candidate.exists() and candidate.is_file() and candidate.is_relative_to(storage_root):
            return str(candidate)

    upload_prefixes = (
        "/api/v1/upload/uploads/",
        "/api/v1/uploads/",
        "/uploads/",
    )

    if any(path.startswith(prefix) for prefix in upload_prefixes):
        candidate = (storage_root / "uploads" / Path(path).name).resolve()
        if candidate.exists() and candidate.is_file() and candidate.is_relative_to(storage_root / "uploads"):
            return str(candidate)

    # Search in storage subdirectories (models, uploads, exports, generated)
    for folder in ("models", "exports", "uploads", "generated"):
        if f"/{folder}/" in path or path.startswith(f"{folder}/"):
            rel = path.split(f"{folder}/", 1)[-1].lstrip("/")
            candidate = (storage_root / folder / rel).resolve()
            if candidate.exists() and candidate.is_file() and candidate.is_relative_to(storage_root):
                return str(candidate)

    # Search by filename across storage_root
    fname = Path(path).name
    if fname and fname == path:
        for sub in ("models", "uploads", "exports"):
            cand = (storage_root / sub / fname).resolve()
            if cand.exists() and cand.is_file() and cand.is_relative_to(storage_root):
                return str(cand)

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
            now_iso = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
            logger.info("[JOB %s] %d%% [%s] %s", job_id[:8], progress, stage, message)
            try:
                from datetime import datetime as _dt
                log_line = f"{_dt.now().strftime('%Y-%m-%d %H:%M:%S,%f')[:-3]} [{level.upper()}] app.workers.tasks: [JOB {job_id[:8]}] {progress}% [{stage}] {message}\n"
                log_path = Path(__file__).resolve().parents[3] / "logs" / "app.log"
                if log_path.parent.exists():
                    with open(str(log_path), "a", encoding="utf-8") as _fh:
                        _fh.write(log_line)
            except Exception:
                pass
            _publish(job_id, {
                "job_id": job_id,
                "status": "processing",
                "stage": stage,
                "progress": progress,
                "message": message,
                "level": level,
                "timestamp": now_iso,
            })
            job_cur = session.get(GenerationJob, job_id)
            if job_cur:
                m = dict(job_cur.processing_metadata or {})
                cur_logs = list(m.get("logs") or [])
                cur_logs.append({
                    "stage": stage,
                    "progress": progress,
                    "message": message,
                    "level": level,
                    "timestamp": now_iso,
                })
                m["logs"] = cur_logs[-60:]
                m["current_message"] = message
                m["current_stage"] = stage
                job_cur.progress = progress
                job_cur.stage = stage
                if job_cur.status in ("queued", "pending"):
                    job_cur.status = "processing"
                job_cur.processing_metadata = m
                job_cur.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
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
                game_ready=meta.get("game_ready", False),
                target_platform=meta.get("target_platform", "generic"),
                generate_lod=meta.get("generate_lod", False),
                lod_preset=meta.get("lod_preset", "medium"),
                lod_count=meta.get("lod_count", 3),
                generate_collision=meta.get("generate_collision", False),
                generate_pbr=meta.get("generate_pbr", True),
                preserve_details=meta.get("preserve_details", 75.0),
                repair_uvs=meta.get("repair_uvs", True),
                enable_mesh_repair=meta.get("enable_mesh_repair", True),
                strict_watertight=meta.get("strict_watertight", True),
                use_pymeshlab_decimation=meta.get("use_pymeshlab_decimation", True),
                quality_threshold=meta.get("quality_threshold", 0.3),
                pbr_resolution=meta.get("pbr_resolution", "2k"),
                compress_output=meta.get("compress_output", True),
                prepackage_export=meta.get("prepackage_export", False),
                include_lods_in_package=meta.get("include_lods_in_package", True),
                include_collision_in_package=meta.get("include_collision_in_package", True),
                include_qa_in_package=meta.get("include_qa_in_package", True),
                seed=meta.get("seed"),
                num_inference_steps=meta.get("num_inference_steps"),
                guidance_scale=meta.get("guidance_scale"),
                octree_resolution=meta.get("octree_resolution"),
                num_chunks=meta.get("num_chunks"),
                face_count=meta.get("face_count"),
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
                sync_publish(15, "preparing", f"Preflighting source mesh for remesh ({target_faces:,} target faces)...", "info")
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
                sync_publish(65, "remeshing", f"Initial remesh complete ({result.get('optimized_polycount', target_faces):,} faces). Running OpenX Clay post-processing...", "success")
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

            # 7b. Open3D Canonical Analysis & Decision Engine on Master Mesh
            master_glb = source_glb_path if Path(source_glb_path).exists() else provider_result.model_path
            current_glb_path = master_glb
            target_platform = meta.get("target_platform", "generic")
            pipeline_stages: list[dict[str, Any]] = []

            skip_postprocessing = bool(meta.get("skip_postprocessing", False) or (meta.get("postprocess") is False))
            if skip_postprocessing:
                logger.info("[PIPELINE_STAGE] stage=postprocessing tool=none status=skipped reason='Processing explicitly disabled by request' job_id=%s", job_id)
                pipeline_stages.append({
                    "stage": "postprocessing",
                    "tool": "none",
                    "status": "skipped",
                    "reason": "Processing explicitly disabled by request",
                })
                glb_path = current_glb_path
                blender_result = {"glb": current_glb_path}
            else:
                try:
                    from app.core.open3d_service import (
                        is_open3d_available,
                        analyze_mesh_o3d,
                    )
                    if is_open3d_available():
                        t_an = time.perf_counter()
                        o3d_analysis = analyze_mesh_o3d(master_glb)
                        meta["master_mesh_analysis"] = o3d_analysis
                        an_dur = round((time.perf_counter() - t_an) * 1000, 1)
                        pipeline_stages.append({
                            "stage": "master_analysis",
                            "tool": "Open3D",
                            "status": "success",
                            "duration_ms": an_dur,
                            "triangles": o3d_analysis.get("triangle_count", 0),
                            "vertices": o3d_analysis.get("vertex_count", 0),
                            "is_watertight": o3d_analysis.get("is_watertight", False),
                        })
                except Exception as o3d_pipe_err:
                    logger.debug("Open3D master analysis skipped: %s", o3d_pipe_err)

            # 7c. Analyze: classify asset and extract geometry characteristics
            from app.core.mesh_processor import classify_asset
            asset_class = classify_asset(prompt=job.prompt or "", model_path=current_glb_path)
            meta["asset_classification"] = asset_class

            # ── OpenX Clay Post-Processing (replaces old 6-stage custom pipeline) ──
            game_ready_path = str(model_output_dir(job_id) / "game_ready.glb")
            auto_optimize_settings = meta.get("auto_optimize_settings") or {}
            target_polycount = (
                auto_optimize_settings.get("target_polycount")
                or auto_optimize_settings.get("targetPolycount")
                or auto_optimize_settings.get("targetFaces")
                or meta.get("target_polycount")
                or meta.get("targetPolycount")
                or meta.get("face_count")
                or 20000
            )
            target_polycount = int(target_polycount)
            unwrap_uvs = bool(meta.get("unwrap_uvs", meta.get("unwrapUVs", meta.get("repair_uvs", meta.get("fix_uvs", True)))))

            if _CLAY_AVAILABLE and not skip_postprocessing:
                sync_publish(75, "clay_postprocess", f"OpenX Clay: Starting post-processing ({target_polycount:,} tris target, unwrap_uvs={unwrap_uvs})...", "info")
                t_clay = time.perf_counter()
                try:
                    pp_config = PostprocessConfig(
                        target_tris=target_polycount,
                        unwrap_uvs=unwrap_uvs,
                        format="glb",
                    )
                    pp = PostProcessor(pp_config)
                    raw_asset = Generated3DAsset(path=master_glb, format="glb")
                    processed_asset = pp.process(raw_asset, out_path=game_ready_path)
                    clay_dur = round((time.perf_counter() - t_clay) * 1000, 1)

                    if not Path(game_ready_path).exists() or Path(game_ready_path).stat().st_size == 0:
                        raise RuntimeError(f"OpenX Clay output missing or empty at {game_ready_path}")

                    current_glb_path = game_ready_path
                    pipeline_stages.append({
                        "stage": "clay_postprocess",
                        "tool": "openx_clay",
                        "status": "success",
                        "duration_ms": clay_dur,
                        "triangles": processed_asset.triangles,
                        "output_path": game_ready_path,
                    })
                    meta["auto_optimize_result"] = {
                        "success": True,
                        "method": "openx_clay",
                        "target_faces": processed_asset.triangles,
                    }
                    meta["game_ready_url"] = to_url(game_ready_path)
                    meta["processed_model_url"] = to_url(game_ready_path)
                    meta["active_model_url"] = to_url(game_ready_path)
                    _update_job(session, job_id, processing_metadata=meta)
                    sync_publish(90, "clay_postprocess",
                        f"Clay: Post-processing complete ({processed_asset.triangles:,} tris, {clay_dur:.0f}ms)",
                        "success")
                except Exception as clay_err:
                    logger.warning("OpenX Clay post-processing error for job %s: %s; retaining master asset", job_id, clay_err)
                    import shutil
                    if master_glb != game_ready_path:
                        shutil.copy2(master_glb, game_ready_path)
                    current_glb_path = game_ready_path
                    pipeline_stages.append({
                        "stage": "clay_postprocess",
                        "tool": "openx_clay",
                        "status": "fallback",
                        "error": str(clay_err),
                    })
                    meta["game_ready_url"] = to_url(game_ready_path)
                    meta["processed_model_url"] = to_url(game_ready_path)
                    meta["active_model_url"] = to_url(game_ready_path)
                    _update_job(session, job_id, processing_metadata=meta)
                    sync_publish(90, "clay_postprocess", "Clay post-processing fallback: source mesh retained.", "warn")
            elif not skip_postprocessing:
                logger.warning("OpenX Clay post-processing engine is unavailable; retaining source mesh")
                import shutil
                if current_glb_path != game_ready_path:
                    shutil.copy2(current_glb_path, game_ready_path)
                current_glb_path = game_ready_path
                meta["game_ready_url"] = to_url(game_ready_path)
                meta["processed_model_url"] = to_url(game_ready_path)
                meta["active_model_url"] = to_url(game_ready_path)
            else:
                import shutil
                if current_glb_path != game_ready_path:
                    shutil.copy2(current_glb_path, game_ready_path)
                current_glb_path = game_ready_path
                meta["game_ready_url"] = to_url(game_ready_path)
                meta["processed_model_url"] = to_url(game_ready_path)
                meta["active_model_url"] = to_url(game_ready_path)

            glb_path = current_glb_path

            # Optional LOD cascade via Clay
            if not skip_postprocessing and meta.get("generate_lod", False) and Path(glb_path).exists():
                sync_publish(97, "lod_generation", "Clay: Generating LOD chain...", "info")
                t_lod = time.perf_counter()
                try:
                    from clay.lods import make_lods
                    lod_dir = str(model_output_dir(job_id) / "lods")
                    lod_res = make_lods(
                        glb_path,
                        ratios=(1.0, 0.5, 0.25, 0.1),
                        out_dir=lod_dir,
                    )
                    lod_urls = [
                        model_public_url(job_id, f"lods/{Path(lod['path']).name}")
                        for lod in lod_res.get("lods", [])
                    ]
                    meta["lod_urls"] = lod_urls
                    meta["lods_result"] = lod_res
                    pipeline_stages.append({
                        "stage": "lod_generation",
                        "tool": "clay",
                        "status": "success",
                        "duration_ms": round((time.perf_counter() - t_lod) * 1000, 1),
                        "levels_count": lod_res.get("count", 0),
                    })
                    _update_job(session, job_id, processing_metadata=meta)
                except Exception as lod_exc:
                    logger.warning("Clay LOD generation failed: %s", lod_exc)

            # Optional Collision mesh via Clay
            if not skip_postprocessing and meta.get("generate_collision", False) and Path(glb_path).exists():
                sync_publish(98, "collision", "Clay: Generating collision geometry...", "info")
                try:
                    from clay.collision import make_collision
                    collision_path = str(model_output_dir(job_id) / "collision.glb")
                    col_res = make_collision(glb_path, kind="convex", out_path=collision_path)
                    meta["collision_url"] = to_url(col_res["path"])
                    meta["collision_result"] = col_res
                    _update_job(session, job_id, processing_metadata=meta)
                except Exception as col_exc:
                    logger.warning("Clay collision generation failed: %s", col_exc)

            # Asset QA & Diagnostics
            qa_report = {}
            t_qa = time.perf_counter()
            sync_publish(98, "qa_diagnostics", "Evaluating asset quality & geometry...", "info")
            try:
                from app.core.mesh_processor import run_mesh_diagnostics
                qa_report = run_mesh_diagnostics(glb_path, target_platform=target_platform)
                qa_dur = round((time.perf_counter() - t_qa) * 1000, 1)
                meta["qa_report"] = qa_report
                pipeline_stages.append({
                    "stage": "qa_diagnostics",
                    "tool": "mesh_processor",
                    "status": "success",
                    "duration_ms": qa_dur,
                    "game_ready_score": qa_report.get("game_ready_score"),
                    "qa_status": qa_report.get("status"),
                })
                _update_job(session, job_id, processing_metadata=meta)
            except Exception as qa_exc:
                logger.warning("QA evaluation failed: %s", qa_exc)


            # Multi-format exports (FBX, OBJ, STL) & Thumbnail via Blender
            blender_result = {}
            if not skip_postprocessing:
                sync_publish(99, "rendering", "Exporting multi-format assets & rendering thumbnail...", "info")
                try:
                    from app.core.blender.pipeline import process_model
                    topology_mode = meta.get("topology_mode", "adaptive")
                    blender_result = await process_model(
                        input_path=glb_path,
                        output_dir=out_dir,
                        auto_rig=job.auto_rig if job.mode != "render" else False,
                        asset_category=asset_class.get("category"),
                        generate_texture=job.generate_texture if job.mode != "render" else False,
                        quality=job.quality,
                        topology_mode=topology_mode,
                        progress_callback=progress_callback,
                    )
                except Exception as b_err:
                    logger.warning("Blender multi-format export failed: %s", b_err)
                    blender_result = {"glb": glb_path}

            from app.core.mesh_processor import get_mesh_stats, render_thumbnail
            thumb_path = str(model_output_dir(job_id) / "thumbnail.png")
            _wait_for_stable_file(glb_path)
            rendered = False
            if Path(thumb_path).is_file() and Path(thumb_path).stat().st_size > 2048:
                rendered = True
            else:
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
                "glb": to_url(glb_path),
                "fbx": to_url(blender_result.get("fbx")),
                "obj": to_url(blender_result.get("obj")),
                "stl": to_url(blender_result.get("stl")),
                "ply": to_url(blender_result.get("ply")),
                "source": to_url(source_glb_path) if Path(source_glb_path).exists() else to_url(glb_path),
                "game_ready": meta.get("game_ready_url"),
                "collision": meta.get("collision_url"),
            }

            # 10. Finalize
            meta["pipeline_stages"] = pipeline_stages
            meta["active_model_url"] = to_url(glb_path)
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
                "active_model_url": to_url(glb_path),
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
                "pipeline_stages": pipeline_stages,
                "actual_topology": meta.get("actual_topology", "triangle"),
                "topology_mode": meta.get("topology_mode", "adaptive"),
            }

            sync_publish(100, "completed", "Mesh generation & Clay post-processing complete!", "success")
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
