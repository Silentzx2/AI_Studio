"""
TRELLIS local provider — wraps third_party/TRELLIS without modifying it.

FIXES APPLIED (Issue #1):
- Added GPU execution verification after model load
- Added GPU memory logging before/after inference
- Unified path resolution using StorageConfig (Issue #10)
- CRITICAL: Call _add_model_env() BEFORE any other imports to ensure per-model
  venv packages (trellis, newer huggingface_hub) take precedence.
"""
from __future__ import annotations

# CRITICAL: Must set up per-model env BEFORE any other imports
from app.core.providers.base import _add_model_env
_add_model_env("TRELLIS")

import asyncio
import logging
from pathlib import Path
from typing import Any

from app.core.providers.base import BaseProvider, ProviderResult
from app.core.mesh_processor import get_mesh_stats
from app.schemas.generation import GenerationRequest
from runtime.accelerate_loader import (
    verify_gpu_placement as _verify_gpu_placement,
    log_gpu_memory as _log_gpu_memory,
    safe_unload,
)

logger = logging.getLogger(__name__)


class TRELLISLocalProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "trellis"

    def __init__(self, device: str = "cuda") -> None:
        self.device = device
        self._pipeline: Any = None

        from runtime.storage import get_storage_config
        storage = get_storage_config()
        self.repo_name = "TRELLIS"
        self.weight_key = "trellis"
        resolved = storage.get_weight_path(self.weight_key)
        self.weights_dir = Path(resolved) if resolved else storage.get_model_weights_dir(self.repo_name)

    def _ensure_loaded(self) -> None:
        if self._pipeline is not None:
            return
        if not self.weights_dir.exists():
            raise RuntimeError(f"TRELLIS weights not found at {self.weights_dir}")
        self._mock_fallback = False
        _log_gpu_memory("before_trellis_load")
        try:
            from runtime.gpu import enable_fast_cuda_acceleration
            enable_fast_cuda_acceleration()
        except Exception:
            pass
        try:
            from trellis.pipelines import TrellisImageTo3DPipeline
            logger.info("Loading TRELLIS from %s on %s", self.weights_dir, self.device)
            self._pipeline = TrellisImageTo3DPipeline.from_pretrained(str(self.weights_dir))

            # ponytail: use Accelerate for device dispatch when VRAM is constrained.
            # Falls back to native .to(device) when Accelerate is unavailable or
            # VRAM is sufficient — preserves existing behavior and outputs.
            from runtime.accelerate_loader import (
                accelerate_available,
                dispatch_pipeline_models,
            )
            from runtime.capability import get_model_vram_required
            vram_needed = get_model_vram_required("trellis")
            dispatched = False
            if accelerate_available() and hasattr(self._pipeline, "models"):
                offload_folder = self.weights_dir / ".accelerate_offload"
                dispatched = dispatch_pipeline_models(
                    self._pipeline.models,
                    device=self.device,
                    vram_required_mb=vram_needed,
                    offload_folder=offload_folder,
                )
            if not dispatched:
                self._pipeline = self._pipeline.to(self.device)

            logger.info("TRELLIS loaded successfully on %s (accelerate=%s)", self.device, dispatched)
        except Exception as exc:
            raise RuntimeError(f"TRELLIS load failed: {exc}") from exc
        _verify_gpu_placement(self._pipeline, "trellis", self.device)
        _log_gpu_memory("after_trellis_load")

    def unload(self) -> None:
        safe_unload(self._pipeline, provider_name="trellis")
        self._pipeline = None
        _log_gpu_memory("after_trellis_unload")

    async def generate(
        self,
        request: GenerationRequest,
        output_dir: str,
        progress_callback: Any = None,
    ) -> ProviderResult:
        if request.mode == "text-to-3d":
            raise ValueError(
                "TRELLIS requires an image input. "
                "Use image-to-3d mode or switch to the Hunyuan3D provider."
            )

        loop = asyncio.get_running_loop()

        async def cb(p: int, s: str, m: str, lv: str = "info") -> None:
            if progress_callback:
                await progress_callback(p, s, m, lv)

        await cb(5, "preparing", "Loading TRELLIS pipeline...", "info")
        await loop.run_in_executor(None, self._ensure_loaded)
        await cb(15, "generating", "Running TRELLIS reconstruction...", "info")

        _log_gpu_memory("before_trellis_inference")
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        mesh_path = await loop.run_in_executor(None, lambda: self._run(request, str(out)))
        _log_gpu_memory("after_trellis_inference")
        await cb(70, "generating", "TRELLIS complete.", "success")

        stats = get_mesh_stats(mesh_path)

        return ProviderResult(
            model_path=mesh_path,
            thumbnail_path="",
            polygon_count=stats.get("polygon_count", 0),
            vertex_count=stats.get("vertex_count", 0),
            texture_resolution="2048x2048" if request.generate_texture else None,
            has_rig=False,
            file_size=Path(mesh_path).stat().st_size,
            metadata={"provider": "trellis", "device": self.device},
        )

    def _run(self, request: GenerationRequest, output_dir: str) -> str:
        import inspect
        import torch
        from PIL import Image

        img = Image.open(request.reference_image_url).convert("RGBA")
        dest = str(Path(output_dir) / "model.glb")

        seed = request.seed if request.seed is not None else 42
        quality = request.quality or "standard"

        # Official quality presets for sparse structure and SLAT sampling:
        # Steps and CFG strength scale with user quality selection or explicit request parameters
        quality_presets = {
            "low-poly": {"ss_steps": 12, "ss_cfg": 5.0, "slat_steps": 12, "slat_cfg": 2.5},
            "standard": {"ss_steps": 16, "ss_cfg": 6.5, "slat_steps": 16, "slat_cfg": 3.0},
            "high-poly": {"ss_steps": 25, "ss_cfg": 7.5, "slat_steps": 25, "slat_cfg": 3.0},
        }
        preset = quality_presets.get(quality, quality_presets["standard"])

        ss_steps = request.num_inference_steps or preset["ss_steps"]
        ss_cfg = request.guidance_scale if request.guidance_scale is not None else preset["ss_cfg"]
        slat_steps = request.num_inference_steps or preset["slat_steps"]
        slat_cfg = preset["slat_cfg"]

        run_kwargs: dict[str, Any] = {
            "image": img,
            "seed": seed,
            "sparse_structure_sampler_params": {
                "steps": ss_steps,
                "cfg_strength": ss_cfg,
            },
            "slat_sampler_params": {
                "steps": slat_steps,
                "cfg_strength": slat_cfg,
            },
        }

        # Formats: shape only vs full PBR
        if not request.generate_texture:
            run_kwargs["formats"] = ["mesh"]

        # Only pass kwargs supported by the installed pipeline version
        sig = inspect.signature(self._pipeline.run)
        valid_kwargs = {k: v for k, v in run_kwargs.items() if k in sig.parameters}

        with torch.inference_mode():
            outputs = self._pipeline.run(**valid_kwargs)

            # Export model
            export_sig = inspect.signature(self._pipeline.export_model)
            export_kwargs: dict[str, Any] = {}
            if "texture_size" in export_sig.parameters and request.generate_texture:
                export_kwargs["texture_size"] = 2048 if quality == "high-poly" else 1024
            elif "texture_resolution" in export_sig.parameters and request.generate_texture:
                export_kwargs["texture_resolution"] = 2048 if quality == "high-poly" else 1024

            self._pipeline.export_model(outputs, dest, **export_kwargs)

        # Quality simplification if target face_count specified
        if request.face_count and Path(dest).exists():
            try:
                from app.core.mesh_optimizer import optimize_mesh
                optimize_mesh(
                    input_path=dest,
                    output_path=dest,
                    target_polycount=request.face_count,
                    fix_uvs=True,
                )
            except Exception as dec_err:
                logger.warning("Post-TRELLIS face_count decimation skipped: %s", dec_err)

        return dest

    async def health_check(self) -> bool:
        return self.weights_dir.exists()
