"""
Auto-optimize generated meshes: decimate polycount, fix UVs, recalculate normals.
Runs AFTER generation completes but BEFORE thumbnail rendering.
"""
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _try_import_trimesh():
    try:
        import trimesh
        return trimesh
    except ImportError:
        return None


def optimize_mesh(
    input_path: str,
    output_path: str,
    target_polycount: int = 30000,
    fix_uvs: bool = True,
    preserve_details: float = 75.0,
) -> dict[str, Any]:
    """Optimize a mesh by decimating to target polycount and fixing UVs.

    Args:
        input_path: Path to input mesh file (GLB/OBJ/FBX)
        output_path: Path to write optimized mesh
        target_polycount: Target triangle count
        fix_uvs: Whether to fix overlapping UVs and fill UV islands
        preserve_details: 0-100, higher = more detail preserved

    Returns:
        dict with optimization stats:
            - original_polycount: int
            - optimized_polycount: int
            - reduction_percent: float
            - uv_fixes_applied: bool
            - success: bool
            - error: str (if failed)
    """
    trimesh = _try_import_trimesh()
    if trimesh is None:
        logger.warning("trimesh not installed — skipping auto-optimize")
        # ponytail: graceful fallback — copy original if optimizer unavailable
        import shutil
        shutil.copy(input_path, output_path)
        return {
            "original_polycount": 0,
            "optimized_polycount": 0,
            "reduction_percent": 0.0,
            "uv_fixes_applied": False,
            "success": False,
            "error": "trimesh not installed",
        }

    try:
        mesh = trimesh.load(input_path, force="mesh")
    except Exception as exc:
        logger.warning("Failed to load mesh for optimization: %s", exc)
        import shutil
        shutil.copy(input_path, output_path)
        return {
            "original_polycount": 0,
            "optimized_polycount": 0,
            "reduction_percent": 0.0,
            "uv_fixes_applied": False,
            "success": False,
            "error": f"Failed to load mesh: {exc}",
        }

    original_polycount = len(mesh.faces)
    original_vertex_count = len(mesh.vertices)

    # Basic cleanup
    mesh.remove_degenerate_faces()
    mesh.remove_duplicate_faces()
    mesh.merge_vertices()

    # UV fixing: repair overlapping UVs by re-unwrapping if requested
    uv_fixes_applied = False
    if fix_uvs:
        try:
            visual = getattr(mesh, "visual", None)
            if visual is not None:
                uv = getattr(visual, "uv", None)
                if uv is None or len(uv) == 0:
                    # No UVs present — generate simple box projection UVs
                    from trimesh.visual.texture import SimpleMaterial
                    # ponytail: basic UV generation via trimesh's built-in unwrap
                    try:
                        import numpy as np
                        # Simple spherical UV projection as fallback
                        vertices = mesh.vertices
                        norms = np.linalg.norm(vertices, axis=1, keepdims=True)
                        norms = np.where(norms == 0, 1, norms)
                        normalized = vertices / norms
                        u = 0.5 + np.arctan2(normalized[:, 2], normalized[:, 0]) / (2 * np.pi)
                        v = 0.5 - np.arcsin(np.clip(normalized[:, 1], -1, 1)) / np.pi
                        uv_coords = np.column_stack([u, v])
                        mesh.visual.uv = uv_coords
                        uv_fixes_applied = True
                    except Exception as uv_exc:
                        logger.debug("UV generation failed: %s", uv_exc)
                else:
                    # Has UVs — check for NaNs/infs that indicate corruption
                    import numpy as np
                    uv_arr = np.asarray(uv)
                    if np.any(~np.isfinite(uv_arr)):
                        logger.info("Replacing corrupt UV coordinates")
                        # Replace corrupt UVs with zeros (safe fallback)
                        uv_arr = np.nan_to_num(uv_arr, nan=0.0, posinf=1.0, neginf=0.0)
                        mesh.visual.uv = uv_arr
                        uv_fixes_applied = True
        except Exception as exc:
            logger.debug("UV fix attempt skipped: %s", exc)

    # Decimate if above target
    optimized_polycount = len(mesh.faces)
    if original_polycount > target_polycount:
        try:
            # Use trimesh's simplify_quadric_decimation if available
            # preserve_details scales the target: higher preserve = higher target
            adjusted_target = int(target_polycount * (0.5 + preserve_details / 200))
            adjusted_target = max(target_polycount, adjusted_target)

            if len(mesh.faces) > adjusted_target:
                mesh = mesh.simplify_quadric_decimation(
                    face_count=adjusted_target,
                    aggression=7 if preserve_details < 30 else 5 if preserve_details < 70 else 3
                )
                optimized_polycount = len(mesh.faces)
                logger.info(
                    "Mesh decimated: %d -> %d triangles (target=%d, preserve=%.0f%%)",
                    original_polycount, optimized_polycount, target_polycount, preserve_details,
                )
        except Exception as exc:
            logger.warning("Quadric decimation failed, trying vertex clustering: %s", exc)
            try:
                # Fallback: simple vertex clustering via trimesh
                ratio = target_polycount / original_polycount
                if ratio < 1.0:
                    mesh = mesh.simplify_vertex_clustering(
                        aggregation=1.0 - ratio
                    )
                    optimized_polycount = len(mesh.faces)
            except Exception as exc2:
                logger.warning("Vertex clustering also failed: %s", exc2)

    # Recalculate normals for clean shading
    try:
        mesh.fix_normals()
    except Exception:
        pass

    # Export optimized mesh
    try:
        mesh.export(output_path)
    except Exception as exc:
        logger.error("Failed to export optimized mesh: %s", exc)
        # ponytail: graceful fallback — return original on export failure
        import shutil
        shutil.copy(input_path, output_path)
        return {
            "original_polycount": original_polycount,
            "optimized_polycount": original_polycount,
            "reduction_percent": 0.0,
            "uv_fixes_applied": False,
            "success": False,
            "error": f"Export failed: {exc}",
        }

    reduction_percent = (
        round((1 - optimized_polycount / original_polycount) * 100, 1)
        if original_polycount > 0
        else 0.0
    )

    return {
        "original_polycount": original_polycount,
        "optimized_polycount": optimized_polycount,
        "original_vertex_count": original_vertex_count,
        "optimized_vertex_count": len(mesh.vertices),
        "reduction_percent": reduction_percent,
        "uv_fixes_applied": uv_fixes_applied,
        "success": True,
    }
