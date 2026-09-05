"""Health check endpoint with comprehensive service status."""

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any

from fastapi import APIRouter
from sqlalchemy import text

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.utils.response import success, error

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


async def _check_database() -> dict:
    """Check database connectivity."""
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def _check_redis() -> dict:
    """Check Redis connectivity (async — don't block event loop)."""
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


import os
import time

_health_cache: dict | None = None
_health_cache_time: float = 0.0
_HEALTH_CACHE_TTL = 8.0  # seconds


async def _check_storage() -> dict:
    """Check storage directory writable without disk file write contention."""
    try:
        storage_path = Path(settings.storage_local_path)
        if not storage_path.exists():
            storage_path.mkdir(parents=True, exist_ok=True)
        writable = os.access(storage_path, os.W_OK)
        return {
            "status": "ok" if writable else "error",
            "path": str(storage_path),
            "writable": writable,
        }
    except Exception as e:
        return {
            "status": "error",
            "path": str(settings.storage_local_path),
            "writable": False,
            "error": str(e),
        }


async def _check_engine() -> dict:
    """Check runtime engine status."""
    try:
        from runtime.engine import get_engine
        engine = get_engine()
        engine_health = engine.health()
        engine_status = "ready" if engine_health.get("initialized") else "not_initialized"
        engine_ok = engine_status == "ready" and not engine_health.get("error")
        return {
            "status": "ok" if engine_ok else "error",
            "runtime_mode": engine_status,
        }
    except ImportError:
        return {
            "status": "unavailable",
            "runtime_mode": "not installed",
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
        }


@router.get("")
async def health() -> Dict[str, Any]:
    """Comprehensive health check endpoint with in-memory caching to prevent DB/IO overload."""
    global _health_cache, _health_cache_time
    now = time.time()
    if _health_cache is not None and (now - _health_cache_time < _HEALTH_CACHE_TTL):
        return success(_health_cache)

    async def _safe_run(coro, default_err):
        try:
            return await asyncio.wait_for(coro, timeout=1.5)
        except Exception as exc:
            return {"status": "degraded", "error": str(exc) or default_err}

    db_task = _safe_run(_check_database(), "Database check timeout")
    redis_task = _safe_run(_check_redis(), "Redis check timeout")
    storage_task = _safe_run(_check_storage(), "Storage check timeout")
    engine_task = _safe_run(_check_engine(), "Engine check timeout")

    db_result, redis_result, storage_result, engine_result = await asyncio.gather(
        db_task, redis_task, storage_task, engine_task
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
            "engine": engine_result,
            "api": {"status": "ok"},
        },
    }

    # Determine overall status
    overall_healthy = all(
        s.get("status") in ("ok", "unavailable")
        for s in [db_result, redis_result, storage_result, engine_result]
    )

    if not overall_healthy:
        health_status["status"] = "degraded"

    _health_cache = health_status
    _health_cache_time = now
    return success(health_status)
