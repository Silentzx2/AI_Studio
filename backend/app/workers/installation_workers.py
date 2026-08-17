"""Celery workers for model installation tasks."""

import asyncio
import logging
import os
import subprocess
from datetime import datetime
from pathlib import Path

from celery import shared_task

from app.core.installer.plugin_installer import PluginInstaller
from app.core.managers.health_manager import HealthManager

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def install_model(
    self,
    model_id: str,
    download_path: str,
    manifest: dict | None = None
):
    """Install a downloaded model to the models directory."""
    
    installer = PluginInstaller("./storage/models")
    
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            # If manifest not provided, try to find it
            if not manifest:
                # Look for manifest in download location
                manifest_path = Path(download_path).parent / "manifest.json"
                if manifest_path.exists():
                    import json
                    with open(manifest_path) as f:
                        manifest = json.load(f)
            
            result = loop.run_until_complete(
                installer.install_model(
                    model_id,
                    Path(download_path),
                    manifest or {}
                )
            )
            
            if result:
                logger.info(f"Model {model_id} installed successfully")
                
                # Run health check after installation
                health_manager = HealthManager("./storage/models")
                health = loop.run_until_complete(
                    health_manager.run_model_health_check(model_id)
                )
                
                return {
                    "success": True,
                    "message": f"Model {model_id} installed successfully",
                    "model_id": model_id,
                    "health_check": health.get("status", "unknown")
                }
            else:
                raise Exception(f"Installation failed for model {model_id}")
                
        finally:
            loop.close()
    
    except Exception as exc:
        logger.error(f"Installation error for {model_id}: {exc}")
        raise self.retry(exc=exc)


@shared_task(bind=True)
def uninstall_model(self, model_id: str):
    """Uninstall a model from the models directory."""
    
    installer = PluginInstaller("./storage/models")
    
    try:
        loop = asyncio.new_event_loop()
        
        try:
            result = loop.run_until_complete(installer.uninstall_model(model_id))
            
            if result:
                logger.info(f"Model {model_id} uninstalled successfully")
                return {
                    "success": True,
                    "message": f"Model {model_id} uninstalled",
                    "model_id": model_id
                }
            else:
                return {
                    "success": False,
                    "message": f"Failed to uninstall model {model_id}",
                    "model_id": model_id
                }
                
        finally:
            loop.close()
    
    except Exception as e:
        logger.error(f"Uninstallation error for {model_id}: {e}")
        return {
            "success": False,
            "message": str(e),
            "model_id": model_id
        }


@shared_task
def repair_model(model_id: str):
    """Attempt to repair a model by running health checks and fixing issues."""
    
    health_manager = HealthManager("./storage/models")
    installer = PluginInstaller("./storage/models")
    
    try:
        loop = asyncio.new_event_loop()
        
        try:
            # Run comprehensive health check
            health = loop.run_until_complete(health_manager.run_model_health_check(model_id))
            
            if health["status"] == "healthy":
                return {
                    "success": True,
                    "message": f"Model {model_id} is healthy, no repair needed",
                    "model_id": model_id,
                    "health": health
                }
            
            # Attempt repairs based on issues
            repairs_made = []
            
            # Check for missing files - try to re-download or reinstall
            file_check = health.get("checks", {}).get("files", {})
            if file_check.get("status") == "error":
                repairs_made.append("Files check failed - may need re-download")
            
            # Check dependencies
            dep_check = health.get("checks", {}).get("dependencies", {})
            if dep_check.get("status") in ["warning", "error"]:
                missing_pkgs = dep_check.get("missing_packages", [])
                for pkg_info in missing_pkgs:
                    pkg_name = pkg_info.get("name", "") if isinstance(pkg_info, dict) else pkg_info
                    if pkg_name:
                        try:
                            # Try to install missing package
                            import subprocess
                            subprocess.run(
                                ["pip", "install", "-q", pkg_name],
                                capture_output=True,
                                timeout=120
                            )
                            repairs_made.append(f"Installed missing package: {pkg_name}")
                        except Exception as e:
                            repairs_made.append(f"Failed to install {pkg_name}: {e}")
            
            # Re-run health check after repairs
            new_health = loop.run_until_complete(health_manager.run_model_health_check(model_id))
            
            return {
                "success": new_health["status"] == "healthy",
                "message": f"Repair completed for {model_id}",
                "model_id": model_id,
                "initial_status": health["status"],
                "final_status": new_health["status"],
                "repairs_attempted": repairs_made,
                "final_health": new_health
            }
            
        finally:
            loop.close()
    
    except Exception as e:
        logger.error(f"Repair error for {model_id}: {e}")
        return {
            "success": False,
            "message": str(e),
            "model_id": model_id
        }


@shared_task
def verify_all_models():
    """Verify all installed models are valid."""
    
    installer = PluginInstaller("./storage/models")
    health_manager = HealthManager("./storage/models")
    
    try:
        loop = asyncio.new_event_loop()
        
        try:
            # Get all installed models
            installed = loop.run_until_complete(installer.get_installed_models())
            
            results = {
                "total_models": len(installed),
                "healthy": 0,
                "unhealthy": 0,
                "errors": 0,
                "models": {}
            }
            
            for model_id in installed:
                try:
                    health = loop.run_until_complete(
                        health_manager.quick_health_check(model_id)
                    )
                    
                    status = health.get("status", "error")
                    results[status] = results.get(status, 0) + 1
                    
                    results["models"][model_id] = {
                        "status": status,
                        "checks": health.get("checks", {})
                    }
                    
                except Exception as e:
                    results["errors"] += 1
                    results["models"][model_id] = {
                        "status": "error",
                        "error": str(e)
                    }
            
            logger.info(f"Verified {len(installed)} models: {results['healthy']} healthy")
            return results
            
        finally:
            loop.close()
    
    except Exception as e:
        logger.error(f"Model verification error: {e}")
        return {"error": str(e)}


