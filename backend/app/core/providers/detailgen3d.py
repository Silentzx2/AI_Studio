"""DetailGen3D provider — post-processes 3D coarse meshes with details."""
import asyncio
import logging
import sys
from pathlib import Path
from typing import Any

from app.core.providers.base import BaseProvider, ProviderResult
from app.core.managers.vram_tracker import vram_tracker
from app.core.mesh_processor import write_placeholder_mesh
from runtime.accelerate_loader import safe_unload, verify_gpu_placement
from runtime.storage import get_storage_config

logger = logging.getLogger(__name__)

# ponytail: DetailGen3D repo lives under the storage third_party dir (per-model
# layout). The old parents[4]/third_party guess pointed at the project root and
# never resolved (same bug as anigen_provider). Resolve via get_storage_config.
DETAILGEN3D_REPO = get_storage_config().get_repo_path("DetailGen3D")
if str(DETAILGEN3D_REPO) not in sys.path:
    sys.path.insert(0, str(DETAILGEN3D_REPO))

try:
    import torch
    import trimesh
    import numpy as np
    from PIL import Image
    from skimage import measure
    from detailgen3d.pipelines.pipeline_detailgen3d import DetailGen3DPipeline
    from detailgen3d.inference_utils import generate_dense_grid_points
    _HAS_DEPS = True
except Exception as exc:
    logger.warning("DetailGen3D deps not available: %s", exc)
    _HAS_DEPS = False


class DetailGen3DProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "detailgen3d"

    def __init__(self, device: str = "cuda:0") -> None:
        self.device = device
        self.is_loaded = False
        self.pipeline = None
        self.sampled_points = None
        self.grid_size = None
        self.bbox_size = None
        logger.info("DetailGen3DProvider initialized on %s", device)

    async def load(self) -> bool:
        if self.is_loaded:
            return True
        if not _HAS_DEPS:
            logger.error("DetailGen3D dependencies not installed")
            return False
        # Allocate 4.0 GB of VRAM using VRAMAllocationTracker
        success = vram_tracker.allocate("detailgen3d", 4.0, reason="detailgen3d_model_load")
        if not success:
            return False
        weights_dir = get_storage_config().get_weight_path("detailgen3d")
        if not weights_dir:
            logger.error("DetailGen3D weights not found at %s", weights_dir)
            vram_tracker.release("detailgen3d")
            return False
        try:
            self.pipeline = DetailGen3DPipeline.from_pretrained(weights_dir).to(
                self.device, dtype=torch.float16
            )
            # Precompute sampling grid for marching cubes (octree_depth=9 per official script)
            box_min = np.array([-1.005, -1.005, -1.005])
            box_max = np.array([1.005, 1.005, 1.005])
            self.sampled_points, self.grid_size, self.bbox_size = generate_dense_grid_points(
                bbox_min=box_min, box_max=box_max, octree_depth=9, indexing="ij"
            )
            self.sampled_points = torch.FloatTensor(self.sampled_points).to(self.device, dtype=torch.float16)
            self.sampled_points = self.sampled_points.unsqueeze(0)  # batch=1
            self.box_min = box_min
            self.is_loaded = True
            verify_gpu_placement(self.pipeline, "detailgen3d", self.device)
            logger.info("DetailGen3D model loaded into VRAM on device %s", self.device)
            return True
        except Exception as exc:
            logger.exception("DetailGen3D load failed: %s", exc)
            vram_tracker.release("detailgen3d")
            return False

    def unload(self) -> None:
        if not self.is_loaded:
            return
        self.pipeline = None
        self.sampled_points = None
        self.grid_size = None
        self.bbox_size = None
        safe_unload(provider_name="detailgen3d")
        self.is_loaded = False
        logger.info("DetailGen3D model unloaded from VRAM.")

    def _load_mesh_points(self, mesh_path: str) -> torch.Tensor:
        """Load mesh, sample 1M surface points, pick 20480 with normals, normalize (scale 1.9)."""
        mesh = trimesh.load(mesh_path, force="mesh")
        center = mesh.bounding_box.centroid
        mesh.apply_translation(-center)
        scale = max(mesh.bounding_box.extents)
        mesh.apply_scale(1.9 / scale)
        surface, face_indices = trimesh.sample.sample_surface(mesh, 1_000_000)
        normal = mesh.face_normals[face_indices]
        rng = np.random.default_rng()
        ind = rng.choice(surface.shape[0], 20_480, replace=False)
        surface = torch.FloatTensor(surface[ind])
        normal = torch.FloatTensor(normal[ind])
        surface = torch.cat([surface, normal], dim=-1).unsqueeze(0).to(self.device, dtype=torch.float16)
        return surface

    async def detail_mesh(
        self, coarse_glb_path: str, image_path: str | None, guidance: float = 7.5, progress_callback: Any = None
    ) -> str:
        """Runs DetailGen3D pass on a coarse GLB. Returns path to refined GLB."""
        if not self.is_loaded:
            loaded = await self.load()
            if not loaded:
                logger.warning("VRAM Allocation failed for DetailGen3D. Falling back to coarse GLB.")
                return coarse_glb_path

        logger.info("Detailing mesh %s using image %s (guidance=%s)", coarse_glb_path, image_path, guidance)
        if progress_callback:
            await progress_callback(85, "postprocessing", "DetailGen3D encoding coarse mesh...")

        coarse_path = Path(coarse_glb_path)
        if not coarse_path.exists():
            logger.warning("Coarse mesh file %s not found. Falling back.", coarse_glb_path)
            return coarse_glb_path

        refined_path = coarse_path.parent / f"{coarse_path.stem}_detailed.glb"
        try:
            # Prepare reference image
            if image_path and Path(image_path).exists():
                image = Image.open(image_path).convert("RGB")
            else:
                logger.warning("No reference image provided; using blank white image.")
                image = Image.new("RGB", (512, 512), (255, 255, 255))

            # Encode coarse mesh to latent
            surface = self._load_mesh_points(coarse_glb_path)
            with torch.no_grad():
                latent = self.pipeline.vae.encode(surface).latent_dist.sample()

                if progress_callback:
                    await progress_callback(90, "postprocessing", "DetailGen3D denoising...")

                # Denoise
                sdf = self.pipeline(
                    image,
                    latents=latent,
                    sampled_points=self.sampled_points,
                    noise_aug_level=0.0,
                    generator=torch.Generator(device=self.device).manual_seed(42),
                    guidance_scale=guidance,
                    num_inference_steps=50,
                ).samples[0]

                if progress_callback:
                    await progress_callback(95, "postprocessing", "DetailGen3D marching cubes...")

                # Marching cubes
                grid_logits = sdf.view(self.grid_size).cpu().numpy()
                vertices, faces, normals, _ = measure.marching_cubes(
                    grid_logits, 0, method="lewiner"
                )
                vertices = vertices / self.grid_size * self.bbox_size + self.box_min
                mesh = trimesh.Trimesh(vertices.astype(np.float32), np.ascontiguousarray(faces))
                mesh.export(refined_path, file_type="glb")

            logger.info("DetailGen3D refinement complete: %s", refined_path)
            return str(refined_path)
        except Exception as exc:
            logger.exception("DetailGen3D failed, falling back to coarse GLB: %s", exc)
            return coarse_glb_path

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
            metadata={"provider": "detailgen3d", "device": self.device},
        )

    async def health_check(self) -> bool:
        return _HAS_DEPS and self.is_loaded