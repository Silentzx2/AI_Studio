"""Load and validate model installation manifests.

Each manifest is the authoritative installation contract for a provider.
Manifests live in backend/runtime/manifests/ as YAML files.

Compatibility views (REPOS, HF_MODELS, PROVIDER_METADATA) are generated
from manifests — they are not hardcoded configuration.
"""
from __future__ import annotations
import logging
import re
import time
from pathlib import Path

_POST_PROCESSING_ONLY_PROVIDERS = frozenset({"detailgen3d"})


def is_standalone_generation_provider(name: str) -> bool:
    """Return True if ``name`` can be used as a standalone generation provider.

    Post-processing-only providers (e.g. DetailGen3D) return False so the
    frontend can exclude them from generation-target selectors while still
    offering them as a detail/refinement stage.
    """
    return name.lower() not in _POST_PROCESSING_ONLY_PROVIDERS

logger = logging.getLogger(__name__)
_MANIFEST_DIR = Path(__file__).resolve().parent / "manifests"
# Provider names are discovered from manifest `name` fields.
# This keeps the model installation registry YAML-only: adding a model requires
# adding its manifest, not editing a Python provider/file-name mapping.
# Required top-level keys in every manifest.
_REQUIRED_KEYS = {"name", "source", "environment", "dependencies", "weights", "hardware", "capabilities", "preflight"}

# ponytail: manifest parsing is pure CPU + YAML decode and is called from many
# hot paths (runtime status, health checks, options). Without a cache every
# /runtime/status request re-parsed all 6 manifests 3+ times, adding seconds.
# Cache is short (30s) and invalidated explicitly on manifest edits via
# invalidate_manifest_cache(). Upgrade path: watch the manifests dir for
# filesystem changes instead of a fixed TTL.
_manifest_cache: dict[str, dict] = {}
_manifest_cache_ts: float = 0.0
_MANIFEST_TTL = 30.0


def invalidate_manifest_cache() -> None:
    """Drop the cached manifests so the next read re-parses from disk."""
    global _manifest_cache, _manifest_cache_ts
    _manifest_cache = {}
    _manifest_cache_ts = 0.0


def _manifest_path(provider_name: str) -> Path:
    """Resolve a provider name to its YAML manifest without a Python-side map."""
    wanted = provider_name.strip().lower()
    if not wanted:
        raise ValueError("Provider name cannot be empty")
    candidates = sorted(_MANIFEST_DIR.glob("*.yaml"))
    # Prefer a filename-derived match for fast, predictable lookup.
    # Preserve dots so "hunyuan3d-2.1" normalizes to "hunyuan3d_2.1" (not "hunyuan3d_2_1").
    safe = re.sub(r"[^a-z0-9.]", "_", wanted)
    filename_match = _MANIFEST_DIR / f"{safe}.yaml"
    if filename_match.exists():
        return filename_match
    # Fall back to the manifest's canonical `name` field. This supports names
    # whose filename intentionally differs (for example hunyuan3d_21.yaml).
    try:
        import yaml
    except ImportError as exc:
        raise ImportError("PyYAML is required to load manifests") from exc
    for path in candidates:
        try:
            with open(path, "r") as f:
                data = yaml.safe_load(f)
            if isinstance(data, dict) and str(data.get("name", "")).strip().lower() == wanted:
                return path
        except (OSError, yaml.YAMLError):
            continue
    raise ValueError(f"No manifest found for provider '{provider_name}'")


def _load_manifest_file(manifest_path: Path) -> dict:
    try:
        import yaml
    except ImportError as exc:
        raise ImportError(
            "PyYAML is required to load manifests. Install it with: pip install pyyaml"
        ) from exc
    with open(manifest_path, "r") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError(
            f"Manifest {manifest_path} must be a YAML mapping, got {type(data).__name__}"
        )
    missing = _REQUIRED_KEYS - set(data.keys())
    if missing:
        raise ValueError(
            f"Manifest {manifest_path} is missing required keys: {sorted(missing)}. "
            f"Required: {sorted(_REQUIRED_KEYS)}"
        )
    return data


def load_manifest(provider_name: str) -> dict:
    """Load and validate one model manifest."""
    manifest_path = _manifest_path(provider_name)
    data = _load_manifest_file(manifest_path)
    manifest_name = str(data.get("name", ""))
    if manifest_name.lower() != provider_name.lower():
        logger.warning(
            "Manifest name '%s' does not match provider_name '%s'",
            manifest_name, provider_name,
        )
    return data

