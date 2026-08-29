"""Simple in-memory cache for expensive endpoints."""
import time
from threading import Lock
from typing import Any

_cache: dict[str, tuple[float, Any]] = {}
_lock = Lock()

def get_cached(key: str, ttl_seconds: float) -> Any | None:
    """Return cached value if not expired."""
    with _lock:
        if key in _cache:
            ts, val = _cache[key]
            if time.monotonic() - ts < ttl_seconds:
                return val
            del _cache[key]
    return None

def set_cached(key: str, value: Any) -> None:
    """Store value in cache."""
    with _lock:
        _cache[key] = (time.monotonic(), value)

def invalidate(key: str) -> None:
    """Remove key from cache."""
    with _lock:
        _cache.pop(key, None)

def invalidate_pattern(pattern: str) -> int:
    """Remove all keys matching a substring. Returns count removed."""
    with _lock:
        keys_to_remove = [k for k in _cache if pattern in k]
        for k in keys_to_remove:
            del _cache[k]
        return len(keys_to_remove)
