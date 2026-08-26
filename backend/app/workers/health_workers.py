"""Celery workers for health check tasks."""

import asyncio
import logging
from datetime import datetime

from celery import shared_task

from app.core.managers.environment_manager import EnvironmentManager
from app.core.managers.health_manager import HealthManager

logger = logging.getLogger(__name__)


@shared_task
def run_health_check(model_id: str):
    """Run health check for a specific model."""
    
    manager = HealthManager("./storage/models")
    
    try:
        loop = asyncio.new_event_loop()
        
        try:
            result = loop.run_until_complete(
                manager.run_model_health_check(model_id)
            )
            
            logger.info("Health check for %s: %s", model_id, result.get("status", "unknown"))
            return result
            
        finally:
            loop.close()
    
    except Exception as e:
        logger.error(f"Health check error for {model_id}: {e}")
        return {
            "status": "error",
            "model_id": model_id,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


@shared_task
def run_quick_health_check(model_id: str):
    """Run a quick health check (files + manifest only)."""
    
    manager = HealthManager("./storage/models")
    
    try:
        loop = asyncio.new_event_loop()
        
        try:
            result = loop.run_until_complete(manager.quick_health_check(model_id))
            return result
        finally:
            loop.close()
    
    except Exception as e:
        logger.error(f"Quick health check error for {model_id}: {e}")
        return {"status": "error", "error": str(e)}


@shared_task
def run_all_health_checks():
    """Run health checks for all installed models (scheduled task)."""
    
    manager = HealthManager("./storage/models")
    
    try:
        loop = asyncio.new_event_loop()
        
        try:
            results = loop.run_until_complete(manager.get_all_models_health())
            
            # Log summary
            summary = results.get("health_summary", {})
            logger.info(
                f"All models health check complete - "
                f"Healthy: {summary.get('healthy', 0)}, "
                f"Warning: {summary.get('warning', 0)}, "
                f"Unhealthy: {summary.get('unhealthy', 0)}"
            )
            
            return results
            
        finally:
            loop.close()
    
    except Exception as e:
        logger.error(f"Batch health check error: {e}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


@shared_task
def get_system_health():
    """Get comprehensive system health information."""
    
    env_manager = EnvironmentManager()
    health_manager = HealthManager("./storage/models")
    
    system_info = {
        "timestamp": datetime.utcnow().isoformat(),
        "system": {},
        "python": {},
        "gpu": {},
        "models_summary": {}
    }
    
    try:
        loop = asyncio.new_event_loop()
        
        try:
            # Get system info
            system_info["system"] = loop.run_until_complete(env_manager.get_system_info())
            
            # Get Python info
            system_info["python"] = loop.run_until_complete(env_manager.get_python_version())
            
            # Get GPU info
            system_info["gpu"] = loop.run_until_complete(env_manager.get_gpu_info())
            
            # Get CUDA info
            system_info["cuda"] = loop.run_until_complete(env_manager.check_cuda_availability())
            
            # Get models health summary
            all_health = loop.run_until_complete(health_manager.get_all_models_health())
            system_info["models_summary"] = all_health.get("health_summary", {})
            
            # Determine overall status
            issues = []
            
            if not system_info["gpu"].get("available"):
                issues.append("No GPU detected")
            
            unhealthy_count = system_info["models_summary"].get("unhealthy", 0)
            if unhealthy_count > 0:
                issues.append(f"{unhealthy_count} unhealthy model(s)")
            
            system_info["overall_status"] = "healthy" if not issues else "degraded"
            system_info["issues"] = issues
            
            return system_info
            
        finally:
            loop.close()
    
    except Exception as e:
        logger.error(f"System health error: {e}")
        system_info["overall_status"] = "error"
        system_info["error"] = str(e)
        return system_info


@shared_task
def monitor_disk_space(min_free_gb: float = 5.0):
    """Monitor disk space and warn if low."""
    
    try:
        import shutil
        
        total, used, free = shutil.disk_usage("./storage")
        
        free_gb = free / (1024**3)
        used_percent = (used / total) * 100
        
        result = {
            "path": "./storage",
            "total_gb": round(total / (1024**3), 2),
            "used_gb": round(used / (1024**3), 2),
            "free_gb": round(free_gb, 2),
            "used_percent": round(used_percent, 2),
            "status": "ok",
            "warnings": []
        }
        
        if free_gb < min_free_gb:
            result["status"] = "warning"
            result["warnings"].append(
                f"Low disk space: {free_gb:.1f}GB free (min {min_free_gb}GB)"
            )
        
        if used_percent > 90:
            result["status"] = "critical"
            result["warnings"].append(
                f"Disk nearly full: {used_percent:.1f}% used"
            )
        
        if result["status"] != "ok":
            logger.warning(f"Disk space alert: {result['warnings']}")
        
        return result
        
    except Exception as e:
        logger.error(f"Disk monitoring error: {e}")
        return {"status": "error", "error": str(e)}


@shared_task
def verify_dependencies():
    """Verify all critical dependencies are installed."""
    
    env_manager = EnvironmentManager()
    
    # Define critical dependencies to check
    critical_deps = [
        {"name": "torch"},
        {"name": "fastapi"},
        {"name": "sqlalchemy"},
        {"name": "celery"},
        {"name": "redis"}
    ]
    
    optional_deps = [
        {"name": "transformers"},
        {"name": "diffusers"},
        {"name": "packaging"}
    ]
    
    try:
        loop = asyncio.new_event_loop()
        
        try:
            critical_results = loop.run_until_complete(
                env_manager.verify_dependencies(critical_deps)
            )
            
            optional_results = loop.run_until_complete(
                env_manager.verify_dependencies(optional_deps)
            )
            
            all_critical_ok = all(r.get("satisfied") for r in critical_results.values())
            
            return {
                "all_critical_satisfied": all_critical_ok,
                "critical": critical_results,
                "optional": optional_results,
                "timestamp": datetime.utcnow().isoformat()
            }
            
        finally:
            loop.close()
    
    except Exception as e:
        logger.error(f"Dependency verification error: {e}")
        return {"error": str(e)}


@shared_task
def cleanup_old_health_records(older_than_days: int = 7):
    """Clean up old health check records from database.
    
    Note: This requires a health_check_results table to be implemented.
    Currently returns informational message.
    """
    
    return {
        "message": "Health record cleanup not yet implemented - no database table",
        "suggestion": "Consider implementing health_check_results table for persistent storage"
    }
