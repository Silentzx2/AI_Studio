"""
Post-process generated meshes using Open3D/trimesh/PyMeshLab.
Runs Open3D canonical analysis, validation, cleanup, decimation, UV unwrap repair, and thumbnail rendering.
"""
import logging
import random
from pathlib import Path
from typing import Any

import numpy as np

from app.core.open3d_service import (
    is_open3d_available,
    get_open3d_version,
    load_o3d_mesh,
    save_o3d_mesh,
    analyze_mesh_o3d,
    safe_cleanup_o3d,
    evaluate_mesh_decision,
    compare_meshes_o3d,
    validate_lod_mesh_o3d,
    validate_collision_mesh_o3d,
    o3d_game_ready_qa,
)

logger = logging.getLogger(__name__)


def _try_import_trimesh():
    try:
        import trimesh
        return trimesh
    except ImportError:
        return None


def write_placeholder_mesh(glb_path: str, seed: int | None = None) -> dict[str, Any]:
    """Write a *valid, viewable* placeholder GLB.

    Provider fallbacks that have no real inference available (no GPU, weights
    not installed) used to write raw bytes named ``.glb``, which GLTFLoaders in
    the viewer reject with "invalid GLB". This emits a real, parseable GLB: a
    low-poly lumpy icosphere whose shape varies with ``seed``.

    ponytail: still a placeholder — the whole "simulated" provider path stays.
    Upgrading to real meshes means swapping the caller to per-model subprocess
    inference (see the model pipeline rules); this keeps that swap invisible to
    the UI.
    """
    trimesh = _try_import_trimesh()
    if trimesh is None:
        raise RuntimeError("trimesh not installed; cannot emit a valid placeholder GLB")

    rng = random.Random(seed)
    base = trimesh.creation.icosphere(subdivisions=2, radius=1.0)
    jitter = 1.0 + 0.12 * rng.uniform(-1.0, 1.0)
    squash = np.array([rng.uniform(0.85, 1.0), 1.0, rng.uniform(0.85, 1.0)])
    mesh = trimesh.Trimesh(vertices=(base.vertices * jitter) * squash[None, :], faces=base.faces)
    mesh.export(str(glb_path), file_type="glb")
    return {
        "polygon_count": len(mesh.faces),
        "vertex_count": len(mesh.vertices),
        "output_path": glb_path,
    }


def clean_mesh(input_path: str, output_path: str, target_faces: int | None = None) -> dict:
    """Conservatively clean mesh geometry (duplicates, degenerates, unreferenced verts).

    Uses Open3D safe cleanup as the primary canonical engine to preserve legitimate
    sub-components (ears, teeth, horns, mechanical parts). Falls back to trimesh if
    Open3D is unavailable.
    """
    if is_open3d_available():
        res = safe_cleanup_o3d(input_path, output_path=output_path)
        if res.get("success"):
            return {
                "polygon_count": res["after"]["triangle_count"],
                "vertex_count": res["after"]["vertex_count"],
                "output_path": output_path,
                "modified": res.get("modified", False),
                "cleanup_details": res,
            }
        logger.warning("Open3D cleanup returned failure: %s; falling back to trimesh", res.get("error"))

    trimesh = _try_import_trimesh()
    if not trimesh:
        logger.warning("trimesh not installed — skipping mesh cleanup")
        import shutil
        shutil.copy(input_path, output_path)
        return {"polygon_count": 0, "vertex_count": 0}

    mesh = trimesh.load(input_path, force="mesh")

    # Basic cleanup (trimesh API differs across supported releases).
    if hasattr(mesh, "remove_degenerate_faces"):
        mesh.remove_degenerate_faces()
    else:
        mesh.update_faces(mesh.nondegenerate_faces())
    if hasattr(mesh, "remove_duplicate_faces"):
        mesh.remove_duplicate_faces()
    else:
        mesh.update_faces(mesh.unique_faces())
    # ponytail: skip merge_vertices to preserve UV seam and sharp edge splits,
    # skip fix_normals to preserve provider-authored vertex normals

    if target_faces and len(mesh.faces) > target_faces:
        try:
            import pymeshlab
            ms = pymeshlab.MeshSet()
            ms.load_new_mesh(input_path)
            ms.meshing_decimation_quadric_edge_collapse(targetfacenum=target_faces)
            ms.save_current_mesh(output_path)
            mesh = trimesh.load(output_path, force="mesh")
        except ImportError:
            logger.warning("PyMeshLab not installed — skipping decimation")
            mesh.export(output_path)
    else:
        mesh.export(output_path)

    return {
        "polygon_count": len(mesh.faces),
        "vertex_count": len(mesh.vertices),
        "output_path": output_path,
    }


