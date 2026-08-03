"""NVIDIA NGC (GPU Cloud) Download Provider"""
from typing import Any

import aiohttp

from .base import DownloadProvider


class NVIDIANGCProvider(DownloadProvider):
    """Download models from NVIDIA NGC (proprietary ML models)"""
    
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key
        self.api_base = "https://api.ngc.nvidia.com"
        self.org_team = "nvidia"  # Default to NVIDIA org
    
    async def list_models(self) -> list[dict[str, Any]]:
        """List available models from NVIDIA NGC"""
        models = []
        if not self.api_key:
            return models  # Requires authentication
        
        try:
            async with aiohttp.ClientSession() as session:
                headers = self._get_auth_headers()
                
                # Query NGC catalog for 3D generation models
                url = f"{self.api_base}/catalog/models"
                params = {
                    "org_team": self.org_team,
                    "tags": "3d-generation",
                    "limit": 50
                }
                
                async with session.get(url, headers=headers, params=params) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        models = [self._parse_model(m) for m in data.get("models", [])]
        except Exception as e:
            print(f"Error listing NVIDIA NGC models: {e}")
        
        return models
    
    async def get_model(self, identifier: str) -> dict[str, Any]:
        """Get specific model info from NVIDIA NGC
        
        identifier format: "org_team/model_name"
        """
        if not self.api_key:
            return {}
        
        try:
            async with aiohttp.ClientSession() as session:
                headers = self._get_auth_headers()
                
                url = f"{self.api_base}/catalog/models/{identifier}"
                async with session.get(url, headers=headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return self._parse_model(data)
        except Exception as e:
            print(f"Error getting NVIDIA NGC model {identifier}: {e}")
        
        return {}
    
    async def resolve_download_urls(self, model_id: str, version: str) -> list[dict[str, str]]:
        """Resolve download URLs for model weights"""
        urls = []
        if not self.api_key:
            return urls
        
        try:
            async with aiohttp.ClientSession() as session:
                headers = self._get_auth_headers()
                
                # Get model versions and weights
                url = f"{self.api_base}/catalog/models/{model_id}/versions/{version}/files"
                
                async with session.get(url, headers=headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        for file_info in data.get("files", []):
                            urls.append({
                                "url": file_info.get("download_url"),
                                "filename": file_info.get("filename"),
                                "size": file_info.get("size", 0),
                                "checksum": file_info.get("checksum")
                            })
        except Exception as e:
            print(f"Error resolving NVIDIA NGC URLs: {e}")
        
        return urls
    
    async def validate_credentials(self, provider_config: dict[str, Any]) -> bool:
        """Validate NVIDIA API key"""
        api_key = provider_config.get("api_key")
        if not api_key:
            return False
        
        try:
            async with aiohttp.ClientSession() as session:
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Accept": "application/json"
                }
                async with session.get(
                    f"{self.api_base}/auth/validate",
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    return resp.status == 200
        except:
            return False
    
    async def get_mirrors(self, url: str) -> list[str]:
        """NVIDIA NGC models have regional endpoints"""
        mirrors = []
        # NGC has regional endpoints
        regions = ["us-east", "eu-west", "ap-southeast"]
        for region in regions:
            if "ngc.nvidia.com" in url:
                mirror_url = url.replace("api.ngc.nvidia.com", f"{region}.ngc.nvidia.com")
                if mirror_url != url:
                    mirrors.append(mirror_url)
        return mirrors
    
    def _get_auth_headers(self) -> dict[str, str]:
        """Get authentication headers for NVIDIA NGC"""
        if not self.api_key:
            return {}
        
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json"
        }
    
    def _parse_model(self, model_data: dict[str, Any]) -> dict[str, Any]:
        """Parse NVIDIA NGC model data into standard format"""
        return {
            "id": model_data.get("model_id", ""),
            "name": model_data.get("name", ""),
            "description": model_data.get("description", ""),
            "author": "NVIDIA",
            "versions": model_data.get("versions", []),
            "license": model_data.get("license", "Proprietary"),
            "requirements": model_data.get("requirements", {}),
            "latest_version": model_data.get("latest_version", ""),
            "tags": model_data.get("tags", [])
        }
