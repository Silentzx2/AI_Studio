"""ComfyUI event handling for real-time progress updates."""

import asyncio
import json
import logging
from typing import Any, Callable, Optional

import websockets

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ComfyUIEventListener:
    """Listens for ComfyUI WebSocket events and dispatches them."""

    def __init__(self, client_id: str):
        self.client_id = client_id
        self.ws_url = settings.comfyui_url.replace("http", "ws") + f"/ws?clientId={client_id}"
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._callbacks: dict[str, list[Callable]] = {}
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def on(self, event_type: str, callback: Callable):
        """Register a callback for an event type."""
        if event_type not in self._callbacks:
            self._callbacks[event_type] = []
        self._callbacks[event_type].append(callback)

    async def _dispatch(self, event_type: str, data: Any):
        """Dispatch event to registered callbacks."""
        callbacks = self._callbacks.get(event_type, [])
        for callback in callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(data)
                else:
                    callback(data)
            except Exception as e:
                logger.error(f"Error in event callback for {event_type}: {e}")

        # Dispatch to wildcard listeners
        wildcard_callbacks = self._callbacks.get("*", [])
        for callback in wildcard_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(event_type, data)
                else:
                    callback(event_type, data)
            except Exception as e:
                logger.error(f"Error in wildcard callback for {event_type}: {e}")

    async def _handle_message(self, message: str):
        """Handle incoming WebSocket message."""
        try:
            data = json.loads(message)
            event_type = data.get("type", "unknown")

            if event_type == "status":
                await self._dispatch("status", data.get("data", {}))
            elif event_type == "progress":
                await self._dispatch("progress", data.get("data", {}))
            elif event_type == "execution_start":
                await self._dispatch("execution_start", data.get("data", {}))
            elif event_type == "execution_success":
                await self._dispatch("execution_success", data.get("data", {}))
            elif event_type == "execution_error":
                await self._dispatch("execution_error", data.get("data", {}))
            elif event_type == "executing":
                await self._dispatch("executing", data.get("data", {}))
            else:
                await self._dispatch(event_type, data)
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse WebSocket message: {message}")

    async def start(self):
        """Start listening for events."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run())

    async def _run(self):
        """Main event loop."""
        while self._running:
            try:
                async with websockets.connect(self.ws_url) as ws:
                    self._ws = ws
                    logger.info(f"Connected to ComfyUI WebSocket for client {self.client_id}")
                    async for message in ws:
                        if not self._running:
                            break
                        await self._handle_message(message)
            except websockets.exceptions.ConnectionClosed:
                logger.warning(f"WebSocket connection closed for client {self.client_id}")
            except Exception as e:
                logger.error(f"WebSocket error for client {self.client_id}: {e}")

            if self._running:
                logger.info(f"Reconnecting to ComfyUI WebSocket in 5 seconds...")
                await asyncio.sleep(5)

    async def stop(self):
        """Stop listening for events."""
        self._running = False
        if self._ws:
            await self._ws.close()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass


class ProgressTracker:
    """Tracks generation progress from ComfyUI events."""

    def __init__(self, job_id: str):
        self.job_id = job_id
        self.current_node = ""
        self.completed_nodes = set()
        self.total_nodes = 0
        self.progress = 0
        self.stage = "queued"
        self.message = "Job queued"
        self._callbacks: list[Callable] = []

    def on_progress(self, callback: Callable):
        """Register a progress callback."""
        self._callbacks.append(callback)

    def _notify(self):
        """Notify all callbacks of progress update."""
        for callback in self._callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    asyncio.create_task(callback(self.get_status()))
                else:
                    callback(self.get_status())
            except Exception as e:
                logger.error(f"Error in progress callback: {e}")

    def get_status(self) -> dict:
        """Get current progress status."""
        return {
            "job_id": self.job_id,
            "progress": self.progress,
            "stage": self.stage,
            "message": self.message,
            "current_node": self.current_node,
            "completed_nodes": list(self.completed_nodes),
        }

    def handle_event(self, event_type: str, data: dict):
        """Handle ComfyUI event and update progress."""
        if event_type == "execution_start":
            self.stage = "running"
            self.message = "Starting generation..."
            self._notify()

        elif event_type == "executing":
            node = data.get("node", "")
            prompt_id = data.get("prompt_id", "")
            if node:
                self.current_node = node
                self.stage = "processing"
                self.message = f"Executing node: {node}"
                self._notify()

        elif event_type == "progress":
            value = data.get("value", 0)
            max_value = data.get("max", 1)
            if max_value > 0:
                self.progress = int((value / max_value) * 100)
            self.message = f"Progress: {self.progress}%"
            self._notify()

        elif event_type == "execution_success":
            self.stage = "completed"
            self.progress = 100
            self.message = "Generation completed successfully"
            self._notify()

        elif event_type == "execution_error":
            self.stage = "failed"
            self.message = f"Error: {data.get('error', 'Unknown error')}"
            self._notify()


# Global event listeners for active jobs
_event_listeners: dict[str, ComfyUIEventListener] = {}
_progress_trackers: dict[str, ProgressTracker] = {}


async def create_job_listener(job_id: str) -> tuple[ComfyUIEventListener, ProgressTracker]:
    """Create and start event listener for a job."""
    client_id = f"job_{job_id}"
    listener = ComfyUIEventListener(client_id)
    tracker = ProgressTracker(job_id)

    def on_event(event_type: str, data: dict):
        tracker.handle_event(event_type, data)

    listener.on("*", on_event)
    await listener.start()

    _event_listeners[job_id] = listener
    _progress_trackers[job_id] = tracker

    return listener, tracker


async def stop_job_listener(job_id: str):
    """Stop event listener for a job."""
    if job_id in _event_listeners:
        await _event_listeners[job_id].stop()
        del _event_listeners[job_id]
    if job_id in _progress_trackers:
        del _progress_trackers[job_id]


def get_progress_tracker(job_id: str) -> Optional[ProgressTracker]:
    """Get progress tracker for a job."""
    return _progress_trackers.get(job_id)


async def cleanup_all_listeners():
    """Clean up all active listeners."""
    for job_id in list(_event_listeners.keys()):
        await stop_job_listener(job_id)