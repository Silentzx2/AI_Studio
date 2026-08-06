"""Capability matrix for model-driven feature gating.

The Settings → Pipelines page and Workspace pages use this module as the single
source of truth for which higher-level features should be exposed to the user,
and which models are compatible with which workspaces.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any


FEATURE_KEYS = (
    "texture_generation",
    "rigging_animation",
    "detail_enhancement",
    "text_to_3d",
    "image_to_3d",
)

# Workspace types that map to frontend workspace tabs / task flows.
WORKSPACE_TYPES = (
    "mesh-generation",
    "texture-generation",
    "rigging",
    "animation",
    "segmentation",
    "remesh",
    "post-processing",
)


def _normalize_model_id(model_id: str | None) -> str:
    return (model_id or "").strip().lower()


def _is_enabled(model: dict[str, Any], enabled_map: dict[str, bool] | None = None) -> bool:
    model_id = _normalize_model_id(model.get("id"))
    if not model.get("installed", False):
        return False
    if enabled_map is None:
        return True
    return bool(enabled_map.get(model_id, model.get("enabled", True)))


def _capabilities(model: dict[str, Any]) -> dict[str, bool]:
    manifest = model.get("manifest") or {}
    caps = manifest.get("capabilities") or {}
    return {
        "texture_generation": bool(caps.get("texture_generation") or caps.get("supports_texture") or model.get("supports_texture")),
        "rigging_animation": bool(caps.get("rigging_animation") or caps.get("rigging") or model.get("supports_rigging")),
        "detail_enhancement": bool(caps.get("detail_enhancement") or caps.get("detail") or model.get("supports_detail_enhancement")),
        "text_to_3d": bool(caps.get("text_to_3d") or model.get("supports_text_to_3d")),
        "image_to_3d": bool(caps.get("image_to_3d") or model.get("supports_image_to_3d")),
    }


def _workspace_compatibility(model: dict[str, Any]) -> list[str]:
    """Return the list of workspace types this model is compatible with.

    Reads from model manifest first, then falls back to PROVIDER_METADATA-style
    top-level keys. If neither is present, derives compatibility from capabilities.
    """
    manifest = model.get("manifest") or {}
    caps = manifest.get("capabilities") or {}

    # 1. Explicit metadata on the model dict or manifest
    explicit = model.get("workspace_compatibility") or manifest.get("workspace_compatibility")
    if explicit:
        return [str(w).strip().lower() for w in explicit if str(w).strip()]

    # 2. Derive from capability flags
    derived: list[str] = []
    if caps.get("text_to_3d") or caps.get("image_to_3d"):
        derived.append("mesh-generation")
    if caps.get("texture_generation"):
        derived.append("texture-generation")
    if caps.get("rigging_animation"):
        derived.append("rigging")
        derived.append("animation")
    if caps.get("segmentation"):
        derived.append("segmentation")
    if caps.get("remesh"):
        derived.append("remesh")
    if caps.get("detail_enhancement"):
        derived.append("post-processing")
    return derived


def is_compatible_with_workspace(model: dict[str, Any], workspace: str) -> bool:
    """Return True if the model can be used in the given workspace."""
    if not workspace:
        return True
    ws = workspace.strip().lower()
    compat = _workspace_compatibility(model)
    return ws in compat


def filter_by_workspace(models: Iterable[dict[str, Any]], workspace: str) -> list[dict[str, Any]]:
    """Filter a list of models to only those compatible with the given workspace."""
    if not workspace:
        return list(models)
    return [m for m in models if is_compatible_with_workspace(m, workspace)]


def compute_enabled_features(
    models: Iterable[dict[str, Any]],
    enabled_map: dict[str, bool] | None = None,
) -> dict[str, bool]:
    """Return the feature flags that should be exposed in the UI."""
    enabled_models = [m for m in models if _is_enabled(m, enabled_map)]
    features = {key: False for key in FEATURE_KEYS}

    for model in enabled_models:
        caps = _capabilities(model)
        features["texture_generation"] = features["texture_generation"] or caps["texture_generation"]
        features["rigging_animation"] = features["rigging_animation"] or caps["rigging_animation"]
        features["detail_enhancement"] = features["detail_enhancement"] or caps["detail_enhancement"]
        features["text_to_3d"] = features["text_to_3d"] or caps["text_to_3d"]
        features["image_to_3d"] = features["image_to_3d"] or caps["image_to_3d"]

    return features


def build_pipeline_snapshot(
    models: Iterable[dict[str, Any]],
    enabled_map: dict[str, bool] | None = None,
) -> dict[str, Any]:
    """Build a serialisable snapshot for the Settings → Pipelines page."""
    model_list = []
    for model in models:
        model_id = _normalize_model_id(model.get("id"))
        caps = _capabilities(model)
        installed = bool(model.get("installed", False))
        enabled = _is_enabled(model, enabled_map)
        status = model.get("status") or (
            "ready" if installed and enabled else "not_installed" if not installed else "disabled"
        )

        model_list.append({
            "id": model_id,
            "label": model.get("label") or model.get("name") or model_id,
            "name": model.get("name") or model_id,
            "category": model.get("category") or "unknown",
            "status": status,
            "installed": installed,
            "enabled": enabled,
            "available": bool(model.get("available", installed)),
            "vram_required_mb": int(model.get("vram_required_mb") or model.get("manifest", {}).get("recommended_vram_mb") or model.get("manifest", {}).get("min_vram_mb") or 0),
            "speed_seconds": int(model.get("speed_seconds") or model.get("manifest", {}).get("speed_seconds") or 0),
            "supports": caps,
            "workspace_compatibility": _workspace_compatibility(model),
            "repo": model.get("manifest", {}).get("runtime", {}).get("repo") or model.get("repo"),
            "weight_key": model.get("manifest", {}).get("runtime", {}).get("weight_key") or model.get("weight_key"),
            "notes": model.get("notes") or [],
        })

    features = compute_enabled_features(model_list, enabled_map)
    input_modes = []
    if features["text_to_3d"]:
        input_modes.append("text-to-3d")
    if features["image_to_3d"] or not input_modes:
        input_modes.append("image-to-3d")

    return {
        "pipelines": model_list,
        "computed_features": features,
        "input_modes": input_modes,
        "total_models": len(model_list),
    }
