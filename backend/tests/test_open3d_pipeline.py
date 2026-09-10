"""
Unit tests for the Open3D Canonical Mesh Analysis, Validation, & Decision Pipeline.
Verifies:
  - Open3D loading, topology diagnostics, watertightness, manifoldness
  - Duplicate, degenerate, and unreferenced geometry detection
  - Conservative safe cleanup preserving legitimate components
  - Deterministic decision engine (repair, retopology, optimization, UV)
  - Before/after mesh quality comparison (rejection of degraded derivatives)
  - LOD cascade validation (strictly decreasing polycount & bound fit)
  - Collision mesh validation (tight bounding box & triangle budget)
  - Evidence-backed Game-Ready QA reports
"""
from pathlib import Path
import numpy as np
import pytest
import trimesh

from app.core.open3d_service import (
    is_open3d_available,
    get_open3d_version,
    load_o3d_mesh,
    analyze_mesh_o3d,
    safe_cleanup_o3d,
    evaluate_mesh_decision,
    compare_meshes_o3d,
    validate_lod_mesh_o3d,
    validate_collision_mesh_o3d,
    o3d_game_ready_qa,
)
from app.core.mesh_optimizer import optimize_mesh, generate_lods, generate_collision_mesh
from app.core.mesh_processor import validate_glb, run_mesh_diagnostics, classify_asset


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def clean_sphere_path(tmp_path) -> str:
    """A clean, watertight icosphere mesh."""
    mesh = trimesh.creation.icosphere(subdivisions=2, radius=1.0)
    p = str(tmp_path / "sphere.glb")
    mesh.export(p)
    return p


@pytest.fixture
def dirty_mesh_path(tmp_path) -> str:
    """A mesh with duplicate vertices, duplicate triangles, and a degenerate face."""
    v = np.array([
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0],  # Duplicate of v[0]
        [0.5, 0.5, 0.0],  # Unreferenced
    ], dtype=float)
    f = np.array([
        [0, 1, 2],
        [0, 1, 2],  # Duplicate face
        [0, 0, 1],  # Degenerate face (collinear/zero-area)
    ], dtype=np.int32)
    mesh = trimesh.Trimesh(vertices=v, faces=f, process=False)
    p = str(tmp_path / "dirty.glb")
    mesh.export(p)
    return p


@pytest.fixture
def multi_component_mesh_path(tmp_path) -> str:
    """A mesh with a main body, a legitimate component (horn), and tiny noise fragments."""
    body = trimesh.creation.box(extents=(2.0, 2.0, 2.0))
    horn = trimesh.creation.cone(radius=0.3, height=1.0)
    horn.apply_translation([0, 0, 1.5])  # Separate component above body

    # Tiny detached noise triangle (noise fragment)
    noise = trimesh.Trimesh(
        vertices=[[5.0, 5.0, 5.0], [5.001, 5.0, 5.0], [5.0, 5.001, 5.0]],
        faces=[[0, 1, 2]],
        process=False,
    )
    combined = trimesh.util.concatenate([body, horn, noise])
    p = str(tmp_path / "multi_part.glb")
    combined.export(p)
    return p


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_open3d_availability():
    """Verify that Open3D >= 0.19.0 is installed and functional."""
    assert is_open3d_available() is True
    version = get_open3d_version()
    assert version is not None
    assert version.startswith("0.19")


def test_analyze_empty_and_corrupt_mesh(tmp_path):
    """Verify safe error handling on non-existent or empty files."""
    empty_path = tmp_path / "empty.glb"
    empty_path.write_bytes(b"")

    res = analyze_mesh_o3d(empty_path)
    assert res["valid"] is False
    assert res["triangle_count"] == 0
    assert res["vertex_count"] == 0


def test_analyze_clean_mesh(clean_sphere_path):
    """Verify topology diagnostics on a standard clean icosphere."""
    analysis = analyze_mesh_o3d(clean_sphere_path)
    assert analysis["valid"] is True
    assert analysis["triangle_count"] == 320
    assert analysis["vertex_count"] == 162
    assert analysis["is_watertight"] is True
    assert analysis["is_edge_manifold"] is True
    assert analysis["is_vertex_manifold"] is True
    assert analysis["surface_area"] > 10.0
    assert analysis["volume"] > 3.0
    assert analysis["components_count"] == 1
    assert analysis["degenerate_triangles_count"] == 0


def test_detect_dirty_geometry():
    """Verify detection of duplicate vertices, duplicate triangles, and degenerates."""
    v = np.array([
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0],  # Duplicate of v[0]
        [0.5, 0.5, 0.0],  # Unreferenced
    ], dtype=float)
    f = np.array([
        [0, 1, 2],
        [0, 1, 2],  # Duplicate face
        [0, 0, 1],  # Degenerate face (collinear/zero-area)
    ], dtype=np.int32)
    import open3d as o3d
    mesh = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(v), o3d.utility.Vector3iVector(f))
    analysis = analyze_mesh_o3d(mesh)
    assert analysis["valid"] is True
    assert analysis["duplicate_vertices_count"] > 0
    assert analysis["duplicate_triangles_count"] > 0 or analysis["degenerate_triangles_count"] > 0


