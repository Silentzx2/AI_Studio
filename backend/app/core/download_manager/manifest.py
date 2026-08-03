"""
Plugin Manifest System - Self-describing model metadata
Every model must include a manifest.json with standardized structure
"""
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ModelCategory(str, Enum):
    """Available model categories"""
    THREE_D_GENERATION = "3d_generation"
    TEXTURE = "texture"
    REMESH = "remesh"
    RIGGING = "rigging"
    ANIMATION = "animation"
    UPSCALE = "upscale"


class Capability(str, Enum):
    """Model capabilities - used for dynamic UI generation"""
    TEXT_TO_3D = "text_to_3d"
    IMAGE_TO_3D = "image_to_3d"
    TEXTURE_GENERATION = "texture_generation"
    REMESH = "remesh"
    RETOPOLOGY = "retopology"
    RIGGING = "rigging"
    ANIMATION = "animation"
    UPSCALING = "upscaling"
    BACKGROUND_REMOVAL = "background_removal"
    MULTI_VIEW_GENERATION = "multi_view_generation"
    CONTROLNET = "controlnet"
    BATCH_GENERATION = "batch_generation"
    MULTI_GPU = "multi_gpu"
    LORA_SUPPORT = "lora_support"
    STREAMING_OUTPUT = "streaming_output"
    PREVIEW_MODE = "preview_mode"
    BACKGROUND_JOBS = "background_jobs"
    CUSTOM_PARAMETERS = "custom_parameters"


class SystemRequirements(BaseModel):
    """System requirements for model"""
    min_vram_mb: int = Field(..., description="Minimum VRAM in MB")
    recommended_vram_mb: int = Field(..., description="Recommended VRAM in MB")
    cuda_required: bool = True
    cuda_min_version: str = "11.8"
    python_min: str = "3.10"
    supported_os: list[str] = ["linux", "windows", "macos"]
    supported_architectures: list[str] = ["x86_64"]
    disk_space_mb: int = Field(..., description="Minimum disk space for installation")


class PythonPackage(BaseModel):
    """Python package dependency"""
    name: str
    version: str  # e.g., ">=4.30.0,<5.0.0"
    optional: bool = False


class Dependencies(BaseModel):
    """Model dependencies"""
    python_packages: list[PythonPackage]
    system_commands: list[str] = []  # e.g., ["git", "ffmpeg"]
    blender_version: str | None = None
    nodejs_packages: list[str] = []


class DownloadSource(BaseModel):
    """Download source configuration"""
    provider: str  # e.g., "huggingface", "github"
    repo_id: str | None = None  # For HF
    repository: str | None = None  # For GitHub
    release_tag: str | None = None
    url: str | None = None  # For direct URLs
    priority: int = 1  # Higher = try first
    mirrors: list[str] = []
    assets: list[str] = []  # Specific files to download


class RuntimeConfig(BaseModel):
    """Runtime configuration for inference"""
    type: str = "python_module"
    entrypoint: str  # e.g., "model.pipeline:InferencePipeline"
    inference_class: str
    config_schema: dict[str, Any] = {}


class HealthCheck(BaseModel):
    """Health check configuration"""
    type: str = "inference_test"
    test_input: dict[str, Any]
    expected_output_shape: list[int] | None = None
    timeout_seconds: int = 120


class PipelineConfig(BaseModel):
    """Supported pipeline configuration"""
    pipeline_id: str
    model_type: str
    quality_levels: list[str] = []


class PluginManifest(BaseModel):
    """Complete plugin manifest schema"""
    
    # Core metadata
    name: str = Field(..., description="Model name")
    version: str = Field(..., description="Semantic version")
    category: ModelCategory
    description: str
    author: str
    license: str
    
    # System requirements
    system_requirements: SystemRequirements
    
    # Capabilities - determines what UI features are available
    capabilities: dict[str, bool] = Field(
        default_factory=lambda: {
            "text_to_3d": False,
            "image_to_3d": False,
            "texture_generation": False,
            "batch_generation": True,
            "preview_mode": True,
        }
    )
    
    # Dependencies
    dependencies: Dependencies
    
    # Download configuration
    download_sources: list[DownloadSource]
    checksums: dict[str, str] = {}  # filename -> sha256
    
    # Runtime configuration
    runtime: RuntimeConfig
    
    # Health checks and testing
    health_check: HealthCheck | None = None
    
    # Supported pipelines
    supported_pipelines: list[PipelineConfig] = []
    
    # Metadata
    tags: list[str] = []
    homepage: str | None = None


class ModelRegistry(BaseModel):
    """Database record for installed model"""
    id: str
    manifest: PluginManifest
    installed_at: str
    last_used: str | None = None
    installation_path: str
    venv_path: str | None = None
    size_mb: int
    status: str  # "ready", "broken", "installing", "disabled"
    health_check_result: dict[str, Any] | None = None
    error_message: str | None = None
