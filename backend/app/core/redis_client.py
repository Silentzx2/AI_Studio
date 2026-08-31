"""Shared Redis connection pool to avoid connection churn per request.

ponytail: Single connection pool shared across all modules. Upgrade path:
use redis.Cluster for multi-node Redis deployments.
"""
import redis

from app.config import get_settings

_settings = get_settings()

# Shared connection pool — one pool per backend process
_pool = redis.ConnectionPool.from_url(
    _settings.redis_url,
    decode_responses=True,
    max_connections=20,
    socket_connect_timeout=5,
    socket_timeout=5,
)


def get_redis() -> redis.Redis:
    """Return a Redis client backed by the shared connection pool."""
    return redis.Redis(connection_pool=_pool)


async def get_async_redis():
    """Return an async Redis client backed by a shared connection pool."""
    import redis.asyncio as aioreds
    return aioreds.Redis(connection_pool=_pool)
