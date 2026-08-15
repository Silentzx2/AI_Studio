"""ModelScope (DAMO-VISL) Download Provider"""
import logging
from typing import Any

import aiohttp

from .base import DownloadProvider

logger = logging.getLogger(__name__)


class ModelScopeProvider(DownloadProvider):
    """Download models from ModelScope (Alibaba DAMO-VISL)"""

    def __init__(self):
        self.api_base = "https://modelscope.cn/api"
        self.download_base = "https://modelscope.cn"

    async def list_models(self) -> list[dict[str, Any]]:
        """List available models from ModelScope"""
        models = []
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.api_base}/models"
                params = {
                    "tags": "3d-generation",
                    "sort_by": "download_count",
                    "limit": 50
                }
                async with session.get(url, params=params) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        models = [self._parse_model(m) for m in data.get("models", [])]
        except Exception as e:
            logger.error("Error listing ModelScope models: %s", e)

        return models

    async def get_model(self, identifier: str) -> dict[str, Any]:
        """Get specific model info from ModelScope

        identifier format: "namespace/model_name" e.g., "damo/cv_div-hsnet_image-depth-estimation"
        """
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.api_base}/models/{identifier}"
                async with session.get(url) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return self._parse_model(data)
        except Exception as e:
            logger.error("Error getting ModelScope model %s: %s", identifier, e)

        return {}

    async def resolve_download_urls(self, model_id: str, version: str) -> list[dict[str, str]]:
        """Resolve download URLs for model files"""
        urls = []
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.api_base}/models/{model_id}/files"
                params = {"revision": version}

                async with session.get(url, params=params) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        for file in data.get("files", []):
                            urls.append({
                                "url": f"{self.download_base}/api/v1/models/{model_id}/repo/raw/{file['path']}",
                                "filename": file["path"].split("/")[-1],
                                "size": file.get("size", 0),
                                "path": file["path"]
                            })
        except Exception as e:
            logger.error("Error resolving ModelScope URLs for %s: %s", model_id, e)

        return urls

    async def validate_credentials(self, provider_config: dict[str, Any]) -> bool:
        """ModelScope doesn't require authentication for public models"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.api_base}/models", timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    return resp.status == 200
        except Exception:
            return False

    async def get_mirrors(self, url: str) -> list[str]:
        """Provide alternative mirrors for ModelScope downloads"""
        mirrors = []
        if "modelscope" in url:
            mirrors.append(url.replace("modelscope.cn", "huggingface.co"))
        return [m for m in mirrors if m != url]

    def _parse_model(self, model_data: dict[str, Any]) -> dict[str, Any]:
        """Parse ModelScope model data into standard format"""
        return {
            "id": model_data.get("model_id", ""),
            "name": model_data.get("model_name", ""),
            "description": model_data.get("description", ""),
            "author": model_data.get("creator", ""),
            "downloads": model_data.get("download_count", 0),
            "likes": model_data.get("like_count", 0),
            "tasks": model_data.get("tags", []),
            "repo_url": f"{self.download_base}/models/{model_data.get('model_id', '')}",
            "license": model_data.get("license", "Unknown")
        }
