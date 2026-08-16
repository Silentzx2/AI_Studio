"""
Auto-installer: clones repos, installs deps, downloads weights, verifies environment.

Exposes both:
  - Module-level functions (primary API used by admin/runtime endpoints)
  - RuntimeInstaller class (OOP wrapper for scripts that prefer it)
"""
from __future__ import annotations

import json
import logging
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from runtime.storage import get_storage_config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration tables
# ---------------------------------------------------------------------------

REPOS = {
    "Hunyuan3D-2": {
        "url": "https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git",
        "branch": "main",
        "requirements": "requirements.txt",
        "category": "3d_generation",
        "providers": ["hunyuan3d-2", "hunyuan3d-2.1"],
    },
    "TRELLIS": {
        "url": "https://github.com/microsoft/TRELLIS.git",
        "branch": "main",
        "requirements": None,
        "category": "3d_generation",
        "providers": ["trellis"],
    },
    "AniGen": {
        "url": "https://github.com/VAST-AI-Research/AniGen.git",
        "branch": "main",
        "requirements": "requirements.txt",
        "category": "rigging",
        "providers": ["anigen"],
    },
    "UniRig": {
        "url": "https://github.com/VAST-AI-Research/UniRig.git",
        "branch": "main",
        "requirements": "requirements.txt",
        "category": "rigging",
        "providers": ["unirig"],
    },
    "DetailGen3D": {
        "url": "https://github.com/VAST-AI-Research/DetailGen3D.git",
        "branch": "main",
        "requirements": "requirements.txt",
        "category": "post_processing",
        "providers": ["detailgen3d"],
    },
    "TripoSG": {
        "url": "https://github.com/VAST-AI-Research/TripoSG.git",
        "branch": "main",
        "requirements": "requirements.txt",
        "category": "3d_generation",
        "providers": ["triposg"],
    },
}

HF_MODELS = {
    "hunyuan3d-2.1": {"repo": "tencent/Hunyuan3D-2.1",         "size_estimate_gb": 14},
    "hunyuan3d-2":   {"repo": "tencent/Hunyuan3D-2",           "size_estimate_gb": 24},
    # ponytail: tencent/Hunyuan3D-2mini hosts THREE dit variants + three VAEs
    # (~25 GB total). The mini provider only needs the standard image-to-shape
    # dit (its safetensors already bundles the VAE + conditioner), so download
    # just that subfolder — else a one-click install would fetch 25 GB. The
    # .fp16.ckpt is a duplicate of the safetensors (hy3dgen uses safetensors by
    # default) and is skipped to halve the transfer.
    "hunyuan3d-2-mini": {
        "repo": "tencent/Hunyuan3D-2mini",
        "size_estimate_gb": 4,
        "allow_patterns": ["hunyuan3d-dit-v2-mini/*"],
        "ignore_patterns": ["*.ckpt"],
    },
    "trellis":       {"repo": "microsoft/TRELLIS-image-large", "size_estimate_gb": 3},
    "anigen":        {"repo": "VAST-AI/AniGen_Weights",        "size_estimate_gb": 23},
    "unirig":        {"repo": "VAST-AI/UniRig",                "size_estimate_gb": 2},
    "detailgen3d":   {"repo": "VAST-AI/DetailGen3D",         "size_estimate_gb": 2},
    "triposg":       {"repo": "VAST-AI/TripoSG",             "size_estimate_gb": 2},
}

PROVIDER_ALIASES = {
    "hunyuan3d-1.0": "hunyuan3d-2.1",
    "hunyuan3d": "hunyuan3d-2.1",
}


def _canonical_provider_name(name: str) -> str:
    return PROVIDER_ALIASES.get(name, name)


