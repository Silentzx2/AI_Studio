"""CivitAI Download Provider for community models"""
from typing import Any

import aiohttp

from .base import DownloadProvider


class CivitAIProvider(DownloadProvider):
    """Download models from CivitAI (where licensing permits)"""
    
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key
        self.api_base = "https://api.civitai.com/v1"
        self.allowed_categories = [
            "Checkpoint",  # Base models
            "VAE",
            "LORA",
            "LyCORIS"
        ]
    
    async def list_models(self) -> list[dict[str, Any]]:
        """List available models from CivitAI"""
        models = []
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.api_base}/models"
                params = {
                    "limit": 100,
                    "sort": "mostDownloaded",
                    "types": ",".join(self.allowed_categories)
                }
                headers = {}
                if self.api_key:
                    headers["Authorization"] = f"Bearer {self.api_key}"
                
                async with session.get(url, params=params, headers=headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        for model in data.get("items", []):
                            if self._check_license(model):
                                models.append(self._parse_model(model))
        except Exception as e:
            print(f"Error listing CivitAI models: {e}")
        
        return models
    
    async def get_model(self, identifier: str) -> dict[str, Any]:
        """Get specific model info from CivitAI by ID or name"""
        try:
            async with aiohttp.ClientSession() as session:
                # Try as model ID first
                url = f"{self.api_base}/models/{identifier}"
                headers = {}
                if self.api_key:
                    headers["Authorization"] = f"Bearer {self.api_key}"
                
                async with session.get(url, headers=headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if self._check_license(data):
                            return self._parse_model(data)
                    elif resp.status == 404:
                        # Try searching by name
                        url = f"{self.api_base}/models"
                        params = {"query": identifier, "limit": 1}
                        async with session.get(url, params=params, headers=headers) as resp2:
                            if resp2.status == 200:
                                data = await resp2.json()
                                items = data.get("items", [])
                                if items and self._check_license(items[0]):
                                    return self._parse_model(items[0])
        except Exception as e:
            print(f"Error getting CivitAI model {identifier}: {e}")
        
        return {}
    
    async def resolve_download_urls(self, model_id: str, version: str) -> list[dict[str, str]]:
        """Resolve download URLs for model versions"""
        urls = []
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.api_base}/models/{model_id}/versions/{version}"
                headers = {}
                if self.api_key:
                    headers["Authorization"] = f"Bearer {self.api_key}"
                
                async with session.get(url, headers=headers) as resp:
                    if resp.status == 200:
                        version_data = await resp.json()
                        
                        # Extract download URLs from files
                        for file_info in version_data.get("files", []):
                            urls.append({
                                "url": file_info.get("downloadUrl"),
                                "filename": file_info.get("name"),
                                "size": file_info.get("sizeKb", 0) * 1024,
                                "format": file_info.get("type"),
                                "fp": file_info.get("fp")  # Precision (fp16, fp32, etc)
                            })
        except Exception as e:
            print(f"Error resolving CivitAI URLs: {e}")
        
        return urls
    
    async def validate_credentials(self, provider_config: dict[str, Any]) -> bool:
        """Validate CivitAI API key if provided"""
        if not provider_config.get("api_key"):
            # Public access always works
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(f"{self.api_base}/models", params={"limit": 1}) as resp:
                        return resp.status == 200
            except:
                return False
        
        # Validate API key
        api_key = provider_config["api_key"]
        try:
            async with aiohttp.ClientSession() as session:
                headers = {"Authorization": f"Bearer {api_key}"}
                async with session.get(f"{self.api_base}/user/account", headers=headers) as resp:
                    return resp.status == 200
        except:
            return False
    
    async def get_mirrors(self, url: str) -> list[str]:
        """CivitAI uses CDN, provide alternative endpoints"""
        mirrors = []
        if "civitai" in url:
            # Try direct download vs CDN
            if "cdn" not in url:
                mirrors.append(url.replace("civitai.com", "civitai-cdn.com"))
        return mirrors
    
    def _check_license(self, model_data: dict[str, Any]) -> bool:
        """Check if model has appropriate license for distribution"""
        allowed_licenses = [
            "Openrail",
            "CreativeML Open RAIL",
            "WTFPL",
            "CC0",
            "CC BY",
            "CC BY-SA",
            "Public Domain"
        ]
        
        license_name = model_data.get("license", "").get("name", "")
        if not license_name:
            return True  # Default to allowing if no license specified
        
        return any(lic in license_name for lic in allowed_licenses)
    
    def _parse_model(self, model_data: dict[str, Any]) -> dict[str, Any]:
        """Parse CivitAI model data into standard format"""
        return {
            "id": str(model_data.get("id", "")),
            "name": model_data.get("name", ""),
            "description": model_data.get("description", ""),
            "author": model_data.get("creator", {}).get("username", "Unknown"),
            "downloads": model_data.get("stats", {}).get("downloadCount", 0),
            "rating": model_data.get("stats", {}).get("rating", 0),
            "versions": [
                {
                    "id": v.get("id"),
                    "name": v.get("name"),
                    "created": v.get("createdAt"),
                    "files_count": len(v.get("files", []))
                }
                for v in model_data.get("modelVersions", [])
            ],
            "latest_version": model_data.get("modelVersions", [{}])[0].get("id") if model_data.get("modelVersions") else None,
            "license": model_data.get("license", {}).get("name", "Unknown"),
            "tags": [t.get("name") for t in model_data.get("tags", [])]
        }
