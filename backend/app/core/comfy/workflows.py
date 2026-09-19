"""ComfyUI workflow templates and management."""

import json
import logging
from pathlib import Path
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


WORKFLOW_TEMPLATES = {
    "hunyuan3d_text_to_3d": {
        "name": "Hunyuan3D Text-to-3D",
        "description": "Generate 3D model from text prompt using Hunyuan3D",
        "nodes": {
            "prompt": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "{prompt}", "clip": ["clip_loader", 1]},
            },
            "negative_prompt": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "{negative_prompt}", "clip": ["clip_loader", 1]},
            },
            "clip_loader": {
                "class_type": "CLIPLoader",
                "inputs": {"clip_name": "hunyuan3d_clip.safetensors"},
            },
            "model_loader": {
                "class_type": "UNETLoader",
                "inputs": {"unet_name": "hunyuan3d-2.1.safetensors", "weight_dtype": "fp16"},
            },
            "vae_loader": {
                "class_type": "VAELoader",
                "inputs": {"vae_name": "hunyuan3d_vae.safetensors"},
            },
            "empty_latent": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
            },
            "sampler": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": "{seed}",
                    "steps": "{steps}",
                    "cfg": "{cfg}",
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": 1.0,
                    "model": ["model_loader", 0],
                    "positive": ["prompt", 0],
                    "negative": ["negative_prompt", 0],
                    "latent_image": ["empty_latent", 0],
                },
            },
            "vae_decode": {
                "class_type": "VAEDecode",
                "inputs": {"samples": ["sampler", 0], "vae": ["vae_loader", 0]},
            },
            "save_image": {
                "class_type": "SaveImage",
                "inputs": {"filename_prefix": "hunyuan3d_{job_id}", "images": ["vae_decode", 0]},
            },
        },
    },
    "hunyuan3d_image_to_3d": {
        "name": "Hunyuan3D Image-to-3D",
        "description": "Generate 3D model from reference image using Hunyuan3D",
        "nodes": {
            "load_image": {
                "class_type": "LoadImage",
                "inputs": {"image": "{reference_image}"},
            },
            "image_encoder": {
                "class_type": "CLIPVisionEncode",
                "inputs": {"clip_vision": ["clip_vision_loader", 0], "images": ["load_image", 0]},
            },
            "clip_vision_loader": {
                "class_type": "CLIPVisionLoader",
                "inputs": {"clip_name": "clip_vision_h.safetensors"},
            },
            "model_loader": {
                "class_type": "UNETLoader",
                "inputs": {"unet_name": "hunyuan3d-2.1.safetensors", "weight_dtype": "fp16"},
            },
            "vae_loader": {
                "class_type": "VAELoader",
                "inputs": {"vae_name": "hunyuan3d_vae.safetensors"},
            },
            "empty_latent": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
            },
            "sampler": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": "{seed}",
                    "steps": "{steps}",
                    "cfg": "{cfg}",
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": 1.0,
                    "model": ["model_loader", 0],
                    "positive": ["image_encoder", 0],
                    "negative": ["negative_prompt", 0],
                    "latent_image": ["empty_latent", 0],
                },
            },
            "negative_prompt": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "{negative_prompt}", "clip": ["clip_loader", 1]},
            },
            "clip_loader": {
                "class_type": "CLIPLoader",
                "inputs": {"clip_name": "hunyuan3d_clip.safetensors"},
            },
            "vae_decode": {
                "class_type": "VAEDecode",
                "inputs": {"samples": ["sampler", 0], "vae": ["vae_loader", 0]},
            },
            "save_image": {
                "class_type": "SaveImage",
                "inputs": {"filename_prefix": "hunyuan3d_img23d_{job_id}", "images": ["vae_decode", 0]},
            },
        },
    },
    "trellis_text_to_3d": {
        "name": "TRELLIS Text-to-3D",
        "description": "Generate 3D model from text using TRELLIS",
        "nodes": {
            "prompt": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "{prompt}", "clip": ["clip_loader", 1]},
            },
            "negative_prompt": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "{negative_prompt}", "clip": ["clip_loader", 1]},
            },
            "clip_loader": {
                "class_type": "CLIPLoader",
                "inputs": {"clip_name": "trellis_clip.safetensors"},
            },
            "model_loader": {
                "class_type": "TRELLISModelLoader",
                "inputs": {"model_name": "trellis_large.safetensors"},
            },
            "sampler": {
                "class_type": "TRELLISSampler",
                "inputs": {
                    "seed": "{seed}",
                    "steps": "{steps}",
                    "cfg": "{cfg}",
                    "model": ["model_loader", 0],
                    "positive": ["prompt", 0],
                    "negative": ["negative_prompt", 0],
                },
            },
            "mesh_decoder": {
                "class_type": "TRELLISMeshDecoder",
                "inputs": {"latents": ["sampler", 0], "model": ["model_loader", 0]},
            },
            "save_mesh": {
                "class_type": "SaveMesh",
                "inputs": {"mesh": ["mesh_decoder", 0], "filename": "trellis_{job_id}"},
            },
        },
    },
    "tripo_sr_image_to_3d": {
        "name": "TripoSR Image-to-3D",
        "description": "Fast image-to-3D using TripoSR",
        "nodes": {
            "load_image": {
                "class_type": "LoadImage",
                "inputs": {"image": "{reference_image}"},
            },
            "tripo_model": {
                "class_type": "TripoSRModelLoader",
                "inputs": {"model_name": "tripo_sr.safetensors"},
            },
            "tripo_sampler": {
                "class_type": "TripoSRSampler",
                "inputs": {
                    "model": ["tripo_model", 0],
                    "image": ["load_image", 0],
                    "seed": "{seed}",
                    "steps": "{steps}",
                },
            },
            "save_mesh": {
                "class_type": "SaveMesh",
                "inputs": {"mesh": ["tripo_sampler", 0], "filename": "tripo_sr_{job_id}"},
            },
        },
    },
    "texture_generation": {
        "name": "Texture Generation",
        "description": "Generate PBR textures for a mesh",
        "nodes": {
            "load_mesh": {
                "class_type": "LoadMesh",
                "inputs": {"mesh_path": "{mesh_path}"},
            },
            "prompt": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "{prompt}", "clip": ["clip_loader", 1]},
            },
            "clip_loader": {
                "class_type": "CLIPLoader",
                "inputs": {"clip_name": "texture_clip.safetensors"},
            },
            "texture_model": {
                "class_type": "TextureModelLoader",
                "inputs": {"model_name": "textured_mesh.safetensors"},
            },
            "texture_generator": {
                "class_type": "TextureGenerator",
                "inputs": {
                    "mesh": ["load_mesh", 0],
                    "model": ["texture_model", 0],
                    "prompt": ["prompt", 0],
                    "steps": "{steps}",
                    "resolution": "{texture_resolution}",
                },
            },
            "save_mesh": {
                "class_type": "SaveMesh",
                "inputs": {"mesh": ["texture_generator", 0], "filename": "textured_{job_id}"},
            },
        },
    },
    "remesh": {
        "name": "Remesh",
        "description": "Remesh a model to target polygon count",
        "nodes": {
            "load_mesh": {
                "class_type": "LoadMesh",
                "inputs": {"mesh_path": "{mesh_path}"},
            },
            "remesh": {
                "class_type": "QuadRemesh",
                "inputs": {
                    "mesh": ["load_mesh", 0],
                    "target_faces": "{target_faces}",
                    "adaptive": True,
                },
            },
            "save_mesh": {
                "class_type": "SaveMesh",
                "inputs": {"mesh": ["remesh", 0], "filename": "remeshed_{job_id}"},
            },
        },
    },
}


