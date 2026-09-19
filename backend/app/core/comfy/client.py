"""ComfyUI client for communicating with the ComfyUI execution engine."""

import asyncio
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import aiohttp
import websockets

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ComfyUIClient:
    """Client for communicating with ComfyUI via HTTP and WebSocket."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or settings.comfyui_url
        self._session: Optional[aiohttp.ClientSession] = None
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._stats_cache: Optional[dict] = None
        self._stats_cache_time: float = 0.0
        self._object_info_cache: Optional[dict] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            connector = aiohttp.TCPConnector(limit=100, keepalive_timeout=60.0, enable_cleanup_closed=True)
            timeout = aiohttp.ClientTimeout(total=settings.comfyui_timeout)
            self._session = aiohttp.ClientSession(connector=connector, timeout=timeout)
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
        if self._ws:
            await self._ws.close()

    async def health_check(self, force: bool = False) -> dict:
        """Check if ComfyUI is running and accessible (with 3s micro-cache)."""
        now = asyncio.get_event_loop().time()
        if not force and self._stats_cache is not None and (now - self._stats_cache_time) < 3.0:
            return self._stats_cache

        try:
            session = await self._get_session()
            async with session.get(f"{self.base_url}/system_stats") as resp:
                if resp.status == 200:
                    data = await resp.json()
                    res = {"status": "ok", "data": data}
                    self._stats_cache = res
                    self._stats_cache_time = now
                    return res
                return {"status": "error", "error": f"HTTP {resp.status}"}
        except Exception as e:
            logger.warning(f"ComfyUI health check failed: {e}")
            return {"status": "error", "error": str(e)}

    async def is_alive(self) -> bool:
        """Check if ComfyUI service is responding."""
        res = await self.health_check()
        return res.get("status") == "ok"

    async def get_system_stats(self) -> dict:
        """Fetch real-time system stats from ComfyUI."""
        try:
            session = await self._get_session()
            async with session.get(f"{self.base_url}/system_stats") as resp:
                if resp.status == 200:
                    return await resp.json()
                return {}
        except Exception:
            return {}

    async def queue_prompt(self, prompt: dict, client_id: Optional[str] = None) -> dict:
        """Queue a prompt for execution in ComfyUI."""
        client_id = client_id or str(uuid.uuid4())
        payload = {
            "prompt": prompt,
            "client_id": client_id,
        }
        try:
            session = await self._get_session()
            async with session.post(f"{self.base_url}/prompt", json=payload) as resp:
                if resp.status == 200:
                    return await resp.json()
                error_text = await resp.text()
                raise RuntimeError(f"Failed to queue prompt: {error_text}")
        except Exception as e:
            logger.error(f"Failed to queue prompt: {e}")
            raise

    async def get_queue(self) -> dict:
        """Get the current queue status."""
        try:
            session = await self._get_session()
            async with session.get(f"{self.base_url}/queue") as resp:
                if resp.status == 200:
                    return await resp.json()
                raise RuntimeError(f"Failed to get queue: HTTP {resp.status}")
        except Exception as e:
            logger.error(f"Failed to get queue: {e}")
            raise

    async def get_history(self, prompt_id: str) -> dict:
        """Get execution history for a prompt."""
        try:
            session = await self._get_session()
            async with session.get(f"{self.base_url}/history/{prompt_id}") as resp:
                if resp.status == 200:
                    return await resp.json()
                raise RuntimeError(f"Failed to get history: HTTP {resp.status}")
        except Exception as e:
            logger.error(f"Failed to get history: {e}")
            raise

    async def get_object_info(self, node_type: Optional[str] = None) -> dict:
        """Get object info for available nodes."""
        if node_type is None and self._object_info_cache is not None:
            return self._object_info_cache
        try:
            session = await self._get_session()
            url = f"{self.base_url}/object_info"
            if node_type:
                url = f"{url}/{node_type}"
            async with session.get(url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if node_type is None:
                        self._object_info_cache = data
                    return data
                raise RuntimeError(f"Failed to get object info: HTTP {resp.status}")
        except Exception as e:
            logger.error(f"Failed to get object info: {e}")
            raise

    async def upload_image(self, image_data: bytes, filename: str) -> dict:
        """Upload an image to ComfyUI."""
        try:
            session = await self._get_session()
            data = aiohttp.FormData()
            data.add_field("image", image_data, filename=filename, content_type="image/png")
            async with session.post(f"{self.base_url}/upload/image", data=data) as resp:
                if resp.status == 200:
                    return await resp.json()
                raise RuntimeError(f"Failed to upload image: HTTP {resp.status}")
        except Exception as e:
            logger.error(f"Failed to upload image: {e}")
            raise

    async def get_image(self, filename: str, subfolder: str = "", type: str = "output") -> bytes:
        """Get an image from ComfyUI."""
        try:
            session = await self._get_session()
            params = {"filename": filename, "subfolder": subfolder, "type": type}
            async with session.get(f"{self.base_url}/view", params=params) as resp:
                if resp.status == 200:
                    return await resp.read()
                raise RuntimeError(f"Failed to get image: HTTP {resp.status}")
        except Exception as e:
            logger.error(f"Failed to get image: {e}")
            raise

    async def cancel_job(self, prompt_id: str) -> dict:
        """Cancel a specific prompt execution without global interruption."""
        try:
            session = await self._get_session()
            # ComfyUI 0.36.0 native job-specific cancel route
            async with session.post(f"{self.base_url}/api/jobs/{prompt_id}/cancel") as resp:
                if resp.status in (200, 204):
                    return {"status": "ok", "cancelled": True}
        except Exception as e:
            logger.warning(f"Native job cancel for {prompt_id} failed: {e}")

        # Fallback: Delete from ComfyUI queue
        try:
            session = await self._get_session()
            async with session.post(f"{self.base_url}/queue", json={"delete": [prompt_id]}) as resp:
                if resp.status == 200:
                    return {"status": "ok", "cancelled": True}
        except Exception as e:
            logger.warning(f"Queue delete for {prompt_id} failed: {e}")

        return {"status": "ok"}

    async def interrupt(self) -> dict:
        """Interrupt current execution."""
        try:
            session = await self._get_session()
            async with session.post(f"{self.base_url}/interrupt") as resp:
                if resp.status == 200:
                    return {"status": "ok"}
                raise RuntimeError(f"Failed to interrupt: HTTP {resp.status}")
        except Exception as e:
            logger.error(f"Failed to interrupt: {e}")
            raise

    async def free_memory(self, unload_models: bool = False) -> dict:
        """Free GPU/CPU memory and cache."""
        try:
            session = await self._get_session()
            payload = {"unload_models": unload_models, "free_memory": True}
            async with session.post(f"{self.base_url}/free", json=payload) as resp:
                if resp.status == 200:
                    return {"status": "ok"}
                raise RuntimeError(f"Failed to free memory: HTTP {resp.status}")
        except Exception as e:
            logger.error(f"Failed to free memory: {e}")
            raise

    async def connect_websocket(self, client_id: str) -> websockets.WebSocketClientProtocol:
        """Connect to ComfyUI WebSocket for real-time updates."""
        ws_url = self.base_url.replace("http", "ws") + f"/ws?clientId={client_id}"
        self._ws = await websockets.connect(ws_url)
        return self._ws

    async def listen_for_progress(self, client_id: str, callback):
        """Listen for progress updates via WebSocket."""
        ws = await self.connect_websocket(client_id)
        try:
            async for message in ws:
                data = json.loads(message)
                await callback(data)
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
        finally:
            await ws.close()


class WorkflowManager:
    """Manages ComfyUI workflows for 3D generation using verified ComfyUI-3D-Pack nodes."""

    def __init__(self, client: ComfyUIClient):
        self.client = client

    def list_available_workflows(self) -> list[dict[str, str]]:
        """List verified workflow templates."""
        from app.core.comfy.workflows import list_workflow_templates
        return list_workflow_templates()

    def prepare_workflow(
        self,
        workflow_name: str,
        prompt: str = "",
        negative_prompt: str = "",
        reference_image: Optional[str] = None,
        mesh_path: Optional[str] = None,
        save_path: str = "output.glb",
        seed: int = 1,
        steps: int = 20,
        cfg: float = 7.0,
        provider: Optional[str] = None,
        **kwargs,
    ) -> dict:
        """Prepare a verified ComfyUI workflow."""
        from app.core.comfy.workflows import build_workflow_for_job

        # Pass parameters to build_workflow_for_job
        return build_workflow_for_job(
            mode=workflow_name,
            provider=provider or workflow_name,
            image_filename=reference_image,
            mesh_path=mesh_path,
            save_path=save_path,
            seed=seed,
            steps=steps,
            **kwargs,
        )


# Global client instance
_comfyui_client: Optional[ComfyUIClient] = None
_workflow_manager: Optional[WorkflowManager] = None


def get_comfyui_client() -> ComfyUIClient:
    global _comfyui_client
    if _comfyui_client is None:
        _comfyui_client = ComfyUIClient()
    return _comfyui_client


def get_workflow_manager() -> WorkflowManager:
    global _workflow_manager
    if _workflow_manager is None:
        _workflow_manager = WorkflowManager(get_comfyui_client())
    return _workflow_manager


async def close_comfyui_client():
    global _comfyui_client, _workflow_manager
    if _comfyui_client:
        await _comfyui_client.close()
        _comfyui_client = None
    _workflow_manager = None