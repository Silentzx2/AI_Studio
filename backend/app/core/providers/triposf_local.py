"""TripoSF provider — SparseFlex high-resolution arbitrary-topology mesh reconstruction."""
from __future__ import annotations

import asyncio
import logging
import sys
import time
from pathlib import Path
from typing import Any

from app.core.providers.base import BaseProvider, ProviderResult, _add_model_env
from app.core.managers.vram_tracker import vram_tracker
from runtime.storage import get_storage_config

logger = logging.getLogger(__name__)

TRIPOSF_REPO = get_storage_config().get_repo_path("TripoSF")


class TripoSFLocalProvider(BaseProvider):
    """Local provider implementing TripoSF SparseFlex mesh reconstruction.
    
    Reuses upstream TripoSFVAEInference, SparseFlex sparse tensor architecture,
    and point-normal sampling from VAST-AI-Research TripoSF.
    """

    @property
    def name(self) -> str:
        return "triposf"

    def __init__(self, device: str = "cuda:0", low_vram: bool = False, **kwargs) -> None:
        self.device = device
        self.is_loaded = False
        self.model: Any = None
        self.weights_path: Path | None = None
        self.config_path: Path | None = None

    async def health_check(self) -> bool:
        return self.is_loaded and self.model is not None

    async def load(self, vram_mode: str = "auto") -> bool:
        """Load TripoSF VAE weights and instantiate reconstruction pipeline."""
        if self.is_loaded and self.model is not None:
            return True

        import torch

        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"

        # Check repository exists
        storage = get_storage_config()
        repo_path = storage.get_repo_path("TripoSF")
        if repo_path.exists():
            _add_model_env(repo_path)
            if str(repo_path) not in sys.path:
                sys.path.insert(0, str(repo_path))

        # Check weights
        weight_dir = storage.get_weight_path("triposf") or storage.get_weight_path("VAST-AI/TripoSF")
        if weight_dir:
            wd = Path(weight_dir)
            # Upstream checkpoint could be in vae/ or root
            for cand in [
                wd / "vae" / "pretrained_TripoSFVAE_256i1024o.safetensors",
                wd / "pretrained_TripoSFVAE_256i1024o.safetensors",
                wd / "ckpts" / "pretrained_TripoSFVAE_256i1024o.safetensors",
            ]:
                if cand.exists():
                    self.weights_path = cand
                    break

        self.config_path = repo_path / "configs" / "TripoSFVAE_1024.yaml"

        # Allocate 12 GB VRAM
        success = vram_tracker.allocate("triposf", 12.0, reason="triposf_model_load")
        if not success:
            logger.warning("VRAM allocation failed for triposf (12 GB needed)")
            return False

        try:
            from omegaconf import OmegaConf
            from inference import TripoSFVAEInference  # upstream class

            if not self.config_path.exists():
                raise FileNotFoundError(f"TripoSF config not found at {self.config_path}")

            config = OmegaConf.load(str(self.config_path))
            if self.weights_path and self.weights_path.exists():
                config.weight = str(self.weights_path)

            cfg = OmegaConf.merge(OmegaConf.structured(TripoSFVAEInference.Config), config)
            self.model = TripoSFVAEInference(cfg).to(self.device)
            self.model.eval()

            self.is_loaded = True
            logger.info("TripoSF VAE loaded successfully on %s", self.device)
            return True
        except Exception as exc:
            logger.exception("Failed to load TripoSF model: %s", exc)
            vram_tracker.release("triposf")
            self.model = None
            self.is_loaded = False
            return False

    def unload(self) -> None:
        """Unload TripoSF model and release VRAM."""
        if self.model is not None:
            del self.model
            self.model = None
        self.is_loaded = False
        vram_tracker.release("triposf")
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        logger.info("TripoSF model unloaded")

    async def refine_mesh(
        self,
        coarse_glb_path: str | Path,
        output_path: str | Path | None = None,
        progress_callback: Any = None,
    ) -> str:
        """Runs TripoSF SparseFlex super-resolution on coarse mesh. Returns path to refined GLB."""
        coarse_path = Path(coarse_glb_path)
        if not coarse_path.exists():
            raise RuntimeError(f"Coarse mesh file not found: {coarse_glb_path}")

        if not self.is_loaded or self.model is None:
            loaded = await self.load()
            if not loaded:
                raise RuntimeError("Failed to load TripoSF model into memory.")

        import torch
        import trimesh
        from inference import normalize_mesh, load_quantized_mesh_original

        if output_path is None:
            output_path = coarse_path.parent / f"{coarse_path.stem}_triposf.glb"
        out_glb = Path(output_path)
        out_glb.parent.mkdir(parents=True, exist_ok=True)
        temp_gt_path = out_glb.parent / f"temp_norm_{coarse_path.stem}.obj"

        # 1. Normalize mesh
        if progress_callback:
            await progress_callback(20, "triposf_normalizing", "TripoSF: Normalizing coarse mesh geometry...")

        mesh_gt = normalize_mesh(str(coarse_path))
        mesh_gt.export(str(temp_gt_path))

        # 2. Quantize & sample points and normals
        if progress_callback:
            await progress_callback(40, "triposf_sampling", "TripoSF: Sampling points & normals for sparse voxelization...")

        sparse_voxels, points_sample = load_quantized_mesh_original(
            str(temp_gt_path),
            volume_resolution=self.model.cfg.resolution,
            use_normals=self.model.cfg.use_normals,
            pc_sample_number=self.model.cfg.sample_points_num,
        )

        # 3. Model reconstruction
        if progress_callback:
            await progress_callback(70, "triposf_reconstructing", "TripoSF: Running SparseFlex VAE reconstruction...")

        sparse_voxels = sparse_voxels.to(self.device)
        points_sample = points_sample.to(self.device)
        sparse_voxels_sp = torch.cat([torch.zeros_like(sparse_voxels[..., :1]), sparse_voxels], dim=-1).int()

        with torch.no_grad():
            with torch.cuda.amp.autocast(dtype=torch.float16):
                mesh_recon = self.model(points_sample[None], sparse_voxels_sp)[0]

        # 4. Export result
        if progress_callback:
            await progress_callback(90, "triposf_exporting", "TripoSF: Exporting super-resolved mesh...")

        recon_tm = trimesh.Trimesh(
            vertices=mesh_recon.vertices.tolist(),
            faces=mesh_recon.faces.tolist(),
            process=False,
        )
        recon_tm.export(str(out_glb), file_type="glb")

        try:
            if temp_gt_path.exists():
                temp_gt_path.unlink()
        except Exception:
            pass

        logger.info("TripoSF mesh refinement complete: %s (%d verts, %d faces)", out_glb, len(recon_tm.vertices), len(recon_tm.faces))
        return str(out_glb)

    async def generate(
        self,
        request: Any,
        output_dir: str | Path,
        progress_callback: Any = None,
    ) -> ProviderResult:
        """Run high-resolution mesh reconstruction with TripoSF."""
        mesh_input = getattr(request, "source_mesh_url", None) or getattr(request, "model_url", None) or getattr(request, "input_mesh", None)
        if not mesh_input:
            raise ValueError(
                "TripoSF requires an input 3D mesh for reconstruction/refinement (it is a mesh-to-mesh "
                "SparseFlex model, not an image-to-3D generator). Please provide source_mesh_url."
            )

        out_dir = Path(output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        glb_path = out_dir / "model.glb"

        refined_path = await self.refine_mesh(mesh_input, glb_path, progress_callback)

        from app.core.mesh_processor import get_mesh_stats
        try:
            stats = get_mesh_stats(str(refined_path))
        except Exception:
            stats = {"polygon_count": 0, "vertex_count": 0}

        if progress_callback:
            await progress_callback(100, "completed", "TripoSF mesh reconstruction complete.")

        return ProviderResult(
            model_path=str(refined_path),
            polygon_count=stats.get("polygon_count", 0),
            vertex_count=stats.get("vertex_count", 0),
            has_texture=False,
            file_size=Path(refined_path).stat().st_size if Path(refined_path).exists() else 0,
        )
