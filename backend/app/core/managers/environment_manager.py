from typing import Any

"""Environment Manager for managing Python environment and dependencies."""

import asyncio
import json
import platform
import subprocess
import sys
from pathlib import Path


class EnvironmentManager:
    """Manages Python environment and dependencies."""
    
    def __init__(self, venv_path: str | None = None):
        self.venv_path = Path(venv_path) if venv_path else None
    
    async def get_python_version(self) -> dict[str, str]:
        """Get current Python version details."""
        return {
            "version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "version_info": {
                "major": sys.version_info.major,
                "minor": sys.version_info.minor,
                "micro": sys.version_info.micro
            },
            "executable": sys.executable,
            "platform": sys.platform,
            "implementation": sys.implementation.name
        }
    
    async def get_system_info(self) -> dict[str, Any]:
        """Get system information."""
        import os
        
        info = {
            "os": {
                "system": platform.system(),
                "release": platform.release(),
                "version": platform.version(),
                "machine": platform.machine(),
                "processor": platform.processor()
            },
            "python": await self.get_python_version(),
            "environment": {
                "is_venv": hasattr(sys, 'real_prefix') or (
                    hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix
                ),
                "venv_path": str(self.venv_path) if self.venv_path else None
            }
        }
        
        # Get CPU info
        try:
            import psutil
            info["cpu"] = {
                "count": psutil.cpu_count(logical=False),
                "logical_count": psutil.cpu_count(logical=True),
                "percent": psutil.cpu_percent(interval=0.1)
            }
        except ImportError:
            info["cpu"] = {"count": os.cpu_count() or 0}
        
        # Get memory info
        try:
            import psutil
            mem = psutil.virtual_memory()
            info["memory"] = {
                "total_mb": round(mem.total / (1024 * 1024), 2),
                "available_mb": round(mem.available / (1024 * 1024), 2),
                "percent": mem.percent
            }
        except ImportError:
            pass
        
        # Get disk info
        try:
            import psutil
            disk = psutil.disk_usage('/')
            info["disk"] = {
                "total_gb": round(disk.total / (1024**3), 2),
                "free_gb": round(disk.free / (1024**3), 2),
                "used_percent": round((disk.used / disk.total) * 100, 2)
            }
        except ImportError:
            pass
        
        return info
    
    async def get_installed_packages(self) -> dict[str, str]:
        """Get list of installed Python packages with versions."""
        try:
            def _run():
                return subprocess.run(
                    [sys.executable, "-m", "pip", "list", "--format=json"],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
            result = await asyncio.to_thread(_run)
            
            if result.returncode != 0:
                return {}
            
            packages = {}
            for pkg in json.loads(result.stdout):
                packages[pkg["name"].lower()] = pkg["version"]
            
            return packages
            
        except subprocess.TimeoutExpired:
            return {"error": "Timeout getting package list"}
        except Exception as e:
            return {"error": str(e)}
    
    async def install_package(
        self,
        package: str,
        version: str | None = None,
        upgrade: bool = True
    ) -> dict[str, Any]:
        """Install or upgrade Python package."""
        
        if version:
            package_spec = f"{package}=={version}"
        else:
            package_spec = package
        
        cmd = [sys.executable, "-m", "pip", "install"]
        
        if upgrade:
            cmd.append("--upgrade")
        
        cmd.extend([
            "--no-cache-dir",
            package_spec
        ])
        
        try:
            def _run():
                return subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=300  # 5 minute timeout
                )
            result = await asyncio.to_thread(_run)
            
            return {
                "success": result.returncode == 0,
                "package": package,
                "version": version,
                "stdout": result.stdout[-2000:] if result.stdout else "",
                "stderr": result.stderr[-1000:] if result.stderr else ""
            }
            
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "package": package,
                "error": "Installation timed out after 5 minutes"
            }
        except Exception as e:
            return {
                "success": False,
                "package": package,
                "error": str(e)
            }
    
    async def uninstall_package(self, package: str) -> dict[str, Any]:
        """Uninstall a Python package."""
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "uninstall", "-y", package],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            return {
                "success": result.returncode == 0,
                "package": package,
                "stdout": result.stdout[-1000:] if result.stdout else "",
                "stderr": result.stderr[-500:] if result.stderr else ""
            }
            
        except Exception as e:
            return {
                "success": False,
                "package": package,
                "error": str(e)
            }
    
    async def check_system_command(self, command: str) -> bool:
        """Check if a system command is available."""
        try:
            result = subprocess.run(
                ["which", command],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            # Try Windows approach
            try:
                result = subprocess.run(
                    ["where", command],
                    capture_output=True,
                    timeout=5
                )
                return result.returncode == 0
            except Exception:
                return False
    
    async def verify_dependencies(
        self,
        requirements: list[dict[str, str]]
    ) -> dict[str, dict[str, Any]]:
        """Verify all dependencies are installed.
        
        Args:
            requirements: List of dicts with 'name' and optional 'version', 'min_version'
        
        Returns:
            Dict mapping package name to {'installed': bool, 'version': str|None, 'satisfied': bool}
        """
        installed = await self.get_installed_packages()
        results = {}
        
        for req in requirements:
            pkg_name = req["name"].lower()
            required_version = req.get("version") or req.get("min_version")
            
            is_installed = pkg_name in installed
            installed_version = installed.get(pkg_name)
            
            # Check version constraint
            satisfied = is_installed
            if is_installed and required_version:
                try:
                    from packaging import version as pkg_version
                    satisfied = pkg_version.parse(installed_version) >= pkg_version.parse(required_version)
                except ImportError:
                    # Fallback: simple string comparison
                    satisfied = installed_version >= required_version
                except Exception:
                    satisfied = True  # Assume OK if we can't compare
            
            results[pkg_name] = {
                "installed": is_installed,
                "version": installed_version,
                "required_version": required_version,
                "satisfied": satisfied
            }
        
        return results
    
    async def get_gpu_info(self) -> dict[str, Any]:
        """Get GPU information if available."""
        gpu_info = {
            "available": False,
            "gpus": [],
            "cuda_version": None
        }
        
        # Try to get CUDA/PyTorch GPU info
        try:
            import torch
            if torch.cuda.is_available():
                gpu_info["available"] = True
                gpu_info["cuda_version"] = torch.version.cuda
                
                for i in range(torch.cuda.device_count()):
                    props = torch.cuda.get_device_properties(i)
                    free_mem, total_mem = torch.cuda.mem_get_info(i)
                    
                    gpu_info["gpus"].append({
                        "id": i,
                        "name": props.name,
                        "total_memory_mb": total_mem // (1024 * 1024),
                        "free_memory_mb": free_mem // (1024 * 1024),
                        "compute_capability": f"{props.major}.{props.minor}"
                    })
        except ImportError:
            pass
        
        # Fallback to nvidia-smi
        if not gpu_info["available"]:
            try:
                result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=name,memory.total,memory.free,driver_version", 
                     "--format=csv,noheader,nounits"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                if result.returncode == 0:
                    gpu_info["available"] = True
                    for i, line in enumerate(result.stdout.strip().split('\n')):
                        parts = [p.strip() for p in line.split(',')]
                        if len(parts) >= 4:
                            gpu_info["gpus"].append({
                                "id": i,
                                "name": parts[0],
                                "total_memory_mb": int(parts[1]),
                                "free_memory_mb": int(parts[2]),
                                "driver_version": parts[3]
                            })
            except Exception:
                pass
        
        return gpu_info
    
    async def check_cuda_availability(self) -> dict[str, Any]:
        """Check CUDA availability and version."""
        cuda_info = {
            "available": False,
            "cuda_version": None,
            "cudnn_version": None,
            "torch_cuda_available": False
        }
        
        # Check PyTorch CUDA
        try:
            import torch
            cuda_info["torch_cuda_available"] = torch.cuda.is_available()
            if torch.cuda.is_available():
                cuda_info["available"] = True
                cuda_info["cuda_version"] = torch.version.cuda
                
                try:
                    cuda_info["cudnn_version"] = torch.backends.cudnn.version()
                except Exception:
                    pass
        except ImportError:
            pass
        
        # Check nvcc
        try:
            result = subprocess.run(
                ["nvcc", "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                # Parse version from output
                for line in result.stdout.split('\n'):
                    if 'release' in line.lower():
                        import re
                        match = re.search(r'(\d+\.\d+)', line)
                        if match:
                            cuda_info["cuda_version"] = match.group(1)
                            break
        except Exception:
            pass
        
        return cuda_info

    def get_gpu_memory_available(self) -> float:
        """Get available GPU memory in GB. Fallback to 8.0 GB if no GPU."""
        try:
            import torch
            if torch.cuda.is_available():
                free_mem, _ = torch.cuda.mem_get_info(0)
                return float(free_mem) / (1024**3)
        except Exception:
            pass
        return 8.0

    def get_gpu_memory_used_per_model(self) -> dict[str, float]:
        """Get live memory used per model from VRAMAllocationTracker."""
        try:
            from app.core.managers.vram_tracker import vram_tracker
            return vram_tracker.get_allocated_models()
        except Exception:
            return {}

    def estimate_memory_needed(self, model_name: str) -> float:
        """Get estimated VRAM requirements in GB for specific models."""
        estimates = {
            "anigen": 6.2,
            "detailgen3d": 4.0,
            "hunyuan3d": 16.0,
            "trellis": 8.0,
            "mock": 0.0,
        }
        return estimates.get(model_name.lower(), 2.0)

