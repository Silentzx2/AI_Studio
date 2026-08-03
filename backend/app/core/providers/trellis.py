"""TRELLIS provider — wraps the TRELLIS structured 3D latent diffusion server."""
from typing import Any

import httpx

from app.config import get_settings
from app.core.providers.base import BaseProvider, ProviderResult
from app.schemas.generation import GenerationRequest

settings = get_settings()


class TRELLISProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "trellis"

    async def generate(
        self,
        request: GenerationRequest,
        output_dir: str,
        progress_callback: Any = None,
    ) -> ProviderResult:
        raise NotImplementedError(
            "TRELLIS provider requires a running TRELLIS server at "
            f"{settings.trellis_api_url}. Configure TRELLIS_API_URL."
        )

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{settings.trellis_api_url}/info")
                return r.status_code == 200
        except Exception:
            return False
