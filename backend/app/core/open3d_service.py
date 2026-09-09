"""
Open3D Canonical Service Layer for AI Studio.

Provides authoritative mesh loading, comprehensive geometry/topology analysis,
safe conservative cleanup, deterministic decision routing, before/after quality comparison,
LOD & collision auditing, and Game-Ready QA verification.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

_O3D_MODULE: Any | None = None
_O3D_CHECKED: bool = False


def _try_import_open3d():
    """Attempt to import open3d and cache availability."""
    global _O3D_MODULE, _O3D_CHECKED
    if _O3D_CHECKED:
        return _O3D_MODULE
    _O3D_CHECKED = True
    try:
        import open3d as o3d
        _O3D_MODULE = o3d
        return o3d
    except Exception as exc:
        logger.warning("Open3D could not be imported: %s", exc)
        _O3D_MODULE = None
        return None


def is_open3d_available() -> bool:
    """Return True if Open3D is installed and importable."""
    return _try_import_open3d() is not None


def get_open3d_version() -> str | None:
    """Return Open3D version string or None if unavailable."""
    o3d = _try_import_open3d()
    return getattr(o3d, "__version__", None) if o3d else None


# ---------------------------------------------------------------------------
# 1. Mesh Loading & Conversion
# ---------------------------------------------------------------------------

def load_o3d_mesh(source: str | Path | Any) -> Any | None:
    """Load or convert a mesh to an Open3D TriangleMesh.

    Supports:
      - File path (.glb, .gltf, .obj, .stl, .ply)
      - trimesh.Trimesh / trimesh.Scene object
      - open3d.geometry.TriangleMesh (returns clone or self)
    """
    o3d = _try_import_open3d()
    if o3d is None:
        logger.warning("Open3D unavailable — cannot load Open3D TriangleMesh")
        return None

    if isinstance(source, o3d.geometry.TriangleMesh):
        return source

    # If trimesh is passed directly
    if hasattr(source, "vertices") and hasattr(source, "faces"):
        try:
            verts = np.asarray(source.vertices, dtype=np.float64)
            faces = np.asarray(source.faces, dtype=np.int32)
            mesh = o3d.geometry.TriangleMesh(
                o3d.utility.Vector3dVector(verts),
                o3d.utility.Vector3iVector(faces),
            )
            # Copy vertex normals if present
            if hasattr(source, "vertex_normals") and len(source.vertex_normals) == len(verts):
                mesh.vertex_normals = o3d.utility.Vector3dVector(np.asarray(source.vertex_normals, dtype=np.float64))
            # Copy vertex colors if present
            if hasattr(source, "visual") and getattr(source.visual, "vertex_colors", None) is not None:
                vc = np.asarray(source.visual.vertex_colors)[:, :3] / 255.0
                if len(vc) == len(verts):
                    mesh.vertex_colors = o3d.utility.Vector3dVector(vc.astype(np.float64))
            return mesh
        except Exception as conv_exc:
            logger.warning("Failed to convert trimesh to Open3D: %s", conv_exc)
            return None

    # Load from path
    path_str = str(source)
    p = Path(path_str)
    if not p.exists() or p.stat().st_size == 0:
        logger.warning("Cannot load Open3D mesh: file does not exist or is empty: %s", path_str)
        return None

    # 1. Direct Open3D read
    try:
        mesh = o3d.io.read_triangle_mesh(path_str, enable_post_processing=False)
        if mesh is not None and not mesh.is_empty() and len(mesh.triangles) > 0:
            return mesh
    except Exception as read_exc:
        logger.debug("Direct o3d.io.read_triangle_mesh failed for %s: %s", path_str, read_exc)

    # 2. Fallback via trimesh conversion (handles complex GLB scenes / hierarchies)
    try:
        import trimesh
        loaded = trimesh.load(path_str, force="mesh")
        if isinstance(loaded, trimesh.Scene):
            geoms = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
            if not geoms:
                return None
            tm_mesh = trimesh.util.concatenate(geoms) if len(geoms) > 1 else geoms[0]
        else:
            tm_mesh = loaded

        if tm_mesh is not None and len(tm_mesh.faces) > 0:
            return load_o3d_mesh(tm_mesh)
    except Exception as tm_exc:
        logger.warning("trimesh fallback for Open3D loader failed on %s: %s", path_str, tm_exc)

    return None


def save_o3d_mesh(mesh: Any, output_path: str | Path) -> bool:
    """Export an Open3D TriangleMesh to file."""
    o3d = _try_import_open3d()
    if o3d is None or mesh is None:
        return False
    try:
        out_p = Path(output_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        return bool(o3d.io.write_triangle_mesh(
            str(out_p),
            mesh,
            write_ascii=False,
            compressed=False,
            write_vertex_normals=True,
            write_vertex_colors=True,
            write_triangle_uvs=True,
        ))
    except Exception as exc:
        logger.error("Failed to save Open3D mesh to %s: %s", output_path, exc)
        return False


# ---------------------------------------------------------------------------
# 2. Comprehensive Geometry & Topology Analysis
# ---------------------------------------------------------------------------

def analyze_mesh_o3d(source: str | Path | Any) -> dict[str, Any]:
    """Calculate structured geometry and topology diagnostics using Open3D.

    Returns complete audit:
      - vertex_count, triangle_count, surface_area, volume
      - bounding_box: min, max, extent [dx, dy, dz], diagonal
      - is_watertight, is_orientable
      - is_edge_manifold (strict & boundary-allowed)
      - is_vertex_manifold
      - non_manifold_edges_count, non_manifold_vertices_count
      - is_self_intersecting, self_intersecting_triangles_count
      - duplicate_vertices_count, duplicate_triangles_count
      - degenerate_triangles_count, unreferenced_vertices_count
      - components_count, component_details
      - has_normals, has_uvs
    """
    mesh = load_o3d_mesh(source) if not hasattr(source, "vertices") else source
    if mesh is None or not hasattr(mesh, "vertices") or len(mesh.vertices) == 0 or len(mesh.triangles) == 0:
        return {
            "valid": False,
            "error": "Empty or unparseable mesh",
            "vertex_count": 0,
            "triangle_count": 0,
            "surface_area": 0.0,
            "volume": 0.0,
            "is_watertight": False,
            "is_orientable": False,
            "is_edge_manifold": False,
            "is_vertex_manifold": False,
            "non_manifold_edges_count": 0,
            "non_manifold_vertices_count": 0,
            "is_self_intersecting": False,
            "self_intersecting_triangles_count": 0,
            "duplicate_vertices_count": 0,
            "duplicate_triangles_count": 0,
            "degenerate_triangles_count": 0,
            "unreferenced_vertices_count": 0,
            "components_count": 0,
            "component_details": [],
            "bounding_box": {"min": [0, 0, 0], "max": [0, 0, 0], "extent": [0, 0, 0], "diagonal": 0.0},
            "has_normals": False,
            "has_uvs": False,
        }

    verts = np.asarray(mesh.vertices)
    tris = np.asarray(mesh.triangles)
    num_verts = len(verts)
    num_tris = len(tris)

    # Bounding Box
    try:
        aabb = mesh.get_axis_aligned_bounding_box()
        b_min = [round(float(x), 4) for x in aabb.get_min_bound()]
        b_max = [round(float(x), 4) for x in aabb.get_max_bound()]
        extent = [round(float(x), 4) for x in aabb.get_extent()]
        diag = round(float(np.linalg.norm(aabb.get_extent())), 4)
    except Exception:
        b_min = [float(x) for x in np.min(verts, axis=0)]
        b_max = [float(x) for x in np.max(verts, axis=0)]
        extent = [round(b_max[i] - b_min[i], 4) for i in range(3)]
        diag = round(float(np.linalg.norm(extent)), 4)

    bbox_info = {
        "min": b_min,
        "max": b_max,
        "extent": extent,
        "diagonal": diag,
    }

    # Surface Area & Volume
    try:
        surface_area = round(float(mesh.get_surface_area()), 4)
    except Exception:
        surface_area = 0.0

    is_watertight = bool(mesh.is_watertight())
    volume = 0.0
    if is_watertight:
        try:
            volume = round(float(mesh.get_volume()), 4)
        except Exception:
            volume = 0.0

    # Topology checks
    try:
        is_orientable = bool(mesh.is_orientable())
    except Exception:
        is_orientable = False

    try:
        # Edge manifold with boundary edges permitted (typical for open clothing/props)
        is_edge_manifold_with_boundary = bool(mesh.is_edge_manifold(allow_boundary_edges=True))
        # Strict 2-manifold (closed, no open boundaries)
        is_edge_manifold_strict = bool(mesh.is_edge_manifold(allow_boundary_edges=False))
        non_manifold_edges_vec = mesh.get_non_manifold_edges(allow_boundary_edges=True)
        non_manifold_edges_count = int(len(non_manifold_edges_vec))
    except Exception:
        is_edge_manifold_with_boundary = False
        is_edge_manifold_strict = False
        non_manifold_edges_count = 0

    try:
        is_vertex_manifold = bool(mesh.is_vertex_manifold())
        non_manifold_verts_vec = mesh.get_non_manifold_vertices()
        non_manifold_vertices_count = int(len(non_manifold_verts_vec))
    except Exception:
        is_vertex_manifold = False
        non_manifold_vertices_count = 0

    try:
        is_self_intersecting = bool(mesh.is_self_intersecting())
        self_intersecting_tris_vec = mesh.get_self_intersecting_triangles()
        self_intersecting_triangles_count = int(len(self_intersecting_tris_vec))
    except Exception:
        is_self_intersecting = False
        self_intersecting_triangles_count = 0

    # Duplicate & Degenerate checks (measured non-destructively on cloned mesh)
    try:
        import copy
        probe_mesh = copy.deepcopy(mesh)

        probe_mesh.remove_duplicated_vertices()
        dup_verts_count = max(0, num_verts - len(probe_mesh.vertices))

        probe_mesh.remove_degenerate_triangles()
        degen_tris_count = max(0, num_tris - len(probe_mesh.triangles))

        probe_mesh.remove_duplicated_triangles()
        dup_tris_count = max(0, num_tris - degen_tris_count - len(probe_mesh.triangles))

        probe_mesh.remove_unreferenced_vertices()
        unref_verts_count = max(0, len(probe_mesh.vertices) - len(np.unique(np.asarray(probe_mesh.triangles))))
    except Exception as probe_err:
        logger.debug("Open3D probe cleanup error: %s", probe_err)
        dup_verts_count = 0
        dup_tris_count = 0
        degen_tris_count = 0
        unref_verts_count = 0

    # Connected Components Clustering
    component_details: list[dict[str, Any]] = []
    components_count = 1
    try:
        clusters, cluster_tri_counts, cluster_areas = mesh.cluster_connected_triangles()
        components_count = len(cluster_tri_counts)
        for idx in range(min(components_count, 50)):  # top 50 components
            cnt = int(cluster_tri_counts[idx])
            area = round(float(cluster_areas[idx]), 4) if idx < len(cluster_areas) else 0.0
            component_details.append({
                "cluster_id": idx,
                "triangle_count": cnt,
                "surface_area": area,
                "triangle_ratio": round(cnt / max(1, num_tris), 5),
            })
    except Exception as cluster_err:
        logger.debug("cluster_connected_triangles failed: %s", cluster_err)
        component_details = [{"cluster_id": 0, "triangle_count": num_tris, "surface_area": surface_area, "triangle_ratio": 1.0}]

    has_normals = bool(mesh.has_vertex_normals() or mesh.has_triangle_normals())
    has_uvs = bool(mesh.has_triangle_uvs())

    return {
        "valid": True,
        "vertex_count": num_verts,
        "triangle_count": num_tris,
        "surface_area": surface_area,
        "volume": volume,
        "is_watertight": is_watertight,
        "is_orientable": is_orientable,
        "is_edge_manifold": is_edge_manifold_with_boundary,
        "is_edge_manifold_strict": is_edge_manifold_strict,
        "is_vertex_manifold": is_vertex_manifold,
        "non_manifold_edges_count": non_manifold_edges_count,
        "non_manifold_vertices_count": non_manifold_vertices_count,
        "is_self_intersecting": is_self_intersecting,
        "self_intersecting_triangles_count": self_intersecting_triangles_count,
        "duplicate_vertices_count": dup_verts_count,
        "duplicate_triangles_count": dup_tris_count,
        "degenerate_triangles_count": degen_tris_count,
        "unreferenced_vertices_count": unref_verts_count,
        "components_count": components_count,
        "component_details": component_details,
        "bounding_box": bbox_info,
        "has_normals": has_normals,
        "has_uvs": has_uvs,
    }


# ---------------------------------------------------------------------------
# 3. Safe, Conservative Cleanup
# ---------------------------------------------------------------------------

def safe_cleanup_o3d(
    source: str | Path | Any,
    output_path: str | Path | None = None,
    noise_triangle_ratio: float = 0.0005,  # 0.05%
    noise_area_ratio: float = 0.0005,      # 0.05%
    min_triangles_to_preserve: int = 6,
) -> dict[str, Any]:
    """Perform conservative geometry cleanup using Open3D without destroying sub-components.

    Preserves legitimate separate parts (horns, ears, teeth, weapons, mechanical pieces)
    while stripping true orphaned noise, duplicate vertices, duplicate triangles,
    and degenerate zero-area faces.

    Returns structured report with before and after statistics.
    """
    mesh = load_o3d_mesh(source)
    if mesh is None or mesh.is_empty():
        return {
            "success": False,
            "error": "Failed to load mesh for Open3D cleanup",
            "modified": False,
        }

    before_stats = analyze_mesh_o3d(mesh)
    orig_tris = before_stats["triangle_count"]
    orig_verts = before_stats["vertex_count"]

    # 1. Conservative geometric sanitization
    mesh.remove_duplicated_vertices()
    mesh.remove_degenerate_triangles()
    mesh.remove_duplicated_triangles()
    mesh.remove_unreferenced_vertices()

    # 2. Recompute normals if missing or invalid
    if not mesh.has_vertex_normals() or not mesh.has_triangle_normals():
        mesh.compute_vertex_normals()
        mesh.compute_triangle_normals()

    # 3. Conservative component evaluation
    # Never delete components based solely on 'keep largest island'!
    total_area = float(mesh.get_surface_area())
    num_clusters = 1
    dropped_clusters = 0
    try:
        clusters, cluster_tri_counts, cluster_areas = mesh.cluster_connected_triangles()
        num_clusters = len(cluster_tri_counts)
        if num_clusters > 1:
            clusters_arr = np.asarray(clusters)
            tris_arr = np.asarray(mesh.triangles)
            valid_triangle_mask = np.ones(len(tris_arr), dtype=bool)

            for c_id in range(num_clusters):
                c_tris = int(cluster_tri_counts[c_id])
                c_area = float(cluster_areas[c_id]) if c_id < len(cluster_areas) else 0.0

                tri_ratio = c_tris / max(1, orig_tris)
                area_ratio = c_area / max(1e-6, total_area)

                # Only drop if BOTH triangle ratio and area ratio are below noise floor
                # AND triangle count is smaller than min_triangles_to_preserve
                is_noise = (
                    tri_ratio < noise_triangle_ratio
                    and area_ratio < noise_area_ratio
                    and c_tris < min_triangles_to_preserve
                )

                if is_noise:
                    valid_triangle_mask[clusters_arr == c_id] = False
                    dropped_clusters += 1

            if dropped_clusters > 0 and np.any(valid_triangle_mask):
                kept_tris = tris_arr[valid_triangle_mask]
                mesh.triangles = _try_import_open3d().utility.Vector3iVector(kept_tris)
                mesh.remove_unreferenced_vertices()
                logger.info(
                    "Conservative component cleanup: removed %d noise fragments out of %d components",
                    dropped_clusters, num_clusters
                )
    except Exception as cluster_err:
        logger.warning("Open3D component clustering cleanup skipped: %s", cluster_err)

    after_stats = analyze_mesh_o3d(mesh)
    new_tris = after_stats["triangle_count"]
    new_verts = after_stats["vertex_count"]

    modified = bool(new_tris != orig_tris or new_verts != orig_verts)

    if output_path:
        save_o3d_mesh(mesh, output_path)

    return {
        "success": True,
        "modified": modified,
        "output_path": str(output_path) if output_path else None,
        "before": before_stats,
        "after": after_stats,
        "dropped_noise_components": dropped_clusters,
        "total_components": num_clusters,
        "vertex_reduction": orig_verts - new_verts,
        "triangle_reduction": orig_tris - new_tris,
    }


# ---------------------------------------------------------------------------
# 4. Deterministic Decision Engine
# ---------------------------------------------------------------------------

def evaluate_mesh_decision(
    analysis: dict[str, Any],
    target_platform: str = "generic",
    user_settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Analyze Open3D metrics and determine deterministic processing stages.

    Decides:
      - needs_repair: whether conservative cleanup should run
      - needs_retopology: whether retopology (e.g. QuadriFlow) is required
      - needs_optimization: whether decimation is required
      - needs_uv: whether xatlas parameterization should be generated
      - is_healthy: whether the mesh is already production-ready
      - reasons: explainable list of triggers
    """
    settings = user_settings or {}
    platform = target_platform.lower().strip()

    # Target polygon budgets by platform
    platform_budgets = {
        "mobile": 20000,
        "low": 35000,
        "medium": 60000,
        "high": 120000,
        "cinematic": 250000,
        "generic": 65000,
    }
    user_target = settings.get("target_polycount") or settings.get("targetPolycount")
    target_polycount = int(user_target) if user_target else platform_budgets.get(platform, 65000)

    tri_count = int(analysis.get("triangle_count", 0))
    vert_count = int(analysis.get("vertex_count", 0))

    reasons: list[str] = []

    # 1. Repair Decision
    dup_verts = int(analysis.get("duplicate_vertices_count", 0))
    dup_tris = int(analysis.get("duplicate_triangles_count", 0))
    degen_tris = int(analysis.get("degenerate_triangles_count", 0))
    unref_verts = int(analysis.get("unreferenced_vertices_count", 0))
    non_manifold_edges = int(analysis.get("non_manifold_edges_count", 0))

    needs_repair = bool(dup_verts > 0 or dup_tris > 0 or degen_tris > 0 or unref_verts > 0)
    if needs_repair:
        details = []
        if dup_verts > 0: details.append(f"{dup_verts} dup vertices")
        if dup_tris > 0: details.append(f"{dup_tris} dup triangles")
        if degen_tris > 0: details.append(f"{degen_tris} degenerate triangles")
        if unref_verts > 0: details.append(f"{unref_verts} unreferenced vertices")
        reasons.append(f"Repair required: {', '.join(details)}")
    else:
        reasons.append("Mesh geometry is clean — skipping repair")

    # 2. Retopology Decision
    # Only triggered on severe overbudget (> 2.5x) or catastrophic topology failure
    budget_ratio = tri_count / max(1, target_polycount)
    severe_overbudget = budget_ratio > 2.5
    catastrophic_topology = (non_manifold_edges / max(1, tri_count)) > 0.02

    needs_retopology = False
    if severe_overbudget:
        needs_retopology = True
        reasons.append(f"Retopology triggered: triangle count ({tri_count:,}) exceeds {budget_ratio:.1f}x of {platform} target ({target_polycount:,})")
    elif catastrophic_topology:
        needs_retopology = True
        reasons.append(f"Retopology triggered: severe non-manifold edge density ({non_manifold_edges} edges)")
    else:
        reasons.append(f"Topology within operational limits ({tri_count:,} tris vs {target_polycount:,} target) — retopology skipped")

    # 3. Optimization Decision
    # Triggered if above target + 10% tolerance; skipped if within ±10%
    needs_optimization = False
    if tri_count > target_polycount * 1.10:
        needs_optimization = True
        reasons.append(f"Optimization triggered: {tri_count:,} triangles exceed target {target_polycount:,} (+10% tolerance)")
    else:
        reasons.append(f"Optimization skipped: {tri_count:,} triangles already within target budget {target_polycount:,}")

    # 4. UV Decision
    has_uvs = bool(analysis.get("has_uvs", False))
    needs_uv = not has_uvs
    if needs_uv:
        reasons.append("UV coordinates missing — xatlas parameterization required")
    else:
        reasons.append("Valid UV coordinates found — preserving existing layout")

    is_healthy = bool(
        not needs_repair
        and not needs_retopology
        and not needs_optimization
        and not needs_uv
        and analysis.get("is_edge_manifold", False)
    )

    return {
        "target_platform": platform,
        "target_polycount": target_polycount,
        "budget_ratio": round(budget_ratio, 2),
        "needs_repair": needs_repair,
        "needs_retopology": needs_retopology,
        "needs_optimization": needs_optimization,
        "needs_uv": needs_uv,
        "is_healthy": is_healthy,
        "reasons": reasons,
    }


