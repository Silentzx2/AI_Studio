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
RENDER_RES    = _args.get("render_resolution", [512, 512])
RENDER_SAMPLES = _args.get("render_samples", 128)
THUMBNAIL_PATH = os.path.join(OUTPUT_DIR, "thumbnail.png")
RENDER_PATH    = os.path.join(OUTPUT_DIR, "render.png")

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

    # Convert to BMesh for advanced cleanup
    import bmesh
    
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(obj.data)
    
    # 1. Remove doubles
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)
    
    # 2. Fill holes (capped by poly count to avoid massive meshes)
    bmesh.ops.holes_fill(bm, edges=bm.edges, sides=4)
    
    # 3. Recalculate normals
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    
    # 4. Remove microscopic disconnected artifacts/noise (preserve distinct anatomy & accessories)
    # ponytail: Keep any component with >= 0.5% of largest component or >= 15 vertices to preserve
    # ears, paws, horns, tails, accessories, while removing loose floating single-face debris.
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.mesh.select_all(action='DESELECT')

    total_verts = len(bm.verts)
    processed_verts = set()
    islands = []

    while len(processed_verts) < total_verts:
        start_vert = next((v for v in bm.verts if v not in processed_verts), None)
        if not start_vert:
            break
        island = {start_vert}
        stack = [start_vert]
        while stack:
            v = stack.pop()
            for edge in v.link_edges:
                other = edge.other_vert(v)
                if other not in island:
                    island.add(other)
                    stack.append(other)
        islands.append(island)
        processed_verts.update(island)

    if islands and len(islands) > 1:
        largest_len = len(max(islands, key=len))
        min_verts_threshold = max(15, int(largest_len * 0.005))
        for island in islands:
            if len(island) < min_verts_threshold:
                for v in island:
                    if v.is_valid:
                        bm.verts.remove(v)

    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Decimate only if explicit target faces specified
    target = DECIMATE_FACES.get(QUALITY, 0)
    if target and len(obj.data.polygons) > target:
        mod = obj.modifiers.new(name="Decimate", type="DECIMATE")
        mod.ratio = max(0.01, target / len(obj.data.polygons))
        bpy.ops.object.modifier_apply(modifier="Decimate")

    # Smart UV project ONLY if no existing UV layers are present
    # ponytail: Preserves provider-generated texture atlas / UV layouts from Hunyuan3D/Trellis
    if not obj.data.uv_layers or len(obj.data.uv_layers) == 0:
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

        width = max(0.001, max(xs) - min(xs))
        depth = max(0.001, max(ys) - min(ys))
        aspect_ratio = height / max(width, depth)

        # Rigify basic human metarig is intended for upright biped humanoids
        # ponytail: Skip human armature on quadrupeds (dogs), vehicles, or flat props
        if aspect_ratio < 0.7 or height < 0.2:
            print(f"# Rigify skipped: mesh aspect ratio {aspect_ratio:.2f} is non-humanoid", file=sys.stderr)
            armature_obj = None
        else:
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


# ── 7. Render Thumbnail & High-res ─────────────────────────────────────────────
# Set up rendering
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, "EeveeNextRenderSettings") else 'BLENDER_EEVEE'

# Set up camera
if "Camera" not in bpy.data.objects:
    bpy.ops.object.camera_add(location=(3, -3, 2))
    cam = bpy.context.object
    cam.rotation_euler = (1.1, 0, 0.785)
else:
    cam = bpy.data.objects["Camera"]

scene.camera = cam

# Set up lighting
if "Light" not in bpy.data.objects:
    bpy.ops.object.light_add(type='SUN', location=(5, 5, 10))
    sun = bpy.context.object
    sun.data.energy = 5.0

# World background
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.05, 0.05, 0.06, 1.0)

# 1. Render Thumbnail
scene.render.filepath = THUMBNAIL_PATH
scene.render.resolution_x = 512
scene.render.resolution_y = 512
bpy.ops.render.render(write_still=True)

# 2. Render High-res (if requested)
if RENDER_RES:
    scene.render.filepath = RENDER_PATH
    scene.render.resolution_x = RENDER_RES[0]
    scene.render.resolution_y = RENDER_RES[1]
    # Increase samples for better quality
    if scene.render.engine == 'BLENDER_EEVEE_NEXT':
        scene.eevee.ray_tracing_options.use_raytracing = True
    
    bpy.ops.render.render(write_still=True)


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
    "thumbnail": THUMBNAIL_PATH,
    "polygon_count": total_polys,
    "vertex_count": total_verts,
    "has_rig": armature_obj is not None,
}
print(json.dumps(result))
