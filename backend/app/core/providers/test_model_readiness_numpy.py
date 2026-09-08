"""Self-check for numpy legacy bridge, overlay cache, and weight gating."""
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parents[4]
backend_dir = root_dir / "backend"
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from backend.app.core.providers.base import (
    _patch_numpy_legacy_aliases,
    _fix_overlay_packages,
    _VERIFIED_OVERLAYS,
)

def test_model_readiness_numpy() -> None:
    # 1. Test numpy patch
    _patch_numpy_legacy_aliases()
    import numpy._core as np_core
    assert hasattr(np_core, "multiarray"), "numpy._core missing multiarray"
    from numpy._core import multiarray
    assert hasattr(multiarray, "_reconstruct"), "multiarray missing _reconstruct"

    # 2. Test overlay cache
    _VERIFIED_OVERLAYS.add("test_repo")
    assert _fix_overlay_packages("test_repo") is True, "Overlay cache should return True immediately"
    _VERIFIED_OVERLAYS.remove("test_repo")

    # 4. Test auxiliary weight path resolution
    from backend.runtime.storage import get_storage_config
    storage = get_storage_config()
    test_aux = storage.third_party_dir / 'briaai/RMBG-1.4/weights/briaai/RMBG-1.4'
    test_aux.mkdir(parents=True, exist_ok=True)
    (test_aux / 'model.onnx').write_bytes(b'dummy onnx data')
    try:
        found_full = storage.get_weight_path('briaai/RMBG-1.4')
        assert found_full is not None, "Failed to resolve briaai/RMBG-1.4"
        found_short = storage.get_weight_path('RMBG-1.4')
        assert found_short is not None, "Failed to resolve RMBG-1.4"
    finally:
        import shutil
        shutil.rmtree(str(storage.third_party_dir / 'briaai'), ignore_errors=True)

    # 5. Test preflight smoke code path injection
    from backend.runtime.preflight import _resolve_smoke_code
    smoke = _resolve_smoke_code("triposg", "from triposg.pipelines import foo\nprint('ok')")
    assert "sys.path" in smoke and "TripoSG" in smoke, "Smoke code must inject TripoSG repo path"

    # 6. Test hunyuan3d-2-mini weight path resolution
    test_hy_mini = storage.third_party_dir / 'Hunyuan3D-2mini/weights/hunyuan3d-2-mini'
    test_hy_mini.mkdir(parents=True, exist_ok=True)
    (test_hy_mini / 'model.safetensors').write_bytes(b'dummy')
    try:
        hy_path = storage.get_weight_path('tencent/Hunyuan3D-2mini')
        assert hy_path is not None and str(hy_path).endswith('weights/hunyuan3d-2-mini'), f"Failed to resolve hunyuan3d-2-mini: {hy_path}"
        hy_smoke = _resolve_smoke_code("hunyuan3d-2-mini", "from hy3dgen import foo\nprint('ok')")
        assert "sys.path" in hy_smoke and "Hunyuan3D-2mini" in hy_smoke, "Smoke code must inject Hunyuan3D-2mini repo path"
    finally:
        import shutil
        shutil.rmtree(str(storage.third_party_dir / 'Hunyuan3D-2mini/weights'), ignore_errors=True)

    # 7. Test model_env resolver and single source of truth
    from backend.runtime.model_env import (
        resolve_model_env,
        apply_numpy_bridge,
        get_numpy_bridge_code,
        is_resource_error,
    )
    for p in ("hunyuan3d-2.1", "hunyuan3d-2-mini", "trellis", "triposg", "detailgen3d"):
        env = resolve_model_env(p)
        assert env is not None, f"resolve_model_env failed for {p}"
        assert env.provider_name == p
        assert env.repo_name != ""
        assert len(env.sys_path_entries) >= 2

    # 8. Test unified error classification
    assert is_resource_error("CUDA out of memory") is True
    assert is_resource_error("RuntimeError: cuinit error") is True
    assert is_resource_error("Torch not compiled with CUDA") is True
    assert is_resource_error("KeyError: 'foo'") is False
    assert is_resource_error("ValueError: invalid shape") is False

    # 9. Test triposg smoke test is defined in _PROVIDER_SMOKE_TESTS
    from backend.runtime.preflight import _PROVIDER_SMOKE_TESTS
    assert "triposg" in _PROVIDER_SMOKE_TESTS, "triposg must have a smoke test in _PROVIDER_SMOKE_TESTS"

    # 10. Test tasks.py _is_oom_error delegates to is_resource_error
    try:
        from backend.app.workers.tasks import _is_oom_error
        assert _is_oom_error(RuntimeError("CUDA out of memory")) is True
        assert _is_oom_error(Exception("normal failure")) is False
    except ModuleNotFoundError:
        assert is_resource_error(str(RuntimeError("CUDA out of memory"))) is True
        assert is_resource_error(str(Exception("normal failure"))) is False

    print("All self-checks PASSED successfully!")


if __name__ == "__main__":
    test_model_readiness_numpy()