def get_workflow_template(template_name: str) -> dict[str, Any]:
    """Get a workflow template by name."""
    return WORKFLOW_TEMPLATES.get(template_name, WORKFLOW_TEMPLATES["hunyuan3d_text_to_3d"])


def list_workflow_templates() -> list[dict[str, str]]:
    """List available workflow templates."""
    return [
        {"id": k, "name": v["name"], "description": v["description"]}
        for k, v in WORKFLOW_TEMPLATES.items()
    ]


def render_workflow(template_name: str, **params) -> dict[str, Any]:
    """Render a workflow template with parameters."""
    template = get_workflow_template(template_name)
    workflow = json.loads(json.dumps(template["nodes"]))

    # Replace placeholders in workflow
    workflow_str = json.dumps(workflow)
    for key, value in params.items():
        placeholder = f"{{{key}}}"
        if isinstance(value, str):
            workflow_str = workflow_str.replace(f'"{placeholder}"', f'"{value}"')
        else:
            workflow_str = workflow_str.replace(f'"{placeholder}"', str(value))

    return json.loads(workflow_str)


def validate_workflow(workflow: dict) -> tuple[bool, list[str]]:
    """Validate a workflow structure."""
    errors = []
    if not workflow:
        errors.append("Workflow is empty")
        return False, errors

    # Check for required node structure
    for node_id, node in workflow.items():
        if "class_type" not in node:
            errors.append(f"Node {node_id} missing class_type")
        if "inputs" not in node:
            errors.append(f"Node {node_id} missing inputs")

    return len(errors) == 0, errors