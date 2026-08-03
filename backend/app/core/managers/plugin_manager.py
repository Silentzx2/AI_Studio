import asyncio

from app.core.registry.model_registry import ModelRegistry


class PluginManager:
    def __init__(self):
        self.registry = ModelRegistry()
        
    async def get_all_models(self):
        installed = await self.registry.get_installed_models()
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
        # Delete from DB
        await self.registry.delete_model(model_id)
        # We should also delete files from storage
        import os
        import shutil
        path = f"./storage/models/{model_id}"
        if os.path.exists(path):
            shutil.rmtree(path, ignore_errors=True)