# ponytail: single source of truth for model capability + VRAM metadata.
# Rules for editing:
#   * `vram_required_mb` = verified NORMAL (full-texture) run requirement.
#   * `low_vram_supported`/`low_vram_required_mb` = LOW VRAM mode is a VERIFIED
#     feature of the code in this repo (engine + provider + accelerate loader).
#     Do not fake capabilities — locked off unless verified, declare honestly.
#   * `native_build_required` = install compiles a CUDA/native extension that
#     takes 15-60 min. Such models are excluded from default/one-click installs.
#   * `low_vram_strategy` = ordered hints for accelerate_loader, in priority
#     order; the loader picks the strongest one available at runtime.
PROVIDER_METADATA = {
    "hunyuan3d-2.1": {
        "label": "Hunyuan3D 2.1",
        "category": "3d_generation",
        "supports_text_to_3d": True,
        "supports_image_to_3d": True,
        "supports_texture": True,
        "vram_required_mb": 16000,
        "low_vram_supported": True,
        "low_vram_required_mb": 8192,
        "low_vram_strategy": ["cpu_offload", "attention_slicing", "vae_cpu_offload"],
        "native_build_required": False,
        "install_method": "uv_requirements",
        "capabilities": {
            "supports_text_to_3d": True,
            "supports_image_to_3d": True,
            "supports_texture_generation": True,
            "supports_texture_baking": False,
            "supports_pbr": True,
            "supports_uv": True,
            "supports_glb": True,
            "supports_obj": True,
            "supports_fbx": True,
            "supports_usdz": False,
            "supports_gaussian": False,
            "supports_mesh": True,
            "supports_rigging": False,
            "supports_part_separation": False,
            "supports_detail_enhancement": False,
            "supports_cpu_offload": True,
            "supports_quantization": False,
        },
        "repo": "Hunyuan3D-2",
        "weight_key": "hunyuan3d-2.1",
        "workspace_compatibility": ["mesh-generation", "texture-generation", "post-processing"],
    },
    "hunyuan3d-2": {
        "label": "Hunyuan3D 2",
        "category": "3d_generation",
        "supports_text_to_3d": True,
        "supports_image_to_3d": True,
        "supports_texture": True,
        "vram_required_mb": 12000,
        "low_vram_supported": True,
        "low_vram_required_mb": 6144,
        "low_vram_strategy": ["cpu_offload", "sequential_offload", "attention_slicing", "vae_cpu_offload"],
        "native_build_required": False,
        "install_method": "uv_requirements",
        "capabilities": {
            "supports_text_to_3d": True,
            "supports_image_to_3d": True,
            "supports_texture_generation": True,
            "supports_texture_baking": False,
            "supports_pbr": True,
            "supports_uv": True,
            "supports_glb": True,
            "supports_obj": True,
            "supports_fbx": True,
            "supports_usdz": False,
            "supports_gaussian": False,
            "supports_mesh": True,
            "supports_rigging": False,
            "supports_part_separation": False,
            "supports_detail_enhancement": False,
            "supports_cpu_offload": True,
            "supports_quantization": False,
        },
        "repo": "Hunyuan3D-2",
        "weight_key": "hunyuan3d-2",
        "workspace_compatibility": ["mesh-generation", "texture-generation", "post-processing"],
    },
    "hunyuan3d-2-mini": {
        "label": "Hunyuan3D-2 Mini",
        "category": "3d_generation",
        # ponytail: Hunyuan3D-2 Mini is an IMAGE-TO-SHAPE-ONLY 0.6B model — its
        # pipeline __call__ accepts no prompt. Do NOT advertise text-to-3d.
        "supports_text_to_3d": False,
        "supports_image_to_3d": True,
        # Texture: the mini shape model has no paint weights of its own; upstream
        # reuses the Hunyuan3D-2 (2.0) paint pipeline. The provider loads it from
        # the sibling hunyuan3d-2 weights when present and logs+skips otherwise.
        "supports_texture": True,
        # ponytail: official docs state 6 GB VRAM for Hunyuan3D-2 shape
        # generation (modelzoo.md); the mini's 0.6B generator is strictly
        # smaller, so 6 GB is a conservative ceiling — not a made-up number.
        "vram_required_mb": 6144,
        # ponytail: same verified low-VRAM machinery as hunyuan3d-2/2.1 (same
        # pipeline class + _HunyuanBase loader), so low mode is genuinely wired.
        # 4096 MB is an ESTIMATE for the fp16 mini + shared VAE under
        # cpu_offload — not yet GPU-verified; treat as provisional.
        "low_vram_supported": True,
        "low_vram_required_mb": 4096,
        "low_vram_strategy": ["cpu_offload", "attention_slicing", "vae_cpu_offload"],
        "native_build_required": False,
        "install_method": "uv_requirements",
        "capabilities": {
            "supports_text_to_3d": False,
            "supports_image_to_3d": True,
            "supports_texture_generation": True,
            "supports_texture_baking": False,
            "supports_pbr": True,
            "supports_uv": True,
            "supports_glb": True,
            "supports_obj": True,
            "supports_fbx": True,
            "supports_usdz": False,
            "supports_gaussian": False,
            "supports_mesh": True,
            "supports_rigging": False,
            "supports_part_separation": False,
            "supports_detail_enhancement": False,
            "supports_cpu_offload": True,
            "supports_quantization": False,
        },
        "repo": "Hunyuan3D-2",
        "weight_key": "hunyuan3d-2-mini",
        "workspace_compatibility": ["mesh-generation"],
    },
    "trellis": {
        "label": "TRELLIS",
        "category": "3d_generation",
        "supports_text_to_3d": False,
        "supports_image_to_3d": True,
        "supports_texture": True,
        "vram_required_mb": 8000,
        # ponytail: TRELLIS has NO verified low-VRAM execution path in this
        # codebase (dispatch is offload-at-best, not a guaranteed small-footprint
        # run), so the mode is locked off rather than faked. Enable only when a
        # TRELLIS low-VRAM path is implemented + verified.
        "low_vram_supported": False,
        "low_vram_required_mb": 0,
        "low_vram_strategy": [],
        # TRELLIS's FlexiCubes submodule is a CUDA extension built at install
        # time — a real native build, so it is excluded from one-click installs.
        "native_build_required": True,
        "install_method": "uv_repo_deps",
        "capabilities": {
            "supports_text_to_3d": False,
            "supports_image_to_3d": True,
            "supports_texture_generation": True,
            "supports_texture_baking": False,
            "supports_pbr": True,
            "supports_uv": True,
            "supports_glb": True,
            "supports_obj": True,
            "supports_fbx": False,
            "supports_usdz": False,
            "supports_gaussian": True,
            "supports_mesh": True,
            "supports_rigging": False,
            "supports_part_separation": False,
            "supports_detail_enhancement": False,
            "supports_cpu_offload": True,
            "supports_quantization": False,
        },
        "repo": "TRELLIS",
        "weight_key": "trellis",
        "workspace_compatibility": ["mesh-generation", "texture-generation"],
    },
    "anigen": {
        "label": "AniGen",
        "category": "rigging",
        "supports_text_to_3d": False,
        "supports_image_to_3d": False,
        "supports_texture": False,
        "vram_required_mb": 6200,
        "low_vram_supported": False,
        "low_vram_required_mb": 0,
        "low_vram_strategy": [],
        "native_build_required": True,
        "install_method": "uv_requirements",
        "capabilities": {
            "supports_text_to_3d": False,
            "supports_image_to_3d": False,
            "supports_texture_generation": False,
            "supports_texture_baking": False,
            "supports_pbr": False,
            "supports_uv": False,
            "supports_glb": True,
            "supports_obj": False,
            "supports_fbx": True,
            "supports_usdz": False,
            "supports_gaussian": False,
            "supports_mesh": True,
            "supports_rigging": True,
            "supports_part_separation": False,
            "supports_detail_enhancement": False,
            "supports_cpu_offload": False,
            "supports_quantization": False,
        },
        "repo": "AniGen",
        "weight_key": None,
        "workspace_compatibility": ["rigging", "animation"],
    },
    "unirig": {
        "label": "UniRig",
        "category": "rigging",
        "supports_text_to_3d": False,
        "supports_image_to_3d": False,
        "supports_texture": False,
        "vram_required_mb": 8000,
        "low_vram_supported": False,
        "low_vram_required_mb": 0,
        "low_vram_strategy": [],
        "native_build_required": True,
        "install_method": "uv_requirements",
        "capabilities": {
            "supports_text_to_3d": False,
            "supports_image_to_3d": False,
            "supports_texture_generation": False,
            "supports_texture_baking": False,
            "supports_pbr": False,
            "supports_uv": False,
            "supports_glb": True,
            "supports_obj": False,
            "supports_fbx": True,
            "supports_usdz": False,
            "supports_gaussian": False,
            "supports_mesh": True,
            "supports_rigging": True,
            "supports_part_separation": False,
            "supports_detail_enhancement": False,
            "supports_cpu_offload": False,
            "supports_quantization": False,
        },
        "repo": "UniRig",
        "weight_key": "unirig",
        "workspace_compatibility": ["rigging", "animation"],
    },
    "detailgen3d": {
        "label": "DetailGen3D",
        "category": "post_processing",
        "supports_text_to_3d": False,
        "supports_image_to_3d": False,
        "supports_texture": False,
        "vram_required_mb": 4000,
        "low_vram_supported": False,
        "low_vram_required_mb": 0,
        "low_vram_strategy": [],
        "native_build_required": False,
        "install_method": "uv_requirements",
        "capabilities": {
            "supports_text_to_3d": False,
            "supports_image_to_3d": False,
            "supports_texture_generation": False,
            "supports_texture_baking": False,
            "supports_pbr": False,
            "supports_uv": False,
            "supports_glb": True,
            "supports_obj": False,
            "supports_fbx": False,
            "supports_usdz": False,
            "supports_gaussian": False,
            "supports_mesh": True,
            "supports_rigging": False,
            "supports_part_separation": False,
            "supports_detail_enhancement": True,
            "supports_cpu_offload": False,
            "supports_quantization": False,
        },
        "repo": "DetailGen3D",
        "weight_key": "detailgen3d",
        "workspace_compatibility": ["post-processing", "remesh"],
    },
    "triposg": {
        "label": "TripoSG",
        "category": "3d_generation",
        "supports_text_to_3d": False,
        "supports_image_to_3d": True,
        "supports_texture": False,
        "vram_required_mb": 8192,
        "low_vram_supported": False,
        "low_vram_required_mb": 0,
        "low_vram_strategy": [],
        "native_build_required": False,
        "install_method": "uv_requirements",
        "capabilities": {
            "supports_text_to_3d": False,
            "supports_image_to_3d": True,
            "supports_texture_generation": False,
            "supports_texture_baking": False,
            "supports_pbr": False,
            "supports_uv": False,
            "supports_glb": True,
            "supports_obj": False,
            "supports_fbx": False,
            "supports_usdz": False,
            "supports_gaussian": False,
            "supports_mesh": True,
            "supports_rigging": False,
            "supports_part_separation": False,
            "supports_detail_enhancement": False,
            "supports_cpu_offload": False,
            "supports_quantization": False,
        },
        "repo": "TripoSG",
        "weight_key": "triposg",
        "workspace_compatibility": ["mesh-generation"],
    },
    "mock": {
        "label": "Mock (Testing)",
        "category": "testing",
        "supports_text_to_3d": True,
        "supports_image_to_3d": True,
        "supports_texture": False,
        "vram_required_mb": 0,
        "low_vram_supported": True,
        "low_vram_required_mb": 0,
        "low_vram_strategy": [],
        "native_build_required": False,
        "install_method": "internal",
        "capabilities": {
            "supports_text_to_3d": True,
            "supports_image_to_3d": True,
            "supports_texture_generation": False,
            "supports_texture_baking": False,
            "supports_pbr": False,
            "supports_uv": True,
            "supports_glb": True,
            "supports_obj": True,
            "supports_fbx": True,
            "supports_usdz": False,
            "supports_gaussian": False,
            "supports_mesh": True,
            "supports_rigging": True,
            "supports_part_separation": False,
            "supports_detail_enhancement": False,
            "supports_cpu_offload": False,
            "supports_quantization": False,
        },
        "repo": None,
        "weight_key": None,
        "workspace_compatibility": ["mesh-generation", "texture-generation", "rigging", "remesh", "post-processing", "animation"],
    },
}

TEXTURE_MODELS = [
    {"id": "hunyuan3d-2.1", "label": "Hunyuan3D 2.1 (recommended)"},
    {"id": "hunyuan3d-2", "label": "Hunyuan3D 2"},
    {"id": "trellis", "label": "TRELLIS"},
]

RIGGING_PROVIDERS = [
    {"id": "auto", "label": "Auto (best available)"},
    {"id": "blender", "label": "Blender"},
    {"id": "none", "label": "No rigging"},
]

RENDER_QUALITIES = [
    {"id": "draft",    "label": "Draft (fast)"},
    {"id": "standard", "label": "Standard"},
    {"id": "high",     "label": "High quality"},
    {"id": "ultra",    "label": "Ultra (slow)"},
]
RESOLUTIONS = [
    {"id": "512",  "label": "512 px"},
    {"id": "1024", "label": "1024 px"},
    {"id": "2048", "label": "2048 px"},
]
OUTPUT_FORMATS = [
    {"id": "glb",  "label": "GLB (recommended)"},
    {"id": "obj",  "label": "OBJ + MTL"},
    {"id": "fbx",  "label": "FBX"},
    {"id": "usdz", "label": "USDZ"},
]


# ---------------------------------------------------------------------------
# State persistence
# ---------------------------------------------------------------------------

def _state_path() -> Path:
    return get_storage_config().runtime_cache_dir / "install_state.json"


def _load_state() -> dict:
    p = _state_path()
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            pass
    return {"repos": {}, "weights": {}, "last_updated": None}


def _save_state(state: dict) -> None:
    p = _state_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(state, indent=2, default=str))


# ---------------------------------------------------------------------------
# Low-level subprocess helper
# ---------------------------------------------------------------------------

def _run(
    cmd: list[str],
    cwd: Path | None = None,
    env: dict | None = None,
    log_cb: Callable | None = None,
) -> tuple[int, str]:
    merged_env = {**os.environ, **(env or {})}
    merged_env.setdefault("UV_LINK_MODE", "copy")
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=str(cwd) if cwd else None,
        env=merged_env,
    )
    lines: list[str] = []
    for line in proc.stdout:  # type: ignore[union-attr]
        line = line.rstrip()
        lines.append(line)
        logger.info("[subprocess] %s", line)
        if log_cb:
            log_cb(line)
    proc.wait()
    return proc.returncode, "\n".join(lines)


