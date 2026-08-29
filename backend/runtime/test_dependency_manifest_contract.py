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


def main() -> None:
    manifests = load_all_manifests()
    expected = {
        "anigen",
        "detailgen3d",
        "hunyuan3d-2.1",
        "hunyuan3d-2-mini",
        "trellis",
        "triposg",
        "unirig",
        "worldgen",
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
        "CUDA_HOME": "/usr/local/cuda",
    }

    anigen = manifests["anigen"]
    assert anigen["hardware"]["minimum_vram_mb"] == 18432
    assert not anigen["capabilities"]["shape"].get("native_steps")
    assert not anigen["capabilities"]["shape"]["native_build_required"]

    unirig = manifests["unirig"]
    assert "spconv-cu124" in unirig["dependencies"]["native"]
    assert "spconv-cu124" in unirig["dependencies"]["cuda_native_packages"]

    worldgen = manifests["worldgen"]
    assert worldgen["environment"]["python"] == "3.11"
    assert str(worldgen["environment"]["torch"]) == "2.7.0"
    assert worldgen["hardware"]["minimum_vram_mb"] == 10240
    assert worldgen["hardware"]["recommended_vram_mb"] == 24576
    assert worldgen["capabilities"]["shape"]["supports_text_to_3d"] is True
    assert worldgen["capabilities"]["shape"]["supports_image_to_3d"] is True
    worldgen_resolved = resolve_dependencies(Path("/tmp/no-such-model-repo"), worldgen, target_python="3.11")
    worldgen_names = [dep.name for dep in worldgen_resolved]
    assert "torch" in worldgen_names
    assert "diffusers" in worldgen_names
    assert "pytorch3d" in worldgen_names

    print("dependency manifest contract: PASS")


if __name__ == "__main__":
    main()
