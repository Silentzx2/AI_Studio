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

# NumPy compatibility for third-party libraries passing copy=None
try:
    _oa = np.array
    if getattr(_oa, "__name__", "") != "_safe_np_array":
        def _safe_np_array(*args, **kwargs):
            if "copy" in kwargs and kwargs["copy"] is None:
                kwargs["copy"] = False
            return _oa(*args, **kwargs)
        _safe_np_array._orig = _oa
        np.array = _safe_np_array

    _oas = np.asarray
    if getattr(_oas, "__name__", "") != "_safe_np_asarray":
        def _safe_np_asarray(*args, **kwargs):
            if "copy" in kwargs:
                c = kwargs.pop("copy")
                try:
                    return _oas(*args, copy=c if c is not None else False, **kwargs)
                except TypeError:
                    return _oas(*args, **kwargs)
            return _oas(*args, **kwargs)
        _safe_np_asarray._orig = _oas
        np.asarray = _safe_np_asarray
except Exception:
    pass


def is_real_textured_mesh(mesh: trimesh.Trimesh) -> bool:
    """Check if mesh carries real visual texture or custom vertex colors."""
    visual = getattr(mesh, "visual", None)
    if visual is None:
        return False

    # 1. Check for real texture map with valid UV coordinates
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


def create_normal_map_from_image(img_pil: Image.Image, strength: float = 4.5) -> Image.Image:
    """Generate a high-frequency tangent-space normal map from a reference image.
    
    Uses multi-scale gradient and Laplacian edge decomposition to capture crisp micro-relief
    for eyes, glasses frames, eyelids, nostrils, teeth, fingernails, and cloth folds.
    """
    gray = np.array(img_pil.convert("L"), dtype=np.float32) / 255.0
    
    try:
        import scipy.ndimage
        # Micro-scale gradient (1px fine edge response)
        gx_micro = scipy.ndimage.sobel(gray, axis=1) / 8.0
        gy_micro = scipy.ndimage.sobel(gray, axis=0) / 8.0
        
        # Macro-scale gradient (smooth 3D volume curvature)
        gray_blur = scipy.ndimage.gaussian_filter(gray, sigma=2.5)
        gx_macro = scipy.ndimage.sobel(gray_blur, axis=1) / 8.0
        gy_macro = scipy.ndimage.sobel(gray_blur, axis=0) / 8.0
        
        # High-pass Laplacian for fine structural relief (glasses rims, teeth, cuticles)
        laplacian = gray - gray_blur
        gx_fine = scipy.ndimage.sobel(laplacian, axis=1) / 4.0
        gy_fine = scipy.ndimage.sobel(laplacian, axis=0) / 4.0
        
        gx = gx_macro * 1.5 + gx_micro * 2.5 + gx_fine * 3.2
        gy = gy_macro * 1.5 + gy_micro * 2.5 + gy_fine * 3.2
    except Exception:
        gy, gx = np.gradient(gray)
        gx = gx * 2.0
        gy = gy * 2.0
    
    # In glTF tangent space: +X right, +Y up (inverted from image +Y down), +Z out
    nx = -gx * strength
    ny = gy * strength
    nz = np.ones_like(gray)
    
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    norm = np.maximum(norm, 1e-6)
    nx /= norm
    ny /= norm
    nz /= norm
    
    r = ((nx * 0.5 + 0.5) * 255.0).astype(np.uint8)
    g = ((ny * 0.5 + 0.5) * 255.0).astype(np.uint8)
    b = ((nz * 0.5 + 0.5) * 255.0).astype(np.uint8)
    
    return Image.fromarray(np.stack([r, g, b], axis=-1))


