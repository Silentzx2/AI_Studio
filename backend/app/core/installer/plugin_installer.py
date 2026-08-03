"""Plugin installer for model installation"""
import json
import shutil
from pathlib import Path
from typing import Any, Callable


class PluginInstaller:
    """Manages model plugin installation"""
    
    def __init__(self, storage_path: str):
        self.storage_path = Path(storage_path)
        self.models_dir = self.storage_path / "models"
        self.models_dir.mkdir(parents=True, exist_ok=True)
    
    async def install_model(
        self,
        model_id: str,
        download_path: Path,
        manifest: dict[str, Any],
        progress_callback: Callable | None = None
    ) -> bool:
        # Install a downloaded model
        
        try:
            model_dir = self.models_dir / model_id
            model_dir.mkdir(parents=True, exist_ok=True)
            
            # Update progress
            if progress_callback:
                await progress_callback({
                    "stage": "extracting",
                    "model_id": model_id,
                    "percent": 0
                })
            
            # Move/extract model files
            if download_path.is_file():
                if download_path.suffix in [".zip", ".tar", ".gz"]:
                    # Extract archive
                    await self._extract_archive(download_path, model_dir)
                else:
                    # Copy single file
                    shutil.copy2(download_path, model_dir / download_path.name)
            else:
                # Copy directory
                if model_dir.exists():
                    shutil.rmtree(model_dir)
                shutil.copytree(download_path, model_dir)
            
            # Save manifest
            manifest_path = model_dir / "manifest.json"
            with open(manifest_path, "w") as f:
                json.dump(manifest, f, indent=2)
            
            if progress_callback:
                await progress_callback({
                    "stage": "installed",
                    "model_id": model_id,
                    "percent": 100
                })
            
            return True
            
        except Exception as e:
            print(f"Installation error: {e}")
            # Cleanup on failure
            model_dir = self.models_dir / model_id
            if model_dir.exists():
                shutil.rmtree(model_dir)
            return False
    
    async def _extract_archive(self, archive_path: Path, target_dir: Path):
        # Extract archive file
        import tarfile
        import zipfile
        
        if archive_path.suffix == ".zip":
            with zipfile.ZipFile(archive_path, "r") as zf:
                zf.extractall(target_dir)
        
        elif archive_path.suffix in [".tar", ".gz"]:
            mode = "r:gz" if archive_path.suffix == ".gz" else "r"
            with tarfile.open(archive_path, mode) as tf:
                tf.extractall(target_dir)
    
    async def uninstall_model(self, model_id: str) -> bool:
        # Uninstall a model
        
        try:
            model_dir = self.models_dir / model_id
            if model_dir.exists():
                shutil.rmtree(model_dir)
            return True
        except Exception as e:
            print(f"Uninstall error: {e}")
            return False
    
    async def get_installed_models(self) -> list[dict[str, Any]]:
        # Get list of installed models with their manifests
        
        models = []
        
        for model_dir in self.models_dir.iterdir():
            if model_dir.is_dir():
                manifest_path = model_dir / "manifest.json"
                if manifest_path.exists():
                    with open(manifest_path) as f:
                        manifest = json.load(f)
                        manifest["model_id"] = model_dir.name
                        manifest["install_path"] = str(model_dir)
                        models.append(manifest)
        
        return models
    
    async def get_model_manifest(self, model_id: str) -> dict[str, Any] | None:
        # Get manifest for specific installed model
        
        manifest_path = self.models_dir / model_id / "manifest.json"
        
        if manifest_path.exists():
            with open(manifest_path) as f:
                return json.load(f)
        
        return None
    
    async def update_model_manifest(self, model_id: str, manifest: dict[str, Any]) -> bool:
        # Update model manifest
        
        try:
            manifest_path = self.models_dir / model_id / "manifest.json"
            with open(manifest_path, "w") as f:
                json.dump(manifest, f, indent=2)
            return True
        except Exception as e:
            print(f"Update manifest error: {e}")
            return False
