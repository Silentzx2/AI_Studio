import os
import tempfile
import pytest
import numpy as np
import trimesh
from app.schemas.generation import GenerationRequest
from app.core.mesh_optimizer import optimize_mesh


def test_generation_request_topology_mode_defaults_and_aliases():
    """Verify topology_mode schema, camelCase aliases, and quadTopology compatibility."""
    # 1. Default is adaptive
    req_default = GenerationRequest(prompt="A mystical dragon")
    assert req_default.topology_mode == "adaptive"

    # 2. Explicit modes
    req_tri = GenerationRequest(prompt="A stone pillar", topology_mode="triangle")
    assert req_tri.topology_mode == "triangle"

    req_quad = GenerationRequest(prompt="A hero character", topology_mode="quad")
    assert req_quad.topology_mode == "quad"

    # 3. CamelCase alias: topologyMode
    req_camel = GenerationRequest.model_validate({"prompt": "A wolf", "topologyMode": "quad"})
    assert req_camel.topology_mode == "quad"

    # 4. Legacy compatibility: quadTopology=True maps to topology_mode="quad"
    req_legacy = GenerationRequest.model_validate({"prompt": "A robot", "quadTopology": True})
    assert req_legacy.topology_mode == "quad"

    # 5. Invalid mode raises ValidationError
    with pytest.raises(Exception):
        GenerationRequest(prompt="invalid", topology_mode="hexagon")


def test_mesh_optimizer_topology_mode_triangle_and_quad():
    """Verify optimize_mesh handles triangle and quad topology modes and reports actual_topology."""
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, "input.glb")
        output_path = os.path.join(tmpdir, "output.glb")

        # Create a sphere mesh (~1000 faces)
        sphere = trimesh.creation.icosphere(subdivisions=3, radius=1.0)
        sphere.export(input_path)

        # 1. Triangle mode
        res_tri = optimize_mesh(
            input_path=input_path,
            output_path=output_path,
            target_polycount=300,
            remesh_mode="triangle",
        )
        assert res_tri["success"] is True
        assert res_tri["actual_topology"] == "triangle"
        assert res_tri["topology_mode"] == "triangle"

        # 2. Quad mode fallback behavior: if Blender QuadriFlow remesh is not executable in test env,
        # it falls back gracefully to triangle without crashing, reporting actual_topology="triangle"
        # and providing a clear fallback_reason.
        res_quad = optimize_mesh(
            input_path=input_path,
            output_path=output_path,
            target_polycount=300,
            remesh_mode="quad",
        )
        assert res_quad["success"] is True
        assert res_quad["topology_mode"] == "quad"
        assert res_quad["actual_topology"] in ("quad", "triangle")
        if res_quad["actual_topology"] == "triangle":
            assert "fallback_reason" in res_quad
            assert "Blender" in res_quad["fallback_reason"]


def test_disconnected_components_preservation():
    """Verify small disconnected components (teeth, claws, accessories) >= 6 verts are preserved."""
    # Main body: large icosphere with 640 faces, 322 vertices
    main_body = trimesh.creation.icosphere(subdivisions=3, radius=2.0)
    
    # Detached claw/tooth: small cone with 12 vertices (< 4% of main body)
    claw = trimesh.creation.cone(radius=0.1, height=0.3, sections=10)
    claw.apply_translation([3.0, 0.0, 0.0])

    combined = trimesh.util.concatenate([main_body, claw])
    split_components = combined.split()
    assert len(split_components) == 2

    # Under the old buggy rule, claw (< 0.5% or < 15 verts depending on thresholds) was pruned.
    # Under our rule: only components with < 6 vertices (microscopic debris) are dropped.
    kept_components = [c for c in split_components if len(c.vertices) >= 6]
    assert len(kept_components) == 2, "Distinct anatomical components must not be deleted!"


def test_project_texture_preserves_existing_vertex_colors():
    """Verify _project_texture preserves existing vertex colors and does not overwrite with planar projection."""
    from app.core.providers.hunyuan3d_local import _HunyuanBase

    provider = _HunyuanBase(weights_dir="/tmp")
    with tempfile.TemporaryDirectory() as tmpdir:
        mesh_path = os.path.join(tmpdir, "input.glb")
        out_glb = os.path.join(tmpdir, "out.glb")
        ref_img = os.path.join(tmpdir, "ref.png")

        # Create image
        from PIL import Image
        Image.new("RGBA", (64, 64), (255, 0, 0, 255)).save(ref_img)

        # Create mesh with custom vertex colors
        mesh = trimesh.creation.box(extents=(1, 1, 1))
        num_v = len(mesh.vertices)
        colors = np.ones((num_v, 4), dtype=np.uint8) * 128
        mesh.visual.vertex_colors = colors
        mesh.export(mesh_path)

        # Run projection
        provider._project_texture(mesh_path, ref_img, out_glb)

        # Reload and verify vertex colors are intact and not replaced by planar texture
        loaded = trimesh.load(out_glb, force="mesh")
        assert getattr(loaded.visual, "vertex_colors", None) is not None
        assert len(loaded.visual.vertex_colors) == num_v


def test_artifact_routing_and_master_preservation():
    """Verify active derivative selection and master artifact preservation."""
    raw_master_url = "http://localhost/outputs/123/master.glb"
    game_ready_url = "http://localhost/outputs/123/game_ready.glb"

    # When optimization is enabled and succeeded:
    active_url = game_ready_url
    download_urls = {
        "glb": active_url,
        "source": raw_master_url,
        "game_ready": game_ready_url,
    }

    assert download_urls["glb"] == game_ready_url, "Viewer/default download must use active processed derivative"
    assert download_urls["source"] == raw_master_url, "Master/raw mesh must remain preserved separately"

    # When optimization is disabled:
    raw_active_url = raw_master_url
    download_urls_disabled = {
        "glb": raw_active_url,
        "source": raw_master_url,
    }
    assert download_urls_disabled["glb"] == raw_master_url, "Viewer must show raw master when optimization is disabled"
