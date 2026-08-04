from typing import Any

from app.core.providers.base import DownloadProvider


class HuggingFaceProvider(DownloadProvider):
    async def list_models(self) -> list[dict[str, Any]]:
        return []
        
    def get_model(self, identifier: str) -> dict[str, Any]:
        return {}
        
    def resolve_download_urls(self, model_id: str, version: str) -> list[dict[str, str]]:
        return []
        
    def validate_credentials(self, provider_config: dict[str, Any]) -> bool:
        return True
        
    def get_mirrors(self, url: str) -> list[str]:
        return []
