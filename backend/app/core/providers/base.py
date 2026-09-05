from abc import ABC, abstractmethod
import glob
import importlib
import logging
import sys
from typing import Any, Optional
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


def _patch_numpy_legacy_aliases() -> None:
    """Restore numpy aliases and bridge numpy._core compatibility.
    
    Delegates to runtime.model_env.apply_numpy_bridge() — the single
    implementation. This wrapper exists for backward compatibility.
    """
    try:
        from runtime.model_env import apply_numpy_bridge
        apply_numpy_bridge()
    except ImportError:
        pass  # model_env not available (e.g. during initial setup)


def _backend_overlay_site_packages(venv_dir: Path) -> Path:
    """Return the backend-Python overlay site-packages dir for a model venv.

    ponytail: per-model venvs are created with the manifest's
    `environment.python` (e.g. 3.10), but all in-process providers run in
    the backend interpreter (3.12). C extensions compiled for the venv
    Python (Pillow's `_imaging`) cannot be loaded by the backend, so we
    install a backend-Python copy into a sibling overlay directory and
    prepend it to sys.path — mirroring `_backend_torch_stack()` for torch.
    Preflight (venv Python) keeps using the venv's own packages.
    """
    overlay = venv_dir / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages"
    overlay.mkdir(parents=True, exist_ok=True)
    return overlay


# Pre-import torchvision from backend Python 3.12 and initialize torchaudio stub
# BEFORE any model environment modifies sys.path or purges sys.modules.
try:
    import torchvision
except Exception as _exc:
    logger.debug("base.py: torchvision pre-import: %s", _exc)

if "torchaudio" not in sys.modules:
    try:
        import torchaudio
    except Exception:
        import types
        _m = types.ModuleType("torchaudio")
        _m.__version__ = "2.5.1"
        _m.is_available = lambda: False
        _m.list_audio_backends = lambda: []
        sys.modules["torchaudio"] = _m


