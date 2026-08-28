from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


# ── Request schemas ────────────────────────────────────────────────────────────

class GenerationRequest(BaseModel):
    # ponytail: Extended modes to support remesh, texture-gen, and future pipeline steps
    mode: Literal[
        "text-to-3d", "image-to-3d", "remesh", "texture-generation",
        "rigging", "render",
    ] = "text-to-3d"
    prompt: str = Field("", max_length=2000)
    negative_prompt: str | None = Field(None, max_length=500)
    # ponytail: Extended quality options for texture/remesh workflows
    quality: Literal["low-poly", "standard", "high-poly", "ultra", "draft"] = "standard"
    style_preset: str | None = None
    generate_texture: bool = True
    auto_rig: bool = False
    reference_image_url: str | None = None
    detail_pass: bool = False
    detail_guidance: float = 7.5
    # Low VRAM mode: True forces low-VRAM execution; vram_mode may be
    # "auto" (default — runtime picks a mode that fits), "normal" or "low".
    low_vram: bool = False
    vram_mode: Literal["auto", "normal", "low"] = "auto"
    # Optional explicit provider; falls back to settings.ai_provider when unset.
    provider: str | None = None
    # Optional workspace id used to auto-map generation mode and stored on the job.
    workspace: str | None = None

    @field_validator("reference_image_url", mode="before")
    @classmethod
    def empty_str_to_none(cls, v):
        if v == "":
            return None
        return v

    @field_validator("quality", mode="before")
    @classmethod
    def normalize_quality(cls, v):
        """Accept common UI aliases the frontend may send.

        The UI quality selector stores plain strings ('low'/'medium'/'high'),
        while the backend Literal only allows 'low-poly'/'standard'/'high-poly'
        (+ 'ultra'/'draft'). Normalize the aliases so a mismatched value can't
        produce a 422 Unprocessable Entity on generation. Unknown values pass
        through to the Literal check unchanged.
        """
        if not isinstance(v, str):
            return v
        return {
            "low": "low-poly",
            "lowpoly": "low-poly",
            "medium": "standard",
            "high": "high-poly",
            "highpoly": "high-poly",
        }.get(v.strip().lower(), v)

    @model_validator(mode="after")
    def validate_prompt_for_mode(self):
        if self.mode == "text-to-3d" and not self.prompt.strip():
            raise ValueError("prompt is required for text-to-3d generation")
        return self


# ── Response schemas ───────────────────────────────────────────────────────────

class DownloadUrls(BaseModel):
    glb: str | None = None
    fbx: str | None = None
    obj: str | None = None
    stl: str | None = None


class JobResult(BaseModel):
    model_url: str
    thumbnail_url: str
    polygon_count: int
    vertex_count: int
    texture_resolution: str | None = None
    has_rig: bool
    download_urls: DownloadUrls
    file_size: int


class JobResponse(BaseModel):
    id: str
    status: str
    mode: str
    prompt: str
    negative_prompt: str | None = None
    quality: str
    style_preset: str | None = None
    generate_texture: bool
    auto_rig: bool
    provider: str
    enhanced_prompt: str | None = None
    progress: int
    stage: str
    error_message: str | None = None
    result: JobResult | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    total: int


# ── SSE event schemas ──────────────────────────────────────────────────────────

class ProgressEvent(BaseModel):
    job_id: str
    status: str
    stage: str
    progress: int
    message: str
    level: Literal["info", "warn", "error", "success"] = "info"
    result: JobResult | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


# ── Upload schemas ─────────────────────────────────────────────────────────────

class ImageUploadResponse(BaseModel):
    url: str
    width: int
    height: int
    size: int
    content_type: str
