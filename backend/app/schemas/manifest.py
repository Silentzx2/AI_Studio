"""Manifest schema for model validation"""
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ModelCategory(str, Enum):
    """Model categories"""
    THREE_D_GENERATION = "3d_generation"
    TEXTURE = "texture"
    REMESH = "remesh"
    RIGGING = "rigging"
    ANIMATION = "animation"
    UPSCALE = "upscale"


class ModelCapabilities(BaseModel):
    """Model capabilities declaration"""
    text_to_3d: bool = False
    image_to_3d: bool = False
    texture_generation: bool = False
    remesh: bool = False
    retopology: bool = False
    rigging: bool = False
    animation: bool = False
    upscaling: bool = False
    background_removal: bool = False
    multi_view_generation: bool = False
    controlnet: bool = False
    batch_generation: bool = False
    multi_gpu: bool = False
    lora_support: bool = False
    streaming_output: bool = False
    preview_mode: bool = True
    background_jobs: bool = True
    custom_parameters: bool = True
    export_formats: list[str] = Field(default_factory=lambda: ["glb", "obj", "fbx"])
    # Low VRAM mode: a VERIFIED small-footprint execution path. Never declare
    # this true unless the engine/provider/accelerate loader implements it.
    low_vram: bool = False
    cpu_offload: bool = False
    attention_slicing: bool = False
    quantization: bool = False
    # Format / asset capabilities
    supports_glb: bool = True
    supports_obj: bool = False
    supports_fbx: bool = False
    supports_usdz: bool = False
    supports_gaussian: bool = False
    supports_mesh: bool = True
    supports_uv: bool = False
    supports_pbr: bool = False
    supports_texture_baking: bool = False
    supports_part_separation: bool = False
    supports_detail_enhancement: bool = False


class PythonDependency(BaseModel):
    """Python package dependency"""
    name: str
    version: str = "*"
    optional: bool = False


class SystemDependencies(BaseModel):
    """System-level dependencies"""
    python_packages: list[PythonDependency] = Field(default_factory=list)
    system_commands: list[str] = Field(default_factory=list)
    blender_version: str | None = None
    nodejs_packages: list[dict[str, str]] = Field(default_factory=list)


class DownloadSource(BaseModel):
    """Download source configuration"""
    provider: str
    repo_id: str | None = None  # For HuggingFace
    repository: str | None = None  # For GitHub
    release_tag: str | None = None  # For GitHub releases
    assets: list[str] = Field(default_factory=list)  # For GitHub
    priority: int = 1
    mirrors: list[str] = Field(default_factory=list)


class HealthCheck(BaseModel):
    """Health check configuration"""
    type: str  # inference_test, import_test, etc
    test_input: dict[str, Any] | None = None
    expected_output_shape: list[int] | None = None
    timeout_seconds: int = 120


class SupportedPipeline(BaseModel):
    """Pipeline support declaration"""
    pipeline_id: str
    model_type: str
    quality_levels: list[str] = Field(default_factory=lambda: ["draft", "standard", "high"])


class RuntimeConfig(BaseModel):
    """Runtime configuration"""
    type: str = "python_module"
    entrypoint: str
    inference_class: str
    config_schema: dict[str, Any] | None = None


class ManifestSchema(BaseModel):
    """Complete model manifest schema"""
    
    # Core metadata
    name: str
    version: str
    category: ModelCategory
    description: str
    author: str
    license: str
    
    # System requirements
    min_vram_mb: int = 1024
    recommended_vram_mb: int = 4096
    low_vram_mb: int = 0
    low_vram_required_mb: int | None = None
    low_vram_supported: bool = False
    low_vram_strategy: list[str] = Field(default_factory=list)
    native_build_required: bool = False
    install_method: str = "uv_requirements"
    cuda_required: bool = True
    cuda_min_version: str = "12.4"
    python_min: str = "3.10"
    supported_os: list[str] = Field(default_factory=lambda: ["linux"])
    supported_architectures: list[str] = Field(default_factory=lambda: ["x86_64"])
    disk_space_mb: int = 5000
    
    # Capabilities
    capabilities: ModelCapabilities
    
    # Dependencies
    dependencies: SystemDependencies = Field(default_factory=SystemDependencies)
    
    # Download configuration
    download_sources: list[DownloadSource]
    checksums: dict[str, str] | None = None
    
    # Runtime
    runtime: RuntimeConfig
    
    # Health checks
    health_check: HealthCheck | None = None
    
    # Pipeline support
    supported_pipelines: list[SupportedPipeline] = Field(default_factory=list)
    
    # Additional metadata
    tags: list[str] = Field(default_factory=list)
    documentation_url: str | None = None
    repository_url: str | None = None
    
    model_config = ConfigDict(use_enum_values=True)
