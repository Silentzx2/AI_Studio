"""Shared Redis connection pools to avoid connection churn per request.

ponytail: One sync pool + one async pool per backend process. Upgrade path:
use redis.Cluster for multi-node Redis deployments.
"""
import redis

from app.config import get_settings

_settings = get_settings()

# Shared sync connection pool — one pool per backend process
_pool = redis.ConnectionPool.from_url(
    _settings.redis_url,
    decode_responses=True,
    max_connections=20,
    socket_connect_timeout=5,
    socket_timeout=5,
)

# Shared async connection pool — MUST be a redis.asyncio.ConnectionPool.
# A sync redis.ConnectionPool cannot back an async client: the async client
# awaits its Connection objects, and sync Connections raise
# "object Connection can't be used in 'await' expression" (this broke the
# rate limiter in _check_rate_limit). The two pool types are not interchangeable.
_async_pool = redis.asyncio.ConnectionPool.from_url(
    _settings.redis_url,
    decode_responses=True,
    max_connections=20,
    socket_connect_timeout=5,
    socket_timeout=5,
)


def get_redis() -> redis.Redis:
    """Return a Redis client backed by the shared sync connection pool."""
    return redis.Redis(connection_pool=_pool)


async def get_async_redis():
    """Return an async Redis client backed by the shared async pool."""
    return redis.asyncio.Redis(connection_pool=_async_pool)
