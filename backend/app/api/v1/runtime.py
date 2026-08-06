"""Runtime management API."""
from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import get_settings
from app.utils.response import error, success

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

_VRAM_LIMITS = [
    {"id": 0, "label": "Auto"},
    {"id": 4000, "label": "4 GB"},
    {"id": 8000, "label": "8 GB"},
    {"id": 12000, "label": "12 GB"},
    {"id": 16000, "label": "16 GB"},
    {"id": 24000, "label": "24 GB"},
    {"id": 40000, "label": "40 GB"},
    {"id": 80000, "label": "80 GB"},
]

_TEXTURE_RESOLUTIONS = [
    {"id": "512", "label": "512"},
    {"id": "1024", "label": "1024"},
    {"id": "2048", "label": "2048"},
    {"id": "4096", "label": "4096"},
]


async def _build_runtime_status_payload() -> dict[str, Any]:
    """Build the current runtime status payload.

    Kept in a helper so `/runtime` and `/runtime/status` stay aligned
    instead of drifting apart over time.
    """
    from runtime.engine import get_engine
    from runtime.health import RuntimeHealth
    from runtime.storage import get_storage_config

    from app.core.providers.registry import get_registry

    engine = get_engine()
    registry = get_registry()
    storage = get_storage_config()
    health = await RuntimeHealth.check_all()
    try:
        eng_health = engine.health()
    except Exception:
        eng_health = {}

    worker_count = 0
    try:
        from app.workers.celery_app import celery_app
        inspect = celery_app.control.inspect(timeout=1.0)
        stats = inspect.stats() or {}
        worker_count = len(stats)
    except Exception:
        pass

    return {
        "engine": eng_health,
        "system": health,
        "active_provider": settings.ai_provider,
        "runtime_mode": settings.runtime_mode,
        "providers": registry.get_all_availability(),
        "storage": storage.get_disk_usage(),
        "workers": worker_count,
    }


@router.get("/status")
async def runtime_status():
    try:
        payload = await _build_runtime_status_payload()
        return success(payload)
    except Exception as exc:
        logger.exception("Status check failed")
        return error(f"Status check failed: {exc}")


@router.get("")
async def runtime_root():
    return await runtime_status()


@router.get("/health")
async def runtime_health():
    from runtime.gpu import get_gpu_info
    from runtime.health import RuntimeHealth

    from app.core.providers.registry import get_registry

    health = await RuntimeHealth.check_all()
    gpu = get_gpu_info()
    registry = get_registry()
    available = registry.list_available_providers()
    return success({
        "status": "healthy" if gpu.available and available else "degraded",
        "gpu": gpu.available,
        "providers_available": len(available),
        "summary": health,
    })


@router.get("/options")
async def get_runtime_options():
    try:
        from runtime.gpu import get_gpu_info
        from runtime.installer import (
            OUTPUT_FORMATS,
            PROVIDER_METADATA,
            RENDER_QUALITIES,
            RESOLUTIONS,
            RIGGING_PROVIDERS,
            TEXTURE_MODELS,
        )

        from app.core.providers.registry import get_registry
        from app.core.registry.model_registry import ModelRegistry

        gpu = get_gpu_info()
        registry = get_registry()

        # --- Build three_d_models from PROVIDER_METADATA ---
        three_d_models = []
        seen_ids: set[str] = set()
        for name, meta in PROVIDER_METADATA.items():
            if meta.get("category") != "3d_generation":
                continue
            avail = registry.get_availability(name)
            three_d_models.append({
                "id": name,
                "label": meta["label"],
                "available": avail.get("available", False),
                "vram_required_mb": meta.get("vram_required_mb", 0),
                "supports_text_to_3d": meta.get("supports_text_to_3d", False),
                "supports_image_to_3d": meta.get("supports_image_to_3d", False),
                "workspace_compatibility": meta.get("workspace_compatibility", []),
                "supports": {
                    "text_to_3d": meta.get("supports_text_to_3d", False),
                    "image_to_3d": meta.get("supports_image_to_3d", False),
                    "texture_generation": meta.get("supports_texture", False),
                    "rigging_animation": False,
                    "detail_enhancement": False,
                    "part_separation": False,
                },
            })
            seen_ids.add(name.lower())

        # --- Also merge pipeline/registry models (installed + available 3d_generation) ---
        try:
            model_reg = ModelRegistry()
            installed_models = await model_reg.get_installed_models()
            available_models = await model_reg.get_available_models()
            # Deduplicate installed vs available by id
            all_registry: dict[str, dict[str, Any]] = {}
            for m in available_models + installed_models:
                mid = str(m.get("id", "")).lower()
                if mid and m.get("category") == "3d_generation":
                    all_registry[mid] = {**all_registry.get(mid, {}), **m}
            for mid, m in all_registry.items():
                if mid in seen_ids:
                    continue
                manifest = m.get("manifest") or {}
                caps = manifest.get("capabilities") or {}
                ws_compat = m.get("workspace_compatibility") or manifest.get("workspace_compatibility") or []
                three_d_models.append({
                    "id": m.get("id", mid),
                    "label": m.get("label") or m.get("name") or mid,
                    "available": bool(m.get("available", m.get("installed", False))),
                    "installed": bool(m.get("installed", False)),
                    "status": m.get("status", "not_installed"),
                    "vram_required_mb": m.get("vram_required_mb") or manifest.get("recommended_vram_mb", 0),
                    "supports_text_to_3d": bool(caps.get("text_to_3d")),
                    "supports_image_to_3d": bool(caps.get("image_to_3d")),
                    "workspace_compatibility": ws_compat,
                    "supports": {
                        "text_to_3d": bool(caps.get("text_to_3d")),
                        "image_to_3d": bool(caps.get("image_to_3d")),
                        "texture_generation": bool(caps.get("texture_generation")),
                        "rigging_animation": bool(caps.get("rigging_animation")),
                        "detail_enhancement": bool(caps.get("detail_enhancement")),
                        "part_separation": bool(caps.get("part_separation")),
                    },
                })
                seen_ids.add(mid)
        except Exception as pipeline_exc:
            logger.warning("Could not merge pipeline models into runtime options: %s", pipeline_exc)

        gpu_options = [{"id": "cpu", "label": "CPU Only"}]
        if gpu.available:
            for dev in gpu.devices:
                gpu_options.append({
                    "id": f"cuda:{dev['index']}",
                    "label": f"{dev['name']} ({dev['vram_mb'] // 1024} GB)",
                })
        return success({
            "three_d_models": three_d_models,
            "texture_models": TEXTURE_MODELS,
            "rigging_providers": RIGGING_PROVIDERS,
            "render_qualities": RENDER_QUALITIES,
            "resolutions": RESOLUTIONS,
            "texture_resolutions": _TEXTURE_RESOLUTIONS,
            "output_formats": OUTPUT_FORMATS,
            "vram_limits": _VRAM_LIMITS,
            "gpu_options": gpu_options,
            "active_provider": settings.ai_provider,
            "gpu_available": gpu.available,
            "gpu_required": True,
            "hf_token_configured": bool(
                os.environ.get("HUGGINGFACE_TOKEN") or settings.huggingface_token
            ),
        })
    except Exception as exc:
        logger.exception("get_runtime_options failed")
        return error(f"Options error: {exc}")


@router.get("/hf-token")
async def get_hf_token_status():
    try:
        from app.api.v1.hf_token import get_hf_token_status as _get
        return await _get()
    except Exception:
        return success({"configured": False})


@router.post("/hf-token")
async def set_hf_token(req: BaseModel):
    from app.api.v1.hf_token import HFTokenRequest, save_hf_token
    token = getattr(req, "token", "")
    return await save_hf_token(HFTokenRequest(token=token))


@router.delete("/hf-token")
async def remove_hf_token_route():
    from app.api.v1.hf_token import remove_hf_token
    return await remove_hf_token()


@router.post("/hf-token/verify")
async def verify_hf_token_route():
    from app.api.v1.hf_token import verify_hf_token
    return await verify_hf_token()