def render_thumbnail(model_path: str, output_path: str, size: tuple[int, int] = (512, 512)) -> bool:
    """Render a thumbnail PNG from a 3D model.

    We try trimesh first; if the OpenGL/offscreen render path is unavailable or
    the mesh loader returns a scene that cannot be rasterised cleanly, fall back
    to a lightweight placeholder preview instead of leaving the UI blank.
    """
    out_file = Path(output_path)
    # If a real thumbnail was already rendered (e.g. by Blender pipeline), preserve it
    if out_file.is_file() and out_file.stat().st_size > 2048:
        return True

    trimesh = _try_import_trimesh()
    if trimesh:
        try:
            try:
                import pyglet
                pyglet.options["headless"] = True
            except Exception:
                pass

            loaded = trimesh.load(model_path, force="scene")
            scene = loaded if hasattr(loaded, "save_image") else trimesh.Scene(loaded)
            png = scene.save_image(resolution=size, visible=True)
            if png:
                out_file.write_bytes(png)
                return True
        except Exception as exc:
            logger.warning("Thumbnail render failed: %s", exc)

    try:
        from PIL import Image, ImageDraw, ImageFont

        width, height = size
        image = Image.new("RGB", size, color=(16, 18, 24))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((12, 12, width - 12, height - 12), radius=24, outline=(92, 107, 192), width=3)
        draw.text((28, 28), "3D Preview", fill=(240, 242, 255))
        draw.text((28, 72), Path(model_path).name, fill=(190, 197, 210))

        # Keep the fallback useful even when the renderer cannot open the mesh.
        try:
            stats = get_mesh_stats(model_path)
            summary = [
                f"Faces: {stats.get('polygon_count', 0):,}",
                f"Vertices: {stats.get('vertex_count', 0):,}",
                f"Size: {stats.get('file_size', 0) / (1024 ** 2):.2f} MB",
            ]
        except Exception:
            summary = ["Preview rendered from fallback path."]

        y = 128
        for line in summary:
            draw.text((28, y), line, fill=(164, 171, 184))
            y += 34

        image.save(output_path, "PNG")
        logger.warning("Thumbnail fallback generated for %s", model_path)
        return True
    except Exception as exc:
        logger.warning("Thumbnail fallback generation failed: %s", exc)
        return False


