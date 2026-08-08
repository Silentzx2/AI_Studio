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
from app.core.mesh_processor import get_mesh_stats, write_placeholder_mesh
from app.schemas.generation import GenerationRequest

logger = logging.getLogger(__name__)


def _safe_exists(p) -> bool:
    try:
        return p.exists()
    except (PermissionError, OSError):
        return False


def _verify_gpu_placement(model: Any, model_name: str, expected_device: str) -> None:
    """
    Verify that model tensors are on GPU after load.
    Issue #1 Fix: This prevents silent CPU fallback.
    """
    try:
        import torch
        param = None
        try:
            param = next(model.parameters())
        except StopIteration:
            # Check for pipeline structure
            if hasattr(model, 'models') and model.models:
                for m in model.models.values():
                    try:
                        param = next(m.parameters())
                        break
                    except StopIteration:
                        pass

        if param is not None:
            device_str = str(param.device)
            if not device_str.startswith('cuda'):
                raise RuntimeError(
                    f"GPU VERIFICATION FAILED for {model_name}: "
                    f"Tensors on {device_str}, expected cuda device. "
                    f"Model may silently fall back to CPU."
                )
            logger.info("GPU VERIFIED for %s: tensors on %s", model_name, device_str)
        else:
            logger.warning("GPU VERIFICATION SKIPPED for %s: no parameters found", model_name)
    except ImportError:
        logger.warning("Cannot verify GPU placement: torch not available")


def _log_gpu_memory(context: str) -> None:
    """Log current GPU memory usage for debugging."""
    try:
        import torch
        if torch.cuda.is_available():
            for i in range(torch.cuda.device_count()):
                allocated = torch.cuda.memory_allocated(i) / (1024**3)
                reserved = torch.cuda.memory_reserved(i) / (1024**3)
                logger.info("GPU %d memory [%s]: %.2f GB allocated, %.2f GB reserved",
                           i, context, allocated, reserved)
    except ImportError:
        pass


class TRELLISLocalProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "trellis"

    def __init__(self, device: str = "cuda") -> None:
        self.device = device
        self._pipeline: Any = None

        # Use StorageConfig for path resolution (single source of truth).
        # get_weight_path() checks the per-model dir first, then the
        # deprecated centralized weights_dir. ponytail: do NOT fall back to
        # the centralized weights_dir — that produced "wrong weight path".
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
            logger.warning("TRELLIS weights not found at %s. Using simulated fallback.", self.weights_dir)
            self._mock_fallback = True
            return
        self._mock_fallback = False
        _log_gpu_memory("before_trellis_load")
        try:
            from trellis.pipelines import TrellisImageTo3DPipeline
            logger.info("Loading TRELLIS from %s on %s", self.weights_dir, self.device)
            self._pipeline = TrellisImageTo3DPipeline.from_pretrained(str(self.weights_dir))
            self._pipeline = self._pipeline.to(self.device)
            logger.info("TRELLIS loaded successfully on %s", self.device)
        except Exception as exc:
            raise RuntimeError(f"TRELLIS load failed: {exc}") from exc
        _verify_gpu_placement(self._pipeline, "trellis", self.device)
        _log_gpu_memory("after_trellis_load")

    def unload(self) -> None:
        self._pipeline = None
        from runtime.gpu import empty_cuda_cache
        empty_cuda_cache()
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
        if getattr(self, "_mock_fallback", False):
            await cb(15, "generating", "Running simulated TRELLIS reconstruction...", "info")
            await asyncio.sleep(1.0)
            await cb(70, "generating", "TRELLIS simulated complete.", "success")
            out = Path(output_dir)
            out.mkdir(parents=True, exist_ok=True)
            mesh_path = str(out / "model.glb")
            stats = write_placeholder_mesh(mesh_path)
            return ProviderResult(
                model_path=mesh_path,
                thumbnail_path="",
                polygon_count=stats["polygon_count"],
                vertex_count=stats["vertex_count"],
                texture_resolution="2048x2048" if request.generate_texture else None,
                has_rig=False,
                file_size=stats["file_size"],
                metadata={"provider": self.name, "device": self.device, "simulated": True},
            )

        await cb(15, "generating", "Running TRELLIS reconstruction...", "info")

        _log_gpu_memory("before_trellis_inference")
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        mesh_path = await loop.run_in_executor(None, lambda: self._run(request, str(out)))
        _log_gpu_memory("after_trellis_inference")
        await cb(70, "generating", "TRELLIS complete.", "success")

        from app.core.mesh_processor import get_mesh_stats
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
        from PIL import Image
        img = Image.open(request.reference_image_url).convert("RGBA")
        outputs = self._pipeline.run(img, seed=42)
        dest = str(Path(output_dir) / "model.glb")
        self._pipeline.export_model(outputs, dest)
        return dest

    async def health_check(self) -> bool:
        return self.weights_dir.exists()
