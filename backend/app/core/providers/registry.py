"""Provider registry for download providers and runtime provider availability.

Exposes ProviderRegistry (download providers) and get_registry() which returns
a RuntimeProviderRegistry that tracks 3D-generation provider availability
used by the runtime and admin API endpoints.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from app.core.providers.base import DownloadProvider
from app.core.providers.civitai_provider import CivitAIProvider
from app.core.providers.github_provider import GitHubProvider
from app.core.providers.huggingface_provider import HuggingFaceProvider
from app.core.providers.modelscope_provider import ModelScopeProvider
from app.core.providers.nvidia_ngc_provider import NVIDIANGCProvider

logger = logging.getLogger(__name__)

_RUNTIME_PROVIDER_ALIASES = {
    "hunyuan3d-1.0": "hunyuan3d-2.1",
    "hunyuan3d": "hunyuan3d-2.1",
}

# ponytail: keep this map in sync with runtime/engine.py::_PROVIDER_MAP — it is
# the availability/selection source of truth used by get_provider() and
# validate_provider_switch(). Divergence here silently aliased real providers
# (triposg/triposf/unirig/holopart) to the mock.
_RUNTIME_PROVIDER_MAP = {
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
}


def _canonical_runtime_provider_name(name: str) -> str:
    return _RUNTIME_PROVIDER_ALIASES.get(name, name)


# ---------------------------------------------------------------------------
# Download Provider Registry (unchanged)
# ---------------------------------------------------------------------------

class ProviderRegistry:
    _providers: dict[str, type[DownloadProvider]] = {
        "github": GitHubProvider,
        "modelscope": ModelScopeProvider,
        "nvidia_ngc": NVIDIANGCProvider,
        "civitai": CivitAIProvider,
        "huggingface": HuggingFaceProvider,
    }
    
    @classmethod
    def register(cls, name: str, provider_class: type[DownloadProvider]):
        cls._providers[name] = provider_class
        
    @classmethod
    def get_provider(cls, name: str) -> DownloadProvider:
        if name not in cls._providers:
            raise ValueError(f"Provider {name} not found. Available: {list(cls._providers.keys())}")
        return cls._providers[name]()
        
    @classmethod
    def list_providers(cls):
        return list(cls._providers.keys())


# ---------------------------------------------------------------------------
# Runtime Provider Registry — tracks which 3D-generation providers are
# available (weights downloaded, repos cloned, etc.)
#
# Methods expected by runtime.py and admin.py:
#   get_registry()              -> RuntimeProviderRegistry
#   .list_providers()           -> list[str]
#   .list_available_providers() -> list[str]
#   .get_availability(name)     -> dict
#   .get_all_availability()     -> dict[str, dict]
# ---------------------------------------------------------------------------

# Known 3D generation providers the platform can use
_KNOWN_PROVIDERS = [
    "mock",
    "hunyuan3d",
    "hunyuan3d-2",
    "hunyuan3d-2.1",
    "trellis",
    "triposr",
    "triposg",
    "triposf",
    "unirig",
    "holopart",
    "instant-mesh",
    "anigen",
    "detailgen3d",
]


class RuntimeProviderRegistry:
    """Tracks runtime availability of 3D-generation providers."""

    def __init__(self) -> None:
        self._availability: dict[str, dict] = {}
        # Initialise every known provider as unavailable by default
        for name in _KNOWN_PROVIDERS:
            self._availability[name] = {"available": False, "reason": "not checked"}
        # Mock is always available
        self._availability["mock"] = {"available": True, "reason": "built-in"}

    # -- mutators ----------------------------------------------------------

    def set_available(self, name: str, available: bool = True, reason: str = "") -> None:
        self._availability[name] = {"available": available, "reason": reason}

    # -- queries -----------------------------------------------------------

    def list_providers(self) -> list[str]:
        return list(self._availability.keys())

    def list_available_providers(self) -> list[str]:
        return [n for n, info in self._availability.items() if info.get("available")]

    def get_availability(self, name: str) -> dict:
        return self._availability.get(name, {"available": False, "reason": "unknown provider"})

    def get_all_availability(self) -> dict[str, dict]:
        return dict(self._availability)


@lru_cache
def get_registry() -> RuntimeProviderRegistry:
    """Return the singleton RuntimeProviderRegistry.

    Called lazily by runtime.py and admin.py endpoints.
    """
    registry = RuntimeProviderRegistry()

    # Try to detect actually-available providers from the runtime layer
    try:
        from runtime.installer import get_install_status
        status = get_install_status()
        for name, info in (status or {}).items():
            if isinstance(info, dict):
                registry.set_available(
                    name,
                    available=info.get("installed", False),
                    reason=info.get("reason", ""),
                )
    except Exception as exc:
        logger.debug("Could not auto-detect provider availability: %s", exc)

    return registry


def reset_provider() -> None:
    """Drop cached runtime provider availability so it re-detects on next call."""
    get_registry.cache_clear()


def validate_provider_switch(name: str) -> tuple[bool, str]:
    """Validate a runtime provider name before switching active provider."""
    normalized = _canonical_runtime_provider_name(name)
    if normalized in _RUNTIME_PROVIDER_MAP or normalized == "mock":
        return True, ""
    return False, f"Unknown provider: {name}"


def get_provider(name: str, device: str | None = None):
    """Return a provider instance for download or 3D generation flows."""
    normalized = _canonical_runtime_provider_name(name)

    runtime_entry = _RUNTIME_PROVIDER_MAP.get(normalized)
    if runtime_entry:
        import importlib

        module_path, class_name = runtime_entry
        module = importlib.import_module(module_path)
        provider_cls = getattr(module, class_name)
        return provider_cls() if normalized == "mock" else provider_cls(device=device or "cuda:0")

    try:
        return ProviderRegistry.get_provider(normalized)
    except ValueError:
        logger.warning("Provider '%s' not in ProviderRegistry; falling back to mock.", name)
        from app.core.providers.mock import MockProvider
        return MockProvider()
