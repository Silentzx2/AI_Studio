"""Regression test for Settings resilience against unpopulated / empty environment variables.

When .env has unpopulated variables (e.g. DEBUG= or MAX_VRAM_MB=) or shell scripts export empty strings,
Settings must fall back to field defaults rather than raising pydantic_core.ValidationError.

Run with:
    python backend/runtime/test_settings_empty_env.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def test_settings_empty_env() -> None:
    # 1. Set all 12 troublesome fields to empty string in os.environ
    empty_vars = {
        "DEBUG": "",
        "ENVIRONMENT": "",
        "STORAGE_BACKEND": "",
        "PROMPT_ENHANCEMENT_ENABLED": "",
        "RUNTIME_MODE": "",
        "MAX_VRAM_MB": "",
        "VRAM_SAFETY_MARGIN_MB": "",
        "AUTO_UNLOAD_AFTER_JOB": "",
        "BLENDER_ENABLED": "",
        "BLENDER_TIMEOUT": "",
        "MAX_CONCURRENT_JOBS": "",
        "OFFLINE_MODE": "",
        "DATABASE_URL": "",
        "STORAGE_LOCAL_PATH": "",
        "CORS_ORIGINS": "",
    }
    for k, v in empty_vars.items():
        os.environ[k] = v

    try:
        from app.config import Settings

        # Instantiating Settings with empty string env vars must not raise ValidationError
        settings = Settings()

        assert settings.debug is False, f"Expected False, got {settings.debug}"
        assert settings.environment == "development", f"Expected development, got {settings.environment}"
        assert settings.storage_backend == "local", f"Expected local, got {settings.storage_backend}"
        assert settings.prompt_enhancement_enabled is False
        assert settings.runtime_mode == "local"
        assert settings.max_vram_mb == 0
        assert settings.vram_safety_margin_mb == 2048
        assert settings.auto_unload_after_job is True
        assert settings.blender_enabled is True
        assert settings.blender_timeout == 300
        assert settings.max_concurrent_jobs == 1
        assert settings.offline_mode is False
        assert "+asyncpg" in settings.database_url
        assert len(settings.cors_origins) >= 2

        print("settings empty env validation check: PASS")
    finally:
        for k in empty_vars:
            os.environ.pop(k, None)


if __name__ == "__main__":
    test_settings_empty_env()
