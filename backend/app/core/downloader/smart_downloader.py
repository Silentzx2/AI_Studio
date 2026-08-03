
import hashlib
import os
from pathlib import Path

import aiohttp


class SmartDownloader:
    def __init__(self, chunk_size_mb: int = 10, max_concurrent_chunks: int = 4):
        self.chunk_size = chunk_size_mb * 1024 * 1024
        self.max_concurrent_chunks = max_concurrent_chunks

    async def download_file(self, 
                            url: str, 
                            destination: Path, 
                            mirrors: list[str] = [],
                            checksum: str | None = None,
                            progress_callback=None) -> bool:
        
        urls_to_try = [url] + mirrors
        
        for try_url in urls_to_try:
            try:
                success = await self._download_single(try_url, destination, progress_callback)
                if success:
                    if checksum:
                        valid = self.verify_checksum(destination, checksum)
                        if not valid:
                            os.remove(destination)
                            continue # Try next mirror
                    return True
            except Exception as e:
                print(f"Failed downloading from {try_url}: {e}")
                continue
                
        return False

    async def _download_single(self, url: str, destination: Path, progress_callback=None) -> bool:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                response.raise_for_status()
                total_size = int(response.headers.get('content-length', 0))
                
                downloaded = 0
                os.makedirs(destination.parent, exist_ok=True)
                
                with open(destination, 'wb') as f:
                    async for chunk in response.content.iter_chunked(1024 * 1024):
                        f.write(chunk)
                        downloaded += len(chunk)
                        if progress_callback and total_size:
                            progress_callback(downloaded, total_size)
                            
        return True

    def verify_checksum(self, filepath: Path, expected_checksum: str) -> bool:
        if expected_checksum.startswith("sha256:"):
            expected = expected_checksum.split("sha256:")[1]
            algo = hashlib.sha256()
        else:
            return True # Unknown algorithm
            
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                algo.update(chunk)
                
        return algo.hexdigest() == expected
