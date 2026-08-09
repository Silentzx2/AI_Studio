"""API endpoints for system information and diagnostics."""

from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from pydantic import BaseModel, Field

router = APIRouter(prefix="/system", tags=["system"])


class CompatibilityCheckRequest(BaseModel):
    """Request model for system compatibility check."""
    manifest: dict[str, Any] = Field(
        default_factory=dict,
        description="Model manifest to check compatibility against"
    )
    
    model_id: str | None = Field(None, description="Optional model ID")
    model_name: str | None = Field(None, description="Optional model name")


@router.get("/info")
async def get_system_info():
    """Get comprehensive system information."""
    
    try:
        from app.core.managers.environment_manager import EnvironmentManager
        
        env_manager = EnvironmentManager()
        
        system_info = await env_manager.get_system_info()
        try:
            system_info["gpu"] = await env_manager.get_gpu_info()
        except Exception:
            pass
        
        system_info["service"] = {
            "name": "AI 3D Studio",
            "version": "3.0.0",
            "api_version": "v1"
        }
        
        return {"success": True, "data": system_info}
            
    except Exception as e:
        # Return basic info even if detailed checks fail
        import platform
        import sys
        
        return {
            "success": True,
            "data": {
                "service": {
                    "name": "AI 3D Studio",
                    "version": "3.0.0"
                },
                "basic_info": {
                    "platform": platform.platform(),
                    "python_version": sys.version,
                    "error_detailed": str(e)
                },
                "warning": f"Detailed info unavailable: {e}"
            }
        }


