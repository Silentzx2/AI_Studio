# AI Studio: 3D Quality Pipeline Specification

## 1. Architectural Overview

The AI Studio 3D Quality Pipeline coordinates image analysis, neural provider inference, safe post-processing, multi-tier LOD generation, and asset packaging.

```mermaid
flowchart TD
    classDef stage fill:#1e1e24,stroke:#6366f1,stroke-width:2px,color:#fff;
    classDef data fill:#18181b,stroke:#22c55e,stroke-width:1.5px,color:#fff;
    classDef guard fill:#18181b,stroke:#f59e0b,stroke-width:1.5px,color:#fff;
    classDef api fill:#1e1e2d,stroke:#a855f7,stroke-width:2px,color:#fff;

    UI["UI Panel<br/>Image/Prompt Input"]:::api --> IN[Input Image / Prompt]:::data

    IN --> PRE[Stage 1: Preprocessing & Conditioning<br/>• Aspect ratio preservation<br/>• Background removal (RemBG)<br/>• Silhouette extraction]:::stage

    PRE --> INF[Stage 2: Provider Inference<br/>• TRELLIS (FlexiCubes PBR)<br/>• Hunyuan3D-2.1 (DiT)<br/>• PartPacker<br/>• UltraShape]:::stage

    INF --> RAW[(source.glb<br/>Untouched Master Asset)]:::data

    INF --> PROCESS[Stage 3: Post-Processing Pipeline<br/>• meshoptimizer SIMD Decimation<br/>• xatlas Conformal UV Unwrapping<br/>• Texture Projection Baking]:::stage

    PROCESS --> G1{Safe Component Guard<br/>Islands ≥ 0.5% vertices or ≥ 15 verts?}:::guard
    G1 -->|Yes| KEEP[Preserve Ears, Horns, Tails, Claws & Accessories]
    G1 -->|No| PRUNE[Purge Floating Disconnected Noise]

    KEEP --> BASE[(game_ready.glb<br/>Optimized Deliverable)]:::data
    PRUNE --> BASE

    BASE --> P5[Stage 4: Multi-Tier LOD Cascade<br/>• meshoptimizer with Texture Retention]:::stage
    P5 --> L0[(LOD0: 100% Master)]:::data
    P5 --> L1[(LOD1: 50% Polycount)]:::data
    P5 --> L2[(LOD2: 25% Polycount)]:::data
    P5 --> L3[(LOD3: 12.5% Polycount)]:::data

    BASE --> P6[Stage 5: Physics Collision Mesh<br/>• Trimesh Convex Hull]:::stage
    P6 --> C_OUT[(collision.glb<br/>Physics Collider)]:::data

    BASE --> P7[Stage 6: Geometry QA Diagnostics<br/>• Manifoldness & Normal Inspection<br/>• UV & Texture Verification]:::stage
    P7 --> QA_OUT[(quality_report.json<br/>Game-Ready Score: 0–100)]:::data

    BASE --> P8[Stage 7: Production Export<br/>• POST /api/v1/project/export<br/>• GLB / GLTF / OBJ / STL / PLY]:::stage

    RAW_OUT --> P8
    L0 --> P8
    L1 --> P8
    L2 --> P8
    L3 --> P8
    C_OUT --> P8
    QA_OUT --> P8

    P8 --> ZIP[(Structured Production ZIP Package<br/>Source/ + GameReady/ + LODs/ + Collision/ + QA/)]:::data

    style RAW fill:#0a0a0a,stroke:#ef4444
    style BASE fill:#0a0a0a,stroke:#22c55e
    style ZIP fill:#0a0a0a,stroke:#f59e0b
```

---

## 2. Stage Responsibilities

| Stage | Module | Responsibility | Invariants Preserved |
|---|---|---|---|
| **Inference** | `backend/adapters/*` | Neural reconstruction from prompt or image (TRELLIS, Hunyuan3D, PartPacker, UltraShape). | Writes output file; retains high-fidelity raw mesh as immutable `source.glb`. |
| **Post-Processing** | `backend/core/mesh_optimizer.py` | Fast C++ `meshoptimizer` SIMD decimation; xatlas UV unwrapping; texture projection. | Skips decimation if already within ±10% target budget. On success, processed derivative (`game_ready.glb`) becomes active result while `source.glb` remains untouched. |
| **Component Guard** | `backend/core/mesh_optimizer.py` | Conservative duplicate vertex/triangle and degenerate face removal. | Multi-component clustering strictly preserves detached accessories; noisy islands only pruned if below noise floor. |
| **LOD Generation** | `backend/core/mesh_optimizer.py` | Cascade level calculation (LOD0–LOD3) via `meshoptimizer`. | LOD0 is an exact byte-for-byte replica of the master asset; complexity strictly decreases per tier. |
| **Collision** | `backend/core/mesh_optimizer.py` | Physics collider creation (watertight convex hull proxy). | Produces single watertight convex hull proxy. Verified for tight bounds containment. |
| **QA Diagnostics** | `backend/core/mesh_processor.py` | Authoritative Game-Ready QA evaluation. | Deep topology diagnostics (non-manifold edges, self-intersections, surface area, volume, component count) producing evidence-based PASS/WARN/FAIL scores. |
| **Export Engine** | `backend/api/routers/mesh_generation.py` | Multi-format conversion & ZIP packaging. | Canonical formats (`glb`, `gltf`, `fbx`, `obj`, `stl`, `ply`). Structured ZIP with Source, GameReady, LODs, Collision, QA. |

### Tool Division of Responsibilities

