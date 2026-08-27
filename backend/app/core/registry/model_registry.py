from pathlib import Path
from typing import Any

from sqlalchemy import delete, update
from sqlalchemy.future import select

from app.database import AsyncSessionLocal
from app.models.registry import InstalledModel


class ModelRegistry:
    def __init__(self, storage_path: str = "./storage/registry"):
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
    def _fetch_provider_manifests(self) -> list[dict[str, Any]]:
        """Build the available model catalog directly from YAML manifests."""
        try:
            from runtime.engine import _PROVIDER_MAP
            loadable = set(_PROVIDER_MAP.keys())
        except Exception:
            loadable = set()

        try:
            from runtime.manifest_loader import load_all_manifests
            manifests = load_all_manifests()
        except Exception:
            return []

        models: list[dict[str, Any]] = []
        for model_id, manifest in sorted(manifests.items()):
            if loadable and model_id not in loadable:
                continue
            hw = manifest.get("hardware", {}) or {}
            source = manifest.get("source", {}) or {}
            weights = manifest.get("weights", {}) or {}
            primary = weights.get("primary", {}) or {}
            caps = manifest.get("capabilities", {}) or {}
            runtime = manifest.get("runtime", {}) or {}
            capability_names = [
                name for name, cfg in caps.items()
                if isinstance(cfg, dict) and cfg.get("enabled", False)
            ]
            workspace = runtime.get("workspace_compatibility") or [
                "mesh-generation" if "shape" in capability_names else None,
                "texture-generation" if any(name in capability_names for name in ("texture", "texture_pbr")) else None,
                "rigging" if "rigging" in capability_names else None,
                "post-processing" if "detail_enhancement" in capability_names else None,
            ]
            workspace = [x for x in workspace if x]
            models.append({
                "id": model_id,
                "label": manifest.get("label", model_id),
                "name": primary.get("repo") or manifest.get("label", model_id),
                "category": hw.get("category", "3d_generation"),
                "description": manifest.get("description", ""),
                "author": manifest.get("author", "Unknown"),
                "license": manifest.get("license", ""),
                "installed": False,
                "size_mb": int(float(weights.get("size_estimate_gb", 0) or 0) * 1024),
                "vram_required_mb": hw.get("recommended_vram_mb", hw.get("minimum_vram_mb", 0)),
                "speed_seconds": runtime.get("speed_seconds", 0),
                "workspace_compatibility": workspace,
                "manifest": manifest,
                "source_repo": source.get("repo"),
            })
        return models
    async def get_installed_models(self) -> list[dict[str, Any]]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(InstalledModel))
            models = result.scalars().all()
            
            output = []
            for m in models:
                output.append({
                    "id": m.id,
                    "label": m.manifest.get("name", m.id) if m.manifest else m.id,
                    "name": (
                        ((m.manifest.get("weights", {}) or {}).get("primary", {}) or {}).get("repo")
                        or m.manifest.get("name", m.id)
                    ) if m.manifest else m.id,
                    "category": m.manifest.get("category", "unknown") if m.manifest else "unknown",
                    "installed": True,
                    "status": m.status,
                    "size_mb": m.size_mb,
                    "vram_required_mb": m.manifest.get("recommended_vram_mb", 0) if m.manifest else 0,
                    "loaded": m.status == "ready"
                })
            return output
            
    async def get_available_models(self) -> list[dict[str, Any]]:
        installed = await self.get_installed_models()
        installed_ids = {m["id"] for m in installed}
        
        available = self._fetch_provider_manifests()
        return [m for m in available if m["id"] not in installed_ids]

    async def register_model(self, model_id: str, manifest: dict[str, Any]):
        async with AsyncSessionLocal() as session:
            model = InstalledModel(
                id=model_id,
                manifest=manifest,
                status="installing",
                installation_path=f"./storage/models/{model_id}",
                size_mb=manifest.get("disk_space_mb", 0)
            )
            session.add(model)
            await session.commit()
            
    async def update_status(self, model_id: str, status: str):
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(InstalledModel).where(InstalledModel.id == model_id).values(status=status)
            )
            await session.commit()
            
    async def delete_model(self, model_id: str):
        async with AsyncSessionLocal() as session:
            await session.execute(
                delete(InstalledModel).where(InstalledModel.id == model_id)
            )
            await session.commit()
