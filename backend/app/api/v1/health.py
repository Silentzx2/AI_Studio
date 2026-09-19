"""Health check endpoints."""

import asyncio
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.schemas import HealthResponse, SuccessResponse
from app.core import get_comfyui_client, get_storage_manager

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

_health_cache: dict | None = None
_health_cache_time: float = 0.0
_HEALTH_CACHE_TTL = 20.0
_health_lock = asyncio.Lock()


async def _check_database() -> dict:
    """Check database connectivity."""
    try:
        async def _ping_db():
            async with AsyncSessionLocal() as session:
                await session.execute(text("SELECT 1"))

        await asyncio.wait_for(_ping_db(), timeout=0.4)
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def _check_redis() -> dict:
    """Check Redis connectivity.

    Redis is not used for any active functionality (no Celery, no cache).
    Report 'unavailable' rather than 'error' so it doesn't degrade overall health.
    """
    # ponytail: Redis is vestigial — remove entirely when deps are cleaned up
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url, socket_connect_timeout=0.25)
        await asyncio.wait_for(r.ping(), timeout=0.3)
        await r.aclose()
        return {"status": "ok"}
    except Exception:
        return {"status": "unavailable", "note": "Redis is not required by current stack"}


async def _check_storage() -> dict:
    """Check storage directory writable."""
    try:
        storage = get_storage_manager()
        info = storage.get_storage_info()
        return {"status": "ok", "writable": True, **info}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def _check_comfyui() -> dict:
    """Check ComfyUI connectivity."""
    try:
        client = get_comfyui_client()
        result = await client.health_check()
        return result
    except Exception as e:
        return {"status": "error", "error": str(e)}


@router.get("", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Comprehensive health check endpoint with caching."""
    global _health_cache, _health_cache_time
    now = time.time()

    if _health_cache is not None and (now - _health_cache_time < _HEALTH_CACHE_TTL):
        return HealthResponse(**_health_cache)

    async with _health_lock:
        now = time.time()
        if _health_cache is not None and (now - _health_cache_time < _HEALTH_CACHE_TTL):
            return HealthResponse(**_health_cache)

        async def _safe_run(coro, default_err):
            try:
                return await asyncio.wait_for(coro, timeout=0.5)
            except Exception as exc:
                return {"status": "degraded", "error": str(exc) or default_err}

        db_task = _safe_run(_check_database(), "Database check timeout")
        redis_task = _safe_run(_check_redis(), "Redis check timeout")
        storage_task = _safe_run(_check_storage(), "Storage check timeout")
        comfyui_task = _safe_run(_check_comfyui(), "ComfyUI check timeout")

        db_result, redis_result, storage_result, comfyui_result = await asyncio.gather(
            db_task, redis_task, storage_task, comfyui_task
        )

        health_status = {
            "status": "ok",
            "version": settings.app_version,
            "environment": settings.environment,
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            "services": {
                "database": db_result,
                "redis": redis_result,
                "storage": storage_result,
                "comfyui": comfyui_result,
                "api": {"status": "ok"},
            },
        }

        overall_healthy = all(
            s.get("status") in ("ok", "unavailable")
            for s in [db_result, redis_result, storage_result, comfyui_result]
        )

        if not overall_healthy:
            health_status["status"] = "degraded"

        _health_cache = health_status
        _health_cache_time = now
        return HealthResponse(**health_status)


@router.get("/simple")
async def health_simple() -> SuccessResponse:
    """Simple health check for load balancers."""
    return SuccessResponse(data={"status": "ok"}, message="OK")