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


async def _check_storage() -> dict:
    """Check storage directory writable."""
    try:
        storage_path = Path(settings.storage_local_path)
        if not storage_path.exists():
            storage_path.mkdir(parents=True, exist_ok=True)
        test_file = storage_path / ".health_check_write_test"
        test_file.write_text("ok")
        test_file.unlink()
        return {
            "status": "ok",
            "path": str(storage_path),
            "writable": True,
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
    """Comprehensive health check endpoint."""
    health_status = {
        "status": "ok",
        "version": settings.app_version,
        "environment": settings.environment,
        "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        "services": {}
    }

    # Run all health checks concurrently
    db_task = asyncio.create_task(_check_database())
    redis_task = asyncio.create_task(_check_redis())
    storage_task = asyncio.create_task(_check_storage())
    engine_task = asyncio.create_task(_check_engine())

    db_result = await db_task
    redis_result = await redis_task
    storage_result = await storage_task
    engine_result = await engine_task

    health_status["services"]["database"] = db_result
    health_status["services"]["redis"] = redis_result
    health_status["services"]["storage"] = storage_result
    health_status["services"]["engine"] = engine_result
    health_status["services"]["api"] = {"status": "ok"}

    # Determine overall status
    overall_healthy = all(
        s.get("status") in ("ok", "unavailable")
        for s in [db_result, redis_result, storage_result, engine_result]
    )

    if not overall_healthy:
        health_status["status"] = "degraded"

    return success(health_status)