# ponytail: Py3.12 dropped `distutils` and several pinned deps publish no
# cp312 wheels. On Py3.12 we rewrite the cloned repo's requirements to
# installable versions so the per-model venv can be created. Real GPU
# deployments run on Py3.11 where the upstream pins are valid, so this table
# is only applied on Py>=3.12. Upgrade path: drop this once repos publish
# cp312-compatible pins or the stack targets Py3.11.
_PY312_REQ_REWRITES: list[tuple[re.Pattern, str | None]] = [
    # numpy 1.22.x builds via distutils (gone in 3.12); keep the already
    # installed numpy 2.x from the per-model venv base.
    (re.compile(r"^numpy==1\.22\..*$"), "numpy>=1.26.4"),
    # open3d 0.18.0 has no cp312 wheel; 0.19.0 is the first with one.
    (re.compile(r"^open3d==0\.18\.0$"), "open3d==0.19.0"),
    # numba 0.53.1 / llvmlite 0.36.0 only support Python <3.10.
    # Bump to py3.12-compatible versions (also pre-installed below when rembg
    # is detected, but uv will downgrade them unless the requirements file
    # itself is rewritten).
    (re.compile(r"^numba==0\.53\.1$"), "numba>=0.60"),
    (re.compile(r"^llvmlite==0\.36\.0$"), "llvmlite>=0.43"),
    # flash-attn / bpy publish no cp312 wheels (CUDA-build / Blender-bound);
    # not installable on a CPU Py3.12 box — drop rather than fail the venv.
    # flash-attn is also in _CUDA_ONLY_PKG_PATTERNS so it gets dropped on
    # CPU-only hosts regardless of Py version; dropped here too because
    # --no-build-isolation-package does not make torch visible to the build
    # backend in the current uv version.
    (re.compile(r"^flash[-_]attn($|==|>=|<=|!=|~=).*$"), None),
    (re.compile(r"^bpy==.*$"), None),
    # torch-cluster and diso are CUDA-only native extensions with no cp312 wheels.
    # DetailGen3D has a PyTorch FPS fallback for torch-cluster and uses
    # skimage.measure.marching_cubes instead of diso. Drop both on Py3.12+
    # to avoid heavy native builds (15-60 min) on Colab and similar hosts.
    (re.compile(r"^torch[-_]cluster($|==|>=|<=|!=|~=).*$"), None),
    (re.compile(r"^diso($|==|>=|<=|!=|~=).*$"), None),
]


def _normalize_requirements_for_py312(requirements_file: Path) -> Path:
    """On Py<3.12 return the original path unchanged.

    On Py>=3.12 rewrite uninstallable pins to cp312-installable versions
    (see _PY312_REQ_REWRITES) into a temp file and return that path. The
    upstream requirements file is left pristine so re-clones stay clean.
    """
    if sys.version_info < (3, 12):
        return requirements_file
    if not requirements_file.exists():
        return requirements_file

    text = requirements_file.read_text(errors="ignore")
    out_lines: list[str] = []
    changed = False
    for raw in text.splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            out_lines.append(raw)
            continue
        line = stripped.split("#", 1)[0].strip()
        dropped = False
        replaced: str | None = None
        for pat, repl in _PY312_REQ_REWRITES:
            if pat.match(line):
                if repl is None:
                    dropped = True
                else:
                    replaced = repl
                changed = True
                break
        if dropped:
            out_lines.append(f"# ponytail: dropped on py3.12 (no cp312 wheel): {line}")
            continue
        if replaced is not None:
            out_lines.append(replaced)
            continue
        out_lines.append(raw)

    if not changed:
        return requirements_file

    tmp = Path(tempfile.gettempdir()) / (requirements_file.stem + ".py312.requirements.txt")
    tmp.write_text("\n".join(out_lines) + "\n")
    logger.info("Py3.12 requirement rewrite -> %s", tmp)
    return tmp


# ponytail: source extensions that compile a CUDA kernel at build time. They
# cannot be built on a host without a CUDA toolkit (no cuda_runtime.h / nvcc),
# and the install must not hard-fail the whole setup on such hosts — the stack
# already warns that inference is unavailable without a GPU. On GPU hosts this
# is a no-op. Upgrade path: narrow the list if a package gains a cp312 wheel
# that installs header-less.
_CUDA_ONLY_PKG_PATTERNS: list[re.Pattern] = [
    re.compile(r"^diso($|==)"),
    re.compile(r"^torch-cluster($|==)"),
    re.compile(r"^torch-scatter($|==)"),
    re.compile(r"^torch-sparse($|==)"),
    re.compile(r"^(git\+)?.*torchmcubes"),
    re.compile(r"^flash[-_]attn($|==)"),
    re.compile(r"^xformers($|==)"),
    re.compile(r"^pytorch3d($|==)"),
]


# ponytail: Section 2 — some repos' requirements.txt omit the actual inference library
# (e.g. Hunyuan3D-2 needs `hy3dgen`, which is published separately). The
# in-process local providers import from the backend process, so these EXTRA_DEPS
# are installed into BOTH the per-model venv and the backend venv (via
# sys.executable) so they resolve regardless of which sys.path the provider uses.
# Extend per repo as other missing inference libs are discovered.
EXTRA_DEPS: dict[str, list[str]] = {
    "Hunyuan3D-2": ["hy3dgen", "accelerate"],
    "TRELLIS": ["accelerate"],
    "TripoSG": ["diffusers==0.21.4", "huggingface_hub>=0.28.0,<1.0.0", "accelerate"],
}


def _cuda_available() -> bool:
    """Best-effort detection of a usable CUDA toolkit on the build host."""
    if os.environ.get("CUDA_HOME") or os.environ.get("CUDA_PATH"):
        return True
    if shutil.which("nvcc"):
        return True
    for cand in ("/usr/local/cuda", "/opt/cuda"):
        if Path(cand).exists():
            return True
    return False


# ponytail: TRELLIS uses setup.sh (conda-based) instead of requirements.txt.
# We replicate the equivalent --basic install via uv inside the per-model venv.
# The repo has no pyproject.toml/setup.py, so the generic _uv_install path
# would skip it entirely.
_TRELLIS_BASIC_DEPS = [
    "pillow", "imageio", "imageio-ffmpeg", "tqdm", "easydict",
    "opencv-python-headless", "scipy", "ninja", "rembg", "onnxruntime",
    "trimesh", "open3d", "xatlas", "pyvista", "pymeshfix", "igraph",
    "transformers",
]
_TRELLIS_GIT_DEPS = [
    "git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8",
]


def _backend_torch_stack() -> tuple[str, list[str]]:
    """Resolve the exact torch/torchvision/torchaudio build used by the backend
    venv so each per-model venv can mirror it.

    ponytail: all in-process providers share ONE torch — the backend's. The
    per-model venv must install the same torch/torchvision/torchaudio versions,
    otherwise torchvision's C++ operator registration (e.g. torchvision::nms)
    fails against the already-loaded backend torch. Earlier code installed
    unpinned torch/torchvision/torchaudio, pulling the latest (2.13/0.28) which
    is ABI-incompatible with the backend's 2.5.1 and crashes TRELLIS load with
    "RuntimeError: operator torchvision::nms does not exist". Upgrade path:
    read the torch wheel URL straight from backend metadata instead of the
    +cuXXX heuristic if a future torch build drops the local version tag.
    """
    try:
        import importlib.metadata as md

        tv = md.version("torch")
        tvv = md.version("torchvision")
        tav = md.version("torchaudio")
    except Exception:
        # Fallback to the documented baseline if torch metadata is unreadable.
        tv, tvv, tav = "2.5.1", "0.20.1", "2.5.1"
    # The +cuXXX / +cpu local version tag selects the matching PyTorch wheel
    # index (e.g. 2.5.1+cu121 -> https://download.pytorch.org/whl/cu121).
    cuda = "cu121"
    if "+" in tv:
        tag = tv.split("+", 1)[1]
        if tag.startswith("cu") or tag == "cpu":
            cuda = tag
    index = f"https://download.pytorch.org/whl/{cuda}"
    # Pin the FULL version including the +cuXXX local tag. The per-model venv may
    # already hold a mismatched build (e.g. 2.13/0.28 from an unpinned install),
    # and `torch==2.5.1` alone is satisfied by any 2.5.1+local already present,
    # so uv would skip the fix. The explicit tag + --reinstall forces the exact
    # backend build.
    specs = [f"torch=={tv}", f"torchvision=={tvv}", f"torchaudio=={tav}"]
    return index, specs


