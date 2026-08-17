"""Load and validate model installation manifests.

Each manifest is the authoritative installation contract for a provider.
Manifests live in backend/runtime/manifests/ as YAML files.
"""
from __future__ import annotations
import logging
import re
from pathlib import Path
logger = logging.getLogger(__name__)
_MANIFEST_DIR = Path(__file__).resolve().parent / "manifests"
# Canonical provider_name -> manifest filename mapping.
_PROVIDER_MANIFEST_MAP: dict[str, str] = {
    "hunyuan3d-2.1": "hunyuan3d_21.yaml",
    "hunyuan3d-2": "hunyuan3d_2.yaml",
    "hunyuan3d-2-mini": "hunyuan3d_2_mini.yaml",
    "trellis": "trellis.yaml",
    "anigen": "anigen.yaml",
    "unirig": "unirig.yaml",
    "triposg": "triposg.yaml",
    "detailgen3d": "detailgen3d.yaml",
}
# Required top-level keys in every manifest.
_REQUIRED_KEYS = {"name", "source", "environment", "dependencies", "weights", "hardware", "capabilities", "preflight"}


def _provider_to_filename(provider_name: str) -> str:
    """Convert a provider name like 'hunyuan3d-2.1' to a manifest filename."""
    if provider_name in _PROVIDER_MANIFEST_MAP:
        return _PROVIDER_MANIFEST_MAP[provider_name]
    # Fallback: replace dots/hyphens with underscores, append .yaml
    safe = re.sub(r"[^a-zA-Z0-9]", "_", provider_name)
    return f"{safe}.yaml"


def load_manifest(provider_name: str) -> dict:
    """Load and validate one model manifest.

    Args:
        provider_name: Canonical provider name (e.g. 'hunyuan3d-2.1').

    Returns:
        Parsed manifest dict.

    Raises:
        ValueError: If the provider has no manifest or the schema is invalid.
    """
    filename = _provider_to_filename(provider_name)
    manifest_path = _MANIFEST_DIR / filename
    if not manifest_path.exists():
        available = sorted(p.stem for p in _MANIFEST_DIR.glob("*.yaml"))
        raise ValueError(
            f"No manifest found for provider '{provider_name}'. "
            f"Looked for: {manifest_path}. "
            f"Available manifests: {available}"
        )
    try:
        import yaml
    except ImportError:
        raise ImportError(
            "PyYAML is required to load manifests. Install it with: pip install pyyaml"
        )
    with open(manifest_path, "r") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError(
            f"Manifest {manifest_path} must be a YAML mapping, got {type(data).__name__}"
        )
    # Validate required top-level keys.
    missing = _REQUIRED_KEYS - set(data.keys())
    if missing:
        raise ValueError(
            f"Manifest {manifest_path} is missing required keys: {sorted(missing)}. "
            f"Required: {sorted(_REQUIRED_KEYS)}"
        )
    # Validate name matches provider_name.
    if data.get("name") != provider_name:
        logger.warning(
            "Manifest name '%s' does not match provider_name '%s'",
            data.get("name"), provider_name,
        )
    return data


def list_manifests() -> list[str]:
    """Return a list of all available provider names that have manifests."""
    providers = []
    for provider_name, filename in _PROVIDER_MANIFEST_MAP.items():
        if (_MANIFEST_DIR / filename).exists():
            providers.append(provider_name)
    return sorted(providers)
