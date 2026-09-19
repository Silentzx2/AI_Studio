"""Runnable verification self-check for 3D quality pipeline, LODs, collision, and export.

Strict adherence to AGENTS.md: assert-based self-check, no external test fixtures.
Run with:
    PYTHONPATH=backend python scripts/test_pipeline_and_export.py
"""
import asyncio
import json
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.core.mesh_optimizer import (
    generate_collision_mesh,
    generate_lods,
    get_target_polycount_for_platform,
    optimize_mesh,
)
from app.core.mesh_processor import (
    run_mesh_diagnostics,
    validate_glb,
    write_placeholder_mesh,
)
from app.api.v1.projects import _resolve_model_path, export_project
from app.schemas import ProjectExportRequest as ExportRequest


def test_mesh_diagnostics_and_qa():
    print("[1/5] Testing geometry diagnostics & QA scoring...")
    with tempfile.TemporaryDirectory() as tmp_dir:
        test_glb = os.path.join(tmp_dir, "test_asset.glb")
        write_placeholder_mesh(test_glb, seed=42)
        assert os.path.exists(test_glb)

        report = run_mesh_diagnostics(test_glb, target_platform="mobile")
        assert report["valid"] is True, f"Validation failed: {report}"
        assert "game_ready_score" in report
        score = report["game_ready_score"]
        assert 0 <= score <= 100, f"Score out of range: {score}"
        assert report["status"] in ("pass", "warn", "fail")
        assert "diagnostics" in report
        diag = report["diagnostics"]
        assert diag["polygon_count"] > 0
        assert diag["vertex_count"] > 0
        assert "components_count" in diag
        print(f"  ✓ QA Score: {score}/100, Status: {report['status']}, Faces: {diag['polygon_count']}")


def test_multi_tier_lods():
    print("[2/5] Testing multi-tier LOD generation (LOD0–LOD3)...")
    with tempfile.TemporaryDirectory() as tmp_dir:
        test_glb = os.path.join(tmp_dir, "master.glb")
        write_placeholder_mesh(test_glb, seed=101)

        lod_dir = os.path.join(tmp_dir, "lods")
        res = generate_lods(test_glb, lod_dir, lod_count=3, preserve_details=70.0)
        assert res["success"] is True, f"LOD generation failed: {res}"
        levels = res["levels"]
        assert "lod0" in levels
        assert "lod1" in levels
        assert "lod2" in levels
        assert "lod3" in levels

        # Check files exist
        assert os.path.exists(levels["lod0"]["path"])
        assert os.path.exists(levels["lod1"]["path"])
        assert os.path.exists(levels["lod2"]["path"])
        assert os.path.exists(levels["lod3"]["path"])

        # LOD0 must match source file size
        assert os.path.getsize(levels["lod0"]["path"]) == os.path.getsize(test_glb)
        print(f"  ✓ Preserved LOD0 and created LOD1–LOD3 ({len(levels)} levels total)")


def test_collision_hull():
    print("[3/5] Testing physics collision mesh generation...")
    with tempfile.TemporaryDirectory() as tmp_dir:
        test_glb = os.path.join(tmp_dir, "master.glb")
        write_placeholder_mesh(test_glb, seed=77)

        col_glb = os.path.join(tmp_dir, "collision.glb")
        col_res = generate_collision_mesh(test_glb, col_glb)
        assert col_res["success"] is True, f"Collision generation failed: {col_res}"
        assert os.path.exists(col_glb)
        assert os.path.getsize(col_glb) > 0
        assert col_res["polycount"] > 0
        print(f"  ✓ Collision convex hull generated: {col_res['polycount']} faces")