def _install_torch_stack(
    venv_python: Path,
    cwd: Path,
    log_cb: Callable | None = None,
) -> tuple[int, str]:
    """Install the backend-matching torch/torchvision/torchaudio into a per-model
    venv. Mirrors the backend's exact build so in-process inference stays ABI
    compatible with the backend's already-loaded torch.
    """
    uv_path = shutil.which("uv")
    if not uv_path:
        return 1, "uv not found"
    torch_index, torch_specs = _backend_torch_stack()
    # Install the torch stack with the PyTorch index as primary and PyPI as a
    # fallback (the nvidia-* CUDA libs that torch depends on live on PyPI).
    # --index-strategy unsafe-best-match is required so the pinned +cuXXX local
    # tag is found on the PyTorch index even though PyPI also lists torch.
    # --reinstall forces the correct build even if a mismatched version is
    # already present in the per-model venv.
    code, output = _run(
        [uv_path, "pip", "install", "--python", str(venv_python),
         "--index-url", torch_index, "--extra-index-url", "https://pypi.org/simple",
         "--index-strategy", "unsafe-best-match", "--reinstall", *torch_specs],
        cwd=str(cwd),
        log_cb=log_cb,
    )
    if code != 0:
        return code, output
    # Seed setuptools/wheel from PyPI (needed for --no-build-isolation builds;
    # the PyTorch index does not provide them).
    code2, output2 = _run(
        [uv_path, "pip", "install", "--python", str(venv_python), "setuptools", "wheel"],
        cwd=str(cwd),
        log_cb=log_cb,
    )
    if code2 != 0:
        logger.warning("setuptools/wheel install failed: %s", output2[:200])
    return 0, output


def _install_trellis_deps(
    repo_dir: Path,
    venv_python: Path,
    log_cb: Callable | None = None,
) -> dict:
    """Install TRELLIS dependencies into the per-model venv.

    Mirrors setup.sh --basic (core runtime deps + utils3d).
    Optional extensions (xformers, flash-attn, spconv, kaolin, …) are
    omitted here — they require CUDA toolkit builds and are installed
    separately by the generic EXTRA_DEPS / TORCH_BUILD_PKGS paths when
    the host has the necessary toolchain.
    """
    uv_path = shutil.which("uv")
    if not uv_path:
        return {"success": False, "error": "uv not found for TRELLIS"}

    def _run_uv(args, cwd=None, extra_env=None):
        env = dict(os.environ)
        if extra_env:
            env.update(extra_env)
        return _run([uv_path] + args, cwd=cwd, env=env, log_cb=log_cb)

    # Pre-install torch (already done by caller, safe to re-run). Mirror the
    # backend's exact torch/torchvision/torchaudio build so the per-model venv
    # stays ABI compatible with the in-process backend torch.
    code, output = _install_torch_stack(venv_python, repo_dir, log_cb=log_cb)
    if code != 0:
        return {"success": False, "error": f"TRELLIS torch stack install failed: {output[:300]}"}
    # Pre-install numba/llvmlite at py3.12-compatible versions. rembg's
    # dependency chain (pymatting -> numba==0.53.1 -> llvmlite==0.36.0) does
    # not support Python >=3.10, so uv must find the newer pins already
    # present in the venv or it will try to build the broken ones.
    _run_uv(
        ["pip", "install", "--python", str(venv_python),
         "numba>=0.60", "llvmlite>=0.43"],
        cwd=repo_dir,
    )

    # Basic runtime dependencies (setup.sh --basic)
    code, output = _run_uv(
        ["pip", "install", "--python", str(venv_python), *_TRELLIS_BASIC_DEPS],
        cwd=repo_dir,
    )
    if code != 0:
        return {"success": False, "error": f"TRELLIS basic deps failed: {output[:300]}"}

    # utils3d (pinned commit from setup.sh)
    code, output = _run_uv(
        ["pip", "install", "--python", str(venv_python), *_TRELLIS_GIT_DEPS],
        cwd=repo_dir,
    )
    if code != 0:
        logger.warning("TRELLIS utils3d install failed: %s", output[:300])

    return {"success": True}


def _drop_cuda_only_packages(requirements_file: Path) -> Path:
    """Return a requirements path with CUDA-only build packages commented out.

    Used only when no CUDA toolkit is present, so the per-model venv can
    install its pure-Python deps and start in a degraded (CPU/inference-less)
    mode instead of failing the entire setup.
    """
    if requirements_file is None or not requirements_file.exists():
        return requirements_file
    text = requirements_file.read_text(errors="ignore")
    out_lines: list[str] = []
    changed = False
    for raw in text.splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            out_lines.append(raw)
            continue
        line = stripped.split("#", 1)[0].strip()
        if any(pat.match(line) for pat in _CUDA_ONLY_PKG_PATTERNS):
            changed = True
            out_lines.append(f"# ponytail: dropped (no CUDA toolkit on host): {line}")
            continue
        out_lines.append(raw)
    if not changed:
        return requirements_file
    tmp = Path(tempfile.gettempdir()) / (requirements_file.stem + ".nocuda.requirements.txt")
    tmp.write_text("\n".join(out_lines) + "\n")
    logger.info("CUDA-less host: dropped CUDA-only build packages -> %s", tmp)
    return tmp


