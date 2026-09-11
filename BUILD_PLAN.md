================================================================================
COMPREHENSIVE PRODUCTION-READY BLUEPRINT: END-TO-END 3D ASSET POST-PROCESSING
AI Studio 3D Pipeline — Game-Ready Asset Generation from Raw AI Output
================================================================================
Version: 3.0 (Tool-Optimized, Async-Export, Watertight-Gated, 100% Executable)
Status: READY FOR AI AGENT IMPLEMENTATION
Target: Principal 3D Pipeline + Automation Engineer

---

## EXECUTIVE OVERVIEW

Your AI Studio pipeline generates raw 3D models but **lacks professional post-processing** to make them game-ready. This blueprint adds a **6-stage industrial-grade post-processing and packaging pipeline** using headless PyMeshLab, xatlas, Blender Cycles, gltf-transform, and a Celery packaging worker. The design is explicitly aligned to the current AI Studio repository: it preserves the existing 11-stage generation flow, reuses existing helpers where possible, treats `source.glb` as immutable, enforces a hard watertight acceptance gate before downstream geometry work, and moves ZIP creation out of the synchronous HTTP request path.

### Current Gap
```
Raw AI Output (Hunyuan3D/TRELLIS/TripoSG)
  ↓ High-poly, noisy, broken topology
  ↓ Missing/invalid UVs
  ↓ No PBR maps
  ❌ NOT game-ready
```

### After This Implementation
```
Raw AI Output
  ↓ [Stage 1] Repair & Cleanup (PyMeshLab)
  ↓ [Stage 2] Decimation to 5k–20k tris (PyMeshLab QEC)
  ↓ [Stage 3] Automatic UV Unwrapping (<1 sec, xatlas)
  ↓ [Stage 4] PBR Map Baking (Blender Cycles: Normal, AO, Roughness, Metallic)
  ↓ [Stage 5] Optimize & Compress (gltf-transform)
  ↓ [Stage 6] Async Pre-Packaged Export (Celery ZIP worker)
  ✅ Game-Ready GLB + pre-built static export package
```

**Geometry/PBR Pipeline Time**: target 2–5 minutes per model; packaging runs asynchronously and is not allowed to block the API request path.
**Primary Output**: Optimized GLB with embedded PBR textures plus a pre-generated static ZIP package when packaging is enabled.
**Important**: "100% watertight" is an acceptance rule, not an assumption — downstream stages must never accept a mesh unless validation proves watertightness/manifoldness.

---

## PART 1: ROLE ASSIGNMENT

**You Are**: Principal 3D Pipeline & Automation Engineer
- **Expertise**: Mesh topology, texture baking, game asset workflows, CLI tool orchestration
- **Scope**: Build a completely automated, production-grade post-processing system
- **Constraint**: ZERO MANUAL CODE MATH — only chain proven, industry-standard tools
- **Output Style**: Code diffs only; 1-sentence explanations; zero conversational filler

---

## PART 2: MANDATORY PROJECT CONTEXT (Read First)

### 2.0 Snapshot Audit Findings (From Current AI Studio Repository)

The supplied repository snapshot was reviewed before updating this blueprint. The key implementation realities that this plan now accounts for are:

- `backend/app/core/mesh_optimizer.py::generate_uvs_with_xatlas()` already contains the required xatlas seam-duplication reconstruction using `mesh.vertices[vmapping]` and `indices`; this must be preserved, not replaced by the older UV assignment pattern.
- `backend/requirements.txt` already includes `pymeshlab`, `xatlas`, `trimesh`, `open3d`, and `fast-simplification`; dependency work should verify and reuse these entries rather than duplicate them.
- `backend/app/workers/tasks.py` is the authoritative Celery generation orchestrator and already produces LODs, collision, QA and thumbnails.
- `backend/app/api/v1/project.py::export_project()` currently creates ZIP archives in the request path and can perform extra LOD/collision/QA work on demand; this is the primary source of the export freezing behavior addressed by Stage 6. Moving `_do_export()` into `asyncio.to_thread()` does not make large archive generation free: it still consumes API-process thread-pool resources and request lifetime, so ZIP packaging belongs in Celery.
- The current frontend export flow expects `/api/v1/project/export` to behave as a direct download endpoint, so the frontend contract must be updated to follow a static package URL for ZIP exports instead of buffering the archive through FastAPI.


### A. Your Project Structure (AI Studio)
**Path in the supplied repository snapshot**: `AI_Studio-main/`

**Key Files (Must understand):**
- `backend/app/workers/tasks.py` — main Celery generation pipeline orchestrator
- `backend/app/core/mesh_optimizer.py` — mesh optimization, LODs, collision, and existing xatlas helper
- `backend/app/core/blender/pipeline.py` — headless Blender subprocess pattern
- `backend/app/api/v1/project.py` — export API; ZIP packaging must be removed from the HTTP path
- `backend/app/models/job.py` — `GenerationJob` state and `processing_metadata`
- `backend/app/schemas/generation.py` — generation request/response schemas
- `features/new-workspace/Modals/ExportModal.tsx` — current frontend export request/download flow
- `Docs/3D_QUALITY_PIPELINE.md` — existing canonical quality-pipeline documentation
- `scripts/test_pipeline_and_export.py` — current pipeline/export self-checks

**Current repository facts:**
- `backend/requirements.txt` already contains `pymeshlab`, `xatlas`, `trimesh`, `open3d`, `meshoptimizer`, and `fast-simplification`.
- `backend/app/core/mesh_optimizer.py::generate_uvs_with_xatlas()` already implements the required xatlas seam-vertex reconstruction.
- `backend/app/workers/tasks.py` already generates optional LODs, collision, QA and thumbnails in the generation worker.
- `backend/app/api/v1/project.py` currently creates ZIPs synchronously and may generate missing LOD/collision/QA/game-ready assets during export; Stage 6 removes this hidden work.
- `features/new-workspace/Modals/ExportModal.tsx` currently buffers the `/export` response as a Blob; the ZIP path must be changed to follow a pre-generated static URL/redirect instead.

### B. Current Pipeline Stage Responsibilities
The existing docs describe the lifecycle separately from this blueprint's 6 post-processing stages. Do not renumber or delete the existing lifecycle. The blueprint stages are implementation sub-stages:

1. Inference → raw mesh
2. Open3D analysis / decision
3. Conservative cleanup
4. Blender post-processing
5. UV validation / xatlas
6. Game-ready optimization
7. Optional LOD generation
8. Optional collision generation
9. QA diagnostics
10. Thumbnail + mesh statistics
11. Final job metadata/state
12. **Blueprint Stage 6 package task** runs asynchronously after all required artifacts are ready

