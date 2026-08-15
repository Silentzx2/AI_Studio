"""TripoSG provider — real image-to-3D mesh generation."""
import asyncio
import logging
import sys
from pathlib import Path
from typing import Any

from app.core.providers.base import BaseProvider, ProviderResult
from app.core.managers.vram_tracker import vram_tracker
from app.core.mesh_processor import write_placeholder_mesh
from runtime.accelerate_loader import safe_unload
from runtime.storage import get_storage_config

logger = logging.getLogger(__name__)

# ponytail: TripoSG repo lives under the storage third_party dir (per-model
# layout). The old parents[4]/third_party guess pointed at the project root and
# never resolved (same bug as anigen_provider). Resolve via get_storage_config.
TRIPOSG_REPO = get_storage_config().get_repo_path("TripoSG")
TRIPOSG_SCRIPTS = TRIPOSG_REPO / "scripts"
for p in (TRIPOSG_REPO, TRIPOSG_SCRIPTS):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

try:
    import torch
    import trimesh
    import numpy as np
    from PIL import Image
    from huggingface_hub import snapshot_download
    from triposg.pipelines.pipeline_triposg import TripoSGPipeline
    from image_process import prepare_image
    from briarmbg import BriaRMBG
    _HAS_DEPS = True
except Exception as exc:
    logger.warning("TripoSG deps not available: %s", exc)
    _HAS_DEPS = False


class TripoSGLocalProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "triposg"

    def __init__(self, device: str = "cuda:0") -> None:
        self.device = device
        self.is_loaded = False
        self.pipe = None
        self.rmbg_net = None
        self.triposg_weights_dir = None
        self.rmbg_weights_dir = None
        logger.info("TripoSGLocalProvider initialized on %s", device)

    async def load(self) -> bool:
        if self.is_loaded:
            return True
        if not _HAS_DEPS:
            logger.error("TripoSG dependencies not installed")
            return False
        # Allocate ~8 GB of VRAM using VRAMAllocationTracker
        success = vram_tracker.allocate("triposg", 8.0, reason="triposg_model_load")
        if not success:
            return False
        storage = get_storage_config()
        self.triposg_weights_dir = storage.get_weight_path("triposg")
        if not self.triposg_weights_dir:
            logger.error("TripoSG weights not found")
            vram_tracker.release("triposg")
            return False
        # RMBG weights are downloaded lazily by the provider (matches official script)
        self.rmbg_weights_dir = self.triposg_weights_dir.parent / "RMBG-1.4"
        try:
            # Load RMBG for background removal
            self.rmbg_net = BriaRMBG.from_pretrained(str(self.rmbg_weights_dir)).to(self.device)
            self.rmbg_net.eval()

            # Load TripoSG pipeline
            self.pipe = TripoSGPipeline.from_pretrained(str(self.triposg_weights_dir)).to(
                self.device, dtype=torch.float16
            )
            self.is_loaded = True
            logger.info("TripoSG model loaded into VRAM on device %s", self.device)
            return True
        except Exception as exc:
            logger.exception("TripoSG load failed: %s", exc)
            vram_tracker.release("triposg")
            return False

    def unload(self) -> None:
        if not self.is_loaded:
            return
        self.pipe = None
        self.rmbg_net = None
        safe_unload(provider_name="triposg")
        self.is_loaded = False
        logger.info("TripoSG model unloaded from VRAM.")

    async def generate(self, request: Any, output_dir: str, progress_callback: Any = None) -> ProviderResult:
        if not self.is_loaded:
            await self.load()
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        glb_path = output_path / "model.glb"

        # Resolve reference image
        image_path = getattr(request, "reference_image_url", None)
        if not image_path:
            logger.warning("No reference image provided for TripoSG; using placeholder.")
            stats = write_placeholder_mesh(glb_path)
            return ProviderResult(
                model_path=str(glb_path),
                thumbnail_path="",
                polygon_count=stats["polygon_count"],
                vertex_count=stats["vertex_count"],
                texture_resolution="",
                has_rig=False,
                file_size=glb_path.stat().st_size,
                metadata={"provider": "triposg", "device": self.device},
            )

        if progress_callback:
            await progress_callback(10, "generating", "Preparing image for TripoSG...")

        try:
            # Prepare image with background removal
            img_pil = prepare_image(
                image_path,
                bg_color=np.array([1.0, 1.0, 1.0]),
                rmbg_net=self.rmbg_net
            )

            if progress_callback:
                await progress_callback(30, "generating", "Running TripoSG inference...")

            # Run inference
            with torch.no_grad():
                outputs = self.pipe(
                    image=img_pil,
                    generator=torch.Generator(device=self.pipe.device).manual_seed(42),
                    num_inference_steps=50,
                    guidance_scale=7.0,
                ).samples[0]

            if progress_callback:
                await progress_callback(80, "generating", "Exporting mesh...")

            # Convert to trimesh and export
            mesh = trimesh.Trimesh(
                outputs[0].astype(np.float32),
                np.ascontiguousarray(outputs[1])
            )
            mesh.export(glb_path, file_type="glb")

            stats = {
                "polygon_count": len(mesh.faces),
                "vertex_count": len(mesh.vertices),
            }

            logger.info("TripoSG generation complete: %s", glb_path)
            return ProviderResult(
                model_path=str(glb_path),
                thumbnail_path="",
                polygon_count=stats["polygon_count"],
                vertex_count=stats["vertex_count"],
                texture_resolution="",
                has_rig=False,
                file_size=glb_path.stat().st_size,
                metadata={"provider": "triposg", "device": self.device},
            )
        except Exception as exc:
            logger.exception("TripoSG generation failed: %s", exc)
            stats = write_placeholder_mesh(glb_path)
            return ProviderResult(
                model_path=str(glb_path),
                thumbnail_path="",
                polygon_count=stats["polygon_count"],
                vertex_count=stats["vertex_count"],
                texture_resolution="",
                has_rig=False,
                file_size=glb_path.stat().st_size,
                metadata={"provider": "triposg", "device": self.device, "error": str(exc)},
            )

    async def health_check(self) -> bool:
        return _HAS_DEPS and self.is_loaded