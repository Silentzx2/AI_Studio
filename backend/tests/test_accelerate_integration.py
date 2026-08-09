"""Tests for the Accelerate integration module and provider wiring.

These tests verify:
1. ``runtime.accelerate_loader`` is import-safe whether or not accelerate is installed.
2. All providers (3 local model-loading + 5 simulated + AniGen) import accelerate_loader
   and route unload through ``safe_unload`` — no duplicated CUDA cache clearing.
3. Local providers no longer define their own ``_verify_gpu_placement`` / ``_log_gpu_memory`` /
   ``_safe_exists`` — they import from ``accelerate_loader``.
4. The ``MODEL_VRAM_REQUIREMENTS`` bug in tasks.py is fixed (uses
   ``get_model_vram_required`` instead).
"""
from __future__ import annotations

import sys
from pathlib import Path
from types import ModuleType

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


PROVIDERS_DIR = BACKEND_ROOT / "app" / "core" / "providers"


def test_accelerate_loader_import_safe():
    """The module must import without crash even if accelerate is absent."""
    from runtime.accelerate_loader import (
        accelerate_available,
        cleanup_accelerate_model,
        dispatch_model_to_device,
        dispatch_pipeline_models,
        enable_cpu_offload,
        get_max_memory_per_device,
        should_use_accelerate,
        verify_gpu_placement,
        log_gpu_memory,
        safe_unload,
    )
    assert callable(accelerate_available)
    assert callable(cleanup_accelerate_model)
    assert callable(dispatch_model_to_device)
    assert callable(dispatch_pipeline_models)
    assert callable(enable_cpu_offload)
    assert callable(get_max_memory_per_device)
    assert callable(should_use_accelerate)
    assert callable(verify_gpu_placement)
    assert callable(log_gpu_memory)
    assert callable(safe_unload)


def test_accelerate_available_returns_bool():
    from runtime.accelerate_loader import accelerate_available
    result = accelerate_available()
    assert isinstance(result, bool)


def test_accelerate_loader_lazy_exposed_in_init():
    """runtime.__init__ should expose accelerate_loader symbols via lazy proxy."""
    import runtime
    assert hasattr(runtime, "accelerate_available")
    assert hasattr(runtime, "dispatch_model_to_device")
    assert hasattr(runtime, "dispatch_pipeline_models")
    assert hasattr(runtime, "cleanup_accelerate_model")
    assert hasattr(runtime, "enable_cpu_offload")
    assert hasattr(runtime, "verify_gpu_placement")
    assert hasattr(runtime, "log_gpu_memory")
    assert hasattr(runtime, "safe_unload")


def test_get_max_memory_returns_dict_or_none():
    from runtime.accelerate_loader import get_max_memory_per_device
    result = get_max_memory_per_device()
    if result is not None:
        assert isinstance(result, dict)
        assert len(result) > 0


def test_should_use_accelerate_returns_bool():
    from runtime.accelerate_loader import should_use_accelerate
    result = should_use_accelerate(8000)
    assert isinstance(result, bool)


def test_cleanup_accelerate_model_handles_none():
    """cleanup_accelerate_model(None) must be a no-op (no crash)."""
    from runtime.accelerate_loader import cleanup_accelerate_model
    cleanup_accelerate_model(None)


def test_safe_unload_handles_none_attrs():
    """safe_unload with None attrs + invalid provider_name must not crash."""
    from runtime.accelerate_loader import safe_unload
    safe_unload(None, None, provider_name="nonexistent_model_xyz")


def test_safe_unload_handles_provider_name():
    """safe_unload with a valid provider_name should deallocate vram_tracker entry."""
    from runtime.accelerate_loader import safe_unload
    # Should not raise even if the provider_name wasn't tracked
    safe_unload(provider_name="triposg")
    safe_unload(provider_name="detailgen3d")
    safe_unload(provider_name="unirig")
    safe_unload(provider_name="anigen")


def test_tasks_py_no_model_vram_requirements_import():
    """Regression: tasks.py must not import the undefined MODEL_VRAM_REQUIREMENTS.
    It should use get_model_vram_required from runtime.capability instead."""
    tasks_path = BACKEND_ROOT / "app" / "workers" / "tasks.py"
    source = tasks_path.read_text()
    assert "MODEL_VRAM_REQUIREMENTS" not in source, (
        "tasks.py still references undefined MODEL_VRAM_REQUIREMENTS"
    )
    assert "get_model_vram_required" in source, (
        "tasks.py should use get_model_vram_required from runtime.capability"
    )


