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
    """Manages ComfyUI workflows for 3D generation."""

    def __init__(self, client: ComfyUIClient):
        self.client = client
        self._workflow_cache: dict[str, dict] = {}

    def load_workflow(self, workflow_name: str) -> dict:
        """Load a workflow from file."""
        if workflow_name in self._workflow_cache:
            return self._workflow_cache[workflow_name]

        # Look for workflow in ComfyUI workflows directory
        workflow_dir = Path(settings.third_party_dir) / "ComfyUI" / "workflows"
        workflow_path = workflow_dir / f"{workflow_name}.json"

        if workflow_path.exists():
            with open(workflow_path) as f:
                workflow = json.load(f)
                self._workflow_cache[workflow_name] = workflow
                return workflow

        # Check ENGINE/ComfyUI/user/default/workflows
        engine_workflow_dir = Path("ENGINE/ComfyUI/user/default/workflows")
        engine_workflow_path = engine_workflow_dir / f"{workflow_name}.json"

        if engine_workflow_path.exists():
            with open(engine_workflow_path) as f:
                workflow = json.load(f)
                self._workflow_cache[workflow_name] = workflow
                return workflow

        # Return built-in default workflows
        workflow = self._get_builtin_workflow(workflow_name)
        self._workflow_cache[workflow_name] = workflow
        return workflow

    def _get_builtin_workflow(self, workflow_name: str) -> dict:
        """Get built-in workflow templates."""
        workflows = {
            "text_to_3d": self._text_to_3d_workflow(),
            "image_to_3d": self._image_to_3d_workflow(),
            "texture": self._texture_workflow(),
            "remesh": self._remesh_workflow(),
        }
        return workflows.get(workflow_name, self._text_to_3d_workflow())

    def _text_to_3d_workflow(self) -> dict:
        """Basic text-to-3D workflow using ComfyUI-3D-Pack nodes."""
        return {
            "1": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "", "clip": ["4", 1]},
            },
            "2": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
            },
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 0,
                    "steps": 20,
                    "cfg": 7.0,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": 1.0,
                    "model": ["4", 0],
                    "positive": ["1", 0],
                    "negative": ["5", 0],
                    "latent_image": ["2", 0],
                },
            },
            "4": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "hunyuan3d-2.1.safetensors"},
            },
            "5": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "low quality, bad anatomy", "clip": ["4", 1]},
            },
            "6": {
                "class_type": "VAEDecode",
                "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
            },
            "7": {
                "class_type": "SaveImage",
                "inputs": {"filename_prefix": "3d_output", "images": ["6", 0]},
            },
        }

    def _image_to_3d_workflow(self) -> dict:
        """Image-to-3D workflow."""
        workflow = self._text_to_3d_workflow()
        # Modify for image input
        workflow["8"] = {
            "class_type": "LoadImage",
            "inputs": {"image": "input.png"},
        }
        workflow["1"]["inputs"]["text"] = ""
        return workflow

    def _texture_workflow(self) -> dict:
        """Texture generation workflow."""
        return {
            "1": {
                "class_type": "LoadMesh",
                "inputs": {"mesh_path": ""},
            },
            "2": {
                "class_type": "TextureGenerator",
                "inputs": {"mesh": ["1", 0], "prompt": "", "steps": 20},
            },
            "3": {
                "class_type": "SaveMesh",
                "inputs": {"mesh": ["2", 0], "filename": "textured_output"},
            },
        }

    def _remesh_workflow(self) -> dict:
        """Remesh workflow."""
        return {
            "1": {
                "class_type": "LoadMesh",
                "inputs": {"mesh_path": ""},
            },
            "2": {
                "class_type": "Remesh",
                "inputs": {"mesh": ["1", 0], "target_faces": 10000},
            },
            "3": {
                "class_type": "SaveMesh",
                "inputs": {"mesh": ["2", 0], "filename": "remeshed_output"},
            },
        }

    def prepare_workflow(
        self,
        workflow_name: str,
        prompt: str,
        negative_prompt: str = "",
        reference_image: Optional[str] = None,
        seed: int = 0,
        steps: int = 20,
        cfg: float = 7.0,
        model_name: str = "hunyuan3d-2.1.safetensors",
        **kwargs,
    ) -> dict:
        """Prepare a workflow with the given parameters."""
        workflow = self.load_workflow(workflow_name)

        # Deep copy to avoid modifying cached workflow
        import copy
        workflow = copy.deepcopy(workflow)

        # Apply parameters to workflow nodes
        for node_id, node in workflow.items():
            class_type = node.get("class_type", "")

            if class_type == "CLIPTextEncode":
                if "positive" in node.get("inputs", {}).get("text", "").lower() or "prompt" in str(node.get("inputs", {})):
                    node["inputs"]["text"] = prompt
                elif "negative" in str(node.get("inputs", {})).lower():
                    node["inputs"]["text"] = negative_prompt

            elif class_type == "KSampler":
                node["inputs"]["seed"] = seed
                node["inputs"]["steps"] = steps
                node["inputs"]["cfg"] = cfg

            elif class_type == "CheckpointLoaderSimple":
                node["inputs"]["ckpt_name"] = model_name

            elif class_type == "LoadImage" and reference_image:
                node["inputs"]["image"] = reference_image

            elif class_type == "LoadMesh" and "mesh_path" in node.get("inputs", {}):
                node["inputs"]["mesh_path"] = kwargs.get("mesh_path", "")

            elif class_type == "TextureGenerator":
                node["inputs"]["prompt"] = prompt
                node["inputs"]["steps"] = steps

            elif class_type == "Remesh":
                node["inputs"]["target_faces"] = kwargs.get("target_faces", 10000)

            elif class_type == "SaveImage" or class_type == "SaveMesh":
                node["inputs"]["filename_prefix"] = kwargs.get("output_prefix", "3d_output")

        return workflow


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