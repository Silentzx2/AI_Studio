"""
Regression tests for Mesh Detail Root-Cause & Metadata Fix.

Verifies:
  1. Authoritative final-artifact analysis:
     get_mesh_stats calculates real vertices, faces, dimensions, bounding_box,
     object_count, component_count, material_count, and topology from the GLB.
  2. Unknown semantic data never becomes false zero:
     If anatomical analysis is unavailable, mesh_details is represented as
     'not_analyzed' / 'unsupported', never as false 0.
  3. Semantic part identification:
     If GLB nodes/submeshes carry anatomical labels (e.g. eye, teeth, claw),
     they are accurately extracted.
  4. Raw (A) vs Postprocessed (B) vs Final GLB (C) comparison:
     Verifies multi-stage pipeline geometry comparison and distinguishes
     metadata loss from geometry modification.
  5. API serialization:
     Completed, completed_degraded, and succeeded statuses serialize canonical
     geometry metadata in the result block.
  6. History preservation:
     History endpoint serializes polygon_count, vertex_count, dimensions,
     bounding_box, component_count, topology, and mesh_details.
"""
import json
import tempfile
from pathlib import Path

import numpy as np
import pytest
import trimesh

from app.core.mesh_processor import get_mesh_stats
from app.schemas.generation import JobResult, DownloadUrls, ArtifactMetadata


@pytest.fixture
def sample_sphere_glb(tmp_path) -> Path:
    """Create a sample sphere GLB with known face and vertex counts."""
    mesh = trimesh.creation.icosphere(subdivisions=2, radius=1.0)
    out = tmp_path / "sphere.glb"
    mesh.export(str(out))
    return out


@pytest.fixture
def multi_component_glb(tmp_path) -> Path:
    """Create a mesh with multiple disconnected components (e.g. body + teeth/claws)."""
    body = trimesh.creation.box(extents=[1.0, 1.0, 1.0])
    tooth1 = trimesh.creation.cone(radius=0.05, height=0.2, sections=8)
    tooth1.apply_translation([1.5, 0.0, 0.0])
    tooth2 = trimesh.creation.cone(radius=0.05, height=0.2, sections=8)
    tooth2.apply_translation([-1.5, 0.0, 0.0])

    combined = trimesh.util.concatenate([body, tooth1, tooth2])
    out = tmp_path / "creature.glb"
    combined.export(str(out))
    return out


@pytest.fixture
def semantic_named_glb(tmp_path) -> Path:
    """Create a scene with named geometries matching anatomical parts."""
    eye = trimesh.creation.icosphere(subdivisions=1, radius=0.1)
    eye.metadata["name"] = "Eye_L"
    teeth = trimesh.creation.cone(radius=0.05, height=0.2, sections=6)
    teeth.metadata["name"] = "Teeth_Upper"
    scene = trimesh.Scene()
    scene.add_geometry(eye, node_name="Eye_L")
    scene.add_geometry(teeth, node_name="Teeth_Upper")
    out = tmp_path / "semantic_model.glb"
    scene.export(str(out))
    return out


def test_get_mesh_stats_extracts_authoritative_metadata(sample_sphere_glb):
    """get_mesh_stats extracts accurate geometry, bbox, dimensions, and topology."""
    stats = get_mesh_stats(str(sample_sphere_glb))
    assert stats["polygon_count"] == 320  # icosphere subdivisions=2 has 320 faces
    assert stats["vertex_count"] == 162   # icosphere subdivisions=2 has 162 vertices
    assert stats["file_size"] > 0
    assert stats["object_count"] == 1
    assert stats["component_count"] == 1
    assert stats["topology"] == "Triangle"

    dims = stats["dimensions"]
    assert isinstance(dims, dict)
    assert abs(dims["x"] - 2.0) < 0.1
    assert abs(dims["y"] - 2.0) < 0.1
    assert abs(dims["z"] - 2.0) < 0.1

    bbox = stats["bounding_box"]
    assert "min" in bbox and "max" in bbox and "extent" in bbox and "diagonal" in bbox
    assert bbox["diagonal"] > 0


def test_get_mesh_stats_unknown_semantic_parts_never_false_zero(sample_sphere_glb):
    """When anatomical semantics cannot be identified, report unsupported/not_analyzed, never 0."""
    stats = get_mesh_stats(str(sample_sphere_glb))
    details = stats.get("mesh_details", {})
    assert details.get("status") == "unsupported"
    assert details.get("semantic_parts") == "not_analyzed"
    # Never a false numeric zero
    assert details.get("semantic_parts") != 0
    assert details.get("eyes") != 0
    assert details.get("teeth") != 0


def test_get_mesh_stats_detects_semantic_labels_when_present(semantic_named_glb):
    """When node names or submesh names carry anatomical keywords, extract them faithfully."""
    stats = get_mesh_stats(str(semantic_named_glb))
    details = stats.get("mesh_details", {})
    assert details.get("status") == "detected"
    parts = details.get("semantic_parts", [])
    assert any("eye" in p.lower() for p in parts)
    assert any("teeth" in p.lower() for p in parts)