@router.get("/health")
async def get_system_health():
    """Get overall system health status."""
    
    try:
        from app.workers.health_workers import get_system_health
        
        task = get_system_health.delay()
        
        return {
            "success": True,
            "message": "System health check initiated",
            "task_id": task.id,
            "note": "Use task result endpoint to get results"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/compatibility")
async def check_compatibility(request: CompatibilityCheckRequest):
    """Check if system is compatible with a model's requirements."""
    
    manifest = request.manifest
    
    if not manifest:
        raise HTTPException(status_code=400, detail="Manifest is required")
    
    try:
        from app.core.managers.environment_manager import EnvironmentManager
        
        env_manager = EnvironmentManager()
        
        # Get GPU info
        gpu_info = await env_manager.get_gpu_info()
        
        # Get disk space
        system_info = await env_manager.get_system_info()
        disk_info = system_info.get("disk", {})
        
        # Get CUDA info
        cuda_info = await env_manager.check_cuda_availability()

        errors = []
        warnings = []
        requirements = {}
        
        # Check VRAM requirement
        min_vram_mb = manifest.get("min_vram_mb", manifest.get("min_vram", 1024))
        vram_available = sum(g.get("total_memory_mb", 0) for g in gpu_info.get("gpus", []))
        
        requirements["vram"] = {
            "required_mb": min_vram_mb,
            "available_mb": vram_available,
            "ok": vram_available >= min_vram_mb
        }
        
        if not requirements["vram"]["ok"]:
            errors.append(
                f"Insufficient VRAM: {vram_available}MB available, "
                f"{min_vram_mb}MB required"
            )
        
        # Check CUDA requirement
        cuda_required = manifest.get("cuda_required", manifest.get("gpu_required", False))
        min_cuda = manifest.get("min_cuda_version", "11.8")
        
        requirements["cuda"] = {
            "required": min_cuda if cuda_required else "optional",
            "available": cuda_info.get("cuda_version") or "not available",
            "ok": not cuda_required or bool(cuda_info.get("torch_cuda_available"))
        }
        
        if cuda_required and not requirements["cuda"]["ok"]:
            errors.append("CUDA GPU required but not available")
        
        # Check disk space
        disk_required_gb = manifest.get("disk_space_gb", manifest.get("disk_space_mb", 5000) / 1024)
        disk_free_gb = disk_info.get("free_gb", 0)
        
        requirements["disk"] = {
            "required_gb": round(disk_required_gb, 2),
            "available_gb": round(disk_free_gb, 2),
            "ok": disk_free_gb >= disk_required_gb
        }
        
        if not requirements["disk"]["ok"]:
            errors.append(
                f"Insufficient disk space: {disk_free_gb:.1f}GB available, "
                f"{disk_required_gb:.1f}GB required"
            )
        
        # Check Python version
        import sys
        py_current = f"{sys.version_info.major}.{sys.version_info.minor}"
        py_min = manifest.get("python_min", "3.10")
        
        requirements["python"] = {
            "required": py_min,
            "current": py_current,
            "ok": py_current >= py_min
        }
        
        if not requirements["python"]["ok"]:
            warnings.append(f"Python {py_current} < {py_min} (recommended)")
        
        # Check RAM
        mem_info = system_info.get("memory", {})
        ram_available_gb = mem_info.get("available_mb", 0) / 1024
        ram_min_gb = manifest.get("min_ram_gb", 8)
        
        requirements["ram"] = {
            "required_gb": ram_min_gb,
            "available_gb": round(ram_available_gb, 2),
            "ok": ram_available_gb >= ram_min_gb
        }
        
        if not requirements["ram"]["ok"]:
            warnings.append(
                f"Low RAM: {ram_available_gb:.1f}GB available, "
                f"{ram_min_gb}GB recommended"
            )
        
        compatible = len(errors) == 0
        
        return {
            "success": True,
            "data": {
                "compatible": compatible,
                "model_id": request.model_id,
                "model_name": request.model_name,
                "errors": errors,
                "warnings": warnings,
                "requirements": requirements,
                "summary": (
                    "System is compatible with this model" if compatible else
                    f"System has {len(errors)} compatibility issue(s)"
                )
            }
        }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/gpu")
async def get_gpu_info():
    """Get detailed GPU information."""
    
    try:
        from app.core.managers.environment_manager import EnvironmentManager
        
        env_manager = EnvironmentManager()
        
        gpu_info = await env_manager.get_gpu_info()
        cuda_info = await env_manager.check_cuda_availability()
        
        return {
            "success": True,
            "data": {
                **gpu_info,
                "cuda": cuda_info
            }
        }
            
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/dependencies")
async def check_dependencies():
    """Check installation status of critical dependencies."""
    
    try:
        from app.core.managers.environment_manager import EnvironmentManager
        
        env_manager = EnvironmentManager()
        
        critical_deps = [
            {"name": "torch"},
            {"name": "fastapi"},
            {"name": "sqlalchemy"},
            {"name": "celery"},
            {"name": "redis"},
            {"name": "uvicorn"}
        ]
        
        optional_deps = [
            {"name": "transformers"},
            {"name": "diffusers"},
            {"name": "packaging"},
            {"name": "psutil"},
            {"name": "pillow"},
            {"name": "trimesh"}
        ]
        
        critical_results = await env_manager.verify_dependencies(critical_deps)
        
        optional_results = await env_manager.verify_dependencies(optional_deps)
        
        all_critical_ok = all(r.get("satisfied") for r in critical_results.values())
        
        return {
            "success": True,
            "data": {
                "all_critical_satisfied": all_critical_ok,
                "critical": critical_results,
                "optional": optional_results
            }
        }
            
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/storage")
async def get_storage_info():
    """Get storage/disk usage information."""
    
    try:
        import shutil
        from pathlib import Path
        
        storage_path = Path("./storage")
        
        total, used, free = shutil.disk_usage(storage_path if storage_path.exists() else "/")
        
        # Calculate sizes of subdirectories
        storage_details = {}
        
        if storage_path.exists():
            for subdir in ["models", "uploads", "thumbnails", "exports"]:
                dir_path = storage_path / subdir
                if dir_path.exists():
                    size = sum(f.stat().st_size for f in dir_path.rglob("*") if f.is_file())
                    storage_details[subdir] = {
                        "size_gb": round(size / (1024**3), 4),
                        "path": str(dir_path)
                    }
        
        return {
            "success": True,
            "data": {
                "root_path": str(storage_path),
                "total_gb": round(total / (1024**3), 2),
                "used_gb": round(used / (1024**3), 2),
                "free_gb": round(free / (1024**3), 2),
                "used_percent": round((used / total) * 100, 2),
                "directories": storage_details
            }
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/config")
async def get_public_config():
    """Get public configuration (non-sensitive)."""
    
    from app.config import get_settings
    
    settings = get_settings()
    
    return {
        "success": True,
        "data": {
            "app_name": settings.app_name,
            "app_version": settings.app_version,
            "environment": settings.environment,
            "debug": settings.debug,
            "ai_provider": settings.ai_provider,
            "runtime_mode": settings.runtime_mode,
            "features": {
                "model_download": True,
                "model_discovery": True,
                "health_checks": True,
                "gpu_detection": True
            }
        }
    }


@router.get("/statistics")
async def get_system_statistics():
    """Return aggregated system statistics for dashboard widgets."""
    import psutil
    from pathlib import Path

    stats: dict = {}

    # CPU
    try:
        stats["cpu_percent"] = psutil.cpu_percent(interval=0.1)
        stats["cpu_count"] = psutil.cpu_count()
    except Exception:
        stats["cpu_percent"] = 0
        stats["cpu_count"] = 0

    # Memory
    try:
        mem = psutil.virtual_memory()
        stats["memory_total_gb"] = round(mem.total / (1024 ** 3), 2)
        stats["memory_used_gb"] = round(mem.used / (1024 ** 3), 2)
        stats["memory_percent"] = mem.percent
    except Exception:
        stats["memory_total_gb"] = 0
        stats["memory_used_gb"] = 0
        stats["memory_percent"] = 0

    # Disk
    try:
        disk = psutil.disk_usage("/")
        stats["disk_total_gb"] = round(disk.total / (1024 ** 3), 2)
        stats["disk_used_gb"] = round(disk.used / (1024 ** 3), 2)
        stats["disk_percent"] = disk.percent
    except Exception:
        stats["disk_total_gb"] = 0
        stats["disk_used_gb"] = 0
        stats["disk_percent"] = 0

    # GPU (best effort)
    stats["gpu_available"] = False
    try:
        import torch
        stats["gpu_available"] = torch.cuda.is_available()
        if stats["gpu_available"]:
            stats["gpu_name"] = torch.cuda.get_device_name(0)
            stats["gpu_memory_total_mb"] = round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 2))
            stats["gpu_memory_used_mb"] = round(torch.cuda.memory_allocated(0) / (1024 ** 2))
    except Exception:
        pass

    # Storage breakdown
    try:
        storage_path = Path("./storage")
        if storage_path.exists():
            stats["storage_models_mb"] = round(
                sum(f.stat().st_size for f in (storage_path / "models").rglob("*") if f.is_file()) / (1024 ** 2), 2
            ) if (storage_path / "models").exists() else 0
        else:
            stats["storage_models_mb"] = 0
    except Exception:
        stats["storage_models_mb"] = 0

    return {"success": True, "data": stats}


