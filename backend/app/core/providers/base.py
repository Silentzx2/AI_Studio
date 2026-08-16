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

    from runtime.storage import get_storage_config

    storage = get_storage_config()
    repo_path = str(storage.get_repo_path(repo_name))

    # Prepend repo path at position 0 (highest priority)
    if repo_path not in sys.path:
        sys.path.insert(0, repo_path)

    venv_dir = storage.get_model_venv_path(repo_name)
    if venv_dir.exists():
        site_packages = glob.glob(str(venv_dir / "lib" / "python*" / "site-packages"))
        for sp in reversed(site_packages):  # insert in reverse so order is correct
            if sp in sys.path:
                sys.path.remove(sp)  # remove any existing
            sys.path.insert(0, sp)    # prepend at front

    # CRITICAL: Remove all shared packages and their submodules from sys.modules
    # so they are re-imported fresh from the newly-prepended per-model venv.
    # Reloading is insufficient because:
    #   1. Submodules (e.g. diffusers.utils) are not automatically reloaded
    #   2. Module __file__ attributes don't update on reload
    #   3. Parent package imports (e.g. diffusers -> diffusers.utils) may
    #      still reference the old submodule object
    _SHARED_PKGS = [
        "huggingface_hub", "transformers", "diffusers",
        "pydantic", "requests", "httpx", "urllib3",
    ]
    for mod_name in list(sys.modules.keys()):
        for pkg in _SHARED_PKGS:
            if mod_name == pkg or mod_name.startswith(pkg + "."):
                del sys.modules[mod_name]
                break


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
