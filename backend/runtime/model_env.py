"""Unified model environment resolver — single source of truth.

Every module that needs model paths, numpy bridge, venv info, or error
classification calls functions from here instead of doing its own resolution.
Reads from YAML manifests via manifest_loader.

ponytail: this file replaces 10+ scattered implementations of numpy bridge,
5+ import fallback chains, and 3+ error classifiers with ONE of each.
"""
from __future__ import annotations

import logging
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Import helper — ONE place instead of 5 try/except chains
# ---------------------------------------------------------------------------

def _import_manifest_loader():
    """Import manifest_loader from any execution context (FastAPI, Celery, CLI, test)."""
    for mod_path in ("runtime.manifest_loader", "backend.runtime.manifest_loader"):
        try:
            return __import__(mod_path, fromlist=["load_manifest"])
        except (ImportError, ValueError):
            continue
    # Last resort: relative import (when running as part of the runtime package)
    from . import manifest_loader
    return manifest_loader


def _import_storage():
    """Import storage module from any execution context."""
    for mod_path in ("runtime.storage", "backend.runtime.storage"):
        try:
            return __import__(mod_path, fromlist=["get_storage_config"])
        except (ImportError, ValueError):
            continue
    from . import storage
    return storage


# ---------------------------------------------------------------------------
# NumPy bridge — ONE implementation
# ---------------------------------------------------------------------------

def apply_numpy_bridge() -> None:
    """Restore numpy aliases and bridge numpy._core → numpy.core. Idempotent."""
    try:
        import numpy as _np

        if "long" not in _np.__dict__:
            _np.long = _np.int_
        if "ulong" not in _np.__dict__:
            _np.ulong = _np.uint

        _orig_array = _np.array
        if getattr(_orig_array, "__name__", "") != "_safe_np_array":
            def _safe_np_array(*args, **kwargs):
                if "copy" in kwargs and kwargs["copy"] is None:
                    kwargs["copy"] = False
                return _orig_array(*args, **kwargs)
            _safe_np_array._orig = _orig_array
            _np.array = _safe_np_array

        _orig_asarray = _np.asarray
        if getattr(_orig_asarray, "__name__", "") != "_safe_np_asarray":
            def _safe_np_asarray(*args, **kwargs):
                if "copy" in kwargs:
                    c = kwargs.pop("copy")
                    try:
                        return _orig_asarray(*args, copy=c if c is not None else False, **kwargs)
                    except TypeError:
                        return _orig_asarray(*args, **kwargs)
                return _orig_asarray(*args, **kwargs)
            _safe_np_asarray._orig = _orig_asarray
            _np.asarray = _safe_np_asarray

        is_np2 = int(_np.__version__.split(".")[0]) >= 2
        if not is_np2 and hasattr(_np, "core"):
            import numpy.core as _core
            _np._core = _core
            sys.modules["numpy._core"] = _core

            for mod_name in ("multiarray", "umath", "_multiarray_umath"):
                try:
                    mod = getattr(_core, mod_name, None)
                    if mod is None:
                        mod = __import__(f"numpy.core.{mod_name}", fromlist=[mod_name])
                    if mod is not None:
                        setattr(_core, mod_name, mod)
                        sys.modules[f"numpy._core.{mod_name}"] = mod
                except Exception:
                    pass

            for sub_name, sub_mod in list(sys.modules.items()):
                if sub_name.startswith("numpy.core."):
                    core_suffix = sub_name[len("numpy.core."):]
                    sys.modules.setdefault(f"numpy._core.{core_suffix}", sub_mod)
            for attr in dir(_core):
                if not attr.startswith("__"):
                    try:
                        val = getattr(_core, attr)
                        if isinstance(val, type(sys)):
                            sys.modules.setdefault(f"numpy._core.{attr}", val)
                    except Exception:
                        pass
    except Exception as exc:
        logger.debug("Error in apply_numpy_bridge: %s", exc)

    # Bypass transformers CVE-2025-32434 check_torch_load_is_safe blocking .bin weights on PyTorch < 2.6
    try:
        import transformers.utils.import_utils as _tiu
        if hasattr(_tiu, "check_torch_load_is_safe"):
            _tiu.check_torch_load_is_safe = lambda *args, **kwargs: None
    except Exception:
        pass

    # Ensure stub or partially loaded modules have valid __spec__ to prevent ValueError in find_spec
    for _pkg in ("onnxruntime", "torchaudio"):
        _m = sys.modules.get(_pkg)
        if _m is not None and getattr(_m, "__spec__", None) is None:
            try:
                import importlib.machinery
                _m.__spec__ = importlib.machinery.ModuleSpec(_pkg, None)
            except Exception:
                pass


