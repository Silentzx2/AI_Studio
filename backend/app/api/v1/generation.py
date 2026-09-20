"""Generation endpoints for the new FastAPI backend."""

import asyncio
import copy
import logging
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

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
    get_artifact_manager,
    create_job_listener,
    stop_job_listener,
    get_progress_tracker,
    get_rate_limiter,
    get_workflow_registry,
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


class EnhancePromptRequest(BaseModel):
    prompt: str


@router.post("/enhance-prompt")
async def enhance_prompt(req: EnhancePromptRequest):
    """Enhance user prompt with 3D quality descriptors."""
    raw = req.prompt.strip()
    if not raw:
        return {"success": True, "data": {"enhanced_prompt": ""}}
    enhanced = f"{raw}, high quality 3D model, clean manifold topology, detailed geometry, 8k PBR textures"
    return {"success": True, "data": {"enhanced_prompt": enhanced}}


@router.get("/workflows")
async def get_workflows():
    """List available verified ComfyUI 3D workflow templates."""
    from app.core.comfy.workflows import list_workflow_templates
    return {"success": True, "data": list_workflow_templates()}


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

    # §9: selected model/provider maps to a verified workflow. No silent fallback
    # to a different model. If no workflow is registered for the selection, the
    # generation path returns an explicit error (see process_generation_job).
    _SUPPORTED_PROVIDERS = {"triposr", "tripo_sr", "hunyuan3d", "hunyuan3d_21", "trellis", "comfyui", ""}

    # Map workspace to mode
    if req.workspace and req.mode == "text-to-3d" and req.workspace in _WORKSPACE_MODE_MAP:
        req.mode = _WORKSPACE_MODE_MAP[req.workspace]

    # Determine and strictly validate provider (no silent fallback)
    provider = req.provider or "comfyui"
    if req.provider and req.provider.lower().strip() not in _SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported generation provider '{req.provider}'. Supported: triposr, hunyuan3d, trellis, comfyui.",
        )

    # Canonical model ID used by the workflow registry (tripo_sr, trellis, hunyuan3d).
    model_id = _resolve_model_id(provider)

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


def _resolve_model_id(provider: str) -> str:
    """Map a generation provider to the canonical model ID used by the workflow registry.

    The registry keys are tripo_sr / trellis / hunyuan3d. Aliases such as
    'tripo', 'triposr', 'hunyuan3d_21' and the legacy 'comfyui' default all
    resolve to the same canonical ID.
    """
    return {
        "tripo_sr": "tripo_sr",
        "tripo": "tripo_sr",
        "triposr": "tripo_sr",
        "trellis": "trellis",
        "hunyuan3d": "hunyuan3d",
        "hunyuan3d_21": "hunyuan3d",
        "comfyui": "tripo_sr",
        "": "tripo_sr",
    }.get(provider, "tripo_sr")


def _job_scoped_prompt(
    workflow: dict[str, Any],
    job_id: str,
    ref_image_name: str | None = None,
    req: Optional[GenerationRequest] = None,
) -> dict[str, Any]:
    """Return a deep copy of the persisted workflow with a job-unique save path

    and active UI settings (reference image, seed, steps, prompt) injected into nodes.
    """
    scoped = copy.deepcopy(workflow)
    save_filename = f"{job_id}.glb"
    for node in scoped.values():
        if not isinstance(node, dict):
            continue
        c_type = node.get("class_type")
        inputs = node.setdefault("inputs", {})
        if c_type == "[Comfy3D] Save 3D Mesh":
            if "save_path" in inputs:
                inputs["save_path"] = save_filename
        elif c_type == "LoadImage" and ref_image_name:
            inputs["image"] = ref_image_name
        elif req:
            if c_type == "[Comfy3D] TripoSR":
                if req.octree_resolution and "geometry_extract_resolution" in inputs:
                    inputs["geometry_extract_resolution"] = req.octree_resolution
            elif c_type == "[Comfy3D] Trellis Structured 3D Latents Models":
                if req.seed is not None and "seed" in inputs:
                    inputs["seed"] = req.seed
            elif c_type == "[Comfy3D] Hunyuan3D 21 ShapeGen":
                if req.seed is not None and "seed" in inputs:
                    inputs["seed"] = req.seed
                if req.num_inference_steps and "steps" in inputs:
                    inputs["steps"] = req.num_inference_steps
                if req.guidance_scale is not None and "guidance_scale" in inputs:
                    inputs["guidance_scale"] = req.guidance_scale
                if req.octree_resolution and "octree_resolution" in inputs:
                    inputs["octree_resolution"] = req.octree_resolution
            elif "prompt" in inputs and isinstance(inputs["prompt"], str) and req.prompt:
                inputs["prompt"] = req.prompt
            elif "text" in inputs and isinstance(inputs["text"], str) and req.prompt:
                inputs["text"] = req.prompt
    return scoped


