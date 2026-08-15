from typing import Any

import logging

from app.core.providers.base import DownloadProvider

logger = logging.getLogger(__name__)


class HuggingFaceProvider(DownloadProvider):
    async def list_models(self) -> list[dict[str, Any]]:
        logger.warning("HuggingFaceProvider.list_models is not implemented")
        return []

    def get_model(self, identifier: str) -> dict[str, Any]:
        logger.warning("HuggingFaceProvider.get_model is not implemented")
        return {}

    def resolve_download_urls(self, model_id: str, version: str) -> list[dict[str, str]]:
        logger.warning("HuggingFaceProvider.resolve_download_urls is not implemented")
        return []

    def validate_credentials(self, provider_config: dict[str, Any]) -> bool:
        logger.warning("HuggingFaceProvider.validate_credentials is not implemented")
        return True

    def get_mirrors(self, url: str) -> list[str]:
        logger.warning("HuggingFaceProvider.get_mirrors is not implemented")
        return []