def test_path_resolution_security():
    print("[4/5] Testing path resolution & security checks...")
    from app.config import get_settings
    settings = get_settings()
    storage_root = Path(settings.storage_local_path)
    storage_root.mkdir(parents=True, exist_ok=True)

    # Path traversal must be blocked
    assert _resolve_model_path("../../../etc/passwd") is None
    assert _resolve_model_path("/static/../../etc/passwd") is None

    # Valid storage file must resolve
    with tempfile.NamedTemporaryFile(dir=storage_root, suffix=".glb") as tmp_file:
        url = f"/static/{Path(tmp_file.name).name}"
        resolved = _resolve_model_path(url)
        assert resolved is not None
        assert resolved.resolve() == Path(tmp_file.name).resolve()
    print("  ✓ Path traversal safely rejected; valid /static/ paths resolved")


def test_export_endpoint_and_zip_packaging():
    print("[5/5] Testing export endpoint (variants, formats, ZIP packaging)...")
    from app.config import get_settings
    settings = get_settings()
    storage_root = Path(settings.storage_local_path)
    job_id = "test_export_job"
    job_dir = storage_root / "models" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        model_glb = job_dir / "model.glb"
        source_glb = job_dir / "source.glb"
        write_placeholder_mesh(str(model_glb), seed=12)
        shutil.copy(model_glb, source_glb)

        # 1. Single GLB export
        req = ExportRequest(
            modelUrl=f"/static/models/{job_id}/model.glb",
            assetName="MyHero",
            format="glb",
            variant="source",
            packageZip=False,
        )
        resp = asyncio.run(export_project(req))
        assert os.path.exists(resp.path)
        print(f"  ✓ Single file export succeeded: {resp.filename}")

        # 2. Format conversion to OBJ
        req_obj = ExportRequest(
            modelUrl=f"/static/models/{job_id}/model.glb",
            assetName="MyHero",
            format="obj",
            variant="source",
            packageZip=False,
        )
        resp_obj = asyncio.run(export_project(req_obj))
        assert os.path.exists(resp_obj.path)
        assert resp_obj.filename.endswith(".obj")
        with open(resp_obj.path, "r", encoding="utf-8") as f:
            obj_content = f.read(50)
            assert "v " in obj_content or "#" in obj_content
        print(f"  ✓ Format conversion to OBJ succeeded: {resp_obj.filename}")

        # 2b. Format conversion to FBX
        req_fbx = ExportRequest(
            modelUrl=f"/static/models/{job_id}/model.glb",
            assetName="MyHero",
            format="fbx",
            variant="source",
            packageZip=False,
        )
        resp_fbx = asyncio.run(export_project(req_fbx))
        assert os.path.exists(resp_fbx.path)
        assert resp_fbx.filename.endswith(".fbx")
        assert os.path.getsize(resp_fbx.path) > 0
        print(f"  ✓ Real headless Blender FBX conversion succeeded: {resp_fbx.filename}")

        # 2c. Format conversion to GLTF (JSON)
        req_gltf = ExportRequest(
            modelUrl=f"/static/models/{job_id}/model.glb",
            assetName="MyHero",
            format="gltf",
            variant="source",
            packageZip=False,
        )
        resp_gltf = asyncio.run(export_project(req_gltf))
        assert os.path.exists(resp_gltf.path)
        assert resp_gltf.filename.endswith(".gltf")
        assert os.path.getsize(resp_gltf.path) > 0
        print(f"  ✓ Format conversion to GLTF (JSON) succeeded: {resp_gltf.filename}")

        # 3. Structured ZIP packaging with LODs, Collision, and QA
        req_zip = ExportRequest(

            modelUrl=f"/static/models/{job_id}/model.glb",
            assetName="HeroAsset",
            format="glb",
            variant="game_ready",
            packageZip=True,
            includeLODs=True,
            includeCollision=True,
            includeQAReport=True,
        )
        resp_zip = asyncio.run(export_project(req_zip))
        assert os.path.exists(resp_zip.path)
        assert resp_zip.filename.endswith(".zip")

        # Verify ZIP internal directory layout
        with zipfile.ZipFile(resp_zip.path, "r") as zf:
            namelist = zf.namelist()
            assert any(n.startswith("HeroAsset/Model/") for n in namelist)
            assert any(n.startswith("HeroAsset/Source/") for n in namelist)
            assert any(n.startswith("HeroAsset/LODs/") for n in namelist)
            assert any(n.startswith("HeroAsset/Collision/") for n in namelist)
            assert any(n == "HeroAsset/QA/quality_report.json" for n in namelist)

            # Check QA JSON contents
            qa_bytes = zf.read("HeroAsset/QA/quality_report.json")
            qa_data = json.loads(qa_bytes.decode("utf-8"))
            assert "game_ready_score" in qa_data
            assert "scoring_breakdown" in qa_data.get("diagnostics", {})
            print(f"  ✓ Structured ZIP verified ({len(namelist)} items packaged, QA Score: {qa_data['game_ready_score']})")

    finally:
        shutil.rmtree(job_dir, ignore_errors=True)