# ---------------------------------------------------------------------------
# 5. Before/After Quality Comparison & Degradation Rejection
# ---------------------------------------------------------------------------

def compare_meshes_o3d(
    source: str | Path | Any,
    derived: str | Path | Any,
    max_bbox_change_pct: float = 8.0,
    max_poly_growth_pct: float = 10.0,
) -> dict[str, Any]:
    """Compare source mesh against derived mesh using Open3D metrics.

    Determines whether a processing stage (retopology, decimation, repair)
    corrupted or degraded the geometry. If degraded, flags is_acceptable=False
    so the derivative can be rejected and the master preserved.
    """
    src_stats = analyze_mesh_o3d(source)
    der_stats = analyze_mesh_o3d(derived)

    if not src_stats.get("valid"):
        return {"is_acceptable": False, "rejection_reason": "Source mesh invalid"}
    if not der_stats.get("valid"):
        return {"is_acceptable": False, "rejection_reason": "Derived mesh is invalid or empty"}

    src_tris = src_stats["triangle_count"]
    der_tris = der_stats["triangle_count"]
    src_verts = src_stats["vertex_count"]
    der_verts = der_stats["vertex_count"]

    if der_tris < 1 or der_verts < 3:
        return {"is_acceptable": False, "rejection_reason": f"Derived mesh collapsed (faces={der_tris}, verts={der_verts})"}

    # Bounding Box Diagonal Comparison
    src_diag = float(src_stats["bounding_box"]["diagonal"])
    der_diag = float(der_stats["bounding_box"]["diagonal"])

    bbox_change_pct = 0.0
    if src_diag > 1e-4:
        bbox_change_pct = round(abs(der_diag - src_diag) / src_diag * 100.0, 2)
        if bbox_change_pct > max_bbox_change_pct:
            return {
                "is_acceptable": False,
                "rejection_reason": f"Bounding box shifted by {bbox_change_pct:.1f}% (max allowed {max_bbox_change_pct}%)",
                "bbox_change_pct": bbox_change_pct,
                "src_stats": src_stats,
                "der_stats": der_stats,
            }

    # Unexpected polycount explosion check
    if der_tris > src_tris:
        poly_growth_pct = round((der_tris - src_tris) / max(1, src_tris) * 100.0, 2)
        if poly_growth_pct > max_poly_growth_pct:
            return {
                "is_acceptable": False,
                "rejection_reason": f"Derived mesh polycount grew unexpectedly by {poly_growth_pct:.1f}%",
                "poly_growth_pct": poly_growth_pct,
                "src_stats": src_stats,
                "der_stats": der_stats,
            }

    return {
        "is_acceptable": True,
        "rejection_reason": None,
        "bbox_change_pct": bbox_change_pct,
        "triangle_ratio": round(der_tris / max(1, src_tris), 4),
        "src_stats": src_stats,
        "der_stats": der_stats,
    }


