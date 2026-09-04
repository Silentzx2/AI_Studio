#!/usr/bin/env python3
"""Environment variable validation and resilience helper for AI 3D Studio backend.

Ensures all required and optional environment variables are parsed correctly,
provides safe default fallbacks for missing or unpopulated keys to prevent
Pydantic validation errors, and verifies readiness before database migrations
or FastAPI application startup.

Can be run directly:
    python3 backend/scripts/validate_env.py
Or used as an imported module:
    from backend.scripts.validate_env import validate_environment, ensure_valid_environment
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Project root calculation: backend/scripts/validate_env.py -> backend/scripts -> backend -> root
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

# Standard fallback defaults for critical runtime settings
DEFAULT_CONFIG: Dict[str, Any] = {
    "APP_NAME": "AI 3D Studio API",
    "APP_VERSION": "3.0.0",
    "DEBUG": False,
    "ENVIRONMENT": "development",
    "HOST": "0.0.0.0",
    "PORT": 8000,
    "API_V1_PREFIX": "/api/v1",
    "DATABASE_URL": "postgresql+asyncpg://ai_studio:ai_studio_dev@127.0.0.1:5432/ai_studio?sslmode=disable",
    "REDIS_URL": "redis://localhost:6379/0",
    "CELERY_BROKER_URL": "redis://localhost:6379/0",
    "CELERY_RESULT_BACKEND": "redis://localhost:6379/1",
    "BACKEND_URL": "http://127.0.0.1:8000",
    "STORAGE_BACKEND": "local",
    "STORAGE_LOCAL_PATH": str(BACKEND_DIR / "storage"),
    "CORS_ORIGINS": '["http://localhost:3000","http://localhost:3001","http://127.0.0.1:3000","http://127.0.0.1:3001"]',
    "AI_PROVIDER": "hunyuan3d-2.1",
    "RUNTIME_MODE": "local",
    "CUDA_DEVICE": "auto",
    "MAX_VRAM_MB": 0,
    "VRAM_SAFETY_MARGIN_MB": 2048,
    "CPU_FALLBACK": False,
    "LAZY_MODEL_LOADING": True,
    "AUTO_UNLOAD_AFTER_JOB": True,
    "BLENDER_ENABLED": True,
    "BLENDER_TIMEOUT": 300,
    "MAX_CONCURRENT_JOBS": 1,
    "JOB_TIMEOUT_SECONDS": 600,
    "JOB_RESULT_TTL_SECONDS": 86400,
    "OFFLINE_MODE": False,
    "ALLOW_MOCK_PROVIDER": False,
    "LOW_VRAM": False,
    "VRAM_MODE": "auto",
}

BOOLEAN_FIELDS = {
    "DEBUG",
    "PROMPT_ENHANCEMENT_ENABLED",
    "CPU_FALLBACK",
    "LAZY_MODEL_LOADING",
    "AUTO_UNLOAD_AFTER_JOB",
    "BLENDER_ENABLED",
    "OFFLINE_MODE",
    "ALLOW_MOCK_PROVIDER",
    "LOW_VRAM",
}

INTEGER_FIELDS = {
    "PORT",
    "MAX_VRAM_MB",
    "VRAM_SAFETY_MARGIN_MB",
    "BLENDER_TIMEOUT",
    "MAX_CONCURRENT_JOBS",
    "JOB_TIMEOUT_SECONDS",
    "JOB_RESULT_TTL_SECONDS",
}


def parse_bool(value: Any, default: bool = False) -> bool:
    """Parse boolean from string or int with safe fallback."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        val = value.strip().lower()
        if not val:
            return default
        if val in {"1", "true", "yes", "on", "debug", "dev", "development"}:
            return True
        if val in {"0", "false", "no", "off", "release", "prod", "production"}:
            return False
    return default


def parse_int(value: Any, default: int = 0) -> int:
    """Parse integer from string or int with safe fallback."""
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        val = value.strip()
        if not val:
            return default
        try:
            return int(val)
        except ValueError:
            return default
    return default


def normalize_database_url(url: Optional[str]) -> str:
    """Ensure database URL is non-empty, points to a valid driver, and avoids unresolvable Docker host outside Docker."""
    default_db = DEFAULT_CONFIG["DATABASE_URL"]
    if not url or not url.strip():
        return default_db
    
    cleaned = url.strip()
    # If using postgresql:// without asyncpg driver, adapt for SQLAlchemy asyncpg
    if cleaned.startswith("postgresql://"):
        cleaned = cleaned.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    # In Colab/native, Docker hostname 'postgres' cannot be resolved
    if "@postgres:" in cleaned:
        cleaned = cleaned.replace("@postgres:", "@127.0.0.1:")
    
    return cleaned


def normalize_backend_url(url: Optional[str]) -> str:
    """Ensure BACKEND_URL avoids unresolvable Docker host 'api' outside Docker networks."""
    default_url = DEFAULT_CONFIG["BACKEND_URL"]
    if not url or not url.strip():
        return default_url
    
    cleaned = url.strip().rstrip("/")
    if "//api:8000" in cleaned or cleaned == "http://api":
        return default_url
    return cleaned


