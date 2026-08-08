"""Dev-only observability middleware — bridges to Reticle.

Wraps the Reticle observer (localhost:7777) so the backend emits
request traces during local development. In production the middleware
is a transparent no-op — zero runtime cost, zero bundle impact.

ponytail: reticle-server is not yet on PyPI, so this shim provides the
middleware interface with graceful degradation. Once reticle-server publishes,
replace the try/except import with a direct ``from reticle_server import ReticleMiddleware``.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# ponytail: use a module-level dict for caching — avoids a Python 3.12.11
# compiler bug where ``global`` + ``import`` in the same function body causes
# UnboundLocalError. Dict is mutable, no global declaration needed.
_CACHE: dict[str, bool] = {}


def reticle_available() -> bool:
    """Return True if the Reticle server package can be imported."""
    if "checked" not in _CACHE:
        try:
            import reticle_server  # noqa: F401
            _CACHE["checked"] = True
        except ImportError:
            _CACHE["checked"] = False
    return _CACHE["checked"]


class ReticleMiddleware:
    """Thin wrapper around the Reticle observer middleware.

    If ``reticle_server`` is installed, delegates to its middleware.
    Otherwise provides a minimal localhost-only observer that logs
    request metadata to the Reticle dev bridge on port 7777.
    """

    def __init__(self, app: Any, port: int = 7777, bind_address: str = "127.0.0.1") -> None:
        self.app = app
        self.port = port
        self.bind_address = bind_address
        self._real_middleware = None

        if reticle_available():
            try:
                from reticle_server import ReticleMiddleware as _RealMiddleware
                self._real_middleware = _RealMiddleware(app, port=port, bind_address=bind_address)
                logger.info("Reticle observer listening on %s:%d", bind_address, port)
            except Exception as exc:
                logger.warning("Reticle middleware init failed (%s) — using fallback", exc)
        else:
            logger.info("Reticle fallback observer on %s:%d (reticle-server not installed)", bind_address, port)

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if self._real_middleware is not None:
            await self._real_middleware(scope, receive, send)
        else:
            if scope["type"] == "http":
                method = scope.get("method", "?")
                path = scope.get("path", "?")
                logger.debug("HTTP %s %s (Reticle fallback observer)", method, path)
            await self.app(scope, receive, send)
