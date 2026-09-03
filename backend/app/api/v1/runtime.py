"""Runtime management API."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import get_settings
from app.core.cache import get_cached, set_cached
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
    # ponytail: celery inspect can block for many seconds probing a broker that
    # isn't reachable (e.g. Redis connection refused on Colab). It must never
    # serialize the /runtime/status response. Run it off the event loop with a
    # short deadline and cache the result briefly so repeated cache misses
    # don't each pay the full probe cost.
    try:
        from app.workers.celery_app import celery_app
        from app.core.cache import get_cached as _get_cached, set_cached as _set_cached

        cached_workers = _get_cached("runtime_workers", ttl_seconds=10)
        if cached_workers is not None:
            worker_count = int(cached_workers)
        else:
            async def _probe():
                return await asyncio.to_thread(
                    lambda: len(celery_app.control.inspect(timeout=1.0).stats() or {})
                )

            try:
                worker_count = await asyncio.wait_for(_probe(), timeout=1.5)
            except Exception:
                worker_count = 0
            _set_cached("runtime_workers", worker_count)
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
    cached = get_cached("runtime_status", ttl_seconds=15)
    if cached is not None:
        return success(cached)
    try:
        payload = await _build_runtime_status_payload()
        set_cached("runtime_status", payload)
        return success(payload)
    except Exception as exc:
        logger.exception("Status check failed")
        return error(f"Status check failed: {exc}")


@router.get("")
async def runtime_root():
    return await runtime_status()


@router.get("/health")
async def runtime_health():
    cached = get_cached("runtime_health", ttl_seconds=10)
    if cached is not None:
        return success(cached)
    from runtime.gpu import get_gpu_info
    from runtime.health import RuntimeHealth

    from app.core.providers.registry import get_registry

    health = await RuntimeHealth.check_all()
    gpu = get_gpu_info()
    registry = get_registry()
    available = registry.list_available_providers()
    # ponytail: surface per-provider state with READY/PARTIAL/FAILED/SKIPPED/
    # NOT_INSTALLED distinction (see Issue 9). The UI can show a clear
    # reason for each non-ready provider instead of a binary healthy/degraded.
    from runtime.installer import get_install_status_cached
    install_status = get_install_status_cached() or {}
    provider_states: dict[str, dict] = {}
    for name, info in install_status.items():
        if isinstance(info, dict):
            provider_states[name] = {
                "state": info.get("state", "unknown"),
                "blocking_reason": info.get("blocking_reason"),
                "installed": info.get("installed", False),
            }
    # Overall status: "ready" if all installed providers are ready, "partial"
    # if any are partial, "degraded" if none are available.
    states = [s["state"] for s in provider_states.values()]
    if not states:
        overall = "not_initialized"
    elif any(s == "runtime_failed" or s == "failed" for s in states):
        overall = "degraded"
    elif any(s in ("runtime_partial", "partial", "blocked") for s in states):
        overall = "partial"
    elif all(s in ("runtime_ready", "ready", "not_required") for s in states):
        overall = "healthy"
    else:
        overall = "partial"
    result = {
        "status": overall,
        "gpu": gpu.available,
        "providers_available": len(available),
        "provider_states": provider_states,
        "summary": health,
    }
    set_cached("runtime_health", result)
    return success(result)


@router.get("/options")
async def get_runtime_options():
    cached = get_cached("runtime_options", ttl_seconds=60)
    if cached is not None:
        return success(cached)
    try:
        from runtime.gpu import get_gpu_info
        from runtime.installer import (
            OUTPUT_FORMATS,
            RENDER_QUALITIES,
            RESOLUTIONS,
            RIGGING_PROVIDERS,
            TEXTURE_MODELS,
        )
        from runtime.manifest_loader import get_all_provider_metadata  # noqa: PLC0415
        from app.core.providers.registry import get_registry, is_standalone_generation_provider
        from app.core.registry.model_registry import ModelRegistry
        from runtime.installer import get_install_status_cached

        gpu = get_gpu_info()
        registry = get_registry()

        # Cache per-request to avoid repeated YAML reloads and disk I/O
        provider_meta = get_all_provider_metadata()
        install_status = get_install_status_cached() or {}

        # --- Build three_d_models from manifests ---
        three_d_models = []
        seen_ids: set[str] = set()
        for name, meta in provider_meta.items():
            if meta.get("category") != "3d_generation":
                continue
            avail = registry.get_availability(name)
            vram_req = meta.get("vram_required_mb", 0)
            status_entry = install_status.get(name, {}) if isinstance(install_status, dict) else {}
            # Gated on the authoritative `state`, not the legacy `installed`
            # boolean — installer.py sets installed_legacy = was_installed or
            # (repo_ok and weight_ok), and was_installed is True once
            # install_provider() recorded an installed_at timestamp. So
            # `installed` can be True while weights are still downloading,
            # which made the model selector show "Installed" mid-download and
            # let the generation API accept a job for a not-yet-ready model.
            overall_state = status_entry.get("state")
            is_installed = overall_state == "ready"
            is_available = bool(
                avail.get("available", False)
                or overall_state in ("runtime_ready", "ready")
            )
            model_status = "ready" if is_available else ("installed" if is_installed else "not_installed")

            # Per-capability VRAM from the manifest: shape-only vs textured
            # generation differ materially (e.g. 8 GB vs 16 GB), so the UI can
            # show the active-mode footprint and gate the texture toggle.
            try:
                from runtime.capability import get_capability_vram_mb  # noqa: PLC0415
                shape_vram_mb = get_capability_vram_mb(name, "shape")
                texture_vram_mb = (
                    get_capability_vram_mb(name, "texture_pbr")
                    or get_capability_vram_mb(name, "texture")
                )
            except Exception:
                shape_vram_mb = vram_req
                texture_vram_mb = vram_req

            three_d_models.append({
                "id": name,
                "label": meta["label"],
                "available": is_available,
                "installed": is_installed,
                "status": model_status,
                "vram_required_mb": vram_req,
                "shape_vram_mb": shape_vram_mb,
                "texture_vram_mb": texture_vram_mb,
                "supports_texture": meta.get("supports_texture", False),
                "supports_text_to_3d": meta.get("supports_text_to_3d", False),
                "supports_image_to_3d": meta.get("supports_image_to_3d", False),
                "supports_standalone_generation": is_standalone_generation_provider(name),
                "workspace_compatibility": meta.get("workspace_compatibility", []),
                "low_vram_supported": meta.get("low_vram_supported", False),
                "low_vram_required_mb": meta.get("low_vram_required_mb", 0),
                "supports": {
                    "text_to_3d": meta.get("supports_text_to_3d", False),
                    "image_to_3d": meta.get("supports_image_to_3d", False),
                    "texture_generation": meta.get("supports_texture", False),
                    "rigging_animation": False,
                    "detail_enhancement": meta.get("supports_detail_enhancement", False),
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
                vram_req = m.get("vram_required_mb") or manifest.get("recommended_vram_mb", 0)
                shape_vram_mb = vram_req
                texture_vram_mb = vram_req
                try:
                    from runtime.capability import get_capability_vram_mb  # noqa: PLC0415
                    shape_vram_mb = get_capability_vram_mb(mid, "shape") or vram_req
                    texture_vram_mb = (
                        get_capability_vram_mb(mid, "texture_pbr")
                        or get_capability_vram_mb(mid, "texture")
                    ) or vram_req
                except Exception:
                    pass
                three_d_models.append({
                    "id": m.get("id", mid),
                    "label": m.get("label") or m.get("name") or mid,
                    "available": bool(m.get("available", m.get("installed", False))),
                    "installed": bool(m.get("installed", False)),
                    "status": m.get("status", "not_installed"),
                    "vram_required_mb": vram_req,
                    "shape_vram_mb": shape_vram_mb,
                    "texture_vram_mb": texture_vram_mb,
                    "supports_texture": bool(caps.get("texture_generation")),
                    "supports_text_to_3d": bool(caps.get("text_to_3d")),
                    "supports_image_to_3d": bool(caps.get("image_to_3d")),
                    "supports_standalone_generation": is_standalone_generation_provider(mid),
                    "workspace_compatibility": ws_compat,
                    "low_vram_supported": bool(m.get("low_vram_supported") or caps.get("low_vram_supported") or manifest.get("low_vram_supported", False)),
                    "low_vram_required_mb": int(m.get("low_vram_required_mb") or manifest.get("low_vram_required_mb", 0)),
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

        # ponytail: Overlay authoritative on-disk install state so PROVIDER_METADATA
        # models (which skip the registry merge due to seen_ids) still report
        # installed/status correctly. `available` is overlaid too: it comes
        # from registry.get_availability(), which is backed by an lru_cache'd
        # registry built ONCE per process from get_install_status() at first
        # request — so a model installed after startup would show
        # available=false forever and never appear in the selector. Derive
        # availability from the live install state instead.
        try:
            install_map = {str(k).lower(): v for k, v in install_status.items()}
            for m in three_d_models:
                mid = str(m.get("id", "")).lower()
                ist = install_map.get(mid)
                if ist:
                    m["installed"] = bool(ist.get("installed", m.get("installed", False)))
                    m["status"] = ist.get("status") or m.get("status") or ("ready" if m["installed"] else "not_installed")
                    live_state = ist.get("state") or ""
                    m["available"] = bool(
                        live_state in ("runtime_ready", "ready")
                        or (m["installed"] and not ist.get("blocking_reason"))
                    )
        except Exception as install_exc:
            logger.warning("Could not overlay install state into runtime options: %s", install_exc)

        gpu_options = [{"id": "cpu", "label": "CPU Only"}]
        if gpu.available:
            for dev in gpu.devices:
                gpu_options.append({
                    "id": f"cuda:{dev['index']}",
                    "label": f"{dev['name']} ({dev['vram_mb'] // 1024} GB)",
                })

        # Colab detection for runtime policy
        colab_detected = False
        colab_vram = 0
        colab_limit = 0
        try:
            from runtime.platform_detection import _is_colab
            if _is_colab():
                colab_detected = True
                colab_vram = gpu.total_vram_mb
                colab_limit = gpu.total_vram_mb
        except Exception:
            pass

        result = {
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
            "free_vram_mb": gpu.free_vram_mb,
            "total_vram_mb": gpu.total_vram_mb,
            "gpu_required": True,
            "hf_token_configured": bool(
                os.environ.get("HUGGINGFACE_TOKEN") or settings.huggingface_token
            ),
            "colab_detected": colab_detected,
            "colab_detected_vram_mb": colab_vram,
            "colab_preparation_limit_mb": colab_limit,
        }
        set_cached("runtime_options", result)
        return success(result)
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
async def install_runtime(req: InstallRequest):
    from runtime.installer import resolve_install_targets

    # ponytail: Section 1 — must resolve targets; no more silent "install everything"
    targets = req.models if req.models else None
    if not targets:
        return error(
            "No models specified for install. "
            "Pass a 'models' list with specific model IDs."
        )

    # Dispatch to Celery for durable background execution
    from app.workers.installation_workers import install_runtime
    task = install_runtime.delay(targets, skip_weights=req.skip_weights)
    return success(
        {"started": True, "task_id": task.id, "models": targets},
        "Installation started in background.",
    )


@router.post("/prepare-runtime")
async def prepare_runtime(req: InstallRequest):
    """Stage A: prepare model runtimes only. No weights downloaded.

    Clones repos, creates per-model venvs, installs dependencies,
    resolves native dependencies via wheel-first logic.
    """
    targets = req.models if req.models else None
    if not targets:
        return error(
            "No models specified. Pass a 'models' list with specific model IDs."
        )

    from app.workers.installation_workers import prepare_runtime
    task = prepare_runtime.delay(targets)
    return success(
        {"started": True, "task_id": task.id, "models": targets},
        "Runtime preparation started in background.",
    )


@router.post("/download-weights")
async def download_weights(req: InstallRequest):
    """Stage B: download model weights only. Runtime must be ready first.

    Checks that each model's runtime is ready before downloading.
    If runtime is not ready, returns an error for that model directing
    the caller to /prepare-runtime first.
    """
    targets = req.models if req.models else None
    if not targets:
        return error(
            "No models specified. Pass a 'models' list with specific model IDs."
        )

    from app.workers.installation_workers import download_weights
    task = download_weights.delay(targets)
    return success(
        {"started": True, "task_id": task.id, "models": targets},
        "Weight download started in background.",
    )


@router.get("/legacy-weights")
async def list_legacy_weights():
    """List weights in legacy third_party/weights/ location for migration UI."""
    from runtime.storage import get_storage_config

    storage = get_storage_config()
    legacy = storage.detect_legacy_weights()
    return success({
        "legacy_weights": legacy,
        "count": len(legacy),
        "message": f"{len(legacy)} weight set(s) in legacy location",
    })


@router.post("/migrate-legacy-weights")
async def migrate_legacy_weights():
    """Copy legacy weights to per-model location. Idempotent, read-only on source."""
    import shutil
    from pathlib import Path

    from runtime.storage import get_storage_config

    storage = get_storage_config()
    legacy = storage.detect_legacy_weights()
    migrated = []
    errors = []

    for entry in legacy:
        src = Path(entry["legacy_path"])
        dst = Path(entry["per_model_path"]) if entry["per_model_path"] else None
        if not dst:
            errors.append(f"No per-model path for {entry['weight_key']}")
            continue
        if dst.exists() and storage._has_real_weight_files(dst):
            continue
        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            if src.is_dir():
                shutil.copytree(str(src), str(dst))
            else:
                shutil.copy2(str(src), str(dst))
            migrated.append(entry["weight_key"])
        except Exception as exc:
            errors.append(f"Failed to migrate {entry['weight_key']}: {exc}")

    return success({
        "migrated": migrated,
        "errors": errors,
        "message": f"{len(migrated)} weight set(s) migrated",
    })


class RepoActionRequest(BaseModel):
    repo: str


@router.post("/update")
async def update_repo(req: RepoActionRequest):
    from runtime.manifest_loader import REPOS

    # ponytail: update only the specific repo, not everything
    if req.repo not in REPOS:
        return error(f"Unknown repo: {req.repo}. Available: {list(REPOS.keys())}")

    from app.workers.installation_workers import update_repo
    task = update_repo.delay(req.repo)
    return success(
        {"repo": req.repo, "task_id": task.id, "started": True},
        "Update started.",
    )


@router.post("/repair")
async def repair_repo(req: RepoActionRequest):
    from runtime.manifest_loader import REPOS

    # ponytail: repair only the specific repo, not everything.
    # Re-clone the repo and rebuild its isolated venv/deps (runtime prep).
    # Weights live separately and are preserved.
    if req.repo not in REPOS:
        return error(f"Unknown repo: {req.repo}. Available: {list(REPOS.keys())}")

    from app.workers.installation_workers import repair_repo
    task = repair_repo.delay(req.repo)
    return success(
        {"repo": req.repo, "task_id": task.id, "started": True},
        "Repair started.",
    )


@router.post("/remove")
async def remove_repo(req: RepoActionRequest):
    import shutil

    from runtime.storage import get_storage_config
    from app.core.cache import invalidate

    storage = get_storage_config()
    repo_path = storage.get_repo_path(req.repo)
    if not repo_path.exists():
        raise HTTPException(status_code=404, detail=f"Repository '{req.repo}' not found.")
    shutil.rmtree(str(repo_path), ignore_errors=True)
    invalidate("runtime_options")
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
    low_vram: bool | None = None
    vram_mode: str | None = None


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
        # ponytail: verify_environment() nests results under python/torch/git
        # sub-dicts (not flat *_ok keys), and verify_installation() returns
        # per-provider status plus providers_available/total — not repos_cloned/
        # weights_downloaded. Map the real shapes here.
        cuda_available = bool(env.get("torch", {}).get("cuda_available", False))
        repos_cloned = sum(
            1 for v in install.values()
            if isinstance(v, dict) and v.get("repo_ready")
        )
        weights_downloaded = sum(
            1 for v in install.values()
            if isinstance(v, dict) and v.get("weights_ready")
        )
        return success({
            "system_ok": bool(env.get("python", {}).get("ok", False)),
            "cuda_available": cuda_available,
            "gpu_available": cuda_available,
            "blender_available": env.get("blender_available", False),
            "repos_cloned": repos_cloned,
            "weights_downloaded": weights_downloaded,
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