def _uv_install(
    requirements_file: Path,
    repo_dir: Path,
    repo_name: str | None = None,
    python_path: str | None = None,
    log_cb: Callable | None = None,
) -> dict:
    """Install dependencies using uv. No pip fallback.

    ponytail: Fixed --python flag so uv targets the per-model venv Python
    instead of the system Python. Previously uv would install into whatever
    environment it detected, silently bypassing the isolated .venv.
    """
    uv_path = shutil.which("uv")
    if not uv_path:
        msg = (
            f"uv not found for {repo_name or 'unknown repo'}. "
            "uv is a hard dependency. Install: https://docs.astral.sh/uv/getting-started/installation/"
        )
        logger.error(msg)
        if log_cb:
            log_cb(msg)
        return {"success": False, "error": msg}

    venv_python = Path(python_path) if python_path else None
    if not venv_python or not venv_python.exists():
        msg = f"Target venv Python not found at {python_path} for {repo_name or 'unknown repo'}"
        logger.error(msg)
        if log_cb:
            log_cb(msg)
        return {"success": False, "error": msg}

    def _run_uv(args, cwd=None, extra_env=None):
        env = dict(os.environ)
        if extra_env:
            env.update(extra_env)
        return _run([uv_path] + args, cwd=cwd, env=env, log_cb=log_cb)

    # Pre-install torch so build-backends that import it during wheel build
    # (diso, torchmcubes, etc.) can compile inside isolated build envs.
    # Mirror the backend's exact torch/torchvision/torchaudio build so the
    # per-model venv stays ABI compatible with the in-process backend torch.
    if log_cb:
        log_cb(f"Pre-installing torch stack in {venv_python} (matching backend build)…")
    code, output = _install_torch_stack(venv_python, repo_dir, log_cb=log_cb)
    if code != 0:
        logger.warning("Pre-install of torch stack failed for %s: %s", repo_name, output[:300])

    # Packages whose build step imports torch (diso, torch-cluster, …) must
    # compile inside the venv — which now has torch pre-installed — instead of
    # an empty isolated build env, otherwise they fail with
    # `ModuleNotFoundError: No module named 'torch'`.
    # ponytail: fixed allow-list of known torch-dependent build packages;
    # extend here if a new repo adds another torch-extension built from source.
    TORCH_BUILD_PKGS = {
        "diso", "torch-cluster", "torch-scatter",
        "torch-sparse", "torchmcubes", "torch-geometric",
        "flash-attn",
    }

    # rembg -> pymatting -> numba -> llvmlite==0.36.0 only builds on Python
    # <3.10. Pre-installing a modern pymatting (>=1.1.15 requires numba>=0.60,
    # which supports py3.12) stops uv from resolving that ancient chain.
    # ponytail: hardcoded rembg workaround; revisit if rembg drops pymatting.
    build_iso_args: list[str] = []
    req_blob = ""
    for _f in (requirements_file, repo_dir / "pyproject.toml", repo_dir / "setup.py"):
        if _f.exists():
            req_blob += "\n" + _f.read_text(errors="ignore")
    for pkg in sorted(TORCH_BUILD_PKGS):
        if re.search(rf"\b{re.escape(pkg)}\b", req_blob):
            build_iso_args += ["--no-build-isolation-package", pkg]
    if re.search(r"\brembg\b", req_blob):
        if log_cb:
            log_cb("Pre-installing modern pymatting/numba/llvmlite for rembg (py3.12 compat)…")
        code, output = _run_uv(
            ["pip", "install", "--python", str(venv_python),
             "pymatting>=1.1.15", "numba>=0.60", "llvmlite>=0.43"],
            cwd=repo_dir,
        )
        if code != 0:
            logger.warning("Pre-install of pymatting chain failed for %s: %s", repo_name, output[:300])

    # If torch landed in the venv, point CMake at its cmake config so
    # packages like torchmcubes can find Torch during build.
    cmake_env = {}
    code, out = _run([str(venv_python), "-c",
                     "import sysconfig; print(sysconfig.get_path('platlib'))"])
    if code == 0:
        site_packages = Path(out.strip())
        torch_cmake = site_packages / "torch" / "share" / "cmake" / "Torch"
        if torch_cmake.exists():
            # Torch_DIR must point at the dir holding TorchConfig.cmake.
            cmake_env["Torch_DIR"] = str(torch_cmake)
            # CMAKE_PREFIX_PATH: find_package(Torch) looks in
            # <prefix>/share/cmake/Torch, so prefix = .../site-packages/torch.
            cmake_env["CMAKE_PREFIX_PATH"] = str(torch_cmake.parents[2])

    # Rewrite py3.12-incompatible pins (open3d 0.18, numpy 1.22, flash-attn,
    # bpy) before resolving, so the per-model venv can be created on Py3.12.
    if requirements_file is not None:
        install_requirements = _normalize_requirements_for_py312(requirements_file)
    else:
        install_requirements = None

    # No CUDA toolkit on this host: CUDA-only source extensions (diso,
    # torch-cluster, torchmcubes, …) cannot be compiled. Drop them so the venv
    # still installs its pure-Python deps instead of failing the whole setup.
    # Inference is already flagged as unavailable without a GPU.
    if not _cuda_available():
        install_requirements = _drop_cuda_only_packages(install_requirements)
        if install_requirements and log_cb and install_requirements.name.endswith(".nocuda.requirements.txt"):
            log_cb("No CUDA toolkit detected — skipping CUDA-only build packages (CPU mode)")

    # torchmcubes (used by some 3D-gen repos) builds with scikit-build-core but
    # doesn't declare it as a build dependency. Because we build it with
    # --no-build-isolation-package, scikit_build_core must live in the venv.
    # (Only needed when CUDA is present; skipped on CPU-only hosts where
    # torchmcubes is dropped above.)
    if _cuda_available() and re.search(r"\btorchmcubes\b", req_blob):
        if log_cb:
            log_cb("Pre-installing scikit_build_core for torchmcubes build…")
        code, output = _run_uv(
            ["pip", "install", "--python", str(venv_python), "scikit_build_core"],
            cwd=repo_dir,
        )
        if code != 0:
            logger.warning("Pre-install of scikit_build_core failed for %s: %s", repo_name, output[:300])

    if install_requirements is None or not install_requirements.exists():
        pyproject = repo_dir / "pyproject.toml"
        setup_py = repo_dir / "setup.py"
        if pyproject.exists():
            logger.info("No requirements.txt for %s, using uv pip install -e .", repo_name)
            code, output = _run_uv(
                ["pip", "install", "--python", str(venv_python), "-e", ".", *build_iso_args],
                cwd=repo_dir,
                extra_env=cmake_env,
            )
        elif setup_py.exists():
            logger.info("No requirements.txt for %s, using uv pip install -e .", repo_name)
            code, output = _run_uv(
                ["pip", "install", "--python", str(venv_python), "-e", ".", *build_iso_args],
                cwd=repo_dir,
                extra_env=cmake_env,
            )
        else:
            msg = f"No requirements.txt, pyproject.toml, or setup.py found for {repo_name or 'unknown repo'} at {repo_dir} — skipping install"
            logger.info(msg)
            if log_cb:
                log_cb(msg)
            return {"success": True}
    else:
        code, output = _run_uv(
            ["pip", "install", "--python", str(venv_python), "-r", str(install_requirements), *build_iso_args],
            cwd=repo_dir,
            extra_env=cmake_env,
        )

    if code != 0:
        return {"success": False, "error": output}

    # ponytail: install EXTRA_DEPS (inference libs omitted from the repo's own
    # requirements.txt, e.g. hy3dgen) into the per-model venv. In-process local
    # providers append this venv's site-packages to sys.path, so the inference
    # libraries resolve without needing to pollute the backend venv (which
    # lacks the full ML stack and may conflict with its own deps).
    extra = EXTRA_DEPS.get(repo_name)
    if extra:
        code_e, out_e = _run_uv(
            ["pip", "install", "--python", str(venv_python), *extra],
            cwd=repo_dir,
        )
        if code_e != 0:
            logger.warning(
                "Extra deps %s install failed for %s (per-model venv): %s",
                extra, repo_name, out_e[:200],
            )
        else:
            logger.info("Installed extra deps %s into %s (per-model venv)", extra, repo_name)

    return {"success": True}


# ---------------------------------------------------------------------------
# Central install policy
# ---------------------------------------------------------------------------

def resolve_install_targets(models: list[str] | None) -> list[str]:
    """
    ponytail: single source of truth for 'which models are we installing'.
    None/empty from an interactive/API trigger must NEVER silently mean
    'all models' — that's the bug. Explicit '__all__' must be passed
    intentionally.
    """
    if not models:
        raise ValueError(
            "No models specified. Pass an explicit model list, or "
            "models=['__all__'] if you really mean everything."
        )
    if models == ["__all__"]:
        return list(PROVIDER_METADATA.keys())
    return models


# ponytail: native-build policy. Models that compile a CUDA/native extension at
# install time (TRELLIS FlexiCubes, UniRig flash-attn, AniGen mmcv/git deps) can
# take 15-60 min and hard-fail without a CUDA toolkit, so they are NOT part of
# default/one-click installs. `allow_native_build=True` on an explicit
# model-specific install skips the guard.
def default_models() -> list[str]:
    """Provider ids installed by default (excludes native-build models)."""
    return [
        pid for pid, meta in PROVIDER_METADATA.items()
        if not meta.get("native_build_required", False)
    ]


def native_build_required(provider_id: str) -> bool:
    """True if the provider's install compiles a native extension."""
    return bool(PROVIDER_METADATA.get(provider_id, {}).get("native_build_required", False))


_NATIVE_BUILD_PATTERNS: tuple[re.Pattern, ...] = (
    re.compile(r"\b(CUDAExtension|CppExtension|load\(\)|cuSetup|setup\(.*ext_modules)"),
    re.compile(r"\bcmake\b|\bNinja\b|\bninja\b"),
    re.compile(r"\bCUDA_HOME\b|\bnvcc\b|NVCCOptions"),
    re.compile(r"\bflash[\-_]attn\b"),
)


def detect_native_build(repo_dir: Path) -> bool:
    """Best-effort scan of a cloned repo for source-build directives.

    Returns True if the repo contains extension/setup/cmake markers that would
    compile native code at install time. Used to warn when a model declared
    ``native_build_required=False`` actually needs a build, and to confirm the
    flag on models that do. Honest heuristic: a false negative (repo is
    interpreted as no-build) only affects the warning text, never install logic.
    """
    if not repo_dir.exists():
        return False
    probe_exts = ("setup.py", "pyproject.toml", "setup.cfg", "CMakeLists.txt", "requirements.txt")
    blob = ""
    for fname in probe_exts:
        f = repo_dir / fname
        if f.exists():
            try:
                blob += "\n" + f.read_text(errors="ignore")
            except OSError:
                pass
    if not blob:
        return False
    return any(pat.search(blob) for pat in _NATIVE_BUILD_PATTERNS)


# ---------------------------------------------------------------------------
# Concurrency control (Section 4)
# ---------------------------------------------------------------------------

import fcntl


