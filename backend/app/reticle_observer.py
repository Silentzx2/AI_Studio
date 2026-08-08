"""Minimal Reticle observer server — runs on localhost:7777.

Collects HTTP request/response traces from ReticleMiddleware and serves
them via a simple HTTP API for the Reticle CLI / dashboard to consume.

Uses only Python stdlib (http.server, json, threading) — no external deps.
ponytail: in-memory circular buffer (max 500 events). Upgrade path: persist to
SQLite or Redis if event volume grows in a real dev session.
"""
from __future__ import annotations

import json
import logging
import threading
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

_MAX_EVENTS = 500
_events: deque[dict[str, Any]] = deque(maxlen=_MAX_EVENTS)
_events_lock = threading.Lock()


def add_event(event: dict[str, Any]) -> None:
    """Push a single traced event into the circular buffer."""
    event.setdefault("ts", _timestamp())
    with _events_lock:
        _events.append(event)


def get_events() -> list[dict[str, Any]]:
    with _events_lock:
        return list(_events)


def _timestamp() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


class _ReticleHandler(BaseHTTPRequestHandler):
    def _send_json(self, code: int, data: dict) -> None:
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/events":
            self._send_json(200, {"events": get_events(), "count": len(get_events())})
        elif path == "/health":
            self._send_json(200, {"status": "ok", "observer": "reticle-observer"})
        elif path == "/" or path == "/dashboard":
            self._send_json(200, {"status": "running", "events_url": "/events"})
        else:
            self._send_json(404, {"error": "not found"})

    def log_message(self, fmt: str, *args: Any) -> None:
        pass


class ReticleObserverServer:
    """Threaded HTTP server bound to localhost only."""

    def __init__(self, host: str = "127.0.0.1", port: int = 7777) -> None:
        self.host = host
        self.port = port
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> bool:
        """Start the observer in a background daemon thread. Returns True if started."""
        if self._server is not None:
            return True
        try:
            self._server = ThreadingHTTPServer((self.host, self.port), _ReticleHandler)
            self._server.daemon_threads = True
            self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
            self._thread.start()
            logger.info("Reticle observer listening on %s:%d", self.host, self.port)
            return True
        except OSError as exc:
            logger.warning("Reticle observer bind failed on %s:%d (%s) — using middleware-only mode", self.host, self.port, exc)
            self._server = None
            return False

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None

    def is_running(self) -> bool:
        return self._server is not None


_observer: ReticleObserverServer | None = None


def get_observer() -> ReticleObserverServer | None:
    global _observer
    return _observer


def start_observer(host: str = "127.0.0.1", port: int = 7777) -> ReticleObserverServer | None:
    """Start (or reuse) the singleton observer server."""
    global _observer
    if _observer is None or not _observer.is_running():
        _observer = ReticleObserverServer(host, port)
        _observer.start()
    return _observer
