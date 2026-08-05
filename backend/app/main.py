"""FastAPI application entry point."""

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

from app.api.v1 import router as api_v1_router
from app.config import get_settings

# ---------------------------------------------------------------------------
# Normalize CUDA_VISIBLE_DEVICES BEFORE any torch/CUDA import.
#
# Some launchers set CUDA_VISIBLE_DEVICES=all (e.g. container runtimes /
# NVIDIA Container Toolkit). The CUDA runtime itself does NOT understand
# 'all' — it expects empty string (all GPUs) or comma-separated device
# indices. Removing the variable here ensures torch.cuda.is_available()
# works correctly on a real NVIDIA GPU.
# ---------------------------------------------------------------------------
_cuda_visible = os.environ.get("CUDA_VISIBLE_DEVICES", "")
if _cuda_visible.strip().lower() == "all":
    os.environ.pop("CUDA_VISIBLE_DEVICES", None)

settings = get_settings()
logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


def log_startup_diagnostics() -> None:
    """Log comprehensive startup diagnostics."""
    logger.info("=" * 70)
    logger.info("AI 3D STUDIO - STARTUP DIAGNOSTICS")
    logger.info("=" * 70)

    # Python and OS
    logger.info(f"Python Version: {sys.version}")
    logger.info(f"Python Executable: {sys.executable}")
    logger.info(f"Platform: {platform.system()} {platform.release()}")
    logger.info(f"Architecture: {platform.machine()}")

    # Environment detection
    is_codespaces = bool(os.environ.get("CODESPACES") or os.environ.get("GITHUB_CODESPACE_NAME"))
    is_github_actions = os.environ.get("GITHUB_ACTIONS", "").lower() == "true"

    env_parts = []
    if is_codespaces:
        env_parts.append("Codespaces")
    if is_github_actions:
        env_parts.append("GitHub Actions")
    env_str = ", ".join(env_parts) if env_parts else "Native/Local"
    logger.info(f"Environment: {env_str}")

    # GPU Detection
    logger.info("")
    logger.info("GPU / CUDA STATUS")

    try:
        import torch
        logger.info(f"PyTorch Version: {torch.__version__}")

        if hasattr(torch, 'cuda'):
            if torch.cuda.is_available():
                logger.info("  CUDA Available: YES")
                logger.info(f"  CUDA Version: {torch.version.cuda}")
                logger.info(f"  GPU Count: {torch.cuda.device_count()}")

                for i in range(torch.cuda.device_count()):
                    props = torch.cuda.get_device_properties(i)
                    free, total = torch.cuda.mem_get_info(i)
                    logger.info(
                        f"    GPU {i}: {props.name} "
                        f"({total // (1024**3)}GB total, "
                        f"{free // (1024**3)}GB free)"
                    )
                # Log driver version
                try:
                    import subprocess
                    drv = subprocess.check_output(
                        ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
                        stderr=subprocess.DEVNULL, timeout=5, text=True,
                    ).strip().splitlines()[0]
                    logger.info(f"  Driver Version: {drv}")
                except Exception:
                    pass
            else:
                logger.info("  CUDA Available: NO")
                logger.info("  Reason: torch.cuda.is_available() returned False")
                cv = os.environ.get("CUDA_VISIBLE_DEVICES", "(not set)")
                logger.info(f"  CUDA_VISIBLE_DEVICES: {cv}")
        else:
            logger.info("  CUDA Available: NO")
            logger.info("  Reason: PyTorch compiled without CUDA")

    except ImportError:
        logger.info("  CUDA Available: NO")
        logger.info("  Reason: PyTorch not installed (CPU-only mode)")
    except Exception as e:
        logger.info("  CUDA Available: NO")
        logger.info(f"  Reason: {e}")

    # Configuration
    logger.info("")
    logger.info("CONFIGURATION")
    logger.info(f"  AI Provider: {settings.ai_provider}")
    logger.info(f"  Runtime Mode: {settings.runtime_mode}")
    logger.info(f"  Debug Mode: {settings.debug}")
    logger.info(f"  Environment: {settings.environment}")

    # Environment variables
    logger.info("")
    logger.info("ENVIRONMENT VARIABLES")
    env_vars = [
        "CUDA_VISIBLE_DEVICES",
        "CUDA_DEVICE",
        "PLATFORM_MODE",
        "AI_PROVIDER",
        "RUNTIME_MODE",
    ]
    for var in env_vars:
        val = os.environ.get(var, "(not set)")
        logger.info(f"  {var}: {val}")

    # Database connection
    logger.info("")
    logger.info("DATABASE")
    db_url = settings.database_url
    if db_url:
        # Mask sensitive parts
        masked_url = db_url
        if "@" in db_url:
            masked_url = db_url[:db_url.find("://")+3] + "***" + db_url[db_url.find("@")-1:]
        logger.info(f"  URL: {masked_url}")
    else:
        logger.info("  URL: (not configured)")

    # Redis connection
    logger.info("")
    logger.info("REDIS")
    logger.info(f"  URL: {settings.redis_url or '(not configured)'}")
    logger.info(f"  Broker: {settings.celery_broker_url or '(not configured)'}")

    # Storage paths
    logger.info("")
    logger.info("STORAGE")
    logger.info(f"  Local Path: {settings.storage_local_path}")
    logger.info(f"  Weights Dir: {settings.weights_dir}")
    logger.info(f"  Third Party Dir: {settings.third_party_dir}")

    logger.info("=" * 70)
    logger.info("")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""

    # Ensure all required directories exist (host-owned, not Docker-owned)
    try:
        from runtime.storage import get_storage_config
        storage_cfg = get_storage_config()
        storage_cfg.ensure_dirs()

        validation = storage_cfg.validate()
        logger.info("Storage validation: %s", validation)
        failed = [k for k, v in validation.items() if not v]
        if failed:
            logger.warning(
                "Storage validation FAIL: %s — check permissions / bind mounts",
                ", ".join(failed),
            )
    except Exception as exc:
        logger.warning("Storage initialization failed: %s", exc)

    # Log startup diagnostics
    log_startup_diagnostics()

    # Initialize thread-safe log broadcasting for admin panel
    try:
        from app.api.v1.admin import init_log_event_loop, init_logging_sinks
        init_log_event_loop()
        init_logging_sinks()
    except Exception:
        pass

    # Platform detection
    try:
        from runtime.platform_detection import get_platform_info
        platform_info = get_platform_info()
        if platform_info.gpu_available:
            logger.info(f"Starting with GPU: {platform_info.gpu_devices}")
        else:
            logger.info(f"Starting in CPU-only mode - {platform_info.gpu_status_reason}")
    except Exception as exc:
        logger.warning(f"Platform detection failed: {exc}")

    # Initialize runtime engine
    runtime_initialized = False
    try:
        from runtime.engine import get_engine
        engine = get_engine()
        await engine.initialize()
        runtime_initialized = True
        logger.info("Runtime engine initialized successfully")
    except ImportError as exc:
        logger.warning(f"Runtime engine not available: {exc}")
        logger.info("Continuing with minimal functionality (mock provider)")
    except Exception as exc:
        logger.warning(f"Runtime engine initialization failed: {exc}")
        logger.info("Continuing with degraded functionality")

    
    # Database connection test
    try:
        import asyncio

        from sqlalchemy import create_engine
        from sqlalchemy import text as sa_text

        from app.models import Base as RegistryBase  # imports all models via __init__.py
        def _sync_db_check():
            db_url = settings.sync_database_url
            # SQLite uses NullPool which doesn't accept pool_size/max_overflow
            if db_url.startswith("sqlite"):
                eng = create_engine(db_url)
            else:
                eng = create_engine(db_url, pool_size=1, max_overflow=0)
            with eng.connect() as conn:
                conn.execute(sa_text("SELECT 1"))
            # Create tables if not exist
            RegistryBase.metadata.create_all(eng)
            # Ensure column lengths are expanded for extended modes and qualities
            # ponytail: ALTER only if table exists; silently skip on fresh DB
            # and only for PostgreSQL — SQLite doesn't support ALTER COLUMN TYPE
            if not db_url.startswith("sqlite"):
                try:
                    with eng.begin() as conn:
                        # Check if generation_jobs table exists before altering
                        table_exists = conn.execute(sa_text(
                            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='generation_jobs')"
                        )).scalar()
                        if table_exists:
                            conn.execute(sa_text("ALTER TABLE generation_jobs ALTER COLUMN mode TYPE VARCHAR(64)"))
                            conn.execute(sa_text("ALTER TABLE generation_jobs ALTER COLUMN quality TYPE VARCHAR(64)"))
                except Exception as e:
                    logger.warning(f"Failed to alter columns for generation_jobs: {e}")
            eng.dispose()
        await asyncio.get_event_loop().run_in_executor(None, _sync_db_check)
        logger.info("Database connection successful and tables created")

    except ImportError:
        logger.info("Database drivers not available - skipping DB connection test")
    except Exception as exc:
        logger.warning(f"Database connection test failed: {exc}")

    # Redis connection test
    try:
        import redis
        r = redis.from_url(settings.redis_url)
        r.ping()
        logger.info("Redis connection successful")
    except ImportError:
        logger.info("Redis client not available - skipping Redis connection test")
    except Exception as exc:
        logger.warning(f"Redis connection test failed: {exc}")

    logger.info("")
    logger.info("=" * 70)
    logger.info(
        f"AI 3D Studio API READY - {settings.environment} - provider: {settings.ai_provider}"
    )
    if not runtime_initialized:
        logger.info("Running in DEGRADED mode - some features unavailable")
    logger.info("=" * 70)
    logger.info("")

    yield

    logger.info("AI 3D Studio API shutting down")


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

    logger.debug(
        "%s %s → %d (%.1fms)",
        request.method, request.url.path, response.status_code, elapsed_ms
    )

    return response


# Include API routes
app.include_router(api_v1_router, prefix=settings.api_v1_prefix)

Path(settings.storage_local_path).mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=settings.storage_local_path), name="static")


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
