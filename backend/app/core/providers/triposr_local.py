"""TripoSR provider — fast single-image to 3D mesh reconstruction."""
from __future__ import annotations

import asyncio
import logging
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from app.core.providers.base import BaseProvider, ProviderResult, _add_model_env
from app.core.managers.vram_tracker import vram_tracker
from runtime.storage import get_storage_config

logger = logging.getLogger(__name__)

TRIPOSR_REPO = get_storage_config().get_repo_path("TripoSR")


class TripoSRLocalProvider(BaseProvider):
    """Local provider implementing TripoSR fast single-image 3D reconstruction.
    
    Reuses upstream TSR architecture and xatlas texture baking from
    VAST-AI-Research / StabilityAI TripoSR.
    """

    @property
    def name(self) -> str:
        return "triposr"

    def __init__(self, device: str = "cuda:0", low_vram: bool = False, **kwargs) -> None:
        self.device = device
        self.is_loaded = False
        self.model: Any = None
        self.weights_dir: Path | None = None
        self.chunk_size: int = 2048 if low_vram else 8192

    async def health_check(self) -> bool:
        return self.is_loaded and self.model is not None

    async def load(self, vram_mode: str = "auto") -> bool:
        """Load TripoSR weights and instantiate TSR pipeline."""
        if self.is_loaded and self.model is not None:
            return True

        import torch

        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"

        # Check repository exists
        storage = get_storage_config()
        repo_path = storage.get_repo_path("TripoSR")
        if repo_path.exists():
            _add_model_env(repo_path)
            if str(repo_path) not in sys.path:
                sys.path.insert(0, str(repo_path))

        # Check weights path
        weights = storage.get_weight_path("triposr") or storage.get_weight_path("stabilityai/TripoSR")
        if weights and Path(weights).exists():
            self.weights_dir = Path(weights)
        else:
            self.weights_dir = None

        # VRAM tracking: ~6 GB normal, ~4 GB low
        vram_needed = 4.0 if vram_mode == "low" else 6.0
        self.chunk_size = 2048 if vram_mode == "low" else 8192

        success = vram_tracker.allocate("triposr", vram_needed, reason="triposr_model_load")
        if not success:
            logger.warning("VRAM allocation failed for triposr (%s GB needed)", vram_needed)
            return False

        try:
            from tsr.system import TSR  # upstream class

            model_path_or_id = str(self.weights_dir) if self.weights_dir else "stabilityai/TripoSR"
            logger.info("Loading TripoSR from %s on %s...", model_path_or_id, self.device)

            self.model = TSR.from_pretrained(
                model_path_or_id,
                config_name="config.yaml",
                weight_name="model.ckpt",
            )
            self.model.renderer.set_chunk_size(self.chunk_size)
            self.model.to(self.device)
            self.model.eval()

            self.is_loaded = True
            logger.info("TripoSR loaded successfully (chunk_size=%d)", self.chunk_size)
            return True
        except Exception as exc:
            logger.exception("Failed to load TripoSR model: %s", exc)
            vram_tracker.release("triposr")
            self.model = None
            self.is_loaded = False
            return False

    def unload(self) -> None:
        """Unload TripoSR model and free VRAM."""
        if self.model is not None:
            del self.model
            self.model = None
        self.is_loaded = False
        vram_tracker.release("triposr")
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        logger.info("TripoSR model unloaded")

    async def generate(
        self,
        request: Any,
        output_dir: str | Path,
        progress_callback: Any = None,
    ) -> ProviderResult:
        """Run single-image 3D reconstruction with TripoSR."""
        if not self.is_loaded or self.model is None:
            loaded = await self.load(vram_mode=getattr(request, "vram_mode", "auto"))
            if not loaded:
                raise RuntimeError("Failed to load TripoSR model into memory.")

        import torch
        import trimesh

        out_dir = Path(output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        glb_path = out_dir / "model.glb"

        # 1. Resolve and validate input image
        image_input = getattr(request, "image", None) or getattr(request, "reference_image_url", None)
        if not image_input:
            raise ValueError("TripoSR requires an input image (image-to-3d). Pure text-to-3d is not supported.")

        if progress_callback:
            await progress_callback(10, "preprocessing", "Preprocessing input image...")

        if isinstance(image_input, Image.Image):
            pil_img = image_input.convert("RGB")
        elif isinstance(image_input, (str, Path)):
            img_p = Path(image_input)
            if not img_p.exists():
                raise FileNotFoundError(f"Input image not found: {image_input}")
            pil_img = Image.open(img_p).convert("RGB")
        else:
            raise ValueError(f"Unsupported image input type: {type(image_input)}")

        # 2. Preprocess & background removal
        try:
            from tsr.utils import remove_background, resize_foreground
            import rembg
            rembg_session = rembg.new_session()
            processed_img = remove_background(pil_img, rembg_session)
            processed_img = resize_foreground(processed_img, 0.85)
            img_arr = np.array(processed_img).astype(np.float32) / 255.0
            if img_arr.shape[-1] == 4:
                img_arr = img_arr[:, :, :3] * img_arr[:, :, 3:4] + (1 - img_arr[:, :, 3:4]) * 0.5
            input_image = Image.fromarray((img_arr * 255.0).astype(np.uint8))
        except Exception as bg_err:
            logger.warning("Background removal skipped/failed: %s; using input as-is", bg_err)
            input_image = pil_img

        # 3. Model inference: predict scene codes
        if progress_callback:
            await progress_callback(35, "generating", "Running TripoSR neural reconstruction...")

        with torch.no_grad():
            scene_codes = self.model([input_image], device=self.device)

        # 4. Surface extraction via Marching Cubes
        if progress_callback:
            await progress_callback(65, "meshing", "Extracting 3D surface mesh...")

        mc_res = getattr(request, "octree_resolution", None) or 256
        bake_texture_flag = bool(getattr(request, "generate_texture", True))

        with torch.no_grad():
            meshes = self.model.extract_mesh(
                scene_codes,
                has_vertex_color=not bake_texture_flag,
                resolution=mc_res,
            )

        extracted_mesh = meshes[0]

        # 5. Optional texture baking or vertex colors
        if bake_texture_flag:
            if progress_callback:
                await progress_callback(80, "texturing", "Baking texture atlas with xatlas...")
            try:
                from tsr.bake_texture import bake_texture
                tex_res = 2048
                bake_output = bake_texture(extracted_mesh, self.model, scene_codes[0], tex_res)
                # Build textured trimesh
                baked_verts = extracted_mesh.vertices[bake_output["vmapping"]]
                baked_faces = bake_output["indices"]
                baked_uvs = bake_output["uvs"]
                baked_tex = Image.fromarray((bake_output["colors"] * 255.0).astype(np.uint8)).transpose(Image.FLIP_TOP_BOTTOM)
                
                material = trimesh.visual.material.PBRMaterial(
                    baseColorTexture=baked_tex,
                    metallicFactor=0.05,
                    roughnessFactor=0.75,
                )
                final_mesh = trimesh.Trimesh(
                    vertices=baked_verts,
                    faces=baked_faces,
                    visual=trimesh.visual.TextureVisuals(uv=baked_uvs, image=baked_tex, material=material),
                    process=False,
                )
            except Exception as bake_err:
                logger.warning("Texture baking failed: %s; falling back to vertex colors", bake_err)
                final_mesh = extracted_mesh
        else:
            final_mesh = extracted_mesh

        # 6. Export GLB
        if progress_callback:
            await progress_callback(95, "exporting", "Exporting GLB asset...")

        final_mesh.export(str(glb_path), file_type="glb")

        from app.core.mesh_processor import get_mesh_stats
        try:
            stats = get_mesh_stats(str(glb_path))
        except Exception:
            stats = {"polygon_count": len(final_mesh.faces), "vertex_count": len(final_mesh.vertices)}

        if progress_callback:
            await progress_callback(100, "completed", "TripoSR generation complete.")

        return ProviderResult(
            model_path=str(glb_path),
            polygon_count=stats.get("polygon_count", len(final_mesh.faces)),
            vertex_count=stats.get("vertex_count", len(final_mesh.vertices)),
            texture_resolution="2048x2048" if bake_texture_flag else None,
            has_texture=bake_texture_flag,
            file_size=glb_path.stat().st_size if glb_path.exists() else 0,
        )
