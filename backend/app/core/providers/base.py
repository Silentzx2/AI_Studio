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
    """Restore numpy aliases removed in numpy>=1.24 that per-model deps still use.

    Root cause: the worker's active numpy (backend .venv / conda cloudspace, 1.26.4)
    removed np.long / np.ulong, but _add_model_env prepends a per-model venv whose
    scipy (1.18) references them at module level in scipy/sparse/_sputils.py:17.
    Because numpy is already cached from the backend env, the per-model venv's numpy
    never wins and scipy crashes with "module 'numpy' has no attribute 'long'".
    Restore the aliases on the live numpy module before importing the model stack.

    ponytail: masks a numpy-2 migration gap. Proper fix is aligning the worker's
    numpy with the per-model venv (numpy 2.x) via the reload list; until then we
    just restore the missing dtype aliases.
    """
    import numpy as _np

    if not hasattr(_np, "long"):
        _np.long = _np.int_
    if not hasattr(_np, "ulong"):
        _np.ulong = _np.uint


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


def _fix_pillow(repo_name: str) -> bool:
    """Ensure Pillow works in BOTH the venv Python (preflight) and the
    backend Python (in-process inference).

    The venv's Pillow C extension is compiled for the venv's Python, which
    may differ from the backend's. The backend cannot load a venv-Python
    C extension, so we install a backend-Python copy into an overlay dir
    and prepend it to sys.path. Returns True if the backend can import
    _imaging after the fix.
    """
    from runtime.storage import get_storage_config
    storage = get_storage_config()
    venv_python = storage.get_model_venv_python(repo_name)
    venv_dir = storage.get_model_venv_path(repo_name)
    if venv_python is None:
        logger.warning("_fix_pillow: venv_python is None for %s", repo_name)
        return False
    # 1) Venv-Python check (preflight compatibility)
    code, out = _run([str(venv_python), "-c", "from PIL import _imaging; print('ok')"])
    logger.info("_fix_pillow: %s venv check code=%d out=%r", repo_name, code, out[:100])
    if code != 0 or "ok" not in out:
        logger.warning("Pillow C extension broken for %s (venv) — force-reinstalling...", repo_name)
        import shutil
        uv_path = shutil.which("uv")
        if uv_path:
            _run([uv_path, "pip", "install", "--python", str(venv_python),
                  "--force-reinstall", "--no-cache-dir", "pillow"])
        else:
            _run([str(venv_python), "-m", "pip", "install", "--force-reinstall",
                  "--no-cache-dir", "pillow"])
        code, out = _run([str(venv_python), "-c", "from PIL import _imaging; print('ok')"])
        logger.info("_fix_pillow: %s venv re-check code=%d out=%r", repo_name, code, out[:100])
    # 2) Backend-Python check (in-process inference) — overlay dir
    overlay = _backend_overlay_site_packages(venv_dir)
    backend_py = str(Path(sys.executable))
    # Test that the overlay directory itself has a working Pillow with _imaging
    check_overlay_code = (
        f"import sys; sys.path = [{str(overlay)!r}] + [p for p in sys.path if 'site-packages' not in p and 'dist-packages' not in p]; "
        f"from PIL import _imaging; print('ok')"
    )
    bcode, bout = _run([backend_py, "-c", check_overlay_code])
    logger.info("_fix_pillow: %s backend overlay check code=%d out=%r", repo_name, bcode, bout[:100])
    if bcode == 0 and "ok" in bout:
        return True

    # If backend Python has a working Pillow elsewhere (e.g. in its own environment),
    # copy it directly into the overlay so it's guaranteed to be available at overlay site-packages
    check_backend_code = "import PIL; from PIL import _imaging; print(PIL.__file__)"
    bkcode, bkout = _run([backend_py, "-c", check_backend_code])
    if bkcode == 0 and "PIL" in bkout:
        try:
            import shutil
            pil_file = Path(bkout.strip().splitlines()[-1])
            src_pil_dir = pil_file.parent
            dst_pil_dir = overlay / "PIL"
            if src_pil_dir.is_dir() and (src_pil_dir != dst_pil_dir):
                overlay.mkdir(parents=True, exist_ok=True)
                if dst_pil_dir.exists():
                    shutil.rmtree(str(dst_pil_dir), ignore_errors=True)
                shutil.copytree(str(src_pil_dir), str(dst_pil_dir), symlinks=True)
                for dist in src_pil_dir.parent.glob("pillow-*.dist-info"):
                    dst_dist = overlay / dist.name
                    if not dst_dist.exists():
                        shutil.copytree(str(dist), str(dst_dist), symlinks=True)
                bcode, bout = _run([backend_py, "-c", check_overlay_code])
                if bcode == 0 and "ok" in bout:
                    logger.info("_fix_pillow: %s successfully copied backend Pillow to overlay", repo_name)
                    return True
        except Exception as exc:
            logger.warning("_fix_pillow: failed copying backend Pillow to overlay: %s", exc)

    # Backend can't import _imaging from the overlay — install backend-Python Pillow
    logger.warning("Pillow not importable by backend Python for %s — installing overlay...", repo_name)
    import shutil
    uv_path = shutil.which("uv")
    if uv_path:
        _run([uv_path, "pip", "install", "--python", backend_py,
              "--target", str(overlay),
              "--force-reinstall", "--no-cache-dir", "pillow"])
    else:
        _run([backend_py, "-m", "pip", "install",
              "--target", str(overlay),
              "--force-reinstall", "--no-cache-dir", "pillow"])
    bcode, bout = _run([backend_py, "-c", check_overlay_code])
    logger.info("_fix_pillow: %s backend overlay re-check code=%d out=%r", repo_name, bcode, bout[:100])
    return bcode == 0 and "ok" in bout


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
        "pydantic", "requests", "httpx", "urllib3",
    ]

    for mod_name in list(sys.modules.keys()):
        for pkg in _SHARED_PKGS:
            if mod_name == pkg or mod_name.startswith(pkg + "."):
                del sys.modules[mod_name]
                break

    # Ensure Pillow is verified and working in sys.modules.
    # If a broken Pillow was previously cached in sys.modules (e.g. from a venv
    # Python C-extension), purge and load it fresh from the overlay at sys.path[0].
    try:
        from PIL import _imaging  # noqa: F401
    except Exception:
        for mod_name in list(sys.modules.keys()):
            if mod_name == "PIL" or mod_name.startswith("PIL."):
                del sys.modules[mod_name]
        try:
            import PIL
            from PIL import _imaging  # noqa: F401
            logger.info("_add_model_env: successfully loaded verified PIL from %s", getattr(PIL, "__file__", "overlay"))
        except Exception as exc:
            logger.error("_add_model_env: failed to load working PIL from overlay: %s", exc)


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
