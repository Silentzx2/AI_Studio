"""ComfyUI artifact handling for output files."""

import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ArtifactManager:
    """Manages ComfyUI output artifacts and integrates with AI Studio storage."""

    def __init__(self):
        self.storage_root = Path(settings.storage_local_path)
        self.outputs_dir = self.storage_root / "models"
        self.outputs_dir.mkdir(parents=True, exist_ok=True)

        # ComfyUI output directory
        self.comfyui_output_dir = Path(settings.third_party_dir) / "ComfyUI" / "output"
        # Also check ENGINE/ComfyUI/output
        self.engine_output_dir = Path("ENGINE/ComfyUI/output")

    def get_job_dir(self, job_id: str) -> Path:
        """Get the job-specific output directory."""
        job_dir = self.outputs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        return job_dir

    def find_comfyui_outputs(self, prompt_id: str, prefix: str = "") -> list[Path]:
        """Find ComfyUI output files for a given prompt ID."""
        outputs = []

        # Check both output directories
        for output_dir in [self.comfyui_output_dir, self.engine_output_dir]:
            if output_dir.exists():
                # Look for files matching the prompt ID or prefix
                pattern = f"*{prompt_id}*" if prompt_id else f"{prefix}*"
                for file_path in output_dir.rglob(pattern):
                    if file_path.is_file():
                        outputs.append(file_path)

        return outputs

    def copy_outputs_to_job(self, job_id: str, prompt_id: str, prefix: str = "") -> list[Path]:
        """Copy ComfyUI outputs to job directory."""
        job_dir = self.get_job_dir(job_id)
        copied_files = []

        outputs = self.find_comfyui_outputs(prompt_id, prefix)
        for src_file in outputs:
            # Determine target filename
            if src_file.suffix in [".png", ".jpg", ".jpeg", ".webp"]:
                target_name = "thumbnail.png"
            elif src_file.suffix in [".glb", ".gltf", ".obj", ".fbx", ".stl", ".ply"]:
                target_name = f"model{src_file.suffix}"
            else:
                target_name = src_file.name

            target_path = job_dir / target_name

            # Handle duplicate names
            counter = 1
            while target_path.exists():
                stem = target_path.stem
                suffix = target_path.suffix
                target_path = job_dir / f"{stem}_{counter}{suffix}"
                counter += 1

            shutil.copy2(src_file, target_path)
            copied_files.append(target_path)
            logger.info(f"Copied {src_file} to {target_path}")

        return copied_files

    def register_artifacts(self, job_id: str, copied_files: list[Path]) -> dict[str, Any]:
        """Register artifacts and return metadata for database."""
        metadata = {
            "model_url": None,
            "thumbnail_url": None,
            "download_urls": {},
            "file_size": None,
            "polygon_count": None,
            "vertex_count": None,
        }

        for file_path in copied_files:
            rel_path = file_path.relative_to(self.storage_root)
            url = f"/static/{rel_path}"

            if file_path.suffix in [".glb", ".gltf"]:
                metadata["model_url"] = url
                metadata["download_urls"]["glb"] = url
                # Try to get file size
                try:
                    metadata["file_size"] = file_path.stat().st_size
                except OSError:
                    pass
            elif file_path.suffix in [".obj"]:
                metadata["download_urls"]["obj"] = url
            elif file_path.suffix in [".fbx"]:
                metadata["download_urls"]["fbx"] = url
            elif file_path.suffix in [".stl"]:
                metadata["download_urls"]["stl"] = url
            elif file_path.suffix in [".ply"]:
                metadata["download_urls"]["ply"] = url
            elif file_path.name == "thumbnail.png" or file_path.suffix in [".png", ".jpg", ".jpeg", ".webp"]:
                metadata["thumbnail_url"] = url

        return metadata

    def extract_mesh_metadata(self, file_path: Path) -> dict[str, Any]:
        """Extract metadata from mesh file using trimesh if available."""
        metadata = {}
        try:
            import trimesh
            mesh = trimesh.load(str(file_path))
            metadata["polygon_count"] = len(mesh.faces) if hasattr(mesh, "faces") else None
            metadata["vertex_count"] = len(mesh.vertices) if hasattr(mesh, "vertices") else None
            metadata["bounding_box"] = mesh.bounds.tolist() if hasattr(mesh, "bounds") else None

            if hasattr(mesh, "extents"):
                extents = mesh.extents
                metadata["dimensions"] = {
                    "x": float(extents[0]),
                    "y": float(extents[1]),
                    "z": float(extents[2]),
                }
        except ImportError:
            logger.debug("trimesh not available for metadata extraction")
        except Exception as e:
            logger.warning(f"Failed to extract mesh metadata: {e}")

        return metadata

    def process_job_outputs(self, job_id: str, prompt_id: str, prefix: str = "") -> dict[str, Any]:
        """Process all outputs for a job."""
        copied_files = self.copy_outputs_to_job(job_id, prompt_id, prefix)

        # Register artifacts
        metadata = self.register_artifacts(job_id, copied_files)

        # Extract mesh metadata from model file
        if metadata["model_url"]:
            model_filename = metadata["model_url"].split("/")[-1]
            model_path = self.get_job_dir(job_id) / model_filename
            if model_path.exists():
                mesh_meta = self.extract_mesh_metadata(model_path)
                metadata.update(mesh_meta)

        return metadata


# Global artifact manager instance
_artifact_manager: Optional[ArtifactManager] = None


def get_artifact_manager() -> ArtifactManager:
    global _artifact_manager
    if _artifact_manager is None:
        _artifact_manager = ArtifactManager()
    return _artifact_manager