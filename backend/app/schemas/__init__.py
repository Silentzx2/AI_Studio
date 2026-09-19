"""Pydantic schemas for the new FastAPI backend."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class GenerationRequest(BaseModel):
    mode: str = "text-to-3d"
    prompt: str
    negative_prompt: Optional[str] = None
    quality: str = "standard"
    style_preset: Optional[str] = None
    generate_texture: bool = True
    auto_rig: bool = False
    reference_image_url: Optional[str] = None
    provider: Optional[str] = None
    workspace: Optional[str] = None
    low_vram: bool = False
    vram_mode: str = "auto"
    detail_pass: bool = False
    detail_guidance: float = 1.0
    triposf_pass: bool = False
    mesh_enhancement_mode: str = "none"
    postprocess: Optional[dict] = None
    skip_postprocessing: bool = False
    auto_optimize: bool = False
    auto_optimize_settings: Optional[dict] = None
    remesh_settings: Optional[dict] = None
    source_mesh_url: Optional[str] = None
    game_ready: bool = False
    target_platform: Optional[str] = None
    generate_lod: bool = False
    lod_preset: Optional[str] = None
    lod_count: Optional[int] = None
    generate_collision: bool = False
    generate_pbr: bool = False
    preserve_details: bool = False
    repair_uvs: bool = False
    topology_mode: Optional[str] = None
    seed: Optional[int] = None
    num_inference_steps: Optional[int] = None
    guidance_scale: Optional[float] = None
    octree_resolution: Optional[int] = None
    num_chunks: Optional[int] = None
    face_count: Optional[int] = None
    enable_mesh_repair: bool = False
    strict_watertight: bool = False
    use_pymeshlab_decimation: bool = False
    quality_threshold: Optional[float] = None
    pbr_resolution: Optional[int] = None
    compress_output: bool = False
    prepackage_export: bool = False
    include_lods_in_package: bool = False
    include_collision_in_package: bool = False
    include_qa_in_package: bool = False


class GenerationJobCreate(BaseModel):
    job_id: str
    status: str = "queued"
    provider: str
    mode: str
    prompt: str
    created_at: datetime


class GenerationJobResponse(BaseModel):
    job_id: str
    status: str
    provider: str
    mode: str
    prompt: str
    progress: int
    stage: str
    error_message: Optional[str] = None
    model_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    polygon_count: Optional[int] = None
    vertex_count: Optional[int] = None
    has_rig: bool = False
    file_size: Optional[int] = None
    download_urls: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class GenerationHistoryResponse(BaseModel):
    jobs: list[GenerationJobResponse]
    total: int
    offset: int
    limit: int


class CostEstimateRequest(BaseModel):
    quality: str = "standard"
    generate_texture: bool = True
    auto_rig: bool = False


class CostEstimateResponse(BaseModel):
    quality: str
    credits: int
    breakdown: dict


class CancelResponse(BaseModel):
    job_id: str
    status: str


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    timestamp: str
    services: dict


class ModelInfo(BaseModel):
    id: str
    name: str
    category: str
    type: str
    installed: bool
    available: bool
    loaded: bool
    active: bool
    status: str
    size_estimate_gb: Optional[float] = None
    size_mb: float
    vram_required_mb: Optional[int] = None
    supports_text_to_3d: bool = False
    supports_image_to_3d: bool = False
    supports_texture: bool = False
    colab_incompatible: bool = False
    colab_skip_reason: Optional[str] = None


class ModelsListResponse(BaseModel):
    models: list[ModelInfo]
    count: int
    installed_count: int
    available_count: int


class ProjectExportRequest(BaseModel):
    modelUrl: str
    assetName: Optional[str] = None
    format: str = "glb"
    variant: str = "active"
    layers: list[dict[str, Any]] = []
    assembleAll: bool = False
    includeOriginals: bool = False
    includeTextures: bool = True
    includeLODs: bool = False
    includeCollision: bool = False
    includeQAReport: bool = True
    packageZip: bool = False
    targetPlatform: Optional[str] = "generic"
    lodPreset: Optional[str] = "medium"
    lodCount: Optional[int] = 3


class ProjectExportResponse(BaseModel):
    success: bool
    file_url: str
    filename: str
    format: str
    variant: str


class ErrorResponse(BaseModel):
    success: bool = False
    message: str
    data: Optional[Any] = None
    errors: Optional[str] = None


class SuccessResponse(BaseModel):
    success: bool = True
    message: Optional[str] = None
    data: Optional[Any] = None