def _fix_c_package_overlay(repo_name: str, pkg_name: str, import_name: str, check_stmt: str) -> bool:
    """Ensure a C-extension package works in BOTH the venv Python (preflight)
    and the backend Python (in-process inference).

    When a model venv is created with a different Python (e.g. 3.10) than the
    backend worker (3.12), C extensions like `_imaging` (Pillow) or `_regex` (regex)
    compiled for 3.10 cannot be loaded by Python 3.12. We copy or install a
    backend-Python build into the overlay directory and prepend it to sys.path.
    """
    from runtime.storage import get_storage_config
    storage = get_storage_config()
    venv_python = storage.get_model_venv_python(repo_name)
    venv_dir = storage.get_model_venv_path(repo_name)
    if venv_python is None or not venv_dir.exists():
        return False

    # 1) Venv-Python check (preflight compatibility)
    code, out = _run([str(venv_python), "-c", check_stmt])
    logger.info("_fix_overlay[%s:%s]: venv check code=%d out=%r", repo_name, pkg_name, code, out[:100])
    if code != 0 or "ok" not in out:
        logger.warning("%s C extension broken for %s (venv) — reinstalling in venv...", pkg_name, repo_name)
        import shutil
        uv_path = shutil.which("uv")
        if uv_path:
            _run([uv_path, "pip", "install", "--python", str(venv_python),
                  "--force-reinstall", "--no-cache-dir", pkg_name])
        else:
            _run([str(venv_python), "-m", "pip", "install", "--force-reinstall",
                  "--no-cache-dir", pkg_name])
        code, out = _run([str(venv_python), "-c", check_stmt])
        logger.info("_fix_overlay[%s:%s]: venv re-check code=%d out=%r", repo_name, pkg_name, code, out[:100])

    # 2) Backend-Python check (in-process inference) — overlay dir
    overlay = _backend_overlay_site_packages(venv_dir)
    backend_py = str(Path(sys.executable))
    check_overlay_code = (
        f"import sys; sys.path.insert(0, {str(overlay)!r}); "
        f"import {import_name}; "
        f"assert {str(overlay)!r} in getattr({import_name}, '__file__', ''), 'not in overlay'; "
        f"{check_stmt}"
    )
    bcode, bout = _run([backend_py, "-c", check_overlay_code])
    logger.info("_fix_overlay[%s:%s]: backend overlay check code=%d out=%r", repo_name, pkg_name, bcode, bout[:100])
    if bcode == 0 and "ok" in bout:
        return True

    # 3) Check if backend Python already has a working package in its environment, and copy it
    check_backend_code = f"import {import_name}; {check_stmt}; print(getattr({import_name}, '__file__', ''))"
    bkcode, bkout = _run([backend_py, "-c", check_backend_code])
    if bkcode == 0 and ("ok" in bkout or import_name in bkout):
        try:
            import shutil
            last_line = bkout.strip().splitlines()[-1]
            if last_line and Path(last_line).exists():
                mod_file = Path(last_line)
                src_dir = mod_file.parent if mod_file.name == "__init__.py" else mod_file
                dst_dir = overlay / (src_dir.name)
                overlay.mkdir(parents=True, exist_ok=True)
                if src_dir.is_dir() and (src_dir != dst_dir):
                    if dst_dir.exists():
                        shutil.rmtree(str(dst_dir), ignore_errors=True)
                    shutil.copytree(str(src_dir), str(dst_dir), symlinks=True)
                elif src_dir.is_file():
                    shutil.copy2(str(src_dir), str(dst_dir))
                # Copy dist-info metadata if available
                norm_pkg = pkg_name.lower().replace("-", "_")
                for dist in src_dir.parent.glob(f"{norm_pkg}*.dist-info"):
                    dst_dist = overlay / dist.name
                    if not dst_dist.exists():
                        shutil.copytree(str(dist), str(dst_dist), symlinks=True)
                bcode, bout = _run([backend_py, "-c", check_overlay_code])
                if bcode == 0 and "ok" in bout:
                    logger.info("_fix_overlay[%s:%s]: copied backend package to overlay successfully", repo_name, pkg_name)
                    return True
        except Exception as exc:
            logger.warning("_fix_overlay[%s:%s]: failed copying backend package to overlay: %s", repo_name, pkg_name, exc)

    # 4) For torchaudio: if backend Python doesn't provide it, write a stub into overlay
    if pkg_name == "torchaudio":
        try:
            ta_dir = overlay / "torchaudio"
            ta_dir.mkdir(parents=True, exist_ok=True)
            (ta_dir / "__init__.py").write_text(
                '"""Stub torchaudio to prevent Py3.10/3.12 ABI mismatch in transformers."""\n'
                '__version__ = "2.5.1"\n'
                'def is_available(): return False\n'
                'def list_audio_backends(): return []\n'
            )
            bcode, bout = _run([backend_py, "-c", check_overlay_code])
            if bcode == 0 and "ok" in bout:
                logger.info("_fix_overlay[%s:torchaudio]: stubbed torchaudio in overlay", repo_name)
                return True
        except Exception as exc:
            logger.warning("_fix_overlay[%s:torchaudio]: failed creating stub: %s", repo_name, exc)

    # 5) Install directly into overlay using backend Python
    logger.warning("%s C extension missing or incompatible for %s — installing into overlay...", pkg_name, repo_name)
    import shutil
    uv_path = shutil.which("uv")
    if uv_path:
        _run([uv_path, "pip", "install", "--python", backend_py,
              "--target", str(overlay),
              "--force-reinstall", "--no-cache-dir", pkg_name])
    else:
        _run([backend_py, "-m", "pip", "install",
              "--target", str(overlay),
              "--force-reinstall", "--no-cache-dir", pkg_name])
    bcode, bout = _run([backend_py, "-c", check_overlay_code])
    logger.info("_fix_overlay[%s:%s]: backend overlay re-check code=%d out=%r", repo_name, pkg_name, bcode, bout[:100])
    return bcode == 0 and "ok" in bout


_VERIFIED_OVERLAYS: set[str] = set()


