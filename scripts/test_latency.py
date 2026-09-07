"""Runnable self-check verifying latency optimizations for critical endpoints."""
import asyncio
import sys
import time
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))


async def main():
    # 1. Storage weight lookup caching
    from runtime.storage import get_storage_config
    storage = get_storage_config()
    p1 = storage.get_weight_path("triposg")
    t0 = time.perf_counter()
    p2 = storage.get_weight_path("triposg")
    t_cache = (time.perf_counter() - t0) * 1000
    assert p1 == p2, "Storage cache mismatch"
    assert t_cache < 5.0, f"Cached weight lookup exceeded 5ms ({t_cache:.2f}ms)"

    # 2. Health endpoint caching and fast fail
    from app.api.v1.health import health
    res1 = await health()
    assert res1.get("success") is True, f"Health check returned error: {res1}"
    t0 = time.perf_counter()
    res2 = await health()
    t_health = (time.perf_counter() - t0) * 1000
    assert res2.get("success") is True, "Cached health check returned error"
    assert t_health < 5.0, f"Cached health check exceeded 5ms ({t_health:.2f}ms)"

    # 3. Admin list_models
    from app.api.v1.admin import list_models
    m1 = await list_models()
    assert m1.get("success") is True, f"list_models failed: {m1}"
    t0 = time.perf_counter()
    m2 = await list_models()
    t_models = (time.perf_counter() - t0) * 1000
    assert m2.get("success") is True, "Cached list_models failed"
    assert t_models < 5.0, f"Cached list_models exceeded 5ms ({t_models:.2f}ms)"

    # 4. Runtime health caching
    from runtime.health import RuntimeHealth
    h1 = await RuntimeHealth.check_all()
    assert "gpu" in h1 and "blender" in h1, "RuntimeHealth missing keys"
    t0 = time.perf_counter()
    h2 = await RuntimeHealth.check_all()
    t_rh = (time.perf_counter() - t0) * 1000
    assert t_rh < 5.0, f"Cached RuntimeHealth exceeded 5ms ({t_rh:.2f}ms)"

    print(f"Latency self-check PASSED: health={t_health:.4f}ms, models={t_models:.4f}ms, runtime={t_rh:.4f}ms, storage={t_cache:.4f}ms")


if __name__ == "__main__":
    asyncio.run(main())
