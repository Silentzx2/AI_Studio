"""Application configuration using Pydantic Settings.

GPU-ONLY MODE: This application requires an NVIDIA GPU.
Configuration defaults reflect GPU-first architecture.
"""
from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "AI 3D Studio API"
    app_version: str = "3.0.0"
    debug: bool = False
    environment: Literal["development", "staging", "production"] = "development"
    host: str = "0.0.0.0"
    port: int = 8000
    api_v1_prefix: str = "/api/v1"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]
    database_url: str = "postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/ai3dstudio"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"
    storage_backend: Literal["local", "s3"] = "local"
    storage_local_path: str = "./storage"
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    prompt_enhancement_enabled: bool = False
    ai_provider: str = "hunyuan3d-2.1"
    hunyuan3d_api_url: str = "http://localhost:7860"
    trellis_api_url: str = "http://localhost:7861"
    instant_mesh_api_url: str = "http://localhost:7862"
    runtime_mode: Literal["local", "api"] = "local"
    third_party_dir: str = "./third_party"
    weights_dir: str = "./third_party/weights"
    cuda_device: str = "auto"
    max_vram_mb: int = 0
    vram_safety_margin_mb: int = 2048
    cpu_fallback: bool = False
    lazy_model_loading: bool = True
    auto_unload_after_job: bool = True
    blender_executable: str = "blender"
    blender_enabled: bool = True
    blender_timeout: int = 300
    max_concurrent_jobs: int = 1
    job_timeout_seconds: int = 600
    job_result_ttl_seconds: int = 86400
    offline_mode: bool = False
    huggingface_token: str = ""
    allow_mock_provider: bool = False

    @property
    def sync_database_url(self) -> str:
        """Synchronous DB URL for Celery workers (not async contexts).

        BUG-16 FIX: Previously each worker file duplicated the same brittle string
        replacement inline. Centralised here so there is one place to fix when the
        driver changes.
        """
        url = self.database_url
        url = url.replace("+asyncpg", "+psycopg2")
        url = url.replace("+aiosqlite", "")   # bare sqlite:// is the sync driver
        return url

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except Exception:
                return [x.strip() for x in v.split(",") if x.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
