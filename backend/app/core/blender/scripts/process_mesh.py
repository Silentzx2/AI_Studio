"""
Blender headless script: mesh cleanup, UV unwrap, Rigify auto-rigging,
multi-format export (GLB, FBX, OBJ, STL).

Receives JSON args from argv after '--':
  {
    "input":            "/path/to/input.glb",
    "output_dir":       "/path/to/output/",
    "auto_rig":         true,
    "generate_texture": true,
    "quality":          "standard"  | "low-poly" | "high-poly"
  }

Prints a single JSON line to stdout on success:
  {"glb": "...", "fbx": "...", "obj": "...", "stl": "...",
   "polygon_count": N, "vertex_count": N}
"""
import json
import os
import sys

import bpy

# ── Parse args ────────────────────────────────────────────────────────────────
_argv = sys.argv
_args_json = _argv[_argv.index("--") + 1] if "--" in _argv else "{}"
_args = json.loads(_args_json)

INPUT_PATH    = _args["input"]
OUTPUT_DIR    = _args.get("output_dir", os.path.dirname(INPUT_PATH))
AUTO_RIG      = _args.get("auto_rig", False)
GEN_TEXTURE   = _args.get("generate_texture", True)
QUALITY       = _args.get("quality", "standard")

DECIMATE_FACES = {"low-poly": 4000, "standard": 0, "high-poly": 0}

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ── 1. Clean scene ─────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)

# Enable required add-ons
for addon in ("rigify",):
    try:
        bpy.ops.preferences.addon_enable(module=addon)
    except Exception:
        pass


# ── 2. Import model ────────────────────────────────────────────────────────────
ext = os.path.splitext(INPUT_PATH)[1].lower()

if ext == ".glb":
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
elif ext == ".fbx":
    bpy.ops.import_scene.fbx(filepath=INPUT_PATH)
elif ext == ".obj":
    try:
        bpy.ops.wm.obj_import(filepath=INPUT_PATH)
    except AttributeError:
        bpy.ops.import_scene.obj(filepath=INPUT_PATH)
else:
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)


# ── 3. Gather mesh objects ─────────────────────────────────────────────────────
bpy.ops.object.select_all(action="DESELECT")
mesh_objects = [o for o in bpy.data.objects if o.type == "MESH"]
if not mesh_objects:
    print(json.dumps({"error": "No mesh objects found in input file"}))
    sys.exit(1)


# ── 4. Mesh cleanup ────────────────────────────────────────────────────────────
for obj in mesh_objects:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0001)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.mesh.dissolve_degenerate()
    bpy.ops.object.mode_set(mode="OBJECT")

    # Decimate
    target = DECIMATE_FACES.get(QUALITY, 0)
    if target and len(obj.data.polygons) > target:
        mod = obj.modifiers.new(name="Decimate", type="DECIMATE")
        mod.ratio = max(0.01, target / len(obj.data.polygons))
        bpy.ops.object.modifier_apply(modifier="Decimate")

    # Smart UV project
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")

    obj.select_set(False)


# ── 5. Join meshes for rigging ─────────────────────────────────────────────────
if AUTO_RIG and len(mesh_objects) > 1:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objects[0]
    bpy.ops.object.join()
    mesh_objects = [o for o in bpy.data.objects if o.type == "MESH"]

main_mesh = mesh_objects[0]