def _pid_alive(pid: int) -> bool:
    """Return True if a process with the given PID currently exists."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        # Process exists but we lack permission to signal it — it's alive.
        return True
    return True


def _acquire_install_lock(repo_name: str) -> bool:
    """Try to acquire a file-based install lock for a repo.
    ponytail: file-based lock, fine for single-VPS. Upgrade to Redis
    if multi-host.
    Returns True if lock acquired, False if already locked.

    Stale-lock recovery: if the lock file references a PID that is no
    longer alive, the previous install crashed. We break the lock so a
    fresh install can proceed instead of deadlocking forever.
    """
    from runtime.storage import get_storage_config
    storage = get_storage_config()
    lock_path = storage.get_repo_path(repo_name) / ".installing.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    # Break a stale lock left behind by a dead install process.
    if lock_path.exists():
        try:
            content = lock_path.read_text().strip().splitlines()
            stale_pid = int(content[0]) if content else None
            if stale_pid and not _pid_alive(stale_pid):
                logger.warning(
                    "Breaking stale install lock for %s (PID %s dead)",
                    repo_name, stale_pid,
                )
                lock_path.unlink(missing_ok=True)
        except (ValueError, OSError, IndexError):
            pass
    try:
        lock_file = open(lock_path, "w")
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        lock_file.write(f"{os.getpid()}\n{datetime.utcnow().isoformat()}\n")
        lock_file.flush()
        return True
    except (IOError, OSError):
        return False


def _release_install_lock(repo_name: str) -> None:
    """Remove the install lock file for a repo (best-effort)."""
    try:
        from runtime.storage import get_storage_config
        lock_path = get_storage_config().get_repo_path(repo_name) / ".installing.lock"
        if lock_path.exists():
            lock_path.unlink()
    except Exception:
        pass


def _check_disk_space(provider_name: str) -> tuple[bool, str]:
    """Check if there's enough disk space for a model's weights.
    Returns (sufficient, error_message).
    """
    model_cfg = HF_MODELS.get(provider_name)
    if not model_cfg:
        return True, ""  # Unknown model, can't check — allow
    size_gb = model_cfg["size_estimate_gb"]
    required_bytes = int(size_gb * 1024 ** 3) * 1.2  # 20% headroom
    try:
        disk = shutil.disk_usage(get_storage_config().third_party_dir)
        if disk.free < required_bytes:
            free_gb = round(disk.free / (1024 ** 3), 1)
            return False, (
                f"Insufficient disk space: {free_gb}GB free, "
                f"need ~{size_gb * 1.2:.1f}GB for {provider_name}"
            )
    except Exception:
        pass  # Can't check — allow
    return True, ""


# ---------------------------------------------------------------------------
# Module-level functions (primary API)
# ---------------------------------------------------------------------------

def _ensure_git_installed() -> tuple[bool, str]:
    """Ensure git is available in the environment.

    In Colab, git is not pre-installed, so we install it automatically.
    Returns (success, message).
    """
    git_path = shutil.which("git")
    if git_path:
        return True, f"git found at {git_path}"

    from runtime.platform_detection import _is_colab

    if not _is_colab():
        return False, "git is not installed and this is not a Colab environment"

    try:
        code, output = _run(["apt-get", "update", "-qq"])
        if code != 0:
            return False, f"apt-get update failed: {output[:200]}"
        code, output = _run(["apt-get", "install", "-y", "-qq", "git"])
        if code != 0:
            return False, f"apt-get install git failed: {output[:200]}"
        git_path = shutil.which("git")
        if git_path:
            return True, f"git installed at {git_path}"
        return False, "git installation succeeded but git binary not found"
    except Exception as exc:
        return False, f"Failed to install git in Colab: {exc}"


def clone_repo(repo_name: str, log_cb: Callable | None = None) -> dict:
    storage = get_storage_config()
    repo_cfg = REPOS.get(repo_name)
    if not repo_cfg:
        return {"success": False, "error": f"Unknown repo: {repo_name}"}

    # Ensure git is available (especially important in Colab)
    git_ok, git_msg = _ensure_git_installed()
    if not git_ok:
        return {"success": False, "error": f"git not available: {git_msg}"}
    if log_cb and git_msg != "git found":
        log_cb(git_msg)

    dest = storage.get_repo_path(repo_name)
    if dest.exists() and (dest / ".git").exists():
        logger.info("Repo %s already cloned, pulling latest.", repo_name)
        code, output = _run(["git", "pull", "--rebase"], cwd=dest, log_cb=log_cb)
        if code != 0:
            logger.warning("git pull failed for %s, keeping existing.", repo_name)
        return {"success": True, "path": str(dest), "action": "pulled"}
    # If destination exists but is not a git repo (e.g., weights dir created first),
    # remove it so git clone can proceed into a clean directory.
    if dest.exists():
        logger.info("Removing non-git directory %s before clone", dest)
        shutil.rmtree(str(dest), ignore_errors=True)
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["git", "clone", "--depth", "1",
           "--branch", repo_cfg["branch"],
           repo_cfg["url"], str(dest)]
    code, out = _run(cmd, log_cb=log_cb)
    if code != 0:
        return {"success": False, "error": f"git clone failed (exit {code})", "output": out}
    # ponytail: --depth 1 skips submodules (e.g. TRELLIS's FlexiCubes CUDA
    # extension). Pull them so in-repo source isn't missing at import time.
    # Failure is non-fatal: repos without submodules just no-op here.
    _run(["git", "submodule", "update", "--init", "--recursive"], cwd=dest, log_cb=log_cb)
    return {"success": True, "path": str(dest), "action": "cloned"}


def install_repo_deps(repo_name: str, log_cb: Callable | None = None) -> dict:
    storage = get_storage_config()
    repo_cfg = REPOS.get(repo_name)
    if not repo_cfg:
        return {"success": False, "error": f"Unknown repo: {repo_name}"}
    repo_dir = storage.get_repo_path(repo_name)
    if not repo_dir.exists():
        return {"success": False, "error": f"Repo not cloned: {repo_name}"}
    # ponytail: honest native-build detection. If the cloned repo contains
    # compile directives (CMake/CUDAExtension/ninja/…) warn so an admin can
    # expect a long install and a CUDA-toolkit dependency before it starts.
    if detect_native_build(repo_dir):
        msg = f"Native build detected in {repo_name} (CMake/CUDA/ninja) — dependency install may take 15-60 min and requires a CUDA toolkit."
        logger.warning(msg)
        if log_cb:
            log_cb(msg)
    # per-model isolated venv — uv only, no fallback
    # ponytail: cross-platform venv Python path detection
    venv_dir = repo_dir / ".venv"
    if platform.system() == "Windows":
        venv_python = venv_dir / "Scripts" / "python.exe"
    else:
        venv_python = venv_dir / "bin" / "python"
    if not venv_dir.exists():
        uv_path = shutil.which("uv")
        if not uv_path:
            return {
                "success": False,
                "error": (
                    f"uv not found — cannot create venv for {repo_name}. "
                    "uv is a hard dependency. Install: https://docs.astral.sh/uv/getting-started/installation/"
                ),
            }
        code, output = _run([uv_path, "venv", str(venv_dir)], cwd=repo_dir, log_cb=log_cb)
        if code != 0:
            return {"success": False, "error": f"uv venv creation failed for {repo_name}: {output}"}
        logger.info("Created uv venv for %s at %s", repo_name, venv_dir)
    else:
        logger.info("venv already exists for %s at %s", repo_name, venv_dir)

    if not (venv_python.exists()):
        return {"success": False, "error": f"venv python not found at {venv_python} for {repo_name}"}

    logger.info("Installing deps for %s using uv + per-model venv python", repo_name)
    if repo_name == "TRELLIS" and not repo_cfg.get("requirements"):
        ok = _install_trellis_deps(repo_dir, venv_python, log_cb=log_cb)
    else:
        req = repo_dir / repo_cfg["requirements"] if repo_cfg.get("requirements") else None
        ok = _uv_install(req, repo_dir, repo_name=repo_name, python_path=str(venv_python), log_cb=log_cb)
    if not ok.get("success", False):
        return {"success": False, "error": f"uv install failed for {repo_name}: {ok.get('error', 'Unknown error')}"}
    return {"success": True, "repo": repo_name}


def download_weights(
    provider_name: str,
    hf_token: str | None = None,
    log_cb: Callable | None = None,
) -> dict:
    model_cfg = HF_MODELS.get(provider_name)
    if not model_cfg:
        return {"success": False, "error": f"No HF model config for: {provider_name}"}

    storage = get_storage_config()
    size_gb = model_cfg["size_estimate_gb"]
    existing = storage.get_weight_path(provider_name)
    if existing:
        # ponytail: Verify integrity — check that the weights directory has
        # actual model files, not just an empty dir or leftover .lock files.
        # Scans recursively: some snapshots (e.g. hunyuan3d-2-mini) keep model
        # files inside a subfolder (hunyuan3d-dit-v2-mini/), so a top-level-only
        # scan would wrongly report "empty" and re-download.
        def _real_files(base: Path) -> list[Path]:
            return [
                f for f in base.rglob("*")
                if f.is_file()
                and not f.name.startswith(".")
                and not any(p.startswith(".") for p in f.relative_to(base).parts[:-1])
            ]

        real_files = _real_files(Path(existing))
        if real_files:
            total_size = sum(f.stat().st_size for f in real_files if f.stat().st_size > 0)
            min_expected = int(size_gb * 1024 ** 3) * 0.1  # at least 10% of expected
            if total_size > min_expected or min_expected == 0:
                if log_cb:
                    log_cb(f"Weights already present ({len(real_files)} files, {total_size / (1024**3):.2f}GB): {existing}")
                return {"success": True, "path": str(existing), "action": "already_present"}
            else:
                if log_cb:
                    log_cb(f"Weights directory exists but incomplete ({total_size / (1024**3):.2f}GB / ~{size_gb}GB expected) — re-downloading")
        else:
            if log_cb:
                log_cb("Weights directory exists but empty — re-downloading")

    hf_repo = model_cfg["repo"]
    size_gb = model_cfg["size_estimate_gb"]
    size_bytes = int(size_gb * 1024 ** 3)

    # ponytail: weights live inside the model's repo folder under a per-model
    # subdir keyed by the weight_key. This keeps models that share a repo
    # (hunyuan3d-2.1 + hunyuan3d-2 both map to "Hunyuan3D-2") isolated —
    # previously they collapsed into one shared flat weights dir and
    # get_weight_path() could not tell them apart.
    meta = PROVIDER_METADATA.get(provider_name, {})
    repo_name = meta.get("repo", provider_name)
    local_dir = storage.get_repo_path(repo_name) / "weights" / provider_name
    local_dir.mkdir(parents=True, exist_ok=True)

    # Accurate, real-bytes progress via HuggingFace's progress callback.
    # HF reports bytes downloaded / total per file; we forward a STRUCTURED
    # dict to log_cb which the admin layer writes directly into _DL_STATE.
    # This is real progress, not estimate-based. A coarse filesystem poll
    # runs in parallel only as a fallback when HF reports no total.
    def _structured_cb(total: int | None, downloaded: int) -> None:
        if log_cb is None:
            return
        log_cb({
            "__progress__": {
                "bytes_downloaded": downloaded,
                "bytes_total": total if total else size_bytes,
                "phase": "weights",
                "status": "downloading",
            }
        })

    if log_cb:
        log_cb(
            f"Downloading weights for {provider_name}: "
            f"{hf_repo} (~{size_gb}GB) to {local_dir}"
        )

    token = (
        hf_token
        or os.environ.get("HUGGINGFACE_TOKEN")
        or os.environ.get("HF_TOKEN")
    )

    # ------------------------------------------------------------------
    # Fallback filesystem poll: only feeds progress when HF has not
    # reported a total (size_bytes estimate). Real HF bytes take priority.
    # ------------------------------------------------------------------
    stop_monitor = threading.Event()

    def _monitor() -> None:
        while not stop_monitor.wait(timeout=1.0):
            try:
                current_bytes = sum(
                    f.stat().st_size
                    for f in local_dir.rglob("*")
                    if f.is_file() and not f.name.startswith(".")
                )
                if current_bytes <= 0:
                    continue
                _structured_cb(size_bytes if size_bytes else None, current_bytes)
            except Exception:
                pass

    monitor_thread = threading.Thread(target=_monitor, daemon=True, name=f"dl-monitor-{provider_name}")
    monitor_thread.start()
    # ACCURATE_PROGRESS_ANCHOR

    try:
        from huggingface_hub import snapshot_download
        logger.info("Downloading %s (~%sGB)…", hf_repo, size_gb)
        # ponytail: per-model allow_patterns keep large multi-variant repos lean
        # (hunyuan3d-2-mini pulls only its dit subfolder, not the ~25 GB repo).
        allow_patterns = model_cfg.get("allow_patterns")
        ignore_patterns = list(
            model_cfg.get(
                "ignore_patterns",
                ["*.msgpack", "flax_model*", "tf_model*", "rust_model*"],
            )
        )
        path = snapshot_download(
            repo_id=hf_repo,
            local_dir=str(local_dir),
            token=token,
            allow_patterns=allow_patterns,
            ignore_patterns=ignore_patterns,
        )
        stop_monitor.set()
        monitor_thread.join(timeout=5)
        if log_cb:
            log_cb(f"Download complete: {path}")
        return {"success": True, "path": path, "action": "downloaded"}

    except Exception as exc:
        stop_monitor.set()
        monitor_thread.join(timeout=5)
        logger.exception("Weight download failed for %s", provider_name)
        return {"success": False, "error": str(exc)}


# ponytail: Provider validation at function entry; returns available providers list
# to help users correct their input without guessing. Root cause fix for
# "Unknown provider" errors that gave no guidance on valid options.
def install_provider(
    provider_name: str,
    hf_token: str | None = None,
    log_cb: Callable | None = None,
    allow_native_build: bool = False,
) -> dict:
    provider_name = _canonical_provider_name(provider_name)
    meta = PROVIDER_METADATA.get(provider_name)
    if not meta:
        available = list(PROVIDER_METADATA.keys())
        available_real = [p for p in available if p != "mock"]
        return {
            "success": False,
            "error": f"Unknown provider '{provider_name}'. Available providers: {available_real}",
            "available_providers": available_real,
        }
    # Section 4: concurrency + disk space checks
    repo_name = meta.get("repo")
    locked_repos: list[str] = []
    if repo_name:
        if not _acquire_install_lock(repo_name):
            return {
                "success": False,
                "error": f"Model {provider_name} is already being installed. Wait for the current install to finish.",
            }
        locked_repos.append(repo_name)
    try:
        sufficient, space_err = _check_disk_space(provider_name)
        if not sufficient:
            return {"success": False, "error": space_err}
        # ponytail: always try to clone repo and download weights.
        # For native-build models, deps install is attempted but non-blocking.
        if repo_name:
            st = get_install_status().get(provider_name, {})
            if not st.get("repo_ready"):
                r = clone_repo(repo_name, log_cb=log_cb)
                if not r.get("success"):
                    return {"success": False, "error": r.get("error", "Repo clone failed")}
            if not st.get("venv_ready"):
                # Attempt deps install; for native-build models, log warning but don't block
                meta_get = meta.get("native_build_required", False)
                if meta_get and not allow_native_build:
                    if log_cb:
                        log_cb(f"Note: '{provider_name}' requires native CUDA build; skipping deps install. Weights will be downloaded for manual setup.")
                else:
                    r = install_repo_deps(repo_name, log_cb=log_cb)
                    if not r.get("success"):
                        if meta_get and not allow_native_build:
                            if log_cb:
                                log_cb(f"Warning: deps install failed for {provider_name} (native build needed), continuing to weights download: {r.get('error')}")
                        else:
                            return {"success": False, "error": r.get("error", "Deps install failed")}
        weight_key = meta.get("weight_key")
        if weight_key:
            if log_cb:
                log_cb(f"Downloading weights for {provider_name}\u2026")
            try:
                r = download_weights(weight_key, hf_token=hf_token, log_cb=log_cb)
                results = {"provider": provider_name, "steps": {"weights": r}}
                if not r["success"]:
                    error_msg = r.get("error", "Weight download failed")
                    if "404" in str(error_msg) or "not found" in str(error_msg).lower():
                        error_msg = f"Model '{weight_key}' not found on HuggingFace - check model ID is correct"
                    elif "401" in str(error_msg) or "403" in str(error_msg) or "auth" in str(error_msg).lower():
                        error_msg = "Authentication failed - check your HuggingFace token"
                    elif "timeout" in str(error_msg).lower():
                        error_msg = "Download timed out - check your internet connection"
                    results["steps"]["weights"]["error"] = error_msg
                    return {**results, "success": False, "error": error_msg}
            except Exception as exc:
                error_str = str(exc).lower()
                if "404" in error_str or "not found" in error_str:
                    error_msg = f"Model '{weight_key}' does not exist on HuggingFace"
                elif "401" in error_str or "403" in error_str or "auth" in error_str or "token" in error_str:
                    error_msg = "Invalid or missing HuggingFace token - please configure HF_TOKEN"
                elif "connection" in error_str or "network" in error_str or "timeout" in error_str:
                    error_msg = "Network error during download - please check connection and retry"
                else:
                    error_msg = f"Unexpected error downloading weights: {exc}"
                logger.exception("Weight download exception for %s", weight_key)
                return {"success": False, "error": error_msg}
        else:
            r = {"success": True, "action": "no_weights"}

        if log_cb:
            log_cb("Verifying installation\u2026")
        # ponytail: load the persisted install state BEFORE mutating it.
        # Previously `state` was referenced here but never defined in this
        # function's scope (only get_install_status() defined it), so every
        # successful install crashed with "name 'state' is not defined" right
        # after the (heavy) weight download — weights landed on disk but the
        # install reported failure and the registry was never refreshed.
        state = _load_state()
        state.setdefault("repos", {})[provider_name] = {
            "installed_at": datetime.utcnow().isoformat(),
        }
        if repo_name and repo_name != provider_name:
            state.setdefault("repos", {})[repo_name] = {
                "installed_at": datetime.utcnow().isoformat(),
                "installed_via": provider_name,
            }
        state["last_updated"] = datetime.utcnow().isoformat()
        _save_state(state)
        try:
            from app.core.providers.registry import reset_provider
            reset_provider()
            if log_cb:
                log_cb("Provider registry refreshed")
        except Exception:
            pass
        if log_cb:
            log_cb("Installation complete")
        return {"success": True, "provider": provider_name, "steps": {"weights": r} if weight_key else {}}
    finally:
        for rn in locked_repos:
            _release_install_lock(rn)


def uninstall_provider(provider_name: str, log_cb: Callable | None = None) -> dict:
    """Uninstall a provider by removing ONLY its model weights.
    
    Keeps the repo clone and per-model venv intact for quick re-install.
    This matches the user's requirement to only delete weights, not the repo/venv.
    """
    provider_name = _canonical_provider_name(provider_name)
    meta = PROVIDER_METADATA.get(provider_name)
    if not meta:
        return {"success": False, "error": f"Unknown provider: {provider_name}"}
    
    weight_key = meta.get("weight_key")
    if not weight_key:
        return {"success": True, "message": f"No weights to remove for {provider_name}"}
    
    storage = get_storage_config()
    removed_paths = []
    errors = []
    
    # 1. Remove per-model weights directory (new layout)
    repo_name = meta.get("repo")
    if repo_name:
        per_model_weights = storage.get_repo_path(repo_name) / "weights" / weight_key
        if per_model_weights.exists():
            try:
                shutil.rmtree(str(per_model_weights), ignore_errors=True)
                removed_paths.append(str(per_model_weights))
                if log_cb:
                    log_cb(f"Removed per-model weights: {per_model_weights}")
            except Exception as exc:
                errors.append(f"Failed to remove {per_model_weights}: {exc}")
    
    # 2. Remove legacy centralized weights directory (fallback)
    legacy_weights = storage.weights_dir / weight_key
    if legacy_weights.exists():
        try:
            shutil.rmtree(str(legacy_weights), ignore_errors=True)
            removed_paths.append(str(legacy_weights))
            if log_cb:
                log_cb(f"Removed legacy weights: {legacy_weights}")
        except Exception as exc:
            errors.append(f"Failed to remove {legacy_weights}: {exc}")
    
    # 3. Remove any HF cache entries for this weight_key
    for cache_dir in storage.hf_cache_dirs:
        try:
            for hub_dir in (cache_dir / "hub", cache_dir):
                if not hub_dir.exists():
                    continue
                slug = weight_key.replace("/", "--")
                for prefix in ("models--", ""):
                    candidate = hub_dir / f"{prefix}{slug}"
                    if candidate.exists():
                        shutil.rmtree(str(candidate), ignore_errors=True)
                        removed_paths.append(str(candidate))
                        if log_cb:
                            log_cb(f"Removed HF cache: {candidate}")
        except Exception:
            pass
    
    # 4. Clear install state for this provider
    try:
        state = _load_state()
        if "repos" in state and provider_name in state["repos"]:
            del state["repos"][provider_name]
            _save_state(state)
            if log_cb:
                log_cb(f"Cleared install state for {provider_name}")
    except Exception as exc:
        errors.append(f"Failed to clear state: {exc}")
    
    # 5. Reset provider registry
    try:
        from app.core.providers.registry import reset_provider
        reset_provider()
        if log_cb:
            log_cb("Provider registry refreshed")
    except Exception:
        pass
    
    if errors:
        return {"success": False, "error": "; ".join(errors), "removed": removed_paths}
    
    if log_cb:
        log_cb(f"Uninstalled weights for {provider_name}")
    return {"success": True, "provider": provider_name, "removed": removed_paths}


def get_install_status() -> dict:
    storage = get_storage_config()
    state = _load_state()
    status = {}
    for name, meta in PROVIDER_METADATA.items():
        repo_name = meta.get("repo")
        weight_key = meta.get("weight_key")
        if repo_name:
            rp = storage.get_repo_path(repo_name)
            repo_ok = rp.exists() and (rp / ".git").exists()
        else:
            repo_ok = True
        if weight_key:
            wp = storage.get_weight_path(weight_key)
            weight_ok = wp is not None
        else:
            weight_ok = True
        # ponytail: venv readiness is what the model tab needs to warn when a
        # repo/venv was skipped (e.g. exceeds Colab limits). Mirrors the check
        # colab.sh's prepare_model_runtimes does with validate_venv().
        venv_ok = False
        if repo_name:
            venv_python = storage.get_model_venv_path(repo_name) / "bin" / "python"
            venv_ok = venv_python.exists()
        persisted = state.get("repos", {}).get(name)
        status[name] = {
            "installed": repo_ok and weight_ok,
            "repo_cloned": repo_ok,
            "weights_present": weight_ok,
            "repo_ready": repo_ok,
            "venv_ready": venv_ok,
            "weights_ready": weight_ok,
            "repo_path": str(storage.get_repo_path(repo_name)) if repo_name else None,
            "weight_path": str(storage.get_weight_path(weight_key)) if (weight_key and weight_ok) else None,
            "metadata": meta,
            "last_installed": persisted.get("installed_at") if persisted else None,
        }
    return status


def get_provider_python(repo_name: str) -> Path:
    """Return the python executable inside a provider's isolated venv.
    Raises FileNotFoundError if venv is missing."""
    storage = get_storage_config()
    venv_python = storage.get_model_venv_path(repo_name) / "bin" / "python"
    if not venv_python.exists():
        raise FileNotFoundError(
            f"Provider venv python not found: {venv_python}. "
            f"Run install_repo_deps('{repo_name}') first."
        )
    return venv_python


def verify_environment() -> dict:
    checks: dict = {}
    # uv check: hard dependency
    uv_path = shutil.which("uv")
    checks["uv"] = {
        "found": bool(uv_path),
        "path": uv_path,
        "ok": bool(uv_path),
        "install_link": "https://docs.astral.sh/uv/getting-started/installation/" if not uv_path else None,
    }
    checks["python"] = {
        "version": platform.python_version(),
        "ok": sys.version_info >= (3, 10),
    }
    try:
        import torch
        checks["torch"] = {
            "version": torch.__version__,
            "cuda_available": torch.cuda.is_available(),
            "ok": True,
        }
    except ImportError:
        checks["torch"] = {"ok": False, "error": "torch not installed"}
    try:
        import huggingface_hub
        checks["huggingface_hub"] = {"version": huggingface_hub.__version__, "ok": True}
    except ImportError:
        checks["huggingface_hub"] = {"ok": False, "error": "not installed"}
    git = shutil.which("git")
    checks["git"] = {"found": bool(git), "path": git, "ok": bool(git)}
    checks["storage"] = get_storage_config().validate()
    return checks


# ---------------------------------------------------------------------------
# RuntimeInstaller class
# ---------------------------------------------------------------------------

class RuntimeInstaller:
    def __init__(
        self,
        progress_cb: Callable[[str], None] | None = None,
        hf_token: str | None = None,
    ) -> None:
        self.storage = get_storage_config()
        self._progress_cb = progress_cb
        self._hf_token = hf_token

    def _cb(self, msg: str) -> None:
        if self._progress_cb:
            self._progress_cb(msg)
        else:
            logger.info(msg)

    def create_folders(self) -> None:
        self.storage.ensure_dirs()

    def verify_system(self) -> dict:
        return verify_environment()

    def verify_installation(self) -> dict:
        install = get_install_status()
        real_providers = {k: v for k, v in install.items() if k != "mock"}
        available = sum(1 for v in real_providers.values() if v["installed"])
        total = len(real_providers)
        return {
            **install,
            "providers_available": available,
            "providers_total": total,
            "can_generate": available > 0 or install.get("mock", {}).get("installed", False),
        }

    def clone_repos_for_models(
        self,
        models: list[str] | None = None,
        log_cb: Callable | None = None,
    ) -> dict:
        cb = log_cb or self._cb
        resolved = resolve_install_targets(models)
        results = {}
        for repo_name, cfg in REPOS.items():
            relevant = [p for p in cfg.get("providers", []) if p in resolved]
            if not relevant:
                continue
            results[repo_name] = clone_repo(repo_name, log_cb=cb)
        return results

    def install_repo_deps_for_models(
        self,
        models: list[str] | None = None,
        log_cb: Callable | None = None,
    ) -> dict:
        cb = log_cb or self._cb
        resolved = resolve_install_targets(models)
        results = {}
        for repo_name, cfg in REPOS.items():
            relevant = [p for p in cfg.get("providers", []) if p in resolved]
            if not relevant:
                continue
            results[repo_name] = install_repo_deps(repo_name, log_cb=cb)
        return results

    def download_weights(
        self,
        models: list[str] | None = None,
        log_cb: Callable | None = None,
    ) -> dict:
        cb = log_cb or self._cb
        resolved = resolve_install_targets(models)
        results = {}
        for name in resolved:
            if name not in HF_MODELS:
                results[name] = {"success": False, "error": f"Unknown model: {name}"}
                self._cb(f"[WARN] Unknown model '{name}'. Available: {list(HF_MODELS.keys())}")
                continue
            results[name] = download_weights(name, hf_token=self._hf_token, log_cb=cb)
        return results

    def full_install(
        self,
        skip_weights: bool = False,
        models: list[str] | None = None,
        log_cb: Callable | None = None,
        allow_native_build: bool = False,
    ) -> dict:
        cb = log_cb or self._cb
        resolved = resolve_install_targets(models)
        results: dict = {"success": True, "providers": {}}
        self.create_folders()
        for name, meta in PROVIDER_METADATA.items():
            if name == "mock":
                continue
            if name not in resolved:
                continue
            # ponytail: native-build models - attempt deps but don't block weights
            repo_name = meta.get("repo")
            native_req = meta.get("native_build_required", False)
            if repo_name:
                r = clone_repo(repo_name, log_cb=cb)
                if not r["success"]:
                    results["success"] = False
                    results["providers"][name] = r
                    continue
                if native_req and not allow_native_build:
                    if cb:
                        cb(f"Note: '{name}' requires native CUDA build; skipping deps install. Weights will be downloaded.")
                else:
                    install_repo_deps(repo_name, log_cb=cb)
            if not skip_weights and meta.get("weight_key"):
                r = download_weights(
                    meta["weight_key"], hf_token=self._hf_token, log_cb=cb
                )
                results["providers"][name] = r
            else:
                results["providers"][name] = {"success": True, "skipped": True}
        return results

    def register_providers(self) -> None:
        from app.core.providers.registry import reset_provider
        reset_provider()

    def clear_cache(self) -> None:
        cache = self.storage.runtime_cache_dir
        if cache.exists():
            shutil.rmtree(str(cache), ignore_errors=True)
        cache.mkdir(parents=True, exist_ok=True)

    def clear_vram(self) -> None:
        from runtime.gpu import empty_cuda_cache
        empty_cuda_cache()
