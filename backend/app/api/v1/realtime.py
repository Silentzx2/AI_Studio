"""Realtime WebSocket endpoint for frontend live monitoring."""

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core import get_comfyui_client

router = APIRouter()
logger = logging.getLogger(__name__)


async def _get_realtime_gpu_and_health() -> tuple[dict[str, Any], dict[str, Any]]:
    client = get_comfyui_client()
    health_res = await client.health_check()
    is_alive = health_res.get("status") == "ok"
    stats = health_res.get("data", {}) if is_alive else {}
    devices = stats.get("devices", []) if stats else []

    gpu_info = {
        "available": len(devices) > 0 and devices[0].get("type") != "cpu",
        "devices": devices,
        "vram_total_mb": int(devices[0].get("vram_total", 0) / (1024 * 1024)) if devices else 0,
        "vram_free_mb": int(devices[0].get("vram_free", 0) / (1024 * 1024)) if devices else 0,
    }

    health_info = {
        "status": "ok" if is_alive else "degraded",
        "comfyui": "online" if is_alive else "offline",
        "api": "online",
    }
    return gpu_info, health_info


@router.websocket("/ws")
async def realtime_ws(websocket: WebSocket):
    """WebSocket connection for real-time GPU and health streaming."""
    await websocket.accept()
    try:
        gpu_info, health_info = await _get_realtime_gpu_and_health()
        await websocket.send_text(
            json.dumps({"type": "initial", "data": {"gpu": gpu_info, "health": health_info}})
        )

        while True:
            await asyncio.sleep(3.0)
            gpu_info, health_info = await _get_realtime_gpu_and_health()
            await websocket.send_text(json.dumps({"type": "gpu", "data": gpu_info}))
            await websocket.send_text(json.dumps({"type": "health", "data": health_info}))
    except WebSocketDisconnect:
        logger.debug("Realtime WebSocket disconnected")
    except Exception as exc:
        logger.debug("Realtime WebSocket closed: %s", exc)
