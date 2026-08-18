from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Mock celery and other heavy deps before any worker imports
import types as _types
from unittest.mock import MagicMock

for _mod_name in [
    "celery", "celery.app", "celery.shared_task",
    "pydantic_settings", "pydantic",
    "redis", "sqlalchemy", "sqlalchemy.orm", "sqlalchemy.ext", "sqlalchemy.ext.asyncio",
]:
    if _mod_name not in sys.modules:
        _mod = MagicMock()
        _mod.__path__ = []  # type: ignore[attr-defined]
        sys.modules[_mod_name] = _mod

sys.modules["celery"].Celery = MagicMock
sys.modules["celery.shared_task"] = MagicMock


def _fake_preflight_result(passed=True, checks=None, error_detail=None):
    result = MagicMock()
    result.passed = passed
    result.checks = checks or {}
    result.error_detail = error_detail
    return result


class TestPreflightManifestWeightKeyAuthority:
    """Preflight must read weight_key from manifest weights.primary.repo first."""

    def test_manifest_weight_key_over_metadata(self):
        manifest = {
            "weights": {
                "primary": {
                    "repo": "manifest-weight-id"
                }
            }
        }
        metadata_weight_key = "metadata-weight-id"

        weight_key = None
        if manifest and "weights" in manifest and "primary" in manifest["weights"]:
            weight_key = manifest["weights"]["primary"].get("repo")
        if not weight_key:
            weight_key = metadata_weight_key

        assert weight_key == "manifest-weight-id"

    def test_metadata_fallback_when_no_manifest_weights(self):
        manifest = {}
        metadata_weight_key = "metadata-weight-id"

        weight_key = None
        if manifest and "weights" in manifest and "primary" in manifest["weights"]:
            weight_key = manifest["weights"]["primary"].get("repo")
        if not weight_key:
            weight_key = metadata_weight_key

        assert weight_key == "metadata-weight-id"


class TestNativeBuildAutoPreflight:
    """After native_build_complete, worker must auto-run preflight and persist final state."""

    def test_worker_imports_run_provider_preflight(self):
        source = open(BACKEND_ROOT / "app" / "workers" / "installation_workers.py").read()
        assert "from runtime.preflight import run_provider_preflight" in source

    def test_native_build_calls_preflight_and_get_install_status(self):
        source = open(BACKEND_ROOT / "app" / "workers" / "installation_workers.py").read()
        # After native build success, must call preflight
        assert "run_provider_preflight(canonical_name)" in source
        # Must compute final state from get_install_status
        assert "get_install_status()" in source
        # Must persist preflight_passed
        assert '"preflight_passed": preflight_result.passed' in source
        # Must persist overall_state
        assert '"overall_state": final_state' in source
        # Must not return native_build_complete as final state
        assert '"state": "native_build_complete"' not in source.split("run_provider_preflight")[1]


class TestDBOverrideRemoved:
    """get_install_status must not resurrect stale DB READY over live checks."""

    def test_no_db_ready_override_when_live_blocked(self):
        from runtime.installer import get_install_status

        mock_manifest = {
            "hardware": {"minimum_vram_mb": 8000},
            "dependencies": {},
            "capabilities": {"shape": {"native_build_required": False}},
        }
        mock_meta = {"repo": "test-repo", "vram_required_mb": 8000}

        fake_db_state = {
            "overall_state": "ready",
            "preflight_passed": True,
            "last_preflight_result": {"passed": True, "checks": {}},
        }

        fake_repo_path = MagicMock()
        fake_repo_path.exists.return_value = True
        fake_repo_path.__truediv__ = MagicMock(return_value=MagicMock(exists=MagicMock(return_value=True)))

        fake_venv_python = MagicMock()
        fake_venv_python.exists.return_value = True

        fake_weight_path = MagicMock()
        fake_weight_path.__bool__ = MagicMock(return_value=False)

        with patch("runtime.installer.load_provider_state_from_db", return_value=fake_db_state), \
             patch("runtime.manifest_loader.load_manifest", return_value=mock_manifest), \
             patch("runtime.installer.PROVIDER_METADATA", {"test-repo": mock_meta}), \
             patch("runtime.installer._check_cuda_status", return_value=("blocked", None)), \
             patch("runtime.installer._check_vram_status", return_value=("blocked", 0)), \
             patch("runtime.installer._check_auxiliary_weights", return_value=[]), \
             patch("runtime.installer._build_capability_states", return_value={}), \
             patch("runtime.storage.get_storage_config") as mock_storage:

            mock_storage.return_value.get_repo_path.return_value = fake_repo_path
            mock_storage.return_value.get_weight_path.return_value = fake_weight_path
            mock_storage.return_value.get_model_venv_path.return_value = MagicMock(
                __truediv__=MagicMock(return_value=fake_venv_python)
            )

            status = get_install_status()
            assert status["test-repo"]["state"] != "ready"
            assert status["test-repo"]["source"] == "live"