def _fix_overlay_packages(repo_name: str, force: bool = False) -> bool:
    """Ensure all critical C-extension packages (Pillow, regex, safetensors, scipy)
    have working backend-Python builds in the model's overlay directory.
    """
    if not force and repo_name in _VERIFIED_OVERLAYS:
        return True

    # Clean up any partial torchvision/torchaudio copies in overlay (they lack private .libs and break C-extensions)
    try:
        from runtime.storage import get_storage_config
        venv_dir = get_storage_config().get_model_venv_path(repo_name)
        if venv_dir.exists():
            overlay = _backend_overlay_site_packages(venv_dir)
            for bad_pkg in ("torchvision", "torchaudio"):
                bad_dir = overlay / bad_pkg
                if bad_dir.exists():
                    import shutil
                    shutil.rmtree(str(bad_dir), ignore_errors=True)
    except Exception:
        pass

    packages = [
        ("pillow", "PIL", "from PIL import _imaging; print('ok')"),
        ("regex", "regex", "from regex import _regex; print('ok')"),
        ("safetensors", "safetensors", "import safetensors; from safetensors import _safetensors_rust; print('ok')"),
        ("pymeshlab", "pymeshlab", "from pymeshlab import pmeshlab; print('ok')"),
        ("scipy", "scipy", "from scipy._lib import _ccallback_c; print('ok')"),
        ("scikit-image", "skimage", "from skimage.measure import _marching_cubes_lewiner_cy; print('ok')"),
    ]
    all_ok = True
    for pkg_name, import_name, check_stmt in packages:
        ok = _fix_c_package_overlay(repo_name, pkg_name, import_name, check_stmt)
        if not ok:
            all_ok = False
    if all_ok:
        _VERIFIED_OVERLAYS.add(repo_name)
    return all_ok


# Backward compatibility alias
_fix_pillow = _fix_overlay_packages


def _run(cmd: list[str], cwd: str | None = None) -> tuple[int, str]:
    """Run a command and return (returncode, output)."""
    import subprocess
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            cwd=cwd, timeout=120,
        )
        return result.returncode, result.stdout + result.stderr
    except Exception as exc:
        logger.error("_run: exception for %s: %s", cmd[0] if cmd else "?", exc)
        return -1, str(exc)


