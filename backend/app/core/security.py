"""Security utilities for the new FastAPI backend."""

import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict]:
    """Get current user from auth token (placeholder for future auth)."""
    # TODO: Implement actual authentication
    # For now, return None to indicate no auth required
    return None


def require_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """Require authentication (placeholder for future auth)."""
    # TODO: Implement actual authentication
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )


class RateLimiter:
    """Simple in-memory rate limiter."""

    def __init__(self):
        self.requests: dict[str, list[float]] = {}

    def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> bool:
        import time
        now = time.time()
        window_start = now - window_seconds

        if key not in self.requests:
            self.requests[key] = []

        # Clean old requests
        self.requests[key] = [ts for ts in self.requests[key] if ts > window_start]

        if len(self.requests[key]) >= max_requests:
            return False

        self.requests[key].append(now)
        return True


_rate_limiter: "RateLimiter | None" = None


def get_rate_limiter() -> RateLimiter:
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter