"""Assert-based runnable check for AI Studio backend and ComfyUI integration.

Complies with AGENTS.md: single runnable test, assert-based, zero frameworks/fixtures.
Run with: python backend/tests/test_backend_e2e.py
"""
import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.config import get_settings
from app.database import engine, AsyncSessionLocal, Base
from app.models import GenerationJob
from app.core import get_comfyui_client, get_workflow_registry
from app.api.v1.models import AVAILABLE_MODELS


async def test_config():
    """Verify application configuration."""
    settings = get_settings()
    assert settings.api_v1_prefix == "/api/v1", f"Expected /api/v1, got {settings.api_v1_prefix}"
    assert "8188" in settings.comfyui_url, f"Expected port 8188 in comfyui_url: {settings.comfyui_url}"
    print("[PASS] Configuration check")


async def test_database():
    """Verify PostgreSQL connectivity and schema."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    async with AsyncSessionLocal() as session:
        job = GenerationJob(
            id=job_id,
            status="queued",
            mode="text-to-3d",
            prompt="A test cube",
            provider="comfyui",
            progress=0,
            stage="queued",
            created_at=now,
            updated_at=now,
        )
        session.add(job)
        await session.commit()

    async with AsyncSessionLocal() as session:
        fetched = await session.get(GenerationJob, job_id)
        assert fetched is not None, f"Job {job_id} not found in DB"
        assert fetched.prompt == "A test cube", f"Unexpected prompt: {fetched.prompt}"
        assert fetched.status == "queued", f"Unexpected status: {fetched.status}"

        # Clean up test row
        await session.delete(fetched)
        await session.commit()

    print("[PASS] Database CRUD check")


async def test_comfyui_connection():
    """Verify ComfyUI engine connectivity and that 3D-Pack nodes are registered."""
    client = get_comfyui_client()
    health = await client.health_check()
    assert health.get("status") == "ok", f"ComfyUI is not healthy: {health}"
    stats = health.get("data", {})
    assert "system" in stats, "Expected 'system' in ComfyUI stats"

    # Verify real 3D-Pack node classes exist on the running engine.
    object_info = await client.get_object_info()
    required_nodes = [
        "[Comfy3D] Load TripoSR Model",
        "[Comfy3D] TripoSR",
        "[Comfy3D] Save 3D Mesh",
        "[Comfy3D] Load 3D Mesh",
        "[Comfy3D] Decimate Mesh",
    ]
    missing = [n for n in required_nodes if n not in object_info]
    assert not missing, f"Missing 3D-Pack nodes on running ComfyUI: {missing}"
    print(f"[PASS] ComfyUI connection + 3D-Pack node registration "
          f"(version: {stats['system'].get('comfyui_version')}, "
          f"{len(object_info)} nodes registered)")
    await client.close()


async def test_workflow_registry():
    """Verify the workflow/version persistence model works end-to-end."""
    from app.core.comfy.workflow_registry import seed_default_workflows
    registry = get_workflow_registry()

    # Ensure verified default workflows exist for every supported model.
    # seed_default_workflows is idempotent — it only creates rows that are missing.
    await seed_default_workflows()

    for model_id in ("tripo_sr", "trellis", "hunyuan3d"):
        active = await registry.get_active_version(model_id)
        assert active is not None, f"No active workflow version registered for {model_id}"

    # Save a new version for an isolated test model and confirm versioning works.
    wf, version = await registry.save_workflow(
        model_id="test_model",
        prompt={"1": {"class_type": "LoadImage", "inputs": {"image": "test.png"}}},
        name="test-save",
        description="e2e test version",
        source="test",
    )
    # Append another version
    wf2, version2 = await registry.save_workflow(
        model_id="test_model",
        prompt={"1": {"class_type": "LoadImage", "inputs": {"image": "test2.png"}}},
        name="test-save-2",
        description="e2e test version 2",
        source="test",
    )
    versions = await registry.list_versions(wf.id)
    assert len(versions) >= 2, f"Expected >= 2 versions after save, got {len(versions)}"
    assert versions[-1].version == version2.version
    assert versions[-1].source == "test"
    print(f"[PASS] Workflow registry: {len(versions)} versions persisted for test_model")


def test_workflow_resolution():
    """Verify every model in the registry maps to a real, non-empty workflow dict."""
    from app.core.comfy.workflows import build_workflow_for_job
    for model in AVAILABLE_MODELS:
        mid = model["id"]
        if mid == "texture_pbr":
            continue
        wf = build_workflow_for_job(mode="image-to-3d", provider=mid, image_filename="test.png")
        assert isinstance(wf, dict) and len(wf) > 0, f"Empty workflow for model {mid}"
        assert all(isinstance(k, str) for k in wf.keys()), f"Non-string node key for {mid}"
        for nid, node in wf.items():
            assert "class_type" in node, f"Node {nid} for {mid} missing class_type"
            assert "inputs" in node, f"Node {nid} for {mid} missing inputs"
    print(f"[PASS] Workflow resolution for all {len(AVAILABLE_MODELS)} models")


def test_models_registry():
    """Verify model definitions."""
    assert len(AVAILABLE_MODELS) >= 5, f"Expected >= 5 models, got {len(AVAILABLE_MODELS)}"
    model_ids = [m["id"] for m in AVAILABLE_MODELS]
    for required in ["hunyuan3d", "trellis", "tripo_sr"]:
        assert required in model_ids, f"Required model {required} missing"
    print(f"[PASS] Model registry check ({len(AVAILABLE_MODELS)} models verified)")


async def test_no_silent_fallback():
    """Verify an unregistered model/provider returns an explicit error, not a fallback."""
    from app.core.comfy.workflows import build_workflow_for_job
    try:
        build_workflow_for_job(mode="image-to-3d", provider="nonexistent_provider", image_filename="test.png")
        raise AssertionError("Expected ValueError for unknown provider, but workflow was built")
    except ValueError as exc:
        assert "Unsupported" in str(exc), f"Unexpected error message: {exc}"
    print("[PASS] No silent model fallback — unknown provider raises explicit error")


async def main():
    print("Running AI Studio Backend E2E Validation...")
    await test_config()
    await test_database()
    await test_comfyui_connection()
    await test_workflow_registry()
    test_workflow_resolution()
    test_models_registry()
    await test_no_silent_fallback()
    print("All backend checks PASSED successfully!")


if __name__ == "__main__":
    asyncio.run(main())