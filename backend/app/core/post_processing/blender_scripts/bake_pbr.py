import sys
import os
import json
import bpy
import numpy as np
from pathlib import Path

def main():
    argv = sys.argv
    if "--" not in argv:
        print(json.dumps({"error": "No arguments provided"}))
        return
        
    args = argv[argv.index("--") + 1:]
    
    # Handle JSON string from _run_blender or positional args from CLI
    if len(args) == 1:
        try:
            parsed = json.loads(args[0])
            if isinstance(parsed, list):
                args = parsed
        except Exception:
            pass

    if len(args) < 4:
        print(json.dumps({"error": "Missing required arguments: <highpoly_glb> <lowpoly_glb> <output_dir> <resolution_px>"}))
        return

    highpoly_path = args[0]
    lowpoly_path = args[1]
    output_dir = Path(args[2])
    resolution = int(args[3])

    try:
        # Clear scene
        bpy.ops.wm.read_factory_settings(use_empty=True)
        
        # Setup Cycles
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'GPU'
        
        # Auto-detect GPU
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.get_devices()
        has_gpu = False
        for compute_device_type in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = compute_device_type
                for device in prefs.devices:
                    if device.type != 'CPU':
                        device.use = True
                        has_gpu = True
                    else:
                        device.use = False
                if has_gpu:
                    break
            except Exception:
                continue
                
        if not has_gpu:
            scene.cycles.device = 'CPU'

        # Bound bake samples to prevent hanging on default 4096 samples
        scene.cycles.samples = 16
        scene.cycles.preview_samples = 16
        if hasattr(scene.cycles, 'use_denoising'):
            scene.cycles.use_denoising = False

        # Bake settings
        scene.render.bake.use_selected_to_active = True
        scene.render.bake.cage_extrusion = 0.02
        scene.render.bake.max_ray_distance = 0.05
        
        # Import highpoly
        bpy.ops.import_scene.gltf(filepath=highpoly_path)
        highpoly_objects = [obj for obj in bpy.context.selected_objects if obj.type == 'MESH']
        if not highpoly_objects:
            raise ValueError("No mesh found in highpoly GLB")
        highpoly = highpoly_objects[0]
        
        # Import lowpoly
        bpy.ops.import_scene.gltf(filepath=lowpoly_path)
        lowpoly_objects = [obj for obj in bpy.context.selected_objects if obj.type == 'MESH' and obj != highpoly]
        if not lowpoly_objects:
            raise ValueError("No mesh found in lowpoly GLB")
        lowpoly = lowpoly_objects[0]
        
        # Select highpoly, active lowpoly
        bpy.ops.object.select_all(action='DESELECT')
        highpoly.select_set(True)
        lowpoly.select_set(True)
        bpy.context.view_layer.objects.active = lowpoly
        
        # Setup material for lowpoly
        if not lowpoly.data.materials:
            mat = bpy.data.materials.new(name="BakeMat")
            mat.use_nodes = True
            lowpoly.data.materials.append(mat)
        mat = lowpoly.data.materials[0]
        nodes = mat.node_tree.nodes
        
        # Prepare image node creation
        def create_bake_image(name):
            img = bpy.data.images.new(name, width=resolution, height=resolution, alpha=False)
            node = nodes.new('ShaderNodeTexImage')
            node.image = img
            node.image.colorspace_settings.name = 'Non-Color'
            nodes.active = node
            return img
            
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Bake Normal — tangent/MikkTSpace, selected-to-active (highpoly→lowpoly)
        img_normal = create_bake_image("NormalBake")
        bpy.ops.object.bake(
            type='NORMAL',
            use_selected_to_active=True,
            normal_space='TANGENT',
        )
        img_normal.filepath_raw = str(output_dir / 'normal.png')
        img_normal.file_format = 'PNG'
        img_normal.save()
        
        # Bake AO
        img_ao = create_bake_image("AOBake")
        bpy.ops.object.bake(type='AO')
        img_ao.filepath_raw = str(output_dir / 'ao.png')
        img_ao.file_format = 'PNG'
        img_ao.save()
        
        # Bake Roughness
        img_roughness = create_bake_image("RoughnessBake")
        bpy.ops.object.bake(type='ROUGHNESS')
        pixels = np.array(img_roughness.pixels[:])
        pixels = np.clip(pixels, 0.2, 0.85)
        img_roughness.pixels = pixels.tolist()
        img_roughness.filepath_raw = str(output_dir / 'roughness.png')
        img_roughness.file_format = 'PNG'
        img_roughness.save()
        
        # Generate Metallic (fill 0.0)
        img_metallic = create_bake_image("MetallicBake")
        # Default new image is black (0.0), so we just save it
        img_metallic.filepath_raw = str(output_dir / 'metallic.png')
        img_metallic.file_format = 'PNG'
        img_metallic.save()
        
        # Validation
        for name, img in [("normal", img_normal), ("ao", img_ao), ("roughness", img_roughness), ("metallic", img_metallic)]:
            arr = np.array(img.pixels[:])
            if np.sum(arr) < 1.0 and name != "metallic":
                print(f"WARNING: {name} map is mostly black", file=sys.stderr)

        print("SUCCESS: bake complete", file=sys.stderr)
        print(json.dumps({"success": True, "resolution": f"{resolution}x{resolution}"}))
        
    except Exception as e:
        print(f"ERROR: {str(e)}", file=sys.stderr)
        print(json.dumps({"error": str(e), "success": False}))

if __name__ == "__main__":
    main()
