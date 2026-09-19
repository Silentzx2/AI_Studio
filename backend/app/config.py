"""Configuration management for the new FastAPI backend."""

import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_name: str = "AI Studio"
    app_version: str = "6.0.0"
    debug: bool = Field(default=False, alias="DEBUG")
    environment: str = Field(default="development", alias="ENVIRONMENT")

    # API
    api_v1_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://ai_studio:ai_studio_dev@127.0.0.1:5432/ai_studio?sslmode=disable",
        alias="DATABASE_URL",
    )
    sync_database_url: str = Field(
        default="postgresql://ai_studio:ai_studio_dev@127.0.0.1:5432/ai_studio?sslmode=disable",
        alias="DATABASE_SYNC_URL",
    )

    # Redis
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # Storage
    storage_local_path: str = Field(default="./backend/storage", alias="STORAGE_LOCAL_PATH")
    runtime_cache_dir: str = Field(default="./backend/.runtime_cache", alias="RUNTIME_CACHE_DIR")
    hf_home: str = Field(default="./backend/third_party/.hf_cache", alias="HF_HOME")
    weights_dir: str = Field(default="./backend/third_party/weights", alias="WEIGHTS_DIR")
    third_party_dir: str = Field(default="./backend/third_party", alias="THIRD_PARTY_DIR")

    # ComfyUI
    comfyui_host: str = Field(default="127.0.0.1", alias="COMFYUI_HOST")
    comfyui_port: int = Field(default=8188, alias="COMFYUI_PORT")
    comfyui_base_url: str = Field(default="", alias="COMFYUI_BASE_URL")
    comfyui_timeout: int = Field(default=300, alias="COMFYUI_TIMEOUT")

    # GPU
    cuda_visible_devices: str = Field(default="0", alias="CUDA_VISIBLE_DEVICES")
    cuda_device: str = Field(default="auto", alias="CUDA_DEVICE")
    platform_mode: str = Field(default="gpu", alias="PLATFORM_MODE")
    cpu_fallback: bool = Field(default=False, alias="CPU_FALLBACK")

    # GPU
    gpu_available: bool = Field(default=False, alias="GPU_AVAILABLE")
    require_gpu: bool = Field(default=False, alias="REQUIRE_GPU")

    # Blender
    blender_executable: str = Field(default="blender", alias="BLENDER_EXECUTABLE")

    # Python
    pythonpath: str = Field(default="./backend", alias="PYTHONPATH")

    @property
    def comfyui_url(self) -> str:
        if self.comfyui_base_url:
            return self.comfyui_base_url.rstrip("/")
        return f"http://{self.comfyui_host}:{self.comfyui_port}"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()