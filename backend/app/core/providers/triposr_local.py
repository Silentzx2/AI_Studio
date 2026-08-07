"""
TripoSR local provider — wraps third_party/TripoSR without modifying it.

FIXES APPLIED (Issue #1):
- Added GPU execution verification after model load
- Added GPU memory logging before/after inference
- Unified path resolution using StorageConfig (Issue #10)
- CRITICAL: Call _add_model_env() BEFORE any other imports to ensure per-model
  venv packages (tsr, newer huggingface_hub) take precedence.
"""
from __future__ import annotations

# CRITICAL: Must set up per-model env BEFORE any other imports
from app.core.providers.base import _add_model_env
_add_model_env("TripoSR")

import asyncio
import logging
from pathlib import Path
from typing import Any

from app.core.providers.base import BaseProvider, ProviderResult
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


class TripoSRLocalProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "triposr"

    def __init__(self, device: str = "cuda") -> None:
        self.device = device
        self._model: Any = None

        # Use StorageConfig for path resolution (Issue #10 + Section 2 per-model)
        from runtime.storage import get_storage_config
        storage = get_storage_config()
        self.repo_name = "TripoSR"
        per_model = storage.get_model_weights_dir("TripoSR")
        if _safe_exists(per_model) and any(per_model.iterdir()):
            self.weights_dir = per_model
        else:
            self.weights_dir = storage.weights_dir / "triposr"

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        if not self.weights_dir.exists():
            logger.warning("TripoSR weights not found at %s. Using simulated fallback.", self.weights_dir)
            self._mock_fallback = True
            return
        self._mock_fallback = False
        _log_gpu_memory("before_triposr_load")
        try:
            from tsr.system import TSR
            logger.info("Loading TripoSR from %s on %s", self.weights_dir, self.device)
            self._model = TSR.from_pretrained(
                str(self.weights_dir),
                config_name="config.yaml",
                weight_name="model.ckpt",
            )
            self._model = self._model.to(self.device)
            logger.info("TripoSR loaded successfully on %s", self.device)
        except Exception as exc:
            raise RuntimeError(f"TripoSR load failed: {exc}") from exc
        _verify_gpu_placement(self._model, "triposr", self.device)
        _log_gpu_memory("after_triposr_load")

    def unload(self) -> None:
        self._model = None
        from runtime.gpu import empty_cuda_cache
        empty_cuda_cache()
        _log_gpu_memory("after_triposr_unload")

    async def generate(
        self,
        request: GenerationRequest,
        output_dir: str,
        progress_callback: Any = None,
    ) -> ProviderResult:
        if request.mode == "text-to-3d":
            raise ValueError(
                "TripoSR requires an image input. Use image-to-3d mode."
            )

        loop = asyncio.get_running_loop()

        async def cb(p: int, s: str, m: str, lv: str = "info") -> None:
            if progress_callback:
                await progress_callback(p, s, m, lv)

        await cb(5, "preparing", "Loading TripoSR...", "info")
        await loop.run_in_executor(None, self._ensure_loaded)
        if getattr(self, "_mock_fallback", False):
            await cb(15, "generating", "Running simulated TripoSR reconstruction...", "info")
            await asyncio.sleep(1.0)
            await cb(70, "generating", "TripoSR simulated complete.", "success")
            out = Path(output_dir)
            out.mkdir(parents=True, exist_ok=True)
            mesh_path = str(out / "model.glb")
            with open(mesh_path, "wb") as f:
                f.write(b"GLB_PLACEHOLDER")
            return ProviderResult(
                model_path=mesh_path,
                thumbnail_path="",
                polygon_count=1200,
                vertex_count=600,
                texture_resolution="1024x1024" if request.generate_texture else None,
                has_rig=False,
                file_size=len(b"GLB_PLACEHOLDER"),
                metadata={"provider": "triposr", "device": self.device, "simulated": True},
            )

        await cb(15, "generating", "Running TripoSR reconstruction...", "info")

        _log_gpu_memory("before_triposr_inference")
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        mesh_path = await loop.run_in_executor(None, lambda: self._run(request, str(out)))
        _log_gpu_memory("after_triposr_inference")
        await cb(70, "generating", "TripoSR complete.", "success")

        from app.core.mesh_processor import get_mesh_stats
        stats = get_mesh_stats(mesh_path)

        return ProviderResult(
            model_path=mesh_path,
            thumbnail_path="",
            polygon_count=stats.get("polygon_count", 0),
            vertex_count=stats.get("vertex_count", 0),
            texture_resolution="1024x1024" if request.generate_texture else None,
            has_rig=False,
            file_size=Path(mesh_path).stat().st_size,
            metadata={"provider": "triposr", "device": self.device},
        )

    def _run(self, request: GenerationRequest, output_dir: str) -> str:
        from PIL import Image
        image = Image.open(request.reference_image_url).convert("RGB")
        with self._model.run_chunked_inference():
            scene_codes = self._model([image], device=self.device)
        mesh = self._model.extract_mesh(scene_codes, resolution=256)[0]
        dest = str(Path(output_dir) / "model.glb")
        mesh.export(dest)
        return dest

    async def health_check(self) -> bool:
        return self.weights_dir.exists()