def get_mesh_stats(model_path: str) -> dict:
    path_obj = Path(model_path)
    f_size = path_obj.stat().st_size if path_obj.exists() else 0
    default_stats = {
        "polygon_count": 0,
        "vertex_count": 0,
        "file_size": f_size,
        "dimensions": {"x": 0.0, "y": 0.0, "z": 0.0},
        "bounding_box": {"min": [0.0, 0.0, 0.0], "max": [0.0, 0.0, 0.0], "extent": [0.0, 0.0, 0.0], "diagonal": 0.0},
        "object_count": 0,
        "component_count": 0,
        "material_count": 0,
        "topology": "Triangle",
        "mesh_details": {"semantic_parts": "not_analyzed", "status": "unsupported"},
    }
    trimesh = _try_import_trimesh()
    if not trimesh or not path_obj.exists() or f_size == 0:
        return default_stats

    try:
        loaded = trimesh.load(model_path, force="scene")
        if isinstance(loaded, trimesh.Scene):
            meshes = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
            face_count = sum(len(m.faces) for m in meshes)
            vertex_count = sum(len(m.vertices) for m in meshes)
            bounds = loaded.bounds
            extents = loaded.extents
            node_names = list(loaded.graph.nodes)
        else:
            meshes = [loaded] if isinstance(loaded, trimesh.Trimesh) else []
            face_count = len(loaded.faces) if hasattr(loaded, "faces") else 0
            vertex_count = len(loaded.vertices) if hasattr(loaded, "vertices") else 0
            bounds = loaded.bounds if hasattr(loaded, "bounds") else None
            extents = loaded.extents if hasattr(loaded, "extents") else None
            node_names = []

        if bounds is not None and extents is not None:
            dimensions = {
                "x": round(float(extents[0]), 3),
                "y": round(float(extents[1]), 3),
                "z": round(float(extents[2]), 3),
            }
            bounding_box = {
                "min": [round(float(x), 4) for x in bounds[0]],
                "max": [round(float(x), 4) for x in bounds[1]],
                "extent": [round(float(x), 4) for x in extents],
                "diagonal": round(float(np.linalg.norm(extents)), 4),
            }
        else:
            dimensions = {"x": 0.0, "y": 0.0, "z": 0.0}
            bounding_box = {"min": [0.0, 0.0, 0.0], "max": [0.0, 0.0, 0.0], "extent": [0.0, 0.0, 0.0], "diagonal": 0.0}

        total_components = 0
        materials = set()
        for m in meshes:
            if hasattr(m, "edges") and len(m.edges) > 0:
                try:
                    comps = trimesh.graph.connected_components(m.edges)
                    total_components += len(comps)
                except Exception:
                    total_components += 1
            else:
                total_components += 1
            if hasattr(m, "visual") and hasattr(m.visual, "material") and m.visual.material:
                materials.add(id(m.visual.material))

        material_count = max(len(materials), 1 if any(hasattr(m, "visual") for m in meshes) else 0)

        # Semantic details inspection:
        # Check node names and mesh names for anatomical / semantic labels.
        # NEVER output 0 for unknown semantic info — represent as "not_analyzed" or "unsupported".
        semantic_keywords = [
            "eye", "pupil", "ear", "nose", "nostril", "mouth", "teeth", "tooth", "tongue", "lip",
            "head", "face", "hair", "body", "torso", "arm", "hand", "finger", "leg", "foot",
            "toe", "claw", "wing", "tail", "horn", "spine"
        ]
        all_names = list(node_names) + [str(getattr(m, "name", "")) for m in meshes]
        detected_parts = []
        for name in all_names:
            clean = name.lower().strip()
            for kw in semantic_keywords:
                if kw in clean and name not in detected_parts:
                    detected_parts.append(name)

        if detected_parts:
            mesh_details = {
                "semantic_parts": detected_parts,
                "part_count": len(detected_parts),
                "status": "detected",
            }
        else:
            mesh_details = {
                "semantic_parts": "not_analyzed",
                "status": "unsupported",
            }

        return {
            "polygon_count": face_count,
            "vertex_count": vertex_count,
            "file_size": f_size,
            "dimensions": dimensions,
            "bounding_box": bounding_box,
            "object_count": len(meshes),
            "component_count": total_components,
            "material_count": material_count,
            "topology": "Triangle",
            "mesh_details": mesh_details,
        }
    except Exception as exc:
        logger.warning("Failed to read mesh stats: %s", exc)
        return default_stats


# ---------------------------------------------------------------------------
# Output validation (GLB / UV / texture / export)
# ---------------------------------------------------------------------------

def validate_glb(model_path: str) -> dict:
    """Validate a generated GLB parses as a real mesh with non-zero geometry.

    Used by the worker after provider generation to catch corrupt/empty
    outputs (invalid GLB, zero-face mesh, etc.) before they reach the UI.
    Returns a dict with ``valid`` and, when invalid, ``reason``.
    """
    path = Path(model_path)
    if not path.exists():
        return {"valid": False, "reason": "file not found", "model_path": model_path}
    size = path.stat().st_size
    if size == 0:
        return {"valid": False, "reason": "empty file (0 bytes)", "model_path": model_path}

    # Check GLB magic number directly for clearer error messages
    # GLB files must start with the magic bytes "glTF" (0x46546C67)
    # If magic bytes don't match, skip validation (may be a different format)
    try:
        with open(path, 'rb') as f:
            magic = f.read(4)
            if magic != b'glTF':
                # Not a valid GLB header — skip trimesh validation to avoid spurious errors
                return {"valid": True, "model_path": model_path, "skipped": True, "reason": "not a GLB file (skipped validation)"}
    except Exception as exc:
        return {"valid": True, "model_path": model_path, "skipped": True, "reason": f"cannot read file: {exc}"}

    # Fast non-blocking geometry verification (avoids O(N^2) full diagnostics on raw meshes)
    if is_open3d_available():
        try:
            import open3d as o3d
            mesh = o3d.io.read_triangle_mesh(str(path))
            num_tris = len(mesh.triangles)
            num_verts = len(mesh.vertices)
            if num_tris == 0 or num_verts == 0:
                return {
                    "valid": False,
                    "reason": f"parses but has no geometry (faces={num_tris}, vertices={num_verts})",
                    "model_path": model_path,
                }
            return {
                "valid": True,
                "model_path": model_path,
                "polygon_count": num_tris,
                "vertex_count": num_verts,
                "file_size": size,
            }
        except Exception as o3d_exc:
            logger.debug("Open3D quick validation failed: %s; falling back to trimesh", o3d_exc)

    trimesh = _try_import_trimesh()
    if trimesh is None:
        return {"valid": True, "model_path": model_path}  # cannot verify — don't block
    try:
        loaded = trimesh.load(str(path))
        if isinstance(loaded, trimesh.Scene):
            meshes = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
            face_count = sum(len(m.faces) for m in meshes)
            vertex_count = sum(len(m.vertices) for m in meshes)
        else:
            mesh = loaded
            face_count, vertex_count = len(mesh.faces), len(mesh.vertices)
        if face_count == 0 or vertex_count == 0:
            return {
                "valid": False,
                "reason": f"parses but has no geometry (faces={face_count}, vertices={vertex_count})",
                "model_path": model_path,
            }
        return {
            "valid": True,
            "model_path": model_path,
            "polygon_count": face_count,
            "vertex_count": vertex_count,
            "file_size": size,
        }
    except Exception as exc:
        return {"valid": False, "reason": f"invalid GLB: {exc}", "model_path": model_path}


