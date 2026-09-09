"""Regression test ensuring run_native_build task is defined and importable."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def test_run_native_build_task_exists():
    from app.workers.installation_workers import run_native_build

    assert callable(run_native_build)
    assert hasattr(run_native_build, "apply_async")
    assert run_native_build.name == "app.workers.installation_workers.run_native_build"


if __name__ == "__main__":
    test_run_native_build_task_exists()
    print("test_run_native_build_task_exists: PASS")
