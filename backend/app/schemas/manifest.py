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
    cuda_required: bool = True
    cuda_min_version: str = "11.8"
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
