"""Runnable self-check verifying latency optimizations for critical endpoints."""
import asyncio
import sys
import time
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))


async def main():
    # 1. Storage Manager lookup and path operations
    from app.core.storage import get_storage_manager
    storage = get_storage_manager()
    p1 = storage.get_model_path("test_job", "model.glb")
    t0 = time.perf_counter()
    p2 = storage.get_model_path("test_job", "model.glb")
    t_cache = (time.perf_counter() - t0) * 1000
    assert p1 == p2, "Storage path mismatch"
    assert t_cache < 5.0, f"Storage lookup exceeded 5ms ({t_cache:.2f}ms)"

    # 2. Health endpoint caching and fast response
    from app.api.v1.health import health
    res1 = await health()
    assert res1.status in ("ok", "degraded"), f"Health check returned unexpected status: {res1.status}"
    t0 = time.perf_counter()
    res2 = await health()
    t_health = (time.perf_counter() - t0) * 1000
    assert res2.status in ("ok", "degraded"), "Cached health check returned unexpected status"
    assert t_health < 5.0, f"Cached health check exceeded 5ms ({t_health:.2f}ms)"

    # 3. Model listing endpoint latency
    from app.api.v1.models import list_all_models
    m1 = await list_all_models()
    assert m1.count > 0, f"list_all_models empty: {m1}"
    t0 = time.perf_counter()
    m2 = await list_all_models()
    t_models = (time.perf_counter() - t0) * 1000
    assert m2.count == m1.count, "Cached list_all_models count mismatch"
    assert t_models < 5.0, f"list_all_models exceeded 5ms ({t_models:.2f}ms)"

    # 4. Runtime health
    from app.api.v1.runtime import runtime_health
    rh1 = await runtime_health()
    assert "comfyui" in rh1, "runtime_health missing comfyui key"
    t0 = time.perf_counter()
    rh2 = await runtime_health()
    t_rh = (time.perf_counter() - t0) * 1000
    assert t_rh < 10.0, f"runtime_health exceeded 10ms ({t_rh:.2f}ms)"

    from app.core import get_comfyui_client
    await get_comfyui_client().close()

    print(f"Latency self-check PASSED: health={t_health:.4f}ms, models={t_models:.4f}ms, runtime={t_rh:.4f}ms, storage={t_cache:.4f}ms")


if __name__ == "__main__":
    asyncio.run(main())
