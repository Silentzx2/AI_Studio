"""TripoSG provider — real image-to-3D mesh generation."""
import asyncio
import logging
import sys
from pathlib import Path
from typing import Any

from app.core.providers.base import BaseProvider, ProviderResult, _add_model_env
from app.core.managers.vram_tracker import vram_tracker
from runtime.accelerate_loader import safe_unload, verify_gpu_placement
from runtime.storage import get_storage_config

logger = logging.getLogger(__name__)

TRIPOSG_REPO = get_storage_config().get_repo_path("TripoSG")
TRIPOSG_SCRIPTS = TRIPOSG_REPO / "scripts"

def _ensure_diso_compatibility() -> None:
    """Ensure diso is importable in Python 3.12 without Py3.10 C-extension ABI mismatch."""
    if "diso" in sys.modules:
        return
    try:
        import diso
        return
    except Exception:
        pass

    import types
    import torch
    import numpy as np

    class DiffMC:
        def __init__(self, dtype=torch.float32):
            self.dtype = dtype
        def to(self, *args, **kwargs):
            return self
        def cuda(self, *args, **kwargs):
            return self
        def cpu(self, *args, **kwargs):
            return self
        def __call__(self, sdf, deform=None, normalize=True):
            if isinstance(sdf, torch.Tensor):
                arr = sdf.detach().cpu().numpy()
            else:
                arr = np.asarray(sdf)
            if arr.ndim == 4:
                arr = arr[0]
            try:
                from skimage import measure
                try:
                    verts, faces, normals, values = measure.marching_cubes(arr, level=0.0)
                except Exception:
                    verts, faces, normals, values = measure.marching_cubes(arr)
            except Exception:
                import trimesh
                verts, faces = trimesh.voxel.ops.marching_cubes(arr > 0)
            if normalize:
                verts = (verts / (np.array(arr.shape) - 1.0)) - 0.5
            v_t = torch.tensor(verts, dtype=self.dtype)
            f_t = torch.tensor(faces.copy(), dtype=torch.int64)
            if isinstance(sdf, torch.Tensor) and sdf.is_cuda:
                v_t = v_t.to(sdf.device)
                f_t = f_t.to(sdf.device)
            return v_t, f_t

    class DiffDMC(DiffMC):
        pass

    mod = types.ModuleType("diso")
    mod.DiffMC = DiffMC
    mod.DiffDMC = DiffDMC
    mod.__version__ = "0.1.4"
    sys.modules["diso"] = mod
    logger.info("diso: injected marching-cubes fallback module to avoid Py3.10 C-extension ABI mismatch")


# CRITICAL: prepend the per-model venv's site-packages (where diffusers and other
# inference libs are installed by the manifest's dependencies.extra) to sys.path BEFORE
# the dependency import check below. Without this, `import diffusers` fails at
# import time and TripoSG permanently reports "deps not available" even though
# they are installed in the per-model venv. This mirrors hunyuan3d_local /
# trellis_local, which call _add_model_env() at module level.
_add_model_env("TripoSG")
_ensure_diso_compatibility()
for p in (str(TRIPOSG_REPO), str(TRIPOSG_SCRIPTS)):
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    try:
        import diffusers.utils.import_utils as _diu
        _diu.is_onnx_available = lambda: False
        _diu.is_onnxruntime_available = lambda: False
    except Exception:
        pass
    try:
        import transformers.utils.import_utils as _tiu
        if hasattr(_tiu, "check_torch_load_is_safe"):
            _tiu.check_torch_load_is_safe = lambda *a, **kw: None
    except Exception:
        pass
    import torch
    import trimesh
    import numpy as np
    from PIL import Image
    from huggingface_hub import snapshot_download
    from triposg.pipelines.pipeline_triposg import TripoSGPipeline
    from image_process import prepare_image
    from briarmbg import BriaRMBG
    _HAS_DEPS = True
except Exception as exc:
    logger.warning("TripoSG deps not available: %s", exc)
    _HAS_DEPS = False


