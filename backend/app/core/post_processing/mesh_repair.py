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

from app.core.mesh_optimizer import _run_blender_remesh

def repair_mesh_strict(input_path: str | Path, output_path: str | Path, *, job_id: str = "") -> dict:
    input_path = Path(input_path)
    output_path = Path(output_path)
    
    result = {
        "success": False,
        "repair_route": "blocked",
        "is_watertight": False,
        "vertex_count": 0,
        "triangle_count": 0,
        "error": None,
    }
    
    if not input_path.exists():
        result["error"] = "Input file does not exist"
        return result
        
    try:
        # 1. Check if already watertight
        val = validate_watertight(input_path)
        if val.get("is_watertight", False):
            shutil.copy2(input_path, output_path)
            result.update({
                "success": True,
                "repair_route": "clean",
                "is_watertight": True,
                "vertex_count": val.get("vertex_count", 0),
                "triangle_count": val.get("triangle_count", 0)
            })
            return result
            
        # 2. Try pymeshlab repair
        if pymeshlab:
            ms = pymeshlab.MeshSet()
            try:
                ms.load_new_mesh(str(input_path))
            except Exception as e:
                logger.warning(f"pymeshlab failed to load {input_path}, trying via trimesh obj: {e}")
                if trimesh:
                    temp_obj = input_path.with_suffix('.obj')
                    t_mesh = trimesh.load(str(input_path), force='mesh')
                    if hasattr(t_mesh, 'geometry') and t_mesh.geometry:
                        t_mesh = list(t_mesh.geometry.values())[0]
                    t_mesh.export(str(temp_obj))
                    ms.load_new_mesh(str(temp_obj))
                    temp_obj.unlink(missing_ok=True)
                else:
                    raise
                    
            ms.apply_filter('remove_isolated_vertices')
            ms.apply_filter('remove_degenerate_faces')
            ms.apply_filter('remove_unreferenced_vertices')
            ms.apply_filter('remove_non_manifold_edges')
            ms.save_current_mesh(str(output_path))
            
            val2 = validate_watertight(output_path)
            if val2.get("is_watertight", False):
                result.update({
                    "success": True,
                    "repair_route": "pymeshlab",
                    "is_watertight": True,
                    "vertex_count": val2.get("vertex_count", 0),
                    "triangle_count": val2.get("triangle_count", 0)
                })
                return result
                
        # 3. Try Blender voxel remesh fallback
        logger.info("Falling back to blender voxel remesh")
        script_path = Path(__file__).parent / "blender_scripts" / "voxel_remesh.py"
        blender_bin = shutil.which("blender")
        if blender_bin and script_path.exists():
            try:
                import subprocess, os
                env = os.environ.copy()
                if not env.get("PYTHONHOME") and str(Path(os.path.realpath(blender_bin))).startswith("/usr"):
                    env["PYTHONHOME"] = "/usr"
                subprocess.run(
                    [blender_bin, "--background", "--python", str(script_path), "--", str(input_path), str(output_path), "0.02"],
                    capture_output=True,
                    timeout=180,
                    env=env,
                    check=False,
                )
            except Exception as _b_err:
                logger.warning(f"Standalone voxel remesh failed: {_b_err}")

        val3 = validate_watertight(output_path)
        if not val3.get("is_watertight", False):
            _run_blender_remesh(input_path, output_path, voxel_size=0.02)
            val3 = validate_watertight(output_path)

        if val3.get("is_watertight", False):
            result.update({
                "success": True,
                "repair_route": "blender_voxel",
                "is_watertight": True,
                "vertex_count": val3.get("vertex_count", 0),
                "triangle_count": val3.get("triangle_count", 0)
            })
            return result
            
        # If all fail
        result.update({
            "success": False,
            "repair_route": "blocked",
            "is_watertight": False,
            "vertex_count": val3.get("vertex_count", 0) if 'val3' in locals() else 0,
            "triangle_count": val3.get("triangle_count", 0) if 'val3' in locals() else 0
        })
        
    except Exception as e:
        logger.error(f"Error repairing mesh: {e}")
        result["error"] = str(e)
        
    return result
