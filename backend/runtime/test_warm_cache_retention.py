import asyncio
import time
import pytest
from unittest.mock import MagicMock
from runtime.engine import RuntimeEngine
from PIL import Image


@pytest.mark.asyncio
async def test_warm_cache_retention_and_model_swap():
    engine = RuntimeEngine()
    engine._initialized = True

    # Mock providers
    provider_a = MagicMock()
    provider_a.unload = MagicMock()
    provider_b = MagicMock()
    provider_b.unload = MagicMock()

    # Inject mock factory
    engine._loaded["mock-a"] = provider_a
    engine._loaded_modes["mock-a"] = "normal"
    engine.touch_provider("mock-a")
    engine.gpu.acquire("mock-a")

    # 1. Consecutive request with same provider -> reuse cached instance
    res = await engine.load_provider("mock-a", vram_mode="normal")
    assert res is provider_a
    assert "mock-a" in engine._loaded
    assert not provider_a.unload.called

    # 2. Swap to different provider -> unloads mock-a first
    import runtime.engine as engine_module
    orig_instantiate = engine_module._instantiate_provider
    try:
        engine_module._instantiate_provider = lambda name, dev, low_vram: provider_b
        res_b = await engine.load_provider("mock-b", vram_mode="normal")
        assert res_b is provider_b
        assert "mock-a" not in engine._loaded
        assert "mock-b" in engine._loaded
        assert provider_a.unload.called
    finally:
        engine_module._instantiate_provider = orig_instantiate

    # 3. Test expiration TTL
    engine._last_used["mock-b"] = time.time() - 350.0  # simulated > 300s idle
    unloaded = await engine.unload_expired_providers(max_age_seconds=300.0)
    assert "mock-b" in unloaded
    assert "mock-b" not in engine._loaded
    assert provider_b.unload.called


def test_image_transparency_detection():
    import io
    # RGBA with transparency
    img_transparent = Image.new("RGBA", (10, 10), (255, 0, 0, 0))
    extrema = img_transparent.getextrema()
    assert extrema[3][0] < 240

    # RGBA fully opaque
    img_opaque = Image.new("RGBA", (10, 10), (255, 0, 0, 255))
    extrema_opaque = img_opaque.getextrema()
    assert extrema_opaque[3][0] == 255

    # WebP with transparency
    buf_webp = io.BytesIO()
    img_transparent.save(buf_webp, format="WEBP")
    buf_webp.seek(0)
    loaded_webp = Image.open(buf_webp)
    assert loaded_webp.format == "WEBP"
    if loaded_webp.mode not in ("RGBA", "RGB"):
        loaded_webp = loaded_webp.convert("RGBA")
    assert loaded_webp.getextrema()[3][0] < 240
