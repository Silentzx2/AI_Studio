"""RuntimeEngine — singleton coordinator for local AI pipeline.

FIXES APPLIED (Issue #9):
- Check allow_mock_provider setting before including mock in available providers
- Log warning when mock is disabled
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from runtime.gpu import get_device, get_gpu_info, select_device
from runtime.storage import get_storage_config

logger = logging.getLogger(__name__)

MODEL_VRAM_REQUIREMENTS: dict[str, int] = {
    "hunyuan3d": 16_000,
    "hunyuan3d-1.0": 16_000,
    "hunyuan3d-2.1": 16_000,
    "hunyuan3d-2": 24_000,
    "trellis": 8_000,
    "triposr": 6_000,
    "triposg": 12_000,
    "triposf": 12_000,
    "anigen": 6_200,
    "unirig": 8_000,
    "holopart": 8_000,
    "detailgen3d": 4_000,
    "mock": 0,
}
PROVIDER_PRIORITY = ["hunyuan3d-2.1", "trellis", "triposr", "hunyuan3d-2", "triposg", "triposf", "anigen", "unirig", "holopart", "detailgen3d", "mock"]

_PROVIDER_MAP: dict[str, tuple[str, str]] = {
    "hunyuan3d": ("app.core.providers.hunyuan3d_local", "Hunyuan3D21LocalProvider"),
    "hunyuan3d-1.0": ("app.core.providers.hunyuan3d_local", "Hunyuan3D21LocalProvider"),
    "hunyuan3d-2.1": ("app.core.providers.hunyuan3d_local", "Hunyuan3D21LocalProvider"),
    "hunyuan3d-2": ("app.core.providers.hunyuan3d_local", "Hunyuan3D2LocalProvider"),
    "trellis": ("app.core.providers.trellis_local", "TRELLISLocalProvider"),
    "triposr": ("app.core.providers.triposr_local", "TripoSRLocalProvider"),
    "triposg": ("app.core.providers.triposg_provider", "TripoSGProvider"),
    "triposf": ("app.core.providers.triposf_provider", "TripoSFProvider"),
    "anigen": ("app.core.providers.anigen_provider", "AniGenProvider"),
    "unirig": ("app.core.providers.unirig_provider", "UniRigProvider"),
    "holopart": ("app.core.providers.holopart_provider", "HoloPartProvider"),
    "detailgen3d": ("app.core.providers.detailgen3d", "DetailGen3DProvider"),
    "mock": ("app.core.providers.mock", "MockProvider"),
}


class _GPUScheduler:
    """Minimal GPU slot tracker — prevents two providers loading simultaneously."""

    def __init__(self) -> None:
        self.current_model: str | None = None

    def acquire(self, name: str) -> None:
        self.current_model = name

    def release(self, name: str) -> None:
        if self.current_model == name:
            self.current_model = None


class RuntimeEngine:
    def __init__(self) -> None:
        self.gpu = _GPUScheduler()
        self._loaded: dict[str, Any] = {}
        self._lock = asyncio.Lock()
        self._initialized = False
        self._storage = get_storage_config()

    async def initialize(self) -> None:
        if self._initialized:
            return
        logger.info("=" * 50)
        logger.info("RuntimeEngine initializing...")
        logger.info("  Third-party dir: %s", self._storage.third_party_dir)
        logger.info("  Weights dir: %s", self._storage.weights_dir)
        gpu = get_gpu_info()
        if gpu.available:
            logger.info("  CUDA %s — %d GPU(s)", gpu.cuda_version, gpu.device_count)
            for dev in gpu.devices:
                logger.info(
                    "    GPU %d: %s (%dGB)",
                    dev["index"], dev["name"], dev["vram_mb"] // 1024,
                )
        else:
            logger.warning("  No GPU: %s", gpu.reason)
            logger.warning(
                "  CUDA_VISIBLE_DEVICES=%s",
                os.environ.get("CUDA_VISIBLE_DEVICES", "<not set>"),
            )
        available = self._discover_providers()
        logger.info("  Available providers: %s", available)
        self._initialized = True
        logger.info("RuntimeEngine initialized")
        logger.info("=" * 50)

    def _discover_providers(self) -> list[str]:
        """Discover available providers, respecting allow_mock_provider setting."""
        providers = []
        for name in PROVIDER_PRIORITY:
            if name == "mock":
                # Issue #9 Fix: Check setting before including mock
                from app.config import get_settings
                settings = get_settings()
                if not settings.allow_mock_provider:
                    logger.debug("Mock provider disabled by allow_mock_provider=False")
                    continue
                providers.append(name)
            elif self._check_provider_available(name):
                providers.append(name)
        return providers

    def _check_provider_available(self, provider_name: str) -> bool:
        from runtime.installer import PROVIDER_METADATA
        meta = PROVIDER_METADATA.get(provider_name)
        if not meta:
            return False
        repo_name = meta.get("repo")
        weight_key = meta.get("weight_key")
        repo_ready = (
            self._storage.get_repo_path(repo_name).exists() if repo_name else True
        )
        weights_ready = (
            self._storage.get_weight_path(weight_key) is not None if weight_key else True
        )
        return repo_ready and weights_ready

    async def get_best_provider_name(self, requested: str) -> str:
        gpu = get_gpu_info()
        free_mb = gpu.free_vram_mb if gpu.available else 0
        needed = MODEL_VRAM_REQUIREMENTS.get(requested, 0)
        if needed == 0 or free_mb >= needed:
            return requested
        logger.warning(
            "Provider '%s' needs %d MB VRAM, only %d MB free",
            requested, needed, free_mb,
        )
        for candidate in PROVIDER_PRIORITY:
            if candidate == "mock":
                # Issue #9 Fix: Check setting before using mock as fallback
                from app.config import get_settings
                if not get_settings().allow_mock_provider:
                    continue
            if not self._check_provider_available(candidate):
                continue
            req = MODEL_VRAM_REQUIREMENTS.get(candidate, 0)
            if req == 0 or free_mb >= req:
                logger.info("Fallback to '%s'", candidate)
                return candidate
        # BUG-10 FIX: was returning `requested` here even though we just determined it exceeds
        # available VRAM — that caused an OOM crash deep inside model loading instead of a
        # clean, user-visible error. Raise explicitly so the job is marked failed immediately.
        raise RuntimeError(
            f"Insufficient VRAM to run any available provider. "
            f"Free: {free_mb} MB. "
            f"Requested '{requested}' requires {needed} MB. "
            f"Reduce resolution, free VRAM, or enable the mock provider."
        )

    async def load_provider(self, name: str) -> Any:
        async with self._lock:
            if name in self._loaded:
                return self._loaded[name]
            vram_needed = MODEL_VRAM_REQUIREMENTS.get(name, 0)
            # Use VRAM-aware device selection
            try:
                device = select_device("auto", max_vram_mb=vram_needed)
            except Exception:
                device = get_device()
            self.gpu.acquire(name)
            logger.info("Loading provider '%s' on %s...", name, device)
            try:
                loop = asyncio.get_running_loop()
                provider = await loop.run_in_executor(
                    None, lambda: _instantiate_provider(name, device)
                )
                self._loaded[name] = provider
                logger.info("Provider '%s' loaded", name)
                return provider
            except Exception as exc:
                logger.error("Failed to load provider '%s': %s", name, exc)
                self.gpu.release(name)
                raise

    async def unload_provider(self, name: str) -> None:
        async with self._lock:
            if name not in self._loaded:
                return
            provider = self._loaded.pop(name)
            if hasattr(provider, "unload"):
                try:
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, provider.unload)
                except Exception as exc:
                    logger.warning("Error unloading '%s': %s", name, exc)
            self.gpu.release(name)
            logger.info("Provider '%s' unloaded", name)

    def health(self) -> dict:
        gpu = get_gpu_info()
        provider_status = {
            name: {
                "available": name == "mock" or self._check_provider_available(name),
                "loaded": name in self._loaded,
            }
            for name in PROVIDER_PRIORITY
            # Issue #9: Only include mock if allowed
            if name != "mock" or self._is_mock_allowed()
        }
        return {
            "initialized": self._initialized,
            "gpu": {
                "available": gpu.available,
                "device_count": gpu.device_count,
                "free_vram_mb": gpu.free_vram_mb,
                "total_vram_mb": gpu.total_vram_mb,
                "cuda_version": gpu.cuda_version,
                "driver_version": gpu.driver_version,
                "devices": gpu.devices,
            },
            "loaded_providers": list(self._loaded.keys()),
            "scheduler_current": self.gpu.current_model,
            "provider_status": provider_status,
        }

    def _is_mock_allowed(self) -> bool:
        """Check if mock provider is allowed by settings."""
        try:
            from app.config import get_settings
            return get_settings().allow_mock_provider
        except Exception:
            return False


def _instantiate_provider(name: str, device: str) -> Any:
    import importlib
    entry = _PROVIDER_MAP.get(name)
    if not entry:
        raise ValueError(f"Unknown provider: {name}")
    module_path, class_name = entry
    mod = importlib.import_module(module_path)
    cls = getattr(mod, class_name)
    return cls() if name == "mock" else cls(device=device)


_engine: RuntimeEngine | None = None


def get_engine() -> RuntimeEngine:
    global _engine
    if _engine is None:
        _engine = RuntimeEngine()
    return _engine


def require_engine() -> RuntimeEngine:
    engine = get_engine()
    if not engine._initialized:
        raise RuntimeError(
            "RuntimeEngine not initialized. "
            "Call `await engine.initialize()` during application startup."
        )
    return engine
