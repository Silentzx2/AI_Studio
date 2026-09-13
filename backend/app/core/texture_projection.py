"""High-fidelity texture projection & tangent normal map baking.

Maps reference images onto 3D meshes so that generated models preserve
sharp eyes, teeth, mouth interiors, claws, scales, and glowing details
instead of decaying into flat monochrome clay.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Union

import numpy as np
from PIL import Image
import trimesh

logger = logging.getLogger(__name__)


def is_real_textured_mesh(mesh: trimesh.Trimesh) -> bool:
    """Check if mesh carries real visual texture or custom vertex colors."""
    visual = getattr(mesh, "visual", None)
    if visual is None:
        return False

    # 1. Check for real texture map
    uv = getattr(visual, "uv", None)
    material = getattr(visual, "material", None)
    if uv is not None and len(uv) > 0 and material is not None:
        img = getattr(material, "baseColorTexture", None) or getattr(material, "image", None)
        if img is not None and min(img.size) >= 16:
            return True

    # 2. Check for custom vertex colors (not default uncolored gray [102, 102, 102, 255])
    if hasattr(visual, "vertex_colors"):
        vc = visual.vertex_colors
        if vc is not None and len(vc) > 0:
            sample = vc[:min(len(vc), 500)]
            if not (len(np.unique(sample, axis=0)) == 1 and np.array_equal(sample[0][:3], [102, 102, 102])):
                return True

    return False


def create_normal_map_from_image(img_pil: Image.Image, strength: float = 2.5) -> Image.Image:
    """Generate a tangent-space normal map from a 2D reference image using gradients.
    
    Produces crisp surface bump details for teeth, eyes, claws, and skin scales.
    Uses pure NumPy + PIL without requiring external C libraries.
    """
    gray = np.array(img_pil.convert("L"), dtype=np.float32) / 255.0
    gy, gx = np.gradient(gray)
    
    # In glTF tangent space: +X right, +Y up (inverted from image +Y down), +Z out
    nx = -gx * strength
    ny = gy * strength
    nz = np.ones_like(gray)
    
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx /= norm
    ny /= norm
    nz /= norm
    
    r = ((nx * 0.5 + 0.5) * 255.0).astype(np.uint8)
    g = ((ny * 0.5 + 0.5) * 255.0).astype(np.uint8)
    b = ((nz * 0.5 + 0.5) * 255.0).astype(np.uint8)
    
    return Image.fromarray(np.stack([r, g, b], axis=-1))


def inpaint_image_background(img_rgba: Image.Image) -> Image.Image:
    """Extend edge colors into transparent image margins to prevent UV seam artifacts."""
    img_np = np.array(img_rgba)
    H, W = img_np.shape[:2]
    alpha = img_np[:, :, 3] if img_np.shape[2] == 4 else np.full((H, W), 255, dtype=np.uint8)
    
    try:
        import cv2
        mask = (alpha < 20).astype(np.uint8) * 255
        if np.any(mask > 0):
            rgb = img_np[:, :, :3]
            inpainted_rgb = cv2.inpaint(rgb, mask, inpaintRadius=15, flags=cv2.INPAINT_TELEA)
            return Image.fromarray(np.dstack([inpainted_rgb, np.full((H, W), 255, dtype=np.uint8)]))
    except Exception:
        pass
    
    # Fallback: fill transparent margins with median opaque color
    opaque_mask = alpha > 40
    if np.any(opaque_mask):
        median_color = np.median(img_np[opaque_mask, :3], axis=0).astype(np.uint8)
    else:
        median_color = np.array([128, 128, 128], dtype=np.uint8)
    
    out_rgb = img_np[:, :, :3].copy()
    out_rgb[~opaque_mask] = median_color
    return Image.fromarray(np.dstack([out_rgb, np.full((H, W), 255, dtype=np.uint8)]))


def project_reference_texture(
    mesh_or_path: Union[str, Path, trimesh.Trimesh],
    image_path: Union[str, Path],
    output_path: Union[str, Path, None] = None,
    *,
    cam_pos: tuple[float, float, float] = (2.2, -3.2, 0.9),
    target: tuple[float, float, float] = (0.0, 0.0, 0.1),
    fov_deg: float = 42.0,
    force_reproject: bool = False,
) -> Union[trimesh.Trimesh, str]:
    """Project reference image onto mesh UVs with occlusion awareness and tangent normal map.

    Args:
        mesh_or_path: Input mesh (path or trimesh.Trimesh instance)
        image_path: Path to reference image
        output_path: If given, exports the textured GLB to this path and returns path string
        cam_pos: Camera position in model coordinates
        target: Camera look-at target
        fov_deg: Camera field of view in degrees
        force_reproject: If False and mesh already has a real texture, skips re-projection
    """
    if isinstance(mesh_or_path, (str, Path)):
        mesh = trimesh.load(str(mesh_or_path), force="mesh")
    else:
        mesh = mesh_or_path.copy()

    image_path_str = str(image_path)
    if not os.path.exists(image_path_str):
        logger.warning("Reference image %s not found; returning original mesh", image_path_str)
        if output_path:
            mesh.export(str(output_path), file_type="glb")
            return str(output_path)
        return mesh

    # If already textured with real multi-color data, preserve it unless forced
    if not force_reproject and is_real_textured_mesh(mesh):
        logger.info("Mesh already possesses real texture visual data; preserving")
        if output_path:
            mesh.export(str(output_path), file_type="glb")
            return str(output_path)
        return mesh

    # Ensure clean smooth vertex normals
    mesh.fix_normals()

    img = Image.open(image_path_str).convert("RGBA")
    W, H = img.size
    img_np = np.array(img)
    alpha = img_np[:, :, 3]

    # Inpaint background margins to eliminate black UV seams
    baked_texture = inpaint_image_background(img)

    # Compute camera coordinate frame
    C = np.array(cam_pos, dtype=np.float64)
    T = np.array(target, dtype=np.float64)
    forward = T - C
    forward /= np.linalg.norm(forward)

    world_up = np.array([0, 0, 1], dtype=np.float64)
    right = np.cross(forward, world_up)
    norm_r = np.linalg.norm(right)
    if norm_r < 1e-6:
        right = np.array([1, 0, 0], dtype=np.float64)
    else:
        right /= norm_r

    up = np.cross(right, forward)
    up /= np.linalg.norm(up)

    # Project vertices to camera space
    V = mesh.vertices.astype(np.float64)
    V_cam = V - C

    x_cam = np.dot(V_cam, right)
    y_cam = np.dot(V_cam, up)
    z_cam = np.dot(V_cam, forward)

    # Prevent division by zero
    z_cam_safe = np.where(np.abs(z_cam) < 1e-4, 1e-4, z_cam)

    focal = 1.0 / np.tan(np.radians(fov_deg / 2.0))
    u_proj = (x_cam / z_cam_safe) * focal
    v_proj = (y_cam / z_cam_safe) * focal

    # Calculate subject bounding box in image
    y_idx, x_idx = np.where(alpha > 15)
    if len(y_idx) > 0 and len(x_idx) > 0:
        img_min_x, img_max_x = float(x_idx.min()) / W, float(x_idx.max()) / W
        img_min_y, img_max_y = float(y_idx.min()) / H, float(y_idx.max()) / H
    else:
        img_min_x, img_max_x = 0.0, 1.0
        img_min_y, img_max_y = 0.0, 1.0

    proj_min_u, proj_max_u = float(u_proj.min()), float(u_proj.max())
    proj_min_v, proj_max_v = float(v_proj.min()), float(v_proj.max())

    span_u = max(proj_max_u - proj_min_u, 1e-4)
    span_v = max(proj_max_v - proj_min_v, 1e-4)

    u_mapped = img_min_x + (u_proj - proj_min_u) / span_u * (img_max_x - img_min_x)
    v_mapped = (1.0 - img_max_y) + (v_proj - proj_min_v) / span_v * (img_max_y - img_min_y)

    # Visibility & Occlusion Testing
    grid_size = 512
    depth_buffer = np.full((grid_size, grid_size), np.inf, dtype=np.float32)

    gx = np.clip(np.round(u_mapped * (grid_size - 1)), 0, grid_size - 1).astype(int)
    gy = np.clip(np.round((1.0 - v_mapped) * (grid_size - 1)), 0, grid_size - 1).astype(int)

    for i in range(len(V)):
        if z_cam[i] < depth_buffer[gy[i], gx[i]]:
            depth_buffer[gy[i], gx[i]] = z_cam[i]

    # Normal dot forward (facing camera)
    v_normals = mesh.vertex_normals
    dot = np.dot(v_normals, forward)
    z_diff = z_cam - depth_buffer[gy, gx]

    # Visible if pointing towards camera and not occluded by closer geometry
    is_visible = (dot < -0.1) & (z_diff < 0.08)

    # Occluded surfaces map to representative body skin region with subtle procedural variation
    skin_u = (img_min_x + img_max_x) * 0.45
    skin_v = 0.5

    final_uvs = np.column_stack([np.clip(u_mapped, 0.0, 1.0), np.clip(v_mapped, 0.0, 1.0)])
    if np.any(~is_visible):
        perturb_u = np.sin(V[~is_visible, 0] * 10.0 + V[~is_visible, 2] * 5.0) * 0.04
        perturb_v = np.cos(V[~is_visible, 1] * 10.0 + V[~is_visible, 2] * 5.0) * 0.04
        final_uvs[~is_visible, 0] = np.clip(skin_u + perturb_u, 0.05, 0.95)
        final_uvs[~is_visible, 1] = np.clip(skin_v + perturb_v, 0.05, 0.95)

    # Tangent normal map from reference image
    normal_map = create_normal_map_from_image(baked_texture, strength=2.2)

    material = trimesh.visual.material.PBRMaterial(
        baseColorTexture=baked_texture,
        normalTexture=normal_map,
        metallicFactor=0.0,
        roughnessFactor=0.68,
    )
    mesh.visual = trimesh.visual.TextureVisuals(uv=final_uvs, image=baked_texture, material=material)

    if output_path:
        out_p = Path(output_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        mesh.export(str(out_p), file_type="glb")
        logger.info("Exported projected textured mesh to %s (%d faces)", out_p, len(mesh.faces))
        return str(out_p)

    return mesh