@shared_task
def cleanup_unused_models(days_unused: int = 30):
    """Identify models that haven't been used recently (informational only)."""
    
    # This would need usage tracking to be fully implemented
    # For now, just return model sizes for admin review
    
    models_path = Path("./storage/models")
    
    if not models_path.exists():
        return {"models": [], "total_size_mb": 0}
    
    models = []
    total_size = 0
    
    for model_dir in models_path.iterdir():
        if model_dir.is_dir():
            size = sum(f.stat().st_size for f in model_dir.rglob("*") if f.is_file())
            size_mb = size / (1024 * 1024)
            
            models.append({
                "id": model_dir.name,
                "size_mb": round(size_mb, 2),
                "path": str(model_dir)
            })
            
            total_size += size_mb
    
    return {
        "models": sorted(models, key=lambda x: x["size_mb"], reverse=True),
        "total_size_mb": round(total_size, 2),
        "note": "This is informational. Use uninstall_model task to remove models."
    }


@shared_task(
    bind=True,
    max_retries=2,
    default_retry_delay=300,
    soft_time_limit=3600,
    time_limit=3900,
)
def run_native_build(self, provider_name: str, task_id: str) -> dict:
    """Run the native CUDA extension build for a provider in the background.

    Runs on the dedicated ``installation`` queue. Owns the native-build lock
    for the duration of the build and releases it on completion or failure.
    """
    from runtime.installer import (
        PROVIDER_METADATA,
        _acquire_native_build_lock,
        _canonical_provider_name,
        _release_native_build_lock,
        get_install_status,
        load_provider_state_from_db,
        persist_provider_state,
    )
    from runtime.manifest_loader import load_manifest
    from runtime.storage import get_storage_config

    canonical_name = _canonical_provider_name(provider_name)
    meta = PROVIDER_METADATA.get(canonical_name, {})
    repo_name = meta.get("repo") or canonical_name
    storage = get_storage_config()
    repo_dir = storage.get_repo_path(repo_name)

    lock_acquired = False
    try:
        lock_acquired = _acquire_native_build_lock(repo_name, task_id)
        if not lock_acquired:
            persist_provider_state(canonical_name, {
                "native_build_state": "native_build_failed",
                "native_build_task_id": task_id,
                "native_build_lock_owner": None,
                "blocking_reason": "Native build lock held by another worker",
            })
            return {
                "success": False,
                "provider": canonical_name,
                "state": "native_build_failed",
                "error": "Could not acquire native-build lock — another worker holds it",
            }

        persist_provider_state(canonical_name, {
            "native_build_state": "native_build_running",
            "native_build_task_id": task_id,
            "native_build_lock_owner": "celery_worker",
            "native_build_lock_ts": datetime.utcnow().isoformat(),
        })
        logger.info("Native build started for %s (task_id=%s)", canonical_name, task_id)

        try:
            manifest = load_manifest(canonical_name)
        except Exception as exc:
            logger.warning("No manifest for %s: %s", canonical_name, exc)
            manifest = {}

        venv_python = None
        if repo_dir.exists():
            if os.name == "nt":
                venv_python = repo_dir / ".venv" / "Scripts" / "python.exe"
            else:
                venv_python = repo_dir / ".venv" / "bin" / "python"

        errors: list[str] = []

        if manifest and "dependencies" in manifest:
            native_deps = manifest["dependencies"].get("native", [])
            if native_deps and venv_python and venv_python.exists():
                logger.info("Installing %d native deps for %s", len(native_deps), canonical_name)
                for dep in native_deps:
                    try:
                        subprocess.run(
                            [str(venv_python), "-m", "pip", "install", "-q", dep],
                            capture_output=True,
                            timeout=300,
                            check=True,
                        )
                        logger.info("Native dep installed: %s", dep)
                    except Exception as exc:
                        msg = f"Native dep install failed for {dep}: {exc}"
                        logger.warning(msg)
                        errors.append(msg)

        if manifest and "capabilities" in manifest:
            for cap_name, cap_info in manifest["capabilities"].items():
                if not isinstance(cap_info, dict):
                    continue
                if not cap_info.get("native_build_required", False):
                    continue
                native_steps = cap_info.get("native_steps", [])
                logger.info(
                    "Native build steps for capability '%s' of %s: %s",
                    cap_name, canonical_name, native_steps,
                )
                for step in native_steps:
                    logger.info("Native build step [%s / %s]: %s", canonical_name, cap_name, step)

        if errors:
            raise RuntimeError("; ".join(errors))

        persist_provider_state(canonical_name, {
            "native_build_state": "native_build_complete",
            "native_build_task_id": task_id,
            "native_build_lock_owner": None,
            "blocking_reason": None,
        })
        logger.info("Native build complete for %s (task_id=%s)", canonical_name, task_id)
        return {
            "success": True,
            "provider": canonical_name,
            "state": "native_build_complete",
        }

    except Exception as exc:
        logger.error("Native build failed for %s: %s", canonical_name, exc)
        persist_provider_state(canonical_name, {
            "native_build_state": "native_build_failed",
            "native_build_task_id": task_id,
            "native_build_lock_owner": None,
            "blocking_reason": str(exc),
        })
        return {
            "success": False,
            "provider": canonical_name,
            "state": "native_build_failed",
            "error": str(exc),
        }

    finally:
        if lock_acquired:
            _release_native_build_lock(repo_name)