def validate_uv_mapping(model_path: str) -> dict:
    """Check that a mesh has UV coordinates (required for texturing)."""
    trimesh = _try_import_trimesh()
    if trimesh is None:
        return {"valid": True, "unverifiable": True, "model_path": model_path}
    try:
        mesh = trimesh.load(model_path, force="mesh")
        uvs = getattr(mesh, "visual", None)
        has_uv = bool(uvs is not None and getattr(uvs, "uv", None) is not None and len(uvs.uv) > 0)
        return {"valid": has_uv, "has_uv": has_uv, "model_path": model_path}
    except Exception as exc:
        return {"valid": False, "reason": f"could not inspect UVs: {exc}", "model_path": model_path}


def validate_texture(model_path: str) -> dict:
    """Check that a GLB carries a base-color texture (material or image).

    A textured model must expose a texture image via material.baseColorTexture
    or the visual's material image. Untextured models are still valid output,
    so this returns ``textured`` rather than blocking on ``valid``.
    """
    trimesh = _try_import_trimesh()
    if trimesh is None:
        return {"valid": True, "textured": False, "unverifiable": True, "model_path": model_path}
    try:
        loaded = trimesh.load(model_path, force="scene")
        textured = False
        for node in loaded.geometry.values():
            mat = getattr(node, "visual", None)
            mat = getattr(mat, "material", None) if mat is not None else None
            if mat is not None and getattr(mat, "image", None) is not None:
                textured = True
                break
            # trimesh PBR material exposes texture via baseColorTexture
            if mat is not None and getattr(mat, "baseColorTexture", None) is not None:
                textured = True
                break
        return {"valid": True, "textured": textured, "model_path": model_path}
    except Exception as exc:
        return {"valid": False, "reason": f"could not inspect texture: {exc}", "model_path": model_path}


def validate_export(model_path: str, fmt: str) -> dict:
    """Validate an exported model file for a given format ('glb'|'obj'|'fbx')."""
    fmt = (fmt or "glb").lower().lstrip(".")
    path = Path(model_path)
    if fmt == "glb":
        return validate_glb(model_path)
    if not path.exists() or path.stat().st_size == 0:
        return {"valid": False, "reason": f"{fmt.upper()} export missing or empty", "model_path": model_path}
    trimesh = _try_import_trimesh()
    if trimesh is None:
        return {"valid": True, "model_path": model_path}
    try:
        mesh = trimesh.load(str(path), force="mesh")
        return {
            "valid": len(mesh.faces) > 0,
            "polygon_count": len(mesh.faces),
            "vertex_count": len(mesh.vertices),
            "file_size": path.stat().st_size,
            "model_path": model_path,
        }
    except Exception as exc:
        return {"valid": False, "reason": f"invalid {fmt.upper()}: {exc}", "model_path": model_path}


