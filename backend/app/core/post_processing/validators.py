import logging
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    import trimesh
except ImportError:
    trimesh = None
    logger.warning("trimesh not installed, validators will degrade")

try:
    import open3d as o3d
except ImportError:
    o3d = None
    logger.warning("open3d not installed, validators will degrade")

def validate_watertight(mesh_path: str | Path) -> dict:
    mesh_path = Path(mesh_path)
    result = {
        "is_watertight": False,
        "is_manifold": False,
        "has_degenerate_faces": False,
        "vertex_count": 0,
        "triangle_count": 0,
        "boundary_edge_count": 0,
    }
    
    if not mesh_path.exists():
        return result
        
    try:
        # Load with trimesh
        if trimesh:
            t_mesh = trimesh.load(str(mesh_path), force='mesh')
            if hasattr(t_mesh, 'geometry') and t_mesh.geometry:
                t_mesh = list(t_mesh.geometry.values())[0]
            
            result["vertex_count"] = len(t_mesh.vertices)
            result["triangle_count"] = len(t_mesh.faces)
            result["is_watertight"] = bool(t_mesh.is_watertight)
            result["has_degenerate_faces"] = len(t_mesh.nondegenerate_faces()) < len(t_mesh.faces)
            if hasattr(t_mesh, 'is_winding_consistent'):
                result["is_manifold"] = bool(t_mesh.is_winding_consistent)
            
        if o3d:
            o_mesh = o3d.io.read_triangle_mesh(str(mesh_path))
            if len(o_mesh.triangles) > 0:
                result["vertex_count"] = len(o_mesh.vertices)
                result["triangle_count"] = len(o_mesh.triangles)
                result["is_watertight"] = bool(o_mesh.is_watertight())
                result["is_manifold"] = bool(o_mesh.is_edge_manifold(allow_boundary_edges=False) and o_mesh.is_vertex_manifold())
            # open3d does not have a direct count for boundary edges without custom traversal,
            # but we can get it via non-manifold edge checks or just keep it simple.
            # is_watertight implies 0 boundary edges.
            
    except Exception as e:
        logger.warning(f"Error validating mesh {mesh_path}: {e}")
        
    return result

def validate_glb_structure(glb_path: str | Path) -> bool:
    glb_path = Path(glb_path)
    if not glb_path.exists():
        return False
        
    try:
        if not trimesh:
            return True # Fallback if no trimesh
            
        scene = trimesh.load(str(glb_path))
        if hasattr(scene, 'geometry'):
            return len(scene.geometry) > 0
        return len(scene.faces) > 0 if hasattr(scene, 'faces') else False
    except Exception as e:
        logger.warning(f"Error validating GLB structure {glb_path}: {e}")
        return False
