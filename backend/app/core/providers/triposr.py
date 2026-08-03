"""TripoSR provider — wraps the TripoSR single-image reconstruction server."""
from typing import Any

import httpx

from app.config import get_settings
from app.core.providers.base import BaseProvider, ProviderResult
from app.schemas.generation import GenerationRequest

settings = get_settings()


class TripoSRProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "triposr"

    async def generate(
        self,
        request: GenerationRequest,
        output_dir: str,
        progress_callback: Any = None,
    ) -> ProviderResult:
        raise NotImplementedError(
            "TripoSR provider requires a running TripoSR server at "
            f"{settings.triposr_api_url}. Configure TRIPOSR_API_URL."
        )

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{settings.triposr_api_url}/info")
                return r.status_code == 200
        except Exception:
            return False
