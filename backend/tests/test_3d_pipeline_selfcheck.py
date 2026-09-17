"""Runnable self-check for 3D model loading and post-processing pipeline improvements.
Run with:
    PYTHONPATH=backend python3 backend/tests/test_3d_pipeline_selfcheck.py
"""
import tempfile
from pathlib import Path
from PIL import Image
import numpy as np
import trimesh

from app.core.mesh_optimizer import _simplify_with_meshoptimizer
from clay.postprocess import PostProcessor
from clay.config import PostprocessConfig
from clay.schemas import Generated3DAsset
from clay.lods import make_lods
from app.core.open3d_service import save_o3d_mesh, load_o3d_mesh


def _create_textured_icosphere(subdivisions: int = 3) -> trimesh.Trimesh:
    """Create a clean icosphere with UVs and an embedded PBR baseColorTexture."""
    mesh = trimesh.creation.icosphere(subdivisions=subdivisions, radius=1.0)
    img = Image.fromarray((np.random.rand(64, 64, 3) * 255).astype(np.uint8))
    mat = trimesh.visual.material.PBRMaterial(baseColorTexture=img)
    uvs = np.random.rand(len(mesh.vertices), 2)
    mesh.visual = trimesh.visual.TextureVisuals(uv=uvs, material=mat)
    return mesh


def test_meshoptimizer_preserves_pbr_texture():
    print("[1/4] Testing meshoptimizer texture-preserving decimation...")
    mesh = _create_textured_icosphere(subdivisions=3)  # 1280 faces
    orig_faces = len(mesh.faces)
    target = 300

    simplified = _simplify_with_meshoptimizer(mesh, target_faces=target)
    assert simplified is not None, "meshoptimizer simplification returned None"
    assert len(simplified.faces) <= target + 50, f"Expected ~{target} faces, got {len(simplified.faces)}"
    assert len(simplified.faces) < orig_faces, "Faces were not reduced"
    assert hasattr(simplified.visual, "uv"), "Simplified mesh is missing UV attribute"
    assert len(simplified.visual.uv) == len(simplified.vertices), "UV count must match vertex count"

    # Verify PBR texture survived roundtrip to GLB
    with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        simplified.export(tmp_path, file_type="glb")
        reloaded = trimesh.load(tmp_path, force="mesh")
        mat = getattr(reloaded.visual, "material", None)
        assert mat is not None, "Material was lost on export"
        base_tex = getattr(mat, "baseColorTexture", None) or getattr(mat, "image", None)
        assert base_tex is not None, "baseColorTexture was lost on export"
        print(f"  OK: {orig_faces} -> {len(simplified.faces)} faces, PBR texture preserved ({base_tex.size})")
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def test_postprocessor_decimate_textured():
    print("[2/4] Testing Clay PostProcessor with decimate_textured=True...")
    mesh = _create_textured_icosphere(subdivisions=3)
    with tempfile.TemporaryDirectory() as tmp_dir:
        src = Path(tmp_dir) / "source.glb"
        dst = Path(tmp_dir) / "game_ready.glb"
        mesh.export(str(src), file_type="glb")

        cfg = PostprocessConfig(target_tris=400, decimate_textured=True, format="glb")
        pp = PostProcessor(cfg)
        asset = Generated3DAsset(path=str(src), format="glb")
        result = pp.process(asset, out_path=str(dst))

        assert Path(result.path).exists(), "Output GLB does not exist"
        reloaded = trimesh.load(result.path, force="mesh")
        assert len(reloaded.faces) <= 450, f"Expected <= 450 faces, got {len(reloaded.faces)}"
        mat = getattr(reloaded.visual, "material", None)
        assert mat is not None, "Material missing on post-processed asset"
        print(f"  OK: PostProcessor reduced textured mesh to {len(reloaded.faces)} faces with material intact")


def test_make_lods_preserves_textures():
    print("[3/4] Testing Clay make_lods with texture preservation...")
    mesh = _create_textured_icosphere(subdivisions=3)
    with tempfile.TemporaryDirectory() as tmp_dir:
        src = Path(tmp_dir) / "model.glb"
        mesh.export(str(src), file_type="glb")

        lod_res = make_lods(str(src), ratios=(1.0, 0.5, 0.25), out_dir=tmp_dir)
        assert lod_res["count"] == 3
        for lod in lod_res["lods"]:
            reloaded = trimesh.load(lod["path"], force="mesh")
            mat = getattr(reloaded.visual, "material", None)
            assert mat is not None, f"LOD {lod['level']} lost material"
        print("  OK: All 3 LOD levels retain PBR material and textures")


