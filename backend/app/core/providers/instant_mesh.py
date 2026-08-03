"""InstantMesh provider — wraps the InstantMesh multi-view reconstruction server."""
from typing import Any

import httpx

from app.config import get_settings
from app.core.providers.base import BaseProvider, ProviderResult
from app.schemas.generation import GenerationRequest

settings = get_settings()


class InstantMeshProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "instant_mesh"

    async def generate(
        self,
        request: GenerationRequest,
        output_dir: str,
        progress_callback: Any = None,
    ) -> ProviderResult:
        raise NotImplementedError(
            "InstantMesh provider requires a running InstantMesh server at "
            f"{settings.instant_mesh_api_url}. Configure INSTANT_MESH_API_URL."
        )

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{settings.instant_mesh_api_url}/info")
                return r.status_code == 200
        except Exception:
            return False
