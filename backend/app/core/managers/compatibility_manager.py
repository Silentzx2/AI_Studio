
import os
import platform
import shutil

try:
    import torch
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

class CompatibilityManager:
    def check_compatibility(self, manifest: dict) -> dict:
        results = {
            "compatible": True,
            "issues": [],
            "warnings": [],
            "system_info": {}
        }
        
        # CPU Architecture
        arch = platform.machine().lower()
        supported_archs = manifest.get("supported_architectures", ["x86_64"])
        # Normalize arm64/aarch64 equivalence
        if arch == "aarch64":
            arch = "arm64"
        if arch not in supported_archs:
            results["issues"].append(f"Unsupported architecture: {arch}. Required: {supported_archs}")
            results["compatible"] = False
            
        # OS
        current_os = platform.system().lower()
        supported_os = manifest.get("supported_os", ["linux", "windows", "darwin"])
        if current_os not in supported_os and current_os.replace('darwin', 'macos') not in supported_os:
            results["issues"].append(f"Unsupported OS: {current_os}. Required: {supported_os}")
            results["compatible"] = False
            
        # Disk Space
        min_disk_mb = manifest.get("disk_space_mb", 0)
        storage_path = os.environ.get("STORAGE_LOCAL_PATH", "./storage")
        if os.path.exists(storage_path):
            total, used, free = shutil.disk_usage(storage_path)
            free_mb = free // (1024 * 1024)
            if free_mb < min_disk_mb:
                results["issues"].append(f"Insufficient disk space. Need {min_disk_mb}MB, have {free_mb}MB.")
                results["compatible"] = False
        
        # GPU / CUDA
        cuda_required = manifest.get("cuda_required", False)
        if cuda_required:
            if not HAS_TORCH or not torch.cuda.is_available():
                results["issues"].append("CUDA is required but not available on this system.")
                results["compatible"] = False
            else:
                cuda_version = torch.version.cuda
                results["system_info"]["cuda_version"] = cuda_version
                
                min_vram_mb = manifest.get("min_vram_mb", 0)
                recommended_vram_mb = manifest.get("recommended_vram_mb", 0)
                
                max_free_vram_mb = 0
                for i in range(torch.cuda.device_count()):
                    free, total = torch.cuda.mem_get_info(i)
                    free_mb = free // (1024 * 1024)
                    max_free_vram_mb = max(max_free_vram_mb, free_mb)
                    
                if max_free_vram_mb < min_vram_mb:
                    results["issues"].append(f"Insufficient VRAM. Need {min_vram_mb}MB, have {max_free_vram_mb}MB free.")
                    results["compatible"] = False
                elif max_free_vram_mb < recommended_vram_mb:
                    results["warnings"].append(f"VRAM is below recommended {recommended_vram_mb}MB (have {max_free_vram_mb}MB).")

        return results
