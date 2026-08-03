from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.core.managers.plugin_manager import PluginManager

router = APIRouter(prefix="/admin", tags=["models"])
manager = PluginManager()

@router.get("/models")
async def list_models():
    try:
        data = await manager.get_all_models()
        models = data["installed"] + data["available"]
        return {"success": True, "data": {"models": models}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/models/action")
async def model_action(payload: dict[str, Any], background_tasks: BackgroundTasks):
    model_id = payload.get("model_id")
    action = payload.get("action")
    
    if not model_id or not action:
        raise HTTPException(status_code=400, detail="Missing model_id or action")
        
    try:
        if action == "install":
            await manager.install_model(model_id, background_tasks)
            return {"success": True, "message": f"Installation started for {model_id}"}
        elif action == "uninstall":
            await manager.uninstall_model(model_id)
            return {"success": True, "message": f"Uninstalled {model_id}"}
        elif action == "load":
            await manager.registry.update_status(model_id, "ready")
            return {"success": True, "message": f"Loaded {model_id}"}
        elif action == "unload":
            await manager.registry.update_status(model_id, "disabled")
            return {"success": True, "message": f"Unloaded {model_id}"}
        else:
            return {"success": False, "message": f"Unknown action {action}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
