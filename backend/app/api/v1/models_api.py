"""API endpoints for model management."""

import threading

from fastapi import APIRouter, HTTPException, Query

from app.core.installer.plugin_installer import PluginInstaller
from app.core.managers.health_manager import HealthManager
from app.workers.installation_workers import uninstall_model as uninstall_task

router = APIRouter(prefix="/models", tags=["models"])

import os
_installer = None
_health_manager = None
_init_lock = threading.Lock()


def _get_models_dir() -> str:
    return os.environ.get("MODELS_DIR", "./storage/models")


def get_installer():
    global _installer
    if _installer is None:
        with _init_lock:
            if _installer is None:
                _installer = PluginInstaller(_get_models_dir())
    return _installer


def get_health_manager():
    global _health_manager
    if _health_manager is None:
        with _init_lock:
            if _health_manager is None:
                _health_manager = HealthManager(_get_models_dir())
    return _health_manager


@router.get("")
async def list_all_models():
    """Return all available + installed models. Used by workspace ModelsTab."""
    from app.core.registry.model_registry import ModelRegistry

    registry = ModelRegistry()
    try:
        installed = await registry.get_installed_models()
        available = await registry.get_available_models()
        all_models = installed + available
        return {
            "success": True,
            "data": {
                "models": all_models,
                "count": len(all_models),
                "installed_count": len(installed),
                "available_count": len(available),
            },
        }
    except Exception as e:
        return {"success": False, "error": str(e), "data": {"models": [], "count": 0}}


@router.get("/installed")
async def list_installed_models(
    include_health: bool = Query(False, description="Include health status for each model"),
):
    """List all installed models."""
    
    try:
        model_dicts = await get_installer().get_installed_models()
        model_ids = [m.get("model_id") for m in model_dicts if isinstance(m, dict) and m.get("model_id")]

        result_models = []
        
        if include_health:
            for model_id in model_ids:
                model_info = {
                    "id": model_id,
                    "name": model_id
                }
                
                # Get manifest
                manifest = await get_installer().get_model_manifest(model_id)
                if manifest:
                    model_info["manifest"] = manifest
                    model_info["name"] = manifest.get("name", model_id)

                # Get health status (quick check)
                try:
                    health = await get_health_manager().quick_health_check(model_id)
                    model_info["health"] = health.get("status", "unknown")
                except Exception:
                    model_info["health"] = "unknown"
                
                result_models.append(model_info)
        else:
            result_models = [{"id": m, "name": m} for m in model_ids]
        
        return {
            "success": True,
            "data": {
                "models": result_models,
                "count": len(result_models)
            }
        }
        
    except Exception as e:
        return {"success": False, "error": str(e), "models": [], "count": 0}


@router.get("/{model_id}")
async def get_model(
    model_id: str,
    include_health: bool = Query(False, description="Include full health check")
):
    """Get detailed information about a specific model."""
    
    try:
        manifest = await get_installer().get_model_manifest(model_id)

        if not manifest:
            raise HTTPException(status_code=404, detail="Model not found")

        result = {
            "success": True,
            "data": {
                "id": model_id,
                "manifest": manifest
            }
        }

        if include_health:
            try:
                health = await get_health_manager().run_model_health_check(model_id)
                result["data"]["health"] = health
            except Exception as e:
                result["data"]["health"] = {"status": "error", "error": str(e)}
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.delete("/{model_id}")
async def uninstall_model_endpoint(model_id: str):
    """Uninstall a model (async task)."""
    
    # Check if model exists
    manifest = await get_installer().get_model_manifest(model_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="Model not found")

    # Dispatch uninstall task
    uninstall_task.delay(model_id)
    
    return {
        "success": True,
        "message": f"Uninstallation started for {model_id}",
        "model_id": model_id
    }


@router.post("/{model_id}/repair")
async def repair_model_endpoint(model_id: str):
    """Repair a model by running diagnostics and fixing issues."""
    
    # Check if model exists
    manifest = await get_installer().get_model_manifest(model_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="Model not found")

    # Dispatch repair task (or run synchronously for response)
    from app.workers.installation_workers import repair_model as run_repair
    result = run_repair.delay(model_id)
    
    return {
        "success": True,
        "message": f"Repair task started for {model_id}",
        "task_id": result.id,
        "model_id": model_id
    }


@router.get("/{model_id}/health")
async def get_model_health(model_id: str):
    """Get health check results for a specific model."""
    
    try:
        health = await get_health_manager().run_model_health_check(model_id)

        if "error" in health and "not found" in health.get("error", ""):
            raise HTTPException(status_code=404, detail="Model not found")

        return {"success": True, "data": health}
        
    except HTTPException:
        raise
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/{model_id}/benchmark")
async def run_model_benchmark(model_id: str):
    """Run benchmark for a specific model."""
    from fastapi import HTTPException

    manifest = await get_installer().get_model_manifest(model_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="Model not found")

    raise HTTPException(
        status_code=501,
        detail="Benchmarking is not yet implemented for this model type. Model-specific implementation is required."
    )


@router.get("/health/all")
async def get_all_models_health():
    """Get health summary for all installed models."""
    
    try:
        health_report = await get_health_manager().get_all_models_health()
        return {"success": True, "data": health_report}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/verify-all")
async def verify_all_models():
    """Verify all installed models are valid (async task)."""
    from app.workers.installation_workers import verify_all_models
    task = verify_all_models.delay()
    
    return {
        "success": True,
        "message": "Model verification started",
        "task_id": task.id
    }