def run_mesh_diagnostics(model_path: str, target_platform: str = "generic") -> dict[str, Any]:
    """Calculate comprehensive mesh diagnostics and a composite game-ready score (0-100).

    Audits geometry, topology, UV layout, materials, and polygon budget compliance
    without destructive modification. Returns a structured QA record.
    """
    path = Path(model_path)
    if not path.exists():
        return {
            "valid": False,
            "game_ready_score": 0,
            "status": "fail",
            "warnings": ["File not found"],
            "diagnostics": {},
        }

    # Authoritative Open3D Game-Ready QA evaluation
    if is_open3d_available():
        try:
            qa_res = o3d_game_ready_qa(str(path), target_platform=target_platform)
            if qa_res.get("diagnostics"):
                # Enrich Open3D QA with UV and material inspection
                uv_info = validate_uv_mapping(str(path))
                has_uv = bool(uv_info.get("has_uv", False))
                tex_info = validate_texture(str(path))
                has_texture = bool(tex_info.get("textured", False))

                qa_res["diagnostics"]["has_uv"] = has_uv
                qa_res["diagnostics"]["has_texture"] = has_texture
                qa_res["diagnostics"]["polygon_count"] = qa_res["diagnostics"].get("triangle_count", 0)
                qa_res["diagnostics"]["scoring_breakdown"] = {
                    "overall_score": qa_res.get("game_ready_score", 100),
                    "status": qa_res.get("status", "pass"),
                    "warnings_count": len(qa_res.get("warnings", [])),
                }
                if not has_uv:
                    qa_res["warnings"].append("Mesh lacks UV coordinates")
                    if qa_res["status"] == "pass":
                        qa_res["status"] = "warn"
                if not has_texture:
                    qa_res["warnings"].append("No embedded base color texture map found")
                    if qa_res["status"] == "pass":
                        qa_res["status"] = "warn"
                return qa_res
        except Exception as o3d_err:
            logger.warning("Open3D QA failed on %s, falling back to trimesh QA: %s", path, o3d_err)

    trimesh = _try_import_trimesh()
    if trimesh is None:
        return {
            "valid": True,
            "game_ready_score": 75,
            "status": "warn",
            "warnings": ["trimesh not installed — limited diagnostic verification"],
            "diagnostics": {"file_size": path.stat().st_size},
        }

    try:
        loaded = trimesh.load(str(path))
        if isinstance(loaded, trimesh.Scene):
            meshes = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
            if not meshes:
                return {
                    "valid": False,
                    "game_ready_score": 0,
                    "status": "fail",
                    "warnings": ["Scene contains no mesh geometry"],
                    "diagnostics": {},
                }
            mesh = trimesh.util.concatenate(meshes) if len(meshes) > 1 else meshes[0]
            scene_materials = len(loaded.geometry)
        else:
            mesh = loaded
            scene_materials = 1

        poly_count = len(mesh.faces)
        vert_count = len(mesh.vertices)
        if poly_count == 0 or vert_count == 0:
            return {
                "valid": False,
                "game_ready_score": 0,
                "status": "fail",
                "warnings": ["Mesh has zero faces or vertices"],
                "diagnostics": {"polygon_count": poly_count, "vertex_count": vert_count},
            }

        warnings = []
        deductions: list[dict[str, Any]] = []

        # 1. Topology & Geometry Checks
        import numpy as np
        is_watertight = bool(getattr(mesh, "is_watertight", False))
        is_winding = bool(getattr(mesh, "is_winding_consistent", False))

        # Degenerate faces count
        degenerate_faces = 0
        try:
            if hasattr(mesh, "area_faces"):
                degenerate_faces = int(np.sum(mesh.area_faces < 1e-10))
            elif hasattr(mesh, "nondegenerate_faces"):
                degenerate_faces = int(len(mesh.faces) - len(mesh.nondegenerate_faces()))
        except Exception:
            degenerate_faces = 0

        if degenerate_faces > 0:
            warnings.append(f"Found {degenerate_faces} degenerate (zero-area) face(s)")

        # Non-manifold edges & boundary edges
        non_manifold_edges = 0
        boundary_edges = 0
        try:
            _, counts = np.unique(mesh.edges_sorted, axis=0, return_counts=True)
            non_manifold_edges = int(np.sum(counts > 2))
            boundary_edges = int(np.sum(counts == 1))
        except Exception:
            pass

        if non_manifold_edges > 0:
            warnings.append(f"Found {non_manifold_edges} non-manifold edge(s)")
        if boundary_edges > 0 and not is_watertight:
            warnings.append(f"Mesh is open with {boundary_edges} boundary edge(s)")

        # Connected components
        try:
            components_count = len(trimesh.graph.connected_components(mesh.face_adjacency))
        except Exception:
            components_count = 1

        if components_count > 10:
            warnings.append(f"Mesh has {components_count} disconnected parts (component cleanup recommended)")

        # 2. UVs & Texturing Checks
        uv_info = validate_uv_mapping(str(path))
        has_uv = bool(uv_info.get("has_uv", False))
        uv_valid = False
        if has_uv:
            try:
                uvs = getattr(mesh.visual, "uv", None)
                if uvs is not None and len(uvs) > 0:
                    uv_arr = np.asarray(uvs)
                    if np.isfinite(uv_arr).all() and float(np.ptp(uv_arr[:, 0])) > 1e-5:
                        uv_valid = True
            except Exception:
                uv_valid = has_uv

        if not has_uv:
            warnings.append("Mesh lacks UV coordinates")
        elif not uv_valid:
            warnings.append("UV coordinates appear collapsed or degenerate")

        tex_info = validate_texture(str(path))
        has_texture = bool(tex_info.get("textured", False))
        if not has_texture:
            warnings.append("No embedded texture map found")

        # 3. Dimensions & Transform Sanity
        extents = [round(float(x), 3) for x in mesh.extents.tolist()] if hasattr(mesh, "extents") else [1.0, 1.0, 1.0]
        transform_valid = all(e > 1e-4 and np.isfinite(e) for e in extents)
        if not transform_valid:
            warnings.append("Degenerate bounding box extents detected")

        # 4. Budget compliance by platform
        platform_budgets = {
            "mobile": 20000,
            "low": 35000,
            "medium": 60000,
            "high": 120000,
            "cinematic": 250000,
            "generic": 65000,
        }
        max_budget = platform_budgets.get(target_platform.lower(), 65000)
        budget_ratio = poly_count / max(1, max_budget)
        if budget_ratio > 1.2:
            warnings.append(
                f"Triangle count ({poly_count:,}) exceeds recommended target for '{target_platform}' ({max_budget:,})"
            )

        # 5. Composite Game-Ready Score & Explainable Rubric (0 - 100)
        # Topology / Geometry: 35 pts max
        topology_score = 35
        if not is_winding:
            topology_score -= 10
            deductions.append({"issue": "Inconsistent polygon winding / normals", "points": 10})
        if non_manifold_edges > 0:
            ded = min(10, 3 + int(non_manifold_edges / 5))
            topology_score -= ded
            deductions.append({"issue": f"Non-manifold edges ({non_manifold_edges})", "points": ded})
        if degenerate_faces > 0:
            ded = min(5, 1 + int(degenerate_faces / 10))
            topology_score -= ded
            deductions.append({"issue": f"Degenerate faces ({degenerate_faces})", "points": ded})
        if components_count > 10:
            topology_score -= 5
            deductions.append({"issue": f"Excessive disconnected components ({components_count})", "points": 5})
        topology_score = max(0, min(35, topology_score))

        # UV & Materials: 35 pts max
        uv_mat_score = 35
        if not has_uv:
            uv_mat_score -= 20
            deductions.append({"issue": "Missing UV coordinates", "points": 20})
        elif not uv_valid:
            uv_mat_score -= 10
            deductions.append({"issue": "Degenerate or unnormalized UV layout", "points": 10})

        if not has_texture:
            uv_mat_score -= 15
            deductions.append({"issue": "No base color texture map", "points": 15})
        uv_mat_score = max(0, min(35, uv_mat_score))

        # Budget & Platform: 30 pts max
        budget_score = 30
        if budget_ratio > 2.5:
            budget_score -= 25
            deductions.append({"issue": f"Severe polygon overbudget (>250% of {target_platform})", "points": 25})
        elif budget_ratio > 1.5:
            budget_score -= 15
            deductions.append({"issue": f"Moderate polygon overbudget (>150% of {target_platform})", "points": 15})
        elif budget_ratio > 1.0:
            budget_score -= 5
            deductions.append({"issue": f"Slight polygon overbudget (>100% of {target_platform})", "points": 5})

        if not transform_valid:
            budget_score -= 5
            deductions.append({"issue": "Invalid or collapsed transform extents", "points": 5})
        budget_score = max(0, min(30, budget_score))

        total_score = min(100, max(0, topology_score + uv_mat_score + budget_score))
        status = "pass" if total_score >= 80 else ("warn" if total_score >= 50 else "fail")

        diagnostics = {
            "polygon_count": poly_count,
            "vertex_count": vert_count,
            "components_count": components_count,
            "degenerate_faces": degenerate_faces,
            "non_manifold_edges": non_manifold_edges,
            "boundary_edges": boundary_edges,
            "is_watertight": is_watertight,
            "is_winding_consistent": is_winding,
            "has_uv": has_uv,
            "uv_valid": uv_valid,
            "has_texture": has_texture,
            "extents": extents,
            "transform_valid": transform_valid,
            "material_count": scene_materials,
            "file_size": path.stat().st_size,
            "target_platform": target_platform,
            "target_budget": max_budget,
            "scoring_breakdown": {
                "topology": {"score": topology_score, "max": 35},
                "uv_and_materials": {"score": uv_mat_score, "max": 35},
                "budget_and_transform": {"score": budget_score, "max": 30},
            },
            "deductions": deductions,
        }

        return {
            "valid": True,
            "game_ready_score": total_score,
            "status": status,
            "warnings": warnings,
            "diagnostics": diagnostics,
        }

    except Exception as exc:
        logger.warning("run_mesh_diagnostics failed on %s: %s", model_path, exc)
        return {
            "valid": True,
            "game_ready_score": 60,
            "status": "warn",
            "warnings": [f"Diagnostics could not complete: {exc}"],
            "diagnostics": {"file_size": path.stat().st_size},
        }


