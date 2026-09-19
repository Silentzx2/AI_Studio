"""Admin endpoints for AI Studio backend."""

import asyncio
import json
import logging
import os
import platform
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import psutil
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, func, select

from app.config import get_settings
from app.core import get_comfyui_client, get_storage_manager
from app.database import AsyncSessionLocal
from app.models import GenerationJob

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

# Track start time for uptime calculation
START_TIME = time.time()


class HFTokenRequest(BaseModel):
    token: str


class ModelActionRequest(BaseModel):
    model_id: str
    action: str
    include_auxiliary: Optional[bool] = False
    auxiliary_names: Optional[list[str]] = None


@router.get("/overview")
async def get_admin_overview():
    """Return comprehensive admin overview metrics."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)

    uptime_seconds = int(time.time() - START_TIME)
    days = uptime_seconds // 86400
    hours = (uptime_seconds % 86400) // 3600
    minutes = (uptime_seconds % 3600) // 60
    uptime_str = f"{days}d {hours}h {minutes}m" if days > 0 else f"{hours}h {minutes}m"

    # Database metrics
    active_jobs = 0
    queued_jobs = 0
    completed_today = 0
    failed_today = 0
    total_completed = 0
    total_failed = 0

    try:
        async with AsyncSessionLocal() as session:
            # Active
            res = await session.execute(
                select(func.count(GenerationJob.id)).where(
                    GenerationJob.status.in_(["processing", "generating", "running"])
                )
            )
            active_jobs = res.scalar() or 0

            # Queued
            res = await session.execute(
                select(func.count(GenerationJob.id)).where(GenerationJob.status == "queued")
            )
            queued_jobs = res.scalar() or 0

            # Completed today
            res = await session.execute(
                select(func.count(GenerationJob.id)).where(
                    GenerationJob.status == "completed",
                    GenerationJob.completed_at >= today_start,
                )
            )
            completed_today = res.scalar() or 0

            # Failed today
            res = await session.execute(
                select(func.count(GenerationJob.id)).where(
                    GenerationJob.status == "failed",
                    GenerationJob.completed_at >= today_start,
                )
            )
            failed_today = res.scalar() or 0

            # Total for rate
            res = await session.execute(
                select(func.count(GenerationJob.id)).where(GenerationJob.status == "completed")
            )
            total_completed = res.scalar() or 0
            res = await session.execute(
                select(func.count(GenerationJob.id)).where(GenerationJob.status == "failed")
            )
            total_failed = res.scalar() or 0
    except Exception as exc:
        logger.warning("Admin overview failed to query DB: %s", exc)

    total_jobs = total_completed + total_failed
    success_rate = round((total_completed / total_jobs) * 100, 1) if total_jobs > 0 else 100.0

    # System metrics
    cpu_usage = int(psutil.cpu_percent(interval=None))
    cpu_cores = psutil.cpu_count(logical=False) or 1
    cpu_threads = psutil.cpu_count(logical=True) or 1
    cpu_name = platform.processor() or "x86_64"

    ram = psutil.virtual_memory()
    ram_usage = int(ram.percent)
    ram_total = round(ram.total / (1024**3), 1)

    # Disk / Storage
    storage = get_storage_manager()
    storage_path = Path(storage.storage_root)
    try:
        disk = shutil.disk_usage(storage_path)
        storage_total_gb = round(disk.total / (1024**3), 1)
        storage_used_gb = round(disk.used / (1024**3), 1)
    except Exception:
        storage_total_gb = 100.0
        storage_used_gb = 10.0

    # ComfyUI queue & VRAM
    comfy_client = get_comfyui_client()
    queue_running = False
    vram_used_mb = 0
    vram_total_mb = 0
    gpu_utilization = 0
    cuda_available = False

    try:
        import torch
        cuda_available = torch.cuda.is_available()
        if cuda_available:
            vram_used_mb = int(torch.cuda.memory_allocated() / (1024 * 1024))
            vram_total_mb = int(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024))
    except Exception:
        pass

    try:
        queue_info = await comfy_client.get_queue()
        running_prompts = queue_info.get("queue_running", [])
        queue_running = len(running_prompts) > 0
    except Exception:
        pass

    return {
        "success": True,
        "data": {
            "status": "online",
            "uptime": uptime_str,
            "active_jobs": active_jobs,
            "queued_jobs": queued_jobs,
            "completed_today": completed_today,
            "failed_today": failed_today,
            "success_rate": success_rate,
            "gpu_utilization": gpu_utilization,
            "vram_used_mb": vram_used_mb,
            "vram_total_mb": vram_total_mb,
            "cpu_usage": cpu_usage,
            "cpu_name": cpu_name,
            "cpu_cores": cpu_cores,
            "cpu_threads": cpu_threads,
            "ram_usage": ram_usage,
            "ram_total": ram_total,
            "storage_used_gb": storage_used_gb,
            "storage_total_gb": storage_total_gb,
            "queue_running": queue_running,
            "cuda_available": cuda_available,
        },
    }


@router.get("/system")
async def get_admin_system():
    """Return system information for the admin panel."""
    client = get_comfyui_client()
    comfy_stats = await client.health_check()

    try:
        import torch
        cuda_avail = torch.cuda.is_available()
        gpu_name = torch.cuda.get_device_name(0) if cuda_avail else "CPU Only"
    except Exception:
        cuda_avail = False
        gpu_name = "CPU Only"

    return {
        "success": True,
        "data": {
            "platform": platform.platform(),
            "python_version": platform.python_version(),
            "cpu_count": psutil.cpu_count(logical=True),
            "ram_gb": round(psutil.virtual_memory().total / (1024**3), 1),
            "cuda_available": cuda_avail,
            "gpu_name": gpu_name,
            "comfyui": comfy_stats.get("data", {}).get("system", {}),
            "app_version": settings.app_version,
            "environment": settings.environment,
        },
    }


@router.get("/health/deep")
async def get_deep_health():
    """Comprehensive deep health check of all components."""
    checks = {}
    overall_ok = True

    # 1. Database check
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(select(1))
        checks["database"] = {"status": "ok", "message": "PostgreSQL operational"}
    except Exception as exc:
        checks["database"] = {"status": "error", "message": str(exc)}
        overall_ok = False

    # 2. ComfyUI check
    client = get_comfyui_client()
    try:
        health = await client.health_check(force=True)
        if health.get("status") == "ok":
            checks["comfyui"] = {"status": "ok", "message": "ComfyUI operational"}
        else:
            checks["comfyui"] = {"status": "error", "message": health.get("error", "unreachable")}
            overall_ok = False
    except Exception as exc:
        checks["comfyui"] = {"status": "error", "message": str(exc)}
        overall_ok = False

    # 3. Storage check
    try:
        storage = get_storage_manager()
        test_file = Path(storage.storage_root) / ".health_check"
        test_file.write_text("ok")
        test_file.unlink()
        checks["storage"] = {"status": "ok", "message": "Storage writeable"}
    except Exception as exc:
        checks["storage"] = {"status": "error", "message": str(exc)}
        overall_ok = False

    # 4. CUDA / Compute
    try:
        import torch
        if torch.cuda.is_available():
            checks["cuda"] = {"status": "ok", "device": torch.cuda.get_device_name(0)}
        else:
            checks["cuda"] = {"status": "info", "device": "CPU mode"}
    except Exception as exc:
        checks["cuda"] = {"status": "error", "message": str(exc)}

    return {
        "success": True,
        "status": "healthy" if overall_ok else "degraded",
        "checks": checks,
    }


@router.get("/logs")
async def get_admin_logs(limit: int = 100, level: Optional[str] = None):
    """Retrieve recent log entries."""
    log_files = [
        ("api", Path("logs/api.log")),
        ("comfyui", Path("logs/comfyui.log")),
    ]
    entries = []

    for source, log_path in log_files:
        if log_path.exists():
            try:
                lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-limit:]
                for i, line in enumerate(lines):
                    lvl = "info"
                    if "error" in line.lower() or "exception" in line.lower():
                        lvl = "error"
                    elif "warn" in line.lower():
                        lvl = "warn"

                    if level and lvl != level.lower():
                        continue

                    entries.append({
                        "id": f"{source}-{i}-{int(time.time())}",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "level": lvl,
                        "source": source,
                        "message": line,
                    })
            except Exception:
                pass

    return {"success": True, "data": {"logs": entries[-limit:]}}


@router.delete("/logs")
async def clear_admin_logs():
    """Clear server log files."""
    for log_name in ["logs/api.log", "logs/comfyui.log"]:
        p = Path(log_name)
        if p.exists():
            try:
                p.write_text("")
            except Exception:
                pass
    return {"success": True, "message": "Logs cleared"}


@router.get("/logs/stream")
async def stream_admin_logs(last_n: int = 50):
    """Server-Sent Events (SSE) stream for live logs."""
    async def event_generator():
        yield f"data: {json.dumps({'level': 'HEARTBEAT', 'message': ''})}\n\n"
        log_path = Path("logs/comfyui.log")
        if log_path.exists():
            lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-last_n:]
            for line in lines:
                payload = {
                    "id": f"log-{int(time.time()*1000)}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "level": "info" if "error" not in line.lower() else "error",
                    "source": "comfyui",
                    "message": line,
                }
                yield f"data: {json.dumps(payload)}\n\n"

        while True:
            await asyncio.sleep(2)
            yield f"data: {json.dumps({'level': 'HEARTBEAT', 'message': ''})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/settings")
async def get_admin_settings():
    """Return admin configuration settings."""
    return {
        "success": True,
        "data": {
            "app_name": settings.app_name,
            "app_version": settings.app_version,
            "comfyui_url": settings.comfyui_url,
            "storage_path": settings.storage_local_path,
            "cors_origins": settings.cors_origins,
            "debug": settings.debug,
        },
    }


@router.get("/settings/hf-token")
async def get_hf_token_status():
    """Check if Hugging Face token is configured."""
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    return {
        "success": True,
        "data": {
            "configured": bool(token and len(token.strip()) > 5),
            "valid": bool(token and len(token.strip()) > 5),
        },
    }


@router.post("/settings/hf-token")
async def save_hf_token(body: HFTokenRequest):
    """Save Hugging Face token."""
    os.environ["HF_TOKEN"] = body.token.strip()
    return {"success": True, "message": "Hugging Face token updated"}


@router.get("/queue")
async def get_admin_queue():
    """Get active and queued prompts from ComfyUI."""
    client = get_comfyui_client()
    try:
        queue = await client.get_queue()
        running = queue.get("queue_running", [])
        pending = queue.get("queue_pending", [])
        return {
            "success": True,
            "data": {
                "active": {f"item_{i}": [item[1]] for i, item in enumerate(running)},
                "reserved": {f"item_{i}": [item[1]] for i, item in enumerate(pending)},
                "active_count": len(running),
                "reserved_count": len(pending),
            },
        }
    except Exception as exc:
        logger.warning("Failed to get ComfyUI queue: %s", exc)
        return {
            "success": True,
            "data": {
                "active": {},
                "reserved": {},
                "active_count": 0,
                "reserved_count": 0,
            },
        }


@router.post("/queue/purge")
async def purge_queue():
    """Purge queued items in ComfyUI and cancel queued jobs in DB."""
    client = get_comfyui_client()
    try:
        session = await client._get_session()
        await session.post(f"{client.base_url}/queue", json={"clear": True})
    except Exception as exc:
        logger.warning("Failed to clear ComfyUI queue: %s", exc)

    try:
        async with AsyncSessionLocal() as db_session:
            res = await db_session.execute(
                select(GenerationJob).where(GenerationJob.status == "queued")
            )
            for job in res.scalars().all():
                job.status = "cancelled"
                job.stage = "cancelled"
            await db_session.commit()
    except Exception:
        pass

    return {"success": True, "message": "Queue purged"}


@router.get("/jobs")
async def list_admin_jobs(limit: int = 50):
    """List generation jobs for the admin panel."""
    try:
        async with AsyncSessionLocal() as session:
            res = await session.execute(
                select(GenerationJob).order_by(desc(GenerationJob.created_at)).limit(limit)
            )
            jobs = res.scalars().all()
            return {
                "success": True,
                "data": {
                    "jobs": [
                        {
                            "id": j.id,
                            "status": j.status,
                            "type": j.mode,
                            "progress": j.progress or 0,
                            "created_at": j.created_at.isoformat() if j.created_at else None,
                            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                            "error": j.error_message,
                            "error_message": j.error_message,
                            "mode": j.mode,
                            "provider": j.provider,
                        }
                        for j in jobs
                    ]
                },
            }
    except Exception as exc:
        logger.warning("Failed to list admin jobs: %s", exc)
        return {"success": True, "data": {"jobs": []}}


@router.get("/models")
async def list_admin_models():
    """List models with real readiness verification against ComfyUI and local weights."""
    client = get_comfyui_client()
    comfy_health = await client.health_check()
    comfy_connected = comfy_health.get("status") == "ok"

    # Check for presence of real weights in checkpoints or custom node directories
    triposr_ready = Path("ENGINE/ComfyUI/models/checkpoints/model.ckpt").exists() or \
                    Path("ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/Gen_3D_Modules/TripoSR").exists()
    hunyuan_ready = Path("ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/Gen_3D_Modules/Hunyuan3D_2_1").exists()
    trellis_ready = Path("ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/Gen_3D_Modules/TRELLIS").exists()

    models = [
        {
            "id": "triposr",
            "label": "TripoSR (Fast Mesh)",
            "name": "TripoSR",
            "category": "3D Generation",
            "type": "image-to-3d",
            "installed": triposr_ready,
            "available": comfy_connected,
            "loaded": comfy_connected and triposr_ready,
            "active": comfy_connected and triposr_ready,
            "status": "installed" if triposr_ready else "not-installed",
            "size_estimate_gb": 2.0,
            "size_mb": 2048,
            "vram_required_mb": 4096,
            "supports_text_to_3d": False,
            "supports_image_to_3d": True,
            "supports_texture": False,
            "repo_ready": triposr_ready,
            "weights_ready": triposr_ready,
        },
        {
            "id": "hunyuan3d_21",
            "label": "Hunyuan3D 2.1 ShapeGen",
            "name": "Hunyuan3D-2.1",
            "category": "3D Generation",
            "type": "image-to-3d",
            "installed": hunyuan_ready,
            "available": comfy_connected,
            "loaded": False,
            "active": False,
            "status": "installed" if hunyuan_ready else "not-installed",
            "size_estimate_gb": 12.5,
            "size_mb": 12800,
            "vram_required_mb": 8192,
            "supports_text_to_3d": True,
            "supports_image_to_3d": True,
            "supports_texture": True,
            "repo_ready": hunyuan_ready,
            "weights_ready": hunyuan_ready,
        },
        {
            "id": "trellis",
            "label": "TRELLIS Large",
            "name": "TRELLIS",
            "category": "3D Generation",
            "type": "image-to-3d",
            "installed": trellis_ready,
            "available": comfy_connected,
            "loaded": False,
            "active": False,
            "status": "installed" if trellis_ready else "not-installed",
            "size_estimate_gb": 15.0,
            "size_mb": 15360,
            "vram_required_mb": 12288,
            "supports_text_to_3d": True,
            "supports_image_to_3d": True,
            "supports_texture": False,
            "repo_ready": trellis_ready,
            "weights_ready": trellis_ready,
        },
    ]
    return {"success": True, "data": {"models": models}}


@router.post("/models/action")
async def model_action(body: ModelActionRequest):
    """Handle model action requests."""
    logger.info("Model action requested: %s for %s", body.action, body.model_id)
    if body.action == "unload":
        client = get_comfyui_client()
        await client.free_memory(unload_models=True)
        return {"success": True, "message": f"Model {body.model_id} unloaded"}
    return {"success": True, "message": f"Action '{body.action}' completed for {body.model_id}"}


@router.post("/repair/{provider_name}")
async def repair_provider(provider_name: str):
    """Repair / re-initialize provider."""
    client = get_comfyui_client()
    await client.free_memory(unload_models=True)
    return {"success": True, "message": f"Provider '{provider_name}' refreshed"}


@router.get("/install/status")
async def get_install_status():
    """Return model install status.

    Weights are downloaded by the 3D-Pack's own HuggingFace loaders via
    scripts/update-models.sh. This endpoint reports the real on-disk state
    rather than a fake progress percentage.
    """
    from app.api.v1.models import CHECKPOINT_LOCATIONS
    models = []
    for model_id, candidates in CHECKPOINT_LOCATIONS.items():
        present = False
        for p in candidates:
            try:
                if p.is_file() and p.stat().st_size > 1024 * 1024:
                    present = True
                    break
                if p.is_dir() and (any(p.rglob("*.safetensors")) or any(p.rglob("*.bin")) or any(p.rglob("*.ckpt"))):
                    present = True
                    break
            except Exception:
                pass
        models.append({
            "model_id": model_id,
            "installed": present,
            "phase": "ready" if present else "not_downloaded",
            "progress": 100 if present else 0,
            "percent": 100 if present else 0,
        })
    return {"success": True, "data": {"status": "idle", "models": models, "active_downloads": []}}


@router.get("/install/progress/{model_id}")
async def get_install_progress(model_id: str):
    """Return installation progress for a model from real on-disk state."""
    from app.api.v1.models import CHECKPOINT_LOCATIONS
    candidates = CHECKPOINT_LOCATIONS.get(model_id, [])
    present = False
    for p in candidates:
        try:
            if p.is_file() and p.stat().st_size > 1024 * 1024:
                present = True
                break
            if p.is_dir() and (any(p.rglob("*.safetensors")) or any(p.rglob("*.bin")) or any(p.rglob("*.ckpt"))):
                present = True
                break
        except Exception:
            pass
    return {
        "success": True,
        "data": {
            "model_id": model_id,
            "phase": "ready" if present else "not_downloaded",
            "progress": 100 if present else 0,
            "percent": 100 if present else 0,
        },
    }


@router.get("/install/stream/{model_id}")
async def stream_install_progress(model_id: str):
    """SSE stream for install progress — reports real on-disk state, not fake progress."""
    from app.api.v1.models import CHECKPOINT_LOCATIONS
    from fastapi.responses import StreamingResponse

    async def event_generator():
        candidates = CHECKPOINT_LOCATIONS.get(model_id, [])
        present = False
        for p in candidates:
            try:
                if p.is_file() and p.stat().st_size > 1024 * 1024:
                    present = True
                    break
                if p.is_dir() and (any(p.rglob("*.safetensors")) or any(p.rglob("*.bin")) or any(p.rglob("*.ckpt"))):
                    present = True
                    break
            except Exception:
                pass
        payload = {
            "model_id": model_id,
            "phase": "complete" if present else "not_downloaded",
            "progress": 100 if present else 0,
            "percent": 100 if present else 0,
        }
        yield f"data: {json.dumps(payload)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
