"""
Auto-optimize generated meshes: decimate polycount, fix UVs, recalculate normals.
Runs AFTER generation completes but BEFORE thumbnail rendering.
"""
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Module-level cache for backend availability (checked once per process)
_DECIMATION_BACKEND_AVAILABLE: bool | None = None


def _check_decimation_backend() -> bool:
    """Check whether at least one decimation backend is available.

    Returns True if trimesh's simplify_quadric_decimation OR pymeshlab
    is available. Caches the result to avoid repeated imports.
    """
    global _DECIMATION_BACKEND_AVAILABLE
    if _DECIMATION_BACKEND_AVAILABLE is not None:
        return _DECIMATION_BACKEND_AVAILABLE

    # trimesh's simplify_quadric_decimation is the primary backend
    try:
        import trimesh
        # Verify the method actually exists (it requires fast_simplification or
        # Open3D backend at runtime)
        if hasattr(trimesh, "Trimesh") and hasattr(
            trimesh.Trimesh, "simplify_quadric_decimation"
        ):
            _DECIMATION_BACKEND_AVAILABLE = True
            return True
    except ImportError:
        pass

    # PyMeshLab is the fallback backend
    try:
        import pymeshlab  # noqa: F401
        _DECIMATION_BACKEND_AVAILABLE = True
        return True
    except ImportError:
        pass

    _DECIMATION_BACKEND_AVAILABLE = False
    return False


def _get_blender_env(blender_bin: str) -> dict[str, str]:
    """Dynamically build an environment for running headless Blender.

    Avoids hardcoding machine-specific paths by extracting site-packages from
    the currently executing Python runtime (venv, conda, or system) and resolving
    Blender's Python home automatically.
    """
    import os
    import sys
    from pathlib import Path

    env = os.environ.copy()

    # Discover site-packages / dist-packages dynamically from current Python runtime
    discovered_site_dirs: list[str] = []
    try:
        import site
        if hasattr(site, "getsitepackages"):
            for p in site.getsitepackages():
                if os.path.isdir(p) and p not in discovered_site_dirs:
                    discovered_site_dirs.append(p)
        if hasattr(site, "getusersitepackages"):
            up = site.getusersitepackages()
            if isinstance(up, str) and os.path.isdir(up) and up not in discovered_site_dirs:
                discovered_site_dirs.append(up)
    except Exception:
        pass

    for p in sys.path:
        if p and ("site-packages" in p or "dist-packages" in p) and os.path.isdir(p):
            if p not in discovered_site_dirs:
                discovered_site_dirs.append(p)

    if discovered_site_dirs:
        existing_pp = env.get("PYTHONPATH", "")
        parts = discovered_site_dirs + ([existing_pp] if existing_pp else [])
        env["PYTHONPATH"] = os.pathsep.join(parts)

    # Determine PYTHONHOME for Blender if needed
    blender_real = Path(os.path.realpath(blender_bin))
    bundled_python = None
    for child in blender_real.parent.glob("*/python"):
        if child.is_dir():
            bundled_python = child
            break

    if bundled_python and bundled_python.is_dir():
        env["PYTHONHOME"] = str(bundled_python)
    elif str(blender_real).startswith("/usr"):
        env["PYTHONHOME"] = "/usr"

    return env