def _workspace_root() -> Path:
    """Resolve the repository root regardless of the backend CWD.

    backend/app/api/v1/generation.py -> repo root (five parents up).
    """
    return Path(__file__).resolve().parent.parent.parent.parent.parent


_WS_ROOT = _workspace_root()
_INPUT_DIR = _WS_ROOT / "ENGINE" / "ComfyUI" / "input"


async def process_generation_job(job_id: str, req: GenerationRequest):
    """Background task to process generation job via ComfyUI with verified workflows."""
    client = get_comfyui_client()
    artifact_manager = get_artifact_manager()
    workflow_registry = get_workflow_registry()
    input_dir = _INPUT_DIR
    input_dir.mkdir(parents=True, exist_ok=True)

    listener = None
    tracker = None
    prompt_id = None
    prompt_data = None
    workflow_version = None

    try:
        try:
            listener, tracker = await create_job_listener(job_id)
        except Exception as l_err:
            logger.warning("Failed to start event listener for %s: %s", job_id, l_err)

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

        # Resolve the exact workflow version for the selected model.
        # §9: never silently fall back to a different model's workflow.
        workflow_version = await workflow_registry.get_active_version(model_id)
        if workflow_version is None:
            raise RuntimeError(
                f"No verified workflow registered for model '{model_id}'. "
                f"Save a workflow in native ComfyUI first."
            )
        workflow = workflow_version.prompt
        save_filename = f"{job_id}.glb"

        # Prepare reference image in ComfyUI input directory
        ref_image_name = "test.png"
        if req.reference_image_url:
            raw_name = Path(req.reference_image_url).name
            storage_upload = Path(settings.storage_local_path).resolve() / "uploads" / raw_name
            if storage_upload.exists():
                shutil.copy2(storage_upload, input_dir / raw_name)
                ref_image_name = raw_name
            elif (input_dir / raw_name).exists():
                ref_image_name = raw_name
            else:
                # Ensure input file exists for LoadImage
                ref_image_name = raw_name
                try:
                    from PIL import Image
                    img = Image.new("RGB", (256, 256), color=(128, 128, 128))
                    img.save(input_dir / ref_image_name)
                except Exception:
                    pass
        elif not (input_dir / "test.png").exists():
            try:
                from PIL import Image
                img = Image.new("RGB", (256, 256), color=(128, 128, 128))
                img.save(input_dir / "test.png")
            except Exception:
                pass

        # Queue the exact persisted workflow snapshot in ComfyUI, scoped to this
        # job so concurrent jobs never write the same output file.
        prompt_response = await client.queue_prompt(
            _job_scoped_prompt(workflow, job_id, ref_image_name=ref_image_name, req=req),
            client_id=f"job_{job_id}",
        )
        prompt_id = prompt_response.get("prompt_id")

        if not prompt_id:
            raise RuntimeError(f"Failed to queue in ComfyUI: {prompt_response}")

        # Update job with prompt_id and the exact workflow version it used
        async with AsyncSessionLocal() as session:
            job = await session.get(GenerationJob, job_id)
            if job:
                meta = dict(job.processing_metadata or {})
                meta["comfyui_prompt_id"] = prompt_id
                meta["workflow_version_id"] = workflow_version.id
                meta["workflow_id"] = workflow_version.workflow_id
                job.processing_metadata = meta
                job.workflow_id = workflow_version.workflow_id
                job.workflow_version_id = workflow_version.id
                job.stage = "generating"
                job.progress = 20
                job.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                await session.commit()

        # Monitor real ComfyUI execution
        max_wait = 360  # 6 minutes
        poll_interval = 2
        waited = 0

        while waited < max_wait:
            await asyncio.sleep(poll_interval)
            waited += poll_interval

            # Check if job was cancelled by user
            async with AsyncSessionLocal() as session:
                job = await session.get(GenerationJob, job_id)
                if job and job.status == "cancelled":
                    logger.info("Job %s was cancelled, exiting background worker", job_id)
                    return

            # Real-time WebSocket progress tracker reflection
            if tracker:
                status_dict = tracker.get_status()
                current_prog = status_dict.get("progress", 0)
                current_node = status_dict.get("current_node", "")
                if current_prog > 0 or current_node:
                    async with AsyncSessionLocal() as session:
                        job = await session.get(GenerationJob, job_id)
                        if job and job.status not in ("completed", "failed", "cancelled"):
                            if current_prog > (job.progress or 0):
                                job.progress = min(current_prog, 95)
                            if current_node:
                                job.stage = f"node:{current_node}"
                            job.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                            await session.commit()

            # Check history to see if completed or failed
            history = await client.get_history(prompt_id)
            if prompt_id in history:
                prompt_data = history[prompt_id]
                status_info = prompt_data.get("status", {})
                if status_info.get("status_str") == "error":
                    messages = status_info.get("messages", [])
                    raise RuntimeError(f"ComfyUI execution failed for prompt {prompt_id}: {messages}")
                if status_info.get("completed", False) or "outputs" in prompt_data:
                    break

            # Check queue status
            queue = await client.get_queue()
            running = queue.get("queue_running", [])
            pending = queue.get("queue_pending", [])
            is_running = any(item[1] == prompt_id for item in running)
            is_pending = any(item[1] == prompt_id for item in pending)

            if not is_running and not is_pending and waited > 4:
                # Finished execution - re-check history to verify success or error
                history = await client.get_history(prompt_id)
                if prompt_id in history:
                    prompt_data = history[prompt_id]
                    status_info = prompt_data.get("status", {})
                    if status_info.get("status_str") == "error":
                        raise RuntimeError(f"ComfyUI execution failed for prompt {prompt_id}: {status_info.get('messages')}")
                break

            # Reflect execution state if still running
            async with AsyncSessionLocal() as session:
                job = await session.get(GenerationJob, job_id)
                if job:
                    if is_running and (job.progress or 0) < 60:
                        job.progress = 60
                        job.stage = "executing_nodes"
                        job.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                        await session.commit()

        # Final check if job was cancelled
        async with AsyncSessionLocal() as session:
            job = await session.get(GenerationJob, job_id)
            if job and job.status == "cancelled":
                return

        # Process and register artifacts safely with exact history outputs
        history_outputs = prompt_data.get("outputs") if (prompt_data and isinstance(prompt_data, dict)) else None
        metadata = artifact_manager.process_job_outputs(
            job_id, prompt_id, prefix=job_id, history_outputs=history_outputs
        )

        # Validate master source.glb output
        job_dir = artifact_manager.get_job_dir(job_id)
        master_mesh = job_dir / "source.glb"
        if not master_mesh.exists():
            master_mesh = job_dir / "model.glb"

        if not master_mesh.exists() or master_mesh.stat().st_size == 0:
            raise RuntimeError(f"ComfyUI execution finished but output mesh was not produced for prompt {prompt_id}")

        # Real post-processing pipeline
        if req.repair_uvs:
            try:
                from app.core.mesh_optimizer import generate_uvs_with_xatlas
                import trimesh
                m = trimesh.load(str(master_mesh))
                unwrapped, fixed = generate_uvs_with_xatlas(m)
                if fixed:
                    unwrapped.export(str(job_dir / "repaired.glb"))
            except Exception as e:
                logger.warning("UV repair failed: %s", e)

        if req.game_ready or req.auto_optimize:
            try:
                from app.core.mesh_optimizer import optimize_mesh_headless
                target_budget = req.face_count or 15000
                gr_path = str(job_dir / "game_ready.glb")
                optimize_mesh_headless(
                    input_mesh=str(master_mesh),
                    output_mesh=gr_path,
                    target_polycount=target_budget,
                )
            except Exception as e:
                logger.warning("Game-ready optimization failed: %s", e)

        if req.generate_lod:
            try:
                from app.core.mesh_optimizer import generate_lods
                generate_lods(
                    input_path=str(master_mesh),
                    output_dir=str(job_dir / "lods"),
                    lod_count=req.lod_count or 3,
                    lod_preset=req.lod_preset or "medium",
                    preserve_details=req.preserve_details or 75.0,
                )
            except Exception as e:
                logger.warning("LOD generation failed: %s", e)

        if req.generate_collision:
            try:
                from app.core.mesh_optimizer import generate_collision_mesh
                generate_collision_mesh(
                    input_path=str(master_mesh),
                    output_path=str(job_dir / "collision.glb"),
                )
            except Exception as e:
                logger.warning("Collision mesh generation failed: %s", e)

        # Update job with successful completion
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
                job.file_size = metadata.get("file_size") or master_mesh.stat().st_size
                job.download_urls = metadata.get("download_urls")
                job.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                job.updated_at = job.completed_at

                meta = dict(job.processing_metadata or {})
                meta.update(metadata)
                job.processing_metadata = meta
                await session.commit()
                logger.info("Generation job %s completed successfully (master source.glb validated)", job_id)

    except Exception as e:
        logger.exception("Generation job %s failed: %s", job_id, e)
        async with AsyncSessionLocal() as session:
            job = await session.get(GenerationJob, job_id)
            if job and job.status != "cancelled":
                job.status = "failed"
                job.stage = "failed"
                job.error_message = str(e)
                job.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                job.updated_at = job.completed_at
                await session.commit()
    finally:
        try:
            await stop_job_listener(job_id)
        except Exception:
            pass


@router.post("/{job_id}/cancel", response_model=CancelResponse)
async def cancel_generation(job_id: str):
    """Cancel a generation job using ComfyUI job-specific cancellation."""
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

            # Native job-specific cancellation (does not interrupt unrelated jobs)
            prompt_id = (job.processing_metadata or {}).get("comfyui_prompt_id")
            if prompt_id:
                await client.cancel_job(prompt_id)

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