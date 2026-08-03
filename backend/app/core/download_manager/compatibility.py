"""
System Compatibility Checker - Validates if system meets model requirements
"""
import platform
import shutil

import psutil
import torch
from pydantic import BaseModel


class CompatibilityResult(BaseModel):
    """Compatibility check result"""
    is_compatible: bool
    warnings: list[str] = []
    errors: list[str] = []
    recommendations: list[str] = []
    metadata: dict[str, any] = {}


class CompatibilityChecker:
    """Check system compatibility with model requirements"""
    
    @staticmethod
    def check_gpu() -> tuple[bool, str, int, int]:
        """
        Check GPU availability
        Returns: (has_cuda, gpu_name, count, vram_mb)
        """
        if not torch.cuda.is_available():
            return False, "", 0, 0
        
        gpu_name = torch.cuda.get_device_name(0)
        gpu_count = torch.cuda.device_count()
        vram_mb = torch.cuda.get_device_properties(0).total_memory // (1024 * 1024)
        
        return True, gpu_name, gpu_count, vram_mb
    
    @staticmethod
    def check_vram() -> int:
        """Get available VRAM in MB"""
        if not torch.cuda.is_available():
            return 0
        return torch.cuda.mem_get_info()[0] // (1024 * 1024)
    
    @staticmethod
    def check_python_version() -> str:
        """Get Python version"""
        return f"{platform.python_version()}"
    
    @staticmethod
    def check_os() -> str:
        """Get OS name"""
        return platform.system().lower()
    
    @staticmethod
    def check_architecture() -> str:
        """Get CPU architecture"""
        machine = platform.machine()
        if machine == "AMD64":
            return "x86_64"
        elif machine == "aarch64":
            return "arm64"
        return machine.lower()
    
    @staticmethod
    def check_disk_space(path: str = "./storage") -> int:
        """Get available disk space in MB"""
        try:
            stat = shutil.disk_usage(path)
            return stat.free // (1024 * 1024)
        except:
            return 0
    
    @staticmethod
    def check_system_ram() -> tuple[int, int]:
        """Get total and available system RAM in MB"""
        mem = psutil.virtual_memory()
        total_mb = mem.total // (1024 * 1024)
        available_mb = mem.available // (1024 * 1024)
        return total_mb, available_mb
    
    @staticmethod
    def check_cuda_version() -> str:
        """Get CUDA version"""
        if torch.cuda.is_available():
            return torch.version.cuda or "unknown"
        return "N/A"
    
    @staticmethod
    def check_command_exists(command: str) -> bool:
        """Check if system command exists"""
        return shutil.which(command) is not None
    
    @classmethod
    def full_check(
        cls,
        min_vram_mb: int,
        recommended_vram_mb: int,
        cuda_required: bool,
        cuda_min_version: str,
        python_min: str,
        supported_os: list[str],
        supported_architectures: list[str],
        disk_space_mb: int,
        required_commands: list[str] = None,
    ) -> CompatibilityResult:
        """Run comprehensive compatibility check"""
        
        errors = []
        warnings = []
        recommendations = []
        metadata = {}
        
        # GPU Check
        has_cuda, gpu_name, gpu_count, total_vram = cls.check_gpu()
        available_vram = cls.check_vram()
        
        metadata["has_cuda"] = has_cuda
        metadata["gpu_name"] = gpu_name
        metadata["gpu_count"] = gpu_count
        metadata["total_vram_mb"] = total_vram
        metadata["available_vram_mb"] = available_vram
        
        if cuda_required and not has_cuda:
            errors.append("CUDA not available - this model requires NVIDIA GPU")
        
        if has_cuda and available_vram < min_vram_mb:
            errors.append(
                f"Insufficient VRAM: need {min_vram_mb}MB, have {available_vram}MB"
            )
        
        if has_cuda and available_vram < recommended_vram_mb:
            warnings.append(
                f"Below recommended VRAM: recommended {recommended_vram_mb}MB, "
                f"have {available_vram}MB (model may be slower)"
            )
        
        # Python Check
        python_version = cls.check_python_version()
        metadata["python_version"] = python_version
        
        if not cls._version_meets_requirement(python_version, python_min):
            errors.append(f"Python version too old: need {python_min}, have {python_version}")
        
        # OS Check
        current_os = cls.check_os()
        metadata["os"] = current_os
        
        if current_os not in supported_os:
            errors.append(f"Unsupported OS: {current_os}, supported: {supported_os}")
        
        # Architecture Check
        arch = cls.check_architecture()
        metadata["architecture"] = arch
        
        if arch not in supported_architectures:
            errors.append(f"Unsupported architecture: {arch}, supported: {supported_architectures}")
        
        # Disk Space Check
        available_disk = cls.check_disk_space()
        metadata["available_disk_mb"] = available_disk
        
        if available_disk < disk_space_mb:
            errors.append(
                f"Insufficient disk space: need {disk_space_mb}MB, have {available_disk}MB"
            )
        
        # RAM Check
        total_ram, available_ram = cls.check_system_ram()
        metadata["total_ram_mb"] = total_ram
        metadata["available_ram_mb"] = available_ram
        
        if available_ram < 2048:  # Less than 2GB
            warnings.append(f"Low system RAM: only {available_ram}MB available")
        
        # CUDA Version Check
        if has_cuda:
            cuda_version = cls.check_cuda_version()
            metadata["cuda_version"] = cuda_version
            
            if not cls._version_meets_requirement(cuda_version, cuda_min_version):
                warnings.append(
                    f"CUDA version may be too old: recommended {cuda_min_version}, have {cuda_version}"
                )
        
        # System Commands Check
        if required_commands:
            for cmd in required_commands:
                if not cls.check_command_exists(cmd):
                    warnings.append(f"System command not found: {cmd}")
        
        # Generate recommendations
        if errors or warnings:
            if available_vram < recommended_vram_mb:
                recommendations.append(
                    "Consider using a lower quality setting or smaller model variant"
                )
            
            if available_disk < disk_space_mb * 1.5:
                recommendations.append("Consider freeing up disk space or using external storage")
        
        is_compatible = len(errors) == 0
        
        return CompatibilityResult(
            is_compatible=is_compatible,
            warnings=warnings,
            errors=errors,
            recommendations=recommendations,
            metadata=metadata,
        )
    
    @staticmethod
    def _version_meets_requirement(current: str, required: str) -> bool:
        """Check if current version meets requirement"""
        try:
            current_parts = [int(x) for x in current.split(".")[:3]]
            required_parts = [int(x) for x in required.split(".")[:3]]
            
            for i in range(3):
                curr = current_parts[i] if i < len(current_parts) else 0
                req = required_parts[i] if i < len(required_parts) else 0
                
                if curr > req:
                    return True
                elif curr < req:
                    return False
            
            return True
        except:
            return True  # Assume compatible if can't parse
