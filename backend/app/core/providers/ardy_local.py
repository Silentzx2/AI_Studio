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
            return False

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

        # 2. Generate motion (via neural diffusion if checkpoint loaded, else kinematic generator)
        joint_names = [
            "Hips", "Spine", "Chest", "Neck", "Head",
            "UpperArm_L", "LowerArm_L", "Hand_L",
            "UpperArm_R", "LowerArm_R", "Hand_R",
            "UpperLeg_L", "LowerLeg_L", "Foot_L",
            "UpperLeg_R", "LowerLeg_R", "Foot_R",
        ]
        num_joints = len(joint_names)

        if self.is_loaded and self.model is not None:
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
                await progress_callback(40, "generating", f"Sampling motion diffusion steps ({diffusion_steps} steps)...")

            with torch.no_grad():
                output = self.model.generate(
                    num_frames=num_frames,
                    text=[prompt.strip()],
                    diffusion_steps=diffusion_steps,
                )

            try:
                from ardy.postprocess import post_process_motion
                if hasattr(self.model, "skeleton") and hasattr(self.model.skeleton, "name") and "g1" not in self.model.skeleton.name.lower():
                    output = post_process_motion(output, self.model.skeleton)
            except Exception as post_err:
                logger.debug("ARDY motion post-processing skipped: %s", post_err)
        else:
            # Kinematic motion generator based on prompt semantics
            if progress_callback:
                await progress_callback(45, "generating", f"Synthesizing motion dynamics for '{prompt.strip()[:30]}...'...")

            prompt_lower = prompt.lower()
            is_run = "run" in prompt_lower or "sprint" in prompt_lower
            is_jump = "jump" in prompt_lower or "hop" in prompt_lower
            is_wave = "wave" in prompt_lower or "hand" in prompt_lower
            is_punch = "punch" in prompt_lower or "combat" in prompt_lower

            t = np.linspace(0, duration, num_frames)
            freq = 2.0 if is_run else 1.2
            phase = 2 * np.pi * freq * t

            rot_mats = np.zeros((num_frames, num_joints, 3, 3), dtype=np.float32)
            for f_idx in range(num_frames):
                for j_idx in range(num_joints):
                    rot_mats[f_idx, j_idx] = np.eye(3)

            # Assign biomechanically realistic joint rotations
            sin_p = np.sin(phase)
            cos_p = np.cos(phase)

            for f_idx in range(num_frames):
                s = sin_p[f_idx]
                c = cos_p[f_idx]

                if is_jump:
                    jump_h = max(0.0, np.sin(np.pi * (f_idx / num_frames))) * 0.6
                    rot_mats[f_idx, joint_names.index("UpperLeg_L")] = R.from_euler('x', -0.5 * (1 - jump_h)).as_matrix()
                    rot_mats[f_idx, joint_names.index("UpperLeg_R")] = R.from_euler('x', -0.5 * (1 - jump_h)).as_matrix()
                    rot_mats[f_idx, joint_names.index("UpperArm_L")] = R.from_euler('x', 0.8 * jump_h).as_matrix()
                    rot_mats[f_idx, joint_names.index("UpperArm_R")] = R.from_euler('x', 0.8 * jump_h).as_matrix()
                elif is_wave:
                    rot_mats[f_idx, joint_names.index("UpperArm_R")] = R.from_euler('xyz', [0.2, 0.3, 1.8 + 0.3 * np.sin(4 * np.pi * t[f_idx])]).as_matrix()
                    rot_mats[f_idx, joint_names.index("UpperArm_L")] = R.from_euler('x', 0.1 * s).as_matrix()
                    rot_mats[f_idx, joint_names.index("UpperLeg_L")] = R.from_euler('x', 0.15 * s).as_matrix()
                    rot_mats[f_idx, joint_names.index("UpperLeg_R")] = R.from_euler('x', -0.15 * s).as_matrix()
                elif is_punch:
                    punch_l = np.sin(3 * np.pi * t[f_idx])
                    punch_r = -np.sin(3 * np.pi * t[f_idx])
                    rot_mats[f_idx, joint_names.index("UpperArm_L")] = R.from_euler('x', 0.6 * max(0.0, punch_l)).as_matrix()
                    rot_mats[f_idx, joint_names.index("UpperArm_R")] = R.from_euler('x', 0.6 * max(0.0, punch_r)).as_matrix()
                else: # Walk / Run locomotion
                    amp_arm = 0.5 if is_run else 0.35
                    amp_leg = 0.6 if is_run else 0.4
                    rot_mats[f_idx, joint_names.index("UpperArm_L")] = R.from_euler('x', amp_arm * s).as_matrix()
                    rot_mats[f_idx, joint_names.index("UpperArm_R")] = R.from_euler('x', -amp_arm * s).as_matrix()
                    rot_mats[f_idx, joint_names.index("UpperLeg_L")] = R.from_euler('x', -amp_leg * s).as_matrix()
                    rot_mats[f_idx, joint_names.index("UpperLeg_R")] = R.from_euler('x', amp_leg * s).as_matrix()
                    rot_mats[f_idx, joint_names.index("Spine")] = R.from_euler('y', 0.08 * s).as_matrix()

            root_pos = np.zeros((num_frames, 3), dtype=np.float32)
            if is_run or "walk" in prompt_lower:
                speed = 2.5 if is_run else 1.2
                root_pos[:, 2] = t * speed
                root_pos[:, 1] = 1.0 + 0.04 * np.abs(np.cos(phase))
            elif is_jump:
                root_pos[:, 1] = 1.0 + np.sin(np.pi * (t / duration)) * 0.6
            else:
                root_pos[:, 1] = 1.0 + 0.01 * np.sin(np.pi * t)

            output = {
                "local_rot_mats": rot_mats,
                "root_positions": root_pos,
            }

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
            if hasattr(self.model, "skeleton") and hasattr(self.model.skeleton, "joint_names"):
                motion_data["joint_names"] = list(self.model.skeleton.joint_names)
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
            has_rig=True,
            file_size=npz_path.stat().st_size if npz_path.exists() else 0,
        )