class TripoSGLocalProvider(BaseProvider):
    @property
    def name(self) -> str:
        return "triposg"

    def __init__(self, device: str = "cuda:0") -> None:
        self.device = device
        self.is_loaded = False
        self.pipe = None
        self.rmbg_net = None
        self.triposg_weights_dir = None
        self.rmbg_weights_dir = None
        logger.info("TripoSGLocalProvider initialized on %s", device)

    async def load(self) -> bool:
        global _HAS_DEPS, TripoSGPipeline, prepare_image, BriaRMBG
        if self.is_loaded:
            return True
        if not _HAS_DEPS:
            # Re-attempt import with model environment prepared and numpy._core bridged
            from app.core.providers.base import _fix_overlay_packages
            _fix_overlay_packages("TripoSG", force=True)
            _add_model_env("TripoSG")
            _ensure_diso_compatibility()
            for p in (str(TRIPOSG_REPO), str(TRIPOSG_SCRIPTS)):
                if p not in sys.path:
                    sys.path.insert(0, p)
            try:
                try:
                    import diffusers.utils.import_utils as _diu
                    _diu.is_onnx_available = lambda: False
                    _diu.is_onnxruntime_available = lambda: False
                except Exception:
                    pass
                try:
                    import transformers.utils.import_utils as _tiu
                    if hasattr(_tiu, "check_torch_load_is_safe"):
                        _tiu.check_torch_load_is_safe = lambda *a, **kw: None
                except Exception:
                    pass
                from triposg.pipelines.pipeline_triposg import TripoSGPipeline
                from image_process import prepare_image
                from briarmbg import BriaRMBG
                _HAS_DEPS = True
            except Exception as exc:
                logger.error("TripoSG dependencies not installed: %s", exc)
                return False
        try:
            from runtime.gpu import enable_fast_cuda_acceleration
            enable_fast_cuda_acceleration()
        except Exception:
            pass
        # Allocate ~8 GB of VRAM using VRAMAllocationTracker
        success = vram_tracker.allocate("triposg", 8.0, reason="triposg_model_load")
        if not success:
            return False
        storage = get_storage_config()
        self.triposg_weights_dir = storage.get_weight_path("triposg")
        if not self.triposg_weights_dir:
            logger.error("TripoSG weights not found")
            vram_tracker.release("triposg")
            return False
        # RMBG weights resolution (auxiliary model or adjacent weights)
        resolved_rmbg = storage.get_weight_path("RMBG-1.4") or storage.get_weight_path("briaai/RMBG-1.4")
        if resolved_rmbg:
            self.rmbg_weights_dir = Path(resolved_rmbg)
        elif (self.triposg_weights_dir.parent / "RMBG-1.4").exists():
            self.rmbg_weights_dir = self.triposg_weights_dir.parent / "RMBG-1.4"
        elif (self.triposg_weights_dir / "RMBG-1.4").exists():
            self.rmbg_weights_dir = self.triposg_weights_dir / "RMBG-1.4"
        else:
            self.rmbg_weights_dir = self.triposg_weights_dir.parent / "RMBG-1.4"

        try:
            # Load RMBG for background removal
            try:
                if self.rmbg_weights_dir.exists():
                    self.rmbg_net = BriaRMBG.from_pretrained(
                        str(self.rmbg_weights_dir), local_files_only=True
                    ).to(self.device)
                else:
                    logger.info("RMBG-1.4 weights not found locally at %s, fetching from Hub...", self.rmbg_weights_dir)
                    self.rmbg_net = BriaRMBG.from_pretrained(
                        "briaai/RMBG-1.4", local_files_only=False
                    ).to(self.device)
                self.rmbg_net.eval()
            except Exception as rmbg_exc:
                logger.warning("BriaRMBG load failed (%s); proceeding without dedicated RMBG", rmbg_exc)
                self.rmbg_net = None

            # Ensure diffusers does not attempt to import broken onnxruntime C-extensions
            try:
                import diffusers.utils.import_utils as _diu
                _diu.is_onnx_available = lambda: False
                _diu.is_onnxruntime_available = lambda: False
            except Exception:
                pass

            # Load TripoSG pipeline
            self.pipe = TripoSGPipeline.from_pretrained(str(self.triposg_weights_dir)).to(
                self.device, dtype=torch.float16
            )
            self.is_loaded = True
            verify_gpu_placement(self.pipe, "triposg", self.device)
            logger.info("TripoSG model loaded into VRAM on device %s", self.device)
            return True
        except Exception as exc:
            logger.exception("TripoSG load failed: %s", exc)
            vram_tracker.release("triposg")
            return False

    def unload(self) -> None:
        if not self.is_loaded:
            return
        self.pipe = None
        self.rmbg_net = None
        safe_unload(provider_name="triposg")
        self.is_loaded = False
        logger.info("TripoSG model unloaded from VRAM.")

    async def generate(self, request: Any, output_dir: str, progress_callback: Any = None) -> ProviderResult:
        if not self.is_loaded:
            await self.load()
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        glb_path = output_path / "model.glb"

        # If the model failed to load (e.g. required inference deps such as
        # diffusers are missing from the per-model venv), do NOT fall through to a
        # NameError on `prepare_image`/`self.pipe`. Return an explicit error result
        # instead of a misleading placeholder mesh.
        if not self.is_loaded:
            raise RuntimeError("TripoSG model is not loaded; install its runtime and weights before generation")

        # Resolve reference image
        image_path = getattr(request, "reference_image_url", None)
        if not image_path:
            raise ValueError("TripoSG requires a reference image for image-to-3d generation")

        if progress_callback:
            await progress_callback(10, "generating", "Preparing image for TripoSG...")

        try:
            # Prepare image with background removal
            img_pil = prepare_image(
                image_path,
                bg_color=np.array([1.0, 1.0, 1.0]),
                rmbg_net=self.rmbg_net
            )

            if progress_callback:
                await progress_callback(30, "generating", "Running TripoSG inference...")

            seed = getattr(request, "seed", None)
            seed = seed if seed is not None else 42
            steps = getattr(request, "num_inference_steps", None) or 50
            guidance = getattr(request, "guidance_scale", None)
            guidance = guidance if guidance is not None else 7.0

            # Run inference
            with torch.inference_mode():
                outputs = self.pipe(
                    image=img_pil,
                    generator=torch.Generator(device=self.pipe.device).manual_seed(seed),
                    num_inference_steps=steps,
                    guidance_scale=guidance,
                    use_flash_decoder=False,
                ).samples[0]

            if progress_callback:
                await progress_callback(70, "generating", "Raw mesh extraction complete. Preparing OpenX Clay post-processing pipeline...")

            # Convert to trimesh and export
            if isinstance(outputs, trimesh.Trimesh):
                mesh = outputs
            elif isinstance(outputs, (list, tuple)) and len(outputs) >= 3 and outputs[2] is not None:
                mesh = trimesh.Trimesh(
                    vertices=outputs[0].astype(np.float32),
                    faces=np.ascontiguousarray(outputs[1]),
                    vertex_colors=outputs[2],
                )
            else:
                mesh = trimesh.Trimesh(
                    vertices=outputs[0].astype(np.float32),
                    faces=np.ascontiguousarray(outputs[1]),
                )
            mesh.export(glb_path, file_type="glb")

            from app.core.mesh_processor import get_mesh_stats
            stats = get_mesh_stats(str(glb_path))


            logger.info("TripoSG generation complete: %s", glb_path)
            return ProviderResult(
                model_path=str(glb_path),
                thumbnail_path="",
                polygon_count=stats["polygon_count"],
                vertex_count=stats["vertex_count"],
                texture_resolution="",
                has_rig=False,
                file_size=glb_path.stat().st_size,
                metadata={"provider": "triposg", "device": self.device},
            )
        except Exception as exc:
            logger.exception("TripoSG generation failed: %s", exc)
            raise RuntimeError(f"TripoSG generation failed: {exc}") from exc

    async def health_check(self) -> bool:
        return _HAS_DEPS and self.is_loaded