def create_metallic_roughness_map_from_image(img_pil: Image.Image) -> Image.Image:
    """Generate glTF 2.0 PBR metallicRoughness texture (R=AO, G=Roughness, B=Metallic).
    
    Channels:
      - Red: Ambient Occlusion (crevice contact shadows for eyelids, glasses, nostrils, fingers)
      - Green: Roughness (glossy 0.12-0.22 for eyes, glasses lenses, teeth; 0.68 for skin/cloth)
      - Blue: Metallic (0 for dielectrics; 0.75-0.90 for metallic glasses frames/jewelry)
    """
    img_rgb = img_pil.convert("RGB")
    arr = np.array(img_rgb, dtype=np.float32) / 255.0
    gray = np.array(img_pil.convert("L"), dtype=np.float32) / 255.0
    
    try:
        import scipy.ndimage
        gray_blur = scipy.ndimage.gaussian_filter(gray, sigma=2.0)
        laplacian = gray - gray_blur
        
        # 1. Ambient Occlusion (Red channel)
        crevice = np.maximum(0.0, -laplacian) * 2.5
        ao = 1.0 - np.clip(scipy.ndimage.gaussian_filter(crevice, sigma=1.0), 0.0, 0.65)
        r_chan = np.clip(ao * 255.0, 64, 255).astype(np.uint8)
        
        # 2. Roughness (Green channel)
        roughness = np.full_like(gray, 0.68)
        # Specular gloss on bright surfaces (eye sclera, teeth, glass reflections)
        is_bright_gloss = (gray > 0.82)
        roughness[is_bright_gloss] = 0.18
        # Dark pupil / iris / glass rim
        sharpness = np.abs(laplacian)
        is_sharp_pupil = (gray < 0.25) & (sharpness > 0.05)
        roughness[is_sharp_pupil] = 0.14
        roughness = scipy.ndimage.gaussian_filter(roughness, sigma=0.8)
        g_chan = np.clip(roughness * 255.0, 25, 240).astype(np.uint8)
        
        # 3. Metallic (Blue channel)
        sat = np.zeros_like(max_c)
        valid_max = max_c > 1e-4
        sat[valid_max] = (max_c[valid_max] - min_c[valid_max]) / max_c[valid_max]
        metallic = np.zeros_like(gray)
        is_metal = (sat < 0.12) & (gray > 0.65) & (sharpness > 0.08)
        metallic[is_metal] = 0.80
        b_chan = np.clip(metallic * 255.0, 0, 255).astype(np.uint8)
    except Exception:
        r_chan = np.full_like(img_rgb[..., 0], 255, dtype=np.uint8)
        roughness_val = np.where(gray > 0.82, 0.18, 0.68)
        g_chan = np.clip(roughness_val * 255.0, 25, 240).astype(np.uint8)
        b_chan = np.zeros_like(img_rgb[..., 0], dtype=np.uint8)
        
    return Image.fromarray(np.stack([r_chan, g_chan, b_chan], axis=-1))


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
        try:
            mesh = mesh_or_path.copy()
        except Exception:
            mesh = mesh_or_path

    image_path_str = str(image_path)
    if not os.path.exists(image_path_str):
        logger.warning("Reference image %s not found; returning original mesh", image_path_str)
        if output_path:
            mesh.export(str(output_path), file_type="glb")
            return str(output_path)
        return mesh

    # If already textured with real 2D texture, preserve and enrich with PBR normal & roughness maps
    if not force_reproject and is_real_textured_mesh(mesh):
        logger.info("Mesh already possesses real texture visual data; enriching with PBR normal and roughness maps")
        try:
            mat = mesh.visual.material
            base_img = getattr(mat, "baseColorTexture", None) or getattr(mat, "image", None)
            if base_img is not None:
                if getattr(mat, "normalTexture", None) is None:
                    mat.normalTexture = create_normal_map_from_image(base_img, strength=4.5)
                if getattr(mat, "metallicRoughnessTexture", None) is None:
                    mat.metallicRoughnessTexture = create_metallic_roughness_map_from_image(base_img)
                    mat.roughnessFactor = 1.0
                    mat.metallicFactor = 1.0
        except Exception as enh_err:
            logger.debug("Texture enrichment skipped: %s", enh_err)
        if output_path:
            mesh.export(str(output_path), file_type="glb")
            return str(output_path)
        return mesh

    # Ensure angle-weighted vertex normals to preserve sharp creases (glasses, teeth, fingers)
    try:
        wn = trimesh.geometry.weighted_vertex_normals(
            vertex_count=len(mesh.vertices),
            faces=mesh.faces,
            face_normals=mesh.face_normals,
            face_angles=mesh.face_angles,
        )
        mesh.vertex_normals = wn
    except Exception:
        mesh.fix_normals()

    img = Image.open(image_path_str).convert("RGBA")
    W, H = img.size
    img_np = np.array(img)
    alpha = img_np[:, :, 3]

    # Ensure subject has isolated background (remove flat backdrop/wall/floor bleed)
    if (alpha < 40).mean() < 0.02:
        try:
            import rembg
            logger.info("Reference image is opaque; extracting clean subject silhouette with rembg")
            img_isolated = rembg.remove(img)
            img = img_isolated.convert("RGBA")
            img_np = np.array(img)
            alpha = img_np[:, :, 3]
            W, H = img.size
        except Exception as exc:
            logger.warning("Automatic rembg isolation skipped/failed: %s", exc)

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

    # Tangent normal map and PBR metallicRoughness texture from reference image
    normal_map = create_normal_map_from_image(baked_texture, strength=4.5)
    mr_map = create_metallic_roughness_map_from_image(baked_texture)

    material = trimesh.visual.material.PBRMaterial(
        baseColorTexture=baked_texture,
        normalTexture=normal_map,
        metallicRoughnessTexture=mr_map,
        metallicFactor=1.0,
        roughnessFactor=1.0,
    )
    mesh.visual = trimesh.visual.TextureVisuals(uv=final_uvs, image=baked_texture, material=material)

    if output_path:
        out_p = Path(output_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        mesh.export(str(out_p), file_type="glb")
        logger.info("Exported projected textured mesh to %s (%d faces)", out_p, len(mesh.faces))
        return str(out_p)

    return mesh
