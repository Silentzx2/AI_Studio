"""Checksum validator for download integrity verification"""
import asyncio
import hashlib
from pathlib import Path


class ChecksumValidator:
    """Validates file integrity using checksums"""
    
    SUPPORTED_ALGORITHMS = {"md5", "sha1", "sha256", "sha512"}
    
    @staticmethod
    async def calculate_checksum(
        filepath: Path,
        algorithm: str = "sha256",
        chunk_size: int = 8192
    ) -> str:
        """Calculate checksum of a file"""
        
        if algorithm not in ChecksumValidator.SUPPORTED_ALGORITHMS:
            raise ValueError(f"Unsupported algorithm: {algorithm}")
        
        hasher = hashlib.new(algorithm)
        
        def read_in_chunks():
            with open(filepath, "rb") as f:
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
        
        # Calculate checksum in background
        loop = asyncio.get_event_loop()
        
        def calculate():
            for chunk in read_in_chunks():
                hasher.update(chunk)
            return hasher.hexdigest()
        
        checksum = await loop.run_in_executor(None, calculate)
        return checksum
    
    @staticmethod
    async def verify_checksum(
        filepath: Path,
        expected_checksum: str,
        algorithm: str = "sha256"
    ) -> tuple[bool, str]:
        """Verify file checksum"""
        
        actual_checksum = await ChecksumValidator.calculate_checksum(
            filepath,
            algorithm
        )
        
        is_valid = actual_checksum.lower() == expected_checksum.lower()
        
        return is_valid, actual_checksum
    
    @staticmethod
    async def verify_multiple(
        filepaths: dict[Path, str],
        algorithm: str = "sha256"
    ) -> dict[Path, tuple[bool, str]]:
        """Verify multiple file checksums"""
        
        tasks = [
            ChecksumValidator.verify_checksum(path, checksum, algorithm)
            for path, checksum in filepaths.items()
        ]
        
        results = await asyncio.gather(*tasks)
        
        return {
            path: result
            for path, result in zip(filepaths.keys(), results)
        }
    
    @staticmethod
    def detect_algorithm(checksum: str) -> str | None:
        """Detect checksum algorithm based on length"""
        
        length_to_algo = {
            32: "md5",
            40: "sha1",
            64: "sha256",
            128: "sha512"
        }
        
        return length_to_algo.get(len(checksum.strip()))
    
    @staticmethod
    async def create_checksum_file(
        filepath: Path,
        algorithms: list = None
    ) -> dict[str, str]:
        """Create checksum file for a model file"""
        
        if algorithms is None:
            algorithms = ["sha256", "md5"]
        
        checksums = {}
        
        for algo in algorithms:
            if algo in ChecksumValidator.SUPPORTED_ALGORITHMS:
                checksums[algo] = await ChecksumValidator.calculate_checksum(
                    filepath,
                    algo
                )
        
        return checksums
    
    @staticmethod
    async def verify_with_auto_detect(
        filepath: Path,
        expected_checksum: str
    ) -> tuple[bool, str, str]:
        """Verify checksum with automatic algorithm detection"""
        
        algorithm = ChecksumValidator.detect_algorithm(expected_checksum)
        
        if not algorithm:
            raise ValueError(f"Cannot determine checksum algorithm for: {expected_checksum}")
        
        is_valid, actual = await ChecksumValidator.verify_checksum(
            filepath,
            expected_checksum,
            algorithm
        )
        
        return is_valid, actual, algorithm


class ManifestChecksumValidator:
    """Validates checksums from manifest files"""
    
    @staticmethod
    async def verify_manifest_checksums(
        download_dir: Path,
        checksums: dict[str, str]
    ) -> dict[str, tuple[bool, str]]:
        """Verify all files listed in manifest checksums"""
        
        results = {}
        
        for filename, expected_checksum in checksums.items():
            filepath = download_dir / filename
            
            if not filepath.exists():
                results[filename] = (False, f"File not found: {filepath}")
                continue
            
            # Auto-detect algorithm
            algorithm = ChecksumValidator.detect_algorithm(expected_checksum)
            if not algorithm:
                results[filename] = (False, f"Unknown checksum format: {expected_checksum}")
                continue
            
            try:
                is_valid, actual = await ChecksumValidator.verify_checksum(
                    filepath,
                    expected_checksum,
                    algorithm
                )
                results[filename] = (is_valid, actual if not is_valid else "Valid")
            except Exception as e:
                results[filename] = (False, str(e))
        
        return results
    
    @staticmethod
    async def generate_manifest_checksums(
        download_dir: Path,
        files: list = None,
        algorithms: list = None
    ) -> dict[str, dict[str, str]]:
        """Generate checksums for all files in a directory"""
        
        if algorithms is None:
            algorithms = ["sha256"]
        
        if files is None:
            files = [f for f in download_dir.glob("*") if f.is_file()]
        
        manifest = {}
        
        for filepath in files:
            if isinstance(filepath, str):
                filepath = Path(filepath)
            
            if not filepath.exists():
                continue
            
            checksums = await ChecksumValidator.create_checksum_file(filepath, algorithms)
            manifest[filepath.name] = checksums
        
        return manifest
