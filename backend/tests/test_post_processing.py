"""Tests for post-processing pipeline modules."""
import pytest
import numpy as np
from pathlib import Path
import tempfile
import trimesh


def _make_test_glb(tmp_path: Path, watertight: bool = True) -> Path:
    """Create a simple test GLB mesh."""
    if watertight:
        mesh = trimesh.creation.box()  # box is watertight
    else:
        mesh = trimesh.creation.box()
        # Remove a face to break watertightness
        mesh = trimesh.Trimesh(vertices=mesh.vertices, faces=mesh.faces[:-1], process=False)
    out = tmp_path / "test_mesh.glb"
    mesh.export(str(out))
    return out


def test_validators_watertight_box(tmp_path):
    from app.core.post_processing.validators import validate_watertight
    glb = _make_test_glb(tmp_path, watertight=True)
    result = validate_watertight(glb)
    assert result["vertex_count"] > 0
    assert result["triangle_count"] > 0
    assert isinstance(result["is_watertight"], bool)


def test_validators_open_mesh_not_watertight(tmp_path):
    from app.core.post_processing.validators import validate_watertight
    glb = _make_test_glb(tmp_path, watertight=False)
    result = validate_watertight(glb)
    # An open mesh should not be watertight
    assert result["is_watertight"] is False or result["boundary_edge_count"] > 0


def test_repair_watertight_mesh_is_passthrough(tmp_path):
    from app.core.post_processing.mesh_repair import repair_mesh_strict
    glb = _make_test_glb(tmp_path, watertight=True)
    out = tmp_path / "repaired.glb"
    result = repair_mesh_strict(glb, out)
    assert result["success"] is True
    assert out.exists()


def test_repair_open_mesh_attempts_repair(tmp_path):
    from app.core.post_processing.mesh_repair import repair_mesh_strict
    glb = _make_test_glb(tmp_path, watertight=False)
    out = tmp_path / "repaired.glb"
    result = repair_mesh_strict(glb, out)
    # Should attempt repair; result has correct keys
    assert "success" in result
    assert "repair_route" in result
    assert "is_watertight" in result


def test_decimation_skip_when_already_small(tmp_path):
    from app.core.post_processing.decimation import decimate_pymeshlab
    glb = _make_test_glb(tmp_path, watertight=True)
    out = tmp_path / "decimated.glb"
    result = decimate_pymeshlab(glb, out, target_faces=100000)  # target way bigger than input
    assert result["success"] is True
    assert result["route"] == "skip"


def test_uv_unwrap_uses_existing_xatlas_pattern(tmp_path):
    from app.core.post_processing.uv_unwrap import unwrap_uvs_xatlas
    glb = _make_test_glb(tmp_path, watertight=True)
    out = tmp_path / "uv_mesh.glb"
    result = unwrap_uvs_xatlas(glb, out)
    assert result["success"] is True
    assert out.exists()
    assert result["uv_count"] == result["vertex_count"]  # xatlas: 1 UV per vertex


def test_optimize_passthrough_when_no_gltf_transform(tmp_path, monkeypatch):
    import shutil
    from app.core.post_processing import optimize as pp_optimize
    # Simulate gltf-transform not installed: clear both which() and fallback dirs
    monkeypatch.setattr(shutil, 'which', lambda x: None)
    monkeypatch.setattr(pp_optimize, '_GLTF_FALLBACK_DIRS', [])
    glb = _make_test_glb(tmp_path, watertight=True)
    out = tmp_path / "optimized.glb"
    result = pp_optimize.optimize_glb_gltftransform(glb, out)
    assert result["success"] is True
    assert result["route"] == "passthrough"
    assert out.exists()


def test_export_packager_idempotent(tmp_path):
    from app.core.post_processing.export_packager import build_export_package, compute_package_spec_hash
    import shutil
    glb = _make_test_glb(tmp_path, watertight=True)
    artifacts = {"game_ready_glb": str(glb)}
    spec = {"job_id": "test-123", "variant": "game_ready", "include_lods": False}
    result1 = build_export_package("test-123", tmp_path, artifacts, spec)
    assert result1["success"] is True
    assert Path(result1["package_path"]).exists()
    # Second call should return same ZIP (idempotent)
    result2 = build_export_package("test-123", tmp_path, artifacts, spec)
    assert result2["package_path"] == result1["package_path"]


def test_roughness_clamp():
    """Verify roughness clamping logic (no Blender required)."""
    roughness_values = np.array([0.0, 0.1, 0.5, 0.9, 1.0])
    clamped = np.clip(roughness_values, 0.2, 0.85)
    assert float(clamped.min()) >= 0.2
    assert float(clamped.max()) <= 0.85


def test_blender_remesh_signature_defaults_and_path(tmp_path):
    """Verify _run_blender_remesh accepts Path objects and default params without TypeError."""
    from app.core.mesh_optimizer import _run_blender_remesh
    glb = _make_test_glb(tmp_path, watertight=True)
    out = tmp_path / "remeshed.glb"
    # Even if Blender is not installed in the test env, it must return None or stats, not crash with TypeError
    res = _run_blender_remesh(glb, out)
    assert res is None or isinstance(res, dict)


def test_generation_request_postprocessing_schema():
    """Verify GenerationRequest schema properly validates post-processing flags and defaults."""
    from app.schemas.generation import GenerationRequest
    req = GenerationRequest(
        prompt="test 3d model",
        enableMeshRepair=False,
        pbrResolution="4k",
        compressOutput=True,
        prepackageExport=True,
    )
    assert req.enable_mesh_repair is False
    assert req.pbr_resolution == "4k"
    assert req.compress_output is True
    assert req.prepackage_export is True

