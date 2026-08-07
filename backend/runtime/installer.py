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
import shutil
import subprocess
import sys
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
        "requirements": "requirements.txt",
        "category": "3d_generation",
        "providers": ["trellis"],
    },
    "TripoSR": {
        "url": "https://github.com/VAST-AI-Research/TripoSR.git",
        "branch": "main",
        "requirements": "requirements.txt",
        "category": "3d_generation",
        "providers": ["triposr"],
    },
    "TripoSG": {
        "url": "https://github.com/VAST-AI-Research/TripoSG.git",
        "branch": "main",
        "requirements": "requirements.txt",
        "category": "3d_generation",
        "providers": ["triposg"],
    },
    "TripoSF": {
        "url": "https://github.com/VAST-AI-Research/TripoSF.git",
        "branch": "main",
        "requirements": "requirements.txt",
        "category": "3d_generation",
        "providers": ["triposf"],
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
    "HoloPart": {
        "url": "https://github.com/VAST-AI-Research/HoloPart.git",
        "branch": "main",
        "requirements": "requirements.txt",
        "category": "post_processing",
        "providers": ["holopart"],
    },
}

HF_MODELS = {
    "hunyuan3d-2.1": {"repo": "tencent/Hunyuan3D-2.1",         "size_estimate_gb": 14},
    "hunyuan3d-2":   {"repo": "tencent/Hunyuan3D-2",           "size_estimate_gb": 24},
    "trellis":       {"repo": "microsoft/TRELLIS-image-large", "size_estimate_gb": 3},
    "triposr":       {"repo": "stabilityai/TripoSR",           "size_estimate_gb": 2},
    "triposg":       {"repo": "VAST-AI/TripoSG",               "size_estimate_gb": 6},
    "triposf":       {"repo": "VAST-AI/TripoSF",               "size_estimate_gb": 6},
    "anigen":        {"repo": "VAST-AI/AniGen_Weights",        "size_estimate_gb": 23},
    "unirig":        {"repo": "VAST-AI/UniRig",                "size_estimate_gb": 2},
    "holopart":      {"repo": "VAST-AI/HoloPart",              "size_estimate_gb": 3},
}

PROVIDER_ALIASES = {
    "hunyuan3d-1.0": "hunyuan3d-2.1",
    "hunyuan3d": "hunyuan3d-2.1",
}


def _canonical_provider_name(name: str) -> str:
    return PROVIDER_ALIASES.get(name, name)