# Subprocess-injectable version (string form for _run_in_venv)
_NUMPY_BRIDGE_CODE = (
    "try:\n"
    "    import warnings; warnings.filterwarnings('ignore', category=DeprecationWarning)\n"
    "    import sys, numpy as _np\n"
    "    if 'long' not in _np.__dict__: _np.long = getattr(_np, 'int_', int)\n"
    "    if 'ulong' not in _np.__dict__: _np.ulong = getattr(_np, 'uint', int)\n"
    "    if int(_np.__version__.split('.')[0]) < 2 and hasattr(_np, 'core'):\n"
    "        import numpy.core as _core; _np._core = _core; sys.modules['numpy._core'] = _core\n"
    "        for _m in ('multiarray', 'umath', '_multiarray_umath'):\n"
    "            try:\n"
    "                _mod = getattr(_core, _m, None) or __import__(f'numpy.core.{_m}', fromlist=[_m])\n"
    "                sys.modules[f'numpy._core.{_m}'] = _mod\n"
    "            except Exception: pass\n"
    "    _oa = _np.array; _oas = _np.asarray\n"
    "    if getattr(_oa, '__name__', '') != '_s_arr':\n"
    "        def _s_arr(*a, **kw):\n"
    "            if 'copy' in kw and kw['copy'] is None: kw['copy'] = False\n"
    "            return _oa(*a, **kw)\n"
    "        _np.array = _s_arr\n"
    "    if getattr(_oas, '__name__', '') != '_s_asarr':\n"
    "        def _s_asarr(*a, **kw):\n"
    "            if 'copy' in kw:\n"
    "                c = kw.pop('copy')\n"
    "                try: return _oas(*a, copy=c if c is not None else False, **kw)\n"
    "                except TypeError: return _oas(*a, **kw)\n"
    "            return _oas(*a, **kw)\n"
    "        _np.asarray = _s_asarr\n"
    "    import transformers.utils.import_utils as _tiu\n"
    "    if hasattr(_tiu, 'check_torch_load_is_safe'):\n"
    "        _tiu.check_torch_load_is_safe = lambda *a, **kw: None\n"
    "    for _pkg in ('onnxruntime', 'torchaudio'):\n"
    "        _m = sys.modules.get(_pkg)\n"
    "        if _m is not None and getattr(_m, '__spec__', None) is None:\n"
    "            try:\n"
    "                import importlib.machinery\n"
    "                _m.__spec__ = importlib.machinery.ModuleSpec(_pkg, None)\n"
    "            except Exception: pass\n"
    "except Exception: pass\n"
)


def get_numpy_bridge_code() -> str:
    """Return numpy bridge as injectable Python string for subprocesses."""
    return _NUMPY_BRIDGE_CODE


def patch_transformers_torch_load_check(venv_python: Path | str) -> bool:
    """Patch check_torch_load_is_safe in a venv's transformers library.

    transformers>=4.48.0 blocks loading .bin weights on PyTorch < 2.6 (CVE-2025-32434).
    AI Studio runs PyTorch 2.5.1 for compiled CUDA kernels (Trellis, Hunyuan3D, TripoSG).
    This safely bypasses the check for trusted local model weights.
    """
    try:
        vp = Path(venv_python)
        venv_root = vp.parent.parent if vp.name.startswith("python") else vp
        target_files = list(venv_root.glob("lib/python*/site-packages/transformers/utils/import_utils.py"))
        patched = False
        for f in target_files:
            if not f.exists():
                continue
            content = f.read_text(encoding="utf-8")
            if "def check_torch_load_is_safe" in content and "# AI_STUDIO_BYPASS" not in content:
                new_content = re.sub(
                    r"(def check_torch_load_is_safe\([^)]*\):(?:\s*\"\"\"[\s\S]*?\"\"\")?)",
                    r"\1\n    return  # AI_STUDIO_BYPASS",
                    content,
                    count=1,
                )
                if new_content != content:
                    f.write_text(new_content, encoding="utf-8")
                    patched = True
        return patched
    except Exception as exc:
        logger.debug("Failed to patch transformers in %s: %s", venv_python, exc)
        return False


# ---------------------------------------------------------------------------
# Error classification — ONE set of patterns
# ---------------------------------------------------------------------------

_RESOURCE_OR_ENV_ERRS = frozenset({
    "CUDA", "cuda", "GPU", "OutOfMemory", "device-side assert",
    "Torch not compiled with CUDA", "Timed out", "No CUDA runtime",
    "torch.cuda.is_available() is False",
    "Expected all tensors to be on the same device",
    "out of memory", "cuda out of memory", "cuda oom",
    "cuinit error", "runtimeerror: cuda", "oom",
    "no memory to allocate", "nvidia-smi", "memory exhausted",
    "not implemented for 'Half'", "addmm", "Slow without a GPU",
})


def is_resource_error(text: str) -> bool:
    """Check if output/exception text indicates a GPU/CUDA/OOM issue."""
    if not text:
        return False
    text_lower = text.lower()
    return any(marker.lower() in text_lower for marker in _RESOURCE_OR_ENV_ERRS)


# ---------------------------------------------------------------------------
# ModelEnv — resolved environment for a provider
# ---------------------------------------------------------------------------

