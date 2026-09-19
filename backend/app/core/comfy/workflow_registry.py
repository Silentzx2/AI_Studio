"""Persistent ComfyUI workflow/version registry.

Product requirement:
- User edits a workflow in native ComfyUI, saves it.
- The newest save becomes the active default for that model.
- Old versions remain reproducible.
- Every AI Studio generation records the exact workflow version it used.

This module owns only identity mapping and persistence. ComfyUI owns the
workflow content itself; we store an immutable snapshot of the prompt JSON.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import ComfyWorkflow, ComfyWorkflowVersion

logger = logging.getLogger(__name__)


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class WorkflowRegistry:
    """Manages named, versioned ComfyUI workflows per model."""

    def __init__(self, session: Optional[AsyncSession] = None):
        self._own_session = session is None
        self._session = session

    async def _get_session(self) -> AsyncSession:
        if self._session is not None:
            return self._session
        return AsyncSessionLocal()

    async def _close_if_owned(self, session: AsyncSession):
        if self._own_session:
            await session.close()

    async def get_active_workflow(self, model_id: str) -> Optional[ComfyWorkflow]:
        async with await self._get_session() as session:
            result = await session.execute(
                select(ComfyWorkflow).where(
                    ComfyWorkflow.model_id == model_id,
                    ComfyWorkflow.is_active.is_(True),
                )
            )
            return result.scalar_one_or_none()

    async def get_active_version(self, model_id: str) -> Optional[ComfyWorkflowVersion]:
        wf = await self.get_active_workflow(model_id)
        if wf is None:
            return None
        async with await self._get_session() as session:
            result = await session.execute(
                select(ComfyWorkflowVersion)
                .where(ComfyWorkflowVersion.workflow_id == wf.id)
                .order_by(desc(ComfyWorkflowVersion.version))
                .limit(1)
            )
            return result.scalar_one_or_none()

    async def list_versions(self, workflow_id: str) -> list[ComfyWorkflowVersion]:
        async with await self._get_session() as session:
            result = await session.execute(
                select(ComfyWorkflowVersion)
                .where(ComfyWorkflowVersion.workflow_id == workflow_id)
                .order_by(ComfyWorkflowVersion.version)
            )
            return list(result.scalars().all())

    async def list_workflows(self, model_id: Optional[str] = None) -> list[ComfyWorkflow]:
        async with await self._get_session() as session:
            q = select(ComfyWorkflow).order_by(ComfyWorkflow.model_id, ComfyWorkflow.name)
            if model_id:
                q = q.where(ComfyWorkflow.model_id == model_id)
            return list((await session.execute(q)).scalars().all())

    async def save_workflow(
        self,
        model_id: str,
        prompt: dict[str, Any],
        name: Optional[str] = None,
        description: Optional[str] = None,
        comfyui_prompt_id: Optional[str] = None,
        source: str = "native",
        set_active: bool = True,
    ) -> tuple[ComfyWorkflow, ComfyWorkflowVersion]:
        """Persist a new workflow version. Never mutates historical versions."""
        async with await self._get_session() as session:
            # Query inside THIS session so the returned object stays persistent
            # for the rest of the transaction. Do not call get_active_workflow
            # here — it opens its own session and returns a detached instance.
            wf = (
                await session.execute(
                    select(ComfyWorkflow)
                    .where(
                        ComfyWorkflow.model_id == model_id,
                        ComfyWorkflow.is_active.is_(True),
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()

            if wf is None:
                wf = ComfyWorkflow(
                    id=str(uuid.uuid4()),
                    model_id=model_id,
                    name=name or f"{model_id} workflow",
                    description=description,
                    is_active=True,
                    created_at=_now(),
                    updated_at=_now(),
                )
                session.add(wf)
                await session.flush()
            else:
                if name:
                    wf.name = name
                if description is not None:
                    wf.description = description

            last_version = (
                await session.execute(
                    select(ComfyWorkflowVersion)
                    .where(ComfyWorkflowVersion.workflow_id == wf.id)
                    .order_by(desc(ComfyWorkflowVersion.version))
                    .limit(1)
                )
            ).scalar_one_or_none()
            next_version = (last_version.version + 1) if last_version else 1

            version = ComfyWorkflowVersion(
                id=str(uuid.uuid4()),
                workflow_id=wf.id,
                version=next_version,
                prompt=prompt,
                comfyui_prompt_id=comfyui_prompt_id,
                source=source,
                created_at=_now(),
            )
            session.add(version)

            if set_active:
                wf.is_active = True
                wf.updated_at = _now()

            await session.commit()
            await session.refresh(version)
            await session.refresh(wf)
            return wf, version

    async def set_active_version(self, workflow_id: str, version: int) -> Optional[ComfyWorkflowVersion]:
        """Move the active pointer to a historical version (reproducibility)."""
        async with await self._get_session() as session:
            wf = await session.get(ComfyWorkflow, workflow_id)
            if wf is None:
                return None
            wf.is_active = True
            wf.updated_at = _now()
            await session.commit()

    async def get_version(self, version_id: str) -> Optional[ComfyWorkflowVersion]:
        async with await self._get_session() as session:
            return await session.get(ComfyWorkflowVersion, version_id)


# Model IDs here MUST match the canonical IDs in
# backend/app/api/v1/models.py (tripo_sr, trellis, hunyuan3d, ...).
DEFAULT_WORKFLOWS: dict[str, dict[str, Any]] = {
    "tripo_sr": {
        "name": "TripoSR Image-to-3D",
        "description": "Verified default: LoadImage -> Load TripoSR Model -> TripoSR -> Save 3D Mesh",
        "prompt": {
            "1": {"class_type": "LoadImage", "inputs": {"image": "test.png"}},
            "2": {"class_type": "[Comfy3D] Load TripoSR Model", "inputs": {"model_name": "model.ckpt", "chunk_size": 8192}},
            "3": {"class_type": "[Comfy3D] TripoSR", "inputs": {
                "tsr_model": ["2", 0], "reference_image": ["1", 0], "reference_mask": ["1", 1],
                "geometry_extract_resolution": 256, "marching_cude_threshold": 25.0}},
            "4": {"class_type": "[Comfy3D] Save 3D Mesh", "inputs": {"mesh": ["3", 0], "save_path": "output.glb"}},
        },
    },
    "trellis": {
        "name": "TRELLIS Image-to-3D",
        "description": "Verified default: LoadImage -> Load Trellis -> Trellis -> Save 3D Mesh",
        "prompt": {
            "1": {"class_type": "LoadImage", "inputs": {"image": "test.png"}},
            "2": {"class_type": "[Comfy3D] Load Trellis Structured 3D Latents Models", "inputs": {"repo_id": "JeffreyXiang/TRELLIS-image-large"}},
            "3": {"class_type": "[Comfy3D] Trellis Structured 3D Latents Models", "inputs": {
                "trellis_pipe": ["2", 0], "reference_image": ["1", 0], "reference_mask": ["1", 1],
                "seed": 1, "sparse_structure_guidance_scale": 7.5, "sparse_structure_sample_steps": 12,
                "structured_latent_guidance_scale": 3.0, "structured_latent_sample_steps": 12}},
            "4": {"class_type": "[Comfy3D] Save 3D Mesh", "inputs": {"mesh": ["3", 0], "save_path": "output.glb"}},
        },
    },
    "hunyuan3d": {
        "name": "Hunyuan3D-2.1 Image-to-3D",
        "description": "Verified default: LoadImage -> Load Hunyuan3D 21 ShapeGen Pipeline -> Hunyuan3D 21 ShapeGen -> Save 3D Mesh",
        "prompt": {
            "1": {"class_type": "LoadImage", "inputs": {"image": "test.png"}},
            "2": {"class_type": "[Comfy3D] Load Hunyuan3D 21 ShapeGen Pipeline", "inputs": {"subfolder": "hunyuan3d-dit-v2-1"}},
            "3": {"class_type": "[Comfy3D] Hunyuan3D 21 ShapeGen", "inputs": {
                "shapegen_pipe": ["2", 0], "image": ["1", 0], "seed": 1234, "steps": 30,
                "guidance_scale": 7.5, "octree_resolution": 256, "remove_background": True, "auto_cleanup": True}},
            "4": {"class_type": "[Comfy3D] Save 3D Mesh", "inputs": {"mesh": ["3", 0], "save_path": "output.glb"}},
        },
    },
}


async def seed_default_workflows() -> list[str]:
    """Register verified default workflows for models that have none.

    Idempotent: only creates a workflow when the model has no active version.
    """
    registry = get_workflow_registry()
    seeded: list[str] = []
    for model_id, spec in DEFAULT_WORKFLOWS.items():
        active = await registry.get_active_version(model_id)
        if active is None:
            await registry.save_workflow(
                model_id=model_id,
                prompt=spec["prompt"],
                name=spec["name"],
                description=spec["description"],
                source="bundled",
            )
            seeded.append(model_id)
    return seeded


_registry: Optional[WorkflowRegistry] = None


def get_workflow_registry() -> WorkflowRegistry:
    global _registry
    if _registry is None:
        _registry = WorkflowRegistry()
    return _registry