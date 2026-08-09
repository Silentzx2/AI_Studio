"""Celery workers for model installation tasks."""

import asyncio
import logging
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