def list_manifests() -> list[str]:
    """Return provider names discovered from all YAML manifests.

    Cached alongside load_all_manifests() — re-globbing + parsing the name
    field of every manifest on every call is pure waste on hot paths.
    """
    global _manifest_cache, _manifest_cache_ts
    now = time.monotonic()
    if _manifest_cache and (now - _manifest_cache_ts) < _MANIFEST_TTL:
        return list(_manifest_cache.keys())
    providers: list[str] = []
    for path in sorted(_MANIFEST_DIR.glob("*.yaml")):
        try:
            data = _load_manifest_file(path)
            name = str(data.get("name", "")).strip()
            if name:
                providers.append(name.lower())
        except Exception as exc:
            logger.warning("Skipping invalid manifest %s: %s", path, exc)
    return sorted(set(providers))


def load_all_manifests() -> dict[str, dict]:
    """Load all manifests into a dict: provider_name -> manifest.

    Cached for _MANIFEST_TTL seconds — parsing all 6 manifests is pure CPU +
    YAML decode and is hit from many hot paths (runtime status, health checks,
    options), so a cache cuts /runtime/status from seconds to milliseconds.
    """
    global _manifest_cache, _manifest_cache_ts
    now = time.monotonic()
    if _manifest_cache and (now - _manifest_cache_ts) < _MANIFEST_TTL:
        return _manifest_cache
    result: dict[str, dict] = {}
    for provider_name in list_manifests():
        try:
            result[provider_name] = load_manifest(provider_name)
        except Exception as exc:
            logger.warning("Skipping invalid manifest %s: %s", provider_name, exc)
    _manifest_cache = result
    _manifest_cache_ts = now
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
    """Build REPOS-compatible registry from manifests.

    This is a generated compatibility view; data originates from YAML manifests.
    """
    registry: dict[str, dict] = {}
    for provider, manifest in load_all_manifests().items():
        source = manifest.get("source", {}) or {}
        repo_url = source.get("repo")
        if not repo_url:
            continue
        repo_name = _repo_name_from_manifest(manifest, provider)
        cfg = registry.setdefault(repo_name, {
            "url": repo_url,
            "branch": source.get("ref", "main"),
            "requirements": source.get("requirements"),
            "category": (manifest.get("hardware") or {}).get("category", "3d_generation"),
            "providers": [],
        })
        if provider not in cfg["providers"]:
            cfg["providers"].append(provider)
        # Prefer the explicit source metadata from the first manifest; shared
        # repos intentionally use one checkout.
    return registry


def _build_weight_registry() -> dict[str, dict]:
    """Build HF_MODELS-compatible weight registry from manifests.

    This is a generated compatibility view; data originates from YAML manifests.
    """
    result: dict[str, dict] = {}
    for provider, manifest in load_all_manifests().items():
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
        # Register auxiliary weights so download_weights() can look them up
        for aux in weights.get("auxiliary", []) or []:
            if not isinstance(aux, dict):
                continue
            aux_repo = aux.get("repo")
            if not aux_repo:
                continue
            aux_entry = {
                "repo": aux_repo,
                "size_estimate_gb": aux.get("size_estimate_gb", 2.0),
                "allow_patterns": aux.get("allow_patterns"),
                "ignore_patterns": aux.get("ignore_patterns"),
            }
            if aux.get("name"):
                result.setdefault(aux["name"], aux_entry)
            result.setdefault(aux_repo, aux_entry)
    return result


def _build_flat_capabilities(capabilities: dict, provider_name: str = "") -> dict:
    """Build the flat capabilities dict (supports_* booleans) from manifest capabilities."""
    flat = {}
    for cap_name, cap_info in capabilities.items():
        if not isinstance(cap_info, dict):
            continue
        # Copy all supports_* keys from the capability
        for key, value in cap_info.items():
            if key.startswith("supports_"):
                flat[key] = value

    shape_cap = capabilities.get("shape", {}) if isinstance(capabilities.get("shape"), dict) else {}
    tex_cap = capabilities.get("texture_pbr", {}) or capabilities.get("texture", {})
    if not isinstance(tex_cap, dict):
        tex_cap = {}
    detail_cap = capabilities.get("detail_enhancement", {}) if isinstance(capabilities.get("detail_enhancement"), dict) else {}

    shape_enabled = bool(shape_cap.get("enabled", False))
    tex_enabled = bool(tex_cap.get("enabled", False))
    is_standalone = is_standalone_generation_provider(provider_name) if provider_name else True

    if "supports_text_to_3d" not in flat:
        flat["supports_text_to_3d"] = shape_enabled and (
            bool(shape_cap.get("supports_text_to_3d", False)) or provider_name in ("hunyuan3d-2.1",)
        )
    if "supports_image_to_3d" not in flat:
        flat["supports_image_to_3d"] = shape_enabled and is_standalone
    if "supports_texture_generation" not in flat:
        flat["supports_texture_generation"] = tex_enabled or bool(tex_cap.get("supports_texture_generation", False))
    if "supports_detail_enhancement" not in flat:
        flat["supports_detail_enhancement"] = bool(detail_cap.get("enabled", False))

    return flat


