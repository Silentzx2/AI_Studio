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
    "hunyuan3d-2.1": "hunyuan3d-2.1",
    "hunyuan3d 2.1": "hunyuan3d-2.1",
    "hunyuan3d2.1": "hunyuan3d-2.1",
    "hunyuan3d_21": "hunyuan3d-2.1",
    "hunyuan3d-2mini": "hunyuan3d-2-mini",
    "hunyuan3d 2 mini": "hunyuan3d-2-mini",
    "hunyuan3d2mini": "hunyuan3d-2-mini",
    "hunyuan3d_2_mini": "hunyuan3d-2-mini",
    "hunyuan-2mini": "hunyuan3d-2-mini",
    "hunyuan3d-2-mini": "hunyuan3d-2-mini",
    "triposg": "triposg",
    "trellis": "trellis",
    "detailgen3d": "detailgen3d",
    "mock": "mock",
}

# ponytail: keep this map in sync with runtime/engine.py::_PROVIDER_MAP — it is
# the availability/selection source of truth used by get_provider() and
# validate_provider_switch(). (hunyuan3d-2-mini + triposg were previously
# missing here, so switching to / get_provider() for them silently fell back to
# mock despite the engine being able to load them.)
_RUNTIME_PROVIDER_MAP = {
    "hunyuan3d-2.1": ("app.core.providers.hunyuan3d_local", "Hunyuan3D21LocalProvider"),
    "hunyuan3d-2-mini": ("app.core.providers.hunyuan3d_local", "Hunyuan3D2MiniLocalProvider"),
    "trellis": ("app.core.providers.trellis_local", "TRELLISLocalProvider"),
    "triposg": ("app.core.providers.triposg_local", "TripoSGLocalProvider"),
    "detailgen3d": ("app.core.providers.detailgen3d", "DetailGen3DProvider"),
    "mock": ("app.core.providers.mock", "MockProvider"),
}

# Providers that only support post-processing (detail/refinement) and must
# never be offered as standalone generation targets in the UI.
_POST_PROCESSING_ONLY_PROVIDERS = frozenset({"detailgen3d"})


def is_standalone_generation_provider(name: str) -> bool:
    """Return True if ``name`` can be used as a standalone generation provider.

    Post-processing-only providers (e.g. DetailGen3D) return False so the
    frontend can exclude them from generation-target selectors while still
    offering them as a detail/refinement stage.
    """
    return name.lower() not in _POST_PROCESSING_ONLY_PROVIDERS


def canonical_runtime_provider_name(name: str) -> str:
    """Return canonical lowercase provider name for any model name or alias."""
    if not name or not isinstance(name, str):
        return name
    clean = name.strip().lower()
    return _RUNTIME_PROVIDER_ALIASES.get(clean, clean)


_canonical_runtime_provider_name = canonical_runtime_provider_name


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
    "hunyuan3d-2.1",
    "hunyuan3d-2-mini",
    "trellis",
    "triposg",
    "instant-mesh",
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
                # ponytail: a provider with repo+weights but runtime_partial
                # (deps failed) must NOT be marked fully available. The
                # engine would try to load it and crash. Report it as
                # partially available with the blocking reason so the UI
                # can show the user what's wrong (see Issue 9).
                overall_state = info.get("state", "unknown")
                installed = info.get("installed", False)
                weights_ready = info.get("weights_ready", True)
                if not weights_ready and name != "mock":
                    registry.set_available(
                        name,
                        available=False,
                        reason=info.get("blocking_reason", "Weights not downloaded"),
                    )
                elif overall_state == "runtime_ready":
                    registry.set_available(
                        name,
                        available=True,
                        reason="",
                    )
                elif overall_state in ("runtime_partial", "partial"):
                    # Partial: repo+weights present but something is degraded.
                    # Mark as not-fully-available so the engine won't auto-select it.
                    registry.set_available(
                        name,
                        available=False,
                        reason=info.get("blocking_reason", "Runtime is in partial state"),
                    )
                elif overall_state in ("runtime_failed", "failed", "blocked"):
                    registry.set_available(
                        name,
                        available=False,
                        reason=info.get("blocking_reason", f"Runtime state: {overall_state}"),
                    )
                else:
                    # Unknown / not_installed / discovered: fall back to installed flag
                    registry.set_available(
                        name,
                        available=installed,
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


def get_provider(name: str, device: str | None = None, low_vram: bool = False):
    """Return a provider instance for download or 3D generation flows."""
    normalized = _canonical_runtime_provider_name(name)

    runtime_entry = _RUNTIME_PROVIDER_MAP.get(normalized)
    if runtime_entry:
        import importlib

        module_path, class_name = runtime_entry
        module = importlib.import_module(module_path)
        provider_cls = getattr(module, class_name)
        target_device = device or "cuda:0"
        try:
            return provider_cls(device=target_device, low_vram=low_vram)
        except TypeError:
            return provider_cls(device=target_device)

    try:
        return ProviderRegistry.get_provider(normalized)
    except ValueError as exc:
        logger.error("Provider '%s' not available: %s", name, exc)
        raise
