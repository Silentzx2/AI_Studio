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
    
    POST --> G1{Safe Component Guard<br/>Islands ≥ 0.5% vertices or ≥ 15 verts}:::guard
    G1 -->|Retain Anatomy| BM[Preserve Ears, Horns, Tails, Accessories]
    G1 -->|Prune| FL[Purge Floating Disconnected Noise]
    
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

    MODEL --> OPT[Stage 4: Game-Ready Optimization<br/>• Fast C++ Decimation via meshoptimizer with UV Protection<br/>• Platform Target: Mobile / Low / Med / High / Cine]:::stage
    OPT --> GAME[(game_ready.glb<br/>Engine-Ready Optimized Variant)]:::data

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
| **Inference** | `backend/app/core/providers/*` | Neural reconstruction from prompt or image. | Writes output file; retains high-fidelity raw mesh as `source.glb`. |
| **Mesh Cleanup** | `backend/app/core/blender/scripts/process_mesh.py` | Headless Blender cleanup & normal recalculation. | Component threshold preserves valid detached anatomy; existing UV maps are strictly protected; naive smart UV avoided. |
| **UV Parameterization** | `backend/app/core/mesh_optimizer.py` | Authoritative `xatlas` conformal parameterization. | Valid provider UVs left untouched (`uv_status: preserved_from_provider`); missing/corrupt UVs parameterized via xatlas charts (`uv_status: generated_via_xatlas`). |
| **Optimization** | `backend/app/core/mesh_optimizer.py` | Fast C++ `meshoptimizer` decimation & platform profiling. | Uses quality-aware edge collapse with boundary protection; respects UV boundaries. |
| **LOD Generation** | `backend/app/core/mesh_optimizer.py` | Cascade level calculation (LOD0–LOD3). | LOD0 is an exact byte-for-byte replica of the master asset; complexity strictly decreases per tier. Corrupt or non-reducing candidate LODs are validated via `validate_glb` and automatically discarded/unlinked. |
| **Collision** | `backend/app/core/mesh_optimizer.py` | Physics collider creation. | Produces single watertight convex hull proxy (`collider_type: convex_hull`) optimized for real-time physics simulation. |
| **QA Engine** | `backend/app/core/mesh_processor.py` | Non-destructive diagnostics & scoring. | Read-only inspection; outputs machine-readable validation dictionary. |
| **Export Engine** | `backend/app/api/v1/project.py` | Multi-format conversion & ZIP packaging. | Canonical formats (`glb`, `gltf`, `fbx`, `obj`, `stl`, `ply`). Real geometry conversion; structured ZIP with Source, GameReady, LODs, Collision, Model, Preview, QA, and Metadata. Traversal-safe storage access. |

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