def parse_dotenv(dotenv_path: Path) -> Dict[str, str]:
    """Parse key-value pairs from a .env file without external dependencies."""
    env_vars: Dict[str, str] = {}
    if not dotenv_path.is_file():
        return env_vars
    
    try:
        with open(dotenv_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip()
                # Strip wrapping quotes
                if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                    v = v[1:-1]
                env_vars[k] = v
    except Exception:
        pass
    return env_vars


def validate_environment(
    apply_fallbacks_to_os: bool = True,
    dotenv_file: Optional[Path] = None,
) -> Tuple[bool, Dict[str, Any], List[str]]:
    """Validate environment variables, apply fallbacks, and test Settings load.

    Returns:
        Tuple of (is_valid, validated_settings_dict, list_of_warnings_or_notes)
    """
    notes: List[str] = []
    env_file = dotenv_file or (PROJECT_ROOT / ".env")
    file_vars = parse_dotenv(env_file) if env_file.is_file() else {}

    validated: Dict[str, Any] = {}

    # Inspect all known config fields
    for key, default_val in DEFAULT_CONFIG.items():
        # Precedence: os.environ > .env file > default_val
        raw_val = os.environ.get(key)
        source = "os.environ"
        if raw_val is None:
            raw_val = file_vars.get(key)
            source = f".env ({env_file.name})"
        
        # Handle empty/whitespace-only values
        is_empty = raw_val is None or (isinstance(raw_val, str) and not raw_val.strip())

        if is_empty:
            final_val = default_val
            notes.append(f"[FALLBACK] {key} unset or empty in {source} -> defaulted to {repr(default_val)}")
        else:
            # Type-specific validation and normalization
            if key in BOOLEAN_FIELDS:
                final_val = parse_bool(raw_val, default=bool(default_val))
            elif key in INTEGER_FIELDS:
                final_val = parse_int(raw_val, default=int(default_val))
            elif key == "DATABASE_URL":
                final_val = normalize_database_url(raw_val)
                if final_val != raw_val:
                    notes.append(f"[NORMALIZED] DATABASE_URL sanitized from '{raw_val}' to '{final_val}'")
            elif key == "BACKEND_URL":
                final_val = normalize_backend_url(raw_val)
                if final_val != raw_val:
                    notes.append(f"[NORMALIZED] BACKEND_URL sanitized from '{raw_val}' to '{final_val}'")
            elif key == "STORAGE_LOCAL_PATH":
                p = Path(raw_val.strip())
                if not p.is_absolute():
                    final_val = str((PROJECT_ROOT / p).resolve())
                else:
                    final_val = str(p)
            else:
                final_val = raw_val.strip() if isinstance(raw_val, str) else raw_val

        validated[key] = final_val

        # Apply fallback into os.environ if requested
        if apply_fallbacks_to_os:
            os.environ[key] = str(final_val) if not isinstance(final_val, bool) else ("true" if final_val else "false")

    # If Pydantic is available, attempt to load backend Settings
    pydantic_ok = True
    try:
        # Add backend dir to sys.path to resolve app.config
        if str(BACKEND_DIR) not in sys.path:
            sys.path.insert(0, str(BACKEND_DIR))
        from app.config import Settings  # type: ignore

        # Test creating Settings object
        settings_instance = Settings()
        notes.append(f"[SUCCESS] Pydantic Settings validated successfully (app={settings_instance.app_name})")
    except ImportError:
        notes.append("[INFO] Pydantic not installed in current interpreter; validated via schema fallback engine.")
    except Exception as e:
        pydantic_ok = False
        notes.append(f"[ERROR] Pydantic Settings validation error: {e}")

    return pydantic_ok, validated, notes


def ensure_valid_environment() -> Dict[str, Any]:
    """Helper for startup scripts and migrations: enforces valid environment or raises RuntimeError."""
    ok, validated, notes = validate_environment(apply_fallbacks_to_os=True)
    if not ok:
        error_msgs = "\n".join(n for n in notes if "[ERROR]" in n)
        raise RuntimeError(f"Environment validation failed:\n{error_msgs}")
    return validated


def main() -> int:
    """CLI entrypoint."""
    export_mode = "--export-shell" in sys.argv
    quiet_mode = "--quiet" in sys.argv or "-q" in sys.argv

    ok, validated, notes = validate_environment(apply_fallbacks_to_os=True)

    if export_mode:
        for k, v in validated.items():
            val_str = "true" if v is True else ("false" if v is False else str(v))
            print(f'export {k}="{val_str}"')
        return 0 if ok else 1

    if not quiet_mode:
        print("=" * 60)
        print(" AI 3D Studio — Backend Environment Pre-Validation")
        print("=" * 60)
        for note in notes:
            print(f" {note}")
        print("-" * 60)
        print(f" Status: {'VALID (Ready for migrations & app start)' if ok else 'INVALID'}")
        print("=" * 60)

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
