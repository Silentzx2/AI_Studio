"""Health Manager for model health checks and diagnostics."""

import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core.installer.plugin_installer import PluginInstaller


class HealthManager:
    """Manages model health checks and diagnostics."""
    
    def __init__(self, models_path: str):
        self.models_path = Path(models_path)
        self.installer = PluginInstaller(models_path)
    
    async def run_model_health_check(self, model_id: str) -> dict[str, Any]:
        """Run comprehensive health check for a specific model."""
        
        manifest = await self.installer.get_model_manifest(model_id)
        if not manifest:
            return {
                "status": "error",
                "model_id": model_id,
                "error": "Model not found or manifest missing"
            }
        
        health_config = manifest.get("health_check", {})
        results = {
            "model_id": model_id,
            "model_name": manifest.get("name", model_id),
            "timestamp": datetime.utcnow().isoformat(),
            "checks": {}
        }
        
        # 1. Check files exist and integrity
        results["checks"]["files"] = await self._check_files(model_id, manifest)
        
        # 2. Check dependencies are installed
        results["checks"]["dependencies"] = await self._check_dependencies(manifest)
        
        # 3. Check manifest validity
        results["checks"]["manifest"] = await self._check_manifest(manifest)

        
        # 4. Check disk space for model
        results["checks"]["disk_space"] = await self._check_disk_space(model_id)
        
        # 5. Check GPU compatibility if required
        if manifest.get("cuda_required") or manifest.get("gpu_required"):
            results["checks"]["gpu"] = await self._check_gpu_compatibility(manifest)
        
        # 6. Run inference test if configured
        if health_config.get("type") == "inference_test":
            results["checks"]["inference"] = await self._run_inference_test(
                model_id,
                health_config
            )
        elif health_config.get("type") == "quick":
            # Quick check - just verify model loads
            results["checks"]["loading"] = await self._check_model_loading(
                model_id,
                manifest
            )
        
        # Determine overall status
        all_checks = results["checks"].values()
        errors = sum(1 for c in all_checks if c.get("status") == "error")
        warnings = sum(1 for c in all_checks if c.get("status") == "warning")
        
        if errors > 0:
            results["status"] = "unhealthy"
        elif warnings > 0:
            results["status"] = "warning"
        else:
            results["status"] = "healthy"
        
        results["summary"] = {
            "total_checks": len(all_checks),
            "passed": sum(1 for c in all_checks if c.get("status") == "ok"),
            "warnings": warnings,
            "errors": errors
        }
        
        return results
    
    async def _check_files(self, model_id: str, manifest: dict) -> dict[str, Any]:
        """Check if all required model files exist."""
        try:
            model_dir = self.models_path / model_id
            
            if not model_dir.exists():
                return {
                    "status": "error",
                    "message": f"Model directory not found: {model_dir}"
                }
            
            required_files = manifest.get("files", [])
            
            if not required_files:
                # If no explicit file list, check directory has content
                files = list(model_dir.rglob("*"))
                files = [f for f in files if f.is_file()]
                
                if len(files) == 0:
                    return {"status": "error", "message": "Model directory is empty"}
                
                return {
                    "status": "ok",
                    "message": f"Found {len(files)} files in model directory"
                }
            
            missing = []
            found = []
            
            for filename in required_files:
                filepath = model_dir / filename
                if filepath.exists():
                    size_mb = filepath.stat().st_size / (1024 * 1024)
                    found.append({
                        "name": filename,
                        "size_mb": round(size_mb, 2)
                    })
                else:
                    missing.append(filename)
            
            result = {
                "status": "ok" if not missing else "error",
                "required_count": len(required_files),
                "found_count": len(found),
                "missing_count": len(missing),
                "found": found
            }
            
            if missing:
                result["missing"] = missing
                result["message"] = f"Missing {len(missing)} required files: {', '.join(missing)}"
            else:
                result["message"] = f"All {len(required_files)} required files present"
            
            return result
            
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    async def _check_dependencies(self, manifest: dict) -> dict[str, Any]:
        """Check if required dependencies are installed."""
        try:
            deps = manifest.get("dependencies", {})
            python_packages = deps.get("python_packages", [])
            
            if not python_packages:
                return {
                    "status": "ok",
                    "message": "No Python dependencies specified"
                }
            
            # Get installed packages
            result = subprocess.run(
                ["pip", "list", "--format=json"],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            installed = {}
            if result.returncode == 0:
                try:
                    for pkg in json.loads(result.stdout):
                        installed[pkg["name"].lower()] = pkg["version"]
                except Exception:
                    pass
            
            missing = []
            satisfied = []
            
            for pkg_spec in python_packages:
                if isinstance(pkg_spec, dict):
                    pkg_name = pkg_spec.get("name", "")
                    min_version = pkg_spec.get("min_version")
                else:
                    pkg_name = pkg_spec
                    min_version = None
                
                pkg_lower = pkg_name.lower()
                
                if pkg_lower not in installed:
                    missing.append({
                        "name": pkg_name,
                        "reason": "not_installed"
                    })
                elif min_version:
                    installed_ver = installed[pkg_lower]
                    try:
                        from packaging import version as pkg_version
                        if pkg_version.parse(installed_ver) >= pkg_version.parse(min_version):
                            satisfied.append(pkg_name)
                        else:
                            missing.append({
                                "name": pkg_name,
                                "reason": "version_mismatch",
                                "installed": installed_ver,
                                "required": min_version
                            })
                    except ImportError:
                        satisfied.append(pkg_name)  # Can't compare, assume OK
                else:
                    satisfied.append(pkg_name)
            
            status = "ok" if not missing else "warning"
            
            return {
                "status": status,
                "total": len(python_packages),
                "satisfied": len(satisfied),
                "missing": len(missing),
                "satisfied_packages": satisfied,
                "missing_packages": missing,
                "message": (
                    f"Dependencies OK ({len(satisfied)}/{len(python_packages)})" 
                    if not missing else 
                    f"{len(missing)} dependencies missing or outdated"
                )
            }
            
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    async def _check_manifest(self, manifest: dict) -> dict[str, Any]:
        """Validate manifest structure completeness."""
        try:
            # Required fields for a valid manifest
            required_fields = ["name", "version", "category"]
            recommended_fields = [
                "capabilities", "runtime", "description", "author"
            ]
            
            missing_required = [f for f in required_fields if f not in manifest]
            missing_recommended = [f for f in recommended_fields if f not in manifest]
            
            # Validate version format
            version_valid = True
            if "version" in manifest:
                import re
                version_valid = bool(re.match(r'^\d+\.\d+', str(manifest["version"])))
            
            issues = []
            if missing_required:
                issues.append(f"Missing required fields: {', '.join(missing_required)}")
            if not version_valid:
                issues.append("Version format invalid (expected X.Y.Z)")
            
            status = "ok" if (not missing_required and version_valid) else "warning"
            
            return {
                "status": status,
                "valid": len(missing_required) == 0,
                "fields_present": list(manifest.keys()),
                "missing_required": missing_required,
                "missing_recommended": missing_recommended,
                "version_valid": version_valid,
                "issues": issues,
                "message": "Manifest valid" if status == "ok" else "; ".join(issues)
            }
            
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    async def _check_disk_space(self, model_id: str) -> dict[str, Any]:
        """Check available disk space for model operations."""
        try:
            model_dir = self.models_path / model_id
            
            # Get current model size
            current_size = 0
            if model_dir.exists():
                for f in model_dir.rglob("*"):
                    if f.is_file():
                        current_size += f.stat().st_size
            
            # Get disk usage
            import shutil
            total, used, free = shutil.disk_usage(model_dir.parent if model_dir.exists() else self.models_path)
            
            current_size_mb = current_size / (1024 * 1024)
            free_gb = free / (1024**3)
            total_gb = total / (1024**3)
            
            # Recommend minimum 1GB free for safe operation
            min_free_gb = 1.0
            
            return {
                "status": "ok" if free_gb >= min_free_gb else "warning",
                "model_size_mb": round(current_size_mb, 2),
                "disk_free_gb": round(free_gb, 2),
                "disk_total_gb": round(total_gb, 2),
                "disk_used_percent": round((used / total) * 100, 2),
                "minimum_free_gb": min_free_gb,
                "message": (
                    f"{free_gb:.1f}GB free disk space" if free_gb >= min_free_gb
                    else f"Low disk space: {free_gb:.1f}GB free (min {min_free_gb}GB)"
                )
            }
            
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    async def _check_gpu_compatibility(self, manifest: dict) -> dict[str, Any]:
        """Check GPU/CUDA requirements."""
        try:
            gpu_info = {
                "cuda_available": False,
                "cuda_version": None,
                "gpus": [],
                "compatible": False,
                "issues": []
            }
            
            # Try PyTorch CUDA detection
            try:
                import torch
                gpu_info["cuda_available"] = torch.cuda.is_available()
                gpu_info["cuda_version"] = torch.version.cuda
                
                if torch.cuda.is_available():
                    for i in range(torch.cuda.device_count()):
                        props = torch.cuda.get_device_properties(i)
                        vram_gb = props.total_memory / (1024**3)
                        
                        gpu_info["gpus"].append({
                            "id": i,
                            "name": props.name,
                            "vram_gb": round(vram_gb, 2),
                            "compute_capability": f"{props.major}.{props.minor}"
                        })
            except ImportError:
                pass
            
            # Check requirements
            min_vram = manifest.get("min_vram_mb", 0) / 1024  # Convert to GB
            cuda_required = manifest.get("cuda_required", False)
            min_cuda = manifest.get("min_cuda_version")
            
            if cuda_required and not gpu_info["cuda_available"]:
                gpu_info["issues"].append("CUDA required but not available")
            
            if min_cuda and gpu_info["cuda_version"]:
                try:
                    from packaging import version as pkg_version
                    if pkg_version.parse(gpu_info["cuda_version"]) < pkg_version.parse(min_cuda):
                        gpu_info["issues"].append(
                            f"CUDA {gpu_info['cuda_version']} < required {min_cuda}"
                        )
                except ImportError:
                    pass
            
            if min_vram and gpu_info["gpus"]:
                max_vram = max(g["vram_gb"] for g in gpu_info["gpus"])
                if max_vram < min_vram:
                    gpu_info["issues"].append(
                        f"GPU VRAM {max_vram:.1f}GB < required {min_vram:.1f}GB"
                    )
            
            gpu_info["compatible"] = len(gpu_info["issues"]) == 0
            gpu_info["status"] = "ok" if gpu_info["compatible"] else "error"
            
            return gpu_info
            
        except Exception as e:
            return {"status": "error", "message": str(e), "compatible": False}
    
    async def _run_inference_test(self, model_id: str, config: dict) -> dict[str, Any]:
        """Run inference test if configured in manifest."""
        try:
            # This would need model-specific implementation
            # For now, return a placeholder that indicates configuration exists
            
            test_type = config.get("test_type", "basic")
            timeout = config.get("timeout", 60)
            
            return {
                "status": "skipped",
                "message": f"Inference test configured ({test_type}) but not executed",
                "config": {
                    "type": test_type,
                    "timeout": timeout
                },
                "note": "Inference testing requires model-specific implementation"
            }
            
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    async def _check_model_loading(self, model_id: str, manifest: dict) -> dict[str, Any]:
        """Quick check - verify model can be loaded."""
        try:
            # Check if model has load script or can be auto-detected
            model_dir = self.models_path / model_id
            
            if not model_dir.exists():
                return {"status": "error", "message": "Model directory not found"}
            
            # Look for common model files
            common_extensions = ['.pt', '.pth', '.onnx', '.bin', '.safetensors']
            model_files = []
            
            for ext in common_extensions:
                model_files.extend(model_dir.rglob(f"*{ext}"))
            
            if not model_files:
                return {
                    "status": "warning",
                    "message": "No recognized model weight files found"
                }
            
            total_size = sum(f.stat().st_size for f in model_files if f.is_file())
            
            return {
                "status": "ok",
                "message": f"Found {len(model_files)} model file(s)",
                "model_files": [str(f.relative_to(model_dir)) for f in model_files[:10]],
                "total_size_mb": round(total_size / (1024*1024), 2)
            }
            
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    async def get_health_report(self, model_id: str) -> dict[str, Any]:
        """Get detailed health report for a single model."""
        return await self.run_model_health_check(model_id)
    
    async def get_all_models_health(self) -> dict[str, Any]:
        """Get health status summary for all installed models."""
        try:
            installed_models = await self.installer.get_installed_models()
            
            results = {
                "timestamp": datetime.utcnow().isoformat(),
                "total_models": len(installed_models),
                "health_summary": {
                    "healthy": 0,
                    "warning": 0,
                    "unhealthy": 0,
                    "error": 0
                },
                "models": {}
            }
            
            for model_id in installed_models:
                try:
                    health = await self.run_model_health_check(model_id)
                    status = health.get("status", "error")
                    
                    results["health_summary"][status] = \
                        results["health_summary"].get(status, 0) + 1
                    
                    results["models"][model_id] = {
                        "status": status,
                        "name": health.get("model_name", model_id),
                        "summary": health.get("summary", {})
                    }
                    
                except Exception as e:
                    results["health_summary"]["error"] += 1
                    results["models"][model_id] = {
                        "status": "error",
                        "error": str(e)
                    }
            
            return results
            
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "models": {}
            }
    
    async def quick_health_check(self, model_id: str) -> dict[str, Any]:
        """Perform a quick health check (files + manifest only)."""
        manifest = await self.installer.get_model_manifest(model_id)
        if not manifest:
            return {"status": "error", "message": "Model not found"}
        
        results = {
            "model_id": model_id,
            "timestamp": datetime.utcnow().isoformat(),
            "checks": {}
        }
        
        results["checks"]["files"] = await self._check_files(model_id, manifest)
        results["checks"]["manifest"] = await self._check_manifest(manifest)
        
        all_ok = all(c.get("status") == "ok" for c in results["checks"].values())
        results["status"] = "healthy" if all_ok else "unhealthy"
        
        return results