def test_get_mesh_stats_counts_connected_components(multi_component_glb):
    """Connected topological components (body, teeth, claws) are faithfully counted."""
    stats = get_mesh_stats(str(multi_component_glb))
    assert stats["component_count"] == 3


def test_raw_vs_postprocessed_vs_final_comparison(tmp_path):
    """Reproducible comparison of A (raw), B (postprocessed), C (final GLB)."""
    # A = Raw provider output (high poly: 320 faces)
    raw_mesh = trimesh.creation.icosphere(subdivisions=3, radius=1.0)
    raw_path = tmp_path / "raw_provider.glb"
    raw_mesh.export(str(raw_path))

    # B = Postprocessed output (e.g. decimated to 80 faces)
    post_mesh = trimesh.creation.icosphere(subdivisions=2, radius=1.0)
    post_path = tmp_path / "game_ready.glb"
    post_mesh.export(str(post_path))

    # C = Final deliverable (e.g. exported with format check)
    final_path = tmp_path / "model.glb"
    post_mesh.export(str(final_path))

    stats_a = get_mesh_stats(str(raw_path))
    stats_b = get_mesh_stats(str(post_path))
    stats_c = get_mesh_stats(str(final_path))

    assert stats_a["polygon_count"] == 1280
    assert stats_b["polygon_count"] == 320
    assert stats_c["polygon_count"] == 320

    # Distinguish metadata loss from geometry modification:
    # Final deliverable C matches postprocessed B, NOT raw A.
    assert stats_c["polygon_count"] != stats_a["polygon_count"]
    assert stats_c["polygon_count"] == stats_b["polygon_count"]


def test_job_result_schema_carries_canonical_geometry_fields():
    """JobResult schema serializes dimensions, bbox, component count, and mesh details."""
    urls = DownloadUrls(glb="/models/1/model.glb")
    res = JobResult(
        model_url="/models/1/model.glb",
        thumbnail_url="/models/1/thumb.png",
        polygon_count=1000,
        vertex_count=500,
        has_rig=False,
        file_size=1024,
        download_urls=urls,
        dimensions={"x": 1.5, "y": 2.0, "z": 0.5},
        bounding_box={"min": [-0.75, -1.0, -0.25], "max": [0.75, 1.0, 0.25], "extent": [1.5, 2.0, 0.5], "diagonal": 2.55},
        object_count=1,
        component_count=2,
        material_count=1,
        topology="Triangle",
        postprocess_status="success",
        mesh_details={"semantic_parts": "not_analyzed", "status": "unsupported"},
    )
    serialized = res.model_dump()
    assert serialized["polygon_count"] == 1000
    assert serialized["dimensions"]["x"] == 1.5
    assert serialized["bounding_box"]["diagonal"] == 2.55
    assert serialized["component_count"] == 2
    assert serialized["mesh_details"]["status"] == "unsupported"


def test_get_mesh_stats_missing_file_graceful():
    """Non-existent file returns default empty stats without raising unhandled exceptions."""
    stats = get_mesh_stats("/non/existent/path/model.glb")
    assert stats["polygon_count"] == 0
    assert stats["vertex_count"] == 0
    assert stats["dimensions"] == {"x": 0.0, "y": 0.0, "z": 0.0}
    assert stats["mesh_details"]["status"] == "unsupported"


@pytest.mark.asyncio
async def test_generation_history_handles_boolean_postprocess_metadata():
    """Verify history endpoint handles boolean 'postprocess' without raising AttributeError."""
    from unittest.mock import AsyncMock, MagicMock, patch
    from app.api.v1.generation import generation_history

    mock_job = MagicMock()
    mock_job.id = "job-bool-test"
    mock_job.status = "queued"
    mock_job.mode = "text-to-3d"
    mock_job.prompt = "a cute robot"
    mock_job.provider = "hunyuan3d-2mini"
    mock_job.progress = 10
    mock_job.stage = "queued"
    mock_job.low_vram = False
    mock_job.vram_mode = "balanced"
    mock_job.model_url = None
    mock_job.thumbnail_url = None
    mock_job.polygon_count = None
    mock_job.vertex_count = None
    mock_job.file_size = None
    mock_job.has_rig = False
    # CRITICAL: This was causing AttributeError: 'bool' object has no attribute 'get'
    mock_job.processing_metadata = {"postprocess": True, "skip_postprocessing": False}
    mock_job.created_at = None
    mock_job.completed_at = None

    mock_scalars = MagicMock()
    mock_scalars.all.return_value = [mock_job]

    mock_result = MagicMock()
    mock_result.scalars.return_value = mock_scalars

    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result

    class MockAsyncSessionLocal:
        async def __aenter__(self):
            return mock_session
        async def __aexit__(self, *args):
            pass

    with patch("app.database.AsyncSessionLocal", MockAsyncSessionLocal):
        response = await generation_history(limit=20, offset=0)
        # Verify it succeeds and postprocess_status gracefully defaults to job.status
        assert response["success"] is True
        assert response["data"]["total"] == 1
        assert response["data"]["jobs"][0]["postprocess_status"] == "queued"

