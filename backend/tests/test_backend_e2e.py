"""Assert-based runnable check for AI Studio backend and ComfyUI integration.

Complies with AGENTS.md: single runnable test, assert-based, zero frameworks/fixtures.
Run with: python backend/tests/test_backend_e2e.py
"""

import asyncio
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
from app.core import get_comfyui_client, get_workflow_manager
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
    """Verify ComfyUI engine connectivity."""
    client = get_comfyui_client()
    health = await client.health_check()
    assert health.get("status") == "ok", f"ComfyUI is not healthy: {health}"
    stats = health.get("data", {})
    assert "system" in stats, "Expected 'system' in ComfyUI stats"
    print(f"[PASS] ComfyUI connection check (ComfyUI version: {stats['system'].get('comfyui_version')})")
    await client.close()


def test_workflow_manager():
    """Verify workflow templates load correctly."""
    wm = get_workflow_manager()
    for name in ["text_to_3d", "image_to_3d", "texture", "remesh"]:
        wf = wm.prepare_workflow(name, prompt="a test asset")
        assert isinstance(wf, dict), f"Workflow {name} did not return dict"
        assert len(wf) > 0, f"Workflow {name} is empty"
    print("[PASS] Workflow manager check")


def test_models_registry():
    """Verify model definitions."""
    assert len(AVAILABLE_MODELS) >= 5, f"Expected >= 5 models, got {len(AVAILABLE_MODELS)}"
    model_ids = [m["id"] for m in AVAILABLE_MODELS]
    for required in ["hunyuan3d", "trellis", "tripo_sr"]:
        assert required in model_ids, f"Required model {required} missing"
    print(f"[PASS] Model registry check ({len(AVAILABLE_MODELS)} models verified)")


async def main():
    print("Running AI Studio Backend E2E Validation...")
    await test_config()
    await test_database()
    await test_comfyui_connection()
    test_workflow_manager()
    test_models_registry()
    print("All backend checks PASSED successfully!")


if __name__ == "__main__":
    asyncio.run(main())
