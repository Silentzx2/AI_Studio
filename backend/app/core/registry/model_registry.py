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
        # Hardcode some available models based on requirements for discoverability
        return [
            {
                "id": "hunyuan3d-2.1",
                "label": "Hunyuan3D 2.1",
                "name": "tencent/Hunyuan3D-2.1",
                "category": "3d_generation",
                "description": "State-of-the-art text/image to 3D model",
                "author": "Tencent",
                "installed": False,
                "size_mb": 15000,
                "vram_required_mb": 16000,
                "speed_seconds": 90,
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
                "id": "triposr",
                "label": "TripoSR",
                "name": "VAST-AI/TripoSR",
                "category": "3d_generation",
                "description": "Fast feedforward 3D reconstruction from a single image",
                "author": "VAST-AI",
                "installed": False,
                "size_mb": 2000,
                "vram_required_mb": 6000,
                "speed_seconds": 1,
                "manifest": {
                    "name": "TripoSR",
                    "version": "1.0",
                    "category": "3d_generation",
                    "description": "Fast 3D generation",
                    "author": "VAST",
                    "license": "MIT",
                    "min_vram_mb": 4000,
                    "recommended_vram_mb": 8000,
                    "cuda_required": True,
                    "cuda_min_version": "11.8",
                    "python_min": "3.10",
                    "supported_os": ["linux", "windows", "macos"],
                    "supported_architectures": ["x86_64", "arm64"],
                    "disk_space_mb": 5000,
                    "capabilities": {
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
                "name": "JeffreyXiang/TRELLIS-image-large",
                "category": "3d_generation",
                "description": "High-quality 3D generation",
                "author": "JeffreyXiang",
                "installed": False,
                "size_mb": 5000,
                "vram_required_mb": 12000,
                "speed_seconds": 60,
                "manifest": {
                    "name": "Trellis",
                    "version": "1.0",
                    "category": "3d_generation",
                    "description": "Trellis 3D generation",
                    "author": "JeffreyXiang",
                    "license": "MIT",
                    "min_vram_mb": 8000,
                    "recommended_vram_mb": 16000,
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
                "id": "triposg",
                "label": "TripoSG",
                "name": "VAST-AI/TripoSG",
                "category": "3d_generation",
                "description": "High-fidelity single-view 3D shape synthesis",
                "author": "VAST-AI",
                "installed": False,
                "size_mb": 6000,
                "vram_required_mb": 12000,
                "speed_seconds": 45,
                "manifest": {
                    "name": "TripoSG",
                    "version": "1.0",
                    "category": "3d_generation",
                    "description": "Detailed 3D geometry synthesis",
                    "author": "VAST-AI",
                    "license": "Apache-2.0",
                    "min_vram_mb": 12000,
                    "recommended_vram_mb": 12000,
                    "cuda_required": True,
                    "cuda_min_version": "11.8",
                    "python_min": "3.10",
                    "supported_os": ["linux"],
                    "supported_architectures": ["x86_64"],
                    "disk_space_mb": 12000,
                    "capabilities": {
                        "image_to_3d": True,
                        "detail_enhancement": True,
                    },
                    "dependencies": {"python_packages": []},
                    "download_sources": [],
                    "runtime": {"type": "python", "entrypoint": "", "inference_class": ""}
                }
            },
            {
                "id": "triposf",
                "label": "TripoSF",
                "name": "VAST-AI/TripoSF",
                "category": "3d_generation",
                "description": "High-resolution 1024³ arbitrary-topology 3D shape generation",
                "author": "VAST-AI",
                "installed": False,
                "size_mb": 6000,
                "vram_required_mb": 12000,
                "speed_seconds": 60,
                "manifest": {
                    "name": "TripoSF",
                    "version": "1.0",
                    "category": "3d_generation",
                    "description": "High-resolution sparse-flex 3D synthesis",
                    "author": "VAST-AI",
                    "license": "Apache-2.0",
                    "min_vram_mb": 12000,
                    "recommended_vram_mb": 12000,
                    "cuda_required": True,
                    "cuda_min_version": "11.8",
                    "python_min": "3.10",
                    "supported_os": ["linux"],
                    "supported_architectures": ["x86_64"],
                    "disk_space_mb": 12000,
                    "capabilities": {
                        "image_to_3d": True,
                        "detail_enhancement": True,
                    },
                    "dependencies": {"python_packages": []},
                    "download_sources": [],
                    "runtime": {"type": "python", "entrypoint": "", "inference_class": ""}
                }
            },
            {
                "id": "unirig",
                "label": "UniRig",
                "name": "VAST-AI/UniRig",
                "category": "rigging",
                "description": "Automatic skeletal rigging for 3D meshes",
                "author": "VAST-AI",
                "installed": False,
                "size_mb": 2000,
                "vram_required_mb": 8000,
                "speed_seconds": 30,
                "manifest": {
                    "name": "UniRig",
                    "version": "1.0",
                    "category": "rigging",
                    "description": "Rigging and animation helper",
                    "author": "VAST-AI",
                    "license": "Apache-2.0",
                    "min_vram_mb": 8000,
                    "recommended_vram_mb": 8000,
                    "cuda_required": True,
                    "cuda_min_version": "11.8",
                    "python_min": "3.10",
                    "supported_os": ["linux"],
                    "supported_architectures": ["x86_64"],
                    "disk_space_mb": 3000,
                    "capabilities": {
                        "rigging": True,
                        "animation": True,
                    },
                    "dependencies": {"python_packages": []},
                    "download_sources": [],
                    "runtime": {"type": "python", "entrypoint": "", "inference_class": ""}
                }
            },
            {
                "id": "holopart",
                "label": "HoloPart",
                "name": "VAST-AI/HoloPart",
                "category": "post_processing",
                "description": "Part completion and semantic mesh enhancement",
                "author": "VAST-AI",
                "installed": False,
                "size_mb": 3000,
                "vram_required_mb": 8000,
                "speed_seconds": 20,
                "manifest": {
                    "name": "HoloPart",
                    "version": "1.0",
                    "category": "post_processing",
                    "description": "Part completion and enhancement",
                    "author": "VAST-AI",
                    "license": "Apache-2.0",
                    "min_vram_mb": 8000,
                    "recommended_vram_mb": 8000,
                    "cuda_required": True,
                    "cuda_min_version": "11.8",
                    "python_min": "3.10",
                    "supported_os": ["linux"],
                    "supported_architectures": ["x86_64"],
                    "disk_space_mb": 5000,
                    "capabilities": {
                        "detail_enhancement": True,
                        "texture_generation": True,
                    },
                    "dependencies": {"python_packages": []},
                    "download_sources": [],
                    "runtime": {"type": "python", "entrypoint": "", "inference_class": ""}
                }
            }
        ]
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