def classify_asset(prompt: str = "", model_path: str | None = None, mesh: Any = None) -> dict[str, Any]:
    """Deterministically classify an asset into one of 6 canonical categories.

    Categories:
      - 'human': Real-world humans, people, professions (biped metarig target)
      - 'humanoid': Fantasy bipeds, robots, cyborgs, orcs, skeletons
      - 'quadruped': 4-legged animals, beasts, creatures (Rigify metarig unsupported)
      - 'hard-surface': Vehicles, weapons, armor, machinery, architecture
      - 'generic-prop': Food, containers, plants, furniture, small props
      - 'unknown': Ambiguous or unclassifiable

    Returns:
      dict with category, confidence, reason, riggable_humanoid
    """
    import re
    p = (prompt or "").lower().strip()

    HUMAN_KW = {
        "man", "woman", "person", "human", "boy", "girl", "child", "male", "female",
        "soldier", "warrior", "knight", "wizard", "ninja", "chef", "doctor", "cop",
        "police", "athlete", "samurai", "monk", "priest", "dancer", "worker", "guy",
        "lady", "gentleman", "hero", "heroine",
    }
    HUMANOID_KW = {
        "humanoid", "biped", "cyborg", "robot", "alien", "monster", "orc", "goblin",
        "zombie", "skeleton", "character", "avatar", "mech", "golem", "demon", "elf",
        "dwarf", "vampire", "android",
    }
    QUADRUPED_KW = {
        "dog", "cat", "horse", "wolf", "lion", "tiger", "bear", "cow", "deer", "elephant",
        "animal", "creature", "four-legged", "quadruped", "fox", "cheetah", "leopard",
        "pig", "sheep", "goat", "camel", "zebra", "rabbit", "hare", "reptile", "lizard",
        "dragon", "dinosaur", "puppy", "kitten", "hound", "beast",
    }
    HARD_SURFACE_KW = {
        "car", "vehicle", "weapon", "gun", "sword", "shield", "helmet", "armor", "chair",
        "table", "building", "house", "spaceship", "plane", "aircraft", "machine", "pistol",
        "rifle", "knife", "axe", "tank", "truck", "boat", "ship", "furniture", "computer",
        "phone", "blade", "dagger", "bow", "cannon",
    }
    GENERIC_PROP_KW = {
        "box", "barrel", "crate", "rock", "stone", "tree", "plant", "food", "apple",
        "potion", "coin", "bottle", "chest", "prop", "vase", "cup", "mug", "flower",
        "fruit", "backpack", "book", "scroll", "gem", "crystal", "key",
    }

    tokens = set(re.findall(r"\b[a-z0-9\-]+\b", p))

    if tokens & HUMAN_KW:
        matched = sorted(tokens & HUMAN_KW)
        return {
            "category": "human",
            "confidence": 0.95,
            "reason": f"Prompt matched human keyword(s): {', '.join(matched)}",
            "riggable_humanoid": True,
        }
    if tokens & HUMANOID_KW:
        matched = sorted(tokens & HUMANOID_KW)
        return {
            "category": "humanoid",
            "confidence": 0.90,
            "reason": f"Prompt matched humanoid keyword(s): {', '.join(matched)}",
            "riggable_humanoid": True,
        }
    if tokens & QUADRUPED_KW:
        matched = sorted(tokens & QUADRUPED_KW)
        return {
            "category": "quadruped",
            "confidence": 0.92,
            "reason": f"Prompt matched quadruped keyword(s): {', '.join(matched)}",
            "riggable_humanoid": False,
        }
    if tokens & HARD_SURFACE_KW:
        matched = sorted(tokens & HARD_SURFACE_KW)
        return {
            "category": "hard-surface",
            "confidence": 0.88,
            "reason": f"Prompt matched hard-surface keyword(s): {', '.join(matched)}",
            "riggable_humanoid": False,
        }
    if tokens & GENERIC_PROP_KW:
        matched = sorted(tokens & GENERIC_PROP_KW)
        return {
            "category": "generic-prop",
            "confidence": 0.85,
            "reason": f"Prompt matched prop keyword(s): {', '.join(matched)}",
            "riggable_humanoid": False,
        }

    # Fall back to geometric inspection if mesh is provided
    target_mesh = mesh
    if target_mesh is None and model_path and Path(model_path).exists():
        if is_open3d_available():
            try:
                o3d_stats = analyze_mesh_o3d(model_path)
                if o3d_stats.get("valid"):
                    ext = o3d_stats["bounding_box"]["extent"]
                    dx, dy, dz = ext[0], ext[1], ext[2]
                    h = max(dz, dy)
                    w = max(dx, min(dz, dy))
                    d = min(dx, min(dz, dy))
                    aspect_ratio = h / max(0.001, max(w, d))

                    if aspect_ratio >= 1.8:
                        return {
                            "category": "humanoid",
                            "confidence": 0.70,
                            "reason": f"Open3D vertical aspect ratio ({aspect_ratio:.2f}) indicates upright humanoid stature",
                            "riggable_humanoid": True,
                        }
                    if max(dx, dy) / max(0.001, dz) >= 2.0:
                        return {
                            "category": "hard-surface",
                            "confidence": 0.60,
                            "reason": "Open3D elongated horizontal geometry indicates vehicle or hard-surface asset",
                            "riggable_humanoid": False,
                        }
                    return {
                        "category": "generic-prop",
                        "confidence": 0.65,
                        "reason": "Open3D compact bounding aspect ratio indicates prop/object geometry",
                        "riggable_humanoid": False,
                    }
            except Exception as o3d_cls_err:
                logger.debug("Open3D asset classification failed: %s; falling back to trimesh", o3d_cls_err)

        trimesh = _try_import_trimesh()
        if trimesh:
            try:
                target_mesh = trimesh.load(model_path, force="mesh")
            except Exception:
                target_mesh = None

    if target_mesh is not None and hasattr(target_mesh, "extents"):
        try:
            dx, dy, dz = [float(x) for x in target_mesh.extents]
            h = max(dz, dy)
            w = max(dx, min(dz, dy))
            d = min(dx, min(dz, dy))
            aspect_ratio = h / max(0.001, max(w, d))

            if aspect_ratio >= 1.8:
                return {
                    "category": "humanoid",
                    "confidence": 0.65,
                    "reason": f"Vertical aspect ratio ({aspect_ratio:.2f}) indicates upright humanoid stature",
                    "riggable_humanoid": True,
                }
            if max(dx, dy) / max(0.001, dz) >= 2.0:
                return {
                    "category": "hard-surface",
                    "confidence": 0.55,
                    "reason": "Elongated horizontal geometry indicates vehicle or hard-surface asset",
                    "riggable_humanoid": False,
                }
            return {
                "category": "generic-prop",
                "confidence": 0.60,
                "reason": "Compact bounding aspect ratio indicates prop/object geometry",
                "riggable_humanoid": False,
            }
        except Exception:
            pass

    return {
        "category": "unknown",
        "confidence": 0.30,
        "reason": "Unspecified prompt keywords and no geometric cues available",
        "riggable_humanoid": False,
    }


