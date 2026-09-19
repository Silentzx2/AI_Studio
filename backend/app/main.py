"""FastAPI application entry point for the new AI Studio backend."""

import logging
import os
import platform
import sys
import time
import uuid as uuid_module
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.types import Scope
from starlette.responses import Response

from app.api.v1 import router as api_v1_router
from app.config import get_settings
from app.core import close_comfyui_client

settings = get_settings()

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("=" * 70)
    logger.info("AI Studio API v%s - Starting", settings.app_version)
    logger.info("=" * 70)

    # Ensure database tables exist
    try:
        from app.database import engine, Base
        import app.models  # register models
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables verified")
    except Exception as exc:
        logger.warning("Database initialization failed: %s", exc)

    # Ensure storage directories exist
    try:
        from app.core import get_storage_manager
        storage = get_storage_manager()
        logger.info("Storage initialized at %s", storage.storage_root)
    except Exception as exc:
        logger.warning("Storage initialization failed: %s", exc)

    # Check ComfyUI
    try:
        from app.core import get_comfyui_client
        client = get_comfyui_client()
        health = await client.health_check()
        if health.get("status") == "ok":
            logger.info("ComfyUI connected successfully")
        else:
            logger.warning("ComfyUI health check: %s", health.get("error", "unknown"))
    except Exception as exc:
        logger.warning("ComfyUI connection check failed: %s", exc)

    logger.info("AI Studio API ready")
    yield

    # Cleanup
    await close_comfyui_client()
    logger.info("AI Studio API shutting down")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_timing_middleware(request: Request, call_next):
    """Track request timing and add request ID header."""
    request_id = str(uuid_module.uuid4())[:8]
    start = time.perf_counter()

    response = await call_next(request)

    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time"] = f"{elapsed_ms:.1f}ms"

    return response


# Include API routes
app.include_router(api_v1_router, prefix=settings.api_v1_prefix)

# Mount static files
storage_path = Path(settings.storage_local_path)
storage_path.mkdir(parents=True, exist_ok=True)


class BinaryStaticFiles(StaticFiles):
    """StaticFiles subclass that adds headers for binary files."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if any(path.endswith(ext) for ext in ('.glb', '.gltf', '.obj', '.fbx', '.stl', '.ply', '.bin', '.png', '.jpg', '.jpeg', '.webp', '.zip')):
            response.headers["Cache-Control"] = "public, max-age=86400, no-transform"
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Accept-Ranges"] = "bytes"
            if path.endswith('.glb'):
                response.headers["Content-Type"] = "model/gltf-binary"
            elif path.endswith('.gltf'):
                response.headers["Content-Type"] = "model/gltf+json"
            elif path.endswith('.zip'):
                response.headers["Content-Type"] = "application/zip"
        return response


app.mount("/static", BinaryStaticFiles(directory=str(storage_path)), name="static")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s: %s", request.url, exc)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error",
            "data": None,
            "errors": str(exc) if getattr(settings, 'debug', False) else None,
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level="debug" if settings.debug else "info",
    )