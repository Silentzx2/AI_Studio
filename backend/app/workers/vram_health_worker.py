import logging
from datetime import datetime
import redis as redis_sync
from app.config import get_settings
from app.core.managers.vram_tracker import vram_tracker

logger = logging.getLogger(__name__)
settings = get_settings()

# Delay import of celery_app to avoid circular import issues
from app.workers.celery_app import celery_app

@celery_app.task(name="app.workers.vram_health_worker.check_vram_health")
def check_vram_health() -> dict:
    """Celery periodic task to monitor GPU memory and clean up if needed."""
    r = redis_sync.from_url(settings.redis_url, decode_responses=True)
    
    # 1. Check current VRAM usage
    total_gb = vram_tracker.total_vram_gb
    allocated = vram_tracker.get_allocated_models()
    used_gb = sum(allocated.values())
    
    # Check actual torch memory if available as a safety layer
    try:
        import torch
        if torch.cuda.is_available():
            free_mem, total_mem = torch.cuda.mem_get_info(0)
            actual_used_gb = (total_mem - free_mem) / (1024**3)
            used_gb = max(used_gb, actual_used_gb)
    except Exception:
        pass

    pressure = used_gb / total_gb if total_gb > 0 else 0.0
    logger.info("VRAM background health check: used=%s GB, total=%s GB, pressure=%s", used_gb, total_gb, pressure)
    
    status = "healthy"
    
    # If >90%: Unload oldest unused model
    if pressure > 0.90:
        logger.warning("VRAM pressure exceeds 90%% (pressure=%s). Selecting oldest model for eviction.", pressure)
        can_load, estimated_freed, model_to_unload = vram_tracker.predict_can_load("health_dummy", 0.1)
        if model_to_unload:
            logger.info("Evicting %s under memory pressure in background check", model_to_unload)
            vram_tracker.deallocate(model_to_unload, reason="vram_pressure_90_percent")
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass
            status = "evicted_model"
            
    # If >95%: Mark system as "constrained"
    if pressure > 0.95:
        logger.error("VRAM pressure critical (>95%%: %s). Marking system as constrained.", pressure)
        r.set("vram:status", "constrained")
        status = "constrained"
    else:
        r.set("vram:status", "healthy")

    # Update latest vram metrics in redis for fast monitoring access
    r.set("vram:latest:used_gb", str(used_gb))
    r.set("vram:latest:total_gb", str(total_gb))
    r.set("vram:latest:pressure", str(pressure))
    r.set("vram:latest:timestamp", datetime.utcnow().isoformat())

    return {
        "status": status,
        "used_gb": used_gb,
        "total_gb": total_gb,
        "pressure": pressure
    }
