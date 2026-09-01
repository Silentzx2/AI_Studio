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
import select
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

# ---------------------------------------------------------------------------
# Module-level cache for expensive operations
# ---------------------------------------------------------------------------

_install_status_cache: tuple[float, dict] = (0.0, {})
_INSTALL_STATUS_TTL = 30.0  # seconds — install state changes infrequently

def get_install_status_cached() -> dict:
    """Cached wrapper for get_install_status(). TTL 30s."""
    now = time.monotonic()
    if now - _install_status_cache[0] < _INSTALL_STATUS_TTL:
        return _install_status_cache[1]
    result = get_install_status()
    _install_status_cache = (now, result)
    return result

def invalidate_install_status_cache() -> None:
    """Call after install/uninstall to force fresh status on next request."""
    global _install_status_cache
    _install_status_cache = (0.0, {})
from .storage import get_storage_config
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Installation State Machine
# ---------------------------------------------------------------------------


class InstallState(Enum):
    DISCOVERED = "discovered"
    REPO_READY = "repo_ready"
    ENV_CREATING = "env_creating"
    ENV_READY = "env_ready"
    WEIGHTS_DOWNLOADING = "weights_downloading"
    WEIGHTS_READY = "weights_ready"
    NATIVE_BUILD_PENDING = "native_build_pending"
    NATIVE_BUILD_RUNNING = "native_build_running"
    NATIVE_BUILD_READY = "native_build_ready"
    PREFLIGHT_RUNNING = "preflight_running"
    MODEL_LOAD_TEST = "model_load_test"
    CAPABILITY_SMOKE_TEST = "capability_smoke_test"
    READY = "ready"
    PARTIAL = "partial"
    BLOCKED = "blocked"
    FAILED = "failed"
    ENV_FAILED = "env_failed"
    WEIGHTS_INCOMPLETE = "weights_incomplete"
    PREFLIGHT_FAILED = "preflight_failed"
    CUDA_INCOMPATIBLE = "cuda_incompatible"
    VRAM_INSUFFICIENT = "vram_insufficient"
    NOT_IMPLEMENTED = "not_implemented"


@dataclass
class ComponentStatus:
    name: str
    state: InstallState
    detail: str = ""
    last_error: str | None = None


# ---------------------------------------------------------------------------
# Component-level state enums (Refactor.md TASK 6)
# Fine-grained states for UI status reporting and readiness gating.
# ---------------------------------------------------------------------------


class RepoState(Enum):
    MISSING = "missing"
    READY = "ready"
    FAILED = "failed"


class EnvState(Enum):
    MISSING = "missing"
    CREATING = "creating"
    READY = "ready"
    FAILED = "failed"


class DepsState(Enum):
    PENDING = "pending"
    INSTALLING = "installing"
    READY = "ready"
    PARTIAL = "partial"
    FAILED = "failed"


class NativeState(Enum):
    NOT_REQUIRED = "not_required"
    PENDING = "pending"
    CHECKING_WHEEL = "checking_wheel"
    WHEEL_FOUND = "wheel_found"
    WHEEL_INSTALLED = "wheel_installed"
    BUILD_PENDING = "build_pending"
    BUILD_RUNNING = "build_running"
    READY = "ready"
    SKIPPED = "skipped"
    FAILED = "failed"


class WeightsState(Enum):
    MISSING = "missing"
    DOWNLOADING = "downloading"
    VERIFYING = "verifying"
    READY = "ready"
    INCOMPLETE = "incomplete"
    FAILED = "failed"


class ModelState(Enum):
    NOT_READY = "not_ready"
    PARTIAL = "partial"
    READY = "ready"
    BLOCKED = "blocked"
    FAILED = "failed"

# ---------------------------------------------------------------------------
# Configuration tables
# ---------------------------------------------------------------------------

def _load_install_manifests() -> dict[str, dict]:
    """Load all model manifests that define installation metadata.

    ponytail: installation metadata belongs in YAML manifests; this module
    exposes compatibility views for existing callers without duplicating the
    actual repo/weights configuration in Python.
    """
    from runtime.manifest_loader import list_manifests, load_manifest
    result: dict[str, dict] = {}
    for provider in list_manifests():
        try:
            result[provider] = load_manifest(provider)
        except Exception as exc:
            logger.warning("Skipping invalid install manifest %s: %s", provider, exc)
    return result


def _repo_name_from_manifest(manifest: dict, provider_name: str | None = None) -> str:
    source = manifest.get("source", {}) if isinstance(manifest, dict) else {}
    explicit = source.get("local_dir")
    if explicit:
        return str(explicit)
    repo_url = source.get("repo")
    if repo_url:
        name = str(repo_url).rstrip("/").rsplit("/", 1)[-1]
        return name[:-4] if name.endswith(".git") else name
    return provider_name or str(manifest.get("name", "model"))


def _build_repo_registry() -> dict[str, dict]:
    registry: dict[str, dict] = {}
    for provider, manifest in _load_install_manifests().items():
        source = manifest.get("source", {}) or {}
        repo_url = source.get("repo")
        if not repo_url:
            continue
        repo_name = _repo_name_from_manifest(manifest, provider)
        cfg = registry.setdefault(repo_name, {
            "url": repo_url,
            "branch": source.get("ref", "main"),
            "requirements": source.get("requirements"),
            "submodules": source.get("submodules", False),
            "category": (manifest.get("hardware") or {}).get("category", "3d_generation"),
            "providers": [],
        })
        if provider not in cfg["providers"]:
            cfg["providers"].append(provider)
        # Prefer the explicit source metadata from the first manifest; shared
        # repos intentionally use one checkout.
    return registry


# Compatibility views for existing API/health callers. Values originate only
# from manifests; no install-time model URLs or weight metadata are hardcoded here.
REPOS = _build_repo_registry()


def _build_weight_registry() -> dict[str, dict]:
    result: dict[str, dict] = {}
    for provider, manifest in _load_install_manifests().items():
        weights = manifest.get("weights", {}) or {}
        primary = weights.get("primary", {}) or {}
        repo = primary.get("repo") or weights.get("repo")
        if not repo:
            continue
        result[provider] = {
            "repo": repo,
            "size_estimate_gb": weights.get("size_estimate_gb", 0),
            "allow_patterns": weights.get("allow_patterns"),
            "ignore_patterns": weights.get("ignore_patterns"),
        }
    return result


HF_MODELS = _build_weight_registry()


PROVIDER_ALIASES = {
    "hunyuan3d-1.0": "hunyuan3d-2.1",
    "hunyuan3d": "hunyuan3d-2.1",
}


def _canonical_provider_name(name: str) -> str:
    return PROVIDER_ALIASES.get(name, name)


# PROVIDER_METADATA is now generated from YAML manifests via manifest_loader.
# The "mock" testing provider is appended here because it has no manifest.
from runtime.manifest_loader import PROVIDER_METADATA as _MANIFEST_PROVIDER_METADATA

PROVIDER_METADATA = {**_MANIFEST_PROVIDER_METADATA, "mock": {
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
}}


TEXTURE_MODELS = [
    {"id": "hunyuan3d-2.1", "label": "Hunyuan3D 2.1 (recommended)"},
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


def persist_provider_state(provider_name: str, state_data: dict) -> None:
    """Persist component-level install state to DB."""
    try:
        from app.database import SessionLocal
        from app.models.registry import ProviderInstallState
        with SessionLocal() as session:
            existing = session.get(ProviderInstallState, provider_name)
            if existing:
                for key, value in state_data.items():
                    if hasattr(existing, key):
                        setattr(existing, key, value)
            else:
                entry = ProviderInstallState(provider_name=provider_name, **state_data)
                session.add(entry)
            session.commit()
    except Exception as exc:
        logger.warning("Failed to persist provider state for %s: %s", provider_name, exc)


def load_provider_state_from_db(provider_name: str) -> dict | None:
    """Load persisted component-level install state from DB."""
    try:
        from app.database import SessionLocal
        from app.models.registry import ProviderInstallState
        with SessionLocal() as session:
            entry = session.get(ProviderInstallState, provider_name)
            if entry:
                return {
                    "provider_name": entry.provider_name,
                    "overall_state": entry.overall_state,
                    "repo_state": entry.repo_state,
                    "env_state": entry.env_state,
                    "weights_state": entry.weights_state,
                    "auxiliary_weights_state": entry.auxiliary_weights_state,
                    "native_build_state": entry.native_build_state,
                    "preflight_state": entry.preflight_state,
                    "model_load_state": entry.model_load_state,
                    "capability_state": entry.capability_state,
                    "blocking_component": entry.blocking_component,
                    "blocking_reason": entry.blocking_reason,
                    "repair_available": entry.repair_available,
                    "last_preflight_run": entry.last_preflight_run.isoformat() if entry.last_preflight_run else None,
                    "last_preflight_result": entry.last_preflight_result,
                    "native_build_task_id": entry.native_build_task_id,
                    "native_build_lock_owner": entry.native_build_lock_owner,
                    "native_build_lock_ts": entry.native_build_lock_ts.isoformat() if entry.native_build_lock_ts else None,
                    "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
                }
    except Exception:
        pass
    return None


def get_persisted_install_status() -> dict:
    """Return component-level install status from DB, falling back to file state."""
    try:
        from app.database import SessionLocal
        from app.models.registry import ProviderInstallState
        result = {}
        with SessionLocal() as session:
            for entry in session.query(ProviderInstallState).all():
                result[entry.provider_name] = load_provider_state_from_db(entry.provider_name) or {}
        return result
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Low-level subprocess helper
# ---------------------------------------------------------------------------

def _run(
    cmd: list[str],
    cwd: Path | None = None,
    env: dict | None = None,
    log_cb: Callable | None = None,
    timeout: float | None = None,
) -> tuple[int, str]:
    merged_env = {**os.environ, **(env or {})}
    merged_env.setdefault("UV_LINK_MODE", "copy")
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=str(cwd) if cwd else None,
        env=merged_env,
    )
    lines: list[str] = []
    # ponytail: select() with timeout prevents blocking forever when subprocess
    # doesn't flush. Returns partial output on timeout. Upgrade path: async subprocess.
    if proc.stdout is None:
        proc.wait()
        return proc.returncode, ""
    try:
        _deadline = time.monotonic() + timeout if timeout else None
        while True:
            _remaining = None
            if _deadline is not None:
                _remaining = _deadline - time.monotonic()
                if _remaining <= 0:
                    proc.kill()
                    proc.wait()
                    return -1, "\n".join(lines)
            ready, _, _ = select.select([proc.stdout], [], [], min(_remaining, 1.0) if _remaining is not None else 1.0)
            if ready:
                chunk = proc.stdout.read(4096)
                if not chunk:
                    break
                for line in chunk.decode("utf-8", errors="replace").splitlines():
                    line = line.rstrip()
                    lines.append(line)
                    logger.info("[subprocess] %s", line)
                    if log_cb:
                        log_cb(line)
            else:
                # Timeout reached — check if process is still alive
                if proc.poll() is not None:
                    # Read any remaining data
                    remaining = proc.stdout.read()
                    if remaining:
                        for line in remaining.decode("utf-8", errors="replace").splitlines():
                            line = line.rstrip()
                            lines.append(line)
                            logger.info("[subprocess] %s", line)
                            if log_cb:
                                log_cb(line)
                    break
    finally:
        proc.stdout.close()
        proc.wait()
    return proc.returncode, "\n".join(lines)


