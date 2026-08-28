"""
Hunyuan3D local providers — wraps third_party/Hunyuan3D-2.1 without modifying it.

Hunyuan3D21LocalProvider  — primary   (Hunyuan3D-2.1, ~29 GB VRAM peak / 21 GB low-VRAM)
Hunyuan3D2MiniLocalProvider — fast    (Hunyuan3D-2 Mini 0.6B, image-to-shape only,
                                      loads its dit from the hunyuan3d-dit-v2-mini
                                      subfolder of the tencent/Hunyuan3D-2mini snapshot)

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
from app.core.mesh_processor import write_placeholder_mesh
from app.schemas.generation import GenerationRequest
from runtime.accelerate_loader import (
    verify_gpu_placement as _verify_gpu_placement,
    log_gpu_memory as _log_gpu_memory,
)

logger = logging.getLogger(__name__)


class _HunyuanBase(BaseProvider):
    def __init__(self, model_key: str, weights_subdir: str, repo_name: str = "Hunyuan3D-2.1", device: str = "cuda", low_vram: bool = False) -> None:
        self.model_key = model_key
        self.repo_name = repo_name
        self.device = device
        self.low_vram = low_vram
        self._model: Any = None
        self._tex: Any = None

        from runtime.storage import get_storage_config
        storage = get_storage_config()
        self.weight_key = model_key
        resolved = storage.get_weight_path(self.weight_key)
        self.weights_dir = Path(resolved) if resolved else storage.get_model_weights_dir(self.repo_name)

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
        _verify_gpu_placement(self._model, self.model_key, self.device)
        _log_gpu_memory(f"after_{self.model_key}_load")

    def _load_model(self) -> None:
        raise NotImplementedError

    def _load_model_with_accelerate(self, pipeline_cls, weight_key: str, subfolder: str | None = None) -> None:
        """Load a Hunyuan3D pipeline with Accelerate device dispatch.

        ponytail: Hunyuan3D pipelines expose ``model``, ``vae``, ``conditioner``
        sub-modules (stored as attributes, not in a ``models`` dict). When VRAM
        is constrained, dispatch each via Accelerate with an auto device_map so
        layers can be offloaded to CPU. Falls back to native ``device=device``
        when Accelerate is unavailable or VRAM is sufficient.

        ``subfolder`` is passed through to ``from_pretrained`` for models whose
        weights live in a subdirectory of the snapshot (hunyuan3d-2-mini keeps
        its dit checkpoint under ``hunyuan3d-dit-v2-mini/``).
        """
        from runtime.accelerate_loader import (
            accelerate_available,
            should_use_accelerate,
            get_max_memory_per_device,
            apply_low_vram_mode,
        )
        from runtime.capability import get_model_vram_required

        vram_needed = get_model_vram_required(self.model_key)

        def _from_pretrained(device: str) -> Any:
            kwargs: dict[str, Any] = {"device": device}
            if subfolder:
                kwargs["subfolder"] = subfolder
            return pipeline_cls.from_pretrained(str(self.weights_dir), **kwargs)

        if self.low_vram:
            # ponytail: verified low-VRAM path — load on CPU then let the
            # strategy layer decide offload/attention-slicing placement.
            logger.info("Low VRAM mode enabled for %s — loading on CPU then dispatching", self.model_key)
            self._model = _from_pretrained("cpu")
            applied = apply_low_vram_mode(
                self._model,
                self.model_key,
                requested_mode="low",
                execution_device=self.device,
                offload_folder=self.weights_dir / ".accelerate_offload",
            )
            if applied is None:
                # No strategy applied — move the model onto the device so the
                # pipeline still runs (falls back to normal footprint behavior).
                self._model = self._model.to(self.device)
            else:
                logger.info("Hunyuan3D low VRAM strategy applied: %s", applied)
            return

        if not accelerate_available() or not should_use_accelerate(vram_needed):
            # Native path — unchanged behavior
            self._model = _from_pretrained(self.device)
            return

        # VRAM constrained — load on CPU, then dispatch
        from accelerate import dispatch_model, infer_auto_device_map
        self._model = _from_pretrained("cpu")

        max_memory = get_max_memory_per_device()
        if max_memory is None:
            # No GPU info — fall back to native device
            self._model = self._model.to(self.device)
            return

        offload_folder = self.weights_dir / ".accelerate_offload"
        sub_models = {}
        for name in ("vae", "model", "conditioner"):
            attr = getattr(self._model, name, None)
            if attr is not None:
                sub_models[name] = attr

        for name, sub_model in sub_models.items():
            try:
                device_map = infer_auto_device_map(
                    sub_model, max_memory=max_memory, dtype="auto"
                )
                dispatch_model(
                    sub_model,
                    device_map=device_map,
                    offload_folder=str(offload_folder),
                )
            except Exception as exc:
                logger.warning("Accelerate dispatch failed for '%s': %s — using .to(device)", name, exc)
                sub_model.to(self.device)

        logger.info("Hunyuan3D loaded with Accelerate dispatch (offload=%s)", vram_needed > 0)

    def unload(self) -> None:
        from runtime.accelerate_loader import safe_unload
        safe_unload(self._model, self._tex, provider_name=self.model_key)
        self._model = None
        self._tex = None
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

        await cb(10, "generating", "Generating 3D mesh...", "info")

        _log_gpu_memory(f"before_{self.model_key}_inference")

        if request.mode == "texture-generation" and request.reference_image_url and request.reference_image_url.endswith(".glb"):
            # Use existing mesh for re-texturing
            mesh_path = request.reference_image_url
            await cb(10, "texturing", "Using existing mesh for material synthesis...", "info")
        elif request.mode == "image-to-3d" and request.reference_image_url:
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

    def __init__(self, device: str = "cuda", low_vram: bool = False) -> None:
        super().__init__("hunyuan3d-2.1", "hunyuan3d-2.1", device, low_vram=low_vram)

    def _load_model(self) -> None:
        try:
            from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
            logger.info("Loading Hunyuan3D-2.1 from %s on %s", self.weights_dir, self.device)
            self._load_model_with_accelerate(
                Hunyuan3DDiTFlowMatchingPipeline, "hunyuan3d-2.1"
            )
            logger.info("Hunyuan3D-2.1 loaded successfully on %s", self.device)
        except Exception as exc:
            raise RuntimeError(f"Hunyuan3D-2.1 load failed: {exc}") from exc

    def _load_tex(self) -> None:
        try:
            from hy3dgen.texgen import Hunyuan3DPaintPipeline
            if self.low_vram:
                from runtime.accelerate_loader import apply_low_vram_mode
                self._tex = Hunyuan3DPaintPipeline.from_pretrained(
                    str(self.weights_dir), device="cpu"
                )
                apply_low_vram_mode(
                    self._tex,
                    self.model_key,
                    requested_mode="low",
                    execution_device=self.device,
                    offload_folder=self.weights_dir / ".accelerate_offload",
                )
            else:
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


# -- Hunyuan3D-2 Mini (0.6B image-to-shape, fast) ------------------------------

class Hunyuan3D2MiniLocalProvider(_HunyuanBase):
    """Hunyuan3D-2 Mini (0.6B) -- fast image-to-shape model.

    Image-to-shape ONLY: its pipeline ``__call__`` accepts no ``prompt``, so
    text-to-3d is neither advertised nor routable. The dit checkpoint lives in
    the ``hunyuan3d-dit-v2-mini`` subfolder of the tencent/Hunyuan3D-2mini
    snapshot. Texture generation reuses the Hunyuan3D 2.0 paint pipeline
    per the upstream ``textured_shape_gen_mini.py`` example; it is a soft
    dependency -- the paint weights must be present in the
    hunyuan3d-2.0 weights dir, otherwise ``_texture`` logs and skips.
    """

    SUBFOLDER = "hunyuan3d-dit-v2-mini"
    _TEX_SOURCE = "hunyuan3d-2.1"  # sibling weight_key holding the paint weights

    @property
    def name(self) -> str:
        return "hunyuan3d-2-mini"

    def __init__(self, device: str = "cuda", low_vram: bool = False) -> None:
        super().__init__("hunyuan3d-2-mini", "hunyuan3d-2-mini", device, low_vram=low_vram)

    def _load_model(self) -> None:
        try:
            from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
            logger.info("Loading Hunyuan3D-2 Mini from %s on %s", self.weights_dir, self.device)
            self._load_model_with_accelerate(
                Hunyuan3DDiTFlowMatchingPipeline, "hunyuan3d-2-mini", subfolder=self.SUBFOLDER
            )
            logger.info("Hunyuan3D-2 Mini loaded successfully on %s", self.device)
        except Exception as exc:
            raise RuntimeError(f"Hunyuan3D-2 Mini load failed: {exc}") from exc

    def _text_to_3d(self, request: GenerationRequest, output_dir: str) -> str:
        raise NotImplementedError(
            "Hunyuan3D-2 Mini is an image-to-shape model -- text-to-3d is not supported."
        )

    def _image_to_3d(self, request: GenerationRequest, output_dir: str) -> str:
        import torch
        from PIL import Image
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        img = Image.open(request.reference_image_url).convert("RGBA")
        # ponytail: steps/octree_resolution/num_chunks match the official
        # shape_gen_mini.py reference; quality scales inference steps only.
        steps = {"low-poly": 20, "standard": 30, "high-poly": 50}.get(request.quality, 30)
        result = self._model(
            image=img,
            num_inference_steps=steps,
            octree_resolution=380,
            num_chunks=20000,
            generator=torch.manual_seed(12345),
            output_type="trimesh",
        )[0]
        dest = str(out / "mesh.glb")
        result.export(dest)
        return dest

    def _load_tex(self) -> None:
        try:
            from hy3dgen.texgen import Hunyuan3DPaintPipeline
            from runtime.storage import get_storage_config
            tex_dir = (
                get_storage_config().get_repo_path("Hunyuan3D-2.1")
                / "weights" / self._TEX_SOURCE
            )
            if not (tex_dir / "hunyuan3d-delight-v2-0").exists():
                logger.warning(
                    "Hunyuan3D-2 Mini texture generation needs the "
                    "paint weights under %s -- skipping texture.", tex_dir,
                )
                return
            if self.low_vram:
                from runtime.accelerate_loader import apply_low_vram_mode
                self._tex = Hunyuan3DPaintPipeline.from_pretrained(str(tex_dir))
                apply_low_vram_mode(
                    self._tex, self.model_key, requested_mode="low",
                    execution_device=self.device,
                    offload_folder=self.weights_dir / ".accelerate_offload",
                )
            else:
                self._tex = Hunyuan3DPaintPipeline.from_pretrained(str(tex_dir))
        except Exception as exc:
            logger.warning("Hunyuan3D tex pipeline unavailable: %s", exc)

    def _texture(self, request: GenerationRequest, mesh_path: str, output_dir: str) -> None:
        if self._tex is None:
            self._load_tex()
        if self._tex is None:
            return
        if not request.reference_image_url:
            logger.warning(
                "Hunyuan3D-2 Mini texture generation needs a reference image "
                "(use image-to-3d + texture)."
            )
            return
        import trimesh
        from PIL import Image
        try:
            mesh = trimesh.load(mesh_path)
            img = Image.open(request.reference_image_url).convert("RGBA")
            textured = self._tex(mesh, image=img)
            textured.export(mesh_path)  # overwrite the shape with the textured mesh
        except Exception as exc:
            logger.warning("Texture generation failed: %s", exc)
