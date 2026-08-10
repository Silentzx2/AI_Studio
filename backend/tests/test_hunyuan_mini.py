"""Tests for Hunyuan3D-2 Mini integration.

Verifies the honesty + wiring guarantees:
1. Metadata advertises image-to-3d ONLY (no text-to-3d) and sane VRAM.
2. Engine routing never selects the mini for text-to-3d, and does for image-to-3d.
3. Provider is registered in the engine map.
4. `_has_real_weight_files` detects the nested `hunyuan3d-dit-v2-mini/` snapshot
   layout recursively but not via the flat (shared-root) fallback.
5. `_load_model_with_accelerate` forwards the `subfolder` to from_pretrained.
"""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from runtime.installer import PROVIDER_METADATA
from runtime.storage import StorageConfig


def test_mini_metadata_is_image_to_3d_only():
    meta = PROVIDER_METADATA["hunyuan3d-2-mini"]
    assert meta["supports_text_to_3d"] is False
    assert meta["supports_image_to_3d"] is True
    assert meta["vram_required_mb"] > 0
    assert meta["weight_key"] == "hunyuan3d-2-mini"
    assert meta["repo"] == "Hunyuan3D-2"


def test_mini_routing_modes():
    from runtime.engine import PROVIDER_MODES
    modes = PROVIDER_MODES["hunyuan3d-2-mini"]
    assert "text-to-3d" not in modes
    assert "image-to-3d" in modes


def test_mini_provider_registered_in_engine():
    from runtime.engine import _PROVIDER_MAP, PROVIDER_PRIORITY
    module, cls = _PROVIDER_MAP["hunyuan3d-2-mini"]
    assert module == "app.core.providers.hunyuan3d_local"
    assert cls == "Hunyuan3D2MiniLocalProvider"
    assert "hunyuan3d-2-mini" in PROVIDER_PRIORITY


def test_has_real_weight_files_nested_layout(tmp_path):
    storage = StorageConfig()
    mini = tmp_path / "hunyuan3d-2-mini"
    (mini / "hunyuan3d-dit-v2-mini").mkdir(parents=True)
    (mini / "hunyuan3d-dit-v2-mini" / "model.fp16.safetensors").write_bytes(b"x")
    # nested snapshot must be detected recursively ...
    assert storage._has_real_weight_files(mini) is True
    # ... but must NOT be claimed via the flat shared-root check
    assert storage._has_real_weight_files(mini, recursive=False) is False
    # empty dirs / hidden offload folders stay invisible
    assert storage._has_real_weight_files(tmp_path / "empty") is False


def test_load_model_forwards_subfolder(monkeypatch):
    from app.core.providers.hunyuan3d_local import Hunyuan3D2MiniLocalProvider

    calls: list[dict] = []

    class _FakePipeline:
        @classmethod
        def from_pretrained(cls, path: str, **kwargs):
            calls.append({"path": path, "kwargs": kwargs})
            return SimpleNamespace()

    # Force the native (non-accelerate) load path so no torch stack is needed.
    import runtime.accelerate_loader as al
    monkeypatch.setattr(al, "accelerate_available", lambda: False)
    monkeypatch.setattr(al, "should_use_accelerate", lambda *a, **k: False)

    provider = Hunyuan3D2MiniLocalProvider(device="cpu")
    provider._load_model_with_accelerate(_FakePipeline, "hunyuan3d-2-mini", subfolder="hunyuan3d-dit-v2-mini")

    assert len(calls) == 1
    assert calls[0]["kwargs"]["subfolder"] == "hunyuan3d-dit-v2-mini"
