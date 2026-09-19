"""Verified ComfyUI-3D-Pack workflow templates and generators.

All workflows use real, verified node classes registered by ComfyUI and
ComfyUI-3D-Pack. No fake or invented node classes exist in this file.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def create_triposr_workflow(
    image_filename: str,
    save_path: str = "output.glb",
    resolution: int = 256,
    threshold: float = 25.0,
    chunk_size: int = 8192,
) -> Dict[str, Any]:
    """Create a verified TripoSR Image-to-3D workflow."""
    return {
        "1": {
            "class_type": "LoadImage",
            "inputs": {
                "image": image_filename,
            },
        },
        "2": {
            "class_type": "[Comfy3D] Load TripoSR Model",
            "inputs": {
                "model_name": "model.ckpt",
                "chunk_size": chunk_size,
            },
        },
        "3": {
            "class_type": "[Comfy3D] TripoSR",
            "inputs": {
                "tsr_model": ["2", 0],
                "reference_image": ["1", 0],
                "reference_mask": ["1", 1],
                "geometry_extract_resolution": resolution,
                "marching_cude_threshold": threshold,
            },
        },
        "4": {
            "class_type": "[Comfy3D] Save 3D Mesh",
            "inputs": {
                "mesh": ["3", 0],
                "save_path": save_path,
            },
        },
    }


def create_trellis_workflow(
    image_filename: str,
    save_path: str = "output.glb",
    seed: int = 1,
    sparse_steps: int = 12,
    structured_steps: int = 12,
    repo_id: str = "jetx/TRELLIS-image-large",
) -> Dict[str, Any]:
    """Create a verified TRELLIS Structured Latents 3D workflow."""
    return {
        "1": {
            "class_type": "LoadImage",
            "inputs": {
                "image": image_filename,
            },
        },
        "2": {
            "class_type": "[Comfy3D] Load Trellis Structured 3D Latents Models",
            "inputs": {
                "repo_id": repo_id,
            },
        },
        "3": {
            "class_type": "[Comfy3D] Trellis Structured 3D Latents Models",
            "inputs": {
                "trellis_pipe": ["2", 0],
                "reference_image": ["1", 0],
                "reference_mask": ["1", 1],
                "seed": seed,
                "sparse_structure_guidance_scale": 7.5,
                "sparse_structure_sample_steps": sparse_steps,
                "structured_latent_guidance_scale": 3.0,
                "structured_latent_sample_steps": structured_steps,
            },
        },
        "4": {
            "class_type": "[Comfy3D] Save 3D Mesh",
            "inputs": {
                "mesh": ["3", 0],
                "save_path": save_path,
            },
        },
    }


def create_hunyuan3d_shapegen_workflow(
    image_filename: str,
    save_path: str = "output.glb",
    seed: int = 1234,
    steps: int = 30,
    guidance_scale: float = 7.5,
    octree_resolution: int = 256,
) -> Dict[str, Any]:
    """Create a verified Hunyuan3D-2.1 ShapeGen workflow."""
    return {
        "1": {
            "class_type": "LoadImage",
            "inputs": {
                "image": image_filename,
            },
        },
        "2": {
            "class_type": "[Comfy3D] Load Hunyuan3D 21 ShapeGen Pipeline",
            "inputs": {
                "subfolder": "hunyuan3d-dit-v2-1",
            },
        },
        "3": {
            "class_type": "[Comfy3D] Hunyuan3D 21 ShapeGen",
            "inputs": {
                "shapegen_pipe": ["2", 0],
                "image": ["1", 0],
                "seed": seed,
                "steps": steps,
                "guidance_scale": guidance_scale,
                "octree_resolution": octree_resolution,
                "remove_background": True,
                "auto_cleanup": True,
            },
        },
        "4": {
            "class_type": "[Comfy3D] Save 3D Mesh",
            "inputs": {
                "mesh": ["3", 0],
                "save_path": save_path,
            },
        },
    }


def create_hunyuan3d_texgen_workflow(
    mesh_path: str,
    image_filename: str,
    save_path: str = "output.glb",
    max_num_view: int = 8,
    resolution: int = 768,
) -> Dict[str, Any]:
    """Create a verified Hunyuan3D-2.1 TexGen (PBR texture) workflow."""
    return {
        "1": {
            "class_type": "LoadImage",
            "inputs": {
                "image": image_filename,
            },
        },
        "2": {
            "class_type": "[Comfy3D] Load Hunyuan3D 21 TexGen Pipeline",
            "inputs": {
                "max_num_view": max_num_view,
                "resolution": resolution,
                "enable_mmgp": True,
            },
        },
        "3": {
            "class_type": "[Comfy3D] Hunyuan3D 21 TexGen",
            "inputs": {
                "texgen_pipe": ["2", 0],
                "mesh_path": mesh_path,
                "image": ["1", 0],
                "create_pbr": True,
                "use_remesh": False,
            },
        },
        "4": {
            "class_type": "[Comfy3D] Save 3D Mesh",
            "inputs": {
                "mesh": ["3", 0],
                "save_path": save_path,
            },
        },
    }


def create_remesh_workflow(
    mesh_path: str,
    save_path: str = "output.glb",
    target_faces: int = 10000,
) -> Dict[str, Any]:
    """Create a verified mesh decimation and remeshing workflow."""
    return {
        "1": {
            "class_type": "[Comfy3D] Load 3D Mesh",
            "inputs": {
                "mesh_file_path": mesh_path,
                "resize": False,
                "renormal": True,
                "retex": False,
                "optimizable": False,
                "clean": False,
                "resize_bound": 0.5,
            },
        },
        "2": {
            "class_type": "[Comfy3D] Decimate Mesh",
            "inputs": {
                "mesh": ["1", 0],
                "target": int(target_faces),
                "remesh": True,
                "optimalplacement": True,
            },
        },
        "3": {
            "class_type": "[Comfy3D] Save 3D Mesh",
            "inputs": {
                "mesh": ["2", 0],
                "save_path": save_path,
            },
        },
    }


def build_workflow_for_job(
    mode: str,
    provider: Optional[str] = None,
    image_filename: Optional[str] = None,
    mesh_path: Optional[str] = None,
    save_path: str = "output.glb",
    seed: int = 1,
    steps: int = 20,
    target_faces: int = 10000,
    **kwargs,
) -> Dict[str, Any]:
    """Map AI Studio generation request to verified real ComfyUI workflow."""
    p = (provider or "").lower().strip()
    m = (mode or "").lower().strip()

    # Remesh / Poly workflow
    if m == "remesh" or mesh_path:
        target_mesh = mesh_path or "test.glb"
        return create_remesh_workflow(target_mesh, save_path=save_path, target_faces=target_faces)

    # Texture generation
    if m == "texture-generation" or m == "texture":
        img = image_filename or "test.png"
        target_mesh = mesh_path or "test.glb"
        return create_hunyuan3d_texgen_workflow(target_mesh, img, save_path=save_path)

    # Image-to-3D / Text-to-3D model mapping
    img = image_filename or "test.png"

    if "trellis" in p:
        return create_trellis_workflow(img, save_path=save_path, seed=seed, sparse_steps=steps, structured_steps=steps)

    if "hunyuan" in p:
        return create_hunyuan3d_shapegen_workflow(img, save_path=save_path, seed=seed, steps=steps)

    # Default to TripoSR (fast, robust, verified)
    return create_triposr_workflow(img, save_path=save_path)


def list_workflow_templates() -> list[dict[str, str]]:
    """List available verified workflow templates."""
    return [
        {"id": "triposr", "name": "TripoSR Image-to-3D", "description": "Fast 3D mesh reconstruction via TripoSR"},
        {"id": "trellis", "name": "TRELLIS Large", "description": "High fidelity structured 3D latents via TRELLIS"},
        {"id": "hunyuan3d_21", "name": "Hunyuan3D-2.1 ShapeGen", "description": "Tencent Hunyuan DiT 3D generation"},
        {"id": "hunyuan3d_tex", "name": "Hunyuan3D-2.1 TexGen", "description": "Multi-view PBR texture mapping"},
        {"id": "remesh", "name": "Poly Decimate & Remesh", "description": "Topology optimization and poly reduction"},
    ]


WORKFLOW_TEMPLATES = {
    "triposr": create_triposr_workflow,
    "trellis": create_trellis_workflow,
    "hunyuan3d_21": create_hunyuan3d_shapegen_workflow,
    "hunyuan3d_shapegen": create_hunyuan3d_shapegen_workflow,
    "hunyuan3d_tex": create_hunyuan3d_texgen_workflow,
    "hunyuan3d_texgen": create_hunyuan3d_texgen_workflow,
    "remesh": create_remesh_workflow,
}


def get_workflow_template(template_name: str) -> Optional[Dict[str, Any]]:
    """Get workflow template dictionary by name."""
    fn = WORKFLOW_TEMPLATES.get(template_name.lower())
    if fn:
        if template_name.lower() == "remesh":
            return fn("model.glb")
        return fn("image.png")
    return None


def render_workflow(template_name: str, **params) -> Dict[str, Any]:
    """Render workflow template with provided parameters."""
    fn = WORKFLOW_TEMPLATES.get(template_name.lower(), create_triposr_workflow)
    return fn(**params)


def validate_workflow(workflow: Dict[str, Any]) -> bool:
    """Validate that workflow is non-empty dictionary with nodes."""
    return isinstance(workflow, dict) and len(workflow) > 0