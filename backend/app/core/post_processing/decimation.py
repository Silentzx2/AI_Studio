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
                
        if pymeshlab and trimesh:
            try:
                import tempfile
                with tempfile.TemporaryDirectory() as tmpdir:
                    tmppath = Path(tmpdir)
                    tmp_in_obj = tmppath / "input.obj"
                    tmp_out_obj = tmppath / "output.obj"

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

                    t_mesh.export(str(tmp_in_obj))
                    ms = pymeshlab.MeshSet()
                    ms.load_new_mesh(str(tmp_in_obj))

                    ms.meshing_decimation_quadric_edge_collapse(
                        targetfacenum=target_faces,
                        qualitythr=quality_threshold,
                        preserveboundary=True,
                        preservenormal=True,
                        preservetopology=False,
                        autoclean=True
                    )
                    ms.save_current_mesh(str(tmp_out_obj))

                    decimated_tm = trimesh.load(str(tmp_out_obj), force='mesh')
                    decimated_tm.export(str(output_path))

                    val = validate_watertight(output_path)
                    result.update({
                        "success": True,
                        "output_faces": val.get("triangle_count", len(decimated_tm.faces)),
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
