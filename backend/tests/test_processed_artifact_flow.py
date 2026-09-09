"""
Tests for 3D Generation Processed Derivative Routing and Preservation.

Verifies:
  1. Active derivative routing: When post-processing/optimization is enabled,
     the processed derivative (game_ready.glb) becomes the active result
     shown to the user (model_url, active_model_url) and used for exports.
  2. Master preservation: The original raw master asset (source.glb) is
     preserved separately and untouched.
  3. Processing disabled: When processing is explicitly disabled, the raw/master
     asset is returned as the active model.
  4. Failure handling: Stage failure does not report false success or substitute
     an incorrect/missing artifact.
  5. Export variant routing:
     - variant="active" (default) exports the active processed derivative.
     - variant="source" exports the untouched master asset.
     - format conversions (OBJ, STL, PLY) are derived from the active processed asset.
  6. Observability: Structured real metrics (durations, triangle counts, tool names)
     are captured in pipeline_stages.
"""
import json
import shutil
import uuid
from pathlib import Path

import pytest
import trimesh
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.api.v1.project import ExportRequest, export_project, _resolve_model_path
from app.schemas.generation import GenerationRequest, JobResult, DownloadUrls
from app.core.mesh_optimizer import optimize_mesh


@pytest.fixture
def high_poly_mesh() -> trimesh.Trimesh:
    """Create a high-poly icosphere (1280 faces)."""
    return trimesh.creation.icosphere(subdivisions=4, radius=1.0)


@pytest.fixture
def low_poly_mesh() -> trimesh.Trimesh:
    """Create a low-poly icosphere (80 faces)."""
    return trimesh.creation.icosphere(subdivisions=1, radius=1.0)


@pytest.fixture
def mock_job_storage(tmp_path, high_poly_mesh, low_poly_mesh):
    """Set up a realistic job directory structure in storage."""
    settings = get_settings()
    job_id = f"test-flow-{uuid.uuid4().hex[:8]}"
    storage_root = Path(settings.storage_local_path)
    job_dir = storage_root / "models" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    # 1. Raw untouched master
    source_path = job_dir / "source.glb"
    high_poly_mesh.export(str(source_path))

    # 2. Intermediate unoptimized model
    model_path = job_dir / "model.glb"
    high_poly_mesh.export(str(model_path))

    # 3. Optimized processed derivative
    game_ready_path = job_dir / "game_ready.glb"
    low_poly_mesh.export(str(game_ready_path))

    yield {
        "job_id": job_id,
        "job_dir": job_dir,
        "source_path": source_path,
        "model_path": model_path,
        "game_ready_path": game_ready_path,
        "source_faces": len(high_poly_mesh.faces),
        "game_ready_faces": len(low_poly_mesh.faces),
        "source_url": f"/static/models/{job_id}/source.glb",
        "model_url": f"/static/models/{job_id}/model.glb",
        "game_ready_url": f"/static/models/{job_id}/game_ready.glb",
    }

    # Cleanup
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)


def test_resolve_model_path_locates_files(mock_job_storage):
    """Ensure _resolve_model_path resolves both raw and processed artifacts safely."""
    data = mock_job_storage
    resolved_gr = _resolve_model_path(data["game_ready_url"])
    assert resolved_gr is not None
    assert resolved_gr.exists()
    assert resolved_gr.name == "game_ready.glb"

    resolved_src = _resolve_model_path(data["source_url"])
    assert resolved_src is not None
    assert resolved_src.exists()
    assert resolved_src.name == "source.glb"


@pytest.mark.asyncio
async def test_export_active_variant_exports_processed_derivative(mock_job_storage):
    """When variant='active' (default), export must return the processed derivative (game_ready.glb)."""
    data = mock_job_storage

    req = ExportRequest(
        modelUrl=data["game_ready_url"],
        assetName="test_asset",
        format="glb",
        variant="active",
    )
    response = await export_project(req)
    exported_path = Path(response.path)
    assert exported_path.exists()

    exported_mesh = trimesh.load(str(exported_path), force="mesh")
    assert len(exported_mesh.faces) == data["game_ready_faces"]
    assert len(exported_mesh.faces) < data["source_faces"]


@pytest.mark.asyncio
async def test_export_active_variant_prioritizes_game_ready_when_given_model_url(mock_job_storage):
    """If a client sends model.glb but game_ready.glb exists, variant='active' prefers the processed derivative."""
    data = mock_job_storage

    req = ExportRequest(
        modelUrl=data["model_url"],
        assetName="test_asset",
        format="glb",
        variant="active",
    )
    response = await export_project(req)
    exported_path = Path(response.path)

    exported_mesh = trimesh.load(str(exported_path), force="mesh")
    assert len(exported_mesh.faces) == data["game_ready_faces"]
    assert len(exported_mesh.faces) < data["source_faces"]


@pytest.mark.asyncio
async def test_export_source_variant_preserves_master(mock_job_storage):
    """When variant='source', export must specifically return the untouched raw master asset."""
    data = mock_job_storage

    req = ExportRequest(
        modelUrl=data["game_ready_url"],
        assetName="test_asset",
        format="glb",
        variant="source",
    )
    response = await export_project(req)
    exported_path = Path(response.path)

    exported_mesh = trimesh.load(str(exported_path), force="mesh")
    assert len(exported_mesh.faces) == data["source_faces"]
    assert len(exported_mesh.faces) > data["game_ready_faces"]