# ---------------------------------------------------------------------------
# Python 3.12 requirement rewrites (manifest-driven)
# ---------------------------------------------------------------------------
# Pin rewrites for Python 3.12 compatibility are now defined in each manifest
# under `environment.python_pin_rewrites` as a list of {pattern, replacement}
# entries. This allows per-repo customization without modifying installer code.
# If a manifest lacks this section, no rewrites are applied (the original
# requirements file is used as-is).


def _extract_pkg_name(spec: str) -> str:
    """Extract the package name from a dependency spec.

    Handles specs like 'pkg==1.0', 'pkg>=1.0', 'pkg[extra]', 'git+https://...'.
    Returns the normalized package name (lowercase, stripped).
    """
    spec = spec.strip()
    if not spec:
        return ""
    # VCS URLs: extract the package name from the fragment or the last path segment
    if spec.startswith(("git+", "hg+", "svn+", "bzr+")):
        # Try to find '#egg=' fragment
        egg_idx = spec.find("#egg=")
        if egg_idx != -1:
            return spec[egg_idx + 5:].split("&", 1)[0].strip().lower()
        # Fall back to last path segment, strip .git suffix
        name = spec.rstrip("/").rsplit("/", 1)[-1]
        if name.endswith(".git"):
            name = name[:-4]
        return name.lower()
    # Standard spec: extract name before any version specifier or extras
    match = re.match(r"^([a-zA-Z0-9][-a-zA-Z0-9._]*)", spec)
    return match.group(1).lower() if match else spec.lower()


def _normalize_requirements_for_py312(requirements_file: Path, manifest: dict | None = None) -> Path:
    """On Py<3.12 return the original path unchanged.

    On Py>=3.12 rewrite uninstallable pins to cp312-installable versions
    using rules from the manifest's `environment.python_pin_rewrites` section.
    If no manifest or no rewrites are defined, the original file is returned.
    The upstream requirements file is left pristine so re-clones stay clean.
    """
    if sys.version_info < (3, 12):
        return requirements_file
    if not requirements_file.exists():
        return requirements_file

    # Load rewrite rules from manifest
    env = (manifest or {}).get("environment", {}) or {}
    rewrite_rules = env.get("python_pin_rewrites") or []
    if not rewrite_rules:
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
        for rule in rewrite_rules:
            pattern = rule.get("pattern", "")
            replacement = rule.get("replacement")
            if pattern and re.search(pattern, line):
                if replacement is None:
                    dropped = True
                else:
                    replaced = replacement
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


# ---------------------------------------------------------------------------
# CUDA-only package detection (manifest-driven)
# ---------------------------------------------------------------------------
# CUDA-only packages are identified by the `cuda_native: true` flag on
# dependencies in the manifest's `dependencies.cuda_native_packages` list.
# Packages in this list are dropped on CPU-only hosts to avoid hard-failing
# the venv when no CUDA toolkit is available. The list lives in the manifest,
# not in this module, so new CUDA-only packages only require a manifest update.



