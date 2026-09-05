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

# 3. Test accelerate available resilience
from backend.runtime.accelerate_loader import accelerate_available
res = accelerate_available()
assert isinstance(res, bool), "accelerate_available should return a boolean"

print("All self-checks PASSED successfully!")
