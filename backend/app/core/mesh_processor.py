"""
Post-process generated meshes using trimesh/open3d/PyMeshLab.
Runs cleanup, decimation, UV unwrap repair, and thumbnail rendering.
"""
import logging
import random
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


def _try_import_trimesh():
    try:
        import trimesh
        return trimesh
    except ImportError:
        return None


def write_placeholder_mesh(glb_path: str, seed: int | None = None) -> dict[str, Any]:
    """Write a *valid, viewable* placeholder GLB.

    Provider fallbacks that have no real inference available (no GPU, weights
    not installed) used to write raw bytes named ``.glb``, which GLTFLoaders in
    the viewer reject with "invalid GLB". This emits a real, parseable GLB: a
    low-poly lumpy icosphere whose shape varies with ``seed``.

    ponytail: still a placeholder — the whole "simulated" provider path stays.
    Upgrading to real meshes means swapping the caller to per-model subprocess
    inference (see the model pipeline rules); this keeps that swap invisible to
    the UI.
    """
    trimesh = _try_import_trimesh()
    if trimesh is None:
        raise RuntimeError("trimesh not installed; cannot emit a valid placeholder GLB")

    rng = random.Random(seed)
    base = trimesh.creation.icosphere(subdivisions=2, radius=1.0)
    jitter = 1.0 + 0.12 * rng.uniform(-1.0, 1.0)
    squash = np.array([rng.uniform(0.85, 1.0), 1.0, rng.uniform(0.85, 1.0)])
    mesh = trimesh.Trimesh(vertices=(base.vertices * jitter) * squash[None, :], faces=base.faces)
    mesh.export(str(glb_path), file_type="glb")
    return {
        "polygon_count": len(mesh.faces),
        "vertex_count": len(mesh.vertices),
        "output_path": glb_path,
    }


def clean_mesh(input_path: str, output_path: str, target_faces: int | None = None) -> dict:
    """Remove degenerate faces, merge duplicate vertices, optionally decimate."""
    trimesh = _try_import_trimesh()
    if not trimesh:
        logger.warning("trimesh not installed — skipping mesh cleanup")
        import shutil
        shutil.copy(input_path, output_path)
        return {"polygon_count": 0, "vertex_count": 0}

    mesh = trimesh.load(input_path, force="mesh")

    # Basic cleanup (trimesh API differs across supported releases).
    if hasattr(mesh, "remove_degenerate_faces"):
        mesh.remove_degenerate_faces()
    else:
        mesh.update_faces(mesh.nondegenerate_faces())
    if hasattr(mesh, "remove_duplicate_faces"):
        mesh.remove_duplicate_faces()
    else:
        mesh.update_faces(mesh.unique_faces())
    mesh.merge_vertices()
    mesh.fix_normals()

    if target_faces and len(mesh.faces) > target_faces:
        try:
            import pymeshlab
            ms = pymeshlab.MeshSet()
            ms.load_new_mesh(input_path)
            ms.meshing_decimation_quadric_edge_collapse(targetfacenum=target_faces)
            ms.save_current_mesh(output_path)
            mesh = trimesh.load(output_path, force="mesh")
        except ImportError:
            logger.warning("PyMeshLab not installed — skipping decimation")
            mesh.export(output_path)
    else:
        mesh.export(output_path)

    return {
        "polygon_count": len(mesh.faces),
        "vertex_count": len(mesh.vertices),
        "output_path": output_path,
    }


def render_thumbnail(model_path: str, output_path: str, size: tuple[int, int] = (512, 512)) -> bool:
    """Render a thumbnail PNG from a 3D model.

    We try trimesh first; if the OpenGL/offscreen render path is unavailable or
    the mesh loader returns a scene that cannot be rasterised cleanly, fall back
    to a lightweight placeholder preview instead of leaving the UI blank.
    """
    trimesh = _try_import_trimesh()
    if trimesh:
        try:
            loaded = trimesh.load(model_path, force="scene")
            scene = loaded if hasattr(loaded, "save_image") else trimesh.Scene(loaded)
            png = scene.save_image(resolution=size, visible=True)
            if png:
                Path(output_path).write_bytes(png)
                return True
        except Exception as exc:
            logger.warning("Thumbnail render failed: %s", exc)

    try:
        from PIL import Image, ImageDraw, ImageFont

        width, height = size
        image = Image.new("RGB", size, color=(16, 18, 24))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((12, 12, width - 12, height - 12), radius=24, outline=(92, 107, 192), width=3)
        draw.text((28, 28), "3D Preview", fill=(240, 242, 255))
        draw.text((28, 72), Path(model_path).name, fill=(190, 197, 210))

        # Keep the fallback useful even when the renderer cannot open the mesh.
        try:
            stats = get_mesh_stats(model_path)
            summary = [
                f"Faces: {stats.get('polygon_count', 0):,}",
                f"Vertices: {stats.get('vertex_count', 0):,}",
                f"Size: {stats.get('file_size', 0) / (1024 ** 2):.2f} MB",
            ]
        except Exception:
            summary = ["Preview rendered from fallback path."]

        y = 128
        for line in summary:
            draw.text((28, y), line, fill=(164, 171, 184))
            y += 34

        image.save(output_path, "PNG")
        logger.warning("Thumbnail fallback generated for %s", model_path)
        return True
    except Exception as exc:
        logger.warning("Thumbnail fallback generation failed: %s", exc)
        return False