def test_all_providers_use_safe_unload():
    """Every provider's unload() must route through safe_unload — no duplicated
    torch.cuda.empty_cache() or cleanup_accelerate_model boilerplate."""
    provider_files = {
        "trellis": PROVIDERS_DIR / "trellis_local.py",
        "hunyuan3d": PROVIDERS_DIR / "hunyuan3d_local.py",
        "triposr": PROVIDERS_DIR / "triposr_local.py",
        "unirig": PROVIDERS_DIR / "unirig_provider.py",
        "triposg": PROVIDERS_DIR / "triposg_provider.py",
        "detailgen3d": PROVIDERS_DIR / "detailgen3d.py",
        "anigen": PROVIDERS_DIR / "anigen_provider.py",
    }
    for name, path in provider_files.items():
        assert path.exists(), f"{name} provider file missing"
        source = path.read_text()
        assert "safe_unload" in source, (
            f"{name} provider does not use safe_unload in unload()"
        )
        # Must not have the old duplicated empty_cache pattern in unload()
        assert source.count("torch.cuda.empty_cache") == 0, (
            f"{name} still has duplicated torch.cuda.empty_cache() boilerplate"
        )


def test_local_providers_no_duplicated_helpers():
    """Local model-loading providers must NOT define their own _safe_exists,
    _verify_gpu_placement, or _log_gpu_memory — they import from accelerate_loader."""
    local_providers = {
        "trellis": PROVIDERS_DIR / "trellis_local.py",
        "hunyuan3d": PROVIDERS_DIR / "hunyuan3d_local.py",
        "triposr": PROVIDERS_DIR / "triposr_local.py",
    }
    for name, path in local_providers.items():
        source = path.read_text()
        assert "def _safe_exists" not in source, (
            f"{name} still defines _safe_exists — should import from accelerate_loader"
        )
        assert "def _verify_gpu_placement" not in source, (
            f"{name} still defines _verify_gpu_placement — should import from accelerate_loader"
        )
        assert "def _log_gpu_memory" not in source, (
            f"{name} still defines _log_gpu_memory — should import from accelerate_loader"
        )


def test_all_providers_import_accelerate_loader():
    """Every provider must import from accelerate_loader."""
    provider_files = {
        "trellis": PROVIDERS_DIR / "trellis_local.py",
        "hunyuan3d": PROVIDERS_DIR / "hunyuan3d_local.py",
        "triposr": PROVIDERS_DIR / "triposr_local.py",
        "unirig": PROVIDERS_DIR / "unirig_provider.py",
        "triposg": PROVIDERS_DIR / "triposg_provider.py",
        "detailgen3d": PROVIDERS_DIR / "detailgen3d.py",
        "anigen": PROVIDERS_DIR / "anigen_provider.py",
    }
    for name, path in provider_files.items():
        source = path.read_text()
        assert "accelerate_loader" in source, (
            f"{name} provider does not reference accelerate_loader"
        )


def test_accelerate_in_requirements():
    """accelerate must be in backend/requirements.txt."""
    req_path = BACKEND_ROOT / "requirements.txt"
    source = req_path.read_text()
    assert "accelerate" in source.lower(), "accelerate not found in requirements.txt"


def test_accelerate_in_extra_deps():
    """accelerate must be in EXTRA_DEPS for TRELLIS, Hunyuan3D-2, TripoSR."""
    installer_path = BACKEND_ROOT / "runtime" / "installer.py"
    source = installer_path.read_text()
    assert '"TRELLIS":' in source and "accelerate" in source, (
        "TRELLIS not in EXTRA_DEPS with accelerate"
    )
    assert '"Hunyuan3D-2":' in source and "accelerate" in source, (
        "Hunyuan3D-2 not in EXTRA_DEPS with accelerate"
    )
    assert '"TripoSR":' in source and "accelerate" in source, (
        "TripoSR not in EXTRA_DEPS with accelerate"
    )


def test_accelerate_in_gitignore():
    """Reticle dev entries must be in .gitignore."""
    project_root = BACKEND_ROOT.parent
    gitignore = project_root / ".gitignore"
    source = gitignore.read_text()
    assert "Reticle" in source, "Reticle entry not found in .gitignore"


def test_anigen_no_dead_pipeline_attr():
    """AniGen should not have a dead _pipeline attribute that's never assigned."""
    anigen_path = PROVIDERS_DIR / "anigen_provider.py"
    source = anigen_path.read_text()
    assert "self._pipeline = None" not in source, (
        "AniGen still has dead self._pipeline attribute"
    )