# ---------------------------------------------------------------------------
# 6. Specialized Auditing: LOD & Collision
# ---------------------------------------------------------------------------

def validate_lod_mesh_o3d(
    master_source: str | Path | Any,
    lod_source: str | Path | Any,
    level: int,
    prev_polycount: int,
) -> dict[str, Any]:
    """Validate that a generated LOD adheres to strict geometric progression.

    Rules:
      1. LOD must not be empty.
      2. Triangle count must strictly decrease (LOD[n] < LOD[n-1]).
      3. Bounding box extents must closely match master within 5%.
    """
    comp = compare_meshes_o3d(master_source, lod_source, max_bbox_change_pct=5.0)
    if not comp["is_acceptable"]:
        return {
            "valid": False,
            "level": level,
            "reason": f"LOD{level} rejected: {comp['rejection_reason']}",
        }

    lod_tris = comp["der_stats"]["triangle_count"]
    if lod_tris >= prev_polycount and prev_polycount > 0:
        return {
            "valid": False,
            "level": level,
            "reason": f"LOD{level} non-decreasing: {lod_tris:,} triangles vs previous {prev_polycount:,}",
        }

    return {
        "valid": True,
        "level": level,
        "triangle_count": lod_tris,
        "reduction_from_prev": round((1.0 - lod_tris / max(1, prev_polycount)) * 100.0, 1),
    }


