#!/usr/bin/env python3
"""Blender headless voxel remesh — strict watertight fallback.
Usage: blender --background --python voxel_remesh.py -- <input_glb> <output_glb> [voxel_size]
"""
import bpy
import sys
import os

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(args) < 2:
    print("ERROR: usage: ... -- input.glb output.glb [voxel_size]")
    sys.exit(1)

input_path = args[0]
output_path = args[1]
voxel_size = float(args[2]) if len(args) > 2 else 0.01

# Clear default scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Import GLB
bpy.ops.import_scene.gltf(filepath=input_path)

mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
if not mesh_objects:
    print("ERROR: no mesh objects found")
    sys.exit(1)

# Join all meshes
bpy.ops.object.select_all(action='DESELECT')
for obj in mesh_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = mesh_objects[0]
bpy.ops.object.join()

obj = bpy.context.active_object
bpy.context.view_layer.objects.active = obj

# Apply voxel remesh modifier for watertight output
# Compute bounding box and ensure voxel grid doesn't exceed ~150 divisions per axis
dims = obj.dimensions
max_dim = max(float(dims.x), float(dims.y), float(dims.z))
if max_dim <= 0.0:
    max_dim = 1.0
safe_voxel_size = max(voxel_size, max_dim / 150.0)

mod = obj.modifiers.new('VoxelRemesh', 'REMESH')
mod.mode = 'VOXEL'
mod.voxel_size = safe_voxel_size
mod.adaptivity = 0.0
bpy.ops.object.modifier_apply(modifier=mod.name)

# Export
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_cameras=False,
    export_lights=False,
)
print(f"SUCCESS: voxel remesh complete → {output_path}")
