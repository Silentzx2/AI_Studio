"""Runtime package for AI 3D Studio.

FIX: All imports are now lazy/optional. If torch, CUDA, or any sub-module
fails to import, the package itself remains importable.  Individual symbols
raise ImportError only when actually accessed, not at ``import runtime``.
This prevents ``No module named 'runtime'`` from cascading through the
Celery worker when a heavy dependency (e.g. torch) is unavailable.
"""

# Lazy-import helper — returns a proxy that resolves the real object on
# first attribute access.  If the underlying import fails, every subsequent
# access raises ImportError with a clear message instead of a cryptic
# ``AttributeError on NoneType``.
import importlib
import sys


def _lazy_import(module_path: str, attribute: str):
    """Return a lazy proxy that imports ``module_path.attribute`` on first use."""
    _cache = {}

    class _LazyProxy:
        __slots__ = ("_resolved",)

        def __init__(self):
            object.__setattr__(self, "_resolved", None)

        def _resolve(self):
            resolved = object.__getattribute__(self, "_resolved")
            if resolved is not None:
                return resolved
            try:
                mod = importlib.import_module(module_path)
                obj = getattr(mod, attribute)
            except Exception as exc:
                raise ImportError(
                    f"Cannot import '{attribute}' from '{module_path}': {exc}"
                ) from exc
            object.__setattr__(self, "_resolved", obj)
            return obj

        def __getattr__(self, name):
            return getattr(self._resolve(), name)

        def __repr__(self):
            try:
                return repr(self._resolve())
            except Exception:
                return f"<lazy {module_path}.{attribute}>"

        # Allow isinstance / issubclass checks to trigger resolution
        def __class__(self):  # type: ignore[misc]
            return self._resolve().__class__

    return _LazyProxy()


# ---- Public API (lazy proxies) ----

RuntimeEngine = _lazy_import("runtime.engine", "RuntimeEngine")
get_engine = _lazy_import("runtime.engine", "get_engine")
require_engine = _lazy_import("runtime.engine", "require_engine")

GPUInfo = _lazy_import("runtime.gpu", "GPUInfo")
GPURequiredError = _lazy_import("runtime.gpu", "GPURequiredError")
check_vram_sufficient = _lazy_import("runtime.gpu", "check_vram_sufficient")
empty_cuda_cache = _lazy_import("runtime.gpu", "empty_cuda_cache")
get_device = _lazy_import("runtime.gpu", "get_device")
get_gpu_info = _lazy_import("runtime.gpu", "get_gpu_info")
get_vram_usage = _lazy_import("runtime.gpu", "get_vram_usage")
require_gpu = _lazy_import("runtime.gpu", "require_gpu")
select_device = _lazy_import("runtime.gpu", "select_device")

StorageConfig = _lazy_import("runtime.storage", "StorageConfig")
get_storage_config = _lazy_import("runtime.storage", "get_storage_config")

# Accelerate integration — lazy so the runtime package remains importable
# even when accelerate is not installed in the backend venv.
accelerate_available = _lazy_import("runtime.accelerate_loader", "accelerate_available")
dispatch_model_to_device = _lazy_import("runtime.accelerate_loader", "dispatch_model_to_device")
dispatch_pipeline_models = _lazy_import("runtime.accelerate_loader", "dispatch_pipeline_models")
cleanup_accelerate_model = _lazy_import("runtime.accelerate_loader", "cleanup_accelerate_model")
enable_cpu_offload = _lazy_import("runtime.accelerate_loader", "enable_cpu_offload")
verify_gpu_placement = _lazy_import("runtime.accelerate_loader", "verify_gpu_placement")
log_gpu_memory = _lazy_import("runtime.accelerate_loader", "log_gpu_memory")
safe_unload = _lazy_import("runtime.accelerate_loader", "safe_unload")

__all__ = [
    "GPUInfo",
    "GPURequiredError",
    "RuntimeEngine",
    "StorageConfig",
    "accelerate_available",
    "cleanup_accelerate_model",
    "check_vram_sufficient",
    "dispatch_model_to_device",
    "dispatch_pipeline_models",
    "empty_cuda_cache",
    "enable_cpu_offload",
    "get_device",
    "get_engine",
    "get_gpu_info",
    "get_storage_config",
    "get_vram_usage",
    "log_gpu_memory",
    "require_engine",
    "require_gpu",
    "safe_unload",
    "select_device",
    "verify_gpu_placement",
]
