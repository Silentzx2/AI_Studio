"""ARDY provider — humanoid motion & animation generation from text prompts."""
from __future__ import annotations

import asyncio
import logging
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

from app.core.providers.base import BaseProvider, ProviderResult, _add_model_env
from app.core.managers.vram_tracker import vram_tracker
from runtime.storage import get_storage_config

logger = logging.getLogger(__name__)

ARDY_REPO = get_storage_config().get_repo_path("Ardy")


class ArdyLocalProvider(BaseProvider):
    """Local provider implementing NVIDIA ARDY humanoid motion generation.
    
    Reuses upstream ARDY autoregressive diffusion model, LLM2Vec text encoding,
    and official skeleton representation (.npz).
    """

    @property
    def name(self) -> str:
        return "ardy"

    def __init__(self, device: str = "cuda:0", low_vram: bool = False, **kwargs) -> None:
        self.device = device
        self.is_loaded = False
        self.model: Any = None
        self.checkpoints_dir: Path | None = None
        self.model_name: str = "core"

    async def health_check(self) -> bool:
        return self.is_loaded and self.model is not None

    async def load(self, vram_mode: str = "auto") -> bool:
        """Load ARDY motion model and text encoder."""
        if self.is_loaded and self.model is not None:
            return True

        import torch

        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"

        storage = get_storage_config()
        repo_path = storage.get_repo_path("Ardy")
        if repo_path.exists():
            _add_model_env(repo_path)
            if str(repo_path) not in sys.path:
                sys.path.insert(0, str(repo_path))

        weights = storage.get_weight_path("ardy") or storage.get_weight_path("nvidia/ARDY-Core-RP-20FPS-Horizon40")
        if weights and Path(weights).exists():
            self.checkpoints_dir = Path(weights).parent
        else:
            self.checkpoints_dir = None

        # VRAM tracking: 12 GB normal, 8 GB low (via API or fp16 text encoder)
        vram_needed = 8.0 if vram_mode == "low" else 12.0
        success = vram_tracker.allocate("ardy", vram_needed, reason="ardy_model_load")
        if not success:
            logger.warning("VRAM allocation failed for ARDY (%s GB needed)", vram_needed)
            return False

        try:
            from ardy.model import load_model, DEFAULT_MODEL
            from ardy.model.registry import resolve_model_name

            resolved = resolve_model_name(
                self.model_name or DEFAULT_MODEL,
                checkpoints_dir=str(self.checkpoints_dir) if self.checkpoints_dir else None,
            )
            logger.info("Loading ARDY model '%s' on %s...", resolved, self.device)

            self.model = load_model(
                resolved,
                device=self.device,
                checkpoints_dir=str(self.checkpoints_dir) if self.checkpoints_dir else None,
            )
            self.is_loaded = True
            logger.info("ARDY model loaded successfully.")
            return True
        except Exception as exc:
            logger.exception("Failed to load ARDY model: %s", exc)
            vram_tracker.release("ardy")
            self.model = None
            self.is_loaded = False
            raise RuntimeError(f"ARDY model failed to load: {exc}") from exc

    def unload(self) -> None:
        """Unload ARDY model and free VRAM."""
        if self.model is not None:
            del self.model
            self.model = None
        self.is_loaded = False
        vram_tracker.release("ardy")
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        logger.info("ARDY model unloaded")

    async def generate(
        self,
        request: Any,
        output_dir: str | Path,
        progress_callback: Any = None,
    ) -> ProviderResult:
        """Generate humanoid motion data from a text prompt with ARDY."""
        # Reject 3D mesh requests (ARDY generates skeleton motion .npz, not 3D meshes)
        prompt = getattr(request, "prompt", "")
        if not prompt or not prompt.strip():
            raise ValueError("ARDY requires a text prompt describing the motion to generate.")

        if getattr(request, "mode", None) in ("mesh-generation", "texture-generation", "remesh"):
            raise ValueError(
                "ARDY is a humanoid motion generation system (text-to-motion), not a 3D mesh generator. "
                "Use it in the 'animation' workspace or with mode='animation'."
            )

        if not self.is_loaded or self.model is None:
            await self.load(vram_mode=getattr(request, "vram_mode", "auto"))

        import torch
        from scipy.spatial.transform import Rotation as R

        out_dir = Path(output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        npz_path = out_dir / "motion.npz"

        # 1. Parse duration & frame count
        duration = float(getattr(request, "duration", 2.5) or 2.5)
        fps = float(getattr(getattr(self.model, "motion_rep", None), "fps", 24.0))
        num_frames = max(12, int(duration * fps))

        if progress_callback:
            await progress_callback(15, "preparing", f"Preparing ARDY motion synthesis ({duration:.1f}s at {fps:.0f} fps)...")

        # 2. Generate motion with the loaded upstream model only.
        if not self.is_loaded or self.model is None:
            raise RuntimeError("ARDY model is unavailable; refusing to fabricate synthetic motion output.")

        skeleton = getattr(self.model, "skeleton", None)
        joint_names = list(getattr(skeleton, "joint_names", None) or getattr(self.model, "joint_names", None) or [])
        skeleton_id = str(getattr(skeleton, "name", None) or getattr(self.model, "skeleton_id", None) or "ardy-unknown")
        if not joint_names:
            raise RuntimeError("ARDY loaded without authoritative joint_names; refusing to emit an untyped motion artifact.")

        num_joints = len(joint_names)
        num_base_steps = int(getattr(self.model.diffusion, "num_base_steps", 20))
        req_steps = getattr(request, "num_inference_steps", None)
        diffusion_steps = req_steps if req_steps and 1 <= req_steps <= num_base_steps else num_base_steps

        seed = getattr(request, "seed", None)
        if seed is not None:
            try:
                from ardy.tools import seed_everything
                seed_everything(seed)
            except Exception:
                pass

        if progress_callback:
            await progress_callback(40, "generating", f"Sampling ARDY motion diffusion steps ({diffusion_steps} steps)...")

        with torch.no_grad():
            output = self.model.generate(
                num_frames=num_frames,
                text=[prompt.strip()],
                diffusion_steps=diffusion_steps,
            )

        try:
            from ardy.postprocess import post_process_motion
            if skeleton is not None and "g1" not in skeleton_id.lower():
                output = post_process_motion(output, skeleton)
        except Exception as post_err:
            logger.debug("ARDY motion post-processing skipped: %s", post_err)

        # 5. Save output .npz
        if progress_callback:
            await progress_callback(95, "saving", "Saving motion animation artifact (.npz)...")

        arrays: dict[str, Any] = {}
        for k, v in output.items():
            if hasattr(v, "cpu"):
                arr = v.cpu().numpy()
            else:
                arr = np.asarray(v)
            # Take single sample if batched
            if arr.ndim > 0 and arr.shape[0] == 1:
                arr = arr[0]
            arrays[k] = arr

        arrays["fps"] = np.asarray(fps)
        arrays["text"] = np.asarray(prompt.strip())
        arrays["duration"] = np.asarray(duration)

        np.savez(str(npz_path), **arrays)

        # Also export lightweight motion.json for direct Three.js AnimationClip playback
        json_path = out_dir / "motion.json"
        try:
            import json
            motion_data: dict[str, Any] = {
                "fps": float(fps),
                "duration": float(duration),
                "num_frames": int(num_frames),
                "prompt": prompt.strip(),
            }
            if "local_rot_mats" in arrays:
                from scipy.spatial.transform import Rotation as R
                rot_mats = arrays["local_rot_mats"]
                if rot_mats.ndim == 4:
                    f_cnt, j_cnt = rot_mats.shape[0], rot_mats.shape[1]
                    quats = R.from_matrix(rot_mats.reshape(-1, 3, 3)).as_quat().reshape(f_cnt, j_cnt, 4)
                    motion_data["quaternions"] = quats.tolist()
            if "root_positions" in arrays:
                motion_data["root_positions"] = arrays["root_positions"].tolist()
            motion_data["joint_names"] = joint_names
            motion_data["skeleton_id"] = skeleton_id
            with open(json_path, "w", encoding="utf-8") as jf:
                json.dump(motion_data, jf)
        except Exception as j_err:
            logger.debug("motion.json export skipped: %s", j_err)

        if progress_callback:
            await progress_callback(100, "completed", "ARDY motion generation complete.")

        return ProviderResult(
            model_path=str(npz_path),
            polygon_count=0,
            vertex_count=0,
            has_rig=False,
            file_size=npz_path.stat().st_size if npz_path.exists() else 0,
            metadata={
                "artifact_type": "motion",
                "motion_json": str(json_path) if json_path.exists() else None,
                "fps": float(fps),
                "duration": float(duration),
                "frame_count": int(num_frames),
                "joint_names": joint_names,
                "skeleton_id": skeleton_id,
                "synthetic": False,
            },
        )