@dataclass
class ModelEnv:
    """Everything needed to run a model — resolved from its manifest."""
    provider_name: str
    repo_name: str
    repo_path: Path
    scripts_path: Path
    venv_python: Path | None
    venv_site_packages: list[Path] = field(default_factory=list)
    weights_path: Path | None = None
    weight_key: str = ""
    auxiliary_weights: dict[str, Path | None] = field(default_factory=dict)
    sys_path_entries: list[str] = field(default_factory=list)
    needs_cuda: bool = False
    capabilities: dict[str, dict] = field(default_factory=dict)


def resolve_model_env(provider_name: str) -> ModelEnv | None:
    """Load manifest + storage → return fully resolved ModelEnv.

    This is the ONLY function that resolves model paths from manifests.
    Returns None if manifest or storage can't be loaded.
    """
    try:
        ml = _import_manifest_loader()
        manifest = ml.load_manifest(provider_name)
    except Exception:
        logger.debug("resolve_model_env: cannot load manifest for %s", provider_name)
        return None

    try:
        st = _import_storage()
        storage = st.get_storage_config()
    except Exception:
        logger.debug("resolve_model_env: cannot load storage config")
        return None

    # Source info
    source = manifest.get("source", {})
    repo_name = source.get("local_dir", "")
    if not repo_name:
        return None

    repo_path = storage.get_repo_path(repo_name)
    scripts_path = repo_path / "scripts"

    # Venv
    venv_dir = storage.get_model_venv_path(repo_name)
    venv_python = venv_dir / "bin" / "python" if venv_dir.exists() else None

    # Venv site-packages
    venv_sps: list[Path] = []
    if venv_dir.exists():
        import glob as _glob
        venv_sps = [
            Path(p) for p in _glob.glob(str(venv_dir / "lib" / "python*" / "site-packages"))
        ]

    # Weights
    weights_cfg = manifest.get("weights", {})
    primary = weights_cfg.get("primary", {}) or {}
    weight_key = primary.get("repo", "")

    weights_path = None
    if weight_key:
        weights_path = storage.get_weight_path(weight_key)
    if not weights_path:
        weights_path = storage.get_weight_path(provider_name)

    # Auxiliary weights
    aux_weights: dict[str, Path | None] = {}
    for aux in weights_cfg.get("auxiliary", []):
        aux_name = aux.get("name", aux.get("repo", "unknown"))
        aux_repo = aux.get("repo", "")
        aux_path = storage.get_weight_path(aux_repo) if aux_repo else None
        if not aux_path:
            aux_path = storage.get_weight_path(aux_name)
        aux_weights[aux_name] = aux_path

    # sys.path entries (order: repo, scripts, venv site-packages)
    sys_path_entries = [str(repo_path), str(scripts_path)]
    for sp in venv_sps:
        sys_path_entries.append(str(sp))

    # CUDA requirement
    preflight_cfg = manifest.get("preflight", {})
    caps_cfg = manifest.get("capabilities", {})
    cap_native = any(
        v.get("native_build_required", False)
        for v in caps_cfg.values()
        if isinstance(v, dict) and v.get("enabled", True)
    )
    needs_cuda = bool(cap_native) or preflight_cfg.get("check_cuda", False)

    return ModelEnv(
        provider_name=provider_name,
        repo_name=repo_name,
        repo_path=repo_path,
        scripts_path=scripts_path,
        venv_python=venv_python,
        venv_site_packages=venv_sps,
        weights_path=weights_path,
        weight_key=weight_key,
        auxiliary_weights=aux_weights,
        sys_path_entries=sys_path_entries,
        needs_cuda=needs_cuda,
        capabilities=caps_cfg,
    )


# ---------------------------------------------------------------------------
# Venv subprocess runner — auto-injects bridge + sys.path
# ---------------------------------------------------------------------------

def run_in_model_venv(
    provider_name: str,
    code: str,
    venv_python: Path | None = None,
    timeout_sec: int = 60,
) -> tuple[int, str]:
    """Run Python code in a model's venv with automatic numpy bridge + sys.path.

    If venv_python is None, resolves it from the manifest.
    """
    env = resolve_model_env(provider_name) if not venv_python else None

    if not venv_python:
        if env and env.venv_python:
            venv_python = env.venv_python
        else:
            return 1, f"No venv python found for {provider_name}"

    # Build preamble: numpy bridge + sys.path injection
    preamble = get_numpy_bridge_code()
    if env:
        paths = env.sys_path_entries
        if paths:
            preamble += "import sys\n"
            for p in paths:
                preamble += f"if {p!r} not in sys.path: sys.path.insert(0, {p!r})\n"

    full_code = preamble + code

    try:
        proc = subprocess.run(
            [str(venv_python), "-c", full_code],
            capture_output=True, text=True, timeout=timeout_sec,
        )
        output = (proc.stdout + "\n" + proc.stderr).strip()
        return proc.returncode, output
    except subprocess.TimeoutExpired:
        return 1, f"Timed out after {timeout_sec}s"
    except Exception as exc:
        return 1, str(exc)