**Current project gaps to close:**
- Strict watertight reconstruction after PyMeshLab cleanup when holes remain
- xatlas seam-duplication regression protection
- Bounded Cycles bake rays
- Conservative PBR heuristics (roughness clamp, metallic default)
- Explicit Node.js/npm server dependency
- Asynchronous, pre-packaged ZIP export with no request-time archive generation
### B. Current Pipeline Stage Responsibilities
From `Docs/3D_QUALITY_PIPELINE.md` Stage Responsibilities Table (lines 68–91):
1. Inference → raw mesh (triangles, high-poly)
2. Open3D Analysis → topology diagnostics (but no repair)
3. Blender cleanup → remove floaters, rigging
4. UV Parameterization → xatlas (already done; we won't change)
5. Mesh Optimization → meshoptimizer decimation (we'll add PyMeshLab alternative)
6. LOD Generation → cascade (will follow optimized mesh)
7. Collision → convex hull
8. QA → scoring
9. Export → ZIP archive

**What's Missing**:
- ❌ Mesh repair AFTER inference (non-manifold edges, degenerate faces, self-intersections)
- ❌ Aggressive decimation WITH quality gates (current meshoptimizer is decent but PyMeshLab QEC is better)
- ❌ PBR map baking (normal, AO, roughness, metallic)
- ❌ Final optimization/compression (gltf-transform)

### C. Integration Constraints (CRITICAL)
1. **Do NOT break the existing 11-stage generation lifecycle** — add behavior at the correct existing stage boundaries.
2. **Progress tracking must use `sync_publish()`** — frontend SSE streaming depends on it.
3. **All generated assets live under `model_output_dir(job_id)` or the existing centralized export storage root**.
4. **Celery task patterns must match the existing worker architecture** — retries, error handling and task IDs remain observable.
5. **Blender execution follows the existing `_run_blender()` / `_run_blender_remesh()` environment and timeout patterns.**
6. **Low-VRAM mode must remain supported** — Cycles can fall back to CPU and bake resolution may be reduced on OOM.
7. **`source.glb` is immutable** and is never overwritten by a derivative.
8. **Stage success requires validation** before the derivative becomes authoritative.
9. **ZIP creation is a worker concern, never an HTTP request concern.**
10. **Do not introduce duplicate helpers** where current project code already provides equivalent functionality; extend/reuse first.
11. **Do not treat "best effort" as success for the watertight gate.** A failed strict repair remains failed/blocked until a validator proves acceptance.
---

## PART 3: PRODUCTION TOOL STACK SPECIFICATION

### Tier 1: Mesh Repair (PyMeshLab + Trimesh)

**Tool Choice: PyMeshLab** (Python binding to MeshLab C++ engine)
- **Why**: Industry standard, C++ backend, proven quality, fully headless
- **Installation**: `pip install pymeshlab`
- **Key Operations**:
  ```python
  import pymeshlab as pml
  
  # Load mesh
  ms = pml.MeshSet()
  ms.load_new_mesh(input_glb)
  
  # Remove isolated vertices
  ms.apply_filter('remove_isolated_vertices')
  
  # Fix non-manifold edges (makes watertight)
  ms.apply_filter('remove_non_manifold_edges')
  
  # Remove degenerate faces (zero-area, corrupted)
  ms.apply_filter('remove_degenerate_faces')
  
  # Remove unreferenced vertices
  ms.apply_filter('remove_unreferenced_vertices')
  
  # Compute smooth normals
  ms.apply_filter('compute_normals_for_point_sets', k=10)
  
  # Save
  ms.save_current_mesh(output_glb)
  ```

**Strict Watertight Fallback Chain**
1. PyMeshLab cleanup and manifold repair.
2. Re-validate with Open3D/Trimesh topology checks.
3. If still not watertight, invoke **ManifoldPlus** as the first strict reconstruction fallback.
4. If ManifoldPlus is unavailable, incompatible with the deployment, or fails, invoke **Blender headless voxel remeshing** using the existing `_run_blender_remesh()` subprocess/environment pattern or a dedicated headless voxel-remesh helper.
5. Re-validate the resulting mesh after every fallback.

**Acceptance rule:** downstream Stage 2/3/4/5 work is allowed only when the accepted derivative passes the configured watertight/manifold checks. Never silently return a non-watertight mesh while setting `success=True`.

**Trimesh fallback** is limited to lightweight cleanup/normal correction and validation; it is **not** considered a watertight guarantee by itself.

**Tier 1 Validation**
- Detect: boundary edges, non-manifold edges, degenerate faces, non-finite coordinates, inconsistent winding, zero-area faces, disconnected components, and self-intersections where the available validator supports them.
- Record the repair route (`pymeshlab`, `manifoldplus`, `blender_voxel_remesh`) in metadata.
- If all strict repair routes fail, mark the repair stage as failed and preserve `source.glb`; do not claim the mesh is watertight.

---

### Tier 2: Decimation (PyMeshLab Quadric Edge Collapse)

**Tool Choice: PyMeshLab** (same engine as Tier 1)
- **Why**: Quadric Edge Collapse is industry-standard, preserves silhouettes, fast
- **Quality**: ⭐⭐⭐⭐⭐ (used in professional asset pipelines)
- **Speed**: 10–20 sec for 500k→20k triangles
- **API**:
  ```python
  ms = pml.MeshSet()
  ms.load_new_mesh(input_glb)
  
  # Core decimation function
  ms.apply_filter(
    'simplify_mesh_quadric_edge_collapse_decimation',
    targetfacecount=target_faces,  # e.g., 20000
    targetpercentage=0,  # ignored if targetfacecount set
    quality_threshold=0.3,  # 0–1, higher = better quality, slower
    preserve_border=True,  # keep edges on UV seams
    preserve_normal=True,  # try to keep surface normal flow
    preserve_topology=False,  # allow topology changes (faster)
    quality_weight=1.0,  # weight for quality vs speed
    update_rate=5,  # progress update frequency
    autoclean=True,  # remove isolated vertices after
  )
  
  # Save result
  ms.save_current_mesh(output_glb)
  ```

**Quality Gates** (Post-Decimation Validation):
- Use Open3D: Check manifoldness preserved, no self-intersections introduced
- Compare bounding boxes: New mesh must fit within 105% of original
- If validation fails: Log warning, skip decimation, use original

**Fallback**: If PyMeshLab decimation fails, use existing `meshoptimizer` (already in pipeline)

**Target Polycount Strategy**:
- Mobile: 5k–8k triangles
- Low-End PC: 10k–15k
- Medium: 15k–25k
- High: 25k–50k
- Cinematic: 50k–100k

---

### Tier 3: UV Unwrapping (xatlas-python)

**Tool Choice: xatlas** (Fast, zero-configuration, conformal mapping)
- **Why**: <1 second per model, automatic seam generation, optimal packing, industry-proven
- **Installation**: `pip install xatlas`
- **Quality**: ⭐⭐⭐⭐⭐ (conformal parameterization + chart packing)
- **API Pattern**:
  ```python
  import xatlas
  import trimesh

  # Load mesh
  mesh = trimesh.load(input_glb)

  # Create xatlas model
  atlas = xatlas.Atlas()
  atlas.add_mesh(mesh.vertices, mesh.faces)

  # Generate UVs (automatic seams)
  atlas.generate()  # Automatic seam detection + chart packing

  # CRITICAL: xatlas duplicates source vertices at UV seams.
  vmapping, indices, uvs = atlas[0]

  # Rebuild geometry using the NEW xatlas topology BEFORE assigning UVs.
  rebuilt_vertices = mesh.vertices[vmapping]
  rebuilt_faces = indices

  new_mesh = trimesh.Trimesh(
      vertices=rebuilt_vertices,
      faces=rebuilt_faces,
      process=False,
  )
  new_mesh.visual = trimesh.visual.TextureVisuals(uv=uvs)

  # Validate array/index agreement before export.
  assert len(new_mesh.vertices) == len(uvs)
  assert len(new_mesh.faces) == len(indices)
  assert len(new_mesh.faces) == 0 or int(new_mesh.faces.max()) < len(new_mesh.vertices)

  mesh = new_mesh
  mesh.export(output_glb)
  ```

**Fallback**: If xatlas fails (rare), use Blender `bpy.ops.uv.smart_project()` (headless)
- Slower (30–60 sec) but proven fallback

**Configuration Parameters** (For Tweaking if Needed):
- `packing_density=0.9` — Island packing tightness (0–1, higher = tighter)
- `margin=0.001` — Padding between islands (in UV space, prevents bleeding)
- `angle_threshold=66.0` — Seam angle (degrees, higher = fewer seams)

---

### Tier 4: PBR Map Baking (Blender Cycles Headless)

**Tool Choice: Blender Cycles** (ONLY production-grade free option)
- **Why**: MikkTSpace normal baking (industry standard), GPU + CPU, proven quality
- **Installation**: Blender 4.x binary (already have)
- **Render Engine**: Cycles (GPU if CUDA available, CPU fallback)

**Maps Generated** (4-Map PBR Standard):

#### Map 1: Normal Map (Tangent Space)
- **Purpose**: Surface detail/depth on low-poly model
- **Source**: High-poly mesh geometry detail
- **Bake Operator**: `bpy.ops.object.bake(type='NORMAL', ..., normal_space='TANGENT')`
- **Resolution**: 2K (2048×2048) default; 1K/4K configurable
- **Required bake bounds**: `cage_extrusion=0.02`, `max_ray_distance=0.05`
- **Color space**: Non-Color / data (not sRGB)
- **Validation**: reject maps dominated by black pixels or invalid/non-finite values

#### Map 2: Ambient Occlusion (AO)
- **Purpose**: Pre-baked shadow information for real-time perf optimization
- **Source**: Global illumination computation
- **Bake Operator**: `bpy.ops.object.bake(type='AO', ...)`
- **Resolution**: 2K
- **Output**: PNG, Non-Color / data (grayscale)

#### Map 3: Roughness Map
- **Purpose**: Material roughness variation
- **Source**: Provider/material metadata when available; conservative curvature/albedo fallback otherwise
- **Important**: AI albedo can contain baked lighting, so it must not be treated as physically authored material data.
- **Strategy**: Generate a restrained roughness estimate and **hard-clamp all values to 0.2–0.85** before writing.
- **Resolution**: 2K
- **Output**: PNG, Non-Color / data (grayscale)

#### Map 4: Metallic Map
- **Purpose**: Specular/metallic surface indication
- **Default**: **0.0**
- **Override**: Non-zero metallic values are allowed only when explicitly defined by provider metadata, source material, or an explicit user setting.
- **Do not** classify gray albedo pixels as metal; baked lighting makes that heuristic unsafe.
- **Resolution**: 2K
- **Output**: PNG, Non-Color / data (grayscale)

**Headless Blender Script Pattern** (To Be Implemented) — **Bake Bounds Are Mandatory**:
```python
import bpy
import sys

# Arguments: input_highpoly_glb, input_base_texture, output_dir, resolution

input_highpoly = sys.argv[-3]
input_base_tex = sys.argv[-2]
output_dir = sys.argv[-1]

# Load high-poly mesh
bpy.ops.import_scene.gltf(filepath=input_highpoly)

# Load base texture (albedo)
bpy.ops.image.open(filepath=input_base_tex)

# Setup materials + baking
# ... (detailed implementation in Phase 4)

# Configure selected-to-active cage/ray limits.
# These defaults prevent distant-ray misses and black normal-map artifacts.
scene = bpy.context.scene
scene.render.bake.use_clear = True
scene.render.bake.cage_extrusion = 0.02
scene.render.bake.max_ray_distance = 0.05

# High-poly source must be selected; low-poly target must be active.
# Keep normal bake in tangent/MikkTSpace workflow.
bpy.ops.object.bake(
    type='NORMAL',
    use_selected_to_active=True,
    normal_space='TANGENT',
    filepath=f'{output_dir}/normal.png',
)

# AO bake
bpy.ops.object.bake(
    type='AO',
    filepath=f'{output_dir}/ao.png',
)

# Roughness:
# - Derive variation from curvature/albedo only when no explicit provider/material data exists.
# - Clamp every channel to [0.2, 0.85] before writing the map.
# - Avoid generating a uniform 0 or 1 map.
#
# Metallic:
# - DEFAULT = 0.0 everywhere.
# - Only use non-zero metallic values when provider metadata, source material,
#   or an explicit user setting positively identifies metallic regions.
# - Do not infer metallic from "gray albedo" alone.

# Save data maps as Non-Color / Linear in Blender.
# Normal, AO, Roughness and Metallic are data textures, not sRGB color textures.

# Export with embedded maps
bpy.ops.export_scene.gltf(filepath=f'{output_dir}/output.glb', ...)
```

**Performance Estimates**:
- Normal bake (2K, 20k-tri mesh): 30–60 sec
- AO bake (2K, ray-traced): 60–180 sec (depends on complexity)
- Per-map parallelizable (can bake multiple maps in parallel on multi-GPU)

**GPU/VRAM Handling**:
- GPU preferred (10x faster); CPU fallback if no CUDA
- Set `bpy.context.scene.cycles.device_type = 'GPU'` or `'CPU'`
- Handle OOM: Reduce bake resolution if fails

---

### Tier 5: Optimization & Compression (gltf-transform CLI)

**Tool Choice: gltf-transform** (CLI tool, Draco + WebP compression)
- **Why**: Production-proven, single CLI call, 2–10x reduction
- **Runtime requirement**: **Node.js LTS + npm are mandatory on the server** because the `gltf-transform` CLI is a Node.js application.
- **Installation**: `npm install -g @gltf-transform/cli`
- **Verification**: `node --version`, `npm --version`, `gltf-transform --help`
- **Operations**:
  ```bash
# Geometry compression (Draco)
gltf-transform draco input.glb draco.glb

# Texture compression (WebP)
gltf-transform webp draco.glb output.glb

# Or use the optimize command for the supported optimization set:
gltf-transform optimize input.glb output.glb --texture-compress webp

# IMPORTANT: confirm installed CLI flags before enabling any optional
# compression arguments because CLI versions can differ.
gltf-transform --help
```

**Compression Benefits**:
- Draco and texture compression can reduce payload size substantially; actual ratios vary by asset.
- Optimize output must remain structurally valid glTF/GLB.

**Tradeoffs**:
- Draco adds decode work on the client/runtime.
- WebP support varies across game engines, importers and browser/runtime combinations; compatibility is a target-specific requirement, not a universal guarantee.
- Keep a validated uncompressed/PNG-compatible fallback artifact when the selected runtime does not support the compressed representation.

---

## PART 4: COMPLETE 6-STAGE PIPELINE ARCHITECTURE

### Stage 1: Strict Mesh Repair & Watertight Acceptance Gate
```
INPUT: Raw high-poly GLB from inference
│
├─ Preserve immutable source.glb
├─ PyMeshLab cleanup:
│    • remove isolated vertices
│    • remove degenerate faces
│    • remove unreferenced vertices
│    • remove non-manifold edges
├─ Validate watertight + manifold + finite geometry
├─ IF NOT watertight:
│    ├─ ManifoldPlus reconstruction
│    └─ IF unavailable/fails: Blender headless voxel remesh
├─ Re-validate after every fallback
│
OUTPUT: Validated watertight/manifold derivative OR BLOCKED stage
```
**File**: `backend/app/core/post_processing/mesh_repair.py` (NEW/EXTEND)
**Function**: `repair_mesh_strict(input_path, output_path) → dict`
**Acceptance**: `success=True` only when validation proves the required watertight/manifold invariants.
**Failure policy**: Preserve `source.glb` and mark the derivative blocked; do not silently downgrade "watertight" to best-effort.

---

### Stage 2: Decimation to Game-Ready Polycount (PyMeshLab QEC)
```
INPUT: Cleaned high-poly mesh (500k tris)
│
├─ Determine target polycount (based on platform setting)
├─ Apply Quadric Edge Collapse Decimation
├─ Preserve borders (UV seams, hard edges)
├─ Preserve normals (smooth shading)
├─ Validate output (Open3D: manifoldness, silhouette)
│
OUTPUT: Low-poly game-ready mesh (e.g., 20k triangles)
```
**File**: `backend/app/core/post_processing/decimation.py` (NEW)
**Function**: `decimate_pymeshlab(input_path, output_path, target_faces, quality_threshold) → dict`
**Time**: 10–20 sec
**Fallback**: Use existing meshoptimizer if PyMeshLab fails
**Target Platform Mapping**:
- Mobile: 5k–8k
- Low-End: 10k–15k
- Medium: 15k–25k
- High: 25k–50k
- Cinematic: 50k–100k

---

### Stage 3: Automatic UV Unwrapping (xatlas)
```
INPUT: Decimated game-ready mesh (20k tris, no UVs or broken UVs)
│
├─ Load mesh into xatlas
├─ Automatic seam detection + chart generation
├─ Optimal UV island packing
├─ Minimal distortion (conformal mapping)
│
OUTPUT: Reconstructed mesh with complete, valid UV coordinates; xatlas-created seam vertices are represented explicitly in the exported topology.
```
**File**: `backend/app/core/post_processing/uv_unwrap.py` (NEW)
**Function**: `unwrap_uvs_xatlas(input_path, output_path, packing_density=0.9) → dict`
**Time**: <1 second
**Fallback**: Blender Smart Project (30–60 sec) if xatlas fails

---

### Stage 4: PBR Map Baking (Blender Cycles)
```
INPUT: Decimated game-ready mesh (20k tris, with UVs)
       + Original high-poly mesh (500k tris)
       + Base texture from inference (albedo.png)
│
├─ Setup Blender materials
├─ Bake Normal Map (high→low poly detail)
├─ Bake Ambient Occlusion (pre-baked shadows)
├─ Bake Roughness Map (conservative heuristic + clamp 0.2–0.85)
├─ Set Metallic Map to 0.0 unless explicitly defined
├─ Embed all maps into glTF material
│
OUTPUT: Game-ready mesh + 4 baked PBR textures (PNG) embedded in GLB
```
**File**: `backend/app/core/post_processing/pbr_bake.py` (NEW)
**Function**: `bake_pbr_maps_blender(highpoly_path, lowpoly_path, base_texture_path, output_dir, resolution='2k') → dict`
**Time**: 2–3 minutes total (normal: 30–60 sec, AO: 60–180 sec)
**Fallback**: If baking fails, continue with unbakedmesh (don't fail pipeline)
**GPU Handling**: Cycles auto-selects GPU or falls back to CPU
**Resolution Options**: 1k, 2k (default), 4k

---

### Stage 5: Final Optimization & Compression (gltf-transform)
```
INPUT: Game-ready GLB with PBR maps (high file size, e.g., 100 MB)
│
├─ Apply Draco geometry compression (2–10x reduction)
├─ Convert textures to WebP (3–5x reduction)
├─ Optimize material definitions
├─ Embed metadata (pipeline version, quality score)
│
OUTPUT: Optimized GLB (5–15x smaller, e.g., 10 MB)
```
**File**: `backend/app/core/post_processing/optimize.py` (NEW)
**Function**: `optimize_glb_gltftransform(input_path, output_path, enable_draco=True, texture_format='webp') → dict`
**Time**: 2–5 sec
**Fallback**: Return uncompressed GLB if gltf-transform fails

---

### Stage 6: Async Pre-Packaged Export (Celery)
```
INPUT: All finalized job artifacts
  • source.glb
  • active/game_ready GLB
  • PBR textures/materials
  • LODs (if enabled)
  • collision (if enabled)
  • QA report
  • thumbnail
  • export metadata/manifest
│
├─ Dispatch Celery package task after Stage 5 succeeds
├─ Re-validate every included file exists and is under model_output_dir(job_id)
├─ Build ZIP in a worker-local temporary path
├─ Write deterministic manifest + optional SHA-256 checksums
├─ Atomically rename temp ZIP → final static ZIP
├─ Persist package_status=ready + package_url + package_path
│
OUTPUT: Pre-generated static ZIP package
```
**File**: `backend/app/workers/tasks.py` (new Celery task) plus a minimal reusable packaging helper such as `backend/app/core/export_packager.py`.

**Function**: `package_export_bundle(job_id, export_spec) → dict`

**Time**: 1–15+ sec depending on asset size; must not consume the API request worker.

**HTTP Contract**:
- `POST /api/v1/project/export` with `packageZip=true` MUST NOT generate, optimize, bake, LOD-generate, collision-generate, QA-generate, or ZIP files.
- The endpoint resolves an already-generated package and returns a fast redirect/URL (or a small JSON payload containing the static URL).
- If the requested package is not ready, return a non-blocking `202`/`409` response with package status metadata; never fall back to synchronous ZIP generation.
- The frontend downloads the static URL directly rather than buffering the ZIP through the FastAPI process.

**Idempotency**:
- Hash the normalized export spec (variant, format, include flags, target platform, LOD settings) and use it as a package key.
- If an identical package already exists and its manifest matches, return the existing URL.
- Use a lock or atomic rename to prevent duplicate/racing ZIP writers.

**Security**:
- Every archived path must resolve beneath the job's storage root.
- Reject symlinks that escape the job directory.
- Sanitize archive filenames.
- Never trust client-supplied filesystem paths.

## PART 5: INTEGRATION WITH EXISTING PIPELINE

### Repository-Aware Integration Rules

The current project snapshot already implements much of the canonical 11-stage lifecycle. **Do not duplicate existing functionality.** Read `AGENTS.md`, trace the current call chain, then extend shared helpers in place.

The existing generation worker currently performs:
1. Source preservation (`source.glb`)
2. Open3D analysis / decision
3. Conservative cleanup
4. Blender post-processing
5. xatlas UV validation/parameterization
6. Game-ready mesh optimization
7. LOD generation (optional)
8. Collision generation (optional)
9. QA diagnostics
10. Thumbnail + mesh stats
11. Job finalization

The new blueprint stages are **post-processing sub-stages**, not replacements for those 11 lifecycle stages:
- Stage 1 — strict watertight repair gate
- Stage 2 — deterministic decimation/retopology policy
- Stage 3 — authoritative xatlas UV reconstruction
- Stage 4 — bounded PBR baking + material heuristics
- Stage 5 — gltf-transform optimization
- Stage 6 — async pre-packaged export

### Exact Current-Code Touchpoints

**`backend/app/core/mesh_optimizer.py`**
- Reuse `generate_uvs_with_xatlas()`.
- Preserve the existing `mesh.vertices[vmapping]` + `indices` reconstruction pattern.
- Do not regress it back to `mesh.visual.uv = uvs[mesh.faces]`.
- Reuse `optimize_mesh()`, `generate_lods()`, `generate_collision_mesh()` instead of introducing duplicate implementations.

**`backend/app/core/blender/pipeline.py`**
- Reuse `_run_blender()` for headless Blender execution.
- Reuse the environment setup/timeout/error pattern.
- New baking and voxel-remesh scripts must be separate helpers/scripts only where the shared runner cannot express the operation.

**`backend/app/workers/tasks.py`**
- Insert strict watertight repair after source preservation and canonical analysis, before operations that assume manifold geometry.
- Keep decimation before authoritative UV generation if decimation changes topology.
- Run PBR baking only after the final low-poly mesh has authoritative UVs.
- Run gltf-transform only after material/PBR assembly is finalized.
- After QA and thumbnail/stat generation, dispatch Stage 6 package creation asynchronously.
- Do not call `zipfile.ZipFile(...)` from the FastAPI export route.

### Required Stage Flow in the Worker

```python
# A. Preserve immutable source
source_glb = model_output_dir(job_id) / "source.glb"

# B. Stage 1: strict watertight repair
#    Accept only a validated watertight derivative.
repair_result = repair_mesh_strict(master_glb, ...)

# C. Stage 2: decimate/retopologize
#    Keep existing optimize_mesh()/Blender path where it already matches requirements.
optimized_result = optimize_mesh(...)

# D. Stage 3: authoritative UVs
#    Existing helper already rebuilds vertices/faces for xatlas seam duplication.
uv_mesh, uv_changed = generate_uvs_with_xatlas(mesh)

# E. Stage 4: PBR bake
#    High-poly selected + low-poly active; bounded bake rays.
pbr_result = bake_pbr_maps_blender(...)

# F. Stage 5: final glTF optimization
optimized_glb = optimize_glb_gltftransform(...)

# G. Existing LOD / collision / QA / thumbnail lifecycle
#    Preserve current worker helpers and ordering.

# H. Stage 6: enqueue package worker; NEVER build ZIP inline.
package_job = package_export_bundle.apply_async(
    kwargs={"job_id": job_id, "export_spec": package_spec}
)

# Store package_pending/package_job_id, continue without blocking.
```

### Stage 6 Export Endpoint Contract

```python
@router.post("/export")
async def export_project(req: ExportRequest):
    if req.packageZip:
        # FAST PATH ONLY:
        # 1. resolve expected package key
        # 2. lookup package metadata/status
        # 3. if ready, return redirect/URL to static ZIP
        # 4. if not ready, return package status (never create ZIP here)
        return package_url_or_status(req)

    # Existing single-file export behavior may remain,
    # but must not perform ZIP packaging or hidden heavy pipeline work.
```

### Anti-Pattern — Must Be Removed

```python
if req.packageZip:
    with zipfile.ZipFile(...):
        # NEVER DO THIS IN THE HTTP REQUEST
```

Also remove request-time fallbacks that silently run:
- LOD generation
- collision generation
- QA generation
- game-ready optimization

Those artifacts must be produced by the generation worker when requested, then consumed by Stage 6.

## PART 6: NEW DATABASE & SCHEMA FIELDS

### Update: `backend/app/models/job.py`

Prefer extending `processing_metadata` initially if the current schema is intentionally lightweight. Add dedicated columns only when the UI/API requires indexed querying. The minimum required package state is:

```python
# Recommended package tracking fields
package_status: str = "disabled"  # disabled | pending | ready | failed
package_url: str | None = None
package_path: str | None = None
package_job_id: str | None = None
package_error: str | None = None
package_spec_hash: str | None = None

# Existing/required post-processing tracking
pbr_maps_generated: bool = False
pbr_resolution: str = "2k"
use_pymeshlab: bool = True
compress_output: bool = True
post_processing_metadata: dict | None = None
```

**Important:** The current repository already has `processing_metadata` and `download_urls`. Reuse them where practical instead of creating duplicate state.

### Update: `backend/app/schemas/generation.py`

Extend the existing game-ready fields rather than introducing duplicate request models:

```python
# Post-processing options
enable_mesh_repair: bool = True
strict_watertight: bool = True
use_pymeshlab_decimation: bool = True
target_polycount: int = 30000
quality_threshold: float = 0.3

generate_pbr: bool = True
pbr_resolution: str = "2k"

compress_output: bool = True

# Final package
prepackage_export: bool = True
include_lods_in_package: bool = True
include_collision_in_package: bool = True
include_qa_in_package: bool = True
```

Keep field validation bounded:
- `pbr_resolution`: `1k | 2k | 4k`
- `target_polycount`: sane platform bounds
- `quality_threshold`: `0.0–1.0`
- package include flags must not trigger extra work after generation; they only select already-produced artifacts for Stage 6.

### Export Package Status in Response Metadata

Expose enough state for the frontend to know whether the package is ready without polling the ZIP endpoint itself:

```json
{
  "package": {
    "status": "pending|ready|failed|disabled",
    "url": "/static/exports/packages/<job_id>/<spec_hash>/asset_export_package.zip",
    "job_id": "<celery-task-id>",
    "spec_hash": "<stable-hash>"
  }
}
```

## PART 7: NEW FILE STRUCTURE (What to Create)

**New Folder**: `backend/app/core/post_processing/` (NEW)

**Files to Create**:
1. `__init__.py` — Module exports
2. `mesh_repair.py` — PyMeshLab repair orchestrator
3. `decimation.py` — PyMeshLab decimation
4. `uv_unwrap.py` — xatlas UV unwrapping
5. `pbr_bake.py` — Blender Cycles baking + orchestration
6. `optimize.py` — gltf-transform CLI wrapper
7. `validators.py` — Post-processing validation (Open3D/Trimesh checks)
8. `export_packager.py` — deterministic ZIP manifest + atomic packaging
9. `blender_scripts/bake_pbr.py` — bounded Cycles baking
10. `blender_scripts/voxel_remesh.py` — strict watertight fallback

**Dependencies to Add** (backend/requirements.txt):
```
pymeshlab>=0.2.11
xatlas>=0.0.9
# fast-simplification may be required by existing trimesh decimation paths
# blender comes separately (binary)
# gltf-transform comes via npm / Node.js LTS
# trimesh, open3d already present

# Server-level dependencies (NOT pip requirements):
# - Node.js LTS
# - npm
# - Blender 4.x
# - Optional: ManifoldPlus binary (license/deployment compatibility MUST be verified)
```

**Frontend Scripts** (NEW):
- `scripts/install_postprocessing_deps.sh` — Install/verify Python packages, Node.js/npm tooling, gltf-transform, Blender and optional watertight fallback binaries.
- Do not reinstall packages already pinned/installed by the current backend requirements; verify first and extend only where required.

---

## PART 8: STARTUP VERIFICATION CHECKLIST

**Before implementing, VERIFY** (AI Must Check):

- [ ] `backend/app/workers/tasks.py` exists and current stage count is 11
- [ ] `backend/app/core/mesh_optimizer.py` has `_run_blender_remesh()` function
- [ ] `backend/app/models/job.py` has GenerationJob model
- [ ] `backend/app/schemas/generation.py` has GenerationRequest schema
- [ ] `Docs/3D_QUALITY_PIPELINE.md` shows 11-stage flowchart
- [ ] Blender 4.x binary is installed (`which blender`)
- [ ] Node.js LTS + npm are installed (`node --version`, `npm --version`)
- [ ] `gltf-transform --help` succeeds
- [ ] Python venv at `backend/.venv` with trimesh, open3d, xatlas, pymeshlab
- [ ] Optional ManifoldPlus binary is installed and license-approved OR Blender voxel fallback is verified
- [ ] Redis + PostgreSQL running (for async tasks)
- [ ] Celery worker can execute a packaging task
- [ ] `bash scripts/setup.sh` executes without errors
- [ ] No ZIP creation remains in the FastAPI `/export` request path

**After Implementation, Test**:
- [ ] Existing tests still pass: `pytest backend/tests/ -v`
- [ ] Single generation job preserves the existing 11-stage lifecycle while executing the new post-processing sub-stages in the correct order
- [ ] Strict watertight gate rejects/repairs non-watertight geometry before downstream stages
- [ ] xatlas seam-duplicated topology remains valid and passes vertex/face/UV consistency checks
- [ ] Output GLB is valid + has PBR maps embedded when enabled
- [ ] Roughness values are clamped to 0.2–0.85
- [ ] Metallic defaults to 0.0 when no explicit material data exists
- [ ] Stage 6 ZIP is created by Celery, not FastAPI
- [ ] Export endpoint returns a static ZIP URL/redirect without creating the archive
- [ ] gltf-transform output passes a post-optimization GLB validity check

---

## PART 9: STEP-BY-STEP IMPLEMENTATION TODOs

### PHASE 1: Setup Infrastructure (1 day)
- [ ] Create `backend/app/core/post_processing/` folder + `__init__.py`
- [ ] Reuse `processing_metadata` and/or add only the package/PBR fields actually required by API/UI
- [ ] Add validated post-processing/package fields without duplicating existing generation options
- [ ] Create `scripts/install_postprocessing_deps.sh`
- [ ] Update `backend/requirements.txt`
- [ ] Run dependency installation, verify imports work

### PHASE 2: Strict Watertight Repair (1–2 days)
- [ ] Create/extend `backend/app/core/post_processing/mesh_repair.py`
- [ ] Implement PyMeshLab cleanup
- [ ] Validate watertight/manifold state
- [ ] Add ManifoldPlus fallback
- [ ] Add Blender headless voxel-remesh fallback
- [ ] Re-validate after each fallback
- [ ] Preserve `source.glb`; never overwrite the master
- [ ] Add a hard acceptance gate so downstream stages never receive an unvalidated "watertight" mesh
- [ ] Test open/raw AI meshes, non-manifold meshes, and already-watertight meshes

### PHASE 3: Decimation (1 day)
- [ ] Create `backend/app/core/post_processing/decimation.py`
- [ ] Implement `decimate_pymeshlab()` function
- [ ] Add quality gates (manifoldness, silhouette preservation)
- [ ] Add platform-based target polycount mapping
- [ ] Test with high-poly (500k) → low-poly (20k)

### PHASE 4: UV Unwrapping (0.5–1 day)
- [ ] Reuse/extend `generate_uvs_with_xatlas()` rather than duplicating xatlas logic
- [ ] Explicitly reconstruct `vertices = source_vertices[vmapping]` and `faces = indices`
- [ ] Assign `uvs` directly to the reconstructed mesh
- [ ] Verify `len(vertices) == len(uvs)` and every face index is in range
- [ ] Verify finite UVs, bounds, and chart coverage
- [ ] Add Blender Smart Project fallback if xatlas fails
- [ ] Add regression test specifically for UV seam vertex duplication

### PHASE 5: PBR Map Baking (2 days)
- [ ] Create/extend `backend/app/core/post_processing/pbr_bake.py`
- [ ] Create/update Blender headless bake script
  - [ ] Setup high-poly selected + low-poly active
  - [ ] Set `scene.render.bake.cage_extrusion = 0.02`
  - [ ] Set `scene.render.bake.max_ray_distance = 0.05`
  - [ ] Bake Normal in tangent/MikkTSpace space
  - [ ] Bake AO
  - [ ] Generate Roughness with a hard [0.2, 0.85] clamp
  - [ ] Default Metallic to 0.0 unless explicitly defined
  - [ ] Set Normal/AO/Roughness/Metallic images to Non-Color/data
  - [ ] Validate maps before embedding
  - [ ] Embed maps into the GLB material definition
- [ ] Add GPU/CPU handling for Cycles
- [ ] Add resolution presets (1k/2k/4k)
- [ ] Test for black-ray artifacts and detail loss
- [ ] Test with models of different unit scales

### PHASE 6: Final Optimization (0.5–1 day)
- [ ] Create/extend `backend/app/core/post_processing/optimize.py`
- [ ] Implement `optimize_glb_gltftransform()` using the installed CLI
- [ ] Verify Node.js/npm/glTF Transform toolchain before runtime
- [ ] Validate optimized GLB before replacing active output
- [ ] Do not assume WebP is universally supported by every game runtime; make compatibility an explicit target setting

### PHASE 7: Async Package Worker (0.5–1 day)
- [ ] Create `export_packager.py`
- [ ] Add Celery task `package_export_bundle`
- [ ] Build ZIP to a temporary file inside the worker
- [ ] Write deterministic manifest/checksums
- [ ] Atomically rename to final static location
- [ ] Persist package status, URL, task ID and spec hash
- [ ] Make packaging idempotent
- [ ] Ensure package failures do not invalidate an already-valid GLB
- [ ] Ensure the API never packages ZIPs

### PHASE 8: Pipeline Integration (1–2 days)
- [ ] Update `backend/app/workers/tasks.py`
  - [ ] Insert strict watertight gate
  - [ ] Reuse existing xatlas reconstruction
  - [ ] Add bounded PBR baking
  - [ ] Add gltf-transform optimization
  - [ ] Dispatch Stage 6 package task after final artifacts are ready
  - [ ] Publish package progress via `sync_publish()`
  - [ ] Store package status/URL
  - [ ] Add error handling + explicit fallbacks
- [ ] Update Job metadata/schema only where necessary
- [ ] Update `backend/app/api/v1/project.py` so ZIP requests are lookup/redirect only
- [ ] Remove request-time LOD/collision/QA generation from ZIP packaging path
- [ ] Verify existing 11-stage lifecycle still works
- [ ] Test with post-processing flags disabled and package disabled

### PHASE 9: Documentation (1 day)
- [ ] Update `Docs/3D_QUALITY_PIPELINE.md` (watertight gate, bounded PBR, async package flow)
- [ ] Update `Docs/GAME_READY_SPEC.md` (PBR scoring + watertight acceptance)
- [ ] Create `Docs/POST_PROCESSING_PIPELINE.md` only if the detail cannot live in the existing docs
- [ ] Update `Docs/api-documentation.md` (package status + static ZIP URL contract)
- [ ] Add concise README to `backend/app/core/post_processing/` only when the folder needs standalone operational guidance

### PHASE 10: Testing (1–2 days)
- [ ] Extend/create `backend/tests/test_post_processing.py` and the existing pipeline/export self-check.
  - [ ] Repair: hole/non-manifold input → validated watertight derivative or explicit blocked result
  - [ ] xatlas: seam duplication produces matching vertex/face/UV arrays and valid indices
  - [ ] Decimation: high-poly → target budget with quality validation
  - [ ] PBR: Normal/AO/Roughness/Metallic outputs exist and are valid
  - [ ] PBR bounds: `cage_extrusion=0.02`, `max_ray_distance=0.05`
  - [ ] Roughness: no value outside 0.2–0.85
  - [ ] Metallic: all zeros when no explicit material data exists
  - [ ] Optimize: output GLB validates
  - [ ] Package: Celery creates the ZIP; API export does not
- [ ] Run full test suite: `pytest backend/tests/ -v`
- [ ] E2E test: text→3D with all post-processing and async package enabled
- [ ] Performance test: report generation and package latency separately

### PHASE 11: Deployment (1 day)
- [ ] Update `scripts/setup.sh` to install new dependencies
- [ ] Update `backend/requirements.txt`
- [ ] Test 1-click startup: `bash scripts/setup.sh`
- [ ] Verify Celery workers load new post-processing modules
- [ ] Run production load test

---

## PART 10: VALIDATION & SUCCESS CRITERIA

### Pre-Submission Checklist (AI Must Verify)

**Code Quality (10 points)**
- [ ] All new modules follow existing code style (snake_case, type hints)
- [ ] Error handling at each stage (try/except + explicit fallback)
- [ ] Logging at INFO level for progress, DEBUG for details
- [ ] Zero hardcoded storage paths (use `model_output_dir()`, settings, env vars)
- [ ] Heavy CLI work uses subprocesses with timeouts
- [ ] ZIP work executes only in Celery workers
- [ ] Stage outputs are atomically finalized

**Integration (10 points)**
- [ ] `tasks.py` properly publishes progress (`sync_publish()`)
- [ ] All new stages have metadata tracking in `meta`
- [ ] Optional flags work without bypassing validation
- [ ] Existing 11-stage lifecycle is preserved; no stage silently removed or renumbered
- [ ] Job/package state is persisted
- [ ] `/export?packageZip=true` contains no ZIP writer or heavy generation code
- [ ] Node.js/glTF Transform runtime is verified at startup

**Testing (10 points)**
- [ ] Unit tests for repair, decimation, UV, PBR, optimization and packaging
- [ ] Regression test: xatlas UV seam duplication
- [ ] Regression test: watertight fallback chain
- [ ] Regression test: bounded Blender bake distances
- [ ] Regression test: Roughness clamp [0.2, 0.85]
- [ ] Regression test: Metallic default 0.0
- [ ] Integration test: E2E generation with all post-processing
- [ ] Regression test: existing 11-stage lifecycle still passes
- [ ] Export API test: package request never creates ZIP inline
- [ ] Update `scripts/test_pipeline_and_export.py`: ZIP tests call/observe the Celery packaging task or a prepared package fixture; they must no longer expect `export_project()` to synchronously create a ZIP.
- [ ] All tests pass: `pytest backend/tests/ -v`

**Output Quality (10 points)**
- [ ] Repair: accepted derivative passes watertight/manifold gate
- [ ] Decimate: output silhouette/volume remains within configured tolerance
- [ ] UV: vertex/face/UV array lengths are consistent; indices are in range; UVs are finite and bounded
- [ ] PBR: up to 4 maps present when enabled
  - [ ] Normal map: tangent-space, Non-Color, no black-ray artifact pattern
  - [ ] AO map: Non-Color, grayscale, not catastrophically black
  - [ ] Roughness: every value clamped to 0.2–0.85
  - [ ] Metallic: 0.0 unless explicitly defined
- [ ] Optimize: output GLB passes structural validation
- [ ] Package: ZIP manifest lists all included artifacts and archive paths stay under expected package root

**Documentation (5 points)**
- [ ] Pipeline docs describe the strict watertight gate
- [ ] Pipeline docs describe xatlas seam duplication reconstruction
- [ ] PBR docs include bake ray bounds and material clamps
- [ ] API docs define async package status + static ZIP URL behavior
- [ ] Deployment docs list Node.js LTS/npm as mandatory server dependencies
- [ ] Performance benchmarks separate generation time from packaging time

**Startup (5 points)**
- [ ] `bash scripts/setup.sh` runs without errors
- [ ] All new dependencies install successfully
- [ ] FastAPI starts on port 8000
- [ ] Celery workers load new modules
- [ ] Redis/PostgreSQL work with new schema

**FINAL SUCCESS CRITERIA**:
- ✅ Raw AI output → 2–5 minute pipeline → game-ready GLB
- ✅ Automatic (no manual intervention)
- ✅ PBR maps are correctly classified as data textures and generated with bounded heuristics
- ✅ Optimized GLB is structurally valid and target-runtime compatible
- ✅ Async ZIP package is generated by Celery and exposed by static URL
- ✅ All tests pass
- ✅ 1-click deployment works
- ✅ Backward compatible with the existing 11-stage lifecycle

---

## PART 11: CRITICAL IMPLEMENTATION NOTES

### For Mesh Repair Stage:
- PyMeshLab is stateful; use a fresh `MeshSet()` per isolated operation where appropriate.
- Always call `save_current_mesh()` explicitly.
- `remove_non_manifold_edges` is not a sufficient watertight guarantee for arbitrary raw AI geometry.
- Use a strict validate → fallback → revalidate chain.
- ManifoldPlus is a separate native binary; deployment/licensing must be checked before enabling it.
- Blender voxel remeshing is the secondary in-process/headless fallback when strict reconstruction is still required.

### For Decimation Stage:
- `preserve_border=True` is CRITICAL (keeps UV seam edges)
- `preserve_normal=True` keeps smooth shading flow
- Quality threshold (0–1): 0.3 is aggressive, 0.5+ is conservative
- Always validate post-decimation with Open3D (silhouette check)

### For UV Unwrapping Stage:
- xatlas may duplicate vertices at UV seams.
- The authoritative reconstruction is `new_vertices = mesh.vertices[vmapping]` and `new_faces = indices`.
- Assign `uvs` to the reconstructed mesh; never index UVs with the old face array after xatlas topology changes.
- Validate `max(face_index) < len(vertices)` before export.
- Reuse the current project's already-correct `generate_uvs_with_xatlas()` implementation.
- Margin=0.001 is a reasonable default; tune only after a measurable texture-bleeding failure.

### For PBR Baking Stage:
- **MOST COMPLEX STAGE** — isolate the Blender script and validate every bake artifact.
- CRITICAL: high-poly selected + low-poly active for selected-to-active baking.
- Set `scene.render.bake.cage_extrusion = 0.02`.
- Set `scene.render.bake.max_ray_distance = 0.05`.
- Normal bake MUST use tangent space/MikkTSpace workflow.
- Normal/AO/Roughness/Metallic are Non-Color/data textures.
- Roughness is hard-clamped to 0.2–0.85.
- Metallic defaults to 0.0 unless explicit source/material metadata says otherwise.
- Before baking, normalize scene units or explicitly verify that the fixed ray distances are sensible for the model scale.

### For Optimization Stage:
- gltf-transform is a CLI wrapper, but it depends on Node.js LTS/npm.
- Validate the installed CLI version/flags with `gltf-transform --help`.
- Draco + texture compression can reduce size substantially, but actual ratios vary by asset.
- WebP is not universally interchangeable across all game runtimes; support must be tested for the target engine/runtime.
- Verify output GLB after compression before marking Stage 5 successful.

---

### For Async Packaging Stage:
- Never create ZIPs in `backend/app/api/v1/project.py`.
- The Celery worker owns package creation, retries and finalization.
- Build to `*.tmp` then atomically rename to the final `.zip`.
- Use a deterministic package spec hash for idempotency.
- Generate a manifest before finalizing the archive.
- Store package status and URL in job metadata.
- Package only files already produced by the generation pipeline; Stage 6 must not become a hidden second pipeline.
- A package failure must not delete or invalidate a valid GLB/game-ready result.
- The API should return a static URL/redirect when ready and a small pending/not-ready status otherwise.

## PART 12: TROUBLESHOOTING EDGE CASES

### If Mesh Repair Fails
- Raw AI geometry may contain actual holes that `remove_non_manifold_edges` cannot close.
- Run ManifoldPlus, then Blender headless voxel remeshing, revalidating after each.
- If no strict fallback produces a watertight mesh, do **not** pass the derivative downstream as successful.
- Preserve `source.glb` and mark the post-processing route as failed/blocked.
- A non-watertight output is never a valid "watertight stage fallback".

### If Decimation Fails
- Mesh might be non-manifold (should be fixed by repair)
- Fallback to existing meshoptimizer
- If both fail, log and use original mesh (don't crash pipeline)

### If UV Unwrapping Fails
- xatlas failures commonly surface when topology or array indexing is inconsistent.
- First verify seam-duplicated reconstruction (`vertices[vmapping]`, `faces=indices`) and index bounds.
- Ensure mesh is already accepted by the Stage 1 watertight/manifold gate.
- Fallback to Blender Smart Project.
- Do not silently export an invalid UV array just to keep the pipeline moving.

### If PBR Baking Fails
- Blender might not have CUDA support (falls back to CPU automatically)
- If high-poly mesh is corrupted, baking fails silently
- Continue pipeline WITHOUT PBR maps (don't crash)
- Log: "PBR baking skipped due to [error], proceeding without maps"

### If Compression Fails
- Verify `node`, `npm` and `gltf-transform` are installed.
- Verify the CLI syntax supported by the installed version.
- Fallback to a validated uncompressed GLB.
- Log the exact CLI error and preserve the previous valid artifact.
- Do not mark Stage 5 successful when the optimized file failed validation.

---

### If Async Packaging Fails
- The generation result remains valid; package state becomes `failed`.
- Retry the Celery package task using the same spec hash/idempotency key.
- Never regenerate the full 3D asset pipeline just because a ZIP failed.
- Verify all source files still exist and are under the job directory.
- Check for concurrent package writers and stale `.tmp` archives.
- The API must still return the direct GLB/game-ready URLs.

## PART 13: PERFORMANCE & SCALABILITY

### Timeline Per Model
```
Input: 500k triangles, textured
├─ Stage 1 Repair / Watertight Gate: 5–60+ sec (fallback dependent)
├─ Stage 2 Decimation/Retopology: 10–60 sec
├─ Stage 3 UV Unwrap (xatlas): usually sub-second to a few seconds
├─ Stage 4 PBR Baking: ~2–5 minutes depending on maps/resolution/GPU
├─ Stage 5 glTF Optimization: seconds to tens of seconds depending on textures
├─ Existing LOD/Collision/QA/Thumbnail lifecycle: variable
└─ Stage 6 ZIP Packaging: asynchronous; not on the API request critical path

TARGET: generation pipeline remains bounded and observable; packaging latency is reported separately.
```

### GPU Optimization (If Available)
- Cycles baking: Use GPU (10x faster than CPU)
- gltf-transform: Already fast (not GPU-bound)
- Overall: 2 minutes (GPU) vs 5 minutes (CPU)

### Parallelization Opportunities
- Multiple independent post-processing workloads may be parallelized only when VRAM/CPU isolation is guaranteed; do not parallelize four Cycles bakes blindly on one GPU
- Multiple models can process simultaneously (Celery task queue)
- Pipeline is async → doesn't block user

---

## PART 14: FALLBACK & ERROR RECOVERY STRATEGY

**Philosophy**: Never fail the entire pipeline; degrade gracefully.

```python
try:
    result = stage_function(input)
except Exception as e:
    logger.warning(f"Stage failed: {e}")
    meta[f"{stage_name}_error"] = str(e)

    if stage == "repair":
        # STRICT: do not continue as if the mesh were watertight.
        return stage_blocked("watertight_validation_failed")
    elif stage == "decimate":
        return existing_meshoptimizer_path()
    elif stage == "uv":
        return blender_smart_project()
    elif stage == "pbr":
        return mesh_without_pbr()
    elif stage == "compress":
        return uncompressed_validated_glb()
    elif stage == "package":
        return package_pending_or_retry()

    sync_publish(progress, stage, "Stage degraded/skipped due to error", "warning")
    continue_to_next_stage_if_safe()
```

---

## PART 15: FILE PATHS & MODULE STRUCTURE

**Exact Directory Structure** (To Implement):
```
backend/app/core/
├─ post_processing/  (NEW FOLDER)
│  ├─ __init__.py
│  ├─ mesh_repair.py
│  ├─ decimation.py
│  ├─ uv_unwrap.py
│  ├─ pbr_bake.py
│  ├─ optimize.py
│  ├─ validators.py
│  ├─ export_packager.py
│  └─ blender_scripts/  (NEW SUBFOLDER)
│     ├─ bake_pbr.py
│     └─ voxel_remesh.py
```

**Import Pattern** (in tasks.py):
```python
from app.core.post_processing import (
    mesh_repair,
    decimation,
    uv_unwrap,
    pbr_bake,
    optimize,
    validators,
    export_packager,
)
```

---

## PART 16: FINAL SUBMISSION CHECKLIST

**Before Code is Ready for Production**:

1. **All post-processing modules/functions exist** and reuse existing project helpers where possible.
2. **Dependencies verified**: Python packages + Node.js LTS/npm + gltf-transform + Blender 4.x.
3. **Strict watertight gate implemented** with ManifoldPlus and/or Blender voxel fallback.
4. **xatlas seam-duplication reconstruction preserved** (`vertices[vmapping]` + `indices`).
5. **PBR bake bounds implemented**: `cage_extrusion=0.02`, `max_ray_distance=0.05`.
6. **Roughness clamp + Metallic default implemented**.
7. **Stage 5 gltf-transform optimization validated**.
8. **Stage 6 Celery package worker implemented** and idempotent.
9. **FastAPI ZIP path contains no ZIP generation** and returns static URL/redirect only when ready.
10. **Job metadata/schema updated** for package state.
11. **Tests passing**: `pytest backend/tests/ -v`.
12. **E2E test working**: generation → QA → async package.
13. **Fallbacks tested** for repair, UV, PBR, compression and packaging.
14. **Startup verified**: `bash scripts/setup.sh` + services start cleanly.

---

## SUMMARY: WHAT YOU'LL HAVE AFTER IMPLEMENTATION

**6-Stage Post-Processing + Packaging Pipeline**:
1. ✅ **Strict Mesh Repair / Watertight Gate**
   - PyMeshLab cleanup
   - ManifoldPlus fallback
   - Blender headless voxel-remesh fallback
   - Hard acceptance gate before downstream geometry processing
2. ✅ **Decimation / Retopology**
   - Reuse existing `optimize_mesh()`
   - Platform-aware budgets
   - Open3D/mesh validation
3. ✅ **UV Unwrapping**
   - xatlas authoritative parameterization
   - Correct seam-vertex reconstruction with `vertices[vmapping]` + `indices`
   - Blender fallback
4. ✅ **PBR Map Baking**
   - Blender Cycles
   - Normal bake ray bounds: `cage_extrusion=0.02`, `max_ray_distance=0.05`
   - Roughness clamp: `0.2–0.85`
   - Metallic default: `0.0` unless explicitly defined
   - Correct Non-Color data texture handling
5. ✅ **Optimization & Compression**
   - gltf-transform
   - Requires Node.js LTS/npm
   - Draco + texture compression, with runtime compatibility validation
6. ✅ **Async Pre-Packaged Export**
   - Celery background packaging worker
   - Deterministic manifest/spec hash
   - Atomic ZIP creation
   - Static ZIP URL
   - API export path never generates ZIPs

**Output Quality**:
- Raw AI mesh → validated production derivative
- `source.glb` remains immutable
- Game-ready GLB is independently validated
- PBR maps are bounded and material heuristics are conservative
- Export package is pre-generated and does not freeze the FastAPI request path

**Repository Alignment**:
- Existing 11-stage generation lifecycle is preserved.
- Existing helpers (`generate_uvs_with_xatlas`, `optimize_mesh`, `generate_lods`, `generate_collision_mesh`, Blender subprocess runners) are reused instead of duplicated.
- Stage 6 is an asynchronous packaging sub-stage, not a synchronous HTTP export job.

**Critical Non-Negotiable Invariants**:
- Never call the ZIP writer from the API endpoint, even through `asyncio.to_thread()`.
- Never claim a mesh is watertight without a passing validation gate.
- Never regress xatlas reconstruction to the old-face indexing pattern.
- Never accept unconstrained PBR ray casting when the bounded defaults are required.
- Never infer metallicity from gray albedo alone.
- Never allow a failed optimized derivative to replace a known-good validated artifact.

================================================================================
END OF BLUEPRINT
Ready for AI Agent Implementation as `build_plan.md`
================================================================================
