import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

from .validators import validate_watertight

try:
    import pymeshlab
except ImportError:
    pymeshlab = None

try:
    import trimesh
except ImportError:
    trimesh = None

from app.core.mesh_optimizer import optimize_mesh, get_target_polycount_for_platform

def get_target_faces(platform: str) -> int:
    mapping = {
        "mobile": 6000,
        "low_end": 12000,
        "medium": 20000,
        "high": 35000,
        "cinematic": 75000,
        "default": 20000
    }
    return mapping.get(platform, mapping["default"])

def decimate_pymeshlab(input_path: str | Path, output_path: str | Path, target_faces: int = 20000, quality_threshold: float = 0.3) -> dict:
    input_path = Path(input_path)
    output_path = Path(output_path)
    
    result = {
        "success": False,
        "input_faces": 0,
        "output_faces": 0,
        "route": "skip",
        "error": None,
    }
    
    if not input_path.exists():
        result["error"] = "Input file does not exist"
        return result
        
    try:
        input_faces = 0
        if trimesh:
            t_mesh = trimesh.load(str(input_path), force='mesh')
            if hasattr(t_mesh, 'geometry') and t_mesh.geometry:
                t_mesh = list(t_mesh.geometry.values())[0]
            input_faces = len(t_mesh.faces)
            result["input_faces"] = input_faces
            
            if input_faces <= target_faces * 1.1:
                shutil.copy2(input_path, output_path)
                result.update({
                    "success": True,
                    "output_faces": input_faces,
                    "route": "skip"
                })
                return result
                
        if pymeshlab:
            try:
                ms = pymeshlab.MeshSet()
                try:
                    ms.load_new_mesh(str(input_path))
                except Exception as e:
                    logger.warning(f"pymeshlab load failed: {e}, converting to obj")
                    if trimesh:
                        temp_obj = input_path.with_suffix('.obj')
                        t_mesh.export(str(temp_obj))
                        ms.load_new_mesh(str(temp_obj))
                        temp_obj.unlink(missing_ok=True)
                    else:
                        raise
                
                input_faces = ms.current_mesh().face_number()
                result["input_faces"] = input_faces
                
                if input_faces <= target_faces * 1.1:
                    shutil.copy2(input_path, output_path)
                    result.update({
                        "success": True,
                        "output_faces": input_faces,
                        "route": "skip"
                    })
                    return result

                ms.apply_filter(
                    'simplify_mesh_quadric_edge_collapse_decimation',
                    targetfacecount=target_faces,
                    quality_threshold=quality_threshold,
                    preserve_border=True,
                    preserve_normal=True,
                    preserve_topology=False,
                    autoclean=True
                )
                ms.save_current_mesh(str(output_path))
                
                val = validate_watertight(output_path)
                result.update({
                    "success": True,
                    "output_faces": val.get("triangle_count", ms.current_mesh().face_number()),
                    "route": "pymeshlab"
                })
                return result
            except Exception as e:
                logger.warning(f"pymeshlab decimation failed: {e}")
                
        # Fallback to meshoptimizer
        logger.info("Falling back to optimize_mesh")
        output_mesh = optimize_mesh(input_path, output_path, target_faces)
        
        val = validate_watertight(output_path)
        result.update({
            "success": True,
            "output_faces": val.get("triangle_count", 0),
            "route": "meshoptimizer"
        })
        
    except Exception as e:
        logger.error(f"Error decimating mesh: {e}")
        result["error"] = str(e)
        
    return result
