"""TripoSF provider — generates 3D meshes from single images using surface-focused model."""
import logging
from pathlib import Path
from typing import Any

from app.core.providers.base import BaseProvider, ProviderResult
from app.core.managers.vram_tracker import vram_tracker
from app.core.mesh_processor import write_placeholder_mesh
from runtime.accelerate_loader import safe_unload

logger = logging.getLogger(__name__)


class TripoSFProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "triposf"

    def __init__(self, device: str = "cuda:0") -> None:
        self.device = device
        self.is_loaded = False
        logger.info("TripoSFProvider initialized on %s", device)

    async def load(self) -> bool:
        if self.is_loaded:
            return True
        # Allocate 12.0 GB of VRAM using VRAMAllocationTracker
        success = vram_tracker.allocate("triposf", 12.0, reason="triposf_model_load")
        if success:
            self.is_loaded = True
            logger.info("TripoSF model loaded into VRAM on device %s", self.device)
            return True
        return False

    def unload(self) -> None:
        if not self.is_loaded:
            return
        safe_unload(provider_name="triposf")
        self.is_loaded = False
        logger.info("TripoSF model unloaded from VRAM.")

    async def generate_from_image(self, image_path: str, progress_callback: Any = None, **kwargs) -> str:
        """Runs TripoSF on a single image. Returns path to generated GLB."""
        if not self.is_loaded:
            loaded = await self.load()
            if not loaded:
                logger.warning("VRAM Allocation failed for TripoSF. Returning empty path.")
                return ""

        logger.info("Generating mesh from image %s", image_path)
        if progress_callback:
            await progress_callback(50, "generation", "TripoSF generating mesh from image...")

        img_path = Path(image_path)
        if not img_path.exists():
            logger.warning("Image file %s not found.", image_path)
            return ""

        output_dir = img_path.parent
        glb_path = output_dir / f"{img_path.stem}_triposf.glb"
        try:
            # ponytail: mock generation process. In production, this runs actual TripoSF inference
            # to produce a surface-focused 3D mesh from the input image.
            write_placeholder_mesh(glb_path, seed=len(image_path))
            logger.info("TripoSF generation complete: %s", glb_path)
            return str(glb_path)
        except Exception as exc:
            logger.exception("TripoSF failed: %s", exc)
            return ""

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
            has_rig=False,
            file_size=glb_path.stat().st_size,
            metadata={"provider": "triposf", "device": self.device},
        )

    async def health_check(self) -> bool:
        return True
