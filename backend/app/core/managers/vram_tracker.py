import logging
from datetime import datetime
import redis as redis_sync
from app.config import get_settings
from app.database import SessionLocal
from app.models.job import VramAuditLog

logger = logging.getLogger(__name__)
settings = get_settings()

class VRAMAllocationTracker:
    def __init__(self) -> None:
        self.redis = redis_sync.from_url(settings.redis_url, decode_responses=True)
        self.redis_key = "vram:allocated"
        # Total memory (GB) default to 16.0, can be checked via torch or settings
        self.total_vram_gb = 16.0
        try:
            import torch
            if torch.cuda.is_available():
                _, total = torch.cuda.mem_get_info(0)
                self.total_vram_gb = float(total) / (1024**3)
        except Exception:
            pass
        self.safety_margin_gb = 2.0

    def get_max_allowed_gb(self) -> float:
        return max(4.0, self.total_vram_gb - self.safety_margin_gb)

    def get_allocated_models(self) -> dict[str, float]:
        """Get dict of loaded models with their size in GB."""
        try:
            data = self.redis.hgetall(self.redis_key)
            return {k: float(v) for k, v in data.items()}
        except Exception as exc:
            logger.warning("Failed to get allocated models from Redis: %s", exc)
            return {}

    def log_audit(self, model_name: str, action: str, size_gb: float, reason: str | None = None,
                  provider: str | None = None, mode: str | None = None,
                  attempt: int = 1, oom_retried: bool = False) -> None:
        """Log audit trail to database synchronously."""
        try:
            with SessionLocal() as session:
                log_entry = VramAuditLog(
                    model_name=model_name,
                    action=action,
                    size_gb=size_gb,
                    reason=reason,
                    timestamp=datetime.utcnow(),
                    provider=provider or model_name,
                    mode=mode,
                    attempt=attempt,
                    oom_retried=oom_retried,
                )
                session.add(log_entry)
                session.commit()
        except Exception as exc:
            logger.exception("Failed to write VRAM audit log: %s", exc)

    def allocate(self, model_name: str, size_gb: float, reason: str | None = None,
                 mode: str | None = None, attempt: int = 1, oom_retried: bool = False) -> bool:
        """Allocate VRAM for model. Returns True if successful."""
        allocated = self.get_allocated_models()
        current_sum = sum(allocated.values())
        max_allowed = self.get_max_allowed_gb()

        if current_sum + size_gb > max_allowed:
            # Need to evict
            can_load, estimated_freed, model_to_unload = self.predict_can_load(model_name, size_gb)
            if can_load and model_to_unload:
                logger.info("Evicting model %s (%s GB) to load %s (%s GB)", model_to_unload, estimated_freed, model_name, size_gb)
                self.deallocate(model_to_unload, reason=f"eviction_to_load_{model_name}")
                # Re-check sum
                allocated = self.get_allocated_models()
                current_sum = sum(allocated.values())

        if current_sum + size_gb <= max_allowed:
            try:
                # Save eviction/load timestamp for LRU in redis
                self.redis.hset(self.redis_key, model_name, str(size_gb))
                self.redis.set(f"vram:timestamp:{model_name}", datetime.utcnow().isoformat())
                self.log_audit(model_name, "load", size_gb, reason or "allocation_success",
                               mode=mode, attempt=attempt, oom_retried=oom_retried)
                logger.info("Allocated %s GB for model %s. Total allocated: %s GB", size_gb, model_name, current_sum + size_gb)
                return True
            except Exception as exc:
                logger.error("Failed to update allocation in Redis: %s", exc)
                return False
        else:
            logger.warning("Allocation failed for %s (%s GB). VRAM pressure too high.", model_name, size_gb)
            return False

    def deallocate(self, model_name: str, reason: str | None = None,
                   mode: str | None = None, attempt: int = 1, oom_retried: bool = False) -> None:
        """Deallocate VRAM for model."""
        allocated = self.get_allocated_models()
        size_gb = allocated.get(model_name, 0.0)
        try:
            self.redis.hdel(self.redis_key, model_name)
            self.redis.delete(f"vram:timestamp:{model_name}")
            self.log_audit(model_name, "unload", size_gb, reason or "deallocation_request",
                           mode=mode, attempt=attempt, oom_retried=oom_retried)
            logger.info("Deallocated model %s (%s GB). Reason: %s", model_name, size_gb, reason)
        except Exception as exc:
            logger.error("Failed to deallocate %s from Redis: %s", model_name, exc)

    def predict_can_load(self, model_name: str, size_gb: float) -> tuple[bool, float, str | None]:
        """Predict if model can be loaded, and what needs to be unloaded if so.
        
        Returns: (can_load, estimated_freed_gb, model_to_unload)
        """
        allocated = self.get_allocated_models()
        current_sum = sum(allocated.values())
        max_allowed = self.get_max_allowed_gb()

        if current_sum + size_gb <= max_allowed:
            return True, 0.0, None

        # LRU selection based on timestamps
        oldest_model = None
        oldest_ts = None
        
        for name in allocated.keys():
            if name == model_name:
                continue
            ts_str = self.redis.get(f"vram:timestamp:{name}")
            if ts_str:
                try:
                    ts = datetime.fromisoformat(ts_str)
                    if oldest_ts is None or ts < oldest_ts:
                        oldest_ts = ts
                        oldest_model = name
                except Exception:
                    pass
            if oldest_model is None:
                oldest_model = name # fallback to first key

        if oldest_model:
            freed_gb = allocated[oldest_model]
            if current_sum - freed_gb + size_gb <= max_allowed:
                return True, freed_gb, oldest_model

        return False, 0.0, None

# Singleton instance
vram_tracker = VRAMAllocationTracker()
