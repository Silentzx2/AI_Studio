"""Tests for ARDY, TripoSF, and TripoSR model integrations.

Verifies YAML manifest contracts, provider registry resolution, capability gates,
input validation, schema updates, and worker motion artifact handling.
"""
import pytest
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch

from runtime.manifest_loader import load_manifest, list_manifests, get_provider_metadata
from app.core.providers.registry import (
    get_provider_class,
    canonical_runtime_provider_name,
    is_standalone_generation_provider,
)
from app.schemas.generation import GenerationRequest, DownloadUrls


def test_manifest_discovery_all_three_models():
    """Verify ARDY, TripoSF, and TripoSR are discovered by manifest loader."""
    available = list_manifests()
    assert "ardy" in available
    assert "triposf" in available
    assert "triposr" in available


def test_manifest_schema_and_capabilities():
    """Verify manifests have all required keys and distinct capability matrices."""
    # 1. TripoSR
    sr = load_manifest("triposr")
    assert sr["name"] == "triposr"
    assert sr["capabilities"]["shape"]["supports_image_to_3d"] is True
    assert sr["capabilities"]["shape"]["supports_text_to_3d"] is False
    assert sr["capabilities"]["texture_pbr"]["enabled"] is True
    assert sr["hardware"]["recommended_vram_mb"] == 8192

    # 2. TripoSF
    sf = load_manifest("triposf")
    assert sf["name"] == "triposf"
    assert sf["capabilities"]["shape"]["enabled"] is False
    assert sf["capabilities"]["remesh"]["enabled"] is True
    assert sf["hardware"]["minimum_vram_mb"] == 12288
    assert not is_standalone_generation_provider("triposf")

    # 3. ARDY
    ardy = load_manifest("ardy")
    assert ardy["name"] == "ardy"
    assert ardy["capabilities"]["shape"]["enabled"] is False
    assert ardy["capabilities"]["animation"]["enabled"] is True
    assert ardy["capabilities"]["motion"]["enabled"] is True
    assert ardy["hardware"]["recommended_vram_mb"] == 16384


def test_provider_registry_resolution():
    """Verify registry resolves aliases to correct provider classes."""
    from app.core.providers.triposr_local import TripoSRLocalProvider
    from app.core.providers.triposf_local import TripoSFLocalProvider
    from app.core.providers.ardy_local import ArdyLocalProvider

    assert get_provider_class("triposr") is TripoSRLocalProvider
    assert get_provider_class("tripo-sr") is TripoSRLocalProvider
    assert get_provider_class("triposf") is TripoSFLocalProvider
    assert get_provider_class("tripo-sf") is TripoSFLocalProvider
    assert get_provider_class("ardy") is ArdyLocalProvider

    assert canonical_runtime_provider_name("Tripo-SR") == "triposr"
    assert canonical_runtime_provider_name("Tripo-SF") == "triposf"
    assert canonical_runtime_provider_name("ARDY") == "ardy"


def test_generation_request_schema_animation_and_duration():
    """Verify GenerationRequest schema supports animation, motion, and duration."""
    req_anim = GenerationRequest(prompt="A person dancing", mode="animation", duration=4.5)
    assert req_anim.mode == "animation"
    assert req_anim.duration == 4.5

    req_motion = GenerationRequest(prompt="A person walking", mode="motion", duration=10.0)
    assert req_motion.mode == "motion"
    assert req_motion.duration == 10.0

    # Prompt validation
    with pytest.raises(ValueError, match="prompt is required"):
        GenerationRequest(prompt="", mode="animation")

    # DownloadUrls contains npz and motion
    urls = DownloadUrls(npz="/static/model/motion.npz", motion="/static/model/motion.npz")
    assert urls.npz == "/static/model/motion.npz"
    assert urls.motion == "/static/model/motion.npz"


@pytest.mark.asyncio
async def test_triposr_input_validation(tmp_path):
    """Verify TripoSR rejects requests lacking an image input."""
    from app.core.providers.triposr_local import TripoSRLocalProvider

    provider = TripoSRLocalProvider()
    provider.is_loaded = True
    provider.model = MagicMock()

    req = GenerationRequest(prompt="Just text", mode="text-to-3d")
    with pytest.raises(ValueError, match="TripoSR requires an input image"):
        await provider.generate(req, tmp_path)


@pytest.mark.asyncio
async def test_triposf_input_validation(tmp_path):
    """Verify TripoSF rejects requests lacking a source 3D mesh."""
    from app.core.providers.triposf_local import TripoSFLocalProvider

    provider = TripoSFLocalProvider()
    provider.is_loaded = True
    provider.model = MagicMock()

    req = GenerationRequest(prompt="Make a chair", mode="remesh")
    with pytest.raises(ValueError, match="TripoSF requires an input 3D mesh"):
        await provider.generate(req, tmp_path)


@pytest.mark.asyncio
async def test_ardy_input_validation(tmp_path):
    """Verify ARDY rejects mesh generation requests and requires prompt."""
    from app.core.providers.ardy_local import ArdyLocalProvider

    provider = ArdyLocalProvider()
    provider.is_loaded = True
    provider.model = MagicMock()

    # Empty prompt
    req_empty = MagicMock()
    req_empty.prompt = ""
    with pytest.raises(ValueError, match="ARDY requires a text prompt"):
        await provider.generate(req_empty, tmp_path)

    # Mesh generation mode rejection
    req_mesh = MagicMock()
    req_mesh.prompt = "Dance"
    req_mesh.mode = "mesh-generation"
    with pytest.raises(ValueError, match="ARDY is a humanoid motion generation system"):
        await provider.generate(req_mesh, tmp_path)