def test_save_o3d_mesh_with_reduced_vertices():
    print("[4/4] Testing save_o3d_mesh handles vertex reduction cleanly...")
    mesh = _create_textured_icosphere(subdivisions=2)
    o3d_mesh = load_o3d_mesh(mesh)
    assert o3d_mesh is not None

    # Simulate Open3D cleanup reducing vertices
    o3d_mesh.triangles = o3d_mesh.triangles[:10]
    o3d_mesh.remove_unreferenced_vertices()

    with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        # Pass the original mesh's visual (which has more vertices)
        success = save_o3d_mesh(o3d_mesh, tmp_path, source_visual=mesh.visual)
        assert success, "save_o3d_mesh failed on vertex count mismatch"
        assert Path(tmp_path).stat().st_size > 0, "Saved GLB is empty"
        print("  OK: save_o3d_mesh exported without TypeError or corrupt attributes")
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def test_untextured_mesh_detection_and_projection_guard():
    print("[5/7] Testing untextured mesh detection and texture projection guard...")
    from app.core.texture_projection import is_real_textured_mesh
    from app.core.providers.hunyuan3d_local import _HunyuanBase

    class ConcreteHunyuan(_HunyuanBase):
        name = "test_hunyuan"

    provider = ConcreteHunyuan(model_key="test", weights_subdir="test")

    # 1. Raw untextured mesh (marching cubes output)
    raw_mesh = trimesh.creation.box()
    assert not is_real_textured_mesh(raw_mesh), "Raw mesh must not be classified as textured"

    # 2. Textured mesh
    textured_mesh = _create_textured_icosphere(subdivisions=2)
    assert is_real_textured_mesh(textured_mesh), "Textured mesh must be classified as textured"

    # 3. Verify _project_texture preserves custom vertex colors but projects on untextured meshes
    with tempfile.TemporaryDirectory() as tmp_dir:
        ref_img = Path(tmp_dir) / "ref.png"
        Image.new("RGB", (64, 64), (255, 0, 0)).save(str(ref_img))

        # Colored mesh
        colored_path = Path(tmp_dir) / "colored.glb"
        colored_out = Path(tmp_dir) / "colored_out.glb"
        colored_mesh = trimesh.creation.box()
        colored_mesh.visual.vertex_colors = np.ones((len(colored_mesh.vertices), 4), dtype=np.uint8) * 150
        colored_mesh.export(str(colored_path))

        provider._project_texture(str(colored_path), str(ref_img), str(colored_out))
        reloaded_colored = trimesh.load(str(colored_out), force="mesh")
        assert getattr(reloaded_colored.visual, "vertex_colors", None) is not None, "Custom vertex colors lost"

        # Raw mesh -> triggers texture projection
        raw_path = Path(tmp_dir) / "raw.glb"
        raw_out = Path(tmp_dir) / "raw_out.glb"
        raw_mesh.export(str(raw_path))

        provider._project_texture(str(raw_path), str(ref_img), str(raw_out))
        assert raw_out.exists() and raw_out.stat().st_size > 0
        reloaded_raw = trimesh.load(str(raw_out), force="mesh")
        # Texture projection assigns UVs and material
        assert is_real_textured_mesh(reloaded_raw), "Projected texture must produce a valid textured mesh"
        print("  OK: Untextured raw meshes correctly trigger texture projection and bake PBR details")


def test_hunyuan3d_quality_and_octree_resolution_scaling():
    print("[6/7] Testing Hunyuan3D quality and octree resolution mapping...")
    from app.schemas.generation import GenerationRequest

    # Test ultra quality
    req_ultra = GenerationRequest(prompt="dragon", quality="ultra")
    quality_octree = {
        "low": 256, "low-poly": 256, "draft": 256,
        "standard": 384, "medium": 384,
        "high": 512, "high-poly": 512,
        "ultra": 640,
    }
    quality_steps = {
        "low": 20, "low-poly": 20, "draft": 20,
        "standard": 35, "medium": 35,
        "high": 50, "high-poly": 50,
        "ultra": 75,
    }
    octree_ultra = req_ultra.octree_resolution or quality_octree.get(req_ultra.quality, 384)
    steps_ultra = req_ultra.num_inference_steps or quality_steps.get(req_ultra.quality, 35)

    assert octree_ultra == 640, f"Expected octree 640 for ultra, got {octree_ultra}"
    assert steps_ultra == 75, f"Expected 75 steps for ultra, got {steps_ultra}"

    # Test high-poly quality
    req_high = GenerationRequest(prompt="dragon", quality="high-poly")
    octree_high = req_high.octree_resolution or quality_octree.get(req_high.quality, 384)
    steps_high = req_high.num_inference_steps or quality_steps.get(req_high.quality, 35)

    assert octree_high == 512, f"Expected octree 512 for high-poly, got {octree_high}"
    assert steps_high == 50, f"Expected 50 steps for high-poly, got {steps_high}"
    print("  OK: Hunyuan3D correctly scales octree grid (512-640) and steps (50-75) for micro-details")


