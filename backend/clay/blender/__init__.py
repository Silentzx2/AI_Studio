"""Headless Blender engine — Clay's mesh-processing backend (FBX/rig/retopo/bake)."""

from __future__ import annotations

from .engine import (
    BlenderError,
    available,
    require_blender,
    resolve_blender,
    run_script,
)
from .ops import bake_normals, export_fbx, retopo, rig_asset

__all__ = [
    "BlenderError",
    "available",
    "resolve_blender",
    "require_blender",
    "run_script",
    "export_fbx",
    "retopo",
    "bake_normals",
    "rig_asset",
]
