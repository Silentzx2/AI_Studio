import logging
import asyncio
import json
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    import trimesh
except ImportError:
    trimesh = None

from app.core.mesh_optimizer import generate_uvs_with_xatlas
from app.core.blender.pipeline import _run_blender

BLENDER_SMART_PROJECT_SCRIPT = """
import bpy
import sys
import json

args_str = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else "{}"
args = json.loads(args_str)

input_path = args.get("input_path")
output_path = args.get("output_path")

if not input_path or not output_path:
    print(json.dumps({"error": "missing paths"}))
    sys.exit(1)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=input_path)

mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
if not mesh_objects:
    print(json.dumps({"error": "no mesh"}))
    sys.exit(1)

bpy.ops.object.select_all(action='DESELECT')
for obj in mesh_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = mesh_objects[0]
bpy.ops.object.join()

obj = bpy.context.active_object
bpy.context.view_layer.objects.active = obj
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=0.01)
bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_cameras=False,
    export_lights=False,
)
print(json.dumps({"success": True}))
"""

def unwrap_uvs_xatlas(input_path: str | Path, output_path: str | Path) -> dict:
    input_path = Path(input_path)
    output_path = Path(output_path)
    
    result = {
        "success": False,
        "vertex_count": 0,
        "face_count": 0,
        "uv_count": 0,
        "route": "passthrough",
        "error": None,
    }
    
    if not input_path.exists():
        result["error"] = "Input file does not exist"
        return result
        
    try:
        if trimesh:
            # We use trimesh to load, because generate_uvs_with_xatlas expects a trimesh
            mesh = trimesh.load(str(input_path), force='mesh')
            if hasattr(mesh, 'geometry') and mesh.geometry:
                mesh = list(mesh.geometry.values())[0]
            logger.info("[UV_UNWRAP] Starting xatlas parameterization on %s (%d faces)...", input_path.name, len(mesh.faces))
                
            try:
                uv_mesh, changed = generate_uvs_with_xatlas(mesh)
                uv_mesh.export(str(output_path))
                
                # Check lengths
                result.update({
                    "success": True,
                    "vertex_count": len(uv_mesh.vertices),
                    "face_count": len(uv_mesh.faces),
                    "uv_count": len(uv_mesh.visual.uv) if hasattr(uv_mesh, 'visual') and hasattr(uv_mesh.visual, 'uv') and uv_mesh.visual.uv is not None else 0,
                    "route": "xatlas",
                })
                
                # Validate output
                if result["vertex_count"] == result["uv_count"]:
                    logger.info("[UV_UNWRAP] xatlas unwrapping successful: %d vertices, %d UV coords", result["vertex_count"], result["uv_count"])
                    return result
                else:
                    logger.warning("[UV_UNWRAP] xatlas validation failed: len(vertices) != len(uvs), falling back")
            except Exception as e:
                logger.warning(f"[UV_UNWRAP] xatlas failed, falling back to blender: {e}")
                
        # Fallback to blender smart project
        logger.info("Falling back to blender smart project")
        script_path = output_path.parent / "temp_smart_project.py"
        script_path.write_text(BLENDER_SMART_PROJECT_SCRIPT)
        try:
            blender_args = {
                "input_path": str(input_path),
                "output_path": str(output_path)
            }
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
            loop.run_until_complete(_run_blender(script_path, blender_args))
            
            if output_path.exists():
                # Read the result with trimesh to get counts
                if trimesh:
                    b_mesh = trimesh.load(str(output_path), force='mesh')
                    if hasattr(b_mesh, 'geometry') and b_mesh.geometry:
                        b_mesh = list(b_mesh.geometry.values())[0]
                    result.update({
                        "success": True,
                        "vertex_count": len(b_mesh.vertices),
                        "face_count": len(b_mesh.faces),
                        "uv_count": len(b_mesh.visual.uv) if hasattr(b_mesh, 'visual') and hasattr(b_mesh.visual, 'uv') and b_mesh.visual.uv is not None else 0,
                        "route": "blender_smart_project",
                    })
                else:
                    result.update({"success": True, "route": "blender_smart_project"})
                return result
        finally:
            script_path.unlink(missing_ok=True)
            
        shutil.copy2(input_path, output_path)
        result["route"] = "passthrough"
        
    except Exception as e:
        logger.error(f"Error unwrapping UVs: {e}")
        result["error"] = str(e)
        shutil.copy2(input_path, output_path)
        
    return result
