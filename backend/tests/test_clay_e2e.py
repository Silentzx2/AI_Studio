"""End-to-end integration test for OpenX Clay in the AI Studio pipeline."""
import tempfile
import time
from pathlib import Path
import pytest
import trimesh

from clay.postprocess import PostProcessor
from clay.config import PostprocessConfig
from clay.schemas import Generated3DAsset
from clay.lods import make_lods
from clay.collision import make_collision
from clay.blender.ops import export_fbx


def test_full_clay_pipeline_e2e(tmp_path):
    """Simulate the exact sequence executed by Celery tasks.py on a generated mesh."""
    # 1. Create a raw input mesh (simulating provider output of ~20,000 faces)
    raw_mesh = trimesh.creation.icosphere(subdivisions=5)  # 20,480 faces
    source_glb = tmp_path / "source.glb"
    raw_mesh.export(str(source_glb))
    assert source_glb.exists()

    # 2. OpenX Clay Post-Processing (decimate to 5,000 tris budget, unwrap UVs)
    game_ready_path = tmp_path / "game_ready.glb"
    target_budget = 5000

    t0 = time.perf_counter()
    pp_config = PostprocessConfig(
        target_tris=target_budget,
        unwrap_uvs=True,
        format="glb",
    )
    pp = PostProcessor(pp_config)
    raw_asset = Generated3DAsset(path=str(source_glb), format="glb")
    processed_asset = pp.process(raw_asset, out_path=str(game_ready_path))
    duration_ms = (time.perf_counter() - t0) * 1000

    # Verification: output exists, faces decimated, UVs unwrapped
    assert game_ready_path.exists()
    assert game_ready_path.stat().st_size > 0
    assert processed_asset.triangles <= target_budget
    assert duration_ms < 5000  # fast C++ decimation

    loaded = trimesh.load(str(game_ready_path), force="mesh")
    assert len(loaded.faces) <= target_budget
    assert hasattr(loaded.visual, "uv")
    assert len(loaded.visual.uv) > 0

    # 3. OpenX Clay LOD cascade (LOD0 through LOD3)
    lod_dir = tmp_path / "lods"
    lod_res = make_lods(str(game_ready_path), ratios=(1.0, 0.5, 0.25, 0.1), out_dir=str(lod_dir))
    assert lod_res["count"] == 4
    for lod in lod_res["lods"]:
        p = Path(lod["path"])
        assert p.exists()
        assert p.stat().st_size > 0

    # 4. OpenX Clay Collision proxy
    col_path = tmp_path / "collision.glb"
    col_res = make_collision(str(game_ready_path), kind="convex", out_path=str(col_path))
    assert col_path.exists()
    assert col_res["hulls"] >= 1

    # 5. OpenX Clay FBX export via Blender
    fbx_path = tmp_path / "model.fbx"
    fbx_res = export_fbx(str(game_ready_path), str(fbx_path))
    assert fbx_res.get("ok") is True
    assert fbx_path.exists()
    assert fbx_path.stat().st_size > 0
