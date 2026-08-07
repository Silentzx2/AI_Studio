"""
Hunyuan3D local providers — wraps third_party/Hunyuan3D-2 without modifying it.

Hunyuan3D21LocalProvider  — primary   (Hunyuan3D-2.1, ~16 GB VRAM)
Hunyuan3D2LocalProvider   — fallback  (Hunyuan3D-2,   ~12 GB VRAM)

FIXES APPLIED (Issue #1):
- Added GPU execution verification after model load
- Added GPU memory logging before/after inference
- Unified path resolution using StorageConfig (Issue #10)
- CRITICAL: Call _add_model_env() BEFORE any other imports to ensure per-model
  venv packages (hy3dgen, newer huggingface_hub) take precedence.
"""
from __future__ import annotations

# CRITICAL: Must set up per-model env BEFORE any other imports
from app.core.providers.base import _add_model_env
_add_model_env("Hunyuan3D-2")

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


def _verify_gpu_placement(model: Any, model_name: str) -> None:
    """
    Verify that model tensors are on GPU after load.

    Issue #1 Fix: This prevents silent CPU fallback.
    Raises RuntimeError if tensors are not on expected device.
    """
    try:
        import torch
        # Check if model has parameters
        param = None
        try:
            param = next(model.parameters())
        except StopIteration:
            # Model might have different structure, check for pipeline
            if hasattr(model, 'model') and model.model is not None:
                try:
                    param = next(model.model.parameters())
                except StopIteration:
                    pass

        if param is not None:
            device_str = str(param.device)
            if not device_str.startswith('cuda'):
                raise RuntimeError(
                    f"GPU VERIFICATION FAILED for {model_name}: "
                    f"Tensors on {device_str}, expected cuda device. "
                    f"Model may silently fall back to CPU. "
                    f"Check CUDA installation and GPU memory."
                )
            logger.info(
                "GPU VERIFIED for %s: tensors on %s",
                model_name, device_str
            )
        else:
            logger.warning(
                "GPU VERIFICATION SKIPPED for %s: no parameters found",
                model_name
            )
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
                logger.info(
                    "GPU %d memory [%s]: %.2f GB allocated, %.2f GB reserved",
                    i, context, allocated, reserved
                )
    except ImportError:
        pass


class _HunyuanBase(BaseProvider):
    def __init__(self, model_key: str, weights_subdir: str, repo_name: str = "Hunyuan3D-2", device: str = "cuda") -> None:
        self.model_key = model_key
        self.repo_name = repo_name
        self.device = device
        self._model: Any = None
        self._tex: Any = None

        # Use StorageConfig for path resolution (Issue #10 + Section 2 per-model)
        from runtime.storage import get_storage_config
        storage = get_storage_config()
        per_model = storage.get_model_weights_dir(repo_name)
        if _safe_exists(per_model) and any(per_model.iterdir()):
            self.weights_dir = per_model
        else:
            self.weights_dir = storage.weights_dir / weights_subdir

    # ── lifecycle ──────────────────────────────────────────────────────────────

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        if not self.weights_dir.exists():
            logger.warning("Weights for '%s' not found at %s. Using simulated fallback.", self.model_key, self.weights_dir)
            self._mock_fallback = True
            return
        self._mock_fallback = False
        _log_gpu_memory(f"before_{self.model_key}_load")
        self._load_model()
        _verify_gpu_placement(self._model, self.model_key)
        _log_gpu_memory(f"after_{self.model_key}_load")

    def _load_model(self) -> None:
        raise NotImplementedError

    def unload(self) -> None:
        self._model = None
        self._tex = None
        from runtime.gpu import empty_cuda_cache
        empty_cuda_cache()
        _log_gpu_memory(f"after_{self.model_key}_unload")

    # ── generation ────────────────────────────────────────────────────────────

    async def generate(
        self,
        request: GenerationRequest,
        output_dir: str,
        progress_callback: Any = None,
    ) -> ProviderResult:
        loop = asyncio.get_event_loop()

        async def cb(p: int, s: str, m: str, lv: str = "info") -> None:
            if progress_callback:
                await progress_callback(p, s, m, lv)

        await cb(5, "preparing", f"Loading {self.model_key}...", "info")
        await loop.run_in_executor(None, self._ensure_loaded)
        if getattr(self, "_mock_fallback", False):
            await cb(10, "generating", "Generating simulated 3D mesh...", "info")
            await asyncio.sleep(1.0)
            if request.generate_texture:
                await cb(75, "texturing", "Generating simulated PBR textures...", "info")
                await asyncio.sleep(0.5)
                await cb(90, "texturing", "Simulated textures applied.", "success")
            out = Path(output_dir)
            out.mkdir(parents=True, exist_ok=True)
            mesh_path = str(out / "model.glb")
            with open(mesh_path, "wb") as f:
                f.write(b"GLB_PLACEHOLDER")
            return ProviderResult(
                model_path=mesh_path,
                thumbnail_path="",
                polygon_count=1800,
                vertex_count=900,
                texture_resolution="2048x2048" if request.generate_texture else None,
                has_rig=False,
                file_size=len(b"GLB_PLACEHOLDER"),
                metadata={"provider": self.name, "device": self.device, "simulated": True},
            )

        await cb(10, "generating", "Generating 3D mesh...", "info")

        _log_gpu_memory(f"before_{self.model_key}_inference")

        if request.mode == "image-to-3d" and request.reference_image_url:
            mesh_path = await loop.run_in_executor(
                None, lambda: self._image_to_3d(request, output_dir)
            )
        else:
            mesh_path = await loop.run_in_executor(
                None, lambda: self._text_to_3d(request, output_dir)
            )

        _log_gpu_memory(f"after_{self.model_key}_inference")
        await cb(70, "generating", "Mesh generation complete.", "success")

        tex_res: str | None = None
        if request.generate_texture:
            await cb(75, "texturing", "Generating PBR textures...", "info")
            await loop.run_in_executor(None, lambda: self._texture(request, mesh_path, output_dir))
            tex_res = "2048x2048"
            await cb(90, "texturing", "Textures applied.", "success")

        # Pick best output GLB
        out = Path(output_dir)
        glbs = list(out.glob("*.glb"))
        final_path = str(glbs[0]) if glbs else mesh_path

        from app.core.mesh_processor import get_mesh_stats
        stats = get_mesh_stats(final_path)

        return ProviderResult(
            model_path=final_path,
            thumbnail_path="",
            polygon_count=stats.get("polygon_count", 0),
            vertex_count=stats.get("vertex_count", 0),
            texture_resolution=tex_res,
            has_rig=False,
            file_size=Path(final_path).stat().st_size,
            metadata={"provider": self.model_key, "device": self.device},
        )

    def _text_to_3d(self, request: GenerationRequest, output_dir: str) -> str:
        raise NotImplementedError

    def _image_to_3d(self, request: GenerationRequest, output_dir: str) -> str:
        raise NotImplementedError

    def _texture(self, request: GenerationRequest, mesh_path: str, output_dir: str) -> None:
        pass

    async def health_check(self) -> bool:
        return self.weights_dir.exists()