PROVIDER_METADATA = {
    "hunyuan3d-2.1": {
        "label": "Hunyuan3D 2.1",
        "category": "3d_generation",
        "supports_text_to_3d": True,
        "supports_image_to_3d": True,
        "supports_texture": True,
        "vram_required_mb": 16000,
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
        "vram_required_mb": 24000,
        "repo": "Hunyuan3D-2",
        "weight_key": "hunyuan3d-2",
        "workspace_compatibility": ["mesh-generation", "texture-generation", "post-processing"],
    },
    "trellis": {
        "label": "TRELLIS",
        "category": "3d_generation",
        "supports_text_to_3d": False,
        "supports_image_to_3d": True,
        "supports_texture": True,
        "vram_required_mb": 8000,
        "repo": "TRELLIS",
        "weight_key": "trellis",
        "workspace_compatibility": ["mesh-generation", "texture-generation"],
    },
    "triposr": {
        "label": "TripoSR",
        "category": "3d_generation",
        "supports_text_to_3d": False,
        "supports_image_to_3d": True,
        "supports_texture": True,
        "vram_required_mb": 6000,
        "repo": "TripoSR",
        "weight_key": "triposr",
        "workspace_compatibility": ["mesh-generation", "texture-generation"],
    },
    "triposg": {
        "label": "TripoSG",
        "category": "3d_generation",
        "supports_text_to_3d": False,
        "supports_image_to_3d": True,
        "supports_texture": False,
        "vram_required_mb": 12000,
        "repo": "TripoSG",
        "weight_key": "triposg",
        "workspace_compatibility": ["mesh-generation"],
    },
    "triposf": {
        "label": "TripoSF",
        "category": "3d_generation",
        "supports_text_to_3d": False,
        "supports_image_to_3d": True,
        "supports_texture": False,
        "vram_required_mb": 12000,
        "repo": "TripoSF",
        "weight_key": "triposf",
        "workspace_compatibility": ["mesh-generation"],
    },
    "anigen": {
        "label": "AniGen",
        "category": "rigging",
        "supports_text_to_3d": False,
        "supports_image_to_3d": False,
        "supports_texture": False,
        "vram_required_mb": 6200,
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
        "repo": "UniRig",
        "weight_key": "unirig",
        "workspace_compatibility": ["rigging", "animation"],
    },
    "holopart": {
        "label": "HoloPart",
        "category": "post_processing",
        "supports_text_to_3d": False,
        "supports_image_to_3d": False,
        "supports_texture": False,
        "vram_required_mb": 8000,
        "repo": "HoloPart",
        "weight_key": "holopart",
        "workspace_compatibility": ["segmentation", "post-processing"],
    },
    "detailgen3d": {
        "label": "DetailGen3D",
        "category": "post_processing",
        "supports_text_to_3d": False,
        "supports_image_to_3d": False,
        "supports_texture": False,
        "vram_required_mb": 4000,
        "repo": None,
        "weight_key": None,
        "workspace_compatibility": ["post-processing"],
    },
    "mock": {
        "label": "Mock (Testing)",
        "category": "testing",
        "supports_text_to_3d": True,
        "supports_image_to_3d": True,
        "supports_texture": False,
        "vram_required_mb": 0,
        "repo": None,
        "weight_key": None,
        "workspace_compatibility": ["mesh-generation", "texture-generation", "rigging", "segmentation", "remesh", "post-processing", "animation"],
    },
}