# ── 6. Auto-rig with Rigify ────────────────────────────────────────────────────
armature_obj = None
if AUTO_RIG:
    try:
        # Calculate mesh bounding box center & dimensions
        bbox = [main_mesh.matrix_world @ v.co for v in main_mesh.data.vertices]
        xs = [v.x for v in bbox]
        ys = [v.y for v in bbox]
        zs = [v.z for v in bbox]
        cx = (max(xs) + min(xs)) / 2
        cy = (max(ys) + min(ys)) / 2
        cz_min = min(zs)
        height = max(zs) - cz_min

        # Add a Rigify meta-rig (basic human)
        bpy.ops.object.select_all(action="DESELECT")
        bpy.ops.object.armature_human_metarig_add()
        meta_rig = bpy.context.active_object
        meta_rig.name = "MetaRig"

        # Scale & position the rig to fit the mesh
        meta_rig.location = (cx, cy, cz_min)
        meta_rig.scale = (height / 2.0, height / 2.0, height / 2.0)
        bpy.ops.object.transform_apply(scale=True, location=True)

        # Generate the Rigify rig
        bpy.context.view_layer.objects.active = meta_rig
        bpy.ops.pose.rigify_generate()

        # Find generated rig
        armature_obj = next(
            (o for o in bpy.data.objects if o.type == "ARMATURE" and o.name != "MetaRig"),
            None,
        )

        # Parent mesh to rig with automatic weights
        if armature_obj:
            bpy.ops.object.select_all(action="DESELECT")
            main_mesh.select_set(True)
            armature_obj.select_set(True)
            bpy.context.view_layer.objects.active = armature_obj
            bpy.ops.object.parent_set(type="ARMATURE_AUTO")

        # Remove meta-rig
        bpy.data.objects.remove(meta_rig, do_unlink=True)

    except Exception as rig_err:
        print(f"# Rigify warning: {rig_err}", file=sys.stderr)
        armature_obj = None
else:
    # Remove any existing armatures from the scene so the export is rig-free
    for obj in list(bpy.data.objects):
        if obj.type == "ARMATURE":
            bpy.data.objects.remove(obj, do_unlink=True)
    armature_obj = None


# ── 5. Gather mesh stats ───────────────────────────────────────────────────────
total_polys = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
total_verts = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH")

# ── 5b. Strip textures when disabled ──────────────────────────────────────────
if not GEN_TEXTURE:
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            for slot in obj.material_slots:
                if slot.material:
                    bpy.data.materials.remove(slot.material, do_unlink=True)
            obj.data.materials.clear()
            # Assign a single default gray material so the mesh is still visible
            default_mat = bpy.data.materials.new(name="Default")
            default_mat.use_nodes = True
            default_mat.node_tree.nodes.clear()
            default_mat.node_tree.nodes.new("ShaderNodeBsdfDiffuse").inputs[0].default_value = (0.5, 0.5, 0.5, 1.0)
            obj.data.materials.append(default_mat)


# ── 8. Export ──────────────────────────────────────────────────────────────────
glb_path = os.path.join(OUTPUT_DIR, "model.glb")
fbx_path = os.path.join(OUTPUT_DIR, "model.fbx")
obj_path = os.path.join(OUTPUT_DIR, "model.obj")
stl_path = os.path.join(OUTPUT_DIR, "model.stl")

bpy.ops.object.select_all(action="SELECT")

# GLB
try:
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", export_animations=AUTO_RIG)
except Exception as e:
    print(f"# GLB export warning: {e}", file=sys.stderr)
    glb_path = None  # type: ignore[assignment]

# FBX
try:
    bpy.ops.export_scene.fbx(filepath=fbx_path, add_leaf_bones=False)
except Exception as e:
    print(f"# FBX export warning: {e}", file=sys.stderr)
    fbx_path = None  # type: ignore[assignment]

# OBJ
try:
    try:
        bpy.ops.wm.obj_export(filepath=obj_path)
    except AttributeError:
        bpy.ops.export_scene.obj(filepath=obj_path)
except Exception as e:
    print(f"# OBJ export warning: {e}", file=sys.stderr)
    obj_path = None  # type: ignore[assignment]

# STL
try:
    bpy.ops.export_mesh.stl(filepath=stl_path)
except Exception as e:
    print(f"# STL export warning: {e}", file=sys.stderr)
    stl_path = None  # type: ignore[assignment]


# ── 9. Output result JSON ──────────────────────────────────────────────────────
result = {
    "glb": glb_path,
    "fbx": fbx_path,
    "obj": obj_path,
    "stl": stl_path,
    "polygon_count": total_polys,
    "vertex_count": total_verts,
    "has_rig": armature_obj is not None,
}
print(json.dumps(result))
