"""Small regression checks for the YAML-driven dependency contract.

Run with:
    python backend/runtime/test_dependency_manifest_contract.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from runtime.dependency_resolver import _manifest_dependency_config, resolve_dependencies  # noqa: E402
from runtime.manifest_loader import load_all_manifests  # noqa: E402


def test_dependency_manifest_contract() -> None:
    manifests = load_all_manifests()
    expected = {
        "detailgen3d",
        "hunyuan3d-2.1",
        "hunyuan3d-2-mini",
        "trellis",
        "triposg",
    }
    assert set(manifests) == expected, (set(manifests), expected)

    trellis = manifests["trellis"]
    resolved = resolve_dependencies(Path("/tmp/no-such-model-repo"), trellis, target_python="3.10")
    names = [dep.name for dep in resolved]
    assert "xformers" in names
    assert "flash-attn" not in names
    assert "diff-gaussian-rasterization" in names
    assert _manifest_dependency_config(
        trellis, "build_flags", "diff-gaussian-rasterization"
    ).get("shallow_clone") is True
    assert _manifest_dependency_config(trellis, "build_env", "nvdiffrast") == {
        "TORCH_CUDA_ARCH_LIST": "7.0 7.5 8.0 8.6 8.9 9.0",
    }

    detail = manifests["detailgen3d"]
    assert detail["capabilities"]["shape"]["enabled"] is False
    for provider_name, manifest in manifests.items():
        for cap_cfg in manifest.get("capabilities", {}).values():
            if isinstance(cap_cfg, dict):
                for step in cap_cfg.get("native_steps", []) or []:
                    assert "pip install" not in str(step) or "uv pip install" in str(step), (
                        provider_name, step
                    )

    print("dependency manifest contract: PASS")


if __name__ == "__main__":
    test_dependency_manifest_contract()