def _add_model_env(repo_name: str) -> None:
    """Make a model repo importable in-process from the backend worker.

    ponytail: the per-model venv's site-packages must take precedence over the
    backend venv's version (e.g., huggingface_hub needs >=0.28 for is_offline_mode).
    We prepend the venv path and REMOVE any conflicting packages that may have
    already been imported by the backend process or another provider's venv.
    Simply reloading is insufficient because submodules (e.g. diffusers.utils)
    are not automatically reloaded, and their __file__ attributes don't update.
    """
    # Must run before any model-stack import that touches numpy (e.g. scipy).
    _patch_numpy_legacy_aliases()

    # Fix broken Pillow C extension before any model imports.
    # This handles the case where the per-model venv's Pillow
    # has a corrupted/missing _imaging C extension.
    _fix_pillow(repo_name)

    from runtime.storage import get_storage_config

    storage = get_storage_config()
    repo_path = str(storage.get_repo_path(repo_name))

    # Prepend repo path at position 0 (highest priority)
    if repo_path not in sys.path:
        sys.path.insert(0, repo_path)

    venv_dir = storage.get_model_venv_path(repo_name)
    if venv_dir.exists():
        overlay = _backend_overlay_site_packages(venv_dir)
        overlay_str = str(overlay.resolve())
        # Collect any other per-model venv site-packages (e.g. python3.10)
        venv_sps = [
            str(Path(p).resolve())
            for p in glob.glob(str(venv_dir / "lib" / "python*" / "site-packages"))
            if str(Path(p).resolve()) != overlay_str
        ]

        # Remove these paths from sys.path if already present
        for p in [overlay_str, repo_path] + venv_sps:
            while p in sys.path:
                sys.path.remove(p)

        # Move the backend .venv to the end of sys.path so that the per-model
        # venv is the sole source for fresh imports during model loading.
        # Backend packages already in sys.modules are unaffected.
        _backend_venv = (Path(__file__).resolve().parent.parent.parent.parent / ".venv").resolve()
        _backend_sp = str((_backend_venv / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages").resolve())
        while _backend_sp in sys.path:
            sys.path.remove(_backend_sp)
        sys.path.append(_backend_sp)

        # Prepend in strict order:
        # sys.path[0] -> overlay_str (backend C-extensions like Pillow's _imaging ALWAYS win)
        # sys.path[1] -> repo_path (local repo code)
        # sys.path[2...] -> venv_sps (per-model packages like hy3dgen)
        for sp in reversed(venv_sps):
            sys.path.insert(0, sp)
        if repo_path:
            sys.path.insert(0, repo_path)
        sys.path.insert(0, overlay_str)

    # CRITICAL: Remove all shared packages and their submodules from sys.modules
    # so they are re-imported fresh from the newly-prepended per-model venv.
    # Reloading is insufficient because:
    #   1. Submodules (e.g. diffusers.utils) are not automatically reloaded
    #   2. Module __file__ attributes don't update on reload
    #   3. Parent package imports (e.g. diffusers -> diffusers.utils) may
    #      still reference the old submodule object
    _SHARED_PKGS = [
        "accelerate", "huggingface_hub", "transformers", "diffusers",
        "pydantic", "requests", "httpx", "urllib3", "scipy", "skimage",
    ]

    for mod_name in list(sys.modules.keys()):
        for pkg in _SHARED_PKGS:
            if mod_name == pkg or mod_name.startswith(pkg + "."):
                del sys.modules[mod_name]
                break

    # CRITICAL: Ensure torchvision and torchaudio are present in sys.modules
    # from backend Python 3.12 so they are NEVER loaded from a Py3.10 model venv
    # or re-imported midway through C++ operator registration.
    if "torchvision" not in sys.modules:
        try:
            import torchvision
        except Exception as exc:
            logger.debug("torchvision pre-import: %s", exc)

    if "torchaudio" not in sys.modules:
        try:
            import torchaudio
        except Exception:
            import types
            m = types.ModuleType("torchaudio")
            m.__version__ = "2.5.1"
            m.is_available = lambda: False
            m.list_audio_backends = lambda: []
            sys.modules["torchaudio"] = m

    # Prevent broken Python 3.10 onnxruntime C-extensions in per-model venvs
    # from crashing diffusers/transformers during pipeline inspection.
    try:
        import onnxruntime
        from onnxruntime.capi import _pybind_state
    except Exception:
        import types
        ort_stub = types.ModuleType("onnxruntime")
        ort_stub.__version__ = "1.16.0"
        ort_stub.InferenceSession = None
        ort_stub.SessionOptions = None
        sys.modules["onnxruntime"] = ort_stub
        try:
            import diffusers.utils.import_utils as _diu
            _diu.is_onnx_available = lambda: False
            _diu.is_onnxruntime_available = lambda: False
        except Exception:
            pass

    # Ensure critical C-extension modules are verified and working in sys.modules.
    # If an ABI-incompatible version was previously cached (e.g. from a Python 3.10
    # venv C-extension), purge and reload fresh from the overlay at sys.path[0].
    _VERIFY_MODULES = [
        ("PIL", "from PIL import _imaging"),
        ("regex", "from regex import _regex"),
        ("safetensors", "from safetensors import _safetensors_rust"),
        ("pymeshlab", "from pymeshlab import pmeshlab"),
        ("scipy", "from scipy._lib import _ccallback_c"),
        ("skimage", "from skimage.measure import _marching_cubes_lewiner_cy"),
    ]
    for mod_pkg, test_code in _VERIFY_MODULES:
        try:
            exec(test_code)
        except Exception:
            for mod_name in list(sys.modules.keys()):
                if mod_name == mod_pkg or mod_name.startswith(mod_pkg + "."):
                    del sys.modules[mod_name]
            try:
                exec(test_code)
                logger.info("_add_model_env: successfully verified %s from overlay", mod_pkg)
            except Exception as exc:
                logger.debug("_add_model_env: module %s not loaded or optional: %s", mod_pkg, exc)

    # Re-apply numpy compatibility bridge after environment and sys.path adjustments
    _patch_numpy_legacy_aliases()


class DownloadProvider(ABC):
    @abstractmethod
    def list_models(self) -> list[dict[str, Any]]:
        pass
        
    @abstractmethod
    def get_model(self, identifier: str) -> dict[str, Any]:
        pass
        
    @abstractmethod
    def resolve_download_urls(self, model_id: str, version: str) -> list[dict[str, str]]:
        pass
        
    @abstractmethod
    def validate_credentials(self, provider_config: dict[str, Any]) -> bool:
        pass
        
    @abstractmethod
    def get_mirrors(self, url: str) -> list[str]:
        pass


@dataclass
class ProviderResult:
    model_path: str
    thumbnail_path: str
    polygon_count: int
    vertex_count: int
    texture_resolution: Optional[str]
    has_rig: bool
    file_size: int
    metadata: dict


class BaseProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    async def generate(self, request: Any, output_dir: str, progress_callback: Any = None) -> ProviderResult:
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        pass


# Apply numpy compatibility bridge at module load time
_patch_numpy_legacy_aliases()

