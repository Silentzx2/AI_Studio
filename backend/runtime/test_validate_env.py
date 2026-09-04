"""Self-check test for backend/scripts/validate_env.py.

Verifies:
1. Fallback default values for missing / empty variables
2. Sanitization of DATABASE_URL (driver adaptation, Docker host removal outside Docker)
3. Sanitization of BACKEND_URL (Docker 'api' host fallback)
4. Type coercion for bools and ints

Run with:
    python3 backend/runtime/test_validate_env.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "backend" / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from validate_env import (
    parse_bool,
    parse_int,
    normalize_database_url,
    normalize_backend_url,
    validate_environment,
)


def test_parsing():
    # Boolean parsing
    assert parse_bool("true") is True
    assert parse_bool("1") is True
    assert parse_bool("dev") is True
    assert parse_bool("false") is False
    assert parse_bool("0") is False
    assert parse_bool("", default=True) is True
    assert parse_bool(None, default=False) is False

    # Integer parsing
    assert parse_int("8000") == 8000
    assert parse_int("", default=3000) == 3000
    assert parse_int("invalid", default=42) == 42


def test_normalization():
    # Database URL
    db1 = normalize_database_url("postgresql://ai_studio:ai_studio_dev@127.0.0.1:5432/ai_studio")
    assert "+asyncpg" in db1

    db_docker = normalize_database_url("postgresql://ai_studio:ai_studio_dev@postgres:5432/ai_studio")
    assert "127.0.0.1" in db_docker

    db_empty = normalize_database_url("")
    assert "+asyncpg" in db_empty
    assert "127.0.0.1" in db_empty

    # Backend URL
    assert normalize_backend_url("http://api:8000") == "http://127.0.0.1:8000"
    assert normalize_backend_url("http://localhost:8000/") == "http://localhost:8000"
    assert normalize_backend_url("") == "http://127.0.0.1:8000"


def test_validation_engine():
    # Save original environ
    old_env = dict(os.environ)
    try:
        # Clear critical vars
        for k in ["DATABASE_URL", "BACKEND_URL", "PORT", "DEBUG"]:
            os.environ[k] = ""

        ok, validated, notes = validate_environment(apply_fallbacks_to_os=True)
        assert validated["PORT"] == 8000
        assert validated["DEBUG"] is False
        assert "+asyncpg" in validated["DATABASE_URL"]
        assert validated["BACKEND_URL"] == "http://127.0.0.1:8000"
    finally:
        os.environ.clear()
        os.environ.update(old_env)


def main():
    test_parsing()
    test_normalization()
    test_validation_engine()
    print("validate_env self-check: PASS")


if __name__ == "__main__":
    main()