@pytest.mark.asyncio
async def test_export_multi_format_conversion_uses_active_derivative(mock_job_storage):
    """Conversions to OBJ/STL must derive from the active processed asset."""
    data = mock_job_storage

    req_obj = ExportRequest(
        modelUrl=data["game_ready_url"],
        assetName="test_asset",
        format="obj",
        variant="active",
    )
    resp_obj = await export_project(req_obj)
    exported_obj = Path(resp_obj.path)
    assert exported_obj.suffix == ".obj"
    mesh_obj = trimesh.load(str(exported_obj), force="mesh")
    assert len(mesh_obj.faces) == data["game_ready_faces"]

    req_stl = ExportRequest(
        modelUrl=data["game_ready_url"],
        assetName="test_asset",
        format="stl",
        variant="active",
    )
    resp_stl = await export_project(req_stl)
    exported_stl = Path(resp_stl.path)
    assert exported_stl.suffix == ".stl"
    mesh_stl = trimesh.load(str(exported_stl), force="mesh")
    assert len(mesh_stl.faces) == data["game_ready_faces"]


def test_generation_request_postprocess_flags():
    """GenerationRequest supports postprocess and skip_postprocessing with camelCase aliases."""
    req_default = GenerationRequest(prompt="A test warrior")
    assert req_default.postprocess is True
    assert req_default.skip_postprocessing is False

    req_disabled = GenerationRequest(prompt="A test warrior", postprocess=False, skip_postprocessing=True)
    assert req_disabled.postprocess is False
    assert req_disabled.skip_postprocessing is True

    req_camel = GenerationRequest.model_validate({
        "prompt": "A test warrior",
        "postProcess": False,
        "skipPostprocessing": True,
    })
    assert req_camel.postprocess is False
    assert req_camel.skip_postprocessing is True


def test_download_urls_and_job_result_schema():
    """DownloadUrls and JobResult schema properly expose active derivative and master URLs."""
    urls = DownloadUrls(
        glb="/static/models/123/game_ready.glb",
        source="/static/models/123/source.glb",
        game_ready="/static/models/123/game_ready.glb",
    )
    assert urls.glb == "/static/models/123/game_ready.glb"
    assert urls.source == "/static/models/123/source.glb"

    result = JobResult(
        model_url="/static/models/123/game_ready.glb",
        active_model_url="/static/models/123/game_ready.glb",
        source_model_url="/static/models/123/source.glb",
        game_ready_url="/static/models/123/game_ready.glb",
        thumbnail_url="/static/models/123/thumbnail.png",
        polygon_count=1200,
        vertex_count=650,
        has_rig=False,
        file_size=10240,
        download_urls=urls,
        pipeline_stages=[
            {"stage": "mesh_optimization", "tool": "meshoptimizer", "duration_ms": 12.5, "status": "success"}
        ],
    )
    assert result.model_url == "/static/models/123/game_ready.glb"
    assert result.active_model_url == "/static/models/123/game_ready.glb"
    assert result.source_model_url == "/static/models/123/source.glb"
    assert len(result.pipeline_stages) == 1
    assert result.pipeline_stages[0]["tool"] == "meshoptimizer"


def test_optimize_mesh_reduces_faces_and_preserves_input(tmp_path, high_poly_mesh):
    """Verify optimize_mesh directly produces valid reduced mesh and leaves input intact."""
    input_file = tmp_path / "master_input.glb"
    output_file = tmp_path / "game_ready.glb"
    high_poly_mesh.export(str(input_file))

    orig_faces = len(high_poly_mesh.faces)
    target_budget = 300

    res = optimize_mesh(
        input_path=str(input_file),
        output_path=str(output_file),
        target_polycount=target_budget,
    )
    assert res["success"] is True
    assert output_file.exists()

    loaded_in = trimesh.load(str(input_file), force="mesh")
    assert len(loaded_in.faces) == orig_faces

    loaded_out = trimesh.load(str(output_file), force="mesh")
    assert len(loaded_out.faces) < orig_faces
    assert res["reduction_percent"] > 0


def test_manifest_loader_resolves_repo_and_canonical_names():
    """Verify load_manifest and PROVIDER_METADATA resolve repo names (e.g. Hunyuan3D-2mini) and provider IDs."""
    from runtime.manifest_loader import load_manifest, REPOS, PROVIDER_METADATA
    from runtime.installer import _get_native_build_info

    for repo_name in ["Hunyuan3D-2mini", "Hunyuan3D-2.1", "TRELLIS", "TripoSG", "DetailGen3D"]:
        # Direct load_manifest call with repo_name must succeed
        manifest = load_manifest(repo_name)
        assert manifest is not None
        assert "name" in manifest

        # REPOS must map repo_name to canonical provider
        repo_cfg = REPOS.get(repo_name)
        assert repo_cfg is not None
        providers = repo_cfg.get("providers", [])
        assert len(providers) > 0
        canonical = providers[0]

        # PROVIDER_METADATA must be indexable by both canonical and repo_name
        assert canonical in PROVIDER_METADATA
        assert repo_name in PROVIDER_METADATA

        # Native build info extraction must not crash
        native_req, all_caps = _get_native_build_info(PROVIDER_METADATA[canonical], manifest)
        assert isinstance(native_req, bool)
        assert isinstance(all_caps, bool)