@router.post("/test/connection")
async def test_connection():
    """Test database and Redis connections."""
    
    results = {
        "database": None,
        "redis": None,
        "storage": None
    }
    
    # Test Database
    try:
        import asyncio

        from app.database import SessionLocal

        def _db_check():
            db = SessionLocal()
            try:
                db.execute(text("SELECT 1"))
            finally:
                db.close()

        await asyncio.to_thread(_db_check)
        results["database"] = {"status": "connected", "ok": True}
    except Exception as e:
        results["database"] = {"status": "error", "ok": False, "error": str(e)}
    
    # Test Redis
    try:
        import asyncio
        import redis

        from app.config import get_settings
        settings = get_settings()

        await asyncio.to_thread(redis.from_url(settings.redis_url).ping)
        results["redis"] = {"status": "connected", "ok": True}
    except Exception as e:
        results["redis"] = {"status": "error", "ok": False, "error": str(e)}
    
    # Test Storage
    try:
        from pathlib import Path
        storage_path = Path("./storage")
        storage_path.mkdir(parents=True, exist_ok=True)
        
        # Try writing a test file
        test_file = storage_path / ".test_write"
        test_file.write_text("test")
        test_file.unlink()
        
        results["storage"] = {"status": "writable", "ok": True}
    except Exception as e:
        results["storage"] = {"status": "error", "ok": False, "error": str(e)}
    
    all_ok = all(r.get("ok") for r in results.values() if r)
    
    return {
        "success": True,
        "data": results,
        "message": "All connections OK" if all_ok else "Some connections failed"
    }


class ClientLogEntry(BaseModel):
    """Client-side activity entry forwarded from the browser ActivityLogger."""
    ts: str = Field(default="", description="ISO timestamp (client clock)")
    type: str = Field(default="", description="Event type: api | click | error")
    detail: str = Field(default="", description="Human-readable event detail")


@router.post("/log")
async def record_client_log(entry: ClientLogEntry):
    """Accept client activity events (API calls, button clicks) and write them
    to the backend log so all project activity lands in the same log output.

    Fire-and-forget from the frontend; failures are swallowed client-side.
    This endpoint itself is logged by request_timing_middleware like any other.
    """
    import logging
    logger = logging.getLogger("frontend")
    logger.info("[%s] %s%s", entry.type, entry.detail, f" (ts={entry.ts})" if entry.ts else "")
    return {"success": True}
