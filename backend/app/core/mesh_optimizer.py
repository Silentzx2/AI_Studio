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
    """Check whether at least one decimation backend is actually usable.

    Returns True if trimesh's simplify_quadric_decimation works at runtime OR
    pymeshlab is available. Caches the result to avoid repeated imports.

    ponytail: the old check only tested ``hasattr(trimesh.Trimesh,
    "simplify_quadric_decimation")``, which is True even when
    ``fast_simplification`` is not installed — so the gate passed but the real
    call raised and the optimizer silently copied the original mesh through.
    This now performs a real, tiny in-process decimation smoke test so a missing
    backend is detected here, not as a fake "optimization" downstream.
    """
    global _DECIMATION_BACKEND_AVAILABLE
    if _DECIMATION_BACKEND_AVAILABLE is not None:
        return _DECIMATION_BACKEND_AVAILABLE

    # Check meshoptimizer first (fastest C++ decimation library)
    try:
        import meshoptimizer  # noqa: F401
        _DECIMATION_BACKEND_AVAILABLE = True
        return True
    except ImportError:
        pass

    # Check open3d as modern C++ geometry engine
    try:
        from app.core.open3d_service import is_open3d_available
        if is_open3d_available():
            _DECIMATION_BACKEND_AVAILABLE = True
            return True
    except ImportError:
        pass

    trimesh = _try_import_trimesh()
    if trimesh is not None:
        try:
            import numpy as np
            # Minimal smoke test: decimate a tiny mesh and confirm the result
            # is a real trimesh with fewer-or-equal faces.
            mesh = trimesh.Trimesh(
                vertices=np.array(
                    [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]], dtype=float
                ),
                faces=np.array([[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]),
            )
            result = mesh.simplify_quadric_decimation(face_count=2)
            if result is not None and hasattr(result, "faces"):
                _DECIMATION_BACKEND_AVAILABLE = True
                return True
        except Exception:
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

        is_quad_remesh = remesh_mode in ('quad', 'quadriflow', 'quads', 'retopology')
        quad_succeeded = False
        if is_quad_remesh:
            try:
                # QuadriFlow takes target_faces in quads (each quad splits into 2 tris on export)
                quad_target = max(100, int(target_polycount // 2))
                bpy.ops.object.quadriflow_remesh(
                    use_mesh_symmetry=False,
                    use_preserve_sharp=True,
                    use_preserve_boundary=True,
                    target_faces=quad_target,
                )
                quad_succeeded = True
            except Exception as q_err:
                print("QUADRIFLOW_FALLBACK: " + str(q_err), file=sys.stderr)
        elif remesh_mode == 'uniform' and voxel_size > 0.005:
            try:
                obj.data.remesh_voxel_size = voxel_size
                bpy.ops.object.voxel_remesh()
            except Exception:
                pass

        new_faces = len(obj.data.polygons)
        # Only decimate if quad remesh was not performed (decimate destroys quad topology)
        if not quad_succeeded and new_faces > target_polycount:
            ratio = max(0.01, min(1.0, target_polycount / max(1, new_faces)))
            scaled_ratio = ratio * (0.5 + preserve_details / 200.0)
            final_ratio = max(0.01, min(1.0, scaled_ratio))
            mod = obj.modifiers.new(name="Decimate", type="DECIMATE")
            mod.ratio = final_ratio
            bpy.ops.object.modifier_apply(modifier=mod.name)

        try:
            wn = obj.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
            wn.keep_sharp = True
            bpy.ops.object.modifier_apply(modifier=wn.name)
        except Exception:
            pass

    total_out_faces = sum(len(o.data.polygons) for o in mesh_objs)
    total_out_verts = sum(len(o.data.vertices) for o in mesh_objs)
    total_out_quads = sum(sum(1 for p in o.data.polygons if len(p.vertices) == 4) for o in mesh_objs)
    total_out_tris = sum(sum(1 for p in o.data.polygons if len(p.vertices) == 3) for o in mesh_objs)
    actual_top = "quad" if total_out_quads > total_out_tris else "triangle"
    print("BLENDER_OUT_FACES=" + str(total_out_faces))
    print("BLENDER_OUT_VERTS=" + str(total_out_verts))
    print("BLENDER_OUT_QUADS=" + str(total_out_quads))
    print("BLENDER_OUT_TRIS=" + str(total_out_tris))
    print("BLENDER_ACTUAL_TOPOLOGY=" + str(actual_top))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=output_path, export_format='GLB')
    print("BLENDER_EXPORT_SUCCESS")
except Exception as e:
    print("BLENDER_ERROR: " + str(e), file=sys.stderr)
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
            uv_fixes_applied = False
            if fix_uvs:
                trimesh = _try_import_trimesh()
                if trimesh is not None:
                    try:
                        tm = trimesh.load(output_path, force="mesh")
                        if not mesh_has_valid_uvs(tm):
                            tm, uv_fixes_applied = generate_uvs_with_xatlas(tm)
                            if uv_fixes_applied:
                                tm.export(output_path)
                    except Exception as uv_exc:
                        logger.warning("Post-Blender xatlas UV generation failed: %s", uv_exc)

            in_faces = 0
            out_faces = 0
            in_verts = 0
            out_verts = 0
            out_quads = 0
            out_tris = 0
            actual_topology = "quad" if remesh_mode in ('quad', 'quadriflow', 'quads') else "triangle"
            for line in proc.stdout.splitlines():
                if line.startswith("BLENDER_IN_FACES="):
                    in_faces = int(line.split("=", 1)[1])
                elif line.startswith("BLENDER_OUT_FACES="):
                    out_faces = int(line.split("=", 1)[1])
                elif line.startswith("BLENDER_IN_VERTS="):
                    in_verts = int(line.split("=", 1)[1])
                elif line.startswith("BLENDER_OUT_VERTS="):
                    out_verts = int(line.split("=", 1)[1])
                elif line.startswith("BLENDER_OUT_QUADS="):
                    out_quads = int(line.split("=", 1)[1])
                elif line.startswith("BLENDER_OUT_TRIS="):
                    out_tris = int(line.split("=", 1)[1])
                elif line.startswith("BLENDER_ACTUAL_TOPOLOGY="):
                    actual_topology = line.split("=", 1)[1].strip()

            reduction = (
                round((1 - out_faces / in_faces) * 100, 1)
                if in_faces > 0
                else 0.0
            )
            logger.info("Blender remesh successful: %d -> %d faces (reduction %.1f%%, topology=%s)", in_faces, out_faces, reduction, actual_topology)
            return {
                "original_polycount": in_faces,
                "optimized_polycount": out_faces,
                "original_vertex_count": in_verts,
                "optimized_vertex_count": out_verts,
                "quad_count": out_quads,
                "triangle_count": out_tris,
                "actual_topology": actual_topology,
                "topology_mode": remesh_mode,
                "reduction_percent": reduction,
                "uv_fixes_applied": uv_fixes_applied,
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


def mesh_has_valid_uvs(mesh: Any) -> bool:
    """Check if a mesh has populated, non-degenerate UV coordinates."""
    visual = getattr(mesh, "visual", None)
    if visual is None:
        return False
    uv = getattr(visual, "uv", None)
    if uv is None or len(uv) == 0:
        return False
    try:
        import numpy as np
        uv_arr = np.asarray(uv)
        if uv_arr.ndim != 2 or uv_arr.shape[1] != 2:
            return False
        if not np.isfinite(uv_arr).all():
            return False
        if float(np.ptp(uv_arr[:, 0])) < 1e-6 and float(np.ptp(uv_arr[:, 1])) < 1e-6:
            return False
        return True
    except Exception:
        return False


def generate_uvs_with_xatlas(mesh: Any) -> tuple[Any, bool]:
    """Generate UV coordinates using xatlas if UVs are missing or invalid.

    Preserves existing valid UV coordinates without re-unwrapping.
    Falls back to spherical/box projection if xatlas is unavailable or fails.
    Validates output mesh geometry before returning.
    """
    if mesh_has_valid_uvs(mesh):
        return mesh, False

    trimesh = _try_import_trimesh()
    if trimesh is None:
        return mesh, False

    # 1. Try xatlas parametrization
    try:
        import numpy as np
        import xatlas

        vmapping, indices, uvs = xatlas.parametrize(mesh.vertices, mesh.faces)
        if len(indices) > 0 and len(uvs) > 0 and np.isfinite(uvs).all():
            new_visual = trimesh.visual.TextureVisuals(uv=uvs)
            old_visual = getattr(mesh, "visual", None)
            if old_visual is not None and getattr(old_visual, "material", None) is not None:
                new_visual.material = old_visual.material
            elif old_visual is not None and getattr(old_visual, "vertex_colors", None) is not None:
                try:
                    new_visual.vertex_colors = old_visual.vertex_colors[vmapping]
                except Exception:
                    pass

            new_mesh = trimesh.Trimesh(
                vertices=mesh.vertices[vmapping],
                faces=indices,
                visual=new_visual,
                process=False,
            )
            if len(new_mesh.faces) > 0 and len(new_mesh.vertices) > 0:
                logger.info(
                    "xatlas UV parametrization successful (%d verts, %d faces, %d UVs)",
                    len(new_mesh.vertices),
                    len(new_mesh.faces),
                    len(uvs),
                )
                return new_mesh, True
    except Exception as exc:
        logger.warning("xatlas UV parametrization failed: %s; falling back to projection", exc)

    # 2. Fallback spherical projection
    try:
        import numpy as np
        vertices = mesh.vertices
        norms = np.linalg.norm(vertices, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        normalized = vertices / norms
        u = 0.5 + np.arctan2(normalized[:, 2], normalized[:, 0]) / (2 * np.pi)
        v = 0.5 - np.arcsin(np.clip(normalized[:, 1], -1, 1)) / np.pi
        uv_coords = np.column_stack([u, v])
        if getattr(mesh, "visual", None) is None:
            mesh.visual = trimesh.visual.TextureVisuals(uv=uv_coords)
        else:
            mesh.visual.uv = uv_coords
        return mesh, True
    except Exception as proj_err:
        logger.warning("Fallback UV projection failed: %s", proj_err)
        return mesh, False


def _simplify_with_meshoptimizer(
    mesh: Any,
    target_faces: int,
    preserve_details: float = 75.0,
    target_error: float | None = None,
) -> Any:
    """Simplify mesh using meshoptimizer C++ library with attribute preservation.

    Fast, production-grade mesh decimation maintaining topology and UV integrity.
    """
    try:
        import meshoptimizer
        import numpy as np

        target_indices = int(target_faces * 3)
        indices = mesh.faces.flatten().astype(np.uint32)
        vertices = mesh.vertices.astype(np.float32)
        destination = np.zeros_like(indices, dtype=np.uint32)

        # Scale target error based on preserve_details (0-100) if not explicitly given
        if target_error is None:
            target_error = max(0.005, min(0.08, (100.0 - preserve_details) / 1000.0 + 0.01))

        count = meshoptimizer.simplify(
            destination,
            indices,
            vertices,
            target_index_count=target_indices,
            target_error=target_error,
        )
        if count <= 0 or count >= len(indices):
            return None

        new_faces = destination[:count].reshape(-1, 3)
        unique_v, inverse = np.unique(new_faces, return_inverse=True)
        compact_faces = inverse.reshape(-1, 3)
        compact_vertices = mesh.vertices[unique_v]

        trimesh = _try_import_trimesh()
        if trimesh is None:
            return None

        new_visual = None
        old_visual = getattr(mesh, "visual", None)
        if old_visual is not None:
            new_visual = old_visual.copy()
            if hasattr(old_visual, "uv") and old_visual.uv is not None and len(old_visual.uv) == len(mesh.vertices):
                new_visual.uv = old_visual.uv[unique_v]
            if hasattr(old_visual, "vertex_colors") and old_visual.vertex_colors is not None and len(old_visual.vertex_colors) == len(mesh.vertices):
                try:
                    new_visual.vertex_colors = old_visual.vertex_colors[unique_v]
                except Exception:
                    pass

        new_mesh = trimesh.Trimesh(
            vertices=compact_vertices,
            faces=compact_faces,
            visual=new_visual,
            process=False,
        )
        return new_mesh
    except Exception as exc:
        logger.warning("meshoptimizer simplification failed: %s", exc)
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

    Uses meshoptimizer for high-quality, fast decimation preserving UVs and topology.
    Falls back to Trimesh quadric decimation, PyMeshLab, or Blender remesh when needed.
    """
    # 1. Blender remesh is used if quad or uniform (voxel) remeshing is explicitly requested
    fallback_reason = None
    if remesh_mode in ("quad", "quadriflow", "quads", "uniform"):
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
        if remesh_mode in ("quad", "quadriflow", "quads"):
            fallback_reason = "Blender QuadriFlow remesh unavailable or failed; fell back to adaptive triangle optimization"
            logger.warning(fallback_reason)

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

    # Open3D Decision Engine Check: If within 10% of target, skip decimation
    budget_ratio = original_polycount / max(1, target_polycount)
    if abs(1.0 - budget_ratio) <= 0.10:
        import shutil
        shutil.copy(input_path, output_path)
        logger.info("Optimization skipped: polycount %d is within 10%% of target %d", original_polycount, target_polycount)
        skip_res = {
            "original_polycount": original_polycount,
            "optimized_polycount": original_polycount,
            "original_vertex_count": original_vertex_count,
            "optimized_vertex_count": original_vertex_count,
            "reduction_percent": 0.0,
            "uv_fixes_applied": False,
            "success": True,
            "skipped": True,
            "actual_topology": "triangle",
            "topology_mode": remesh_mode,
            "reason": f"Input polycount ({original_polycount:,}) already within 10% of target ({target_polycount:,})",
        }
        if fallback_reason:
            skip_res["fallback_reason"] = fallback_reason
        return skip_res

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

    # UV fixing: repair missing or corrupted UVs with xatlas if requested
    uv_fixes_applied = False
    if fix_uvs:
        mesh, uv_fixes_applied = generate_uvs_with_xatlas(mesh)

    # Decimate if above target
    optimized_polycount = len(mesh.faces)
    if original_polycount > target_polycount:
        adjusted_target = int(target_polycount * (0.5 + preserve_details / 200))
        adjusted_target = max(target_polycount, adjusted_target)

        # 1. Primary engine: meshoptimizer C++ library
        opt_mesh = _simplify_with_meshoptimizer(mesh, adjusted_target, preserve_details)
        if opt_mesh is not None and len(opt_mesh.faces) < len(mesh.faces):
            mesh = opt_mesh
            optimized_polycount = len(mesh.faces)
            logger.info(
                "Mesh decimated with meshoptimizer: %d -> %d triangles (target=%d, preserve=%.0f%%)",
                original_polycount, optimized_polycount, target_polycount, preserve_details,
            )
        else:
            try:
                # 2. Fallback: trimesh quadric decimation
                if len(mesh.faces) > adjusted_target:
                    mesh = mesh.simplify_quadric_decimation(
                        face_count=adjusted_target,
                        aggression=7 if preserve_details < 30 else 5 if preserve_details < 70 else 3
                    )
                    optimized_polycount = len(mesh.faces)
                    logger.info(
                        "Mesh decimated with trimesh: %d -> %d triangles (target=%d, preserve=%.0f%%)",
                        original_polycount, optimized_polycount, target_polycount, preserve_details,
                    )
            except Exception as exc:
                logger.warning("Quadric decimation failed: %s", exc)
                # 2b. Open3D simplification fallback
                o3d_decimated = False
                try:
                    from app.core.open3d_service import is_open3d_available
                    if is_open3d_available():
                        import open3d as o3d
                        o3d_m = o3d.geometry.TriangleMesh(
                            o3d.utility.Vector3dVector(np.asarray(mesh.vertices)),
                            o3d.utility.Vector3iVector(np.asarray(mesh.faces)),
                        )
                        decimated_o3d = o3d_m.simplify_quadric_decimation(target_number_of_triangles=adjusted_target)
                        if len(decimated_o3d.triangles) > 0 and len(decimated_o3d.triangles) < len(mesh.faces):
                            mesh = trimesh.Trimesh(
                                vertices=np.asarray(decimated_o3d.vertices),
                                faces=np.asarray(decimated_o3d.triangles),
                                visual=mesh.visual,
                                process=False,
                            )
                            optimized_polycount = len(mesh.faces)
                            o3d_decimated = True
                            logger.info("Mesh decimated with Open3D fallback: %d -> %d triangles", original_polycount, optimized_polycount)
                except Exception as o3d_dec_err:
                    logger.debug("Open3D decimation fallback error: %s", o3d_dec_err)

                if not o3d_decimated:
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

    # Ensure UV coordinates remain valid after decimation if requested
    if fix_uvs and not mesh_has_valid_uvs(mesh):
        mesh, applied = generate_uvs_with_xatlas(mesh)
        uv_fixes_applied = uv_fixes_applied or applied

    # Recalculate normals for clean shading only when winding is inconsistent
    try:
        if not getattr(mesh, "is_winding_consistent", True):
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

    # Open3D Quality Verification: Compare derived mesh against input
    try:
        from app.core.open3d_service import is_open3d_available, compare_meshes_o3d
        if is_open3d_available():
            comp = compare_meshes_o3d(input_path, output_path, max_bbox_change_pct=8.0)
            if not comp.get("is_acceptable"):
                logger.warning(
                    "Optimized mesh failed Open3D quality comparison (%s) — rejecting derivative and restoring original",
                    comp.get("rejection_reason"),
                )
                import shutil
                shutil.copy(input_path, output_path)
                return {
                    "original_polycount": original_polycount,
                    "optimized_polycount": original_polycount,
                    "original_vertex_count": original_vertex_count,
                    "optimized_vertex_count": original_vertex_count,
                    "reduction_percent": 0.0,
                    "uv_fixes_applied": False,
                    "success": False,
                    "error": f"Derivative rejected by Open3D: {comp.get('rejection_reason')}",
                }
    except Exception as comp_exc:
        logger.debug("Open3D post-optimization check error: %s", comp_exc)

    ret = {
        "original_polycount": original_polycount,
        "optimized_polycount": optimized_polycount,
        "original_vertex_count": original_vertex_count,
        "optimized_vertex_count": len(mesh.vertices),
        "reduction_percent": reduction_percent,
        "uv_fixes_applied": uv_fixes_applied,
        "uv_method": "xatlas" if uv_fixes_applied else "preserved",
        "actual_topology": "triangle",
        "topology_mode": remesh_mode,
        "success": True,
    }
    if fallback_reason:
        ret["fallback_reason"] = fallback_reason
    return ret


PLATFORM_BUDGETS: dict[str, int] = {
    "mobile": 18000,
    "low": 28000,
    "medium": 45000,
    "high": 85000,
    "cinematic": 180000,
    "generic": 40000,
}


def get_target_polycount_for_platform(platform: str | None, default: int = 35000) -> int:
    """Return recommended target triangle count for a target platform."""
    if not platform:
        return default
    return PLATFORM_BUDGETS.get(platform.lower().strip(), default)


def generate_lods(
    input_path: str,
    output_dir: str,
    lod_count: int = 3,
    lod_preset: str = "medium",
    preserve_details: float = 75.0,
    fix_uvs: bool = True,
) -> dict[str, Any]:
    """Generate a multi-tier level of detail (LOD) cascade from an authoritative input mesh.

    LOD0 is the preserved master / high-fidelity source.
    LOD1 is 50% target budget.
    LOD2 is 25% target budget.
    LOD3 is 12.5% target budget (distant proxy).

    Returns a dict containing file paths, polycounts, and status for each level.
    """
    import shutil
    out_p = Path(output_dir)
    out_p.mkdir(parents=True, exist_ok=True)

    # 1. Inspect source
    trimesh = _try_import_trimesh()
    original_faces = 30000
    if trimesh:
        try:
            m = trimesh.load(input_path, force="mesh")
            original_faces = len(m.faces)
        except Exception:
            pass

    # LOD0 is the untouched original / master asset
    lod0_path = str(out_p / "lod0.glb")
    shutil.copy(input_path, lod0_path)

    lods_result: dict[str, Any] = {
        "lod0": {
            "path": lod0_path,
            "filename": "lod0.glb",
            "polycount": original_faces,
            "level": 0,
            "reduction_percent": 0.0,
        }
    }

    # Ratios for cascade levels
    cascade_ratios = [0.50, 0.25, 0.125, 0.06]
    max_levels = min(max(1, lod_count), 4)

    from app.core.mesh_processor import validate_glb

    prev_poly = original_faces
    for i in range(1, max_levels + 1):
        ratio = cascade_ratios[i - 1]
        target = max(60, min(int(original_faces * ratio), int(prev_poly * 0.75)))
        lod_filename = f"lod{i}.glb"
        lod_target_path = str(out_p / lod_filename)

        res = optimize_mesh(
            input_path=input_path,
            output_path=lod_target_path,
            target_polycount=target,
            fix_uvs=fix_uvs,
            preserve_details=max(10.0, preserve_details - (i * 10)),
        )

        poly = res.get("optimized_polycount", target)
        if poly >= prev_poly and poly > 60:
            forced_target = max(50, int(prev_poly * 0.60))
            res = optimize_mesh(
                input_path=lod_target_path,
                output_path=lod_target_path,
                target_polycount=forced_target,
                fix_uvs=False,
                preserve_details=max(10.0, preserve_details - (i * 15)),
            )
            poly = res.get("optimized_polycount", forced_target)

        # Open3D Canonical LOD Auditing
        lod_valid = True
        try:
            from app.core.open3d_service import is_open3d_available, validate_lod_mesh_o3d
            if is_open3d_available():
                lod_audit = validate_lod_mesh_o3d(input_path, lod_target_path, level=i, prev_polycount=prev_poly)
                if not lod_audit.get("valid"):
                    logger.warning(
                        "LOD%d discarded: Open3D audit failed (%s) — preserving asset integrity",
                        i, lod_audit.get("reason"),
                    )
                    lod_valid = False
                else:
                    poly = lod_audit["triangle_count"]
            else:
                val = validate_glb(lod_target_path)
                valid = val.get("valid", True)
                if not valid or poly <= 0 or poly >= prev_poly:
                    lod_valid = False
        except Exception as o3d_lod_err:
            logger.debug("Open3D LOD audit threw exception: %s", o3d_lod_err)
            val = validate_glb(lod_target_path)
            if not val.get("valid") or poly <= 0 or poly >= prev_poly:
                lod_valid = False

        if not lod_valid:
            if Path(lod_target_path).exists():
                try:
                    Path(lod_target_path).unlink()
                except Exception:
                    pass
            continue

        prev_poly = poly
        lods_result[f"lod{i}"] = {
            "path": lod_target_path,
            "filename": lod_filename,
            "polycount": poly,
            "level": i,
            "reduction_percent": res.get("reduction_percent", round((1 - poly / max(1, original_faces)) * 100, 1)),
            "valid": True,
        }

    return {
        "success": True,
        "count": len(lods_result),
        "levels": lods_result,
    }


def generate_collision_mesh(
    input_path: str,
    output_path: str,
    mode: str = "convex_hull",
) -> dict[str, Any]:
    """Generate a lightweight collision hull for physics and game engines.

    Creates an optimized convex hull or bounding proxy from the input mesh.

    ponytail: Convex hull is the gold standard for real-time game collision
    (single rigid body collider). Approximate Convex Decomposition (CoACD / V-HACD)
    was evaluated but requires heavy external C++ binaries with non-trivial build
    tooling and 10x compute latency for marginal gain on AI-generated props.
    Ceiling: single convex hull cannot model hollow interiors (e.g. doorways/caves).
    Upgrade path: add CoACD via Python bindings if multi-body concave decomposition
    is explicitly requested.
    """
    trimesh = _try_import_trimesh()
    if trimesh is None:
        return {"success": False, "error": "trimesh not installed"}

    try:
        loaded = trimesh.load(input_path)
        if isinstance(loaded, trimesh.Scene):
            meshes = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
            if not meshes:
                return {"success": False, "error": "No mesh in scene"}
            mesh = trimesh.util.concatenate(meshes) if len(meshes) > 1 else meshes[0]
        else:
            mesh = loaded

        if mode == "box":
            hull = mesh.bounding_box
        else:
            # Convex hull is the gold standard for game collision proxy
            hull = mesh.convex_hull

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        hull.export(output_path, file_type="glb")

        # Open3D validation on generated collision geometry
        collision_audit = None
        try:
            from app.core.open3d_service import is_open3d_available, validate_collision_mesh_o3d
            if is_open3d_available():
                collision_audit = validate_collision_mesh_o3d(input_path, output_path)
                if not collision_audit.get("valid"):
                    logger.warning("Collision mesh warning: %s", collision_audit.get("reason"))
        except Exception as o3d_col_err:
            logger.debug("Open3D collision validation error: %s", o3d_col_err)

        return {
            "success": True,
            "output_path": output_path,
            "polycount": len(hull.faces),
            "vertex_count": len(hull.vertices),
            "mode": mode,
            "collider_type": "convex_hull",
            "notes": "Watertight single convex hull for real-time rigid body collision",
            "validation": collision_audit,
        }
    except Exception as exc:
        logger.warning("generate_collision_mesh failed: %s", exc)
        return {"success": False, "error": str(exc)}