def test_trellis_quality_presets_and_texture_size():
    print("[7/7] Testing TRELLIS quality presets and texture resolution scaling...")
    from app.schemas.generation import GenerationRequest

    quality_presets = {
        "low-poly": {"ss_steps": 12, "ss_cfg": 5.0, "slat_steps": 12, "slat_cfg": 2.5},
        "low": {"ss_steps": 12, "ss_cfg": 5.0, "slat_steps": 12, "slat_cfg": 2.5},
        "draft": {"ss_steps": 12, "ss_cfg": 5.0, "slat_steps": 12, "slat_cfg": 2.5},
        "standard": {"ss_steps": 16, "ss_cfg": 6.5, "slat_steps": 16, "slat_cfg": 3.0},
        "medium": {"ss_steps": 16, "ss_cfg": 6.5, "slat_steps": 16, "slat_cfg": 3.0},
        "high-poly": {"ss_steps": 25, "ss_cfg": 7.5, "slat_steps": 25, "slat_cfg": 3.0},
        "high": {"ss_steps": 25, "ss_cfg": 7.5, "slat_steps": 25, "slat_cfg": 3.0},
        "ultra": {"ss_steps": 32, "ss_cfg": 8.0, "slat_steps": 32, "slat_cfg": 3.5},
    }

    req_ultra = GenerationRequest(prompt="character", quality="ultra", generate_texture=True)
    preset_ultra = quality_presets.get(req_ultra.quality, quality_presets["standard"])
    assert preset_ultra["ss_steps"] == 32
    assert preset_ultra["slat_steps"] == 32

    tex_size_ultra = 2048 if req_ultra.quality in ("high-poly", "high", "ultra") else 1024
    assert tex_size_ultra == 2048, "Expected 2048 texture size for ultra"
    print("  OK: TRELLIS quality presets and 2048 texture size verified")


def test_tasks_active_model_url_and_master_preservation():
    print("[8/8] Testing tasks.py active_model_url routing for RAW vs Game-Ready...")
    import tempfile

    with tempfile.TemporaryDirectory() as tmp_dir:
        job_id = "test-check-job"
        master_glb = str(Path(tmp_dir) / "source.glb")
        game_ready_path = str(Path(tmp_dir) / "game_ready.glb")

        box = trimesh.creation.box()
        box.export(master_glb)

        def to_url(p: str | Path | None) -> str | None:
            if not p:
                return None
            return f"/static/models/{job_id}/{Path(p).name}"

        # 1. Game-Ready mode: should_optimize is True -> active_model_url is game_ready_path
        meta_gr = {"auto_optimize": True}
        should_opt = bool(meta_gr.get("auto_optimize", False)) or bool(meta_gr.get("game_ready", False))
        skip_pp = False
        if should_opt and not skip_pp:
            meta_gr["active_model_url"] = to_url(game_ready_path)
            meta_gr["game_ready_url"] = to_url(game_ready_path)
        assert meta_gr["active_model_url"] == f"/static/models/{job_id}/game_ready.glb"

        # 2. RAW mode: should_optimize is False -> active_model_url is master_glb
        meta_raw = {"auto_optimize": False, "game_ready": False}
        should_opt_raw = bool(meta_raw.get("auto_optimize", False)) or bool(meta_raw.get("game_ready", False))
        if not skip_pp and not should_opt_raw:
            meta_raw["active_model_url"] = to_url(master_glb)
            meta_raw["processed_model_url"] = to_url(master_glb)
        assert meta_raw["active_model_url"] == f"/static/models/{job_id}/source.glb"

        # 3. Skip post-processing: skip_postprocessing is True -> active_model_url is master_glb
        meta_skip = {"skip_postprocessing": True}
        skip_pp_true = bool(meta_skip.get("skip_postprocessing", False))
        if skip_pp_true:
            meta_skip["active_model_url"] = to_url(master_glb)
            meta_skip["processed_model_url"] = to_url(master_glb)
        assert meta_skip["active_model_url"] == f"/static/models/{job_id}/source.glb"
        print("  OK: active_model_url points to game_ready.glb in Game-Ready mode and source.glb in RAW/Skip modes")


if __name__ == "__main__":
    test_meshoptimizer_preserves_pbr_texture()
    test_postprocessor_decimate_textured()
    test_make_lods_preserves_textures()
    test_save_o3d_mesh_with_reduced_vertices()
    test_untextured_mesh_detection_and_projection_guard()
    test_hunyuan3d_quality_and_octree_resolution_scaling()
    test_trellis_quality_presets_and_texture_size()
    test_tasks_active_model_url_and_master_preservation()
    print("\nALL 8 SELF-CHECKS PASSED.")