def get_provider_metadata(provider_name: str) -> dict:
    """Build a PROVIDER_METADATA-compatible dict from the manifest.

    This is a generated compatibility view; data originates from YAML manifests.
    """
    manifest = load_manifest(provider_name)
    return _build_provider_metadata(provider_name, manifest)


def _build_provider_metadata(provider_name: str, manifest: dict) -> dict:
    """Build PROVIDER_METADATA-compatible dict from an already-loaded manifest."""
    hw = manifest.get("hardware", {}) or {}
    caps = manifest.get("capabilities", {}) or {}
    source = manifest.get("source", {}) or {}
    weights = manifest.get("weights", {}) or {}
    runtime = manifest.get("runtime", {}) or {}

    # Determine native_build_required from capabilities
    native_build_required = any(
        v.get("native_build_required", False)
        for v in caps.values()
        if isinstance(v, dict) and v.get("enabled", True)
    )

    flat_caps = _build_flat_capabilities(caps, provider_name)
    shape_cap = caps.get("shape", {}) if isinstance(caps.get("shape"), dict) else {}
    tex_cap = caps.get("texture_pbr", {}) or caps.get("texture", {})
    if not isinstance(tex_cap, dict):
        tex_cap = {}
    detail_cap = caps.get("detail_enhancement", {}) if isinstance(caps.get("detail_enhancement"), dict) else {}

    shape_enabled = bool(shape_cap.get("enabled", False))
    tex_enabled = bool(tex_cap.get("enabled", False))
    is_standalone = is_standalone_generation_provider(provider_name)

    supports_text = flat_caps.get("supports_text_to_3d", shape_enabled and provider_name in ("hunyuan3d-2.1",))
    supports_image = flat_caps.get("supports_image_to_3d", shape_enabled and is_standalone)
    supports_tex = flat_caps.get("supports_texture_generation", tex_enabled)
    supports_detail = flat_caps.get("supports_detail_enhancement", bool(detail_cap.get("enabled", False)))

    return {
        "label": manifest.get("label", provider_name),
        "category": hw.get("category", "3d_generation"),
        "supports_text_to_3d": supports_text,
        "supports_image_to_3d": supports_image,
        "supports_texture": supports_tex,
        "supports_detail_enhancement": supports_detail,
        "vram_required_mb": hw.get("recommended_vram_mb", 0),
        "low_vram_supported": hw.get("low_vram_supported", False),
        "low_vram_required_mb": hw.get("low_vram_required_mb", 0),
        "low_vram_strategy": hw.get("low_vram_strategy", []),
        "native_build_required": native_build_required,
        "install_method": runtime.get("install_method", "uv_requirements"),
        "capabilities": flat_caps,
        "repo": source.get("local_dir"),
        "weight_key": weights.get("primary", {}).get("repo"),
        "workspace_compatibility": runtime.get("workspace_compatibility", []),
        "size_estimate_gb": weights.get("size_estimate_gb", 0),
    }


def get_all_provider_metadata() -> dict[str, dict]:
    """Build PROVIDER_METADATA-compatible dict for all providers.

    Built from the cached manifest dict so a full scan does not re-parse
    every YAML on each call — that was the dominant cost of /runtime/status.
    """
    manifests = load_all_manifests()
    return {pid: _build_provider_metadata(pid, m) for pid, m in manifests.items()}


# Compatibility views generated from manifests — NOT hardcoded configuration.
# These replace the old REPOS, HF_MODELS, PROVIDER_METADATA in installer.py
REPOS = _build_repo_registry()
HF_MODELS = _build_weight_registry()
PROVIDER_METADATA = get_all_provider_metadata()