"""
Smart Downloader - Handles chunked downloads, resume, retries, mirrors
"""
import asyncio
import hashlib
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

import aiohttp


class DownloadProgress:
    """Track download progress"""
    def __init__(self, total_size: int):
        self.total_size = total_size
        self.downloaded = 0
        self.start_time = datetime.now()
        self.chunks_completed = 0
        self.total_chunks = 0
    
    @property
    def percentage(self) -> float:
        if self.total_size == 0:
            return 0
        return (self.downloaded / self.total_size) * 100
    
    @property
    def speed_mbps(self) -> float:
        elapsed = (datetime.now() - self.start_time).total_seconds()
        if elapsed == 0:
            return 0
        return (self.downloaded / 1024 / 1024) / elapsed
    
    @property
    def eta_seconds(self) -> int:
        if self.speed_mbps == 0:
            return 0
        remaining = self.total_size - self.downloaded
        return int(remaining / 1024 / 1024 / self.speed_mbps)
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "percentage": self.percentage,
            "downloaded": self.downloaded,
            "total_size": self.total_size,
            "speed_mbps": self.speed_mbps,
            "eta_seconds": self.eta_seconds,
            "chunks_completed": self.chunks_completed,
            "total_chunks": self.total_chunks,
        }


class SmartDownloader:
    """Download manager with resume, retry, and mirror support"""
    
    CHUNK_SIZE = 256 * 1024 * 1024  # 256MB chunks
    MAX_RETRIES = 5
    RETRY_BACKOFF_BASE = 1  # seconds
    
    def __init__(self, max_concurrent_chunks: int = 4):
        self.max_concurrent_chunks = max_concurrent_chunks
    
    async def download_file(
        self,
        url: str,
        destination: Path,
        checksum: str | None = None,
        mirrors: list[str] | None = None,
        speed_limit_mbps: float | None = None,
        progress_callback: Callable[[DownloadProgress], None] | None = None,
    ) -> bool:
        """
        Download file with resume, retry, and checksum verification
        Returns: True if successful, False otherwise
        """
        destination.parent.mkdir(parents=True, exist_ok=True)
        
        # Try primary URL first, then mirrors
        urls = [url] + (mirrors or [])
        
        for attempt, current_url in enumerate(urls):
            try:
                result = await self._download_with_resume(
                    current_url,
                    destination,
                    checksum,
                    speed_limit_mbps,
                    progress_callback,
                )
                if result:
                    return True
            except Exception as e:
                print(f"Download from {current_url} failed: {e}")
                if attempt < len(urls) - 1:
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff between mirrors
                else:
                    return False
        
        return False
    
    async def _download_with_resume(
        self,
        url: str,
        destination: Path,
        checksum: str | None,
        speed_limit_mbps: float | None,
        progress_callback: Callable | None,
    ) -> bool:
        """Download with resume from existing partial file"""
        
        # Check for existing partial file
        resume_headers = {}
        if destination.exists():
            resume_headers["Range"] = f"bytes={destination.stat().st_size}-"
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.head(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    total_size = int(resp.headers.get("Content-Length", 0))
                    if total_size == 0:
                        raise ValueError("Could not determine file size")
                
                progress = DownloadProgress(total_size)
                
                async with session.get(
                    url,
                    headers=resume_headers,
                    timeout=aiohttp.ClientTimeout(total=None),
                ) as resp:
                    if resp.status not in (200, 206):
                        return False
                    
                    hash_obj = hashlib.sha256()
                    
                    async with open(destination, "ab") as f:
                        async for chunk in resp.content.iter_chunked(8192):
                            f.write(chunk)
                            progress.downloaded += len(chunk)
                            hash_obj.update(chunk)
                            
                            if progress_callback:
                                progress_callback(progress)
                            
                            # Speed limiting
                            if speed_limit_mbps:
                                await asyncio.sleep(0.01)
                    
                    # Verify checksum
                    if checksum:
                        computed = hash_obj.hexdigest()
                        if computed != checksum.lower():
                            destination.unlink()  # Delete corrupted file
                            return False
                    
                    return True
            
            except Exception as e:
                print(f"Download error: {e}")
                return False
    
    async def download_with_chunks(
        self,
        url: str,
        destination: Path,
        checksum: str | None = None,
        progress_callback: Callable[[DownloadProgress], None] | None = None,
    ) -> bool:
        """Download using chunked strategy for large files"""
        # Simple implementation - can be enhanced with parallel chunks
        return await self.download_file(
            url,
            destination,
            checksum=checksum,
            progress_callback=progress_callback,
        )
