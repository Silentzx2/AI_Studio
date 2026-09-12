from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


# ── Request schemas ────────────────────────────────────────────────────────────

class AutoOptimizeSettings(BaseModel):
    target_polycount: int = Field(30000, ge=1000, le=500000, description="Target triangle count after optimization")
    fix_uvs: bool = Field(True, description="Fix overlapping UVs and fill UV islands")
    preserve_details: float = Field(75.0, ge=0, le=100, description="Detail preservation percentage (0=aggressive, 100=max)")

    @model_validator(mode="before")
    @classmethod
    def accept_camel_case(cls, data: object) -> object:
        if isinstance(data, dict):
            if "targetPolycount" in data and "target_polycount" not in data:
                data["target_polycount"] = data["targetPolycount"]
            if "fixUVs" in data and "fix_uvs" not in data:
                data["fix_uvs"] = data["fixUVs"]
            if "preserveDetails" in data and "preserve_details" not in data:
                data["preserve_details"] = data["preserveDetails"]
        return data


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
    source_mesh_url: str | None = None
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
    # Auto-optimize: post-generation mesh cleanup (decimation + UV fix)
    auto_optimize: bool = False
    auto_optimize_settings: AutoOptimizeSettings | None = None
    # Built-in remesh settings. These are applied by the CPU/GPU mesh optimizer
    # against the selected source GLB; no AI provider is loaded for remesh jobs.
    remesh_settings: dict | None = None
    # Game-ready pipeline options
    game_ready: bool = False
    target_platform: Literal["generic", "mobile", "low", "medium", "high", "cinematic"] = "generic"
    generate_lod: bool = False
    lod_preset: Literal["mobile", "low", "medium", "high", "custom"] = "medium"
    lod_count: int = Field(3, ge=1, le=5)
    generate_collision: bool = False
    generate_pbr: bool = True
    preserve_details: float = Field(75.0, ge=0, le=100)
    repair_uvs: bool = True
    # Output mesh topology mode: triangle (meshoptimizer), quad (Blender QuadriFlow), or adaptive (smart routing)
    topology_mode: Literal["triangle", "quad", "adaptive"] = "adaptive"
    postprocess: bool = True
    skip_postprocessing: bool = False
    # Advanced / Provider inference parameters
    seed: int | None = Field(None, description="Random seed for reproducibility")
    num_inference_steps: int | None = Field(None, ge=1, le=200, description="Number of diffusion/flow steps")
    guidance_scale: float | None = Field(None, ge=0.0, le=20.0, description="Classifier-free guidance scale")
    octree_resolution: int | None = Field(None, ge=128, le=1024, description="Octree / grid resolution for marching cubes")
    num_chunks: int | None = Field(None, ge=1000, le=100000, description="Chunk size for memory-bounded query")
    face_count: int | None = Field(None, ge=100, le=500000, description="Target face count for initial mesh extraction")
    
    # Post-processing
    enable_mesh_repair: bool = True
    strict_watertight: bool = True
    use_pymeshlab_decimation: bool = True
    quality_threshold: float = Field(0.3, ge=0.0, le=1.0)
    pbr_resolution: Literal['1k', '2k', '4k'] = '2k'
    compress_output: bool = True
    
    # Package
    prepackage_export: bool = False
    include_lods_in_package: bool = True
    include_collision_in_package: bool = True
    include_qa_in_package: bool = True

    @model_validator(mode="before")
    @classmethod
    def accept_request_camel_case(cls, data: object) -> object:
        if isinstance(data, dict):
            mapping = {
                "gameReady": "game_ready",
                "targetPlatform": "target_platform",
                "generateLOD": "generate_lod",
                "lodPreset": "lod_preset",
                "lodCount": "lod_count",
                "generateCollision": "generate_collision",
                "generatePBR": "generate_pbr",
                "preserveDetails": "preserve_details",
                "repairUVs": "repair_uvs",
                "generateTexture": "generate_texture",
                "autoRig": "auto_rig",
                "autoOptimize": "auto_optimize",
                "topologyMode": "topology_mode",
                "postProcess": "postprocess",
                "skipPostprocessing": "skip_postprocessing",
                "skip_post_processing": "skip_postprocessing",
                "lowVram": "low_vram",
                "vramMode": "vram_mode",
                "numInferenceSteps": "num_inference_steps",
                "steps": "num_inference_steps",
                "guidanceScale": "guidance_scale",
                "octreeResolution": "octree_resolution",
                "numChunks": "num_chunks",
                "faceCount": "face_count",
                "enableMeshRepair": "enable_mesh_repair",
                "strictWatertight": "strict_watertight",
                "usePymeshlabDecimation": "use_pymeshlab_decimation",
                "qualityThreshold": "quality_threshold",
                "pbrResolution": "pbr_resolution",
                "compressOutput": "compress_output",
                "prepackageExport": "prepackage_export",
                "includeLODsInPackage": "include_lods_in_package",
                "includeCollisionInPackage": "include_collision_in_package",
                "includeQAInPackage": "include_qa_in_package",
            }
            for k, v in mapping.items():
                if k in data and v not in data:
                    data[v] = data[k]
            if (data.get("quadTopology") or data.get("quad_topology")) and "topology_mode" not in data:
                data["topology_mode"] = "quad"
        return data

    @field_validator("reference_image_url", "source_mesh_url", mode="before")
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
    ply: str | None = None
    source: str | None = None
    game_ready: str | None = None
    collision: str | None = None


class JobResult(BaseModel):
    model_url: str
    thumbnail_url: str
    polygon_count: int
    vertex_count: int
    texture_resolution: str | None = None
    has_rig: bool
    download_urls: DownloadUrls
    file_size: int
    source_model_url: str | None = None
    game_ready_url: str | None = None
    active_model_url: str | None = None
    lod_urls: list[str] = Field(default_factory=list)
    collision_url: str | None = None
    qa_report: dict | None = None
    pipeline_stages: list[dict[str, Any]] = Field(default_factory=list)


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
