"""
Self-check test for Hunyuan3D-2.1 official pipeline integration & parameter propagation.
Run with: PYTHONPATH=backend:backend/runtime python3 backend/runtime/test_hunyuan21_pipeline.py
"""
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

from app.schemas.generation import GenerationRequest
from app.core.providers.hunyuan3d_local import Hunyuan3D21LocalProvider


def test_generation_request_inference_params():
    """Verify inference parameters can be passed in snake_case and camelCase."""
    req_camel = GenerationRequest(
        prompt="A cute porcelain teapot",
        mode="image-to-3d",
        reference_image_url="/path/to/img.png",
        numInferenceSteps=45,
        guidanceScale=6.5,
        octreeResolution=400,
        numChunks=25000,
        faceCount=15000,
        seed=42,
    )
    assert req_camel.num_inference_steps == 45
    assert req_camel.guidance_scale == 6.5
    assert req_camel.octree_resolution == 400
    assert req_camel.num_chunks == 25000
    assert req_camel.face_count == 15000
    assert req_camel.seed == 42


def test_metadata_param_preservation():
    """Verify parameters are preserved in job.processing_metadata dict."""
    req = GenerationRequest(
        prompt="Spaceship",
        mode="image-to-3d",
        reference_image_url="/path/to/ship.png",
        num_inference_steps=50,
        guidance_scale=7.0,
        octree_resolution=512,
        num_chunks=30000,
        face_count=20000,
        seed=999,
    )
    meta = {
        "seed": req.seed,
        "num_inference_steps": req.num_inference_steps,
        "guidance_scale": req.guidance_scale,
        "octree_resolution": req.octree_resolution,
        "num_chunks": req.num_chunks,
        "face_count": req.face_count,
    }
    # Reconstruction in worker tasks.py
    reconstructed = GenerationRequest(
        mode=req.mode,
        prompt=req.prompt,
        reference_image_url=req.reference_image_url,
        seed=meta.get("seed"),
        num_inference_steps=meta.get("num_inference_steps"),
        guidance_scale=meta.get("guidance_scale"),
        octree_resolution=meta.get("octree_resolution"),
        num_chunks=meta.get("num_chunks"),
        face_count=meta.get("face_count"),
    )
    assert reconstructed.seed == 999
    assert reconstructed.num_inference_steps == 50
    assert reconstructed.guidance_scale == 7.0
    assert reconstructed.octree_resolution == 512
    assert reconstructed.num_chunks == 30000
    assert reconstructed.face_count == 20000


