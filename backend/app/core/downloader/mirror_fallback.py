"""Mirror fallback system for reliable downloads"""
from pathlib import Path


class MirrorFallback:
    """Manages fallback to mirror URLs on download failure"""
    
    def __init__(self):
        self.mirror_registry = {
            "huggingface": self._get_hf_mirrors,
            "github": self._get_github_mirrors,
            "modelscope": self._get_modelscope_mirrors,
            "civitai": self._get_civitai_mirrors
        }
    
    async def find_working_url(
        self,
        primary_url: str,
        mirrors: list[str],
        timeout: int = 30
    ) -> str | None:
        """Find the first working URL from primary and mirrors"""
        
        urls_to_try = [primary_url] + mirrors
        
        for url in urls_to_try:
            if await self._test_url(url, timeout):
                return url
        
        return None
    
    async def _test_url(self, url: str, timeout: int) -> bool:
        """Test if URL is accessible"""
        import aiohttp
        
        try:
            async with aiohttp.ClientSession() as session, session.head(
                url,
                timeout=aiohttp.ClientTimeout(total=timeout),
                allow_redirects=True
            ) as resp:
                return resp.status < 400
        except:
            return False
    
    def get_mirrors_for_url(self, url: str) -> list[str]:
        """Get alternative mirrors for a URL"""
        
        for provider, mirror_func in self.mirror_registry.items():
            if provider in url:
                return mirror_func(url)
        
        return []
    
    def _get_hf_mirrors(self, url: str) -> list[str]:
        """Get Hugging Face mirrors"""
        mirrors = []
        
        # Official CDN mirrors
        if "huggingface.co" in url:
            # Chinese mirror
            mirrors.append(url.replace("huggingface.co", "hf-mirror.com"))
            # Alternative CDN
            mirrors.append(url.replace("huggingface.co", "hf.co"))
        
        return mirrors
    
    def _get_github_mirrors(self, url: str) -> list[str]:
        """Get GitHub mirrors"""
        mirrors = []
        
        if "github.com" in url or "raw.githubusercontent.com" in url:
            # GitHub proxy mirrors
            proxies = [
                "ghproxy.com",
                "jsdelivr.net",
                "raw.fastgit.org"
            ]
            
            for proxy in proxies:
                mirror = url.replace("github.com", f"{proxy}/github.com")
                mirror = mirror.replace("raw.githubusercontent.com", f"{proxy}/raw.githubusercontent.com")
                mirrors.append(mirror)
        
        return mirrors
    
    def _get_modelscope_mirrors(self, url: str) -> list[str]:
        """Get ModelScope mirrors"""
        mirrors = []
        
        if "modelscope" in url:
            # Try Hugging Face mirror for some models
            mirrors.append(url.replace("modelscope.cn", "huggingface.co"))
        
        return mirrors
    
    def _get_civitai_mirrors(self, url: str) -> list[str]:
        """Get CivitAI mirrors"""
        mirrors = []
        
        if "civitai" in url:
            # CDN variant
            if "cdn" not in url:
                mirrors.append(url.replace("civitai.com", "civitai-cdn.com"))
        
        return mirrors
    
    async def download_with_fallback(
        self,
        primary_url: str,
        output_path: Path,
        downloader,
        max_retries: int = 3,
        timeout: int = 30
    ) -> bool:
        """Download with automatic fallback to mirrors"""
        
        mirrors = self.get_mirrors_for_url(primary_url)
        urls_to_try = [primary_url] + mirrors
        
        for attempt, url in enumerate(urls_to_try):
            if attempt >= max_retries:
                break
            
            try:
                # Test URL first
                if not await self._test_url(url, timeout):
                    continue
                
                # Attempt download
                result = await downloader.download_with_resume(url, output_path)
                if result:
                    return True
                
            except Exception as e:
                print(f"Failed to download from {url}: {e}")
                continue
        
        return False