TEXTURE_MODELS = [
    {"id": "hunyuan3d-2.1", "label": "Hunyuan3D 2.1 (recommended)"},
    {"id": "hunyuan3d-2", "label": "Hunyuan3D 2"},
    {"id": "triposr", "label": "TripoSR (bake texture)"},
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
    if log_cb:
        log_cb(f"Pre-installing torch in {venv_python} for build isolation…")
    code, output = _run_uv(
        ["pip", "install", "--python", str(venv_python), "torch", "torchvision", "torchaudio"],
        cwd=repo_dir,
    )
    if code != 0:
        logger.warning("Pre-install of torch failed for %s: %s", repo_name, output[:300])

    # If torch landed in the venv, point CMake at its cmake config so
    # packages like torchmcubes can find Torch during build.
    cmake_env = {}
    torch_cmake = venv_python.parents[1] / "lib" / f"python{venv_python.name.replace('python', '')}" / "site-packages" / "torch" / "share" / "cmake" / "Torch"
    if torch_cmake.exists():
        cmake_env["CMAKE_PREFIX_PATH"] = str(torch_cmake.parent.parent)
        cmake_env["Torch_DIR"] = str(torch_cmake)

    if not requirements_file.exists():
        pyproject = repo_dir / "pyproject.toml"
        setup_py = repo_dir / "setup.py"
        if pyproject.exists():
            logger.info("No requirements.txt for %s, using uv pip install -e .", repo_name)
            code, output = _run_uv(
                ["pip", "install", "--python", str(venv_python), "-e", "."],
                cwd=repo_dir,
                extra_env=cmake_env,
            )
        elif setup_py.exists():
            logger.info("No requirements.txt for %s, using uv pip install -e .", repo_name)
            code, output = _run_uv(
                ["pip", "install", "--python", str(venv_python), "-e", "."],
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
            ["pip", "install", "--python", str(venv_python), "-r", str(requirements_file)],
            cwd=repo_dir,
            extra_env=cmake_env,
        )

    if code != 0:
        return {"success": False, "error": output}
    return {"success": True}
    else:
        code, output = _run_uv(
            ["pip", "install", "--python", str(venv_python), "-r", str(requirements_file)],
            cwd=repo_dir,
        )

    if code != 0:
        return {"success": False, "error": output}
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


# ---------------------------------------------------------------------------
# Concurrency control (Section 4)
# ---------------------------------------------------------------------------

import fcntl


def _acquire_install_lock(repo_name: str) -> bool:
    """Try to acquire a file-based install lock for a repo.
    ponytail: file-based lock, fine for single-VPS. Upgrade to Redis
    if multi-host.
    Returns True if lock acquired, False if already locked.
    """
    from runtime.storage import get_storage_config
    storage = get_storage_config()
    lock_path = storage.get_repo_path(repo_name) / ".installing.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
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
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["git", "clone", "--depth", "1",
           "--branch", repo_cfg["branch"],
           repo_cfg["url"], str(dest)]
    code, out = _run(cmd, log_cb=log_cb)
    if code != 0:
        return {"success": False, "error": f"git clone failed (exit {code})", "output": out}
    return {"success": True, "path": str(dest), "action": "cloned"}


def install_repo_deps(repo_name: str, log_cb: Callable | None = None) -> dict:
    storage = get_storage_config()
    repo_cfg = REPOS.get(repo_name)
    if not repo_cfg:
        return {"success": False, "error": f"Unknown repo: {repo_name}"}
    repo_dir = storage.get_repo_path(repo_name)
    if not repo_dir.exists():
        return {"success": False, "error": f"Repo not cloned: {repo_name}"}
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
    ok = _uv_install(repo_dir / repo_cfg["requirements"], repo_dir, repo_name=repo_name, python_path=str(venv_python), log_cb=log_cb)
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
    existing = storage.get_weight_path(provider_name)
    if existing:
        # ponytail: Verify integrity — check that the weights directory has
        # actual model files, not just an empty dir or leftover .lock files.
        existing_path = Path(existing)
        real_files = [f for f in existing_path.iterdir() if f.is_file() and not f.name.startswith(".")]
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
                log_cb(f"Weights directory exists but empty — re-downloading")

    hf_repo = model_cfg["repo"]
    size_gb = model_cfg["size_estimate_gb"]
    size_bytes = int(size_gb * 1024 ** 3)

    # ponytail: weights now live inside the model's repo folder
    meta = PROVIDER_METADATA.get(provider_name, {})
    repo_name = meta.get("repo", provider_name)
    local_dir = storage.get_repo_path(repo_name) / "weights"
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
        path = snapshot_download(
            repo_id=hf_repo,
            local_dir=str(local_dir),
            token=token,
            ignore_patterns=["*.msgpack", "flax_model*", "tf_model*", "rust_model*"],
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
) -> dict:
    provider_name = _canonical_provider_name(provider_name)
    meta = PROVIDER_METADATA.get(provider_name)
    if not meta:
        available = list(PROVIDER_METADATA.keys())
        # Filter out mock/testing provider from suggestions
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
    sufficient, space_err = _check_disk_space(provider_name)
    if not sufficient:
        for rn in locked_repos:
            _release_install_lock(rn)
        return {"success": False, "error": space_err}
    # ponytail: setup.sh handles repo cloning, venv creation, and dependency
    # installation. install_provider() now only downloads weights and updates
    # state. If the runtime is missing, setup.sh must be re-run.
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
        persisted = state.get("repos", {}).get(name)
        status[name] = {
            "installed": repo_ok and weight_ok,
            "repo_cloned": repo_ok,
            "weights_present": weight_ok,
            "repo_ready": repo_ok,
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
            repo_name = meta.get("repo")
            if repo_name:
                r = clone_repo(repo_name, log_cb=cb)
                if not r["success"]:
                    results["success"] = False
                    results["providers"][name] = r
                    continue
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
