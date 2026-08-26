"""Health check endpoint with comprehensive service status."""

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

    overall_healthy = True

    # Check database connectivity
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        health_status["services"]["database"] = {"status": "ok"}
    except Exception as e:
        health_status["services"]["database"] = {"status": "error", "error": str(e)}
        overall_healthy = False

    # Check Redis connectivity (async — don't block event loop)
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        health_status["services"]["redis"] = {"status": "ok"}
    except Exception as e:
        health_status["services"]["redis"] = {"status": "error", "error": str(e)}
        overall_healthy = False

    # Check storage directory writable
    try:
        storage_path = Path(settings.storage_local_path)
        if not storage_path.exists():
            storage_path.mkdir(parents=True, exist_ok=True)
        test_file = storage_path / ".health_check_write_test"
        test_file.write_text("ok")
        test_file.unlink()
        health_status["services"]["storage"] = {
            "status": "ok",
            "path": str(storage_path),
            "writable": True,
        }
    except Exception as e:
        health_status["services"]["storage"] = {
            "status": "error",
            "path": str(settings.storage_local_path),
            "writable": False,
            "error": str(e),
        }
        overall_healthy = False

    # Check runtime engine status
    try:
        from runtime.engine import get_engine
        engine = get_engine()
        engine_health = engine.health()
        engine_status = "ready" if engine_health.get("initialized") else "not_initialized"
        engine_ok = engine_status == "ready" and not engine_health.get("error")
        health_status["services"]["engine"] = {
            "status": "ok" if engine_ok else "error",
            "runtime_mode": engine_status,
        }
        if not engine_ok:
            overall_healthy = False
    except ImportError:
        health_status["services"]["engine"] = {
            "status": "unavailable",
            "runtime_mode": "not installed",
        }
    except Exception as e:
        health_status["services"]["engine"] = {
            "status": "error",
            "error": str(e),
        }
        overall_healthy = False

    # Basic API service check
    health_status["services"]["api"] = {"status": "ok"}

    # Set overall status
    if not overall_healthy:
        health_status["status"] = "degraded"

    return success(health_status)
