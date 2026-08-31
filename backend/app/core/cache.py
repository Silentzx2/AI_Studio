"""Simple in-memory cache for expensive endpoints.

ponytail: LRU eviction capped at _MAX_CACHE_SIZE entries. Upgrade path:
replace with redis-backed cache for multi-process deployments.
"""
import time
from collections import OrderedDict
from threading import Lock
from typing import Any

_MAX_CACHE_SIZE = 256
_cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()
_lock = Lock()

def get_cached(key: str, ttl_seconds: float) -> Any | None:
    """Return cached value if not expired."""
    with _lock:
        if key in _cache:
            ts, val = _cache[key]
            if time.monotonic() - ts < ttl_seconds:
                _cache.move_to_end(key)
                return val
            del _cache[key]
    return None

def set_cached(key: str, value: Any) -> None:
    """Store value in cache with LRU eviction."""
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
        _cache[key] = (time.monotonic(), value)
        while len(_cache) > _MAX_CACHE_SIZE:
            _cache.popitem(last=False)

def invalidate(key: str) -> None:
    """Remove key from cache."""
    with _lock:
        _cache.pop(key, None)

def invalidate_prefix(prefix: str) -> int:
    """Remove all keys starting with prefix. Returns count removed."""
    with _lock:
        keys_to_remove = [k for k in _cache if k.startswith(prefix)]
        for k in keys_to_remove:
            del _cache[k]
        return len(keys_to_remove)

def invalidate_pattern(pattern: str) -> int:
    """Remove all keys matching a substring. Returns count removed."""
    with _lock:
        keys_to_remove = [k for k in _cache if pattern in k]
        for k in keys_to_remove:
            del _cache[k]
        return len(keys_to_remove)

def cache_stats() -> dict:
    """Return cache size for monitoring."""
    with _lock:
        return {"size": len(_cache), "max_size": _MAX_CACHE_SIZE}
