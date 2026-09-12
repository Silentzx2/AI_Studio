# AI Studio: 3D Quality Pipeline Specification

## 1. Architectural Overview

The AI Studio 3D Quality Pipeline coordinates image analysis, official provider inference, safe post-processing, multi-tier LOD generation, and asset packaging.

```mermaid
flowchart TD
    classDef stage fill:#1e1e24,stroke:#6366f1,stroke-width:2px,color:#fff;
    classDef data fill:#18181b,stroke:#22c55e,stroke-width:1.5px,color:#fff;
    classDef guard fill:#18181b,stroke:#f59e0b,stroke-width:1.5px,color:#fff;

    IN[Input Image / Prompt] --> PRE[Stage 1: Preprocessing & Conditioning<br/>• Aspect ratio preservation<br/>• Transparent alpha / RemBG segmentation<br/>• Bounding box & silhouette extraction]:::stage
    
    PRE --> INF[Stage 2: Provider Inference<br/>• Hunyuan3D-2.1 / 2-Mini / TRELLIS / TripoSG<br/>• Neural shape synthesis & Marching Cubes]:::stage
    
    INF --> RAW[(source.glb<br/>Untouched Master Asset)]:::data
    
    INF --> POST[Stage 3: Non-Destructive Post-Processing<br/>• Headless Blender 4.x process_mesh.py]:::stage
    
    POST --> G1{Conservative Debris Guard<br/>Remove only floating noise < 6 verts}:::guard
    G1 -->|Retain Anatomy| BM[Preserve Teeth, Claws, Eyeballs, Horns, Spikes, Accessories]
    G1 -->|Prune| FL[Purge Loose Microscopic Floating Noise]
    
    POST --> G2{UV Layout Guard<br/>mesh_has_valid_uvs?}:::guard
    G2 -->|Yes: Valid UVs| P_UV[Protect Provider UV Map & PBR Textures]
    G2 -->|No: Missing/Invalid| X_UV[Authoritative xatlas Conformal Parameterization]

    POST --> G3{Rigify Armature Guard<br/>Aspect Ratio ≥ 0.7 & Height ≥ 0.2?}:::guard
    G3 -->|Yes: Humanoid| RIG[Bind Rigify Biped Metarig]
    G3 -->|No: Prop/Quadruped| NO_RIG[Export Clean Unrigged Mesh]

    BM --> MODEL[(model.glb<br/>Clean Baseline Asset)]:::data
    P_UV --> MODEL
    X_UV --> MODEL
    RIG --> MODEL
    NO_RIG --> MODEL

    MODEL --> OPT[Stage 4: Topology & Game-Ready Optimization<br/>• Mode: TRIANGLE (meshoptimizer) / QUAD (Blender QuadriFlow) / ADAPTIVE<br/>• Sharp Crease Shading via Weighted Normals<br/>• Platform Target: Mobile / Low / Med / High / Cine]:::stage
    OPT --> GAME[(game_ready.glb<br/>Active Result Derivative)]:::data

    MODEL --> LOD[Stage 5: Multi-Tier LOD Cascade<br/>• meshoptimizer Quality Decimation Curves]:::stage
    LOD --> L0[(LOD0: 100% Master)]:::data
    LOD --> L1[(LOD1: 50% Polycount)]:::data
    LOD --> L2[(LOD2: 25% Polycount)]:::data
    LOD --> L3[(LOD3: 12.5% Polycount)]:::data

    MODEL --> COL[Stage 6: Physics Collision Hull<br/>• Convex Hull Computation via Trimesh / SciPy]:::stage
    COL --> COLL[(collision.glb<br/>Physics Collider)]:::data

    GAME --> QA[Stage 7: QA Diagnostics Engine<br/>• Manifoldness & Boundary Edge Inspection<br/>• Surface Normal Winding Consistency<br/>• UV Validity & Texture Map Verification<br/>• Platform Budget Compliance]:::stage
    QA --> SCORE[(quality_report.json<br/>Game-Ready Score: 0–100)]:::data

    GAME --> EXP[Stage 8: Production Export Endpoint<br/>• POST /api/v1/project/export<br/>• GLB / GLTF / FBX / OBJ / STL / PLY<br/>• Traversal Security Guard]:::stage
    RAW --> EXP
    L0 --> EXP
    L1 --> EXP
    L2 --> EXP
    L3 --> EXP
    COLL --> EXP
    SCORE --> EXP

    EXP --> ZIP[(Structured ZIP Archive<br/>Source/ + GameReady/ + LODs/ + Collision/ + Model/ + Preview/ + QA/ + Metadata/)]:::data
```

---

## 2. Stage Responsibilities

