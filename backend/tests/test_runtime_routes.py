from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _make_runtime_fakes(monkeypatch: pytest.MonkeyPatch) -> None:
    runtime_pkg = types.ModuleType("runtime")
    runtime_pkg.__path__ = []  # type: ignore[attr-defined]

    engine_mod = types.ModuleType("runtime.engine")
    engine_mod.get_engine = lambda: SimpleNamespace(health=lambda: {"initialized": True})

    health_mod = types.ModuleType("runtime.health")

    class _RuntimeHealth:
        @staticmethod
        async def check_all():
            return {"cuda": {"available": True}}

    health_mod.RuntimeHealth = _RuntimeHealth

    storage_mod = types.ModuleType("runtime.storage")

    class _Storage:
        def get_disk_usage(self):
            return {"used_gb": 1, "free_gb": 99}

    storage_mod.get_storage_config = lambda: _Storage()

    gpu_mod = types.ModuleType("runtime.gpu")

    class _Gpu:
        available = True
        device_count = 1
        devices = [{"index": 0, "name": "GPU", "vram_mb": 24576, "free_vram_mb": 20480}]
        total_vram_mb = 24576
        free_vram_mb = 20480
        cuda_version = "12.4"

    gpu_mod.get_gpu_info = lambda: _Gpu()

    monkeypatch.setitem(sys.modules, "runtime", runtime_pkg)
    monkeypatch.setitem(sys.modules, "runtime.engine", engine_mod)
    monkeypatch.setitem(sys.modules, "runtime.health", health_mod)
    monkeypatch.setitem(sys.modules, "runtime.storage", storage_mod)
    monkeypatch.setitem(sys.modules, "runtime.gpu", gpu_mod)


def _load_runtime_module():
    module_path = BACKEND_ROOT / "app" / "api" / "v1" / "runtime.py"
    spec = importlib.util.spec_from_file_location("runtime_api_test", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load runtime module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_runtime_root_and_health_routes_are_registered() -> None:
    runtime_module = _load_runtime_module()

    app = FastAPI()
    app.include_router(runtime_module.router, prefix="/api/v1/runtime")

    paths = set(app.openapi()["paths"].keys())
    assert "/api/v1/runtime" in paths
    assert "/api/v1/runtime/status" in paths
    assert "/api/v1/runtime/providers/health" in paths


def test_runtime_root_and_provider_health_return_data(monkeypatch: pytest.MonkeyPatch) -> None:
    _make_runtime_fakes(monkeypatch)

    from app.core.providers import registry as registry_module

    class _Registry:
        def list_providers(self):
            return ["hunyuan3d-2.1", "triposr"]

        def get_all_availability(self):
            return {
                "hunyuan3d-2.1": {"available": True, "loaded": True},
                "triposr": {"available": False, "loaded": False},
            }

        def get_availability(self, name: str):
            return self.get_all_availability()[name]

    monkeypatch.setattr(registry_module, "get_registry", lambda: _Registry())

    class _Inspect:
        def stats(self):
            return {"worker-a": {"pid": 1}}

    class _Control:
        def inspect(self, timeout: float = 1.0):
            return _Inspect()

    monkeypatch.setitem(
        sys.modules,
        "app.workers.celery_app",
        types.ModuleType("app.workers.celery_app"),
    )
    sys.modules["app.workers.celery_app"].celery_app = SimpleNamespace(control=_Control())

    runtime_module = _load_runtime_module()

    app = FastAPI()
    app.include_router(runtime_module.router, prefix="/api/v1/runtime")

    client = TestClient(app)

    root_response = client.get("/api/v1/runtime")
    assert root_response.status_code == 200
    root_json = root_response.json()
    assert root_json["success"] is True
    assert root_json["data"]["providers"]["hunyuan3d-2.1"]["available"] is True

    health_response = client.get("/api/v1/runtime/providers/health")
    assert health_response.status_code == 200
    health_json = health_response.json()
    assert health_json["success"] is True
    assert health_json["data"]["healthy"] is True
