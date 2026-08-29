"""WorldGen provider — text/image-to-3D scene generation via Gaussian Splatting.

Wraps the WorldGen pipeline (https://github.com/ZiYang-xie/WorldGen) for both
text-to-scene ("t2s") and image-to-scene ("i2s") modes. Output is a Gaussian
Splat (.ply) or mesh (.glb) depending on the downstream conversion path.
"""
import asyncio
import logging
import sys
from pathlib import Path
from typing import Any

from app.core.providers.base import BaseProvider, ProviderResult, _add_model_env
from app.core.managers.vram_tracker import vram_tracker
from app.core.mesh_processor import write_placeholder_mesh
from runtime.accelerate_loader import safe_unload, verify_gpu_placement
from runtime.storage import get_storage_config

logger = logging.getLogger(__name__)

# ponytail: WorldGen repo lives under the storage third_party dir (per-model
# layout). Resolve via get_storage_config — same pattern as triposg_local.
WORLDGEN_REPO = get_storage_config().get_repo_path("WorldGen")
WORLDGEN_SCRIPTS = WORLDGEN_REPO / "scripts"
for p in (WORLDGEN_REPO, WORLDGEN_SCRIPTS):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

# CRITICAL: prepend the per-model venv's site-packages BEFORE the dependency
# import check so `import worldgen` resolves from the per-model venv.
_add_model_env("WorldGen")

try:
    import torch
    from worldgen import WorldGen
    _HAS_DEPS = True
except Exception as exc:
    logger.warning("WorldGen deps not available: %s", exc)
    _HAS_DEPS = False


class WorldGenLocalProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "worldgen"

    def __init__(self, device: str = "cuda:0", low_vram: bool = False) -> None:
        self.device = device
        self.low_vram = low_vram
        self.is_loaded = False
        self.worldgen = None
        self.weights_dir = None
        logger.info("WorldGenLocalProvider initialized on %s (low_vram=%s)", device, low_vram)

    async def load(self) -> bool:
        if self.is_loaded:
            return True
        if not _HAS_DEPS:
            logger.error("WorldGen dependencies not installed")
            return False
        # Allocate VRAM: 24 GB full, 10 GB low_vram
        vram_gb = 10.0 if self.low_vram else 24.0
        success = vram_tracker.allocate("worldgen", vram_gb, reason="worldgen_model_load")
        if not success:
            return False
        storage = get_storage_config()
        self.weights_dir = storage.get_weight_path("worldgen")
        if not self.weights_dir:
            logger.error("WorldGen weights not found")
            vram_tracker.release("worldgen")
            return False
        try:
            self.worldgen = WorldGen(
                mode="t2s",
                device=torch.device(self.device),
                low_vram=self.low_vram,
            )
            self.is_loaded = True
            verify_gpu_placement(self.worldgen, "worldgen", self.device)
            logger.info("WorldGen model loaded into VRAM on device %s", self.device)
            return True
        except Exception as exc:
            logger.exception("WorldGen load failed: %s", exc)
            vram_tracker.release("worldgen")
            return False

    def unload(self) -> None:
        if not self.is_loaded:
            return
        self.worldgen = None
        safe_unload(provider_name="worldgen")
        self.is_loaded = False
        logger.info("WorldGen model unloaded from VRAM.")

    async def generate(self, request: Any, output_dir: str, progress_callback: Any = None) -> ProviderResult:
        if not self.is_loaded:
            await self.load()
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        ply_path = output_path / "scene.ply"

        # If the model failed to load, return an explicit error result.
        if not self.is_loaded:
            logger.error("WorldGen generate called but model is not loaded (missing dependencies?)")
            stats = write_placeholder_mesh(str(output_path / "model.glb"))
            return ProviderResult(
                model_path=str(ply_path),
                thumbnail_path="",
                polygon_count=0,
                vertex_count=0,
                texture_resolution="",
                has_rig=False,
                file_size=0,
                metadata={"provider": "worldgen", "device": self.device, "error": "model not loaded"},
            )

        # Determine mode from request
        mode = "t2s"
        if request.mode == "image-to-3d" or request.reference_image_url:
            mode = "i2s"

        if progress_callback:
            await progress_callback(10, "generating", f"Preparing WorldGen ({mode})...")

        try:
            # Configure WorldGen for the requested mode
            self.worldgen.mode = mode

            # Apply worldgen-specific params from request
            if request.mood:
                self.worldgen.mood = request.mood
            if request.shape:
                self.worldgen.shape = request.shape
            if request.style:
                self.worldgen.style = request.style
            if request.preset:
                self.worldgen.preset = request.preset
            if request.size is not None:
                self.worldgen.size = request.size
            if request.density is not None:
                self.worldgen.density = request.density

            if progress_callback:
                await progress_callback(30, "generating", f"Running WorldGen {mode} inference...")

            # Run inference
            with torch.no_grad():
                if mode == "i2s" and request.reference_image_url:
                    splat = self.worldgen.generate_world(
                        prompt=request.prompt,
                        image=request.reference_image_url,
                    )
                else:
                    splat = self.worldgen.generate_world(request.prompt)

            if progress_callback:
                await progress_callback(80, "generating", "Saving Gaussian Splat...")

            # Save output as .ply (Gaussian Splat)
            splat.save(str(ply_path))

            logger.info("WorldGen generation complete: %s", ply_path)
            return ProviderResult(
                model_path=str(ply_path),
                thumbnail_path="",
                polygon_count=0,
                vertex_count=0,
                texture_resolution="",
                has_rig=False,
                file_size=ply_path.stat().st_size,
                metadata={"provider": "worldgen", "device": self.device, "mode": mode},
            )
        except Exception as exc:
            logger.exception("WorldGen generation failed: %s", exc)
            stats = write_placeholder_mesh(str(output_path / "model.glb"))
            return ProviderResult(
                model_path=str(output_path / "model.glb"),
                thumbnail_path="",
                polygon_count=stats["polygon_count"],
                vertex_count=stats["vertex_count"],
                texture_resolution="",
                has_rig=False,
                file_size=output_path.joinpath("model.glb").stat().st_size,
                metadata={"provider": "worldgen", "device": self.device, "error": str(exc)},
            )

    async def health_check(self) -> bool:
        return _HAS_DEPS and self.is_loaded