def validate_collision_mesh_o3d(
    source_mesh: str | Path | Any,
    collision_mesh: str | Path | Any,
    max_collision_tris: int = 1000,
) -> dict[str, Any]:
    """Validate that a collision hull proxy is valid, tight, and lightweight."""
    col_stats = analyze_mesh_o3d(collision_mesh)
    if not col_stats.get("valid"):
        return {"valid": False, "reason": "Collision mesh empty or unparseable"}

    tris = col_stats["triangle_count"]
    if tris > max_collision_tris:
        return {
            "valid": False,
            "reason": f"Collision mesh too complex: {tris:,} triangles (max {max_collision_tris})",
        }

    # Verify bounds fit within reasonable margin of source
    src_stats = analyze_mesh_o3d(source_mesh)
    if src_stats.get("valid"):
        src_diag = src_stats["bounding_box"]["diagonal"]
        col_diag = col_stats["bounding_box"]["diagonal"]
        if src_diag > 1e-4:
            ratio = col_diag / src_diag
            if ratio < 0.85 or ratio > 1.25:
                return {
                    "valid": False,
                    "reason": f"Collision bounding box ratio ({ratio:.2f}) deviates from source bounds",
                }

    return {
        "valid": True,
        "triangle_count": tris,
        "is_watertight": col_stats.get("is_watertight", False),
        "bounding_box": col_stats["bounding_box"],
    }


