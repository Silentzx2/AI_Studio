"""Regression tests for runtime stability fixes."""
import pytest
from unittest.mock import MagicMock
from runtime.installer import HF_MODELS
from runtime.dependency_resolver import normalize_py312_pin
from app.core.providers.hunyuan3d_local import _load_paint_pipeline_compat
from app.core.providers.base import _SHARED_PKGS
from runtime.model_env import get_numpy_bridge_code


def test_auxiliary_weights_in_hf_models():
    """Verify auxiliary weights (like RMBG-1.4) are present in installer HF_MODELS."""
    assert "RMBG-1.4" in HF_MODELS or "briaai/RMBG-1.4" in HF_MODELS
    entry = HF_MODELS.get("RMBG-1.4") or HF_MODELS.get("briaai/RMBG-1.4")
    assert entry is not None
    assert "briaai/RMBG-1.4" in entry.get("repo", "")


def test_manifest_pin_rewrites_apply_on_py_lt_312():
    """Verify manifest python_pin_rewrites are honored regardless of Python version."""
    manifest = {
        "environment": {
            "python_pin_rewrites": [
                {"pattern": r"^numpy==1\.22\..*$", "replacement": "numpy>=1.26.4,<2.0"},
                {"pattern": r"^drop_me.*$", "replacement": None},
            ]
        }
    }
    # Test with py_ver='3.10'
    res = normalize_py312_pin("numpy==1.22.4", py_ver="3.10", manifest=manifest)
    assert res == "numpy>=1.26.4,<2.0"

    # Test drop
    res_drop = normalize_py312_pin("drop_me==1.0", py_ver="3.10", manifest=manifest)
    assert res_drop is None


def test_load_paint_pipeline_compat_device_kwarg_fallback():
    """Verify _load_paint_pipeline_compat falls back when from_pretrained doesn't accept device."""
    class MockPipelineWithDevice:
        @classmethod
        def from_pretrained(cls, path, device=None):
            m = MagicMock()
            m.device = device
            return m

    class MockPipelineWithoutDevice:
        @classmethod
        def from_pretrained(cls, path, **kwargs):
            if "device" in kwargs:
                raise TypeError("got an unexpected keyword argument 'device'")
            m = MagicMock()
            m.device = None
            m.to = MagicMock(return_value=m)
            return m

    # 1. Accepts device kwarg
    res1 = _load_paint_pipeline_compat(MockPipelineWithDevice, "dummy/path", "cuda")
    assert res1.device == "cuda"

    # 2. Rejects device kwarg, falls back to .to(device)
    res2 = _load_paint_pipeline_compat(MockPipelineWithoutDevice, "dummy/path", "cuda")
    res2.to.assert_called_once_with("cuda")


def test_numpy_bridge_code_guards_numpy_2():
    """Verify _NUMPY_BRIDGE_CODE checks numpy version < 2 before aliasing numpy._core."""
    bridge_code = get_numpy_bridge_code()
    assert "int(_np.__version__.split('.')[0]) < 2" in bridge_code


def test_pydantic_not_in_shared_pkgs():
    """Verify pydantic is not purged from sys.modules during model environment setup."""
    assert "pydantic" not in _SHARED_PKGS
    assert "pydantic_core" not in _SHARED_PKGS


def test_canonical_runtime_provider_name():
    """Verify canonical_runtime_provider_name normalizes aliases and casing."""
    from app.core.providers.registry import canonical_runtime_provider_name

    assert canonical_runtime_provider_name("TripoSG") == "triposg"
    assert canonical_runtime_provider_name("triposg") == "triposg"
    assert canonical_runtime_provider_name("TRELLIS") == "trellis"
    assert canonical_runtime_provider_name("Hunyuan3D-2mini") == "hunyuan3d-2-mini"
    assert canonical_runtime_provider_name("Hunyuan3D-2.1") == "hunyuan3d-2.1"
    assert canonical_runtime_provider_name("DetailGen3D") == "detailgen3d"
    assert canonical_runtime_provider_name("hunyuan3d") == "hunyuan3d-2.1"
    assert canonical_runtime_provider_name("hunyuan3d-1.0") == "hunyuan3d-2.1"
    assert canonical_runtime_provider_name("Mock") == "mock"


@pytest.mark.asyncio
async def test_get_best_provider_name_casing_handling(monkeypatch):
    """Verify engine.get_best_provider_name correctly handles casing without false fallback."""
    from runtime.engine import RuntimeEngine
    from runtime.gpu import GPUInfo

    engine = RuntimeEngine()
    # Mock GPU as having 16GB free VRAM
    fake_gpu = GPUInfo(
        available=True,
        device_count=1,
        devices=[{"index": 0, "name": "Tesla T4", "vram_mb": 15360, "free_vram_mb": 14705}],
        total_vram_mb=15360,
        free_vram_mb=14705,
        cuda_version="12.8",
        driver_version="580.82.07",
    )
    monkeypatch.setattr("runtime.gpu.get_gpu_info", lambda: fake_gpu)
    monkeypatch.setattr("runtime.engine.get_gpu_info", lambda: fake_gpu)
    monkeypatch.setattr(engine, "_check_provider_available", lambda name: True)

    # TripoSG requested with mixed case must resolve to triposg without falling back to hunyuan3d-2.1
    best = await engine.get_best_provider_name("TripoSG", mode="image-to-3d")
    assert best == "triposg"

    best_mini = await engine.get_best_provider_name("Hunyuan3D-2mini", mode="image-to-3d")
    assert best_mini == "hunyuan3d-2-mini"


def test_runtime_prewarm_endpoint(monkeypatch):
    """Verify /runtime/prewarm accepts models and schedules background loading."""
    from fastapi.testclient import TestClient
    from app.main import app
    from runtime.engine import get_engine

    client = TestClient(app)
    engine = get_engine()
    engine._loaded["triposg"] = object()

    # Prewarm an already warm model
    res = client.post("/api/v1/runtime/prewarm", json={"model": "TripoSG"})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["data"]["status"] == "already_warm"
    assert data["data"]["model"] == "triposg"