| Stage | Module | Responsibility | Invariants Preserved |
|---|---|---|---|
| **Inference** | `backend/app/core/providers/*` | Neural reconstruction from prompt or image (Hunyuan, TRELLIS, TripoSG). | Writes output file; retains high-fidelity raw mesh as immutable `source.glb`. |
| **Open3D Analysis & Decision** | `backend/app/core/open3d_service.py` | Canonical mesh topology analysis, manifoldness, watertightness, self-intersections, and deterministic decision routing. | Evaluates if retopology, repair, decimation, or UV parameterization is required without mutating the source asset. |
| **Safe Cleanup** | `backend/app/core/open3d_service.py` | Conservative duplicate vertex/triangle and degenerate face removal. | Multi-component clustering strictly preserves detached accessories, ears, tails, horns, and mechanical parts; noisy islands only pruned if below noise floor (<0.05% master area and <5 tris). |
| **DCC & Retopology** | `backend/app/core/blender/pipeline.py` | Headless Blender 4.x processing, QuadriFlow retopology (if triggered), Rigify rigging, PBR materials, multi-format export. | Validates post-Blender geometry with Open3D before acceptance; rejects degraded geometry. |
| **UV Parameterization** | `backend/app/core/mesh_optimizer.py` | Authoritative `xatlas` conformal parameterization. | Valid provider UVs left untouched (`uv_status: preserved_from_provider`); missing/corrupt UVs parameterized via xatlas charts (`uv_status: generated_via_xatlas`). Open3D validates mesh before/after UV pass. |
| **Optimization** | `backend/app/core/mesh_optimizer.py` | Fast C++ `meshoptimizer` decimation with Open3D quadric decimation fallback. | Skips decimation if already within ±10% target budget. On success, the processed derivative (`game_ready.glb`) unconditionally becomes the active result shown in viewer (`model_url`, `active_model_url`) and used for export, while `source.glb` remains untouched. |
| **LOD Generation** | `backend/app/core/mesh_optimizer.py` | Cascade level calculation (LOD0–LOD3) via `meshoptimizer`. | LOD0 is an exact byte-for-byte replica of the master asset; complexity strictly decreases per tier. Each candidate LOD is audited via `validate_lod_mesh_o3d` (decreasing polycount + bounds fit within 5%) and automatically discarded/unlinked if degraded. |
| **Collision** | `backend/app/core/mesh_optimizer.py` | Physics collider creation (watertight convex hull proxy). | Produces single watertight convex hull proxy (`collider_type: convex_hull`). Verified via `validate_collision_mesh_o3d` to confirm tight bounds containment and low complexity (<1000 tris). |
| **Open3D Final QA** | `backend/app/core/mesh_processor.py` (`open3d_service.py`) | Authoritative Game-Ready QA evaluation and glTF validation. | Deep topology diagnostics (non-manifold edges, self-intersections, surface area, volume, component count) producing evidence-based PASS/WARN/FAIL status and verifiable scores (no fake scores). Evaluated directly on the active derivative. |
| **Export Engine** | `backend/app/api/v1/project.py` | Multi-format conversion & ZIP packaging. | Canonical formats (`glb`, `gltf`, `fbx`, `obj`, `stl`, `ply`). Defaults to `variant="active"`, exporting the active processed derivative instead of defaulting to raw source. `variant="source"` exports untouched master. Real geometry conversion; structured ZIP with Source, GameReady, LODs, Collision, Model, Preview, QA, and Metadata. Traversal-safe storage access. |

### Tool Division of Responsibilities

| System | Dedicated Responsibility | Explicit Non-Responsibilities |
|---|---|---|
| **Open3D** | Canonical mesh analysis, topology validation, geometry diagnostics, conservative cleanup, quality decisions, before/after comparison, Game-Ready QA. | NOT an AI generation model; NOT an AI retopology system; NOT a UV unwrapper; NOT a collision generator. |
| **Blender** | Headless DCC pipeline, QuadriFlow remeshing, Rigify armature binding, texture baking, multi-format export. | NOT the primary topology QA analyzer. |
| **xatlas** | Authoritative UV chart parameterization & packing. | NOT a general geometry decimation or repair tool. |
| **meshoptimizer** | High-performance C++ polygon decimation & multi-tier LOD cascade generation. | NOT a texture or normal baker. |
| **AI Providers** | Neural 3D synthesis (Hunyuan3D-2.1/Mini, TRELLIS, TripoSG, DetailGen3D). | NOT responsible for downstream game-ready engine optimization. |

---

## 3. Provider Quality Contracts

### Hunyuan3D-2.1
- **Official Pipeline & Architecture**: Official Tencent Hunyuan3D-2.1 dual-stage pipeline (`hy3dshape` DiT flow matching geometry synthesis + `hy3dpaint` PBR texture synthesis).
- **Fallback Transparency**: Clear degraded mode warning logs emitted if falling back to `hy3dgen`.
- **Inference Parameter Passthrough**: Full forwarding of quality parameters (`seed`, `num_inference_steps`, `guidance_scale`, `octree_resolution`, `num_chunks`, `face_count`).
- **VRAM Footprint**: ~16GB for shape+texture; ~8GB for shape-only.
- **Topology Characteristic**: High-density quad/triangle surface (~80k–120k tris).
- **Post-Processing Preset**: Medium or High platform decimation recommended for web rendering.

