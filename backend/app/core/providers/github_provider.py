"""GitHub Release Download Provider"""
from typing import Any

import aiohttp

from .base import DownloadProvider


class GitHubProvider(DownloadProvider):
    """Download models from GitHub releases"""
    
    def __init__(self, github_token: str | None = None):
        self.github_token = github_token
        self.api_base = "https://api.github.com"
        self.headers = {
            "Accept": "application/vnd.github.v3+json",
        }
        if github_token:
            self.headers["Authorization"] = f"token {github_token}"
    
    async def list_models(self) -> list[dict[str, Any]]:
        """List available models from curated GitHub repositories"""
        # This would connect to a registry of AI model repositories
        models = []
        # In production, fetch from a registry of known model repos
        return models
    
    async def get_model(self, identifier: str) -> dict[str, Any]:
        """Get specific model info from GitHub repo
        
        identifier format: "owner/repo" or "owner/repo@tag"
        """
        if "@" in identifier:
            repo_path, tag = identifier.split("@")
        else:
            repo_path = identifier
            tag = None
        
        async with aiohttp.ClientSession() as session:
            # Get latest release or specific tag
            if tag:
                url = f"{self.api_base}/repos/{repo_path}/releases/tags/{tag}"
            else:
                url = f"{self.api_base}/repos/{repo_path}/releases/latest"
            
            async with session.get(url, headers=self.headers) as resp:
                if resp.status == 200:
                    release = await resp.json()
                    return self._parse_release(repo_path, release)
        
        return {}
    
    async def resolve_download_urls(self, model_id: str, version: str) -> list[dict[str, str]]:
        """Resolve download URLs for model assets"""
        urls = []
        repo_path = model_id.split("@")[0]
        
        async with aiohttp.ClientSession() as session:
            url = f"{self.api_base}/repos/{repo_path}/releases/tags/{version}"
            async with session.get(url, headers=self.headers) as resp:
                if resp.status == 200:
                    release = await resp.json()
                    for asset in release.get("assets", []):
                        urls.append({
                            "url": asset["browser_download_url"],
                            "filename": asset["name"],
                            "size": asset["size"],
                            "content_type": asset["content_type"]
                        })
        
        return urls
    
    async def validate_credentials(self, provider_config: dict[str, Any]) -> bool:
        """Validate GitHub token if provided"""
        if not provider_config.get("github_token"):
            return True  # Public access always works
        
        token = provider_config["github_token"]
        headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{self.api_base}/user", headers=headers) as resp:
                return resp.status == 200
    
    async def get_mirrors(self, url: str) -> list[str]:
        """GitHub doesn't have official mirrors, return empty"""
        return []
    
    def _parse_release(self, repo_path: str, release: dict[str, Any]) -> dict[str, Any]:
        """Parse GitHub release into model info"""
        return {
            "id": repo_path,
            "name": release.get("name", repo_path),
            "version": release.get("tag_name", "latest"),
            "description": release.get("body", ""),
            "download_url": release.get("assets", [{}])[0].get("browser_download_url"),
            "size": sum(a.get("size", 0) for a in release.get("assets", [])),
            "assets": [
                {
                    "name": a["name"],
                    "url": a["browser_download_url"],
                    "size": a["size"]
                }
                for a in release.get("assets", [])
            ]
        }
