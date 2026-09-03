import asyncio
import logging
import os
import shutil

from app.core.registry.model_registry import ModelRegistry


class PluginManager:
    def __init__(self):
        self.registry = ModelRegistry()
        
    async def get_all_models(self):
        # Use the runtime installer as the authoritative source for installed state.
        # The DB registry is metadata-only; cross-reference with runtime installer
        # to determine what is genuinely installed on the filesystem.
        from runtime.installer import get_install_status
        rt = await get_install_status()
        
        # Also fetch from DB registry for additional metadata
        db_installed = await self.registry.get_installed_models()
        db_installed_ids = {m["id"] for m in db_installed}
        
        # Merge: a model is "installed" if the runtime installer confirms it.
        # The DB registry may have stale rows, so we defer to runtime truth.
        installed = []
        for mid, state in rt.get("components", {}).items():
            if state.get("state") in ("complete", "passed", "found"):
                manifest = await self.registry.get_model_manifest(mid) if hasattr(self.registry, "get_model_manifest") else None
                if manifest is None:
                    # Manifest may not be in DB yet; still mark installed if runtime has it
                    installed.append({
                        "id": mid,
                        "label": mid,
                        "name": mid,
                        "manifest": {},
                        "installed": True,
                        "status": "ready",
                    })
                else:
                    installed.append({
                        "id": mid,
                        "label": manifest.get("name", mid),
                        "name": mid,
                        "manifest": manifest,
                        "installed": True,
                        "status": rt.get("state", "unknown"),
                    })
        
        available = await self.registry.get_available_models()
        return {"installed": installed, "available": available}
    
    async def install_model(self, model_id: str, background_tasks=None):
        available = await self.registry.get_available_models()
        model_data = next((m for m in available if m["id"] == model_id), None)
        
        if not model_data:
            raise ValueError(f"Model {model_id} not found in available models.")
            
        manifest = model_data.get("manifest", {})
        
        # Register to DB as installing
        await self.registry.register_model(model_id, manifest)
        
        # In a real celery environment, we would use apply_async
        # For this setup, if BackgroundTasks is provided, we use it
        if background_tasks:
            background_tasks.add_task(self._run_install_task, model_id, manifest)
        else:
            asyncio.create_task(self._run_install_task(model_id, manifest))
            
    async def _run_install_task(self, model_id: str, manifest: dict):
        import logging
        import asyncio
        logger = logging.getLogger(__name__)

        def _blocking_install():
            try:
                from runtime.installer import install_provider
                result = install_provider(model_id)
                return result
            except Exception as exc:
                return {"success": False, "error": str(exc)}

        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, _blocking_install)
            if result.get("success"):
                await self.registry.update_status(model_id, "ready")
                logger.info("Provider %s installed successfully via runtime installer.", model_id)
            else:
                err = result.get("error", "Unknown error")
                logger.error("Installation failed for %s: %s", model_id, err)
                await self.registry.update_status(model_id, "broken")
        except Exception as e:
            logger.exception("Installation failed for %s: %s", model_id, e)
            await self.registry.update_status(model_id, "broken")
        
    async def uninstall_model(self, model_id: str):
        # 1. Remove from DB registry (metadata only)
        await self.registry.delete_model(model_id)
        
        # 2. Remove from runtime installer (actual weights/files)
        # The runtime installer handles third_party/<repo>/weights/ layout
        try:
            from runtime.installer import uninstall_provider
            result = uninstall_provider(model_id)
            if not result.get("success"):
                logger.warning(f"Weight removal warning for {model_id}: {result.get('error')}")
        except Exception as e:
            logger.warning(f"Weight removal failed for {model_id}: {e}")
        
        # 3. Do NOT delete from ./storage/models/ — that is the registry's
        #    metadata-only location. The canonical runtime weights live in
        #    third_party/<repo>/weights/ which uninstall_provider() handles.
        #    Deleting ./storage/models/ would remove a stale DB artifact but
        #    would NOT remove the actual model weights.
