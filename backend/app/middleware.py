"""Dev-only observability middleware — supplementary server-side tracing.

Works alongside Reticle (localhost:4400) but provides additional server-side
visibility that the browser SDK cannot see: backend-internal timing, server-side
errors, and traces for API calls made server-to-server (not from the browser).

Events are pushed to the local observer server (localhost:7777) which the
developer can query via:
    curl http://localhost:7777/events

In production, this middleware is not added to the app at all.
"""
from __future__ import annotations

import time
import logging
from typing import Any, Callable

from app.reticle_observer import add_event

logger = logging.getLogger(__name__)


class ReticleMiddleware:
    """Dev-only ASGI middleware that traces HTTP requests.

    Inserts into the FastAPI middleware chain (after CORS, before routes)
    and records request metadata to the local observer server.

    Note: Reticle's browser SDK already captures network requests client-side.
    This middleware adds server-side visibility for cases where the browser SDK
    cannot observe (e.g. cron-triggered API calls, internal service-to-service
    requests, server-side errors).
    """

    _started: bool = False

    def __init__(self, app: Callable, port: int = 7777, bind_address: str = "127.0.0.1") -> None:
        self.app = app
        self.port = port
        self.bind_address = bind_address

        if not ReticleMiddleware._started:
            try:
                from app.reticle_observer import start_observer
                obs = start_observer(host=bind_address, port=port)
                if obs is not None and obs.is_running():
                    ReticleMiddleware._started = True
                    logger.info("Server-side observer running on %s:%d", bind_address, port)
                else:
                    logger.info(
                        "Server-side observer bind failed on %s:%d — middleware logging only",
                        bind_address, port,
                    )
            except Exception as exc:
                logger.warning("Reticle middleware observer init failed: %s", exc)

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "?")
        path = scope.get("path", "?")
        start = time.perf_counter()

        captured_status: list[int] = []

        async def _tracing_send(message):
            if message["type"] == "http.response.start":
                captured_status.append(message.get("status", 0))
            await send(message)

        await self.app(scope, receive, _tracing_send)

        elapsed_ms = (time.perf_counter() - start) * 1000
        status_code = captured_status[0] if captured_status else 0

        try:
            add_event({
                "type": "http_request",
                "method": method,
                "path": path,
                "status": status_code,
                "duration_ms": round(elapsed_ms, 1),
            })
        except Exception:
            pass