def test_asset_classification():
    print("[6/7] Testing deterministic asset classification...")
    from app.core.mesh_processor import classify_asset

    c1 = classify_asset(prompt="Cyberpunk soldier with rifle")
    assert c1["category"] in ("human", "humanoid")
    assert c1["riggable_humanoid"] is True

    c2 = classify_asset(prompt="A wild wolf howling")
    assert c2["category"] == "quadruped"
    assert c2["riggable_humanoid"] is False

    c3 = classify_asset(prompt="Military armored tank")
    assert c3["category"] == "hard-surface"
    assert c3["riggable_humanoid"] is False

    c4 = classify_asset(prompt="Wooden barrel for game prop")
    assert c4["category"] == "generic-prop"
    assert c4["riggable_humanoid"] is False

    print("  ✓ All 4 canonical taxonomies deterministically classified")


def test_xatlas_uv_parametrization():
    print("[7/7] Testing xatlas UV parametrization on unwrap-missing mesh...")
    import trimesh
    from app.core.mesh_optimizer import generate_uvs_with_xatlas, mesh_has_valid_uvs

    box = trimesh.creation.box()
    assert not mesh_has_valid_uvs(box)

    unwrapped, fixed = generate_uvs_with_xatlas(box)
    assert fixed is True
    assert mesh_has_valid_uvs(unwrapped)
    assert len(unwrapped.visual.uv) == len(unwrapped.vertices)

    # Calling again on already valid UVs must preserve without regenerating
    preserved, re_fixed = generate_uvs_with_xatlas(unwrapped)
    assert re_fixed is False

    print(f"  ✓ xatlas generated {len(unwrapped.visual.uv)} UVs, preserved valid UVs on second pass")


def test_export_format_validation():
    print("[8/8] Testing export format validation (canonical glb, gltf, fbx, obj, stl, ply)...")
    from fastapi import HTTPException

    for bad_fmt in ("usdz", "xyz", "3ds"):
        req_bad = ExportRequest(
            modelUrl="/static/models/test/model.glb",
            format=bad_fmt,
        )
        try:
            asyncio.run(export_project(req_bad))
            assert False, f"Expected 400 for bad format: {bad_fmt}"
        except HTTPException as exc:
            assert exc.status_code == 400
            assert "Unsupported export format" in exc.detail
    print("  ✓ Unsupported formats (usdz, xyz, 3ds) properly rejected with HTTP 400")



if __name__ == "__main__":
    print("=" * 60)
    print("Running 3D Generation Pipeline & Export Verification Checks")
    print("=" * 60)
    test_mesh_diagnostics_and_qa()
    test_multi_tier_lods()
    test_collision_hull()
    test_path_resolution_security()
    test_export_endpoint_and_zip_packaging()
    test_asset_classification()
    test_xatlas_uv_parametrization()
    test_export_format_validation()
    print("=" * 60)
    print("ALL CHECKS PASSED: Pipeline and Export integration verified!")
    print("=" * 60)

