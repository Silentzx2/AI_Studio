from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.core.registry.model_registry as model_registry

PIPELINES_MODULE = BACKEND_ROOT / "app" / "api" / "v1" / "pipelines.py"


def _load_pipelines():
    spec = importlib.util.spec_from_file_location("pipelines_regress_test", PIPELINES_MODULE)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_provider_manifests_no_nameerror():
    """Regression: _vram() referenced an undefined `meta` -> NameError on every
    _fetch_provider_manifests() call, 500ing workspace-models/pipelines and
    making the frontend fall back to its 2-model LOCAL_MODELS list."""
    reg = model_registry.ModelRegistry.__new__(model_registry.ModelRegistry)
    manifests = reg._fetch_provider_manifests()
    ids = {m["id"] for m in manifests}
    # triposg/triposf/unirig/holopart are real providers and must stay visible.
    assert {"triposg", "triposf", "unirig", "holopart"} <= ids
    assert all(m["vram_required_mb"] >= 0 for m in manifests)


def test_workspace_mesh_returns_all_compatible_models(monkeypatch):
    """Mesh-generation must expose all 6 compatible models (not just the
    frontend's 2-model offline fallback)."""
    reg = model_registry.ModelRegistry.__new__(model_registry.ModelRegistry)
    available = reg._fetch_provider_manifests()

    from app.core.capability_matrix import build_pipeline_snapshot, filter_by_workspace

    compat = filter_by_workspace(available, "mesh-generation")
    snap = build_pipeline_snapshot(compat)
    ids = {m["id"] for m in snap["pipelines"]}
    assert ids == {"hunyuan3d-2.1", "hunyuan3d-2", "trellis", "triposr", "triposg", "triposf"}


def test_overlay_install_state_uses_disk_truth(monkeypatch):
    """Installed-on-disk models must surface as installed/ready even though the
    DB installed_models table is empty (installs go through runtime.installer)."""
    pipelines = _load_pipelines()
    merged = {
        "triposr": {"id": "triposr", "installed": False, "status": "not_installed"},
        "hunyuan3d-2.1": {"id": "hunyuan3d-2.1", "installed": False, "status": "not_installed"},
    }
    fake_status = {
        "triposr": {
            "installed": True, "repo_ready": True, "weights_ready": True,
            "metadata": {"category": "3d_generation", "label": "TripoSR",
                         "workspace_compatibility": ["mesh-generation"]},
        },
    }

    import runtime.installer as installer_mod
    monkeypatch.setattr(installer_mod, "get_install_status", lambda: fake_status)

    out = pipelines._overlay_install_state(dict(merged))
    assert out["triposr"]["installed"] is True
    assert out["triposr"]["status"] == "ready"
    assert out["hunyuan3d-2.1"]["installed"] is False
    assert out["hunyuan3d-2.1"]["status"] == "not_installed"