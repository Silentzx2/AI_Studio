from pathlib import Path
from typing import Any

from sqlalchemy import delete, update
from sqlalchemy.future import select

from app.database import AsyncSessionLocal
from app.models.registry import InstalledModel


class ModelRegistry:
    """
    ModelRegistry — metadata-only registry for installed models.

    The authoritative source for installation state (repo, weights, environment)
    is the runtime installer (backend/runtime/installer.py) which stores models
    under the canonical third_party/<repo>/weights/ layout.

    This registry tracks only database metadata (status, timestamps, size) and
    delegates filesystem/installation checks to the runtime installer.
    """

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

    async def _get_runtime_install_state(self) -> dict[str, Any]:
        """
        Query the runtime installer for actual installation state.

        Returns a dict mapping model_id -> {"installed": bool, "ready": bool, ...}
        """
        try:
            from runtime.installer import get_install_status
            return get_install_status()
        except Exception:
            return {}

    async def _get_loaded_providers(self) -> set[str]:
        """Get currently loaded provider names from RuntimeEngine."""
        try:
            from runtime.engine import get_engine
            engine = get_engine()
            return set(engine._loaded.keys())
        except Exception:
            return set()

    async def get_installed_models(self) -> list[dict[str, Any]]:
        """
        Get installed models, verifying against runtime installer state.

        The database row tracks metadata (status, timestamps). Actual installation
        (repo, weights, venv, native build, preflight) is verified against the
        runtime installer. 'loaded' reflects RuntimeEngine._loaded state.
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(InstalledModel))
            models = result.scalars().all()

            # Get actual runtime installation state
            runtime_state = await self._get_runtime_install_state()
            loaded_providers = await self._get_loaded_providers()

            output = []
            for m in models:
                model_id = m.id
                rt = runtime_state.get(model_id, {})
                components = rt.get("components", {}) or {}

                # Installation readiness = all components passed
                installed = all(
                    comp.get("state") in ("complete", "passed", "found")
                    for comp in components.values()
                    if isinstance(comp, dict)
                )

                # Ready = installed AND preflight passed (if implemented)
                preflight = components.get("preflight", {}) or {}
                preflight_passed = preflight.get("state") in ("passed", None)
                ready = installed and preflight_passed

                # Loaded = actually in RuntimeEngine memory
                loaded = model_id in loaded_providers

                output.append({
                    "id": model_id,
                    "label": m.manifest.get("name", model_id) if m.manifest else model_id,
                    "name": (
                        ((m.manifest.get("weights", {}) or {}).get("primary", {}) or {}).get("repo")
                        or m.manifest.get("name", model_id)
                    ) if m.manifest else model_id,
                    "category": m.manifest.get("category", "unknown") if m.manifest else "unknown",
                    "installed": installed,
                    "status": m.status,
                    "size_mb": m.size_mb,
                    "vram_required_mb": m.manifest.get("recommended_vram_mb", 0) if m.manifest else 0,
                    "loaded": loaded,
                    "ready": ready,
                })
            return output

    async def get_available_models(self) -> list[dict[str, Any]]:
        installed = await self.get_installed_models()
        installed_ids = {m["id"] for m in installed}

        available = self._fetch_provider_manifests()
        return [m for m in available if m["id"] not in installed_ids]

    async def register_model(self, model_id: str, manifest: dict[str, Any]):
        """
        Register a model in the DB as installing.

        Note: installation_path is NOT set to a filesystem location here.
        The authoritative installation path is determined by the runtime installer
        at install time (third_party/<repo>/weights/). The registry stores only
        metadata; installation_path column is left NULL (or set to a placeholder
        if NOT NULL constraint exists).
        """
        async with AsyncSessionLocal() as session:
            model = InstalledModel(
                id=model_id,
                manifest=manifest,
                status="installing",
                # installation_path is canonical in runtime installer, not here
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
        """Delete model from DB registry only.

        Filesystem cleanup is handled by the runtime installer's uninstall_provider().
        """
        async with AsyncSessionLocal() as session:
            await session.execute(
                delete(InstalledModel).where(InstalledModel.id == model_id)
            )
            await session.commit()
