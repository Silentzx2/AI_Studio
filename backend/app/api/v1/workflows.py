"""ComfyUI workflow/version management endpoints.

Implements the minimum required persistent workflow/version model:
- user edits a workflow in native ComfyUI, saves it
- the newest save becomes the active default for that model
- old versions remain reproducible
- every AI Studio generation records which version it used
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core import get_workflow_registry

router = APIRouter()
logger = logging.getLogger(__name__)


class SaveWorkflowRequest(BaseModel):
    model_id: str
    prompt: dict[str, Any]
    name: Optional[str] = None
    description: Optional[str] = None
    comfyui_prompt_id: Optional[str] = None
    source: str = "native"
    set_active: bool = True


class WorkflowVersionResponse(BaseModel):
    id: str
    workflow_id: str
    version: int
    comfyui_prompt_id: Optional[str] = None
    source: str
    created_at: Optional[str] = None


class WorkflowResponse(BaseModel):
    id: str
    model_id: str
    name: str
    description: Optional[str] = None
    is_active: bool
    versions: list[WorkflowVersionResponse] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


def _wf_to_response(wf, versions=None) -> WorkflowResponse:
    return WorkflowResponse(
        id=wf.id,
        model_id=wf.model_id,
        name=wf.name,
        description=wf.description,
        is_active=wf.is_active,
        versions=versions or [],
        created_at=wf.created_at.isoformat() if wf.created_at else None,
        updated_at=wf.updated_at.isoformat() if wf.updated_at else None,
    )


def _v_to_response(v) -> WorkflowVersionResponse:
    return WorkflowVersionResponse(
        id=v.id,
        workflow_id=v.workflow_id,
        version=v.version,
        comfyui_prompt_id=v.comfyui_prompt_id,
        source=v.source,
        created_at=v.created_at.isoformat() if v.created_at else None,
    )


@router.post("/save", response_model=WorkflowResponse)
async def save_workflow(req: SaveWorkflowRequest):
    """Persist a new workflow version for a model.

    New saves append a version; the active pointer moves to the newest.
    Historical versions are never destroyed.
    """
    registry = get_workflow_registry()
    try:
        wf, version = await registry.save_workflow(
            model_id=req.model_id,
            prompt=req.prompt,
            name=req.name,
            description=req.description,
            comfyui_prompt_id=req.comfyui_prompt_id,
            source=req.source,
            set_active=req.set_active,
        )
    except Exception as exc:
        logger.exception("Failed to save workflow")
        raise HTTPException(status_code=500, detail=f"Failed to save workflow: {exc}")

    versions = await registry.list_versions(wf.id)
    return _wf_to_response(wf, [_v_to_response(v) for v in versions])


@router.get("/active/{model_id}", response_model=WorkflowResponse)
async def get_active_workflow(model_id: str):
    """Get the active workflow (and its newest version) for a model."""
    registry = get_workflow_registry()
    wf = await registry.get_active_workflow(model_id)
    if wf is None:
        raise HTTPException(status_code=404, detail=f"No active workflow for model '{model_id}'")
    versions = await registry.list_versions(wf.id)
    return _wf_to_response(wf, [_v_to_response(v) for v in versions])


@router.get("/version/{version_id}", response_model=WorkflowVersionResponse)
async def get_workflow_version(version_id: str):
    """Get a single immutable workflow version by ID (reproducibility)."""
    registry = get_workflow_registry()
    v = await registry.get_version(version_id)
    if v is None:
        raise HTTPException(status_code=404, detail=f"Workflow version '{version_id}' not found")
    return _v_to_response(v)


@router.get("/list", response_model=list[WorkflowResponse])
async def list_workflows(model_id: Optional[str] = None):
    """List all registered workflows, optionally filtered by model."""
    registry = get_workflow_registry()
    wfs = await registry.list_workflows(model_id=model_id)
    out = []
    for wf in wfs:
        versions = await registry.list_versions(wf.id)
        out.append(_wf_to_response(wf, [_v_to_response(v) for v in versions]))
    return out


@router.post("/set-active/{workflow_id}", response_model=WorkflowResponse)
async def set_active_workflow(workflow_id: str):
    """Mark a workflow as the active default for its model (reproducibility)."""
    from app.models import ComfyWorkflow
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        wf = await session.get(ComfyWorkflow, workflow_id)
        if wf is None:
            raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
        wf.is_active = True
        await session.commit()

    registry = get_workflow_registry()
    versions = await registry.list_versions(workflow_id)
    return _wf_to_response(wf, [_v_to_response(v) for v in versions])