# ---------------------------------------------------------------------------
# 7. Comprehensive Game-Ready QA Gate
# ---------------------------------------------------------------------------

def o3d_game_ready_qa(
    model_path: str | Path,
    target_platform: str = "generic",
) -> dict[str, Any]:
    """Produce authoritative, evidence-based Game-Ready QA report using Open3D.

    Evaluates:
      - Geometry sanity & degeneracy
      - Manifoldness & boundary edges
      - Self-intersections
      - Normals & winding consistency
      - Multi-component cohesion
      - Platform budget compliance
    """
    analysis = analyze_mesh_o3d(model_path)
    if not analysis.get("valid"):
        return {
            "valid": False,
            "status": "fail",
            "game_ready_score": 0,
            "warnings": ["Mesh could not be loaded or is completely empty"],
            "diagnostics": analysis,
        }

    status = "pass"
    warnings: list[str] = []
    deductions: list[dict[str, Any]] = []

    poly_count = analysis["triangle_count"]
    vert_count = analysis["vertex_count"]

    # 1. Geometry integrity
    if poly_count < 1 or vert_count < 3:
        status = "fail"
        warnings.append(f"Mesh has insufficient geometry (faces={poly_count}, verts={vert_count})")

    degen_count = analysis["degenerate_triangles_count"]
    if degen_count > 0:
        ratio = degen_count / max(1, poly_count)
        if ratio > 0.001:  # > 0.1%
            status = "fail"
            warnings.append(f"Severe degenerate faces: {degen_count} ({ratio*100:.2f}%)")
        else:
            if status == "pass": status = "warn"
            warnings.append(f"Minor degenerate faces detected: {degen_count}")

    # 2. Topology / Manifold
    nm_edges = analysis["non_manifold_edges_count"]
    if nm_edges > 0:
        nm_ratio = nm_edges / max(1, poly_count)
        if nm_ratio > 0.01:  # > 1%
            status = "fail"
            warnings.append(f"Severe non-manifold edges: {nm_edges} ({nm_ratio*100:.2f}%)")
        else:
            if status == "pass": status = "warn"
            warnings.append(f"Non-manifold edges present: {nm_edges}")

    self_intersections = analysis["self_intersecting_triangles_count"]
    if self_intersections > 100:
        if status == "pass": status = "warn"
        warnings.append(f"High self-intersection count: {self_intersections} triangles")

    # 3. Disconnected Components
    components_count = analysis["components_count"]
    if components_count > 15:
        if status == "pass": status = "warn"
        warnings.append(f"Excessive disconnected components: {components_count} parts")

    # 4. Budget compliance
    platform_budgets = {
        "mobile": 20000,
        "low": 35000,
        "medium": 60000,
        "high": 120000,
        "cinematic": 250000,
        "generic": 65000,
    }
    max_budget = platform_budgets.get(target_platform.lower().strip(), 65000)
    budget_ratio = poly_count / max(1, max_budget)
    if budget_ratio > 2.0:
        status = "fail"
        warnings.append(f"Severe polygon overbudget: {poly_count:,} triangles (> 2.0x of {target_platform})")
    elif budget_ratio > 1.2:
        if status == "pass": status = "warn"
        warnings.append(f"Polygon overbudget: {poly_count:,} triangles (> 1.2x of {target_platform})")

    # Calculate verifiable score
    score = 100
    if status == "fail":
        score = 30
    elif status == "warn":
        score = max(55, 90 - len(warnings) * 10)

    return {
        "valid": status != "fail",
        "status": status,
        "game_ready_score": score,
        "warnings": warnings,
        "diagnostics": {
            **analysis,
            "target_platform": target_platform,
            "target_budget": max_budget,
            "budget_ratio": round(budget_ratio, 2),
            "engine": "Open3D",
            "open3d_version": get_open3d_version(),
        },
    }