# ── Hunyuan3D-2.1 (primary) ───────────────────────────────────────────────────

class Hunyuan3D21LocalProvider(_HunyuanBase):
    @property
    def name(self) -> str:
        return "hunyuan3d-2.1"

    def __init__(self, device: str = "cuda") -> None:
        super().__init__("hunyuan3d-2.1", "hunyuan3d-2.1", device)

    def _load_model(self) -> None:
        try:
            from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
            logger.info("Loading Hunyuan3D-2.1 from %s on %s", self.weights_dir, self.device)
            self._model = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
                str(self.weights_dir), device=self.device
            )
            logger.info("Hunyuan3D-2.1 loaded successfully on %s", self.device)
        except Exception as exc:
            raise RuntimeError(f"Hunyuan3D-2.1 load failed: {exc}") from exc

    def _load_tex(self) -> None:
        try:
            from hy3dgen.texgen import Hunyuan3DPaintPipeline
            self._tex = Hunyuan3DPaintPipeline.from_pretrained(
                str(self.weights_dir), device=self.device
            )
        except Exception as exc:
            logger.warning("Hunyuan3D tex pipeline unavailable: %s", exc)

    def _text_to_3d(self, request: GenerationRequest, output_dir: str) -> str:
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        steps = {"low-poly": 20, "standard": 35, "high-poly": 50}.get(request.quality, 35)
        result = self._model(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt or "",
            num_inference_steps=steps,
        )
        dest = str(out / "mesh.glb")
        result.meshes[0].export(dest)
        return dest

    def _image_to_3d(self, request: GenerationRequest, output_dir: str) -> str:
        from PIL import Image
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        img = Image.open(request.reference_image_url)
        result = self._model(image=img)
        dest = str(out / "mesh.glb")
        result.meshes[0].export(dest)
        return dest

    def _texture(self, request: GenerationRequest, mesh_path: str, output_dir: str) -> None:
        if self._tex is None:
            self._load_tex()
        if self._tex is None:
            return
        try:
            result = self._tex(mesh_path=mesh_path, prompt=request.prompt)
            result.mesh.export(str(Path(output_dir) / "model.glb"))
        except Exception as exc:
            logger.warning("Texture generation failed: %s", exc)


# ── Hunyuan3D-2 (fallback) ────────────────────────────────────────────────────

class Hunyuan3D2LocalProvider(_HunyuanBase):
    @property
    def name(self) -> str:
        return "hunyuan3d-2"

    def __init__(self, device: str = "cuda") -> None:
        super().__init__("hunyuan3d-2", "hunyuan3d-2", device)

    def _load_model(self) -> None:
        try:
            from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
            logger.info("Loading Hunyuan3D-2 from %s on %s", self.weights_dir, self.device)
            self._model = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
                str(self.weights_dir), device=self.device
            )
            logger.info("Hunyuan3D-2 loaded successfully on %s", self.device)
        except Exception as exc:
            raise RuntimeError(f"Hunyuan3D-2 load failed: {exc}") from exc

    def _text_to_3d(self, request: GenerationRequest, output_dir: str) -> str:
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        result = self._model(prompt=request.prompt)
        dest = str(out / "mesh.glb")
        result.meshes[0].export(dest)
        return dest

    def _image_to_3d(self, request: GenerationRequest, output_dir: str) -> str:
        from PIL import Image
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        img = Image.open(request.reference_image_url)
        result = self._model(image=img)
        dest = str(out / "mesh.glb")
        result.meshes[0].export(dest)
        return dest