def _run_blender_remesh(
    input_path: str,
    output_path: str,
    target_polycount: int,
    fix_uvs: bool,
    preserve_details: float,
    remesh_mode: str = "adaptive",
    voxel_size: float = 0.05,
) -> dict[str, Any] | None:
    """Attempt remeshing and decimation using headless Blender 4.x.

    Returns dict of stats on success, or None if Blender is not available or fails.
    """
    import os
    import shutil
    import subprocess

    blender_bin = shutil.which("blender")
    if not blender_bin:
        return None

    # Dynamically resolve Blender's runtime environment
    env = _get_blender_env(blender_bin)

    script = f"""
import bpy, os, sys

try:
    input_path = {repr(input_path)}
    output_path = {repr(output_path)}
    target_polycount = {int(target_polycount)}
    fix_uvs = {bool(fix_uvs)}
    preserve_details = {float(preserve_details)}
    remesh_mode = {repr(remesh_mode)}
    voxel_size = {float(voxel_size)}

    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = os.path.splitext(input_path)[1].lower()
    if ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=input_path)
    elif ext == '.obj':
        bpy.ops.wm.obj_import(filepath=input_path)
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=input_path)
    else:
        bpy.ops.import_scene.gltf(filepath=input_path)

    mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not mesh_objs:
        sys.exit(1)

    total_in_faces = sum(len(o.data.polygons) for o in mesh_objs)
    total_in_verts = sum(len(o.data.vertices) for o in mesh_objs)
    print(f"BLENDER_IN_FACES={{total_in_faces}}")
    print(f"BLENDER_IN_VERTS={{total_in_verts}}")

    for obj in mesh_objs:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        curr_faces = len(obj.data.polygons)
        if curr_faces == 0:
            continue

        if remesh_mode == 'uniform' and voxel_size > 0.005:
            try:
                obj.data.remesh_voxel_size = voxel_size
                bpy.ops.object.voxel_remesh()
            except Exception:
                pass

        new_faces = len(obj.data.polygons)
        if new_faces > target_polycount:
            ratio = max(0.01, min(1.0, target_polycount / max(1, new_faces)))
            scaled_ratio = ratio * (0.5 + preserve_details / 200.0)
            final_ratio = max(0.01, min(1.0, scaled_ratio))
            mod = obj.modifiers.new(name="Decimate", type="DECIMATE")
            mod.ratio = final_ratio
            bpy.ops.object.modifier_apply(modifier=mod.name)

        try:
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.normals_make_consistent(inside=False)
            if fix_uvs and not obj.data.uv_layers:
                bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception:
            pass

    total_out_faces = sum(len(o.data.polygons) for o in mesh_objs)
    total_out_verts = sum(len(o.data.vertices) for o in mesh_objs)
    print(f"BLENDER_OUT_FACES={{total_out_faces}}")
    print(f"BLENDER_OUT_VERTS={{total_out_verts}}")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=output_path, export_format='GLB')
    print("BLENDER_EXPORT_SUCCESS")
except Exception as e:
    print(f"BLENDER_ERROR: {{e}}", file=sys.stderr)
    sys.exit(1)
"""

    try:
        proc = subprocess.run(
            [blender_bin, "-b", "--python-expr", script],
            env=env,
            capture_output=True,
            text=True,
            timeout=90,
        )
        if proc.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            in_faces = 0
            out_faces = 0
            in_verts = 0
            out_verts = 0
            for line in proc.stdout.splitlines():
                if line.startswith("BLENDER_IN_FACES="):
                    in_faces = int(line.split("=", 1)[1])
                elif line.startswith("BLENDER_OUT_FACES="):
                    out_faces = int(line.split("=", 1)[1])
                elif line.startswith("BLENDER_IN_VERTS="):
                    in_verts = int(line.split("=", 1)[1])
                elif line.startswith("BLENDER_OUT_VERTS="):
                    out_verts = int(line.split("=", 1)[1])

            reduction = (
                round((1 - out_faces / in_faces) * 100, 1)
                if in_faces > 0
                else 0.0
            )
            logger.info("Blender remesh successful: %d -> %d faces (reduction %.1f%%)", in_faces, out_faces, reduction)
            return {
                "original_polycount": in_faces,
                "optimized_polycount": out_faces,
                "original_vertex_count": in_verts,
                "optimized_vertex_count": out_verts,
                "reduction_percent": reduction,
                "uv_fixes_applied": fix_uvs,
                "success": True,
                "backend": "blender",
            }
        else:
            logger.warning("Blender remesh process exited with code %d", proc.returncode)
            return None
    except Exception as exc:
        logger.warning("Blender remesh execution failed: %s", exc)
        return None


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
    remesh_mode: str = "adaptive",
    voxel_size: float = 0.05,
) -> dict[str, Any]:
    """Optimize a mesh by decimating to target polycount and fixing UVs.

    Tries Blender headless modifier pass first for top quality topology,
    then falls back to Trimesh quadric decimation or PyMeshLab.
    """
    # 1. Try Blender headless optimization first if available
    blender_result = _run_blender_remesh(
        input_path=input_path,
        output_path=output_path,
        target_polycount=target_polycount,
        fix_uvs=fix_uvs,
        preserve_details=preserve_details,
        remesh_mode=remesh_mode,
        voxel_size=voxel_size,
    )
    if blender_result is not None:
        return blender_result

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

    # Validate decimation backend availability BEFORE processing
    # so we fail fast with a clear error instead of silently returning
    # an un-decimated mesh.
    if not _check_decimation_backend():
        logger.warning(
            "No decimation backend available — install fast_simplification "
            "(pip install fast-simplification) or pymeshlab for trimesh decimation"
        )
        import shutil
        shutil.copy(input_path, output_path)
        return {
            "original_polycount": 0,
            "optimized_polycount": 0,
            "reduction_percent": 0.0,
            "uv_fixes_applied": False,
            "success": False,
            "error": (
                "No decimation backend available. Install fast-simplification "
                "(pip install fast-simplification) or pymeshlab to enable mesh decimation."
            ),
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

    # Basic cleanup (trimesh API differs across supported releases).
    if hasattr(mesh, "remove_degenerate_faces"):
        mesh.remove_degenerate_faces()
    else:
        mesh.update_faces(mesh.nondegenerate_faces())
    if hasattr(mesh, "remove_duplicate_faces"):
        mesh.remove_duplicate_faces()
    else:
        mesh.update_faces(mesh.unique_faces())
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
            logger.warning("Quadric decimation failed: %s", exc)
            try:
                import pymeshlab
                ms = pymeshlab.MeshSet()
                try:
                    ms.load_new_mesh(input_path)
                except Exception:
                    ms.add_mesh(pymeshlab.Mesh(vertex_matrix=mesh.vertices, face_matrix=mesh.faces), "mesh")
                curr = ms.current_mesh()
                has_tex = False
                try:
                    has_tex = curr.has_wedge_tex_coord() or curr.has_vertex_tex_coord()
                except Exception:
                    pass
                if has_tex:
                    ms.meshing_decimation_quadric_edge_collapse_with_texture(
                        targetfacenum=adjusted_target,
                        preserveboundary=True,
                    )
                else:
                    ms.meshing_decimation_quadric_edge_collapse(
                        targetfacenum=adjusted_target,
                        preserveboundary=True,
                        preservenormal=True,
                        preservetopology=True,
                    )
                ms.save_current_mesh(output_path)
                opt_mesh = trimesh.load(output_path, force="mesh")
                optimized_polycount = len(opt_mesh.faces)
                mesh = opt_mesh
            except ImportError:
                logger.warning("PyMeshLab not installed — keeping cleaned mesh without decimation")
            except Exception as exc2:
                logger.warning("PyMeshLab decimation also failed: %s", exc2)

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