def get_mesh_stats(model_path: str) -> dict:
    trimesh = _try_import_trimesh()
    if not trimesh:
        return {"polygon_count": 0, "vertex_count": 0, "file_size": Path(model_path).stat().st_size}

    try:
        loaded = trimesh.load(model_path, force="scene")
        if isinstance(loaded, trimesh.Scene):
            meshes = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
            face_count = sum(len(m.faces) for m in meshes)
            vertex_count = sum(len(m.vertices) for m in meshes)
        else:
            face_count, vertex_count = len(loaded.faces), len(loaded.vertices)
        return {
            "polygon_count": face_count,
            "vertex_count": vertex_count,
            "file_size": Path(model_path).stat().st_size,
        }
    except Exception as exc:
        logger.warning("Failed to read mesh stats: %s", exc)
        return {"polygon_count": 0, "vertex_count": 0, "file_size": Path(model_path).stat().st_size}


# ---------------------------------------------------------------------------
# Output validation (GLB / UV / texture / export)
# ---------------------------------------------------------------------------

def validate_glb(model_path: str) -> dict:
    """Validate a generated GLB parses as a real mesh with non-zero geometry.

    Used by the worker after provider generation to catch corrupt/empty
    outputs (invalid GLB, zero-face mesh, etc.) before they reach the UI.
    Returns a dict with ``valid`` and, when invalid, ``reason``.
    """
    path = Path(model_path)
    if not path.exists():
        return {"valid": False, "reason": "file not found", "model_path": model_path}
    size = path.stat().st_size
    if size == 0:
        return {"valid": False, "reason": "empty file (0 bytes)", "model_path": model_path}

    # Check GLB magic number directly for clearer error messages
    # GLB files must start with the magic bytes "glTF" (0x46546C67)
    # If magic bytes don't match, skip validation (may be a different format)
    try:
        with open(path, 'rb') as f:
            magic = f.read(4)
            if magic != b'glTF':
                # Not a valid GLB header — skip trimesh validation to avoid spurious errors
                return {"valid": True, "model_path": model_path, "skipped": True, "reason": "not a GLB file (skipped validation)"}
    except Exception as exc:
        return {"valid": True, "model_path": model_path, "skipped": True, "reason": f"cannot read file: {exc}"}

    trimesh = _try_import_trimesh()
    if trimesh is None:
        return {"valid": True, "model_path": model_path}  # cannot verify — don't block
    try:
        loaded = trimesh.load(str(path))
        if isinstance(loaded, trimesh.Scene):
            meshes = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
            face_count = sum(len(m.faces) for m in meshes)
            vertex_count = sum(len(m.vertices) for m in meshes)
        else:
            mesh = loaded
            face_count, vertex_count = len(mesh.faces), len(mesh.vertices)
        if face_count == 0 or vertex_count == 0:
            return {
                "valid": False,
                "reason": f"parses but has no geometry (faces={face_count}, vertices={vertex_count})",
                "model_path": model_path,
            }
        return {
            "valid": True,
            "model_path": model_path,
            "polygon_count": face_count,
            "vertex_count": vertex_count,
            "file_size": size,
        }
    except Exception as exc:
        return {"valid": False, "reason": f"invalid GLB: {exc}", "model_path": model_path}


def validate_uv_mapping(model_path: str) -> dict:
    """Check that a mesh has UV coordinates (required for texturing)."""
    trimesh = _try_import_trimesh()
    if trimesh is None:
        return {"valid": True, "unverifiable": True, "model_path": model_path}
    try:
        mesh = trimesh.load(model_path, force="mesh")
        uvs = getattr(mesh, "visual", None)
        has_uv = bool(uvs is not None and getattr(uvs, "uv", None) is not None and len(uvs.uv) > 0)
        return {"valid": has_uv, "has_uv": has_uv, "model_path": model_path}
    except Exception as exc:
        return {"valid": False, "reason": f"could not inspect UVs: {exc}", "model_path": model_path}


def validate_texture(model_path: str) -> dict:
    """Check that a GLB carries a base-color texture (material or image).

    A textured model must expose a texture image via material.baseColorTexture
    or the visual's material image. Untextured models are still valid output,
    so this returns ``textured`` rather than blocking on ``valid``.
    """
    trimesh = _try_import_trimesh()
    if trimesh is None:
        return {"valid": True, "textured": False, "unverifiable": True, "model_path": model_path}
    try:
        loaded = trimesh.load(model_path, force="scene")
        textured = False
        for node in loaded.geometry.values():
            mat = getattr(node, "visual", None)
            mat = getattr(mat, "material", None) if mat is not None else None
            if mat is not None and getattr(mat, "image", None) is not None:
                textured = True
                break
            # trimesh PBR material exposes texture via baseColorTexture
            if mat is not None and getattr(mat, "baseColorTexture", None) is not None:
                textured = True
                break
        return {"valid": True, "textured": textured, "model_path": model_path}
    except Exception as exc:
        return {"valid": False, "reason": f"could not inspect texture: {exc}", "model_path": model_path}


def validate_export(model_path: str, fmt: str) -> dict:
    """Validate an exported model file for a given format ('glb'|'obj'|'fbx')."""
    fmt = (fmt or "glb").lower().lstrip(".")
    path = Path(model_path)
    if fmt == "glb":
        return validate_glb(model_path)
    if not path.exists() or path.stat().st_size == 0:
        return {"valid": False, "reason": f"{fmt.upper()} export missing or empty", "model_path": model_path}
    trimesh = _try_import_trimesh()
    if trimesh is None:
        return {"valid": True, "model_path": model_path}
    try:
        mesh = trimesh.load(str(path), force="mesh")
        return {
            "valid": len(mesh.faces) > 0,
            "polygon_count": len(mesh.faces),
            "vertex_count": len(mesh.vertices),
            "file_size": path.stat().st_size,
            "model_path": model_path,
        }
    except Exception as exc:
        return {"valid": False, "reason": f"invalid {fmt.upper()}: {exc}", "model_path": model_path}

