"""Chunk manager for resumable downloads"""
import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

import aiohttp


class ChunkManager:
    """Manages chunked downloads with resume capability"""
    
    def __init__(self, storage_path: str, chunk_size: int = 5 * 1024 * 1024):
        self.storage_path = Path(storage_path)
        self.chunk_size = chunk_size
        self.metadata_file = self.storage_path / ".chunk_metadata.json"
    
    async def download_with_resume(
        self,
        url: str,
        output_path: Path,
        total_size: int | None = None,
        progress_callback: Callable | None = None,
        max_retries: int = 3
    ) -> bool:
        """Download file with resume capability"""
        
        # Load existing metadata if available
        metadata = self._load_metadata(str(output_path))
        
        if metadata and output_path.exists():
            downloaded_size = output_path.stat().st_size
            if total_size and downloaded_size >= total_size:
                return True  # Already downloaded
        else:
            downloaded_size = 0
        
        headers = {}
        if downloaded_size > 0:
            headers["Range"] = f"bytes={downloaded_size}-"
        
        retries = 0
        while retries < max_retries:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, headers=headers) as resp:
                        if resp.status not in (200, 206):
                            retries += 1
                            await asyncio.sleep(2 ** retries)
                            continue
                        
                        # Get total size if not provided
                        if not total_size:
                            content_length = resp.headers.get("Content-Length")
                            if content_length:
                                total_size = int(content_length) + downloaded_size
                        
                        # Write in chunks
                        mode = "ab" if downloaded_size > 0 else "wb"
                        with open(output_path, mode) as f:
                            async for chunk in resp.content.iter_chunked(self.chunk_size):
                                if chunk:
                                    f.write(chunk)
                                    downloaded_size += len(chunk)
                                    
                                    if progress_callback:
                                        progress = {
                                            "downloaded": downloaded_size,
                                            "total": total_size,
                                            "percent": (downloaded_size / total_size * 100) if total_size else 0
                                        }
                                        await progress_callback(progress)
                        
                        # Save metadata
                        self._save_metadata(str(output_path), {
                            "url": url,
                            "size": total_size,
                            "downloaded": downloaded_size,
                            "complete": downloaded_size >= total_size if total_size else True,
                            "timestamp": datetime.now().isoformat()
                        })
                        
                        return True
                        
            except asyncio.TimeoutError:
                retries += 1
                await asyncio.sleep(2 ** retries)
            except Exception as e:
                print(f"Download error: {e}")
                retries += 1
                if retries < max_retries:
                    await asyncio.sleep(2 ** retries)
        
        return False
    
    async def parallel_chunk_download(
        self,
        url: str,
        output_path: Path,
        num_chunks: int = 4,
        progress_callback: Callable | None = None
    ) -> bool:
        """Download file in parallel chunks"""
        
        try:
            async with aiohttp.ClientSession() as session:
                # Get file size
                async with session.head(url) as resp:
                    total_size = int(resp.headers.get("Content-Length", 0))
                    supports_range = resp.headers.get("Accept-Ranges") == "bytes"
            
            if not supports_range or total_size == 0:
                # Fallback to regular download
                return await self.download_with_resume(url, output_path, total_size, progress_callback)
            
            # Calculate chunk boundaries
            chunk_size = total_size // num_chunks
            chunks = []
            for i in range(num_chunks):
                start = i * chunk_size
                end = start + chunk_size if i < num_chunks - 1 else total_size - 1
                chunks.append((i, start, end))
            
            # Download chunks in parallel
            tasks = [
                self._download_chunk(url, output_path, i, start, end, total_size, progress_callback)
                for i, start, end in chunks
            ]
            
            results = await asyncio.gather(*tasks)
            
            if all(results):
                self._save_metadata(str(output_path), {
                    "complete": True,
                    "size": total_size,
                    "timestamp": datetime.now().isoformat()
                })
                return True
            
            return False
            
        except Exception as e:
            print(f"Parallel download error: {e}")
            return False
    
    async def _download_chunk(
        self,
        url: str,
        output_path: Path,
        chunk_id: int,
        start: int,
        end: int,
        total_size: int,
        progress_callback: Callable | None
    ) -> bool:
        """Download a single chunk"""
        
        try:
            headers = {
                "Range": f"bytes={start}-{end}"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers) as resp:
                    if resp.status == 206:
                        chunk_path = Path(f"{output_path}.part{chunk_id}")
                        with open(chunk_path, "wb") as f:
                            async for chunk in resp.content.iter_chunked(1024 * 1024):
                                if chunk:
                                    f.write(chunk)
                        
                        if progress_callback:
                            await progress_callback({
                                "chunk": chunk_id,
                                "downloaded": end - start + 1
                            })
                        
                        return True
            
            return False
            
        except Exception as e:
            print(f"Chunk {chunk_id} download error: {e}")
            return False
    
    def _load_metadata(self, filepath: str) -> dict[str, Any] | None:
        """Load download metadata"""
        try:
            if self.metadata_file.exists():
                with open(self.metadata_file) as f:
                    all_metadata = json.load(f)
                    return all_metadata.get(filepath)
        except:
            pass
        return None
    
    def _save_metadata(self, filepath: str, metadata: dict[str, Any]):
        """Save download metadata"""
        try:
            all_metadata = {}
            if self.metadata_file.exists():
                with open(self.metadata_file) as f:
                    all_metadata = json.load(f)
            
            all_metadata[filepath] = metadata
            
            with open(self.metadata_file, "w") as f:
                json.dump(all_metadata, f, indent=2)
        except Exception as e:
            print(f"Error saving metadata: {e}")
    
    def cleanup_partial_downloads(self, output_path: Path):
        """Clean up partial chunk files"""
        try:
            # Remove .part files
            for part_file in output_path.parent.glob(f"{output_path.name}.part*"):
                part_file.unlink()
            
            # Clean metadata
            if self.metadata_file.exists():
                with open(self.metadata_file) as f:
                    all_metadata = json.load(f)
                
                if str(output_path) in all_metadata:
                    del all_metadata[str(output_path)]
                
                with open(self.metadata_file, "w") as f:
                    json.dump(all_metadata, f, indent=2)
        except Exception as e:
            print(f"Cleanup error: {e}")
