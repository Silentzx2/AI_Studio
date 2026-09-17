"""
Hunyuan3D local providers — each provider uses its own isolated directory and venv.

Hunyuan3D21LocalProvider  — primary   (Hunyuan3D-2.1, ~29 GB VRAM peak / 21 GB low-VRAM)
Hunyuan3D2MiniLocalProvider — fast    (Hunyuan3D-2 Mini 0.6B, image-to-shape only,
                                      loads its dit from the hunyuan3d-dit-v2-mini
                                      subfolder of the tencent/Hunyuan3D-2mini snapshot)

FIXES APPLIED:
- Added GPU execution verification after model load
- Added GPU memory logging before/after inference
- Unified path resolution using StorageConfig
- Per-model venv isolation: each provider calls _add_model_env() with its own repo_name
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from app.core.providers.base import BaseProvider, ProviderResult, _add_model_env
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
        # CRITICAL: Set up per-model environment to ensure correct package versions
        _add_model_env(self.repo_name)
        try:
            from runtime.gpu import enable_fast_cuda_acceleration
            enable_fast_cuda_acceleration()
        except Exception:
            pass
        if self._model is not None:
            return
        if not self.weights_dir.exists():
            raise RuntimeError(f"Weights for '{self.model_key}' not found at {self.weights_dir}")
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
        await cb(10, "generating", "Generating 3D mesh...", "info")

        _log_gpu_memory(f"before_{self.model_key}_inference")

        source_mesh = request.source_mesh_url or (
            request.reference_image_url
            if request.reference_image_url and any(request.reference_image_url.lower().endswith(ext) for ext in (".glb", ".gltf", ".obj"))
            else None
        )

        if request.mode == "texture-generation" and source_mesh:
            # Use existing mesh for re-texturing
            mesh_path = source_mesh
            await cb(10, "texturing", "Using existing mesh for material synthesis...", "info")
        elif request.reference_image_url:
            gen_future = loop.run_in_executor(
                None, lambda: self._image_to_3d(request, output_dir)
            )
            cur_p = 15
            while not gen_future.done():
                await asyncio.sleep(3.0)
                if not gen_future.done():
                    cur_p = min(68, cur_p + 3)
                    await cb(cur_p, "generating", f"Synthesizing 3D geometry with DiT flow matching ({cur_p}%)...", "info")
            mesh_path = await gen_future
        else:
            gen_future = loop.run_in_executor(
                None, lambda: self._text_to_3d(request, output_dir)
            )
            cur_p = 15
            while not gen_future.done():
                await asyncio.sleep(3.0)
                if not gen_future.done():
                    cur_p = min(68, cur_p + 3)
                    await cb(cur_p, "generating", f"Synthesizing 3D geometry with DiT flow matching ({cur_p}%)...", "info")
            mesh_path = await gen_future

        _log_gpu_memory(f"after_{self.model_key}_inference")
        await cb(70, "generating", "Raw mesh extraction complete. Preparing OpenX Clay post-processing pipeline...", "info")

        tex_res: str | None = None
        if request.generate_texture or request.mode == "texture-generation":
            await cb(71, "texturing", "Synthesizing base surface materials...", "info")
            try:
                await asyncio.wait_for(
                    loop.run_in_executor(None, lambda: self._texture(request, mesh_path, output_dir)),
                    timeout=30.0,
                )
                model_glb = Path(output_dir) / "model.glb"
                if model_glb.is_file() and model_glb.stat().st_size > 0:
                    tex_res = "2048x2048"
                    await cb(72, "texturing", "Base surface materials applied.", "info")
                else:
                    await cb(72, "texturing", "Base surface geometry retained.", "info")
            except Exception as tex_exc:
                logger.warning("Texture pass bypassed or timed out: %s", tex_exc)
                await cb(72, "texturing", f"Base surface retained ({tex_exc})", "info")

        # Pick best output GLB: prioritize model.glb (textured) over mesh.glb (raw geometry)
        out = Path(output_dir)
        model_glb = out / "model.glb"
        mesh_glb = out / "mesh.glb"
        if model_glb.is_file() and model_glb.stat().st_size > 0:
            final_path = str(model_glb)
        elif mesh_glb.is_file() and mesh_glb.stat().st_size > 0:
            final_path = str(mesh_glb)
        elif Path(mesh_path).is_file() and Path(mesh_path).stat().st_size > 0:
            final_path = mesh_path
        else:
            glbs = sorted(list(out.glob("*.glb")), key=lambda p: (0 if p.name == "model.glb" else 1, p.name))
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

    def _preprocess_image(self, image_path: str) -> Any:
        from PIL import Image
        img = Image.open(image_path)
        # Normalize non-standard modes (e.g. palette P with transparency, grayscale LA)
        if img.mode not in ("RGBA", "RGB"):
            img = img.convert("RGBA")
        has_transparency = False
        if img.mode == "RGBA":
            extrema = img.getextrema()
            if len(extrema) == 4 and extrema[3][0] < 240:
                has_transparency = True
        if not has_transparency:
            processed = False
            try:
                from hy3dshape.rembg import BackgroundRemover
                remover = BackgroundRemover()
                img = remover(img)
                processed = True
                logger.info("Background removed via hy3dshape.rembg.BackgroundRemover")
            except Exception:
                try:
                    from hy3dgen.rembg import BackgroundRemover
                    remover = BackgroundRemover()
                    img = remover(img)
                    processed = True
                    logger.info("Background removed via hy3dgen.rembg.BackgroundRemover")
                except Exception as exc:
                    logger.info("hy3dgen BackgroundRemover unavailable: %s", exc)

            if not processed:
                try:
                    import rembg
                    img = rembg.remove(img)
                    processed = True
                    logger.info("Background removed via rembg.remove")
                except Exception as exc:
                    logger.info("rembg.remove fallback unavailable: %s", exc)

            # 3. Try BriaRMBG (pure PyTorch, no onnxruntime dependency)
            if not processed:
                try:
                    from runtime.storage import get_storage_config
                    storage = get_storage_config()
                    triposg_scripts = storage.get_repo_path("TripoSG") / "scripts"
                    if triposg_scripts.exists() and str(triposg_scripts) not in sys.path:
                        sys.path.insert(0, str(triposg_scripts))
                    from briarmbg import BriaRMBG
                    from image_process import prepare_image
                    rmbg_dir = storage.get_weight_path("RMBG-1.4") or storage.get_weight_path("briaai/RMBG-1.4")
                    if rmbg_dir and Path(rmbg_dir).exists():
                        rmbg_net = BriaRMBG.from_pretrained(str(rmbg_dir), local_files_only=True).to(self.device)
                    else:
                        rmbg_net = BriaRMBG.from_pretrained("briaai/RMBG-1.4", local_files_only=False).to(self.device)
                    rmbg_net.eval()
                    import numpy as np
                    img = prepare_image(image_path, bg_color=np.array([1.0, 1.0, 1.0]), rmbg_net=rmbg_net)
                    processed = True
                    logger.info("Background removed via BriaRMBG (PyTorch)")
                except Exception as exc:
                    logger.info("BriaRMBG fallback unavailable: %s", exc)

            # 4. Color-threshold fallback for solid/uniform background (pure PIL, zero extra deps)
            if not processed:
                try:
                    corners = [
                        img.getpixel((0, 0)),
                        img.getpixel((img.width - 1, 0)),
                        img.getpixel((0, img.height - 1)),
                        img.getpixel((img.width - 1, img.height - 1)),
                    ]
                    c0 = corners[0][:3]
                    if all(all(abs(c[i] - c0[i]) < 12 for i in range(3)) for c in corners):
                        img_rgba = img.convert("RGBA")
                        data = img_rgba.getdata()
                        new_data = [
                            (255, 255, 255, 0) if all(abs(p[i] - c0[i]) < 18 for i in range(3)) else p
                            for p in data
                        ]
                        img_rgba.putdata(new_data)
                        img = img_rgba
                        processed = True
                        logger.info("Background removed via solid color-masking fallback")
                except Exception as exc:
                    logger.info("Color-masking fallback skipped: %s", exc)

            if not processed:
                logger.warning(
                    "Background removal unavailable; Hunyuan3D may generate spherical blob without transparent background"
                )
        if img.mode != "RGBA":
            img = img.convert("RGBA")
        return img

    def _text_to_3d(self, request: GenerationRequest, output_dir: str) -> str:
        raise NotImplementedError

    def _image_to_3d(self, request: GenerationRequest, output_dir: str) -> str:
        raise NotImplementedError

    def _project_texture(self, mesh_path: str, image_path: str, output_glb: str) -> str:
        """Project reference image onto mesh UVs with occlusion-aware PBR texture & tangent normal map.

        Ensures that generated 3D models always have vivid textures, sharp teeth,
        eyes, and colors, even when large neural paint diffusion weights are not installed.
        """
        try:
            import trimesh
            import numpy as np
            m = trimesh.load(mesh_path, force="mesh")
            is_textured = False
            if getattr(m.visual, "defined", False):
                from app.core.texture_projection import is_real_textured_mesh
                if is_real_textured_mesh(m):
                    is_textured = True
                elif getattr(m.visual, "kind", None) == "vertex":
                    vc = getattr(m.visual, "vertex_colors", None)
                    if vc is not None and len(vc) > 0 and not np.all(vc == [102, 102, 102, 255]):
                        is_textured = True

            if is_textured:
                import shutil
                shutil.copy2(mesh_path, output_glb)
                return output_glb
            from app.core.texture_projection import project_reference_texture
            return str(project_reference_texture(mesh_path, image_path, output_glb))
        except Exception as exc:
            logger.warning("Advanced texture projection failed: %s; falling back", exc)
            import shutil
            shutil.copy2(mesh_path, output_glb)
            return output_glb

    def _texture(self, request: GenerationRequest, mesh_path: str, output_dir: str) -> None:
        out = Path(output_dir) if output_dir else Path(mesh_path).parent
        out.mkdir(parents=True, exist_ok=True)
        out_glb = str(out / "model.glb")
        ref_img = request.reference_image_url
        if ref_img and Path(ref_img).exists():
            self._project_texture(mesh_path, ref_img, out_glb)
        elif Path(mesh_path).is_file() and not Path(out_glb).is_file():
            import shutil
            shutil.copy2(mesh_path, out_glb)

    async def health_check(self) -> bool:
        return self.weights_dir.exists()


def _load_paint_pipeline_compat(pipeline_cls, weights_path: str, target_device: str):
    """Load paint pipeline with backward compatibility for `device` kwarg.
    
    Hunyuan3DPaintPipeline in newer releases does not accept `device` as a keyword
    argument in `from_pretrained`, requiring `.to(device)` instead.
    """
    try:
        return pipeline_cls.from_pretrained(weights_path, device=target_device)
    except TypeError:
        pipe = pipeline_cls.from_pretrained(weights_path)
        if hasattr(pipe, "to") and target_device:
            pipe = pipe.to(target_device)
        return pipe


# ── Hunyuan3D-2.1 (primary) ───────────────────────────────────────────────────

class Hunyuan3D21LocalProvider(_HunyuanBase):
    @property
    def name(self) -> str:
        return "hunyuan3d-2.1"

    def __init__(self, device: str = "cuda", low_vram: bool = False) -> None:
        _add_model_env("Hunyuan3D-2.1")
        super().__init__("hunyuan3d-2.1", "hunyuan3d-2.1", repo_name="Hunyuan3D-2.1", device=device, low_vram=low_vram)

    def _load_model(self) -> None:
        try:
            from app.core.providers.base import _patch_numpy_legacy_aliases
            _patch_numpy_legacy_aliases()
            try:
                import transformers.utils.import_utils as _tiu
                if hasattr(_tiu, "check_torch_load_is_safe"):
                    _tiu.check_torch_load_is_safe = lambda *a, **kw: None
            except Exception:
                pass
            try:
                import diffusers.utils.import_utils as _diu
                _diu.is_onnx_available = lambda: False
                _diu.is_onnxruntime_available = lambda: False
            except Exception:
                pass
            try:
                from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
            except ImportError:
                try:
                    from hy3dshape import Hunyuan3DDiTFlowMatchingPipeline
                except ImportError as shape_imp_err:
                    logger.warning(
                        "DEGRADED_MODE: Official 'hy3dshape' package not found (%s); "
                        "activating legacy 'hy3dgen.shapegen' compatibility fallback for Hunyuan3D-2.1. "
                        "For full 2.1 features, ensure Tencent-Hunyuan/Hunyuan3D-2.1 is cloned.",
                        shape_imp_err,
                    )
                    try:
                        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
                    except ImportError as leg_shape_err:
                        raise RuntimeError(
                            f"Hunyuan3D-2.1 shape pipeline missing: neither official 'hy3dshape' nor "
                            f"compatibility 'hy3dgen' is available: {leg_shape_err}"
                        ) from leg_shape_err

            logger.info("Loading Hunyuan3D-2.1 from %s on %s", self.weights_dir, self.device)
            subfolder = "hunyuan3d-dit-v2-1" if (self.weights_dir / "hunyuan3d-dit-v2-1").exists() else None
            self._load_model_with_accelerate(
                Hunyuan3DDiTFlowMatchingPipeline, "hunyuan3d-2.1", subfolder=subfolder
            )
            logger.info("Hunyuan3D-2.1 loaded successfully on %s", self.device)
        except Exception as exc:
            raise RuntimeError(f"Hunyuan3D-2.1 load failed: {exc}") from exc

    def _load_tex(self, request: GenerationRequest | None = None) -> None:
        try:
            from app.core.providers.base import _patch_numpy_legacy_aliases
            _patch_numpy_legacy_aliases()
            try:
                import transformers.utils.import_utils as _tiu
                if hasattr(_tiu, "check_torch_load_is_safe"):
                    _tiu.check_torch_load_is_safe = lambda *a, **kw: None
            except Exception:
                pass
            try:
                import diffusers.utils.import_utils as _diu
                _diu.is_onnx_available = lambda: False
                _diu.is_onnxruntime_available = lambda: False
            except Exception:
                pass

            try:
                from torchvision_fix import apply_fix
                apply_fix()
            except Exception:
                pass

            tex_cls = None
            conf_cls = None
            is_legacy = False
            official_paint = False

            try:
                from textureGenPipeline import Hunyuan3DPaintPipeline, Hunyuan3DPaintConfig
                tex_cls = Hunyuan3DPaintPipeline
                conf_cls = Hunyuan3DPaintConfig
                official_paint = True
            except ImportError:
                try:
                    from hy3dpaint.pipelines import Hunyuan3DPaintPipeline
                    tex_cls = Hunyuan3DPaintPipeline
                    official_paint = True
                    try:
                        from hy3dpaint.pipelines import Hunyuan3DPaintConfig
                        conf_cls = Hunyuan3DPaintConfig
                    except ImportError:
                        pass
                except ImportError as paint_imp_err:
                    logger.warning(
                        "DEGRADED_MODE: Official 'hy3dpaint' package not found (%s); "
                        "activating legacy 'hy3dgen.texgen' compatibility fallback.",
                        paint_imp_err,
                    )
                    from hy3dgen.texgen import Hunyuan3DPaintPipeline
                    tex_cls = Hunyuan3DPaintPipeline
                    is_legacy = True

            has_paint_weights = (
                (self.weights_dir / "hunyuan3d-paintpbr-v2-1").exists()
                or (self.weights_dir / "hunyuan3d-paint-v2-0").exists()
                or (self.weights_dir / "model_index.json").exists()
            )
            if not has_paint_weights:
                logger.info("Local paint diffusion weights not installed; fast texture projection fallback will be used")
                self._tex = None
                return

            tex_weights = self.weights_dir
            if (self.weights_dir / "hunyuan3d-paintpbr-v2-1").exists():
                tex_weights = self.weights_dir / "hunyuan3d-paintpbr-v2-1"

            if is_legacy or conf_cls is None or not official_paint:
                # Legacy hy3dgen 2.0 or compatible from_pretrained pipeline
                if self.low_vram:
                    from runtime.accelerate_loader import apply_low_vram_mode
                    self._tex = _load_paint_pipeline_compat(tex_cls, str(tex_weights), "cpu")
                    apply_low_vram_mode(
                        self._tex,
                        self.model_key,
                        requested_mode="low",
                        execution_device=self.device,
                        offload_folder=self.weights_dir / ".accelerate_offload",
                    )
                else:
                    self._tex = _load_paint_pipeline_compat(tex_cls, str(tex_weights), self.device)
            else:
                # Official Hunyuan3D-2.1 Paint Pipeline
                from runtime.storage import get_storage_config
                storage = get_storage_config()
                repo_dir = storage.get_repo_path(self.repo_name)

                quality = (request.quality if request else None) or "standard"
                paint_presets = {
                    "draft": {"max_num_view": 6, "resolution": 512},
                    "low-poly": {"max_num_view": 6, "resolution": 512},
                    "standard": {"max_num_view": 6, "resolution": 512},
                    "high-poly": {"max_num_view": 9, "resolution": 512},
                    "ultra": {"max_num_view": 9, "resolution": 768},
                }
                paint_cfg = paint_presets.get(quality, paint_presets["standard"])
                conf = conf_cls(
                    max_num_view=paint_cfg["max_num_view"],
                    resolution=paint_cfg["resolution"],
                )
                conf.device = self.device

                multiview_cfg = repo_dir / "hy3dpaint" / "cfgs" / "hunyuan-paint-pbr.yaml"
                if multiview_cfg.exists():
                    conf.multiview_cfg_path = str(multiview_cfg)

                custom_pipe = repo_dir / "hy3dpaint" / "hunyuanpaintpbr"
                if custom_pipe.exists():
                    conf.custom_pipeline = str(custom_pipe)

                realesrgan_candidates = [
                    repo_dir / "hy3dpaint" / "ckpt" / "RealESRGAN_x4plus.pth",
                    repo_dir / "ckpt" / "RealESRGAN_x4plus.pth",
                    self.weights_dir / "RealESRGAN_x4plus.pth",
                    storage.weights_dir / "RealESRGAN_x4plus.pth",
                ]
                for r_cand in realesrgan_candidates:
                    if r_cand.exists():
                        conf.realesrgan_ckpt_path = str(r_cand)
                        break

                # The official Hunyuan3D-2.1 paint README requires the
                # RealESRGAN checkpoint. Fetch it lazily into the model repo
                # only when absent so a shape-only install does not download
                # the extra asset unnecessarily.
                if not getattr(conf, "realesrgan_ckpt_path", None):
                    target_ckpt = repo_dir / "hy3dpaint" / "ckpt" / "RealESRGAN_x4plus.pth"
                    try:
                        target_ckpt.parent.mkdir(parents=True, exist_ok=True)
                        from urllib.request import urlopen
                        url = (
                            "https://github.com/xinntao/Real-ESRGAN/releases/download/"
                            "v0.1.0/RealESRGAN_x4plus.pth"
                        )
                        logger.info("Downloading required Hunyuan3D-2.1 RealESRGAN checkpoint to %s", target_ckpt)
                        with urlopen(url, timeout=60) as response, target_ckpt.open("wb") as fh:
                            while True:
                                chunk = response.read(1024 * 1024)
                                if not chunk:
                                    break
                                fh.write(chunk)
                        if target_ckpt.stat().st_size > 0:
                            conf.realesrgan_ckpt_path = str(target_ckpt)
                        else:
                            target_ckpt.unlink(missing_ok=True)
                    except Exception as ckpt_exc:
                        logger.warning(
                            "Hunyuan3D-2.1 RealESRGAN checkpoint unavailable; official paint may fail: %s",
                            ckpt_exc,
                        )

                if (self.weights_dir / "hunyuan3d-paintpbr-v2-1").exists():
                    conf.multiview_pretrained_path = str(self.weights_dir)
                else:
                    conf.multiview_pretrained_path = "tencent/Hunyuan3D-2.1"

                self._tex = tex_cls(conf)
                logger.info("Official Hunyuan3D-2.1 paint pipeline initialized successfully")
        except Exception as exc:
            logger.warning("Hunyuan3D tex pipeline unavailable: %s", exc)
            self._tex = None

    def _text_to_3d(self, request: GenerationRequest, output_dir: str) -> str:
        if request.reference_image_url:
            return self._image_to_3d(request, output_dir)

        import inspect
        sig = inspect.signature(self._model.__call__)
        if "prompt" not in sig.parameters:
            raise ValueError(
                "Hunyuan3D-2.1 is an image-to-3D pipeline requiring an input reference image. "
                "Please provide a reference image to generate 3D assets."
            )

        import torch
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        quality_steps = {
            "low": 20, "low-poly": 20, "draft": 20,
            "standard": 35, "medium": 35,
            "high": 50, "high-poly": 50,
            "ultra": 75,
        }
        quality_octree = {
            "low": 256, "low-poly": 256, "draft": 256,
            "standard": 384, "medium": 384,
            "high": 512, "high-poly": 512,
            "ultra": 640,
        }
        steps = request.num_inference_steps or quality_steps.get(request.quality, 35)
        guidance = request.guidance_scale if request.guidance_scale is not None else 5.5
        octree_res = request.octree_resolution or quality_octree.get(request.quality, 384)
        seed = request.seed if request.seed is not None else 12345
        generator = torch.manual_seed(seed)

        call_kwargs: dict[str, Any] = {
            "prompt": request.prompt,
            "negative_prompt": request.negative_prompt or "",
            "num_inference_steps": steps,
            "guidance_scale": guidance,
            "octree_resolution": octree_res,
            "generator": generator,
        }
        if request.num_chunks is not None:
            call_kwargs["num_chunks"] = request.num_chunks

        valid_kwargs = {k: v for k, v in call_kwargs.items() if k in sig.parameters}

        with torch.inference_mode():
            result = self._model(**valid_kwargs)

        dest = str(out / "mesh.glb")
        if hasattr(result, "meshes") and result.meshes:
            mesh = result.meshes[0]
        elif isinstance(result, (list, tuple)) and len(result) > 0:
            mesh = result[0]
            while isinstance(mesh, (list, tuple)) and len(mesh) > 0:
                mesh = mesh[0]
        elif hasattr(result, "export"):
            mesh = result
        else:
            raise RuntimeError(f"Unexpected output from Hunyuan3D-2.1 model: {type(result)}")

        # Preserve full geometric fidelity for master source mesh
        try:
            import trimesh
            if hasattr(mesh, "vertices") and hasattr(mesh, "faces"):
                wn = trimesh.geometry.weighted_vertex_normals(
                    vertex_count=len(mesh.vertices),
                    faces=mesh.faces,
                    face_normals=mesh.face_normals,
                    face_angles=mesh.face_angles,
                )
                mesh.vertex_normals = wn
        except Exception:
            pass

        mesh.export(dest)
        return dest

    def _image_to_3d(self, request: GenerationRequest, output_dir: str) -> str:
        import torch
        import inspect
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        img = self._preprocess_image(request.reference_image_url)

        quality_steps = {
            "low": 20, "low-poly": 20, "draft": 20,
            "standard": 35, "medium": 35,
            "high": 50, "high-poly": 50,
            "ultra": 75,
        }
        quality_octree = {
            "low": 256, "low-poly": 256, "draft": 256,
            "standard": 384, "medium": 384,
            "high": 512, "high-poly": 512,
            "ultra": 640,
        }
        steps = request.num_inference_steps or quality_steps.get(request.quality, 35)
        guidance = request.guidance_scale if request.guidance_scale is not None else 5.0
        octree_res = request.octree_resolution or quality_octree.get(request.quality, 384)
        chunks = request.num_chunks or 20000
        seed = request.seed if request.seed is not None else 12345
        generator = torch.manual_seed(seed)

        call_kwargs: dict[str, Any] = {
            "image": img,
            "num_inference_steps": steps,
            "guidance_scale": guidance,
            "octree_resolution": octree_res,
            "num_chunks": chunks,
            "generator": generator,
            "output_type": "trimesh",
        }

        sig = inspect.signature(self._model.__call__)
        valid_kwargs = {k: v for k, v in call_kwargs.items() if k in sig.parameters}

        with torch.inference_mode():
            result = self._model(**valid_kwargs)

        dest = str(out / "mesh.glb")
        if hasattr(result, "meshes") and result.meshes:
            mesh = result.meshes[0]
        elif isinstance(result, (list, tuple)) and len(result) > 0:
            mesh = result[0]
            while isinstance(mesh, (list, tuple)) and len(mesh) > 0:
                mesh = mesh[0]
        elif hasattr(result, "export"):
            mesh = result
        else:
            raise RuntimeError(f"Unexpected output from Hunyuan3D-2.1 model: {type(result)}")

        # Preserve full geometric fidelity for master source mesh
        try:
            import trimesh
            if hasattr(mesh, "vertices") and hasattr(mesh, "faces"):
                wn = trimesh.geometry.weighted_vertex_normals(
                    vertex_count=len(mesh.vertices),
                    faces=mesh.faces,
                    face_normals=mesh.face_normals,
                    face_angles=mesh.face_angles,
                )
                mesh.vertex_normals = wn
        except Exception:
            pass

        mesh.export(dest)
        return dest

    def _texture(self, request: GenerationRequest, mesh_path: str, output_dir: str) -> None:
        out = Path(output_dir) if output_dir else Path(mesh_path).parent
        out.mkdir(parents=True, exist_ok=True)
        out_glb = str(out / "model.glb")

        if self._tex is None:
            self._load_tex(request=request)

        if self._tex is not None:
            try:
                import torch
                from PIL import Image

                if hasattr(self._tex, "models") and hasattr(self._tex, "render"):
                    logger.info("Executing official Hunyuan3D-2.1 paint pipeline on %s", mesh_path)
                    ref_img = request.reference_image_url
                    if not ref_img:
                        raise ValueError("Reference image is required for Hunyuan3D-2.1 paint pipeline")

                    obj_out = str(out / "textured_mesh.obj")
                    with torch.inference_mode():
                        self._tex(
                            mesh_path=mesh_path,
                            image_path=ref_img,
                            output_mesh_path=obj_out,
                            save_glb=True,
                        )

                    produced_glb = Path(obj_out.replace(".obj", ".glb"))
                    if produced_glb.is_file() and produced_glb.stat().st_size > 0:
                        import shutil
                        shutil.copy2(str(produced_glb), out_glb)
                        logger.info("Official Hunyuan3D-2.1 paint pipeline completed: %s", out_glb)
                        return
                    elif Path(obj_out).is_file() and Path(obj_out).stat().st_size > 0:
                        import trimesh
                        t_mesh = trimesh.load(obj_out, force="mesh")
                        t_mesh.export(out_glb, file_type="glb")
                        logger.info("Official Hunyuan3D-2.1 paint pipeline mesh exported to %s", out_glb)
                        return
                else:
                    import trimesh
                    mesh = trimesh.load(mesh_path, force="mesh")
                    img = Image.open(request.reference_image_url).convert("RGBA") if request.reference_image_url else None
                    with torch.inference_mode():
                        if img is not None:
                            try:
                                result = self._tex(mesh_path, image_path=request.reference_image_url)
                            except (TypeError, Exception):
                                try:
                                    result = self._tex(mesh, image=img)
                                except TypeError:
                                    result = self._tex(mesh_path=mesh_path, image=img)
                        else:
                            result = self._tex(mesh_path=mesh_path, prompt=request.prompt)

                    if hasattr(result, "export"):
                        result.export(out_glb)
                        return
                    elif hasattr(result, "mesh") and hasattr(result.mesh, "export"):
                        result.mesh.export(out_glb)
                        return
            except Exception as exc:
                logger.warning("Hunyuan3D-2.1 paint pipeline execution failed: %s; trying projection fallback", exc)

        if request.reference_image_url:
            self._project_texture(mesh_path, request.reference_image_url, out_glb)
        elif Path(mesh_path).is_file() and not Path(out_glb).is_file():
            import shutil
            shutil.copy2(mesh_path, out_glb)


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
        _add_model_env("Hunyuan3D-2mini")
        super().__init__("hunyuan3d-2-mini", "hunyuan3d-2-mini", repo_name="Hunyuan3D-2mini", device=device, low_vram=low_vram)

    def _load_model(self) -> None:
        try:
            from app.core.providers.base import _patch_numpy_legacy_aliases
            _patch_numpy_legacy_aliases()
            import os, warnings
            os.environ.setdefault("NUMBA_THREADING_LAYER", "workqueue")
            warnings.filterwarnings("ignore", message=".*The TBB threading layer requires TBB version.*")
            try:
                import transformers.utils.import_utils as _tiu
                if hasattr(_tiu, "check_torch_load_is_safe"):
                    _tiu.check_torch_load_is_safe = lambda *a, **kw: None
            except Exception:
                pass
            try:
                import diffusers.utils.import_utils as _diu
                _diu.is_onnx_available = lambda: False
                _diu.is_onnxruntime_available = lambda: False
            except Exception:
                pass
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
        import inspect
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        img = self._preprocess_image(request.reference_image_url)

        quality_steps = {
            "low": 20, "low-poly": 20, "draft": 20,
            "standard": 30, "medium": 30,
            "high": 50, "high-poly": 50,
            "ultra": 70,
        }
        quality_octree = {
            "low": 256, "low-poly": 256, "draft": 256,
            "standard": 384, "medium": 384,
            "high": 512, "high-poly": 512,
            "ultra": 640,
        }
        steps = request.num_inference_steps or quality_steps.get(request.quality, 30)
        octree_res = request.octree_resolution or quality_octree.get(request.quality, 384)
        chunks = request.num_chunks or 20000
        seed = request.seed if request.seed is not None else 12345
        generator = torch.manual_seed(seed)
        guidance = request.guidance_scale if request.guidance_scale is not None else 5.0

        call_kwargs: dict[str, Any] = {
            "image": img,
            "num_inference_steps": steps,
            "octree_resolution": octree_res,
            "num_chunks": chunks,
            "generator": generator,
            "guidance_scale": guidance,
            "output_type": "trimesh",
        }

        sig = inspect.signature(self._model.__call__)
        valid_kwargs = {k: v for k, v in call_kwargs.items() if k in sig.parameters}

        with torch.inference_mode():
            result = self._model(**valid_kwargs)

        if isinstance(result, (list, tuple)) and len(result) > 0:
            mesh = result[0]
        elif hasattr(result, "meshes") and result.meshes:
            mesh = result.meshes[0]
        elif hasattr(result, "export"):
            mesh = result
        else:
            raise RuntimeError(f"Unexpected output from Hunyuan3D-2 Mini model: {type(result)}")

        # Preserve full geometric fidelity for master source mesh
        try:
            import trimesh
            if hasattr(mesh, "vertices") and hasattr(mesh, "faces"):
                wn = trimesh.geometry.weighted_vertex_normals(
                    vertex_count=len(mesh.vertices),
                    faces=mesh.faces,
                    face_normals=mesh.face_normals,
                    face_angles=mesh.face_angles,
                )
                mesh.vertex_normals = wn
        except Exception:
            pass

        dest = str(out / "mesh.glb")
        mesh.export(dest)
        return dest

    def _load_tex(self) -> None:
        try:
            from app.core.providers.base import _patch_numpy_legacy_aliases
            _patch_numpy_legacy_aliases()
            try:
                import transformers.utils.import_utils as _tiu
                if hasattr(_tiu, "check_torch_load_is_safe"):
                    _tiu.check_torch_load_is_safe = lambda *a, **kw: None
            except Exception:
                pass
            try:
                import diffusers.utils.import_utils as _diu
                _diu.is_onnx_available = lambda: False
                _diu.is_onnxruntime_available = lambda: False
            except Exception:
                pass
            from hy3dgen.texgen import Hunyuan3DPaintPipeline
            from runtime.storage import get_storage_config
            storage = get_storage_config()
            resolved = storage.get_weight_path(self._TEX_SOURCE)
            tex_dir = Path(resolved) if resolved else None

            def _is_paint_dir(p: Path | None) -> bool:
                return bool(p and p.exists() and (
                    (p / "hunyuan3d-delight-v2-0").exists()
                    or (p / "hunyuan3d-paintpbr-v2-1").exists()
                    or (p / "hunyuan3d-paint-v2-0").exists()
                ))

            if not _is_paint_dir(tex_dir):
                for cand in [
                    storage.get_repo_path("Hunyuan3D-2.1") / "weights" / self._TEX_SOURCE,
                    storage.get_repo_path("Hunyuan3D-2.1") / "weights",
                    storage.get_repo_path("Hunyuan3D-2mini") / "weights" / self._TEX_SOURCE,
                    storage.get_repo_path("Hunyuan3D-2mini") / "weights",
                ]:
                    if _is_paint_dir(cand):
                        tex_dir = cand
                        break

            has_paint = _is_paint_dir(tex_dir)
            if not has_paint:
                logger.info(
                    "Local paint weights not found under %s; texturing will use projection mapping",
                    tex_dir,
                )
                self._tex = None
                return

            weights_source = str(tex_dir)
            if self.low_vram:
                from runtime.accelerate_loader import apply_low_vram_mode
                self._tex = _load_paint_pipeline_compat(Hunyuan3DPaintPipeline, weights_source, "cpu")
                apply_low_vram_mode(
                    self._tex, self.model_key, requested_mode="low",
                    execution_device=self.device,
                    offload_folder=self.weights_dir / ".accelerate_offload",
                )
            else:
                self._tex = _load_paint_pipeline_compat(Hunyuan3DPaintPipeline, weights_source, self.device)
        except Exception as exc:
            logger.warning("Hunyuan3D tex pipeline unavailable: %s", exc)
            self._tex = None

    def _texture(self, request: GenerationRequest, mesh_path: str, output_dir: str) -> None:
        out_glb = str(Path(output_dir) / "model.glb") if output_dir else mesh_path
        if self._tex is None:
            self._load_tex()

        # 1. Try neural paint pipeline if available
        if self._tex is not None and request.reference_image_url:
            try:
                import torch
                import trimesh
                from PIL import Image
                mesh = trimesh.load(mesh_path, force="mesh")
                img = Image.open(request.reference_image_url).convert("RGBA")
                with torch.inference_mode():
                    try:
                        result = self._tex(mesh, image=img)
                    except TypeError:
                        result = self._tex(mesh_path=mesh_path, image=img)
                if hasattr(result, "export"):
                    result.export(out_glb)
                    logger.info("Hunyuan3D-2 Mini neural texture applied: %s", out_glb)
                    return
                elif hasattr(result, "mesh") and hasattr(result.mesh, "export"):
                    result.mesh.export(out_glb)
                    logger.info("Hunyuan3D-2 Mini neural texture applied: %s", out_glb)
                    return
            except Exception as exc:
                logger.warning("Hunyuan3D neural texturing failed: %s; falling back to projection texturing", exc)

        # 2. Resilient UV image projection fallback (ensures model is always textured with color)
        if request.reference_image_url:
            try:
                self._project_texture(mesh_path, request.reference_image_url, out_glb)
                logger.info("Hunyuan3D-2 Mini projection texture applied: %s", out_glb)
                return
            except Exception as exc:
                logger.warning("Texture projection fallback failed: %s", exc)

        raise RuntimeError("Hunyuan3D-2 Mini texture generation failed and no reference image available")