def test_safe_cleanup_preserves_legitimate_components(multi_component_mesh_path, tmp_path):
    """Verify that safe cleanup preserves legitimate accessories while stripping noise."""
    out_cleaned = str(tmp_path / "cleaned.glb")
    res = safe_cleanup_o3d(multi_component_mesh_path, output_path=out_cleaned)
    assert res["success"] is True
    assert Path(out_cleaned).exists()

    # The body and horn components should be preserved
    after_analysis = analyze_mesh_o3d(out_cleaned)
    assert after_analysis["valid"] is True
    assert after_analysis["components_count"] >= 2  # Body + Horn preserved!
    assert after_analysis["triangle_count"] >= 12   # Box + Cone triangles intact


def test_safe_cleanup_preserves_pbr_textures(tmp_path):
    """Verify that safe cleanup preserves PBR image textures, materials, and UV mapping without loss."""
    from PIL import Image
    img = Image.new("RGB", (32, 32), color=(0, 180, 220))
    mat = trimesh.visual.material.PBRMaterial(baseColorTexture=img)
    box = trimesh.creation.box()
    box.visual = trimesh.visual.TextureVisuals(uv=np.random.rand(len(box.vertices), 2), material=mat)
    src_p = str(tmp_path / "textured_input.glb")
    box.export(src_p)

    out_p = str(tmp_path / "textured_cleaned.glb")
    res = safe_cleanup_o3d(src_p, output_path=out_p)
    assert res["success"] is True
    assert Path(out_p).exists()

    reloaded = trimesh.load(out_p, force="mesh")
    assert hasattr(reloaded.visual, "material")
    assert getattr(reloaded.visual.material, "baseColorTexture", None) is not None


def test_decision_engine_routing(clean_sphere_path):
    """Verify decision engine correctly decides processing stages based on budget."""
    analysis = analyze_mesh_o3d(clean_sphere_path)
    # Target 300 triangles: 320 triangles is within ±10% tolerance (300 * 1.10 = 330)
    decision = evaluate_mesh_decision(analysis, target_platform="generic", user_settings={"target_polycount": 300})
    assert decision["needs_optimization"] is False
    assert decision["needs_retopology"] is False
    assert any("already within" in r for r in decision["reasons"])

    # If target is 50 triangles: 320 triangles exceeds budget significantly
    decision_heavy = evaluate_mesh_decision(analysis, target_platform="mobile", user_settings={"target_polycount": 50})
    assert decision_heavy["needs_optimization"] is True
    assert decision_heavy["needs_retopology"] is True


def test_compare_meshes_accepts_valid_and_rejects_degradation(clean_sphere_path, tmp_path):
    """Verify before/after comparison accepts valid meshes and rejects corrupted bounds."""
    # 1. Valid derivative (slightly lower polycount)
    low_poly = trimesh.creation.icosphere(subdivisions=1, radius=1.0)
    low_poly_path = str(tmp_path / "low_poly.glb")
    low_poly.export(low_poly_path)

    comp_valid = compare_meshes_o3d(clean_sphere_path, low_poly_path)
    assert comp_valid["is_acceptable"] is True

    # 2. Corrupted derivative (bounding box enlarged by 300%)
    exploded = trimesh.creation.icosphere(subdivisions=2, radius=4.0)
    exploded_path = str(tmp_path / "exploded.glb")
    exploded.export(exploded_path)

    comp_degraded = compare_meshes_o3d(clean_sphere_path, exploded_path, max_bbox_change_pct=10.0)
    assert comp_degraded["is_acceptable"] is False
    assert "Bounding box shifted" in comp_degraded["rejection_reason"]


def test_lod_validation_cascade(clean_sphere_path, tmp_path):
    """Verify that LOD auditing enforces strictly decreasing counts and bounds containment."""
    # LOD1: 50% faces, same radius
    lod1 = trimesh.creation.icosphere(subdivisions=1, radius=1.0)
    lod1_path = str(tmp_path / "lod1.glb")
    lod1.export(lod1_path)

    audit_pass = validate_lod_mesh_o3d(clean_sphere_path, lod1_path, level=1, prev_polycount=320)
    assert audit_pass["valid"] is True
    assert audit_pass["triangle_count"] < 320

    # Failing case: non-decreasing triangle count
    audit_fail = validate_lod_mesh_o3d(clean_sphere_path, clean_sphere_path, level=2, prev_polycount=320)
    assert audit_fail["valid"] is False
    assert "non-decreasing" in audit_fail["reason"]


def test_collision_mesh_validation(clean_sphere_path, tmp_path):
    """Verify Open3D validation of convex collision hull."""
    col_path = str(tmp_path / "collision.glb")
    res = generate_collision_mesh(clean_sphere_path, col_path)
    assert res["success"] is True

    audit = validate_collision_mesh_o3d(clean_sphere_path, col_path)
    assert audit["valid"] is True
    assert audit["is_watertight"] is True
    assert audit["triangle_count"] <= 1000


def test_game_ready_qa_report(clean_sphere_path):
    """Verify that run_mesh_diagnostics produces an authoritative Open3D QA report."""
    qa = run_mesh_diagnostics(clean_sphere_path, target_platform="generic")
    assert qa["valid"] is True
    assert qa["status"] in ("pass", "warn")
    assert "diagnostics" in qa
    diag = qa["diagnostics"]
    assert diag["triangle_count"] == 320
    assert diag["engine"] == "Open3D"
    assert diag["open3d_version"] is not None
    assert diag["is_watertight"] is True


def test_classify_asset_with_open3d(clean_sphere_path):
    """Verify asset classification utilizes Open3D geometry metrics."""
    res = classify_asset(prompt="mysterious wooden box", model_path=clean_sphere_path)
    assert res["category"] == "generic-prop"
    assert res["confidence"] >= 0.60