@router.get("/install/stream")
async def install_stream_sse(model_id: str = ""):
    """Stream real installation progress via Server-Sent Events (SSE).

    Accepts an optional ``model_id`` query parameter.  Delegates to the
    admin progress-tracking state so the frontend receives real download
    speed, size, ETA, and percentage instead of fake simulated data.

    If no install is in progress and ``model_id`` is provided, returns a
    clear error so the frontend knows the installer is not available.
    """
    import asyncio

    if model_id:
        # Delegate to the admin progress-tracking layer if available.
        try:
            from app.api.v1.admin import _DL_STATE, _dl_snapshot, _dl_load_state

            # Restore state from disk if in-memory state was lost (e.g. worker restart)
            _dl_load_state()

            if model_id not in _DL_STATE:
                return StreamingResponse(
                    iter([
                        "data: " + json.dumps({
                            "status": "failed",
                            "error": f"No installer available for model '{model_id}'. "
                                     "Start an install via /admin/models/action first.",
                            "percent": 0,
                        }) + "\n\n",
                    ]),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
                )

            async def _generate() -> AsyncGenerator[str, None]:
                last_json = ""
                idle_ticks = 0

                while True:
                    snap = _dl_snapshot(model_id)
                    snap_json = json.dumps(snap)
                    if snap_json != last_json:
                        yield f"data: {snap_json}\n\n"
                        last_json = snap_json

                    if snap.get("status") in ("completed", "failed"):
                        break

                    if snap.get("status") == "idle":
                        idle_ticks += 1
                        if idle_ticks > 120:
                            break
                    else:
                        idle_ticks = 0

                    await asyncio.sleep(0.5)

            return StreamingResponse(
                _generate(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )

        except Exception as exc:
            logger.exception("Install stream error: %s", exc)
            return StreamingResponse(
                iter([
                    "data: " + json.dumps({
                        "status": "failed",
                        "error": f"Installer not available: {exc}",
                        "percent": 0,
                    }) + "\n\n",
                ]),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )

    # No model_id provided — return an error rather than fake progress.
    return StreamingResponse(
        iter([
            "data: " + json.dumps({
                "status": "failed",
                "error": "No model_id provided. Pass ?model_id=<id> to track real install progress.",
                "percent": 0,
            }) + "\n\n",
        ]),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/providers")
async def list_providers():
    from app.core.providers.registry import get_registry
    registry = get_registry()
    out = []
    for name in registry.list_providers():
        avail = registry.get_availability(name)
        out.append({"name": name, "active": name == settings.ai_provider, **avail})
    return success({"providers": out})


@router.get("/providers/health")
async def providers_health():
    from app.core.providers.registry import get_registry

    registry = get_registry()
    out = []
    any_available = False
    for name in registry.list_providers():
        avail = registry.get_availability(name)
        available = bool(avail.get("available"))
        any_available = any_available or available
        out.append({
            "name": name,
            "active": name == settings.ai_provider,
            "available": available,
            "loaded": bool(avail.get("loaded")),
            "reason": avail.get("reason"),
        })
    return success({
        "providers": out,
        "healthy": any_available,
        "active_provider": settings.ai_provider,
    })


class SwitchProviderRequest(BaseModel):
    provider: str


@router.post("/provider")
async def switch_provider(req: SwitchProviderRequest):
    from runtime.engine import get_engine

    from app.core.providers.registry import reset_provider, validate_provider_switch

    ok, msg = validate_provider_switch(req.provider)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    engine = get_engine()
    old = settings.ai_provider
    loaded = engine._loaded if hasattr(engine, "_loaded") else {}
    if old in loaded:
        await engine.unload_provider(old)
    settings.ai_provider = req.provider
    reset_provider()
    return success({"active_provider": req.provider, "previous": old})


class InstallRequest(BaseModel):
    repos: list[str] | None = None
    models: list[str] | None = None
    skip_weights: bool = False


@router.post("/install")
async def install_runtime(req: InstallRequest, background_tasks: BackgroundTasks):
    from runtime.installer import RuntimeInstaller, resolve_install_targets

    # ponytail: Section 1 — must resolve targets; no more silent "install everything"
    targets = req.models if req.models else None
    if not targets:
        return error(
            "No models specified for install. "
            "Pass a 'models' list with specific model IDs."
        )

    def _run() -> None:
        RuntimeInstaller().full_install(
            skip_weights=req.skip_weights,
            models=targets,
        )

    background_tasks.add_task(_run)
    return success({"started": True}, "Installation started in background.")


class RepoActionRequest(BaseModel):
    repo: str


@router.post("/update")
async def update_repo(req: RepoActionRequest, background_tasks: BackgroundTasks):
    from runtime.installer import RuntimeInstaller, REPOS

    # ponytail: Section 1 — update only the specific repo, not everything
    if req.repo not in REPOS:
        return error(f"Unknown repo: {req.repo}. Available: {list(REPOS.keys())}")
    providers = REPOS[req.repo].get("providers", [])

    def _run() -> None:
        RuntimeInstaller().clone_repos_for_models(models=providers)

    background_tasks.add_task(_run)
    return success({"repo": req.repo, "started": True}, "Update started.")


@router.post("/repair")
async def repair_repo(req: RepoActionRequest, background_tasks: BackgroundTasks):
    import shutil

    from runtime.installer import RuntimeInstaller
    from runtime.storage import get_storage_config

    # ponytail: Section 1 — repair only the specific repo, not everything
    providers = []
    try:
        from runtime.installer import REPOS
        if req.repo in REPOS:
            providers = REPOS[req.repo].get("providers", [])
    except Exception:
        pass

    def _run() -> None:
        storage = get_storage_config()
        repo_path = storage.get_repo_path(req.repo)
        if repo_path.exists():
            shutil.rmtree(str(repo_path), ignore_errors=True)
        RuntimeInstaller().clone_repos_for_models(models=providers if providers else None)

    background_tasks.add_task(_run)
    return success({"repo": req.repo, "started": True}, "Repair started.")


@router.post("/remove")
async def remove_repo(req: RepoActionRequest):
    import shutil

    from runtime.storage import get_storage_config

    storage = get_storage_config()
    repo_path = storage.get_repo_path(req.repo)
    if not repo_path.exists():
        raise HTTPException(status_code=404, detail=f"Repository '{req.repo}' not found.")
    shutil.rmtree(str(repo_path), ignore_errors=True)
    return success({"repo": req.repo, "removed": True})


class ConfigUpdateRequest(BaseModel):
    cuda_device: str | None = None
    ai_provider: str | None = None
    lazy_model_loading: bool | None = None
    auto_unload_after_job: bool | None = None
    blender_enabled: bool | None = None
    blender_executable: str | None = None
    max_vram_mb: int | None = None
    cpu_threads: str | None = None
    render_quality: str | None = None
    resolution: str | None = None
    texture_resolution: str | None = None
    output_format: str | None = None
    texture_model: str | None = None
    rigging_provider: str | None = None


@router.post("/config")
async def update_config(req: ConfigUpdateRequest):
    changed: dict[str, Any] = {}
    for field_name, value in req.model_dump(exclude_none=True).items():
        if hasattr(settings, field_name):
            setattr(settings, field_name, value)
            changed[field_name] = value
    return success({"updated": changed})


@router.post("/verify")
async def verify_runtime():
    """Verify environment and installation state — never raises 500."""
    try:
        from runtime.installer import RuntimeInstaller
        inst = RuntimeInstaller()
        env = inst.verify_system()
        install = inst.verify_installation()
        return success({
            "system_ok": env.get("python_ok", True),
            "cuda_available": env.get("cuda_available", False),
            "gpu_available": env.get("gpu_available", False),
            "blender_available": env.get("blender_available", False),
            "repos_cloned": install.get("repos_cloned", 0),
            "weights_downloaded": install.get("weights_downloaded", 0),
            "providers_available": install.get("providers_available", 0),
            "providers_total": install.get("providers_total", 0),
            "can_generate": install.get("can_generate", False),
            "environment": env,
            "installation": install,
        }, "Verification complete.")
    except Exception as exc:
        logger.exception("verify_runtime failed")
        return error(f"Verification error: {exc}")


@router.post("/restart")
async def restart_runtime():
    from runtime.engine import get_engine

    from app.core.providers.registry import reset_provider

    engine = get_engine()
    loaded = list(engine._loaded.keys()) if hasattr(engine, "_loaded") else []
    for name in loaded:
        await engine.unload_provider(name)
    reset_provider()
    await engine.initialize()
    return success({"restarted": True}, "Runtime restarted.")


@router.post("/clear-cache")
async def clear_cache():
    from runtime.installer import RuntimeInstaller
    RuntimeInstaller().clear_cache()
    return success({"cleared": True}, "Runtime cache cleared.")


@router.post("/clear-vram")
async def clear_vram():
    from runtime.gpu import empty_cuda_cache, get_gpu_info
    empty_cuda_cache()
    gpu = get_gpu_info()
    return success({
        "cleared": True,
        "free_vram_mb": gpu.free_vram_mb,
        "total_vram_mb": gpu.total_vram_mb,
    }, "CUDA cache cleared.")