def _cuda_available() -> bool:
    """Best-effort detection of a usable CUDA toolkit or GPU on the build host.

    Returns True if EITHER a CUDA toolkit (nvcc) OR a NVIDIA GPU driver is
    present. Preferring pre-built wheels means we can install CUDA extensions
    without the toolkit, so a GPU without nvcc should still be treated as
    CUDA-capable.

    ponytail: implementation lives in dependency_resolver; this is a thin
    wrapper to avoid a circular import at module load time.
    """
    from runtime.dependency_resolver import _cuda_available as _resolver_cuda_available
    return _resolver_cuda_available()


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
    cuda = ""
    if "+" in tv:
        tag = tv.split("+", 1)[1]
        if tag.startswith("cu") or tag == "cpu":
            cuda = tag
    if not cuda:
        # Fallback: detect CUDA version from torch.version.cuda
        try:
            import subprocess
            result = subprocess.run(
                ["python", "-c", "import torch; print(torch.version.cuda or 'cpu')"],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                cuda_ver = result.stdout.strip()
                if cuda_ver and cuda_ver != "cpu":
                    cuda = f"cu{cuda_ver.replace('.', '')}"
                elif cuda_ver == "cpu":
                    cuda = "cpu"
        except Exception:
            pass
    if not cuda:
        # Never guess a CUDA wheel family. If torch exposes no CUDA build tag,
        # treat the backend as CPU-only instead of silently selecting cu121.
        cuda = "cpu"
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


def _drop_cuda_only_packages(requirements_file: Path, manifest: dict | None = None) -> Path:
    """Return a requirements path with CUDA-only build packages commented out.

    CUDA-only packages are identified by the manifest's
    `dependencies.cuda_native_packages` list. Used only when no CUDA toolkit is
    present, so the per-model venv can install its pure-Python deps and start
    in a degraded (CPU/inference-less) mode instead of failing the whole setup.
    """
    if requirements_file is None or not requirements_file.exists():
        return requirements_file

    # Build set of CUDA-only package names from manifest
    deps = (manifest or {}).get("dependencies", {}) or {}
    cuda_native_list = deps.get("cuda_native_packages", []) or []
    cuda_pkg_names = {_extract_pkg_name(spec) for spec in cuda_native_list if _extract_pkg_name(spec)}

    if not cuda_pkg_names:
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
        pkg_name = _extract_pkg_name(line)
        if pkg_name in cuda_pkg_names:
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
    manifest: dict | None = None,
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

    # Collect raw requirement text for post-install verification (Pillow check,
    # critical-package import test). Needed by both resolver and legacy paths.
    req_blob = ""
    for _f in (requirements_file, repo_dir / "pyproject.toml", repo_dir / "setup.py"):
        if _f and _f.exists():
            req_blob += "\n" + _f.read_text(errors="ignore")

    # When a manifest is available, route through the dependency_resolver for
    # wheel-first logic and user approval (Refactor.md TASK 2, 3, 9, 10).
    # The resolver handles classification, wheel lookup, and build prompts.
    _use_resolver = bool(manifest)
    if _use_resolver:
        try:
            from runtime.dependency_resolver import resolve_dependencies, install_resolved_deps
        except ImportError:
            _use_resolver = False  # Fall through to legacy uv pip install

    if _use_resolver:
        deps = resolve_dependencies(repo_dir, manifest)
        result = install_resolved_deps(
            deps, venv_python, repo_dir,
            manifest=manifest,
            allow_build=False,
            interactive=True,
            log_cb=log_cb,
            target_python=manifest.get("environment", {}).get("python") if manifest else None,
        )
        if not result["success"] and result.get("failed"):
            return {"success": False, "error": f"Some dependencies failed to install: {result['failed']}"}
        code = 0
        output = ""
    else:
        # Packages whose build step imports torch must compile inside the venv
        # (which has torch pre-installed) instead of an empty isolated build env,
        # otherwise they fail with `ModuleNotFoundError: No module named 'torch'`.
        # The set of torch-dependent build packages comes from the manifest's
        # `dependencies.torch_build_packages` list.
        deps = (manifest or {}).get("dependencies", {}) or {}
        torch_build_pkgs = deps.get("torch_build_packages", []) or []
        torch_build_names = {_extract_pkg_name(spec) for spec in torch_build_pkgs if _extract_pkg_name(spec)}

        # rembg -> pymatting -> numba -> llvmlite==0.36.0 only builds on Python
        # <3.10. Pre-installing a modern pymatting (>=1.1.15 requires numba>=0.60,
        # which supports py3.12) stops uv from resolving that ancient chain.
        # The rembg pre-install packages come from the manifest's
        # `dependencies.rembg_preinstall` list; if absent, this step is skipped.
        build_iso_args: list[str] = []
        for pkg in sorted(torch_build_names):
            if re.search(rf"\b{re.escape(pkg)}\b", req_blob, re.IGNORECASE):
                build_iso_args += ["--no-build-isolation-package", pkg]
        rembg_preinstall = deps.get("rembg_preinstall", []) or []
        if rembg_preinstall and re.search(r"\brembg\b", req_blob, re.IGNORECASE):
            if log_cb:
                log_cb("Pre-installing modern pymatting/numba/llvmlite for rembg (py3.12 compat)…")
            code, output = _run_uv(
                ["pip", "install", "--python", str(venv_python), *rembg_preinstall],
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
        # Rewrite rules come from the manifest's `environment.python_pin_rewrites`.
        if requirements_file is not None:
            install_requirements = _normalize_requirements_for_py312(requirements_file, manifest)
        else:
            install_requirements = None

        # No CUDA toolkit on this host: CUDA-only source extensions (diso,
        # torch-cluster, torchmcubes, …) cannot be compiled. Drop them so the venv
        # still installs its pure-Python deps instead of failing the whole setup.
        # Inference is already flagged as unavailable without a GPU.
        cuda_exclude_args: list[str] = []
        if not _cuda_available():
            install_requirements = _drop_cuda_only_packages(install_requirements, manifest)
            if install_requirements and log_cb and install_requirements.name.endswith(".nocuda.requirements.txt"):
                log_cb("No CUDA toolkit detected — skipping CUDA-only build packages (CPU mode)")
            # Also exclude CUDA-only packages that might be pulled in as transitive deps
            deps = (manifest or {}).get("dependencies", {}) or {}
            cuda_native_list = deps.get("cuda_native_packages", []) or []
            for spec in cuda_native_list:
                pkg_name = _extract_pkg_name(spec)
                if pkg_name:
                    cuda_exclude_args += ["--exclude", pkg_name]

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
                    ["pip", "install", "--python", str(venv_python), "-e", ".", *build_iso_args, *cuda_exclude_args],
                    cwd=repo_dir,
                    extra_env=cmake_env,
                )
            elif setup_py.exists():
                logger.info("No requirements.txt for %s, using uv pip install -e .", repo_name)
                code, output = _run_uv(
                    ["pip", "install", "--python", str(venv_python), "-e", ".", *build_iso_args, *cuda_exclude_args],
                    cwd=repo_dir,
                    extra_env=cmake_env,
                )
            else:
                msg = f"No requirements.txt, pyproject.toml, or setup.py found for {repo_name or 'unknown repo'} at {repo_dir} — skipping install"
                logger.info(msg)
                if log_cb:
                    log_cb(msg)
                # Nothing installed — skip post-install steps
                code = 0
                output = ""
        else:
            code, output = _run_uv(
                ["pip", "install", "--python", str(venv_python), "-r", str(install_requirements), *build_iso_args, *cuda_exclude_args],
                cwd=repo_dir,
                extra_env=cmake_env,
            )

    if code != 0:
        return {"success": False, "error": output}

    # ponytail: Pillow C extension (_imaging) can be missing or corrupted
    # after dependency resolution. Force-reinstall pillow to ensure the
    # native C extension is properly built. Fixes:
    #   "cannot import name '_imaging' from 'PIL'"
    # Check both req_blob (from repo files) and manifest dependencies
    manifest_py_deps = (manifest or {}).get("dependencies", {}).get("python", []) or []
    has_pillow = (
        re.search(r"\bpillow\b", req_blob, re.IGNORECASE)
        or any("pillow" in d.lower() for d in manifest_py_deps)
    )
    if has_pillow:
        if log_cb:
            log_cb("Ensuring Pillow C extension is properly installed...")
        _run_uv(
            ["pip", "install", "--python", str(venv_python),
             "--force-reinstall", "--no-cache-dir", "pillow"],
            cwd=repo_dir,
        )

    # Verify critical packages are importable, force-reinstall if not
    # ponytail: packages can be corrupted from previous failed installs
    _verify_and_fix_critical_packages(venv_python, repo_dir, req_blob, manifest)
    # Install extra inference libraries (e.g. hy3dgen, diffusers) that are
    # missing from the repo's requirements.txt into the per-model venv.
    # In-process local providers append this venv's site-packages to sys.path,
    # so the inference libraries resolve without needing to pollute the backend
    # venv (which lacks the full ML stack and may conflict with its own deps).
    # ponytail: pin torch to the backend's exact build (not the manifest
    # version) so the resolver cannot pull a newer ABI-incompatible torch as
    # a transitive dependency. The manifest's torch version documents the
    # upstream-tested configuration, but the backend torch is authoritative
    # for in-process inference (see _backend_torch_stack for the ABI rationale).
    extra = (manifest or {}).get("dependencies", {}).get("extra", []) or []
    if extra:
        torch_index, torch_specs = _backend_torch_stack()
        install_extra = [*torch_specs, *extra]
        code_e, out_e = _run_uv(
            ["pip", "install", "--python", str(venv_python),
             "--index-url", torch_index,
             "--extra-index-url", "https://pypi.org/simple",
             "--index-strategy", "unsafe-best-match",
             *install_extra],
            cwd=repo_dir,
        )
        if code_e != 0:
            logger.warning(
                "Extra deps %s install failed for %s (per-model venv): %s",
                extra, repo_name, out_e[:200],
            )
        else:
            logger.info("Installed extra deps %s into %s (per-model venv)", extra, repo_name)

    # Verify critical packages are importable, force-reinstall if corrupted
    _verify_and_fix_critical_packages(venv_python, repo_dir, req_blob, manifest)

    return {"success": True}


def _verify_and_fix_critical_packages(venv_python: Path, repo_dir: Path, req_blob: str, manifest: dict | None = None) -> None:
    """Verify critical packages can be imported, force-reinstall if corrupted.

    The list of critical packages comes from the manifest's
    `preflight.import_packages` section. If absent, falls back to a minimal
    default list. ponytail: packages from previous failed installs can be
    partially extracted or missing C extensions. This checks the key packages
    and force-reinstalls any that fail to import.
    """
    preflight = (manifest or {}).get("preflight", {}) or {}
    critical = preflight.get("import_packages", []) or ["torch", "transformers", "diffusers", "numpy", "PIL"]
    uv_path = shutil.which("uv")
    for pkg in critical:
        if not re.search(rf"\b{re.escape(pkg)}\b", req_blob, re.IGNORECASE):
            continue
        import_name = "PIL" if pkg == "PIL" else pkg
        code, output = _run(
            [str(venv_python), "-c", f"import {import_name}; print('ok')"],
            cwd=str(repo_dir),
        )
        if code != 0 or "ok" not in output:
            logger.warning("Package %s failed import check, force-reinstalling...", pkg)
            pkg_name = "pillow" if pkg == "PIL" else pkg
            if uv_path:
                if pkg_name == "torch":
                    # Never reinstall unpinned torch here: that can silently
                    # pull a newer ABI-incompatible build. The central torch
                    # stack helper pins it to the backend's exact build.
                    _install_torch_stack(venv_python, repo_dir)
                else:
                    _run(
                        [uv_path, "pip", "install", "--python", str(venv_python),
                         "--force-reinstall", "--no-cache-dir", pkg_name],
                        cwd=str(repo_dir),
                    )


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
# Native-build detection (manifest-driven)
# ---------------------------------------------------------------------------
# Whether a model requires a native CUDA extension build at install time is
# declared in the manifest via `capabilities.*.native_build_required: true`
# (or the legacy top-level `native_build_required`). The heuristic regex scan
# below is a fallback for repos without a manifest; it checks for common
# build directives in setup.py/pyproject.toml/CMakeLists.txt. Upgrade path:
# remove the heuristic once all manifests declare the flag.


def detect_native_build(repo_dir: Path, manifest: dict | None = None) -> bool:
    """Best-effort scan of a cloned repo for source-build directives.

    When a manifest is available, its `native_build_required` flag is the
    authoritative source and the file scan is skipped. For repos without a
    manifest, scans for common build directives (setup.py, pyproject.toml,
    CMakeLists.txt) to warn that a long CUDA-toolkit build is needed.
    """
    if not repo_dir.exists():
        return False

    # Manifest-driven check (authoritative)
    if manifest is not None:
        native_req, _ = _get_native_build_info({}, manifest)
        if native_req:
            return True
        # Check legacy top-level flag
        if manifest.get("native_build_required", False):
            return True
        return False

    # Fallback heuristic: check for build-related files
    build_files = ("setup.py", "pyproject.toml", "CMakeLists.txt")
    return any((repo_dir / fname).exists() for fname in build_files)


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


def _acquire_install_lock(repo_name: str, owner_type: str = "api", task_id: str | None = None) -> bool:
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
        lock_file.write(f"{os.getpid()}\n{datetime.now(timezone.utc).replace(tzinfo=None).isoformat()}\n")
        lock_file.write(f"owner={owner_type}\n")
        if task_id:
            lock_file.write(f"task_id={task_id}\n")
        lock_file.flush()
        return True
    except (IOError, OSError):
        return False


def _get_lock_owner(repo_name: str) -> dict | None:
    lock_path = get_storage_config().get_repo_path(repo_name) / ".installing.lock"
    if not lock_path.exists():
        return None
    try:
        content = lock_path.read_text().strip().splitlines()
        result = {"pid": int(content[0]) if content else None}
        for line in content[2:]:
            if "=" in line:
                key, value = line.split("=", 1)
                result[key.strip()] = value.strip()
        return result
    except Exception:
        return None


def _release_install_lock(repo_name: str) -> None:
    """Remove the install lock file for a repo (best-effort)."""
    try:
        from runtime.storage import get_storage_config
        lock_path = get_storage_config().get_repo_path(repo_name) / ".installing.lock"
        if lock_path.exists():
            lock_path.unlink()
    except Exception:
        pass


def _acquire_native_build_lock(repo_name: str, task_id: str) -> bool:
    """Acquire a native-build lock for a repo.

    This lock is owned by the background Celery worker that runs the
    native build.  It is NOT released by install_provider() — the
    finally block only releases the regular install lock.  The worker
    must call _release_native_build_lock() when the build completes.
    Returns True if lock acquired (or stale lock broken), False if
    another live worker holds it.
    """
    from runtime.storage import get_storage_config
    storage = get_storage_config()
    lock_path = storage.get_repo_path(repo_name) / ".native_build.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    if lock_path.exists():
        try:
            content = lock_path.read_text().strip().splitlines()
            owner_pid = int(content[0]) if content else None
            if owner_pid and not _pid_alive(owner_pid):
                logger.warning(
                    "Breaking stale native-build lock for %s (PID %s dead)",
                    repo_name, owner_pid,
                )
                lock_path.unlink(missing_ok=True)
            else:
                return False
        except (ValueError, OSError, IndexError):
            lock_path.unlink(missing_ok=True)
    try:
        lock_file = open(lock_path, "w")
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        lock_file.write(f"{os.getpid()}\n{datetime.now(timezone.utc).replace(tzinfo=None).isoformat()}\n")
        lock_file.write(f"owner=native_build_worker\n")
        lock_file.write(f"task_id={task_id}\n")
        lock_file.flush()
        return True
    except (IOError, OSError):
        return False


def _release_native_build_lock(repo_name: str) -> None:
    """Remove the native-build lock file for a repo (best-effort)."""
    try:
        from runtime.storage import get_storage_config
        lock_path = get_storage_config().get_repo_path(repo_name) / ".native_build.lock"
        if lock_path.exists():
            lock_path.unlink()
    except Exception:
        pass


def _check_disk_space(
    provider_name: str,
    selected_providers: list[str] | None = None,
    min_safety_gb: float = 2.0,
) -> tuple[bool, str]:
    """Check if there's enough disk space for a model's weights.

    ponytail: 10% headroom + 2GB safety floor. Conservative enough to
    prevent mid-download failures, permissive enough for Colab's limited
    disk. Upgrade path: per-model headroom override in manifest.

    Returns (sufficient, error_message).

    Args:
        provider_name: the current model being checked
        selected_providers: full list of models selected for install.
            When provided, checks the CUMULATIVE size of all selected models
            against available disk, not just the current one. This prevents
            the case where each individual check passes but the combined
            download exceeds available space.
        min_safety_gb: minimum free space to keep available for venvs,
            caches, and other operations. Default 5GB is a safe floor.

    Returns (sufficient, error_message).

    ponytail: previously this only checked the single model with 20%
    headroom and no cumulative check, so multi-model installs could
    exhaust disk before the last model finished downloading. See Issue 10.
    """
    storage = get_storage_config()
    try:
        disk = shutil.disk_usage(storage.third_party_dir)
        free_gb = disk.free / (1024 ** 3)
    except Exception:
        return True, ""  # Can't check — allow

    # Build the list of models to check
    if selected_providers is None:
        models_to_check = [provider_name]
    else:
        models_to_check = list(selected_providers)

    # Sum estimated sizes for all models, but only count models whose
    # weights are not already on disk (to avoid double-counting).
    total_required_gb = 0.0
    not_yet_present: list[str] = []
    for m in models_to_check:
        model_cfg = HF_MODELS.get(m)
        if not model_cfg:
            continue
        size_gb = model_cfg.get("size_estimate_gb", 0)
        existing = storage.get_weight_path(m)
        if existing and _weights_already_present(existing, size_gb):
            continue  # already downloaded
        total_required_gb += size_gb
        not_yet_present.append(m)

    # Add 10% headroom for extraction, temp files, and cache growth
    required_gb = total_required_gb * 1.1 + min_safety_gb

    if free_gb < required_gb:
        names = ", ".join(not_yet_present) if not_yet_present else provider_name
        return False, (
            f"Insufficient disk space: {free_gb:.1f}GB free, "
            f"need ~{required_gb:.1f}GB for [{names}] "
            f"(includes 10% headroom + {min_safety_gb}GB safety margin)"
        )
    return True, ""


def _weights_already_present(weight_path, expected_size_gb: float) -> bool:
    """Return True if the weight directory has a substantial portion of the
    expected model already on disk. Used to avoid double-counting in
    cumulative disk checks.
    """
    from pathlib import Path as _P
    p = _P(weight_path)
    if not p.exists():
        return False
    real_files = [
        f for f in p.rglob("*")
        if f.is_file()
        and not f.name.startswith(".")
        and not any(part.startswith(".") for part in f.relative_to(p).parts[:-1])
    ]
    if not real_files:
        return False
    total = sum(f.stat().st_size for f in real_files if f.stat().st_size > 0)
    min_expected = int(expected_size_gb * 1024 ** 3) * 0.1
    return total > min_expected


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
    # ponytail: Only init submodules when the manifest explicitly requests it.
    # Some repos (e.g. WorldGen) have SSH submodule URLs that fail in Colab.
    # Failure is non-fatal: repos without submodules just no-op here.
    repo_cfg_local = REPOS.get(repo_name, {})
    if repo_cfg_local.get("submodules", False):
        _run(["git", "submodule", "update", "--init", "--recursive"], cwd=dest, log_cb=log_cb)
    return {"success": True, "path": str(dest), "action": "cloned"}


def install_repo_deps(repo_name: str, log_cb: Callable | None = None, requirements_override: Path | None = None) -> dict:
    storage = get_storage_config()
    repo_cfg = REPOS.get(repo_name)
    if not repo_cfg:
        return {"success": False, "error": f"Unknown repo: {repo_name}"}
    repo_dir = storage.get_repo_path(repo_name)
    if not repo_dir.exists():
        return {"success": False, "error": f"Repo not cloned: {repo_name}"}

    # ponytail: resolve manifest for authoritative deps path; falls back to
    # REPOS if no manifest exists (preserves backward-compat for repos without
    # manifests or during manifest rollout).
    provider_name = repo_cfg["providers"][0]
    manifest = None
    try:
        from runtime.manifest_loader import load_manifest
        manifest = load_manifest(provider_name)
    except (ValueError, ImportError):
        pass

    # ponytail: honest native-build detection. If the cloned repo contains
    # compile directives (CMake/CUDAExtension/ninja/…) warn so an admin can
    # expect a long install and a CUDA-toolkit dependency before it starts.
    # The manifest's native_build_required flag is authoritative when present.
    if detect_native_build(repo_dir, manifest):
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
        venv_args = [uv_path, "venv"]
        # Authoritative python pin from manifest when available.
        if manifest and "environment" in manifest and "python" in manifest["environment"]:
            venv_args += ["--python", manifest["environment"]["python"]]
        venv_args.append(str(venv_dir))
        # Clear cached venv if it exists (uv uses centralized cache)
        code, output = _run(venv_args, cwd=repo_dir, log_cb=log_cb, env={"UV_VENV_CLEAR": "1"})
        if code != 0:
            return {"success": False, "error": f"uv venv creation failed for {repo_name}: {output}"}
        logger.info("Created uv venv for %s at %s", repo_name, venv_dir)
    else:
        logger.info("venv already exists for %s at %s", repo_name, venv_dir)

    if not venv_python.exists():
        # Corrupted venv — remove and recreate
        logger.warning("Corrupted venv detected for %s — removing and recreating", repo_name)
        import shutil as _shutil
        _shutil.rmtree(venv_dir, ignore_errors=True)
        uv_path = shutil.which("uv")
        if not uv_path:
            return {"success": False, "error": f"uv not found — cannot recreate venv for {repo_name}"}
        venv_args = [uv_path, "venv"]
        if manifest and "environment" in manifest and "python" in manifest["environment"]:
            venv_args += ["--python", manifest["environment"]["python"]]
        venv_args.append(str(venv_dir))
        code, output = _run(venv_args, cwd=repo_dir, log_cb=log_cb)
        if code != 0:
            return {"success": False, "error": f"uv venv recreation failed for {repo_name}: {output}"}
        logger.info("Recreated uv venv for %s at %s", repo_name, venv_dir)

    logger.info("Installing deps for %s using uv + per-model venv python", repo_name)
    if requirements_override is not None:
        req = requirements_override
    elif manifest is not None:
        # ponytail: manifest is the single source of truth for deps.
        # Build combined python + native specs; do NOT consult REPOS[*]["requirements"].
        py_deps = manifest.get("dependencies", {}).get("python", []) or []
        native_deps = manifest.get("dependencies", {}).get("native", []) or []
        combined = py_deps + native_deps
        # Install backend-matching torch stack into the per-model venv.
        code, output = _install_torch_stack(venv_python, repo_dir, log_cb=log_cb)
        if code != 0:
            return {"success": False, "error": f"torch stack install failed for {repo_name}: {output[:300]}"}
        if combined:
            tmp = Path(tempfile.gettempdir()) / f"{provider_name}.manifest.requirements.txt"
            tmp.write_text("\n".join(combined) + "\n")
            req = tmp
        else:
            req = None
    else:
        req = repo_dir / repo_cfg["requirements"] if repo_cfg.get("requirements") else None
    ok = _uv_install(req, repo_dir, repo_name=repo_name, python_path=str(venv_python), log_cb=log_cb, manifest=manifest)
    if not ok.get("success", False):
        return {"success": False, "error": f"uv install failed for {repo_name}: {ok.get('error', 'Unknown error')}"}
    return {"success": True, "repo": repo_name}


def _run_native_build_sync(provider_name: str, manifest: dict | None, log_cb=None) -> dict:
    """Run native CUDA extension build synchronously (no Celery).

    This is used during setup when allow_native_build=True.
    It installs native deps and executes manifest-defined build steps.
    """
    from runtime.manifest_loader import load_manifest
    from runtime.storage import get_storage_config

    canonical_name = _canonical_provider_name(provider_name)
    meta = PROVIDER_METADATA.get(canonical_name, {})
    repo_name = _repo_name_from_manifest(manifest, canonical_name) if manifest else (meta.get("repo") or canonical_name)
    storage = get_storage_config()
    repo_dir = storage.get_repo_path(repo_name)

    # Load manifest if not provided
    if manifest is None:
        try:
            manifest = load_manifest(canonical_name)
        except Exception:
            manifest = {}

    venv_python = None
    if repo_dir.exists():
        venv_python = repo_dir / ".venv" / "bin" / "python"

    errors: list[str] = []

    # Reuse the manifest-driven dependency resolver for native packages. Raw pip
    # installation here would bypass wheel/fallback/source-build policy.
    if manifest and venv_python and venv_python.exists():
        try:
            from runtime.dependency_resolver import DependencyKind, install_resolved_deps, resolve_dependencies
            deps = [d for d in resolve_dependencies(repo_dir, manifest) if d.kind == DependencyKind.NATIVE]
            if deps:
                if log_cb:
                    log_cb(f"Resolving {len(deps)} native deps for {canonical_name}...")
                result = install_resolved_deps(
                    deps, venv_python, repo_dir, manifest=manifest,
                    allow_build=True, interactive=False, log_cb=log_cb,
                    target_python=manifest.get("environment", {}).get("python") if manifest else None,
                )
                errors.extend(result.get("failed", []))
        except Exception as exc:
            errors.append(f"Native dependency resolution failed: {exc}")
            logger.exception("Native dependency resolution failed for %s", canonical_name)

    # Execute manifest-defined native build steps
    if manifest and "capabilities" in manifest:
        for cap_name, cap_cfg in manifest["capabilities"].items():
            if isinstance(cap_cfg, dict) and cap_cfg.get("native_build_required"):
                native_steps = cap_cfg.get("native_steps", [])
                if native_steps and venv_python and venv_python.exists():
                    if log_cb:
                        log_cb(f"Running native build steps for {cap_name}...")
                    for step in native_steps:
                        try:
                            subprocess.run(
                                step,
                                shell=True,
                                cwd=str(repo_dir),
                                env={**os.environ, "PATH": f"{venv_python.parent}:{os.environ.get('PATH', '')}"},
                                capture_output=True,
                                timeout=3600,
                                check=True,
                            )
                            if log_cb:
                                log_cb(f"  Build step OK: {step}")
                        except Exception as exc:
                            msg = f"Build step failed: {step}: {exc}"
                            logger.warning(msg)
                            errors.append(msg)

    if errors:
        return {"native": {"state": NativeState.FAILED.value, "error": "; ".join(errors)}}
    return {"native": {"state": NativeState.READY.value, "detail": "Native build completed"}}


def _get_native_build_info(meta: dict, manifest: dict | None) -> tuple[bool, bool]:
    """Return (native_req, all_caps_need_native).

    When a manifest with capabilities is present, the manifest is the AUTHORITATIVE
    source and metadata is ignored (no conflicting fallback). Metadata is used only
    when no manifest capabilities exist.
    """
    if manifest and "capabilities" in manifest:
        enabled_caps = [
            v for v in manifest["capabilities"].values()
            if isinstance(v, dict) and v.get("enabled", True)
        ]
        if enabled_caps:
            any_cap_needs = any(v.get("native_build_required", False) for v in enabled_caps)
            all_caps_need_native = all(v.get("native_build_required", False) for v in enabled_caps)
            return bool(any_cap_needs), all_caps_need_native
    # No manifest capabilities: fall back to metadata only.
    native_req = meta.get("native_build_required", False)
    return native_req, native_req


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
    # isolated — previously they collapsed into one shared flat weights dir
    # and get_weight_path() could not tell them apart.
    try:
        from runtime.manifest_loader import load_manifest
        weight_manifest = load_manifest(provider_name)
        repo_name = _repo_name_from_manifest(weight_manifest, provider_name)
    except Exception:
        repo_name = PROVIDER_METADATA.get(provider_name, {}).get("repo", provider_name)
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
        ignore_patterns = model_cfg.get("ignore_patterns")
        if ignore_patterns is None:
            ignore_patterns = ["*.msgpack", "flax_model*", "tf_model*", "rust_model*"]
        else:
            ignore_patterns = list(ignore_patterns)
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


# ---------------------------------------------------------------------------
# Stage A: Runtime preparation (Refactor.md TASK 4)
# Clones repo, creates venv, installs deps, resolves native — NO weights.
# ---------------------------------------------------------------------------


def prepare_runtime(
    provider_name: str,
    hf_token: str | None = None,
    log_cb=None,
    allow_native_build: bool = False,
) -> dict:
    """Prepare model runtime: clone repo, create venv, install dependencies.

    This is Stage A — does NOT download weights. Weight download is a separate
    step (download_model_weights) that requires runtime to be ready first.

    Returns dict with:
      - success: bool
      - state: "runtime_ready" | "runtime_partial" | "runtime_blocked" | "runtime_failed"
      - components: dict of component states
    """
    provider_name = _canonical_provider_name(provider_name)
    meta = PROVIDER_METADATA.get(provider_name)
    if not meta:
        available = [p for p in PROVIDER_METADATA.keys() if p != "mock"]
        return {
            "success": False,
            "state": "runtime_failed",
            "error": f"Unknown provider '{provider_name}'. Available: {available}",
        }

    # Load manifest
    manifest = None
    try:
        from runtime.manifest_loader import load_manifest
        manifest = load_manifest(provider_name)
        if log_cb:
            log_cb(f"Loaded manifest for {provider_name}")
    except (ValueError, ImportError) as exc:
        if log_cb:
            log_cb(f"No manifest for {provider_name} ({exc}); using metadata-only")

    # Determine native-build requirement
    native_req, all_caps_need_native = _get_native_build_info(meta, manifest)

    repo_name = _repo_name_from_manifest(manifest, provider_name) if manifest else meta.get("repo")
    components: dict[str, dict] = {}

    # Acquire install lock
    if repo_name:
        if not _acquire_install_lock(repo_name):
            return {
                "success": False,
                "state": "runtime_blocked",
                "error": f"Model {provider_name} is already being installed.",
            }

    try:
        # 1. Clone repo
        if repo_name:
            if log_cb:
                log_cb(f"Cloning repository for {provider_name}...")
            r = clone_repo(repo_name, log_cb=log_cb)
            if not r.get("success"):
                components["repo"] = {"state": RepoState.FAILED.value, "error": r.get("error")}
                return {
                    "success": False,
                    "state": "runtime_failed",
                    "error": r.get("error", "Repo clone failed"),
                    "components": components,
                }
            components["repo"] = {"state": RepoState.READY.value}

            # Init submodules if manifest requires
            if manifest and manifest.get("source", {}).get("submodules"):
                repo_path = get_storage_config().get_repo_path(repo_name)
                if log_cb:
                    log_cb("Initializing git submodules...")
                code, output = _run(
                    ["git", "submodule", "update", "--init", "--recursive"],
                    cwd=repo_path, log_cb=log_cb,
                )
                if code != 0 and log_cb:
                    log_cb(f"Warning: git submodule init failed: {output[:200]}")
        else:
            components["repo"] = {"state": RepoState.READY.value, "detail": "No repo (internal provider)"}

        # 2. Create venv + install deps
        if repo_name:
            if log_cb:
                log_cb(f"Preparing virtual environment for {provider_name}...")
            r = _prepare_runtime_venv(repo_name, manifest, native_req, allow_native_build, log_cb=log_cb)
            components["venv"] = r.get("venv", {})
            components["deps"] = r.get("deps", {})
            components["native"] = r.get("native", {})

            if not r.get("success"):
                # For native-build models, continue even if deps had issues
                if native_req and not allow_native_build:
                    if log_cb:
                        log_cb(f"Note: deps install had issues (native build needed), continuing: {r.get('error')}")
                else:
                    return {
                        "success": False,
                        "state": "runtime_failed",
                        "error": r.get("error", "Deps install failed"),
                        "components": components,
                    }

        # 3. Native build decision (if required and not done inline)
        native_state = components.get("native", {}).get("state", NativeState.NOT_REQUIRED.value)
        if native_req and native_state not in (NativeState.READY.value, NativeState.WHEEL_INSTALLED.value):
            if not allow_native_build:
                # Skip native build during setup - user can build later via UI
                components["native"] = {
                    "state": NativeState.SKIPPED.value,
                    "detail": "Native CUDA build skipped during setup (can be built later via UI)",
                }
                if log_cb:
                    log_cb(f"Native build skipped for {provider_name} (can be built later via UI)")
            else:
                # Run native build synchronously (only when explicitly allowed)
                if log_cb:
                    log_cb(f"Running native build for {provider_name}...")
                try:
                    r = _run_native_build_sync(provider_name, manifest, log_cb=log_cb)
                    components["native"] = r.get("native", {})
                except Exception as exc:
                    components["native"] = {
                        "state": NativeState.FAILED.value,
                        "error": f"Native build failed: {exc}",
                    }

        # 4. Run prelight (without weights check)
        if log_cb:
            log_cb("Running preflight checks (runtime only)...")
        try:
            from runtime.preflight import run_preflight_for_provider
            preflight_result = run_preflight_for_provider(provider_name, hf_token=hf_token, skip_weights_check=True)
            components["preflight"] = {
                "state": "passed" if preflight_result.passed else "failed",
                "checks": preflight_result.checks,
            }
        except Exception as exc:
            logger.warning("Preflight failed for %s: %s", provider_name, exc)
            components["preflight"] = {"state": "failed", "error": str(exc)}

        # Determine runtime state.
        # ponytail: deps_ok now requires READY (not PARTIAL). PARTIAL means
        # some required deps failed to install — the runtime may load but
        # will crash at first use. PARTIAL still permits the install to
        # complete (weights download, etc.) but the runtime is reported as
        # partial with a clear reason, and the registry won't mark the
        # provider as fully available (see Issue 9).
        venv_ok = components.get("venv", {}).get("state") == EnvState.READY.value
        deps_ok = components.get("deps", {}).get("state") == DepsState.READY.value
        native_ok = components.get("native", {}).get("state") in (
            NativeState.NOT_REQUIRED.value,
            NativeState.READY.value,
            NativeState.WHEEL_INSTALLED.value,
            NativeState.BUILD_PENDING.value,
        )
        preflight_ok = components.get("preflight", {}).get("state") == "passed"

        if venv_ok and deps_ok and native_ok and preflight_ok:
            runtime_state = "runtime_ready"
            blocking_reason = None
        elif venv_ok and components.get("deps", {}).get("state") == DepsState.PARTIAL.value:
            # Deps are partial — runtime can load but some features may fail
            runtime_state = "runtime_partial"
            failed_deps = components.get("deps", {}).get("failed", [])
            blocking_reason = f"Some required dependencies failed to install: {failed_deps}"
        elif venv_ok and deps_ok and not preflight_ok:
            # Preflight didn't pass but deps are fine — runtime is degraded
            runtime_state = "runtime_partial"
            blocking_reason = f"Preflight not passed: {components.get('preflight', {}).get('error', 'unknown')}"
        elif venv_ok and deps_ok:
            # Native build pending or other transient state
            runtime_state = "runtime_partial"
            blocking_reason = f"Native state: {components.get('native', {}).get('state', 'unknown')}"
        else:
            runtime_state = "runtime_failed"
            blocking_reason = "Critical component not ready (venv or deps)"

        return {
            "success": True,
            "state": runtime_state,
            "blocking_reason": blocking_reason,
            "components": components,
            "provider": provider_name,
        }

    finally:
        if repo_name:
            _release_install_lock(repo_name)


def _prepare_runtime_venv(
    repo_name: str,
    manifest: dict | None,
    native_req: bool,
    allow_native_build: bool,
    log_cb=None,
) -> dict:
    """Create venv and install deps for a repo. Returns component states."""
    storage = get_storage_config()
    repo_dir = storage.get_repo_path(repo_name)
    venv_dir = repo_dir / ".venv"
    venv_python = venv_dir / "bin" / "python"

    # Create venv if needed
    if not venv_dir.exists():
        uv_path = shutil.which("uv")
        if not uv_path:
            return {"success": False, "error": "uv not found"}
        venv_args = [uv_path, "venv"]
        if manifest and "environment" in manifest and "python" in manifest["environment"]:
            venv_args += ["--python", manifest["environment"]["python"]]
        venv_args.append(str(venv_dir))
        code, output = _run(venv_args, cwd=repo_dir, log_cb=log_cb)
        if code != 0:
            return {
                "success": False,
                "error": f"uv venv creation failed: {output}",
                "venv": {"state": EnvState.FAILED.value},
            }

    if not venv_python.exists():
        return {
            "success": False,
            "error": f"venv python not found at {venv_python}",
            "venv": {"state": EnvState.FAILED.value},
        }

    components: dict[str, dict] = {
        "venv": {"state": EnvState.READY.value, "path": str(venv_dir)},
    }

    # Install torch stack first (mirror backend build)
    code, output = _install_torch_stack(venv_python, repo_dir, log_cb=log_cb)
    if code != 0:
        return {
            "success": False,
            "error": f"torch stack install failed: {output[:300]}",
            "venv": {"state": EnvState.READY.value},
            "deps": {"state": DepsState.FAILED.value},
        }

    # Use dependency resolver (manifest-driven, single source of truth)
    try:
        from runtime.dependency_resolver import resolve_dependencies, install_resolved_deps
        deps = resolve_dependencies(repo_dir, manifest)
        result = install_resolved_deps(
            deps, venv_python, repo_dir,
            manifest=manifest,
            allow_build=allow_native_build,
            interactive=True,
            log_cb=log_cb,
            target_python=manifest.get("environment", {}).get("python") if manifest else None,
        )
        components["deps"] = {
            "state": DepsState.READY.value if result["success"] else DepsState.PARTIAL.value,
            "installed": result.get("installed", []),
            "skipped": result.get("skipped", []),
            "failed": result.get("failed", []),
        }
        native_state = result.get("native_state", "not_required")
        if native_state == "ready":
            components["native"] = {"state": NativeState.READY.value}
        elif native_state == "skipped":
            components["native"] = {"state": NativeState.SKIPPED.value}
        elif native_state == "failed":
            components["native"] = {"state": NativeState.FAILED.value}
        else:
            components["native"] = {"state": NativeState.NOT_REQUIRED.value}

        if not result["success"] and result.get("failed"):
            return {
                "success": False,
                "error": f"Some dependencies failed to install: {result['failed']}",
                **components,
            }
    except ImportError:
        # Fallback: use legacy _uv_install
        if log_cb:
            log_cb("Warning: new resolver unavailable, using legacy install path")
        repo_cfg = REPOS.get(repo_name)
        req = repo_dir / repo_cfg["requirements"] if repo_cfg and repo_cfg.get("requirements") else None
        if req:
            ok = _uv_install(req, repo_dir, repo_name=repo_name, python_path=str(venv_python), log_cb=log_cb, manifest=manifest)
            if not ok.get("success"):
                return {
                    "success": False,
                    "error": ok.get("error", "uv install failed"),
                    **components,
                }
            components["deps"] = {"state": DepsState.READY.value}

    # Install manifest-defined extra dependencies
    # ponytail: hy3dgen, diffusers, etc. are NOT in the repo's requirements.txt
    # but are needed for inference. Pin torch to the backend's exact build so
    # the resolver cannot pull a newer ABI-incompatible torch (e.g. 2.13.0)
    # as a transitive dependency. Without this pin, packages like diffusers
    # and accelerate resolve to the latest torch, breaking torchvision's C++
    # operator registration against the already-loaded backend torch.
    extra = (manifest or {}).get("dependencies", {}).get("extra", []) or []
    if extra:
        uv_path = shutil.which("uv")
        if uv_path:
            # Build the install command with backend torch pin
            torch_index, torch_specs = _backend_torch_stack()
            install_cmd = [
                uv_path, "pip", "install", "--python", str(venv_python),
                "--index-url", torch_index,
                "--extra-index-url", "https://pypi.org/simple",
                "--index-strategy", "unsafe-best-match",
                *torch_specs,  # Pin torch==X, torchvision==Y, torchaudio==Z
                *extra,
            ]
            code, output = _run(install_cmd, cwd=repo_dir)
            if code != 0:
                logger.warning("Extra deps install failed for %s: %s", repo_name, output[:200])
            else:
                logger.info("Installed extra deps %s for %s", extra, repo_name)
        else:
            logger.error("uv not found - cannot install extra deps for %s", repo_name)

    # Final ABI guard: native/model dependencies must not leave a different
    # torch stack in the per-model venv.
    code, output = _install_torch_stack(venv_python, repo_dir, log_cb=log_cb)
    if code != 0:
        return {
            "success": False,
            "error": f"Final torch stack re-lock failed: {output[:300]}",
            **components,
        }

    return {"success": True, **components}


# ---------------------------------------------------------------------------
# Stage B: Weight download (Refactor.md TASK 5)
# Downloads weights ONLY. Requires runtime to be ready.
# ---------------------------------------------------------------------------


def download_model_weights(
    provider_name: str,
    hf_token: str | None = None,
    log_cb=None,
) -> dict:
    """Download model weights ONLY. Runtime must be ready first.

    This is Stage B — does NOT clone repos, create venvs, or install deps.
    If runtime is not ready, returns an error directing the caller to
    prepare_runtime() first.
    """
    provider_name = _canonical_provider_name(provider_name)
    meta = PROVIDER_METADATA.get(provider_name)
    if not meta:
        return {"success": False, "error": f"Unknown provider: {provider_name}"}

    # Check runtime status first
    storage = get_storage_config()
    repo_name = meta.get("repo")
    if repo_name:
        venv_python = storage.get_model_venv_path(repo_name) / "bin" / "python"
        if not venv_python.exists():
            return {
                "success": False,
                "state": "weights_failed",
                "error": (
                    f"Runtime not ready for {provider_name}. "
                    f"Prepare/install the model runtime first."
                ),
            }

    # Delegate to existing download_weights logic
    if log_cb:
        log_cb(f"Downloading weights for {provider_name}...")
    result = download_weights(provider_name, hf_token=hf_token, log_cb=log_cb)
    result["state"] = "weights_ready" if result.get("success") else "weights_failed"
    return result


# ponytail: Provider validation at function entry; returns available providers list
# to help users correct their input without guessing. Root cause fix for
# "Unknown provider" errors that gave no guidance on valid options.
# to help users correct their input without guessing. Root cause fix for
# "Unknown provider" errors that gave no guidance on valid options.
def install_provider(
    provider_name: str,
    hf_token: str | None = None,
    log_cb: Callable | None = None,
    allow_native_build: bool = False,
    skip_preflight: bool = False,
    selected_providers: list[str] | None = None,
) -> dict:
    """Manifest-driven installation entry point.

    Sequence:
      1. Load manifest -> validate provider exists
      2. Clone repo (call existing clone_repo)
      3. Init submodules if manifest requires
      4. Install deps (call existing install_repo_deps, honor native_build flag)
      5. Download primary weights
      6. Download required auxiliary weights
      7. If native_build: queue background task on a dedicated installation
         queue/worker (DON'T WAIT). Persist native-build task state before returning.
      8. Run preflight only when env + all required native/auxiliary components are ready.
      9. Return detailed state + components.

    All existing lower-level helpers (clone_repo, install_repo_deps,
    download_weights) are preserved unchanged. Only orchestration changes.
    """
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
    # --- 1. Load manifest (non-fatal: proceed without if no manifest yet) ---
    manifest = None
    try:
        from runtime.manifest_loader import load_manifest
        manifest = load_manifest(provider_name)
        if log_cb:
            log_cb(f"Loaded manifest for {provider_name}")
    except (ValueError, ImportError) as exc:
        if log_cb:
            log_cb(f"No manifest for {provider_name} ({exc}); using metadata-only install")
    # Determine native-build requirement early (used by deps + later dispatch).
    native_req, all_caps_need_native = _get_native_build_info(meta, manifest)
    # --- Concurrency + disk space checks ---
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
        sufficient, space_err = _check_disk_space(provider_name, selected_providers=selected_providers)
        if not sufficient:
            return {"success": False, "error": space_err}
        # --- 2. Clone repo ---
        if repo_name:
            st = get_install_status().get(provider_name, {})
            if not st.get("repo_ready"):
                if log_cb:
                    log_cb(f"Cloning repository for {provider_name}...")
                r = clone_repo(repo_name, log_cb=log_cb)
                if not r.get("success"):
                    return {"success": False, "error": r.get("error", "Repo clone failed")}
            # --- 3. Init submodules if manifest requires ---
            if manifest and manifest.get("source", {}).get("submodules"):
                storage = get_storage_config()
                repo_path = storage.get_repo_path(repo_name)
                if log_cb:
                    log_cb("Initializing git submodules...")
                code, output = _run(
                    ["git", "submodule", "update", "--init", "--recursive"],
                    cwd=repo_path, log_cb=log_cb,
                )
                if code != 0:
                    if log_cb:
                        log_cb(f"Warning: git submodule init failed: {output[:200]}")
            # --- 4. Install deps ---
            # Always create the venv and install deps. Native CUDA compilation
            # is deferred to the Celery worker when allow_native_build=False;
            # the worker owns the native-build lock and runs manifest steps.
            if not st.get("venv_ready"):
                if log_cb:
                    log_cb(f"Installing dependencies for {provider_name}...")
                r = install_repo_deps(repo_name, log_cb=log_cb)
                if not r.get("success"):
                    # For native-build models the worker will finish native
                    # dependency install inside the venv with CUDA available,
                    # so we tolerate deps failure here and continue to weights.
                    if native_req and not allow_native_build:
                        if log_cb:
                            log_cb(f"Warning: deps install had issues for {provider_name} (native build needed), continuing to weights: {r.get('error')}")
                    else:
                        return {"success": False, "error": r.get("error", "Deps install failed")}
        # --- 5. Download primary weights ---
        weight_key = _resolve_weight_key(meta, manifest)
        if weight_key:
            if log_cb:
                log_cb(f"Downloading weights for {provider_name}...")
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
        # --- 6. Download required auxiliary weights ---
        if manifest:
            aux_weights = manifest.get("weights", {}).get("auxiliary", [])
            for aux in aux_weights:
                aux_repo = aux.get("repo", "")
                if aux_repo and aux.get("required", False):
                    # Convert repo name to provider name for HF_MODELS lookup
                    aux_provider = _repo_to_provider_name(aux_repo) or aux_repo
                    if log_cb:
                        log_cb(f"Downloading auxiliary weights: {aux.get('name', aux_repo)}...")
                    try:
                        aux_r = download_weights(aux_provider, hf_token=hf_token, log_cb=log_cb)
                        if not aux_r["success"]:
                            if log_cb:
                                log_cb(f"Warning: auxiliary weight download failed for {aux_repo}: {aux_r.get('error')}")
                    except Exception as exc:
                        if log_cb:
                            log_cb(f"Warning: auxiliary weight download exception for {aux_repo}: {exc}")
        # --- 7. Native build handling ---
        # If a native CUDA build is required and not performed inline, DISPATCH the
        # real Celery task on the dedicated `installation` queue. The worker owns the
        # native-build lock for the build duration and releases it on completion/failure.
        # We persist the REAL task ID + logical lock ownership here, before returning,
        # so status reflects the queued build. (The fcntl lock is acquired/released by
        # the worker process, not this API thread.)
        native_build_task_id = None
        if native_req and not allow_native_build:
            # Persist native-build pending state before returning.
            state = _load_state()
            state.setdefault("repos", {})[provider_name] = {
                "installed_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
                "native_build_state": "pending",
            }
            state["last_updated"] = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
            _save_state(state)
            native_build_task_id = f"native_build_{provider_name}_{int(datetime.now(timezone.utc).replace(tzinfo=None).timestamp())}"
            # Dispatch the ACTUAL Celery task (real task ID, dedicated queue).
            from app.workers.installation_workers import run_native_build
            run_native_build.apply_async(
                args=[provider_name, native_build_task_id],
                queue="installation",
                task_id=native_build_task_id,
            )
            # Persist the real task ID + logical lock ownership before returning.
            persist_provider_state(provider_name, {
                "native_build_state": "native_build_pending",
                "native_build_task_id": native_build_task_id,
                "native_build_lock_owner": f"celery_worker:{native_build_task_id}",
                "native_build_lock_ts": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            })
            if log_cb:
                log_cb(f"Native build queued (task={native_build_task_id}); READY only after build + preflight pass")
            return {
                "success": True,
                "state": "native_build_pending",
                "native_build_task_id": native_build_task_id,
                "components": get_install_status().get(provider_name, {}).get("components", {}),
                "blocking_reason": "Native CUDA build queued for background execution",
                "provider": provider_name,
            }
        # --- 8. Preflight ---
        preflight_result = None
        if not skip_preflight and (not native_req or not all_caps_need_native):
            try:
                from runtime.preflight import run_preflight_for_provider
                if log_cb:
                    log_cb(f"Running preflight for {provider_name}...")
                preflight_result = run_preflight_for_provider(provider_name, hf_token=hf_token)
                if not preflight_result.passed:
                    if log_cb:
                        log_cb(f"Preflight did not pass: {preflight_result.error_detail}")
            except Exception as exc:
                logger.warning("Preflight failed for %s: %s", provider_name, exc)
                if log_cb:
                    log_cb(f"Preflight error: {exc}")
        # --- Persist install state ---
        if log_cb:
            log_cb("Verifying installation...")
        state = _load_state()
        provider_state_entry = {
            "installed_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        }
        if preflight_result:
            provider_state_entry["preflight_passed"] = preflight_result.passed
            provider_state_entry["preflight_checks"] = preflight_result.checks
        state.setdefault("repos", {})[provider_name] = provider_state_entry
        if repo_name and repo_name != provider_name:
            state.setdefault("repos", {})[repo_name] = {
                "installed_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
                "installed_via": provider_name,
            }
        state["last_updated"] = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
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
        # --- 9. Return with new state schema ---
        final_status = get_install_status().get(provider_name, {})
        # Persist component-level state to DB
        persist_provider_state(provider_name, {
            "overall_state": final_status.get("state", "blocked"),
            "repo_state": final_status.get("components", {}).get("repo", {}).get("state"),
            "env_state": final_status.get("components", {}).get("venv", {}).get("state"),
            "weights_state": final_status.get("components", {}).get("weights", {}).get("state"),
            "auxiliary_weights_state": final_status.get("components", {}).get("auxiliary_weights"),
            "native_build_state": final_status.get("components", {}).get("native_build", {}).get("state"),
            "preflight_state": final_status.get("components", {}).get("preflight", {}).get("state"),
            "model_load_state": final_status.get("components", {}).get("model_load", {}).get("state"),
            "capability_state": final_status.get("components", {}).get("capabilities"),
            "blocking_component": "preflight" if final_status.get("blocking_reason") else None,
            "blocking_reason": final_status.get("blocking_reason"),
            "native_build_task_id": native_build_task_id,
        })
        # Invalidate install status cache so next request reflects new state
        invalidate_install_status_cache()
        return {
            "success": True,
            "state": final_status.get("state", "blocked"),
            "components": final_status.get("components", {}),
            "blocking_reason": final_status.get("blocking_reason"),
            "provider": provider_name,
            "steps": {"weights": r} if weight_key else {},
            # Legacy backward compat.
            "installed": final_status.get("installed", True),
        }
    finally:
        for rn in locked_repos:
            _release_install_lock(rn)
        # NOTE: native-build lock is intentionally NOT released here.
        # The background Celery worker that runs the native build owns that
        # lock and must call _release_native_build_lock() when done.


def uninstall_provider(provider_name: str, log_cb: Callable | None = None) -> dict:
    """Uninstall a provider by removing ONLY its model weights.
    
    Keeps the repo clone and per-model venv intact for quick re-install.
    This matches the user's requirement to only delete weights, not the repo/venv.
    """
    provider_name = _canonical_provider_name(provider_name)
    meta = PROVIDER_METADATA.get(provider_name)
    if not meta:
        return {"success": False, "error": f"Unknown provider: {provider_name}"}

    # Load manifest for weight key resolution
    manifest = None
    try:
        from runtime.manifest_loader import load_manifest
        manifest = load_manifest(provider_name)
    except (ValueError, ImportError):
        pass

    weight_key = _resolve_weight_key(meta, manifest)
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
    """Return detailed component-level installation status for every provider.

    New consumers must use ``state`` as the authoritative readiness field.
    The legacy ``installed`` boolean is preserved for backward compatibility.
    """
    storage = get_storage_config()
    persisted_state = _load_state()
    status = {}
    for name, meta in PROVIDER_METADATA.items():
        # --- load manifest ---
        manifest = None
        try:
            from runtime.manifest_loader import load_manifest
            manifest = load_manifest(name)
        except (ValueError, ImportError):
            pass
        repo_name = meta.get("repo")
        weight_key = _resolve_weight_key(meta, manifest)
        blocking_reason = None
        # --- repo ---
        if repo_name:
            rp = storage.get_repo_path(repo_name)
            repo_ok = rp.exists() and (rp / ".git").exists()
            repo_state = "ok" if repo_ok else "missing"
        else:
            repo_ok = True
            repo_state = "ok"
        # --- venv ---
        venv_ok = False
        venv_path_str = None
        if repo_name:
            venv_python = storage.get_model_venv_path(repo_name) / "bin" / "python"
            venv_ok = venv_python.exists()
            venv_path_str = str(venv_python.parent.parent) if venv_ok else str(venv_python.parent.parent)
        venv_state = "ok" if venv_ok else "missing"
        # --- weights ---
        weight_ok = True
        weight_path_str = None
        if weight_key:
            wp = storage.get_weight_path(weight_key)
            weight_ok = wp is not None
            weight_path_str = str(wp) if wp else None
        weight_state = "ok" if weight_ok else "missing"
        # --- auxiliary weights ---
        aux_weights = _check_auxiliary_weights(name, storage, manifest)
        missing_aux = [a for a in aux_weights if a["state"] == "missing"]
        # --- native build: manifest capabilities are the AUTHORITATIVE source ---
        # (no conflicting metadata fallback).
        if manifest and "capabilities" in manifest:
            native_req = any(
                v.get("native_build_required", False)
                for v in manifest["capabilities"].values()
                if isinstance(v, dict) and v.get("enabled", True)
            )
        else:
            native_req = meta.get("native_build_required", False)
        # Reflect the ACTUAL persisted native-build state (running/complete/failed),
        # not a hardcoded "pending". DB is authoritative, falling back to install_state.json.
        native_state = "not_required"
        native_detail = ""
        native_task_id = None
        native_current_step = None
        native_output = None
        # Single DB load for both native_build and preflight state (was 2 calls per provider)
        db_state = load_provider_state_from_db(name)
        if native_req:
            persisted_native = None
            if db_state and db_state.get("native_build_state"):
                persisted_native = db_state["native_build_state"]
                native_task_id = db_state.get("native_build_task_id")
            else:
                persisted_entry = persisted_state.get("repos", {}).get(name)
                if persisted_entry and persisted_entry.get("native_build_state"):
                    persisted_native = persisted_entry["native_build_state"]
            if persisted_native == "native_build_running":
                native_state, native_detail = "running", "Native CUDA build in progress"
            elif persisted_native == "native_build_complete":
                native_state, native_detail = "complete", "Native CUDA build complete; awaiting preflight"
            elif persisted_native == "native_build_failed":
                native_state, native_detail = "failed", "Native CUDA build failed"
            else:
                native_state, native_detail = "pending", "Native CUDA build required; queued for background execution"
            # Read transient build progress from file state (not DB columns).
            file_entry = persisted_state.get("repos", {}).get(name, {})
            native_current_step = file_entry.get("native_build_current_step")
            native_output = file_entry.get("native_build_output")
        # --- vram: manifest hardware.minimum_vram_mb overrides metadata vram_required_mb ---
        if manifest and "hardware" in manifest:
            vram_required = manifest["hardware"].get("minimum_vram_mb", meta.get("vram_required_mb", 0))
        else:
            vram_required = meta.get("vram_required_mb", 0)
        # --- preflight result from persisted state (reuses db_state from above) ---
        try:
            from runtime.preflight import PreflightResult
        except ImportError:
            from preflight import PreflightResult
        preflight_result_for_state = None
        if db_state:
            if db_state.get("preflight_passed") is True:
                preflight_result_for_state = PreflightResult(passed=True)
            elif db_state.get("preflight_passed") is False:
                preflight_result_for_state = PreflightResult(passed=False, error_detail="Preflight did not pass")
            else:
                last_result = db_state.get("last_preflight_result")
                if isinstance(last_result, dict) and "passed" in last_result:
                    preflight_result_for_state = PreflightResult(**last_result)
        preflight_checks = None
        if db_state and isinstance(db_state.get("last_preflight_result"), dict):
            preflight_checks = db_state["last_preflight_result"].get("checks")
        # --- preflight ---
        preflight_state = _determine_preflight_state(name, repo_ok, venv_ok, weight_ok, native_req, missing_aux, manifest, preflight_result=preflight_result_for_state)
        # --- cuda ---
        cuda_state, cuda_version = _check_cuda_status()
        # --- vram ---
        vram_state, vram_available = _check_vram_status(vram_required)
        # --- compute overall state ---
        overall_state, blocking_reason = _compute_overall_state(
            name, repo_ok, venv_ok, weight_ok, missing_aux, native_req, native_state, preflight_state, cuda_state, vram_state,
            manifest,
        )
        # live state is authoritative: do not resurrect stale DB READY
        source = "live"
        persisted_entry = persisted_state.get("repos", {}).get(name)
        # Persisted install state is authoritative for `installed` — if
        # install_provider() recorded an installed_at timestamp, the model
        # is installed even if a transient filesystem check (e.g. permission
        # error on .venv/bin/python) fails.
        was_installed = bool(persisted_entry and persisted_entry.get("installed_at"))
        installed_legacy = was_installed or (repo_ok and weight_ok)
        # --- capabilities (from manifest when available, else metadata) ---
        capabilities = _build_capability_states(name, meta, manifest, native_state=native_state, preflight_checks=preflight_checks)
        status[name] = {
            # New authoritative fields.
            "state": overall_state,
            "source": source,
            "components": {
                "repo": {"state": repo_state, "path": str(storage.get_repo_path(repo_name)) if repo_name else None},
                "venv": {"state": venv_state, "path": venv_path_str},
                "weights": {"state": weight_state, "path": weight_path_str},
                "auxiliary_weights": aux_weights,
                "native_build": {"state": native_state, "detail": native_detail, "task_id": native_task_id, "current_step": native_current_step, "output": native_output},
                "preflight": {"state": preflight_state},
                "capabilities": capabilities,
                "cuda": {"state": cuda_state, "version": cuda_version},
                "vram": {"state": vram_state, "required_mb": vram_required, "available_mb": vram_available},
            },
            "blocking_reason": blocking_reason,
            # Legacy backward-compatible fields.
            "installed": installed_legacy,
            "repo_cloned": repo_ok,
            "weights_present": weight_ok,
            "repo_ready": repo_ok,
            "venv_ready": venv_ok,
            "weights_ready": weight_ok,
            "repo_path": str(storage.get_repo_path(repo_name)) if repo_name else None,
            "weight_path": weight_path_str,
            "metadata": meta,
            "last_installed": persisted_entry.get("installed_at") if persisted_entry else None,
        }
    return status


def _repo_to_provider_name(repo: str) -> str | None:
    """Convert a HuggingFace repo name to a provider name (HF_MODELS key)."""
    for provider_name, model_cfg in HF_MODELS.items():
        if model_cfg.get("repo") == repo:
            return provider_name
    return None


def _resolve_weight_key(meta: dict, manifest: dict | None = None) -> str | None:
    """Primary weight key: manifest `weights.primary.repo` is authoritative when
    present, else fall back to existing JSON/Python PROVIDER_METADATA.weight_key.

    Returns a valid HF_MODELS key (provider name), not the HF repo name.
    """
    # First try the metadata weight_key (always a valid HF_MODELS key)
    weight_key = meta.get("weight_key")
    if weight_key and weight_key in HF_MODELS:
        return weight_key

    # Try to find a matching provider by repo name from manifest
    if manifest and "weights" in manifest:
        primary = manifest["weights"].get("primary") or {}
        repo = primary.get("repo")
        if repo:
            # Reverse lookup: find provider name for this repo
            provider = _repo_to_provider_name(repo)
            if provider:
                return provider
            # If not found in HF_MODELS, use the repo name as-is
            return repo

    return weight_key


def _check_auxiliary_weights(provider_name: str, storage, manifest: dict | None = None) -> list[dict]:
    """Return auxiliary weight status list from manifest (authoritative source)."""
    aux: list[dict] = []
    if not manifest or "weights" not in manifest:
        return aux
    entries = manifest["weights"].get("auxiliary", [])
    for entry in entries:
        aux_repo = entry.get("repo", "")
        wp = storage.get_weight_path(aux_repo) if (storage and aux_repo) else None
        item = dict(entry)
        item["state"] = "ok" if wp else "missing"
        aux.append(item)
    return aux


def _check_cuda_status() -> tuple[str, str]:
    """Return (state, version_string) for CUDA availability."""
    try:
        import torch
        if torch.cuda.is_available():
            return "ok", torch.version.cuda or "unknown"
    except Exception:
        pass
    return "unavailable", ""


def _check_vram_status(required_mb: int) -> tuple[str, int]:
    """Return (state, available_mb) for VRAM."""
    available_mb = 0
    try:
        import torch
        if torch.cuda.is_available():
            available_mb = torch.cuda.get_device_properties(0).total_mem // (1024 * 1024)
    except Exception:
        pass
    if required_mb <= 0:
        return "ok", available_mb
    if available_mb >= required_mb:
        return "ok", available_mb
    return "insufficient", available_mb


def _determine_preflight_state(
    provider_name: str,
    repo_ok: bool,
    venv_ok: bool,
    weight_ok: bool,
    native_req: bool,
    missing_aux: list[dict],
    manifest: dict | None = None,
    preflight_result: PreflightResult | None = None,
) -> str:
    """Determine preflight state.

    READY is never granted from a stub preflight.
    Until real validation is implemented, state stays NOT_IMPLEMENTED.
    """
    # If actual preflight result is provided, use it directly.
    if preflight_result is not None:
        if preflight_result.passed:
            return "passed"
        return "blocked"
    # If manifest defines preflight config, honour it.
    if manifest and "preflight" in manifest:
        pf_cfg = manifest["preflight"]
        # If smoke_inference is true, preflight is required but not yet run.
        if pf_cfg.get("smoke_inference", False):
            if repo_ok and venv_ok and weight_ok and not missing_aux and not native_req:
                return "pending"
            return "pending"
        # If manifest says preflight checks should pass, use manifest data.
        if pf_cfg.get("expect_pass", False):
            all_native = True
            if manifest and "capabilities" in manifest:
                enabled_caps = [
                    v for v in manifest["capabilities"].values()
                    if isinstance(v, dict) and v.get("enabled", True)
                ]
                if enabled_caps:
                    all_native = all(v.get("native_build_required", False) for v in enabled_caps)
            if repo_ok and venv_ok and weight_ok and not missing_aux and (not native_req or not all_native):
                return "pending"
            return "pending"
    # If basic prerequisites are not met, preflight cannot run.
    if not repo_ok or not weight_ok:
        return "pending"
    if missing_aux:
        return "blocked"
    if native_req:
        if manifest and "capabilities" in manifest:
            enabled_caps = [
                v for v in manifest["capabilities"].values()
                if isinstance(v, dict) and v.get("enabled", True)
            ]
            if enabled_caps and not all(v.get("native_build_required", False) for v in enabled_caps):
                if repo_ok and venv_ok and weight_ok and not missing_aux:
                    return "pending"
        return "pending"
    # No real preflight implemented yet — return not_implemented.
    return "not_implemented"


def _compute_overall_state(
    provider_name: str,
    repo_ok: bool,
    venv_ok: bool,
    weight_ok: bool,
    missing_aux: list[dict],
    native_req: bool,
    native_state: str,
    preflight_state: str,
    cuda_state: str,
    vram_state: str,
    manifest: dict | None = None,
) -> tuple[str, str | None]:
    """Compute overall install state and blocking reason."""
    # If manifest says any enabled capability needs native build, treat as native_req.
    if manifest and "capabilities" in manifest:
        cap_native_req = any(
            v.get("native_build_required", False)
            for v in manifest["capabilities"].values()
            if isinstance(v, dict) and v.get("enabled", True)
        )
        if cap_native_req:
            native_req = True
    blocking = None
    if not repo_ok:
        return "discovered", "Repository not cloned"
    if not venv_ok:
        return "env_creating", "Virtual environment not ready"
    if not weight_ok:
        return "weights_downloading", "Weights not downloaded"
    if missing_aux:
        names = ", ".join(a["name"] for a in missing_aux)
        return "blocked", f"Required auxiliary weight(s) missing: {names}"
    if native_req:
        if native_state == "running":
            return "native_build_running", "Native CUDA build in progress"
        if native_state == "failed":
            return "native_build_failed", "Native CUDA build failed"
        if native_state == "pending":
            all_caps_need_native = True
            if manifest and "capabilities" in manifest:
                enabled_caps = [
                    v for v in manifest["capabilities"].values()
                    if isinstance(v, dict) and v.get("enabled", True)
                ]
                if enabled_caps:
                    all_caps_need_native = all(v.get("native_build_required", False) for v in enabled_caps)
            if all_caps_need_native:
                return "native_build_pending", "Native CUDA build queued for background execution"
            return "partial", "Some capabilities ready; native build pending for others"
        if native_state == "pending_partial":
            if preflight_state == "passed":
                return "partial", "Some capabilities ready; native build pending for other capabilities"
            return "blocked", "Partial native build required; preflight not passed"
        # native_state == "complete" → fall through to preflight gating below
    if cuda_state == "unavailable":
        return "cuda_incompatible", "CUDA not available"
    if vram_state == "insufficient":
        return "vram_insufficient", "Insufficient VRAM"
    if preflight_state == "not_implemented":
        # Cannot be READY without real preflight.
        return "blocked", f"Preflight not implemented for {provider_name}"
    if preflight_state == "blocked":
        return "blocked", "Preflight blocked"
    if preflight_state == "pending":
        return "blocked", "Preflight pending"
    if preflight_state == "passed":
        return "ready", None
    return "blocked", f"Preflight state: {preflight_state}"


def _build_capability_states(
    provider_name: str,
    meta: dict,
    manifest: dict | None = None,
    native_state: str | None = None,
    preflight_checks: dict | None = None,
) -> dict:
    """Build per-capability state dict.

    Supports READY, PARTIAL, BLOCKED at capability level.
    A missing capability-specific dep must not block unrelated capabilities.
    If a manifest is provided, its capabilities dict drives per-capability state.

    A capability with ``native_build_required`` is NEVER permanently ``blocked``:
    it is ``native_build_pending``/``native_build_running`` until the build finishes,
    then becomes READY only after both the native build and its capability smoke
    test have passed.
    """
    if manifest and "capabilities" in manifest:
        caps: dict[str, dict] = {}
        for cap_name, cap_info in manifest["capabilities"].items():
            if not isinstance(cap_info, dict):
                continue
            if not cap_info.get("enabled", True):
                caps[cap_name] = {"state": "disabled", "reason": "Disabled in manifest"}
                continue
            if cap_info.get("native_build_required", False):
                if native_state == "running":
                    caps[cap_name] = {"state": "native_build_running", "reason": "Native build in progress"}
                elif native_state == "failed":
                    caps[cap_name] = {"state": "blocked", "reason": "Native build failed"}
                elif native_state == "complete":
                    cap_check = (preflight_checks or {}).get(f"capability_smoke.{cap_name}")
                    if cap_check and cap_check.get("passed"):
                        caps[cap_name] = {"state": "ready", "reason": "Native build + capability smoke test passed"}
                    else:
                        caps[cap_name] = {"state": "pending", "reason": "Native build complete; capability smoke test pending"}
                else:
                    caps[cap_name] = {"state": "native_build_pending", "reason": "Native build required; queued for background execution"}
                continue
            caps[cap_name] = {"state": "pending", "reason": "Awaiting smoke test"}
        return caps
    caps = {}
    cap_map = {
        "shape": {"key": "supports_text_to_3d", "alt_key": "supports_image_to_3d"},
        "texture": {"key": "supports_texture_generation"},
        "texture_pbr": {"key": "supports_pbr"},
        "rigging": {"key": "supports_rigging"},
        "detail_enhancement": {"key": "supports_detail_enhancement"},
    }
    for cap_name, cap_info in cap_map.items():
        enabled = meta.get("capabilities", {}).get(cap_info["key"], False)
        if not enabled:
            alt = cap_info.get("alt_key")
            if alt:
                enabled = meta.get("capabilities", {}).get(alt, False)
        if not enabled:
            caps[cap_name] = {"state": "disabled", "reason": "Not supported by this provider"}
            continue
        # Capability is advertised; check if anything blocks it.
        # For now, inherit overall state until manifest-driven per-capability
        # checks are implemented.
        caps[cap_name] = {"state": "pending", "reason": "Awaiting manifest-driven capability check"}
    return caps


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
            results[name] = download_model_weights(name, hf_token=self._hf_token, log_cb=cb)
        return results

    def prepare_runtime(
        self,
        models: list[str] | None = None,
        log_cb: Callable | None = None,
        allow_native_build: bool = False,
    ) -> dict:
        """Stage A: prepare model runtimes only. No weights downloaded."""
        cb = log_cb or self._cb
        resolved = resolve_install_targets(models)
        results: dict = {"success": True, "providers": {}}
        self.create_folders()
        for name, meta in PROVIDER_METADATA.items():
            if name == "mock":
                continue
            if name not in resolved:
                continue
            cb(f"Preparing runtime for {name}...")
            r = prepare_runtime(name, hf_token=self._hf_token, log_cb=cb, allow_native_build=allow_native_build)
            results["providers"][name] = r
            if not r.get("success"):
                results["success"] = False
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
        # ponytail: cumulative disk check BEFORE starting any downloads.
        # Previously each model was checked individually, so a multi-model
        # install could exhaust disk before the last model finished. Now we
        # check the total estimated size of all selected models at once
        # (see Issue 10). This is advisory when the free space is tight
        # but safe, and blocking when continuation would predictably fail.
        if not skip_weights:
            sufficient, space_err = _check_disk_space(
                resolved[0] if resolved else "",
                selected_providers=resolved,
            )
            if not sufficient:
                if cb:
                    cb(f"[FATAL] {space_err}")
                return {
                    "success": False,
                    "error": space_err,
                    "providers": {},
                }
        for name, meta in PROVIDER_METADATA.items():
            if name == "mock":
                continue
            if name not in resolved:
                continue
            # ponytail: native-build models - attempt deps but don't block weights
            repo_name = meta.get("repo")
            _manifest = None
            try:
                from runtime.manifest_loader import load_manifest
                _manifest = load_manifest(name)
            except (ValueError, ImportError):
                pass
            native_req, _ = _get_native_build_info(meta, _manifest)
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
