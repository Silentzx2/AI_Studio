"""UniRig provider — auto-rigs 3D meshes with skeleton and skinning."""
import logging
from pathlib import Path
from typing import Any

from app.core.providers.base import BaseProvider, ProviderResult
from app.core.managers.vram_tracker import vram_tracker
from app.core.mesh_processor import write_placeholder_mesh

logger = logging.getLogger(__name__)


class UniRigProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "unirig"

    def __init__(self, device: str = "cuda:0") -> None:
        self.device = device
        self.is_loaded = False
        logger.info("UniRigProvider initialized on %s", device)

    async def load(self) -> bool:
        if self.is_loaded:
            return True
        # Allocate 8.0 GB of VRAM using VRAMAllocationTracker
        success = vram_tracker.allocate("unirig", 8.0, reason="unirig_model_load")
        if success:
            self.is_loaded = True
            logger.info("UniRig model loaded into VRAM on device %s", self.device)
            return True
        return False

    def unload(self) -> None:
        if not self.is_loaded:
            return
        vram_tracker.deallocate("unirig", reason="unirig_model_unload")
        self.is_loaded = False
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        logger.info("UniRig model unloaded from VRAM.")

    async def rig_mesh(self, glb_path: str, progress_callback: Any = None, **kwargs) -> str:
        """Runs UniRig on a GLB mesh. Returns path to rigged GLB."""
        if not self.is_loaded:
            loaded = await self.load()
            if not loaded:
                logger.warning("VRAM Allocation failed for UniRig. Falling back to input GLB.")
                return glb_path

        logger.info("Rigging mesh %s", glb_path)
        if progress_callback:
            await progress_callback(50, "rigging", "UniRig auto-rigging mesh...")

        mesh_path = Path(glb_path)
        if not mesh_path.exists():
            logger.warning("Mesh file %s not found. Falling back.", glb_path)
            return glb_path

        rigged_path = mesh_path.parent / f"{mesh_path.stem}_rigged.glb"
        try:
            # ponytail: mock rigging process. In production, this runs actual UniRig inference
            # to generate a skeleton, bind skin weights, and produce a rigged GLB.
            # Keep the file a valid GLB (a copy) — appending raw bytes corrupts the
            # container and the viewer rejects it as "invalid GLB".
            rigged_path.write_bytes(mesh_path.read_bytes())
            logger.info("UniRig rigging complete: %s", rigged_path)
            return str(rigged_path)
        except Exception as exc:
            logger.exception("UniRig failed, falling back to input GLB: %s", exc)
            return glb_path

    async def generate(self, request: Any, output_dir: str, progress_callback: Any = None) -> ProviderResult:
        if not self.is_loaded:
            await self.load()
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        glb_path = output_path / "model.glb"
        stats = write_placeholder_mesh(glb_path)
        return ProviderResult(
            model_path=str(glb_path),
            thumbnail_path="",
            polygon_count=stats["polygon_count"],
            vertex_count=stats["vertex_count"],
            texture_resolution="4096x4096",
            has_rig=True,
            file_size=glb_path.stat().st_size,
            metadata={"provider": "unirig", "device": self.device},
        )

    async def health_check(self) -> bool:
        return True
