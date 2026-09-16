"""Test optional post-processing mesh enhancement models (DetailGen3D and TripoSF)."""
import pytest
from app.schemas.generation import GenerationRequest
from app.core.providers.registry import is_standalone_generation_provider, get_provider
from app.core.providers.triposf_local import TripoSFLocalProvider
from app.core.providers.detailgen3d import DetailGen3DProvider


def test_post_processing_only_providers_registry():
    """Ensure detailgen3d and triposf are flagged as post-processing-only models."""
    assert is_standalone_generation_provider("hunyuan3d-2.1") is True
    assert is_standalone_generation_provider("detailgen3d") is False
    assert is_standalone_generation_provider("triposf") is False


def test_schema_mesh_enhancement_camel_case_mapping():
    """Verify camelCase deserialization and enhancement flag synchronization."""
    req_both = GenerationRequest(
        mode="image-to-3d",
        reference_image_url="http://example.com/ref.png",
        meshEnhancementMode="both",
    )
    assert req_both.detail_pass is True
    assert req_both.triposf_pass is True
    assert req_both.mesh_enhancement_mode == "both"

    req_tripo = GenerationRequest(
        mode="text-to-3d",
        prompt="A fantasy dragon",
        triposfPass=True,
    )
    assert req_tripo.triposf_pass is True
    assert req_tripo.mesh_enhancement_mode == "triposf"

    req_detail = GenerationRequest(
        mode="image-to-3d",
        reference_image_url="http://example.com/ref.png",
        detailPass=True,
        detailGuidance=8.5,
    )
    assert req_detail.detail_pass is True
    assert req_detail.detail_guidance == 8.5
    assert req_detail.mesh_enhancement_mode == "detailgen3d"


def test_triposf_provider_refine_mesh_interface():
    """Verify TripoSFLocalProvider has refine_mesh and generate methods."""
    provider = TripoSFLocalProvider(device="cpu")
    assert hasattr(provider, "refine_mesh")
    assert callable(provider.refine_mesh)
    assert hasattr(provider, "generate")
    assert callable(provider.generate)


def test_detailgen3d_provider_detail_mesh_interface():
    """Verify DetailGen3DProvider has detail_mesh interface."""
    provider = DetailGen3DProvider(device="cpu")
    assert hasattr(provider, "detail_mesh")
    assert callable(provider.detail_mesh)
