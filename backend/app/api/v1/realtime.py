"""WebSocket endpoint for real-time system updates."""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
logger = logging.getLogger(__name__)

# Connected WebSocket clients
_clients: set[WebSocket] = set()


async def broadcast(message: dict) -> None:
    """Send a message to all connected clients."""
    disconnected: set[WebSocket] = set()
    for client in _clients:
        try:
            await client.send_json(message)
        except Exception:
            disconnected.add(client)
    _clients.difference_update(disconnected)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time system status, GPU, and health updates."""
    await websocket.accept()
    _clients.add(websocket)
    logger.info("WebSocket client connected (total: %d)", len(_clients))

    try:
        # Send initial state immediately
        from runtime.gpu import get_gpu_info
        from runtime.health import RuntimeHealth

        health = await RuntimeHealth.check_all()
        gpu = get_gpu_info()

        await websocket.send_json({
            "type": "initial",
            "data": {
                "health": health,
                "gpu": {
                    "available": gpu.available,
                    "devices": gpu.devices,
                    "free_vram_mb": gpu.free_vram_mb,
                    "total_vram_mb": gpu.total_vram_mb,
                },
            }
        })

        # Keep connection alive and handle client messages
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=30.0
                )
                # Handle ping messages
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                # Send keepalive
                await websocket.send_json({"type": "keepalive"})
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    finally:
        _clients.discard(websocket)


async def push_update(update_type: str, data: dict) -> None:
    """Push an update to all connected clients."""
    await broadcast({"type": update_type, "data": data})
