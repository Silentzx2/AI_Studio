"""ComfyUI artifact handling for output files.

Guarantees canonical storage paths and preserves immutable master 'source.glb'.
"""

import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional

from app.config import get_settings
from app.core.paths import engine_dir

logger = logging.getLogger(__name__)
settings = get_settings()


class ArtifactManager:
    """Manages ComfyUI output artifacts and integrates with AI Studio storage."""

    def __init__(self):
        self.storage_root = Path(settings.storage_local_path)
        self.outputs_dir = self.storage_root / "models"
        self.outputs_dir.mkdir(parents=True, exist_ok=True)

        # Single canonical ComfyUI output directory (repo-root relative).
        self.engine_output_dir = engine_dir("ComfyUI", "output")
        self.engine_output_dir.mkdir(parents=True, exist_ok=True)

    def get_job_dir(self, job_id: str) -> Path:
        """Get the job-specific output directory."""
        job_dir = self.outputs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        return job_dir

    def find_comfyui_outputs(
        self, prompt_id: str, prefix: str = "", history_outputs: Optional[dict] = None
    ) -> List[Path]:
        """Find ComfyUI output files for a given prompt ID or file prefix.
        
        Strictly matches exact history outputs, job ID prefix, or prompt ID.
        Never falls back to arbitrary newest files.
        """
        outputs = []
        seen = set()

        # 1. Direct resolution from ComfyUI history outputs metadata
        if history_outputs and isinstance(history_outputs, dict):
            for node_id, node_out in history_outputs.items():
                if isinstance(node_out, dict):
                    for key in ("mesh", "images", "files", "gifs", "3d"):
                        items = node_out.get(key, [])
                        if isinstance(items, list):
                            for item in items:
                                if isinstance(item, dict) and "filename" in item:
                                    subfolder = item.get("subfolder", "")
                                    target_p = self.engine_output_dir / subfolder / item["filename"]
                                    if target_p.exists() and str(target_p) not in seen:
                                        outputs.append(target_p)
                                        seen.add(str(target_p))

        # 2. Strict search by job ID prefix or prompt ID
        if self.engine_output_dir.exists():
            if prefix:
                for file_path in self.engine_output_dir.rglob(f"*{prefix}*"):
                    if file_path.is_file() and not file_path.name.startswith(".") and str(file_path) not in seen:
                        outputs.append(file_path)
                        seen.add(str(file_path))
            if not outputs and prompt_id:
                for file_path in self.engine_output_dir.rglob(f"*{prompt_id}*"):
                    if file_path.is_file() and not file_path.name.startswith(".") and str(file_path) not in seen:
                        outputs.append(file_path)
                        seen.add(str(file_path))

        return outputs

    def copy_outputs_to_job(
        self, job_id: str, prompt_id: str, prefix: str = "", history_outputs: Optional[dict] = None
    ) -> List[Path]:
        """Copy ComfyUI outputs to job directory, preserving immutable source.glb."""
        job_dir = self.get_job_dir(job_id)
        copied_files = []

        outputs = self.find_comfyui_outputs(prompt_id, prefix, history_outputs=history_outputs)
        for src_file in outputs:
            if src_file.suffix in [".png", ".jpg", ".jpeg", ".webp"]:
                target_path = job_dir / "thumbnail.png"
                shutil.copy2(src_file, target_path)
                copied_files.append(target_path)
            elif src_file.suffix in [".glb", ".gltf"]:
                # Preserve immutable source.glb master
                source_path = job_dir / "source.glb"
                shutil.copy2(src_file, source_path)
                copied_files.append(source_path)

                # Copy to model.glb for viewer compatibility
                model_path = job_dir / f"model{src_file.suffix}"
                shutil.copy2(src_file, model_path)
                copied_files.append(model_path)
                logger.info("Preserved master source.glb and model.glb in %s", job_dir)
            else:
                target_path = job_dir / src_file.name
                shutil.copy2(src_file, target_path)
                copied_files.append(target_path)

        return copied_files

    def register_artifacts(self, job_id: str, copied_files: List[Path]) -> dict[str, Any]:
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

            if file_path.name in ["model.glb", "source.glb"] or file_path.suffix in [".glb", ".gltf"]:
                metadata["model_url"] = url
                metadata["download_urls"]["glb"] = url
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
            elif file_path.name == "thumbnail.png" or file_path.suffix in [".png", ".jpg", ".jpeg", ".webp"]:
                metadata["thumbnail_url"] = url

        return metadata

    def extract_mesh_metadata(self, file_path: Path) -> dict[str, Any]:
        """Extract polygon and vertex metadata from mesh file."""
        metadata = {}
        try:
            import trimesh
            mesh = trimesh.load(str(file_path))
            metadata["polygon_count"] = len(mesh.faces) if hasattr(mesh, "faces") else None
            metadata["vertex_count"] = len(mesh.vertices) if hasattr(mesh, "vertices") else None
            if hasattr(mesh, "extents"):
                extents = mesh.extents
                metadata["dimensions"] = {
                    "x": float(extents[0]),
                    "y": float(extents[1]),
                    "z": float(extents[2]),
                }
        except Exception as e:
            logger.debug("Failed to extract mesh metadata: %s", e)

        return metadata

    def process_job_outputs(
        self, job_id: str, prompt_id: str, prefix: str = "", history_outputs: Optional[dict] = None
    ) -> dict[str, Any]:
        """Process all outputs for a job and ensure master exists."""
        copied_files = self.copy_outputs_to_job(job_id, prompt_id, prefix, history_outputs=history_outputs)
        metadata = self.register_artifacts(job_id, copied_files)

        # Extract mesh metadata if master source.glb or model.glb exists
        job_dir = self.get_job_dir(job_id)
        mesh_path = job_dir / "source.glb"
        if not mesh_path.exists():
            mesh_path = job_dir / "model.glb"

        if mesh_path.exists():
            mesh_meta = self.extract_mesh_metadata(mesh_path)
            metadata.update(mesh_meta)

        return metadata


_artifact_manager: Optional[ArtifactManager] = None


def get_artifact_manager() -> ArtifactManager:
    global _artifact_manager
    if _artifact_manager is None:
        _artifact_manager = ArtifactManager()
    return _artifact_manager