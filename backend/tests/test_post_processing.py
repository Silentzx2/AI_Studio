"""Tests for OpenX Clay post-processing pipeline integration."""
import pytest
from pathlib import Path
import trimesh
from PIL import Image

from clay.postprocess import PostProcessor
from clay.config import PostprocessConfig
from clay.schemas import Generated3DAsset
from clay.lods import make_lods
from clay.collision import make_collision


def _make_test_mesh(tmp_path: Path, textured: bool = False) -> Path:
    """Create a simple test mesh (icosphere)."""
    mesh = trimesh.creation.icosphere(subdivisions=4)  # 5,120 faces
    out = tmp_path / "test_mesh.glb"
    if textured:
        import numpy as np
        img = Image.new("RGB", (64, 64), color="red")
        mat = trimesh.visual.material.PBRMaterial(baseColorTexture=img)
        uvs = np.random.rand(len(mesh.vertices), 2)
        mesh.visual = trimesh.visual.TextureVisuals(uv=uvs, material=mat)
    mesh.export(str(out))
    return out


def test_clay_postprocess_decimates_mesh(tmp_path):
    """Test that Clay decimation reduces triangles to target budget."""
    glb = _make_test_mesh(tmp_path, textured=False)
    out = tmp_path / "game_ready.glb"
    target_tris = 1000

    config = PostprocessConfig(target_tris=target_tris, unwrap_uvs=True, format="glb")
    pp = PostProcessor(config)
    asset = Generated3DAsset(path=str(glb), format="glb")

    result = pp.process(asset, out_path=str(out))
    assert result.triangles <= target_tris
    assert Path(result.path).exists()
    assert Path(result.path).stat().st_size > 0

    # Verify loaded mesh
    loaded = trimesh.load(result.path, force="mesh")
    assert len(loaded.faces) <= target_tris
    assert hasattr(loaded.visual, "uv")
    assert len(loaded.visual.uv) > 0


def test_clay_postprocess_preserves_textured_mesh(tmp_path):
    """Test that Clay preserves meshes that already carry real baked textures."""
    glb = _make_test_mesh(tmp_path, textured=True)
    out = tmp_path / "game_ready_textured.glb"

    config = PostprocessConfig(target_tris=500, unwrap_uvs=True, format="glb")
    pp = PostProcessor(config)
    asset = Generated3DAsset(path=str(glb), format="glb")

    result = pp.process(asset, out_path=str(out))
    assert Path(result.path).exists()
    # When textured, decimate is skipped to preserve the texture map
    loaded = trimesh.load(result.path, force="mesh")
    assert len(loaded.faces) == 5120  # original count preserved


def test_clay_lods_generation(tmp_path):
    """Test that Clay make_lods generates descending ratio LOD chain."""
    glb = _make_test_mesh(tmp_path, textured=False)
    lod_dir = tmp_path / "lods"

    res = make_lods(str(glb), ratios=(1.0, 0.5, 0.25), out_dir=str(lod_dir))
    assert res["count"] == 3
    assert len(res["lods"]) == 3
    for lod in res["lods"]:
        assert Path(lod["path"]).exists()
        assert lod["faces"] > 0

    # Verify descending face count
    faces = [l["faces"] for l in res["lods"]]
    assert faces[0] >= faces[1] >= faces[2]


def test_clay_collision_generation(tmp_path):
    """Test that Clay make_collision builds a valid physics proxy."""
    glb = _make_test_mesh(tmp_path, textured=False)
    col_path = tmp_path / "collision.glb"

    res = make_collision(str(glb), kind="convex", out_path=str(col_path))
    assert res["kind"] == "convex"
    assert Path(res["path"]).exists()
    assert res["faces"] > 0
    assert res["hulls"] == 1


def test_clay_blender_fbx_export(tmp_path):
    """Test Clay's headless Blender FBX export."""
    glb = _make_test_mesh(tmp_path, textured=False)
    fbx_path = tmp_path / "exported.fbx"

    from clay.blender.ops import export_fbx
    res = export_fbx(str(glb), str(fbx_path))
    assert res.get("ok") is True
    assert Path(res["output"]).exists()
    assert Path(res["output"]).stat().st_size > 0


def test_clay_corrupt_input_fails_visibly(tmp_path):
    """Test that invalid/corrupt input raises an exception instead of silent success."""
    corrupt_file = tmp_path / "corrupt.glb"
    corrupt_file.write_bytes(b"not a real glb file")

    config = PostprocessConfig(target_tris=1000, unwrap_uvs=True, format="glb")
    pp = PostProcessor(config)
    asset = Generated3DAsset(path=str(corrupt_file), format="glb")

    with pytest.raises(Exception):
        pp.process(asset, out_path=str(tmp_path / "out.glb"))
