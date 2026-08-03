"""
Post-process generated meshes using trimesh/open3d/PyMeshLab.
Runs cleanup, decimation, UV unwrap repair, and thumbnail rendering.
"""
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _try_import_trimesh():
    try:
        import trimesh
        return trimesh
    except ImportError:
        return None


def clean_mesh(input_path: str, output_path: str, target_faces: int | None = None) -> dict:
    """Remove degenerate faces, merge duplicate vertices, optionally decimate."""
    trimesh = _try_import_trimesh()
    if not trimesh:
        logger.warning("trimesh not installed — skipping mesh cleanup")
        import shutil
        shutil.copy(input_path, output_path)
        return {"polygon_count": 0, "vertex_count": 0}

    mesh = trimesh.load(input_path, force="mesh")

    # Basic cleanup
    mesh.remove_degenerate_faces()
    mesh.remove_duplicate_faces()
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
        mesh = trimesh.load(model_path, force="mesh")
        return {
            "polygon_count": len(mesh.faces),
            "vertex_count": len(mesh.vertices),
            "file_size": Path(model_path).stat().st_size,
        }
    except Exception as exc:
        logger.warning("Failed to read mesh stats: %s", exc)
        return {"polygon_count": 0, "vertex_count": 0, "file_size": Path(model_path).stat().st_size}