def test_hunyuan3d21_image_to_3d_execution():
    """Verify _image_to_3d propagates quality parameters and unrolls nested meshes."""
    provider = Hunyuan3D21LocalProvider.__new__(Hunyuan3D21LocalProvider)
    provider.model_key = "hunyuan3d-2.1"
    provider.device = "cpu"
    provider.low_vram = False
    provider._preprocess_image = lambda img_url: MagicMock()

    mock_mesh = MagicMock()
    mock_mesh.export = MagicMock()

    captured_kwargs = {}

    class DummyShapeModel:
        def __call__(
            self,
            image=None,
            num_inference_steps=50,
            guidance_scale=5.0,
            octree_resolution=384,
            num_chunks=8000,
            generator=None,
            output_type="trimesh",
            **kwargs,
        ):
            nonlocal captured_kwargs
            captured_kwargs = {
                "image": image,
                "num_inference_steps": num_inference_steps,
                "guidance_scale": guidance_scale,
                "octree_resolution": octree_resolution,
                "num_chunks": num_chunks,
                "generator": generator,
                "output_type": output_type,
            }
            return [[mock_mesh]]

    provider._model = DummyShapeModel()

    req = GenerationRequest(
        prompt="cat",
        mode="image-to-3d",
        reference_image_url="/tmp/cat.png",
        num_inference_steps=40,
        guidance_scale=6.0,
        octree_resolution=450,
        num_chunks=22000,
        seed=123,
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        res = provider._image_to_3d(req, tmpdir)
        assert res.endswith("mesh.glb")
        assert captured_kwargs.get("num_inference_steps") == 40
        assert captured_kwargs.get("guidance_scale") == 6.0
        assert captured_kwargs.get("octree_resolution") == 450
        assert captured_kwargs.get("num_chunks") == 22000
        assert captured_kwargs.get("output_type") == "trimesh"
        assert mock_mesh.export.called


def test_hunyuan3d21_official_texture_invocation():
    """Verify _texture invokes official Hunyuan3DPaintPipeline with correct kwargs."""
    provider = Hunyuan3D21LocalProvider.__new__(Hunyuan3D21LocalProvider)
    provider.model_key = "hunyuan3d-2.1"
    provider.device = "cpu"

    mock_tex = MagicMock()
    mock_tex.models = {}
    mock_tex.render = MagicMock()

    captured_tex_kwargs = {}
    def mock_paint_call(**kwargs):
        nonlocal captured_tex_kwargs
        captured_tex_kwargs = kwargs
        # Official pipeline creates .glb next to output_mesh_path when save_glb=True
        out_mesh = kwargs.get("output_mesh_path", "")
        out_glb = Path(out_mesh.replace(".obj", ".glb"))
        out_glb.write_bytes(b"GLB_TEXTURED_DATA")
        return out_mesh

    mock_tex.side_effect = mock_paint_call
    provider._tex = mock_tex

    req = GenerationRequest(
        prompt="shield",
        mode="image-to-3d",
        reference_image_url="/tmp/shield.png",
        generate_texture=True,
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        mesh_input = str(Path(tmpdir) / "mesh.glb")
        Path(mesh_input).write_bytes(b"INPUT_MESH")
        provider._texture(req, mesh_input, tmpdir)

        assert captured_tex_kwargs.get("save_glb") is True
        assert captured_tex_kwargs.get("image_path") == "/tmp/shield.png"
        assert captured_tex_kwargs.get("mesh_path") == mesh_input
        model_glb = Path(tmpdir) / "model.glb"
        assert model_glb.is_file()
        assert model_glb.read_bytes() == b"GLB_TEXTURED_DATA"


def test_hunyuan3d21_text_to_3d_routing():
    """Verify _text_to_3d routes to _image_to_3d when image provided, else raises informative error."""
    provider = Hunyuan3D21LocalProvider.__new__(Hunyuan3D21LocalProvider)
    provider.model_key = "hunyuan3d-2.1"
    provider._image_to_3d = MagicMock(return_value="/tmp/out/mesh.glb")

    class DummyImageOnlyModel:
        def __call__(self, image=None, num_inference_steps=50, **kwargs):
            return []

    provider._model = DummyImageOnlyModel()

    # If reference_image_url is given: routes to _image_to_3d
    req_with_img = GenerationRequest(prompt="sword", reference_image_url="/tmp/sword.png")
    res = provider._text_to_3d(req_with_img, "/tmp/out")
    assert res == "/tmp/out/mesh.glb"
    assert provider._image_to_3d.called

    # If pure text prompt without image: raises ValueError on official image-only pipeline
    req_no_img = GenerationRequest(prompt="sword without image", reference_image_url=None)
    try:
        provider._text_to_3d(req_no_img, "/tmp/out")
        assert False, "Expected ValueError for image-only Hunyuan3D-2.1"
    except ValueError as exc:
        assert "requiring an input reference image" in str(exc)


if __name__ == "__main__":
    test_generation_request_inference_params()
    test_metadata_param_preservation()
    test_hunyuan3d21_image_to_3d_execution()
    test_hunyuan3d21_official_texture_invocation()
    test_hunyuan3d21_text_to_3d_routing()
    print("All Hunyuan3D-2.1 pipeline and parameter checks passed successfully!")
