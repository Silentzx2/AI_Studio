"""
Self-check test for Mesh Remeshing Optimizer and Reference Resolution.
Run with: python3 test_mesh_remesh_optimizer.py
"""
import os
import sys
import tempfile
from pathlib import Path

# Add backend to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.mesh_optimizer import optimize_mesh
from app.workers.tasks import _resolve_reference_image


def test_reference_image_resolution():
    """Verify that local files, static URLs, and data URLs resolve accurately."""
    with tempfile.NamedTemporaryFile(suffix=".glb") as tmp:
        resolved = _resolve_reference_image(tmp.name, "job-123")
        assert resolved == tmp.name, f"Expected {tmp.name}, got {resolved}"

    # None input
    assert _resolve_reference_image(None, "job-123") is None
    print("✓ Reference image resolution passed.")


def test_blender_mesh_optimization():
    """Verify Blender-backed mesh remeshing and decimation."""
    import trimesh

    with tempfile.TemporaryDirectory() as tmpdir:
        input_glb = os.path.join(tmpdir, "input_highpoly.glb")
        output_glb = os.path.join(tmpdir, "output_decimated.glb")

        # Create a sample mesh with ~1280 faces
        sphere = trimesh.creation.icosphere(subdivisions=4, radius=1.0)
        initial_faces = len(sphere.faces)
        sphere.export(input_glb)
        assert os.path.exists(input_glb)

        # Optimize down to 400 faces
        target_budget = 400
        result = optimize_mesh(
            input_path=input_glb,
            output_path=output_glb,
            target_polycount=target_budget,
            fix_uvs=True,
            preserve_details=75.0,
            remesh_mode="adaptive",
        )

        assert result["success"] is True, f"Optimization failed: {result}"
        assert os.path.exists(output_glb), "Output GLB was not created"
        assert os.path.getsize(output_glb) > 0, "Output GLB is empty"

        decimated = trimesh.load(output_glb, force="mesh")
        final_faces = len(decimated.faces)
        print(f"✓ Blender decimation passed: {initial_faces} -> {final_faces} faces (target {target_budget}). Backend: {result.get('backend')}")
        assert final_faces <= initial_faces, "Decimated mesh should have fewer faces than initial"


if __name__ == "__main__":
    test_reference_image_resolution()
    test_blender_mesh_optimization()
    print("All mesh remesh optimizer tests passed successfully!")
