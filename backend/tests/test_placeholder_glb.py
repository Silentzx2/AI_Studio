"""Regression guard for the "invalid GLB" bug.

The simulated/fallback provider paths used to write raw bytes named ``.glb``
(e.g. a literal ``..._GENERATED_GLB`` string) that no GLTFLoader could parse.
Every such writer now goes through ``write_placeholder_mesh``; this test proves
the output is a parseable GLB.
"""

from pathlib import Path


def test_placeholder_mesh_is_valid_glb(tmp_path):
    from app.core.mesh_processor import write_placeholder_mesh

    glb_path = tmp_path / "model.glb"
    stats = write_placeholder_mesh(glb_path, seed=42)

    data = glb_path.read_bytes()
    # GLB v2 container: magic "glTF", version, total length
    assert data[:4] == b"glTF", f"missing GLB magic: {data[:4]!r}"
    assert int.from_bytes(data[4:8], "little") == 2
    assert int.from_bytes(data[8:12], "little") == len(data)
    assert stats["polygon_count"] > 0
    assert stats["vertex_count"] > 0
    assert stats["file_size"] == len(data)

    # Trimesh must load it back as a mesh (the cheapest proxy for the viewer).
    import trimesh

    mesh = trimesh.load(str(glb_path), force="mesh")
    assert len(mesh.faces) == stats["polygon_count"]
    assert len(mesh.vertices) == stats["vertex_count"]

    # Different seeds produce different (still valid) outputs.
    other = write_placeholder_mesh(tmp_path / "other.glb", seed=7)
    assert (tmp_path / "other.glb").read_bytes() != data
    assert other["polygon_count"] == stats["polygon_count"]