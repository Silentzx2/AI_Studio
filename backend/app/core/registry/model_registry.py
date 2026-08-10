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
        # Only expose models that have a real provider class in engine._PROVIDER_MAP.
        # Repos like UniRig can be cloned and have weights
        # downloaded, but without a provider class they cannot be loaded or executed,
        # so they must not appear in the Pipelines page or generation UI.
        try:
            from runtime.engine import _PROVIDER_MAP
            _loadable = set(_PROVIDER_MAP.keys())
        except Exception:
            _loadable = {
                "hunyuan3d", "hunyuan3d-1.0", "hunyuan3d-2.1", "hunyuan3d-2",
                "hunyuan3d-2-mini", "trellis", "anigen", "detailgen3d", "mock",
            }

        def _ok(meta: dict[str, Any]) -> bool:
            pid = str(meta.get("id", "")).lower()
            return pid in _loadable

        try:
            from runtime.installer import PROVIDER_METADATA  # noqa: PLC0415
            _vram_map = {k: v.get("vram_required_mb", 0) for k, v in PROVIDER_METADATA.items()}
        except Exception:
            _vram_map = {}

        def _vram(meta_id: str) -> int:
            return _vram_map.get(meta_id, 0)

        # Hardcode some available models based on requirements for discoverability
        _raw = [
            {
                "id": "hunyuan3d-2.1",
                "label": "Hunyuan3D 2.1",
                "name": "tencent/Hunyuan3D-2.1",
                "category": "3d_generation",
                "description": "State-of-the-art text/image to 3D model",
                "author": "Tencent",
                "installed": False,
                "size_mb": 15000,
                "vram_required_mb": _vram("hunyuan3d-2.1"),
                "speed_seconds": 90,
                "workspace_compatibility": ["mesh-generation", "texture-generation", "post-processing"],
                "manifest": {
                    "name": "Hunyuan3D 2.1",
                    "version": "2.1",
                    "category": "3d_generation",
                    "description": "Hunyuan3D generation",
                    "author": "Tencent",
                    "license": "Apache-2.0",
                    "min_vram_mb": 12000,
                    "recommended_vram_mb": 16000,
                    "cuda_required": True,
                    "cuda_min_version": "11.8",
                    "python_min": "3.10",
                    "supported_os": ["linux", "windows"],
                    "supported_architectures": ["x86_64"],
                    "disk_space_mb": 20000,
                    "capabilities": {
                        "text_to_3d": True,
                        "image_to_3d": True,
                        "texture_generation": True,
                    },
                    "dependencies": {"python_packages": []},
                    "download_sources": [],
                    "runtime": {"type": "python", "entrypoint": "", "inference_class": ""}
                }
            },
            {
                "id": "hunyuan3d-2",
                "label": "Hunyuan3D 2",
                "name": "tencent/Hunyuan3D-2",
                "category": "3d_generation",
                "description": "Full Hunyuan 3D pipeline with textured output",
                "author": "Tencent",
                "installed": False,
                "size_mb": 24000,
                "vram_required_mb": _vram("hunyuan3d-2"),
                "speed_seconds": 120,
                "workspace_compatibility": ["mesh-generation", "texture-generation", "post-processing"],
                "manifest": {
                    "name": "Hunyuan3D 2",
                    "version": "2.0",
                    "category": "3d_generation",
                    "description": "Hunyuan3D 2 full pipeline",
                    "author": "Tencent",
                    "license": "Apache-2.0",
                    "min_vram_mb": 20000,
                    "recommended_vram_mb": 24000,
                    "cuda_required": True,
                    "cuda_min_version": "11.8",
                    "python_min": "3.10",
                    "supported_os": ["linux", "windows"],
                    "supported_architectures": ["x86_64"],
                    "disk_space_mb": 30000,
                    "capabilities": {
                        "text_to_3d": True,
                        "image_to_3d": True,
                        "texture_generation": True,
                    },
                    "dependencies": {"python_packages": []},
                    "download_sources": [],
                    "runtime": {"type": "python", "entrypoint": "", "inference_class": ""}
                }
            },
            {
                "id": "hunyuan3d-2-mini",
                "label": "Hunyuan3D-2 Mini",
                "name": "tencent/Hunyuan3D-2mini",
                "category": "3d_generation",
                "description": "Fast 0.6B image-to-shape model",
                "author": "Tencent",
                "installed": False,
                "size_mb": 4000,
                "vram_required_mb": _vram("hunyuan3d-2-mini"),
                "speed_seconds": 45,
                "workspace_compatibility": ["mesh-generation"],
                "manifest": {
                    "name": "Hunyuan3D-2 Mini",
                    "version": "2.0-mini",
                    "category": "3d_generation",
                    "description": "Hunyuan3D-2 Mini 0.6B fast image-to-shape",
                    "author": "Tencent",
                    "license": "Tencent Hunyuan Community",
                    "min_vram_mb": 4096,
                    "recommended_vram_mb": 6144,
                    "cuda_required": True,
                    "cuda_min_version": "11.8",
                    "python_min": "3.10",
                    "supported_os": ["linux", "windows"],
                    "supported_architectures": ["x86_64"],
                    "disk_space_mb": 5000,
                    "capabilities": {
                        "text_to_3d": False,
                        "image_to_3d": True,
                        "texture_generation": True,
                    },
                    "dependencies": {"python_packages": []},
                    "download_sources": [],
                    "runtime": {"type": "python", "entrypoint": "", "inference_class": ""}
                }
            },
            {
                "id": "trellis",
                "label": "Trellis",
                "name": "microsoft/TRELLIS-image-large",
                "category": "3d_generation",
                "description": "High-quality 3D generation",
                "author": "JeffreyXiang/Microsoft",
                "installed": False,
                "size_mb": 5000,
                "vram_required_mb": _vram("trellis"),
                "speed_seconds": 60,
                "workspace_compatibility": ["mesh-generation", "texture-generation"],
                "manifest": {
                    "name": "TRELLIS",
                    "version": "1.0",
                    "category": "3d_generation",
                    "description": "Trellis 3D generation",
                    "author": "Microsoft",
                    "license": "MIT",
                    "min_vram_mb": 8000,
                    "recommended_vram_mb": 8000,
                    "cuda_required": True,
                    "cuda_min_version": "11.8",
                    "python_min": "3.10",
                    "supported_os": ["linux", "windows"],
                    "supported_architectures": ["x86_64"],
                    "disk_space_mb": 10000,
                    "capabilities": {
                        "image_to_3d": True,
                        "text_to_3d": True,
                        "texture_generation": True,
                    },
                    "dependencies": {"python_packages": []},
                    "download_sources": [],
                    "runtime": {"type": "python", "entrypoint": "", "inference_class": ""}
                }
            },
            {
                "id": "anigen",
                "label": "AniGen",
                "name": "VAST-AI-Research/AniGen",
                "category": "rigging",
                "description": "Automatic skeletal rigging for 3D character meshes from 2D images",
                "author": "VAST-AI",
                "installed": False,
                "size_mb": 2000,
                "vram_required_mb": _vram("anigen"),
                "speed_seconds": 30,
                "workspace_compatibility": ["rigging", "animation"],
                "manifest": {
                    "name": "AniGen",
                    "version": "1.0",
                    "category": "rigging",
                    "description": "Automatic character rigging and animation",
                    "author": "VAST-AI",
                    "license": "Apache-2.0",
                    "min_vram_mb": 6200,
                    "recommended_vram_mb": 6200,
                    "cuda_required": True,
                    "cuda_min_version": "11.8",
                    "python_min": "3.10",
                    "supported_os": ["linux"],
                    "supported_architectures": ["x86_64"],
                    "disk_space_mb": 3000,
                    "capabilities": {
                        "rigging_animation": True,
                    },
                    "dependencies": {"python_packages": []},
                    "download_sources": [],
                    "runtime": {"type": "python", "entrypoint": "", "inference_class": ""}
                }
            },
            {
                "id": "unirig",
                "label": "UniRig",
                "name": "VAST-AI-Research/UniRig",
                "category": "rigging",
                "description": "Universal rigging system for automatic skeleton generation across diverse 3D characters",
                "author": "VAST-AI",
                "installed": False,
                "size_mb": 2048,
                "vram_required_mb": _vram("unirig"),
                "speed_seconds": 20,
                "workspace_compatibility": ["rigging", "animation"],
                "manifest": {
                    "name": "UniRig",
                    "version": "1.0",
                    "category": "rigging",
                    "description": "Universal character rigging",
                    "author": "VAST-AI",
                    "license": "Apache-2.0",
                    "min_vram_mb": 6000,
                    "recommended_vram_mb": 8000,
                    "cuda_required": True,
                    "cuda_min_version": "11.8",
                    "python_min": "3.10",
                    "supported_os": ["linux"],
                    "supported_architectures": ["x86_64"],
                    "disk_space_mb": 2048,
                    "capabilities": {
                        "rigging_animation": True,
                    },
                    "dependencies": {"python_packages": []},
                    "download_sources": [],
                    "runtime": {"type": "python", "entrypoint": "", "inference_class": ""}
                }
            },
            {
                "id": "detailgen3d",
                "label": "DetailGen3D",
                "name": "detailgen3d",
                "category": "post_processing",
                "description": "Post-processes coarse 3D meshes with high-frequency geometric details",
                "author": "Internal",
                "installed": False,
                "size_mb": 500,
                "vram_required_mb": _vram("detailgen3d"),
                "speed_seconds": 15,
                "workspace_compatibility": ["post-processing"],
                "manifest": {
                    "name": "DetailGen3D",
                    "version": "1.0",
                    "category": "post_processing",
                    "description": "Mesh detail enhancement pass",
                    "author": "Internal",
                    "license": "MIT",
                    "min_vram_mb": 4000,
                    "recommended_vram_mb": 4000,
                    "cuda_required": True,
                    "cuda_min_version": "11.8",
                    "python_min": "3.10",
                    "supported_os": ["linux", "windows"],
                    "supported_architectures": ["x86_64"],
                    "disk_space_mb": 1000,
                    "capabilities": {
                        "detail_enhancement": True,
                    },
                    "dependencies": {"python_packages": []},
                    "download_sources": [],
                    "runtime": {"type": "python", "entrypoint": "", "inference_class": ""}
                }
            },
        ]

        return [m for m in _raw if _ok(m)]
    async def get_installed_models(self) -> list[dict[str, Any]]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(InstalledModel))
            models = result.scalars().all()
            
            output = []
            for m in models:
                output.append({
                    "id": m.id,
                    "label": m.manifest.get("name", m.id) if m.manifest else m.id,
                    "name": m.manifest.get("author", "Unknown") + "/" + m.manifest.get("name", m.id) if m.manifest else m.id,
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
