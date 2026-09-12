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

# Post-processing pipeline (lazy import — graceful if not yet installed)
try:
    from app.core.post_processing import (
        mesh_repair,
        decimation as pp_decimation,
        uv_unwrap,
        optimize as pp_optimize,
        export_packager,
        pbr_bake,
    )
    _POST_PROCESSING_AVAILABLE = True
except ImportError as _pp_err:
    _POST_PROCESSING_AVAILABLE = False
    import logging as _pp_log
    _pp_log.getLogger(__name__).warning("post_processing modules not available: %s", _pp_err)

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
                sync_publish(65, "remeshing", f"Initial remesh complete ({result.get('optimized_polycount', target_faces):,} faces). Running 6-stage post-processing...", "success")
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
                        evaluate_mesh_decision,
                        safe_cleanup_o3d,
                        compare_meshes_o3d,
                    )
                    if is_open3d_available():
                        t_an = time.perf_counter()
                        sync_publish(75, "analyzing", "Running Open3D topology diagnostics...", "info")
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
                        logger.info(
                            "[PIPELINE_STAGE] stage=master_analysis tool=Open3D duration_ms=%.1f tris=%d verts=%d watertight=%s",
                            an_dur, o3d_analysis.get("triangle_count", 0), o3d_analysis.get("vertex_count", 0), o3d_analysis.get("is_watertight", False),
                        )

                        decision = evaluate_mesh_decision(
                            o3d_analysis,
                            target_platform=target_platform,
                            user_settings=meta.get("auto_optimize_settings") or {},
                        )
                        meta["mesh_decision"] = decision
                        logger.info("Open3D Decision for %s: %s", job_id, decision["reasons"])

                        # Safe conservative cleanup if repair is needed
                        if decision.get("needs_repair"):
                            t_clean = time.perf_counter()
                            sync_publish(77, "postprocessing", "Applying conservative Open3D geometry cleanup...", "info")
                            cleaned_path = str(model_output_dir(job_id) / "cleaned.glb")
                            clean_res = safe_cleanup_o3d(master_glb, output_path=cleaned_path)
                            clean_dur = round((time.perf_counter() - t_clean) * 1000, 1)
                            if clean_res.get("success") and clean_res.get("modified"):
                                comp = compare_meshes_o3d(master_glb, cleaned_path)
                                if comp.get("is_acceptable"):
                                    current_glb_path = cleaned_path
                                    meta["cleaned_model_url"] = to_url(cleaned_path)
                                    meta["clean_result"] = clean_res
                                    pipeline_stages.append({
                                        "stage": "safe_cleanup",
                                        "tool": "Open3D",
                                        "status": "success",
                                        "duration_ms": clean_dur,
                                        "input_triangles": clean_res.get("before", {}).get("triangle_count", 0),
                                        "output_triangles": clean_res.get("after", {}).get("triangle_count", 0),
                                        "triangle_reduction": clean_res.get("triangle_reduction", 0),
                                        "output_path": cleaned_path,
                                    })
                                    logger.info("[PIPELINE_STAGE] stage=safe_cleanup tool=Open3D duration_ms=%.1f in_tris=%d out_tris=%d accepted=True",
                                                clean_dur, clean_res.get("before", {}).get("triangle_count", 0), clean_res.get("after", {}).get("triangle_count", 0))
                                else:
                                    pipeline_stages.append({
                                        "stage": "safe_cleanup",
                                        "tool": "Open3D",
                                        "status": "rejected",
                                        "duration_ms": clean_dur,
                                        "reason": comp.get("rejection_reason"),
                                    })
                                    logger.warning("Open3D cleanup degraded geometry (%s) — retaining master", comp.get("rejection_reason"))
                except Exception as o3d_pipe_err:
                    logger.warning("Open3D analysis/decision pipeline error: %s", o3d_pipe_err)

            # 7c. Analyze: classify asset and extract geometry characteristics
            from app.core.mesh_processor import classify_asset
            asset_class = classify_asset(prompt=job.prompt or "", model_path=current_glb_path)
            meta["asset_classification"] = asset_class

            # Stage 1: Strict watertight repair (PyMeshLab → Blender voxel fallback)
            if _POST_PROCESSING_AVAILABLE and meta.get('enable_mesh_repair', True):
                sync_publish(78, "repairing", "Stage 1/6: PyMeshLab watertight mesh repair...", "info")
                repair_output = Path(master_glb).parent / "repaired.glb"
                try:
                    repair_result = mesh_repair.repair_mesh_strict(
                        master_glb, repair_output, job_id=job_id
                    )
                    pipeline_stages.append({"stage": "watertight_repair", **repair_result})
                    if repair_result["success"] and repair_output.exists():
                        # Use repaired mesh as working copy (master_glb is immutable source)
                        current_glb_path = str(repair_output)
                        sync_publish(80, "repairing", f"Stage 1/6 Complete: Watertight repair verified ({repair_result.get('repair_route')})", "success")
                    else:
                        sync_publish(80, "repairing", "Stage 1/6: Repair blocked — preserving source geometry", "warning")
                except Exception as _repair_exc:
                    logger.warning("Watertight repair failed: %s", _repair_exc)
                    pipeline_stages.append({"stage": "watertight_repair", "success": False, "error": str(_repair_exc)})

            # 7d. Blender post-processing (cleanup, conditional Rigify, multi-format export)
            if not skip_postprocessing:
                blender_result = {}
                t_blender = time.perf_counter()
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

                    topology_mode = meta.get("topology_mode", "adaptive")
                    from app.core.blender.pipeline import process_model
                    blender_result = await process_model(
                        input_path=current_glb_path,
                        output_dir=out_dir,
                        auto_rig=job.auto_rig if job.mode != "render" else False,
                        asset_category=asset_class.get("category"),
                        generate_texture=job.generate_texture if job.mode != "render" else False,
                        quality=job.quality,
                        render_resolution=render_res,
                        render_samples=render_samples,
                        topology_mode=topology_mode,
                        progress_callback=progress_callback,
                    )
                    blender_dur = round((time.perf_counter() - t_blender) * 1000, 1)

                    if blender_result.get("actual_topology"):
                        meta["actual_topology"] = blender_result["actual_topology"]
                        meta["topology_mode"] = blender_result.get("topology_mode", topology_mode)
                        if blender_result.get("quad_count") is not None:
                            meta["quad_count"] = blender_result["quad_count"]
                        if blender_result.get("triangle_count") is not None:
                            meta["triangle_count"] = blender_result["triangle_count"]

                    # Open3D Quality Verification of post-Blender mesh vs input
                    post_blender_glb = blender_result.get("glb")
                    if post_blender_glb and Path(post_blender_glb).exists() and post_blender_glb != current_glb_path:
                        try:
                            from app.core.open3d_service import is_open3d_available, compare_meshes_o3d
                            if is_open3d_available():
                                b_comp = compare_meshes_o3d(current_glb_path, post_blender_glb, max_bbox_change_pct=10.0)
                                if not b_comp.get("is_acceptable"):
                                    logger.warning(
                                        "Blender post-processing degraded geometry (%s) — falling back to pre-Blender mesh",
                                        b_comp.get("rejection_reason"),
                                    )
                                    blender_result["glb"] = current_glb_path
                        except Exception as b_cmp_err:
                            logger.debug("Open3D post-Blender verification error: %s", b_cmp_err)

                    pipeline_stages.append({
                        "stage": "blender_pipeline",
                        "tool": "Blender",
                        "status": "success",
                        "duration_ms": blender_dur,
                        "output_path": blender_result.get("glb"),
                    })
                    logger.info("[PIPELINE_STAGE] stage=blender_pipeline tool=Blender duration_ms=%.1f output=%s", blender_dur, blender_result.get("glb"))
                except Exception as e:
                    logger.warning("Blender post-processing failed, using provider output directly: %s", e)
                    blender_result = {"glb": current_glb_path}
                    pipeline_stages.append({
                        "stage": "blender_pipeline",
                        "tool": "Blender",
                        "status": "failed",
                        "duration_ms": round((time.perf_counter() - t_blender) * 1000, 1),
                        "error": str(e),
                    })

            # Optional DetailGen3D pass
            detail_pass = meta.get("detail_pass", False)
            detail_guidance = meta.get("detail_guidance", 7.5)

            if not skip_postprocessing and detail_pass:
                sync_publish(80, "postprocessing", "DetailGen3D refinement requested...", "info")
                t_det = time.perf_counter()
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
                        pipeline_stages.append({
                            "stage": "detail_pass",
                            "tool": "DetailGen3D",
                            "status": "success",
                            "duration_ms": round((time.perf_counter() - t_det) * 1000, 1),
                            "output_path": detailed_glb,
                        })
                        _update_job(session, job_id, processing_metadata=meta)
                        sync_publish(90, "postprocessing", "DetailGen3D pass complete.", "info")
                except Exception as ex_det:
                    logger.warning("DetailGen3D pass failed: %s", ex_det)
                    pipeline_stages.append({
                        "stage": "detail_pass",
                        "tool": "DetailGen3D",
                        "status": "failed",
                        "duration_ms": round((time.perf_counter() - t_det) * 1000, 1),
                        "error": str(ex_det),
                    })

            glb_path = blender_result.get("glb") or provider_result.model_path

            # 7a. Authoritative UV validation & xatlas parameterization
            # If mesh lacks valid UVs, generate them using xatlas; preserve existing valid provider UVs.
            if not skip_postprocessing and glb_path and Path(glb_path).exists():
                t_uv = time.perf_counter()
                try:
                    from app.core.mesh_optimizer import generate_uvs_with_xatlas, mesh_has_valid_uvs
                    import trimesh
                    tm = trimesh.load(glb_path, force="mesh")
                    if mesh_has_valid_uvs(tm):
                        meta["uv_status"] = "preserved_from_provider"
                        meta["uv_method"] = "preserved"
                        pipeline_stages.append({
                            "stage": "uv_parameterization",
                            "tool": "provider",
                            "status": "preserved",
                            "duration_ms": round((time.perf_counter() - t_uv) * 1000, 1),
                        })
                        logger.info("Preserved valid provider UV layout for %s", glb_path)
                    else:
                        sync_publish(82, "unwrapping", "Stage 3/6: Authoritative UV parameterization with xatlas...", "info")
                        unwrapped_tm, uv_applied = generate_uvs_with_xatlas(tm)
                        uv_dur = round((time.perf_counter() - t_uv) * 1000, 1)
                        if uv_applied:
                            unwrapped_tm.export(glb_path)
                            meta["uv_status"] = "generated_via_xatlas"
                            meta["uv_method"] = "xatlas"
                            meta["uv_parameterized_by"] = "xatlas"
                            pipeline_stages.append({
                                "stage": "uv_parameterization",
                                "tool": "xatlas",
                                "status": "generated",
                                "duration_ms": uv_dur,
                            })
                            logger.info("[PIPELINE_STAGE] stage=uv_parameterization tool=xatlas duration_ms=%.1f output=%s", uv_dur, glb_path)
                            sync_publish(84, "unwrapping", f"Stage 3/6 Complete: xatlas UV parameterization finished ({uv_dur:.0f}ms)", "success")
                    _update_job(session, job_id, processing_metadata=meta)
                except Exception as uv_err:
                    logger.warning("Authoritative xatlas UV check failed: %s", uv_err)

            # 7b. Game-Ready / Auto-optimize mesh (preserving source.glb)
            game_ready = meta.get("game_ready", False)
            o3d_needs_opt = meta.get("mesh_decision", {}).get("needs_optimization", False)
            auto_optimize = meta.get("auto_optimize", False) or game_ready or o3d_needs_opt or (job.mode == "remesh")
            auto_optimize_settings = meta.get("auto_optimize_settings") or {}
            target_platform = meta.get("target_platform", "generic")

            if not skip_postprocessing and auto_optimize and glb_path and Path(glb_path).exists():
                sync_publish(85, "optimizing", "Stage 2/6: Decimating mesh to target polycount budget...", "info")
                t_opt = time.perf_counter()
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
                    
                    if _POST_PROCESSING_AVAILABLE and meta.get("use_pymeshlab_decimation", True):
                        pml_dec_res = pp_decimation.decimate_pymeshlab(glb_path, game_ready_path, target_faces=target_polycount)
                        if pml_dec_res.get("success"):
                            optimize_result = {
                                "success": True,
                                "method": pml_dec_res.get("route", "pymeshlab"),
                                "source_faces": pml_dec_res.get("input_faces", 0),
                                "target_faces": pml_dec_res.get("output_faces", 0),
                                "reduction_percent": round(max(0, 1.0 - (pml_dec_res.get("output_faces", 0) / max(1, pml_dec_res.get("input_faces", 1)))) * 100, 1),
                            }
                        else:
                            optimize_result = optimize_mesh(
                                input_path=glb_path,
                                output_path=game_ready_path,
                                target_polycount=target_polycount,
                                fix_uvs=fix_uvs,
                                preserve_details=preserve_details,
                                remesh_mode=topology_mode,
                            )
                    else:
                        optimize_result = optimize_mesh(
                            input_path=glb_path,
                            output_path=game_ready_path,
                            target_polycount=target_polycount,
                            fix_uvs=fix_uvs,
                            preserve_details=preserve_details,
                            remesh_mode=topology_mode,
                        )
                    opt_dur = round((time.perf_counter() - t_opt) * 1000, 1)

                    if optimize_result.get("success") and Path(game_ready_path).exists():
                        # Authoritatively swap active glb_path to the processed derivative
                        glb_path = game_ready_path
                        meta["auto_optimize_result"] = optimize_result
                        meta["game_ready_url"] = to_url(game_ready_path)
                        meta["processed_model_url"] = to_url(game_ready_path)
                        meta["active_model_url"] = to_url(game_ready_path)
                        if optimize_result.get("actual_topology"):
                            meta["actual_topology"] = optimize_result["actual_topology"]
                        if optimize_result.get("fallback_reason"):
                            meta["topology_fallback_reason"] = optimize_result["fallback_reason"]
                        _update_job(session, job_id, processing_metadata=meta)

                        opt_stage = {
                            "stage": "mesh_optimization",
                            "tool": optimize_result.get("method", "meshoptimizer"),
                            "status": "success",
                            "duration_ms": opt_dur,
                            "input_triangles": optimize_result.get("source_faces", 0),
                            "output_triangles": optimize_result.get("target_faces", 0),
                            "reduction_percent": optimize_result.get("reduction_percent", 0),
                            "output_path": game_ready_path,
                        }
                        pipeline_stages.append(opt_stage)
                        logger.info(
                            "[PIPELINE_STAGE] stage=mesh_optimization tool=%s duration_ms=%.1f in_tris=%d out_tris=%d red_pct=%.1f%% output=%s",
                            opt_stage["tool"], opt_dur, opt_stage["input_triangles"], opt_stage["output_triangles"], opt_stage["reduction_percent"], game_ready_path,
                        )
                        sync_publish(88, "optimizing",
                            f"Stage 2/6 Complete: Mesh decimated {optimize_result.get('reduction_percent', 0)}% ({optimize_result.get('source_faces', 0):,} → {optimize_result.get('target_faces', 0):,} tris)",
                            "success")
                    else:
                        opt_err = optimize_result.get("error", "unknown optimization failure")
                        logger.warning("Mesh optimization skipped or failed: %s", opt_err)
                        meta["auto_optimize_error"] = opt_err
                        meta["auto_optimize_result"] = {"success": False, "error": opt_err}
                        pipeline_stages.append({
                            "stage": "mesh_optimization",
                            "tool": "mesh_optimizer",
                            "status": "failed",
                            "duration_ms": opt_dur,
                            "error": opt_err,
                        })
                        _update_job(session, job_id, processing_metadata=meta)
                        sync_publish(88, "optimizing", f"Stage 2/6 Warning: Decimation skipped ({opt_err})", "warn")
                except Exception as opt_exc:
                    opt_dur = round((time.perf_counter() - t_opt) * 1000, 1)
                    logger.warning("Game-ready optimization failed: %s", opt_exc)
                    meta["auto_optimize_error"] = str(opt_exc)
                    meta["auto_optimize_result"] = {"success": False, "error": str(opt_exc)}
                    pipeline_stages.append({
                        "stage": "mesh_optimization",
                        "tool": "mesh_optimizer",
                        "status": "failed",
                        "duration_ms": opt_dur,
                        "error": str(opt_exc),
                    })
                    _update_job(session, job_id, processing_metadata=meta)
                    sync_publish(88, "optimizing", f"Stage 2/6 Warning: Decimation failed ({opt_exc})", "warn")

            # Stage 4: PBR Map Baking (Normal, AO, Roughness, Metallic)
            # Requires: high-poly source + low-poly UV-mapped game_ready.glb
            if _POST_PROCESSING_AVAILABLE and meta.get('generate_pbr', True):
                game_ready_glb = model_output_dir(job_id) / "game_ready.glb"
                source_glb_for_bake = Path(source_glb_path) if Path(source_glb_path).exists() else None
                if game_ready_glb.exists() and source_glb_for_bake:
                    sync_publish(89, "baking", f"Stage 4/6: Baking PBR maps (Normal, AO, Roughness, Metallic) at {meta.get('pbr_resolution', '2k')}...", "info")
                    pbr_out_dir = model_output_dir(job_id) / "pbr_maps"
                    pbr_out_dir.mkdir(parents=True, exist_ok=True)
                    try:
                        pbr_result = pbr_bake.bake_pbr_maps_blender_sync(
                            highpoly_path=str(source_glb_for_bake),
                            lowpoly_path=str(game_ready_glb),
                            output_dir=str(pbr_out_dir),
                            resolution=meta.get('pbr_resolution', '2k'),
                            job_id=job_id,
                        )
                        pipeline_stages.append({"stage": "pbr_baking", **pbr_result})
                        if pbr_result.get("success"):
                            meta["pbr_maps"] = {k: to_url(v) for k, v in pbr_result.get("maps", {}).items() if v}
                            meta["pbr_resolution"] = pbr_result.get("resolution", "2k")
                            _update_job(session, job_id, processing_metadata=meta)
                            sync_publish(92, "baking", f"Stage 4/6 Complete: PBR maps baked at {pbr_result['resolution']}", "success")
                        else:
                            logger.warning("PBR baking failed: %s — continuing without maps", pbr_result.get("error"))
                            sync_publish(92, "baking", f"Stage 4/6 Skipped: PBR baking bypassed ({pbr_result.get('error', 'fallback')})", "warning")
                    except Exception as _pbr_exc:
                        logger.warning("PBR baking exception: %s — continuing", _pbr_exc)
                        pipeline_stages.append({"stage": "pbr_baking", "success": False, "error": str(_pbr_exc)})

            # Stage 5: gltf-transform compression
            if _POST_PROCESSING_AVAILABLE and meta.get('compress_output', True):
                try:
                    game_ready_glb = model_output_dir(job_id) / "game_ready.glb"
                    if game_ready_glb.exists():
                        compressed_glb = game_ready_glb.parent / "game_ready_compressed.glb"
                        sync_publish(93, "compressing", "Stage 5/6: Optimizing GLB with gltf-transform (Draco + WebP)...", "info")
                        compress_result = pp_optimize.optimize_glb_gltftransform(
                            str(game_ready_glb), str(compressed_glb),
                            enable_draco=True,
                            texture_format='webp',
                        )
                        pipeline_stages.append({"stage": "gltf_compression", **compress_result})
                        if compress_result.get("success") and compress_result.get("route") != "passthrough":
                            sync_publish(95, "compressing", f"Stage 5/6 Complete: GLB compressed {compress_result.get('input_size_bytes',0)//1024}KB → {compress_result.get('output_size_bytes',0)//1024}KB", "success")
                        else:
                            sync_publish(95, "compressing", "Stage 5/6 Complete: GLB structure validated", "info")
                except Exception as _compress_exc:
                    logger.warning("gltf-transform compression failed: %s", _compress_exc)

            # 7c. Multi-tier LOD cascade (LOD0–LOD3)
            if not skip_postprocessing and meta.get("generate_lod", False) and glb_path and Path(glb_path).exists():
                sync_publish(90, "lod_generation", "Generating multi-tier LODs (LOD0–LOD3)...", "info")
                t_lod = time.perf_counter()
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
                    lod_dur = round((time.perf_counter() - t_lod) * 1000, 1)
                    meta["lod_urls"] = lod_urls
                    meta["lods_result"] = lod_res
                    pipeline_stages.append({
                        "stage": "lod_generation",
                        "tool": "meshoptimizer",
                        "status": "success",
                        "duration_ms": lod_dur,
                        "levels_count": len(lod_urls),
                    })
                    logger.info("[PIPELINE_STAGE] stage=lod_generation tool=meshoptimizer duration_ms=%.1f levels=%d", lod_dur, len(lod_urls))
                    _update_job(session, job_id, processing_metadata=meta)
                    sync_publish(92, "lod_generation", f"Generated {len(lod_urls)} LOD levels.", "success")
                except Exception as lod_exc:
                    logger.warning("LOD generation failed: %s", lod_exc)

            # 7d. Collision mesh generation
            if not skip_postprocessing and meta.get("generate_collision", False) and glb_path and Path(glb_path).exists():
                sync_publish(94, "collision", "Generating simplified collision geometry...", "info")
                t_col = time.perf_counter()
                try:
                    from app.core.mesh_optimizer import generate_collision_mesh
                    collision_path = str(model_output_dir(job_id) / "collision.glb")
                    col_res = generate_collision_mesh(glb_path, collision_path)
                    col_dur = round((time.perf_counter() - t_col) * 1000, 1)
                    if col_res.get("success"):
                        meta["collision_url"] = to_url(collision_path)
                        meta["collision_result"] = col_res
                        pipeline_stages.append({
                            "stage": "collision_generation",
                            "tool": "trimesh/convex_hull",
                            "status": "success",
                            "duration_ms": col_dur,
                            "output_path": collision_path,
                        })
                        logger.info("[PIPELINE_STAGE] stage=collision_generation tool=convex_hull duration_ms=%.1f output=%s", col_dur, collision_path)
                        _update_job(session, job_id, processing_metadata=meta)
                        sync_publish(95, "collision", "Collision mesh ready.", "success")
                except Exception as col_exc:
                    logger.warning("Collision generation failed: %s", col_exc)

            # 7e. Asset QA & Diagnostics
            sync_publish(96, "qa_diagnostics", "Evaluating asset quality score...", "info")
            qa_report = {}
            t_qa = time.perf_counter()
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
                logger.info("[PIPELINE_STAGE] stage=qa_diagnostics tool=mesh_processor duration_ms=%.1f score=%s status=%s",
                            qa_dur, qa_report.get("game_ready_score"), qa_report.get("status"))
                _update_job(session, job_id, processing_metadata=meta)
            except Exception as qa_exc:
                logger.warning("QA evaluation failed: %s", qa_exc)

            # 8. Thumbnail (Non-blocking)
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

            # Stage 6: Async package worker
            if _POST_PROCESSING_AVAILABLE and meta.get('prepackage_export', False):
                try:
                    artifacts = {}
                    storage_root = Path(settings.storage_local_path)
                    game_ready = model_output_dir(job_id) / "game_ready.glb"
                    if game_ready.exists():
                        artifacts["game_ready_glb"] = str(game_ready)
                    source = model_output_dir(job_id) / "source.glb"
                    if source.exists():
                        artifacts["source_glb"] = str(source)
                    export_spec = {
                        "job_id": job_id,
                        "variant": "game_ready",
                        "include_lods": meta.get('include_lods_in_package', True),
                        "include_collision": meta.get('include_collision_in_package', True),
                        "include_qa": meta.get('include_qa_in_package', True),
                    }
                    # Dispatch as a separate Celery task to avoid blocking
                    package_export_bundle.apply_async(
                        kwargs={"job_id": job_id, "artifacts": artifacts, "export_spec": export_spec},
                        countdown=2,  # small delay to let job finalize first
                    )
                    sync_publish(99, "packaging", "Stage 6/6 Complete: Async export package bundle queued.", "success")
                except Exception as _pkg_exc:
                    logger.warning("Package dispatch failed: %s", _pkg_exc)

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


@celery_app.task(name="tasks.package_export_bundle", bind=True, max_retries=3)
def package_export_bundle(self, job_id: str, artifacts: dict, export_spec: dict) -> dict:
    """Celery task: Build pre-packaged ZIP export. Never called from HTTP path."""
    logger.info("[package] Starting export package for job %s", job_id)
    try:
        from app.core.post_processing.export_packager import build_export_package
        storage_root = Path(settings.STORAGE_ROOT)
        result = build_export_package(job_id, storage_root, artifacts, export_spec)
        logger.info("[package] job=%s success=%s path=%s", job_id, result["success"], result.get("package_path"))
        return result
    except Exception as exc:
        logger.error("[package] job=%s error=%s", job_id, exc)
        raise self.retry(exc=exc, countdown=30)