| System | Dedicated Responsibility | Explicit Non-Responsibilities |
|---|---|---|
| **meshoptimizer** | High-performance polygon decimation & multi-tier LOD cascade generation | NOT a texture or normal baker |
| **xatlas** | Authoritative UV chart parameterization & packing | NOT a general geometry decimation or repair tool |
| **Trimesh** | Convex hull collision computation, format conversion | NOT a mesh analysis engine |
| **AI Providers** | Neural 3D synthesis (TRELLIS, Hunyuan3D, PartPacker, UltraShape) | NOT responsible for downstream game-ready engine optimization |

---

## 3. Provider Quality Contracts

### TRELLIS
- **Architecture**: Structured FlexiCubes representation with native PBR materials.
- **Sampler Controls**: Full propagation of sampler parameters, seed, shape-only inference (`formats=['mesh']` when `generate_texture=False`), and texture resolution.
- **VRAM Footprint**: ~11.5 GB standard; ~8 GB low-VRAM mode.
- **Topology Characteristic**: Structured flexicubes (~40k–70k tris).
- **Post-Processing Preset**: Preserves crisp geometric silhouettes; auto-decimation to target polycount recommended.

### TRELLIS.2
- **Architecture**: Higher-fidelity FlexiCubes with improved PBR material outputs.
- **VRAM Footprint**: ~23 GB.
- **Topology Characteristic**: Higher-resolution FlexiCubes.

### Hunyuan3D-2.1
- **Architecture**: DiT flow matching geometry synthesis + neural paint texture synthesis.
- **VRAM Footprint**: ~8 GB (shape-only) / ~16 GB (shape+texture).
- **Topology Characteristic**: High-density quad/triangle surface.
- **Post-Processing Preset**: Medium or High platform decimation recommended.

### PartPacker
- **Architecture**: Rectified-flow shape generation.
- **VRAM Footprint**: ~10 GB.
- **Topology Characteristic**: Dense isosurface reconstruction.
- **Supported Inputs**: Image only.

### UltraShape
- **Architecture**: SparseFlex arbitrary-topology mesh reconstruction.
- **VRAM Footprint**: ~26.6 GB (8 GB Hunyuan + 12 GB UltraShape).
- **Topology Characteristic**: Arbitrary topology mesh-to-mesh refinement.
- **Supported Outputs**: glb, obj, ply.

---

## 4. Post-Processing Pipeline

```
  raw generation (source.glb)
  ↓
  OpenX Post-Processing (backend/core/mesh_optimizer.py)
  ├── 1. meshoptimizer SIMD attribute decimation to budget
  ├── 2. Auto-Texture Preservation (preserves PBR materials and UV maps)
  ├── 3. xatlas UV Parameterization (conformal non-overlapping atlas)
  ├── 4. make_lods() (LOD0–LOD3 with textures preserved via meshoptimizer)
  ├── 5. make_collision() (Convex hull physics proxy collider)
  └── 6. QA Diagnostics (Open3D-based topological analysis)
  ✅ game_ready.glb + lods/ + collision.glb + quality_report.json
```

### Core Post-Processing
- **Decimation**: C++ `meshoptimizer` SIMD decimation with attribute weights, preserving UVs and PBR textures.
- **UV Unwrapping**: Native `xatlas.parametrize` with boundary preservation.
- **Texture Preservation**: Automatic detection and preservation of pre-baked provider textures.
- **LOD Chains**: `(1.0, 0.5, 0.25, 0.1)` ratio levels with full texture map retention.
- **Collision Proxies**: Convex hull colliders via Trimesh.

### Non-Negotiable Invariants
- `source.glb` is immutable; post-processing writes to `game_ready.glb`.
- When `auto_optimize: false` (RAW preset), decimation is skipped; the high-resolution master mesh is preserved directly.
- Any failure immediately propagates as `status="failed"` (no silent bypasses).

---

## 5. Export Formats

| Format | Engine / Software Target | Backend | PBR Support |
|---|---|---|---|
| **GLB** | WebGL, Three.js, Godot 4 | Direct glTF binary | Full PBR (Roughness/Metallic) |
| **GLTF** | WebGL, Three.js | glTF export | Full PBR |
| **FBX** | Unreal Engine 5, Unity | Trimesh / Blender | Skeletal Rig & Materials |
| **OBJ** | Wavefront, ZBrush | Trimesh OBJ Exporter | Geometry + MTL |
| **STL** | 3D Printing, CAD | Trimesh STL Exporter | Pure Geometry |
| **PLY** | Point Clouds, MeshLab | Trimesh PLY Exporter | Vertex Coordinates & Colors |

---

## 6. Structured Export Archive

When exporting with `packageZip=true`:

```
Hero_Character.zip
├── Source/
│   └── Hero_Character_source.glb    # Preserved untouched neural master
├── GameReady/
│   └── Hero_Character_ready.glb     # Engine-optimized mesh
├── LODs/
│   ├── lod0.glb                      # 100% master fidelity
│   ├── lod1.glb                      # 50% decimation
│   ├── lod2.glb                      # 25% decimation
│   └── lod3.glb                      # 12.5% distant proxy
├── Collision/
│   └── Hero_Character_collision.glb # Physics convex hull collider
├── Preview/
│   └── thumbnail.png                 # High-resolution rendering
└── QA/
    └── quality_report.json           # Machine-readable QA metrics
```

> **Master Asset Preservation**: The raw generative master (`source.glb`) is archived before any post-processing. Derived operations never overwrite the source asset.