### TRELLIS
- **Official Weights & Inference**: Uses structured Flexicubes representation with PBR material outputs.
- **Sampler Controls**: Full propagation of `sparse_structure_sampler_params` (steps and cfg scaled by quality preset/request), `slat_sampler_params`, `seed`, shape-only inference (`formats=['mesh']` when `generate_texture=False`), and `texture_size`/`texture_resolution` passed to GLB export.
- **VRAM Footprint**: ~16GB standard; ~8GB low-VRAM mode.
- **Topology Characteristic**: Structured flexicubes (~40k–70k tris).
- **Post-Processing Preset**: Preserves crisp geometric silhouettes; auto-decimation to 30k recommended.

### TripoSG
- **Official Weights & Inference**: Fast single-image isosurface reconstruction.
- **VRAM Footprint**: ~6GB VRAM.
- **Topology Characteristic**: Dense Marching Cubes isosurface (~60k–80k tris, untextured).
- **Post-Processing Preset**: Decimation to 25k recommended; untextured base geometry.

### DetailGen3D
- **Official Architecture**: Second-pass geometry displacement/normal refinement.
- **Usage Contract**: Post-processing-only provider; cannot run as a standalone generation target.


---

## 4. Post-Processing Pipeline (v5.0.37+)

Six sub-stages run after inference, integrated into the existing 11-stage Celery worker.

```
source.glb (immutable)
  ↓ Stage 1: Strict Watertight Repair  (PyMeshLab → Blender voxel fallback)
  ↓ Stage 2: Decimation                (PyMeshLab QEC → meshoptimizer fallback)
  ↓ Stage 3: UV Unwrapping             (reuses generate_uvs_with_xatlas)
  ↓ Stage 4: PBR Map Baking            (Blender Cycles — Normal/AO/Roughness/Metallic)
  ↓ Stage 5: Compression               (gltf-transform 4.5.0 — Draco + WebP)
  ↓ Stage 6: Async Export Package      (Celery worker — deterministic ZIP)
  ✅ game_ready.glb + pbr_maps/ + asset_export_package.zip
```

### Stage 1 — Strict Watertight Repair
- **File**: `backend/app/core/post_processing/mesh_repair.py`
- **Tool**: PyMeshLab (remove_isolated_vertices, remove_degenerate_faces, remove_non_manifold_edges)
- **Fallback**: Blender headless voxel remesh (`blender_scripts/voxel_remesh.py`)
- **Gate**: `success=False` when no fallback achieves watertight — downstream stages never receive an invalid mesh

### Stage 2 — Decimation
- **File**: `backend/app/core/post_processing/decimation.py`
- **Tool**: PyMeshLab Quadric Edge Collapse (`preserve_border=True`, `preserve_normal=True`)
- **Fallback**: existing `optimize_mesh()` via meshoptimizer
- **Platform budgets**: mobile=6k, low_end=12k, medium=20k, high=35k, cinematic=75k tris

### Stage 3 — UV Unwrapping
- **File**: `backend/app/core/post_processing/uv_unwrap.py`
- **Reuses**: `generate_uvs_with_xatlas()` from `mesh_optimizer.py` — no duplication
- **Critical**: `new_vertices = source_vertices[vmapping]`, `new_faces = indices` reconstruction preserved
- **Fallback**: Blender Smart Project

### Stage 4 — PBR Map Baking
- **File**: `backend/app/core/post_processing/pbr_bake.py` + `blender_scripts/bake_pbr.py`
- **Engine**: Blender Cycles (GPU preferred, CPU fallback)
- **Maps**: Normal (tangent/MikkTSpace), AO, Roughness (clamped [0.2–0.85]), Metallic (0.0 default)
- **Mandatory bounds**: `cage_extrusion=0.02`, `max_ray_distance=0.05`
- **Non-Color**: all maps saved as data textures (not sRGB)
- **Failure mode**: graceful skip — pipeline continues without maps; no crash

### Stage 5 — gltf-transform Compression
- **File**: `backend/app/core/post_processing/optimize.py`
- **Tool**: gltf-transform 4.5.0 (Draco geometry + WebP textures)
- **Fallback**: passthrough copy when CLI not found
- **Note**: Draco requires client-side decoder; WebP not universal across game engines — verify target runtime

### Stage 6 — Async Export Package
- **File**: `backend/app/core/post_processing/export_packager.py` + Celery task `package_export_bundle`
- **Design**: Never called from HTTP path. POST /api/v1/project/export returns static URL or 202.
- **Idempotent**: spec hash prevents duplicate ZIPs; atomic `os.rename()` prevents partial archives
- **Security**: all artifact paths validated as `is_relative_to(storage_root)` before archiving

### Non-Negotiable Invariants
- `source.glb` is never overwritten; all post-processing derivatives are separate files
- ZIP creation is exclusively a Celery worker concern — never in the FastAPI request path
- A failed strict repair (`success=False`) blocks downstream stages; never silently succeeds
- xatlas reconstruction always uses `vertices[vmapping]` + `indices` pattern
- Roughness always clamped to [0.2, 0.85]; metallic always 0.0 unless explicit material data
