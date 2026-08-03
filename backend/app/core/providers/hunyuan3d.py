"""Hunyuan3D provider — wraps the Hunyuan3D Gradio/API server."""
from typing import Any

import httpx

from app.config import get_settings
from app.core.providers.base import BaseProvider, ProviderResult
from app.schemas.generation import GenerationRequest

settings = get_settings()


class Hunyuan3DProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "hunyuan3d"

    async def generate(
        self,
        request: GenerationRequest,
        output_dir: str,
        progress_callback: Any = None,
    ) -> ProviderResult:
        raise NotImplementedError(
            "Hunyuan3D provider requires a running Hunyuan3D server at "
            f"{settings.hunyuan3d_api_url}. Configure HUNYUAN3D_API_URL."
        )

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{settings.hunyuan3d_api_url}/info")
                return r.status_code == 200
        except Exception:
            return False
