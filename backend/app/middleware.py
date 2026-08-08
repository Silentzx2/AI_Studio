"""Dev-only observability middleware — bridges to Reticle.

Wraps the Reticle observer (localhost:7777) so the backend emits
request traces during local development. In production the middleware
is a transparent no-op — zero runtime cost, zero bundle impact.

Uses a local observer server (backend/app/reticle_observer.py) written in
Python stdlib — no external dependencies required.
"""
from __future__ import annotations

import time
import logging
from typing import Any, Awaitable, Callable

from app.reticle_observer import add_event, start_observer

logger = logging.getLogger(__name__)


class ReticleMiddleware:
    """Dev-only middleware that traces HTTP requests to the Reticle observer.

    Inserts itself into the FastAPI/ASGI middleware chain (after CORS, before
    routes) and pushes request/response metadata to the localhost:7777 observer
    server. In production the middleware is not added to the app at all.
    """

    _observer_started: bool = False

    def __init__(self, app: Callable, port: int = 7777, bind_address: str = "127.0.0.1") -> None:
        self.app = app
        self.port = port
        self.bind_address = bind_address

        if not ReticleMiddleware._observer_started:
            observer = start_observer(host=bind_address, port=port)
            if observer is not None and observer.is_running():
                ReticleMiddleware._observer_started = True
                logger.info("Reticle observer listening on %s:%d", bind_address, port)
            else:
                logger.info("Reticle observer on %s:%d (middleware tracing active, no server)", bind_address, port)

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

        add_event({
            "type": "http_request",
            "method": method,
            "path": path,
            "status": status_code,
            "duration_ms": round(elapsed_ms, 1),
        })
