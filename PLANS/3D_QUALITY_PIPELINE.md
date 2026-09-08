# AI Studio: 3D Quality Pipeline Specification

## 1. Architectural Overview

The AI Studio 3D Quality Pipeline coordinates image analysis, official provider inference, safe post-processing, multi-tier LOD generation, and asset packaging.

```
INPUT IMAGE
   │
   ▼
[Stage 1: Preprocessing & Conditioning]
   │  - Aspect ratio preservation
   │  - Silhouette analysis & background separation
   │  - Transparency & bounding box evaluation
   ▼
[Stage 2: Provider Inference]
   │  - Hunyuan3D-2.1 / Hunyuan3D-2-Mini / TRELLIS / TripoSG
   │  - Preserves raw geometry as 'source.glb'
   ▼
[Stage 3: Non-Destructive Post-Processing (Blender)]
   │  - Remove doubles & merge coincident vertices
   │  - Recalculate face normals
   │  - Remove micro-noise (< 0.5% vertices) while preserving anatomy (ears, tails, accessories)
   │  - UV preservation: never overwrite existing provider UV layers
   │  - Type-aware rigging: human Rigify only on bipedal upright silhouettes
   ▼
[Stage 4: Game-Ready Optimization]
   │  - Platform budget targeting: Mobile (18k), Low (28k), Medium (45k), High (85k), Cine (180k)
   │  - Generates 'game_ready.glb' without touching 'source.glb'
   ▼
[Stage 5: Multi-Tier LOD Cascade]
   │  - LOD0: Source Master (100%)
   │  - LOD1: 50% target polycount
   │  - LOD2: 25% target polycount
   │  - LOD3: 12.5% target polycount
   ▼
[Stage 6: Physics Collision Generation]
   │  - Generates lightweight convex hull 'collision.glb'
   ▼
[Stage 7: QA Diagnostics & Validation]
   │  - Watertightness, normal consistency, component counts
   │  - UV presence and texture validity
   │  - Computes composite Game-Ready Score (0–100)
   ▼
[Stage 8: Production Export]
   │  - Single asset (GLB, OBJ, STL, PLY)
   │  - Structured ZIP archive with Source, Model, LODs, Collision, and QA report
```

---

## 2. Stage Responsibilities

| Stage | Module | Responsibility | Invariants Preserved |
|---|---|---|---|
| **Inference** | `backend/app/core/providers/*` | Neural reconstruction from prompt or image. | Writes output file; retains high-fidelity raw mesh as `source.glb`. |
| **Mesh Cleanup** | `backend/app/core/blender/scripts/process_mesh.py` | Headless Blender cleanup & normal recalculation. | Component threshold preserves valid detached anatomy; existing UV maps are strictly protected. |
| **Optimization** | `backend/app/core/mesh_optimizer.py` | Target decimation & platform profiling. | Uses quadric edge collapse with boundary protection; respects UV boundaries. |
| **LOD Generation** | `backend/app/core/mesh_optimizer.py` | Cascade level calculation. | LOD0 is an exact byte-for-byte replica of the master asset. |
| **Collision** | `backend/app/core/mesh_optimizer.py` | Physics collider creation. | Produces watertight convex hull suitable for physics simulation. |
| **QA Engine** | `backend/app/core/mesh_processor.py` | Non-destructive diagnostics & scoring. | Read-only inspection; outputs machine-readable validation dictionary. |
| **Export Engine** | `backend/app/api/v1/project.py` | Multi-format conversion & ZIP packaging. | Real geometry conversion (no fake extension renames); traversal-safe storage access. |

---

## 3. Provider Quality Contracts

### Hunyuan3D-2.1
- **Official Weights & Inference**: Uses high-resolution Hunyuan3D shape generation with optional paint module.
- **VRAM Footprint**: ~16GB for shape+texture; ~8GB for shape-only.
- **Topology Characteristic**: High-density quad/triangle surface (~80k–120k tris).
- **Post-Processing Preset**: Medium or High platform decimation recommended for web rendering.

### TRELLIS
- **Official Weights & Inference**: Uses structured Flexicubes representation with PBR material outputs.
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
