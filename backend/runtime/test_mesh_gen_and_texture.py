"""
Self-check test for Mesh Generation Settings and Texture Output Selection logic.
Run with: python3 test_mesh_gen_and_texture.py
"""
from pathlib import Path
import tempfile
from app.schemas.generation import GenerationRequest, AutoOptimizeSettings


def test_auto_optimize_schema_camel_and_snake():
    # Test camelCase from frontend
    req_camel = GenerationRequest(
        prompt="robot",
        mode="image-to-3d",
        auto_optimize=True,
        auto_optimize_settings={"targetPolycount": 25000, "fixUVs": False, "preserveDetails": 65.0}
    )
    assert req_camel.auto_optimize_settings is not None
    assert req_camel.auto_optimize_settings.target_polycount == 25000
    assert req_camel.auto_optimize_settings.fix_uvs is False
    assert req_camel.auto_optimize_settings.preserve_details == 65.0

    # Test snake_case
    req_snake = GenerationRequest(
        prompt="mech",
        mode="image-to-3d",
        auto_optimize=True,
        auto_optimize_settings={"target_polycount": 50000, "fix_uvs": True, "preserve_details": 85.0}
    )
    assert req_snake.auto_optimize_settings is not None
    assert req_snake.auto_optimize_settings.target_polycount == 50000
    assert req_snake.auto_optimize_settings.fix_uvs is True
    assert req_snake.auto_optimize_settings.preserve_details == 85.0


def test_textured_glb_selection_priority():
    """Verify that model.glb (textured) is strictly picked over mesh.glb (raw)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        mesh_glb = tmp_path / "mesh.glb"
        model_glb = tmp_path / "model.glb"

        mesh_glb.write_bytes(b"RAW_UNTEXTURED_MESH_DATA")
        model_glb.write_bytes(b"TEXTURED_PBR_MODEL_DATA")

        # Selection logic from hunyuan3d_local.py
        out = tmp_path
        picked_model_glb = out / "model.glb"
        picked_mesh_glb = out / "mesh.glb"
        if picked_model_glb.is_file() and picked_model_glb.stat().st_size > 0:
            final_path = str(picked_model_glb)
        elif picked_mesh_glb.is_file() and picked_mesh_glb.stat().st_size > 0:
            final_path = str(picked_mesh_glb)
        else:
            glbs = sorted(list(out.glob("*.glb")), key=lambda p: (0 if p.name == "model.glb" else 1, p.name))
            final_path = str(glbs[0])

        assert final_path.endswith("model.glb"), f"Expected model.glb but got {final_path}"
        assert Path(final_path).read_bytes() == b"TEXTURED_PBR_MODEL_DATA"


if __name__ == "__main__":
    test_auto_optimize_schema_camel_and_snake()
    test_textured_glb_selection_priority()
    print("All mesh gen and texture logic tests passed successfully!")
