# AI 3D Studio — Changelog

All notable changes, architectural updates, and feature implementations for AI 3D Studio are documented in this file.

---

## [5.0.81] — 2026-09-17

### 🐛 GPU Pipeline Root-Cause Repairs (VRAM/OOM/False-Success)

Comprehensive audit and fix of the GPU runtime pipeline, post-processing, and validation layers.

#### P0 — Critical Runtime VRAM/OOM Chain
- **`backend/runtime/gpu.py:235`**: `select_device("auto", max_vram_mb)` now compares **free VRAM** (`free_vram_mb`) instead of total VRAM. Previously compared total VRAM, causing CUDA OOM when model exceeded free VRAM but fit within total.
- **`backend/runtime/gpu.py:94-95`**: `_GPU_CACHE_TTL` reduced from 30s to 2s. Stale GPU info cache caused incorrect device selection after GPU state changes.
- **`backend/runtime/engine.py:288-292`**: `load_provider` now re-evaluates `vram_mode` on every call instead of assuming the previous mode is still valid. Previously stayed in "normal" mode after VRAM was freed, causing later OOM.
- **`backend/runtime/engine.py:326-331`**: `load_provider` now rejects load when `plan_vram_usage.fits=False`, raising `RuntimeError` with shortfall details. Previously ignored the planner's fit check and attempted load anyway.
- **`backend/runtime/accelerate_loader.py:44-46`**: Removed `_ACCELERATE_AVAILABLE` global cache; `accelerate_available()` now always attempts fresh import. Stale `False` cache permanently disabled low-VRAM strategies after first import failure.
- **`backend/runtime/preflight.py:574-576`**: OOM now classified as `FAILED` not `SKIPPED` in both `model_load` and `capacity_smoke` checks. Previously treated any `is_resource_error(output)` as a skip, even on real GPU OOMs.
- **`backend/runtime/model_env.py:256`**: Added `is_oom_error()` function with strict OOM-only markers, separate from the broad `is_resource_error()`.
- **`backend/app/workers/tasks.py:215-227`**: `_is_oom_error` now delegates to `is_oom_error()` instead of `is_resource_error()`.
- **`backend/app/core/providers/base.py:346-349`**: `_add_model_env()` now purges `torch` from `sys.modules` alongside shared packages. Previously only purged shared packages, causing segfault/undefined symbol on model load with ABI mismatch.

#### P1 — Postprocess/Export Defects
- **`backend/app/workers/tasks.py:1178`**: Blender pipeline `auto_rig` set to `False` when `job.mode == "rigging"` to prevent double-rigging.
- **`backend/app/core/mesh_optimizer.py:850`**: `collision_mode="box"` now builds a proper `trimesh.creation.box` from bounding box extents instead of returning the original mesh unchanged.
- **`backend/app/core/mesh_optimizer.py:864`**: LOD generation now tracks `derived_lod_count` and returns `success: False` when all derived LODs are rejected.
- **`backend/app/core/mesh_processor.py:110`**: `run_mesh_diagnostics` now returns `valid: False, game_ready_score: 0` when trimesh is missing (was `valid: True, score: 75`).
- **`backend/app/core/mesh_processor.py:717`**: Exception handler now returns `valid: False, game_ready_score: 0` (was `valid: True, score: 60`).
- **`backend/app/core/mesh_processor.py:329`**: `validate_glb` now returns `valid: False` for non-GLB files (missing `glTF` magic bytes).
- **`backend/app/core/mesh_processor.py:523`**: `material_count` now counts actual materials via `m.visual.material` instead of geometry objects.
- **`backend/app/core/open3d_service.py:326`**: Diagnostic probe now records UV presence before clearing `triangle_uvs`/`vertex_colors` to prevent C++ segfault while keeping duplicate/degenerate counts accurate for textured meshes.

#### P2 — Config/Manifest/Deployment Defects
- **`backend/runtime/manifests/hunyuan3d_21.yaml:36`**: Added `python_pin_rewrites` entry for `^numpy==1\.24\..*$` → `numpy>=1.26.4,<2.0` to resolve numpy pin conflict with `detailgen3d.yaml`'s `numpy==1.22.3` when both manifests are installed together.
- **`scripts/start.sh`**: Added explicit `export CUDA_VISIBLE_DEVICES=0` fallback when `.env` does not set it, ensuring PyTorch picks the correct GPU device.
- **`package.json`**: Added `"test"` script to satisfy bun package.json requirements.

#### Verification
- 10 regression tests in `backend/runtime/test_gpu_runtime_regression.py` covering all P0 defects
- 80 backend tests pass
- TypeScript type check: clean
- Shell script syntax: all valid
- `backend/runtime/test_dependency_manifest_contract.py`: passes

### 🐛 Runtime Bootstrap Fixes: TripoSR `torchmcubes` Source Build & Colab Supervisor `local` Errors

- **TripoSR `torchmcubes` Build Failure (`backend/runtime/manifests/triposr.yaml`, `backend/runtime/dependency_resolver.py`)**:
  - **Root cause**: Upstream `torchmcubes` (cloned from `git+https://github.com/tatsy/torchmcubes.git`) now builds with `scikit-build-core` + `pybind11` and its `CMakeLists.txt` calls `find_package(Torch CONFIG REQUIRED)`. The manifest's `dependencies.build_deps` still listed the obsolete `ninja`/`setuptools<70` pins, so the build backend failed at `prepare_metadata_for_build_wheel` with a CMake "Could not find a package configuration file provided by 'Torch'" error. The resolver's source-build path also did not point CMake at the target venv's installed torch, so even with correct build deps the configure step could not locate `TorchConfig.cmake`.
  - **Fix**: Updated `dependencies.build_deps` for `torchmcubes` to `scikit-build-core>=1.0` and `pybind11>=2.10`, keeping the existing `ninja` and `setuptools<70` toolchain pins. The resolver now sets `CUDA_TOOLKIT_ROOT_DIR`/`CUDAToolkit_ROOT`/`CUDA_HOME` and exports both `Torch_DIR` (`torch/share/cmake/Torch`) and `pybind11_DIR` (`pybind11.get_cmake_dir()`), composing a unified `CMAKE_PREFIX_PATH` after installing build dependencies so `find_package(pybind11 CONFIG REQUIRED)` and `find_package(Torch CONFIG REQUIRED)` succeed. Also enhanced build failure logs to preserve compiler tail diagnostics.
  - **Verification**: `pytest backend/runtime/test_dependency_manifest_contract.py backend/tests/test_runtime_stability.py` passes all 16 tests.

- **Colab Supervisor `local` Errors (`scripts/colab_watch.sh`)**:
  - **Root cause**: `local apid`, `local wpid`, and `local fpid` were declared inside the top-level `while true` loop of the foreground supervisor, but `local` is only valid inside a function. Under `set -u` this printed `local: can only be used in a function` on every health-check iteration.
  - **Fix**: Removed the `local` keyword from the three loop-local variable assignments; the variables are still scoped to the loop body and functionally identical.

### 🚀 1-Click Mesh Quality Toolbar & UI Architecture
- **Dedicated Generate Quality Toolbar (`GeneratePanel.tsx`)**:
  - Added persistent 1-click **Mesh Quality Toolbar** directly anchored above the sticky `GENERATE 3D MODEL` action button.
  - 5-tier selection: `Low` (256³ / 20 steps / 15k tris), `Medium` (384³ / 35 steps / 30k tris), `High` (512³ / 50 steps / 60k tris), `Ultra` (640³ / 75 steps / 100k tris), and `Raw` (640³ Master / Full Polycount / `auto_optimize: false`).
  - Active buttons feature amber/primary glows, live voxel grid resolution badges (`512³ grid • 50 steps`), and rich tooltips.
  - Fully synchronized across the Mesh tab's preset grid and `WorkspaceContext.tsx` store.

### 🔬 Anatomical Micro-Detail Preservation & Neural Inference Hardening
- **Dynamic Marching Cubes Octree Scaling**:
  - Scaled Marching Cubes voxel grids in `hunyuan3d_local.py` from hardcoded 380 up to 512 (High) and 640 (Ultra), mathematically preserving sub-millimeter teeth (<1mm), nostrils (4mm), and eyelid creases.
  - Mapped diffusion inference steps dynamically up to 75 steps for Ultra quality.
- **Occlusion-Aware Texture Projection & Tangent Normal Map Baking**:
  - Replaced Trimesh default vertex color short-circuit in `_project_texture` with `is_real_textured_mesh` validation. Untextured raw marching cubes outputs now automatically receive high-fidelity reference texture projection, tangent-space normal maps, and metallic/roughness PBR baking.
- **TRELLIS Provider Enhancements**:
  - Added `"ultra"` quality preset (32 sparse steps, 8.0 CFG; 32 SLAT steps, 3.5 CFG) and scaled textures to 2048x2048.
  - Integrated transparent alpha preprocessing on opaque reference images to prevent background backdrops from fusing into 3D geometry.
- **Raw Master Geometry Delivery (`tasks.py`)**:
  - Gated Clay post-processing decimation behind `should_optimize = bool(meta.get("auto_optimize", False)) or bool(meta.get("game_ready", False))`.
  - When optimization is disabled (RAW mode), the untouched high-density master mesh is preserved directly and delivered as `active_model_url` without triangle reduction.

### 📦 Texture-Preserving Post-Processing & Viewport Hardening
- **C++ `meshoptimizer` SIMD Decimation**:
  - Enabled `decimate_textured=True` in OpenX Clay (`clay/postprocess.py` and `clay/lods.py`), preserving UV maps, vertex normals, and PBR materials across decimated meshes and all LOD tiers (LOD0–LOD3).
- **Three.js Viewport STLLoader & GLTF Relative Paths**:
  - Added `sharedSTLLoader` singleton in `MeshViewer.tsx` to preview and drag-and-drop `.stl` files.
  - Dynamically derived `basePath` from `sourceUrl` in `sharedGLTFLoader.parseAsync` for relative GLTF asset resolution.
  - Guarded CacheStorage against `blob:` and `data:` schemes in `glbCache.ts`.
  - Traversed and disposed `userData.originalMaterial` and referenced textures on model unload, eliminating WebGL VRAM memory leaks.

### 📓 Official Google Colab Deployment Notebooks (`colab.ipynb` & `AI_Studio_Colab.ipynb`)
- Created production-ready Jupyter notebooks strictly validated against `nbformat 4.5`.
- Automated 8GB swap allocation, environment setup, model runtime isolation, service orchestration, Cloudflare public tunneling, and interactive launcher controls.
- Hardened `scripts/colab.sh` with `--setup` flag and non-interactive EOF handling.

---

## [5.0.70] — 2026-09-17

### 🎨 UI Polish, Design Tokens & Animation Architecture
- **CSS Variable Design Token Harmonization**:
  - Replaced hardcoded hex color literals across the frontend with canonical CSS variable semantic tokens (`hsl(var(--surface-0..4))`, `hsl(var(--primary))`, `hsl(var(--neon-amber))`, `hsl(var(--border))`, `hsl(var(--foreground))`).
  - Standardized surface elevation hierarchy from canvas backdrop (`--surface-0`) up to raised floating panels and modal borders (`--surface-4`).
- **Unified Motion Presets (`lib/motion.ts`)**:
  - Added universal motion presets (`MOTION_FAST`, `MOTION_BASE`, `MOTION_SLOW`, `MOTION_SPRING`, `MOTION_SPRING_SNAPPY`).
  - Standardized on `motion/react` across all panels and dialogs to eliminate conflicting animation contexts and prevent dual-library bundle bloat.
- **Fluid Navigation Animations**:
  - **TopHeader**: Added animated sliding pill indicator using `motion/react` (`layoutId="topNavActiveIndicator"`, spring physics `stiffness: 450, damping: 32`) across `Home`, `3D Studio`, `Animation`, `Assets`, and `System`.
  - **LeftNavigation**: Reorganized into **Studio Views** (`Overview`, `Assets`, `System`) and **3D Generation Tools** (`Model`, `Poly`, `Texture`, `Animate`, `Segment`). Docked at `md:left-[72px]` so the rail stays visible across dashboard/assets/system views.
  - **GeneratePanel Subaction Tabs**: Subaction pills (`Image`, `Multi`, `Text`, `Sketch`) use `motion.div layoutId="subActionActiveTab"` with spring transitions.
- **Premium UI Components**:
  - Added MagicUI-themed `ShimmerButton` (`components/ui/shimmer-button.tsx`) as the primary 3D generation CTA.
  - Integrated `@dnd-kit` sortable drag-and-drop in `OutputsPage.tsx` for visual reordering of generated 3D assets.
  - Added Shadcn `Skeleton` loaders across `OutputsPage`, `InstalledModelsTab`, and `StudioDashboard`.

---

### 🧩 Generation Panel Modes (Multi-View, Text-to-3D, Sketchpad)
- **Multi-View 4-Angle Orthogonal Studio (`subAction === 'crop'`)**:
  - Dedicated 4-perspective orthogonal capture grid: `Front*` (primary required), `Right`, `Back`, and `Left`.
  - Drag-and-drop and slot-specific upload support with individual remove actions.
  - "Load 4-View Sample Set" and "Clear All Views" actions.
  - State persisted in `generationSettings.multiviewImages` and wired to generation API payloads.
- **2D Concept Sketchpad Canvas (`subAction === 'edit'`)**:
  - High-performance HTML5 `<canvas>` interactive sketching area.
  - Brush and eraser modes, 4 curated color swatches (`#FFFFFF`, `#F59E0B`, `#06B6D4`, `#10B981`), 3 stroke sizes (Fine 2px, Med 5px, Bold 10px), and instant canvas wipe.
  - "Use as 3D Reference" button exports PNG data URL directly into `generationSettings.image`.
- **Text-to-3D Workshop (`subAction === 'wand'`)**:
  - Dedicated Text-to-3D workspace with prompt enhancer and **"Inspire Me"** / Roll Random Idea button powered by curated prompt concepts.
  - Collapsible **Negative Prompt** input for artifact exclusion.
  - Fast style preset chips (`+ PBR Game Asset`, `+ Clean Quad Topology`, `+ Sci-Fi`, `+ Stylized`, `+ Photorealistic`, `+ Cyberpunk`, `+ Fantasy`).

---

### ⚡ Performance, SSR Acceleration & App Router
- **Eliminated Dynamic CSR Bailouts**:
  - Replaced lazy dynamic imports (`dynamic(..., { ssr: false })`) with direct imports in `WorkspaceShell.tsx` for all standard DOM panels (`GeneratePanel`, `TexturePanel`, `RemeshPanel`, `SecondaryPanels`, `RightWorkspacePanel`, `OutputsPage`, `SystemPage`, `StudioDashboard`).
  - Pre-renders static HTML shells on the server for instant First Contentful Paint (FCP) and seamless hydration.
- **Client Boundary Architecture**:
  - Placed `'use client'` explicitly on root route entry points (`app/workspace/page.tsx`, `app/workspace/[...tool]/page.tsx`, `app/page.tsx`, `app/dashboard/page.tsx`, `app/outputs/page.tsx`, `app/system/page.tsx`, `app/animation/page.tsx`).
- **Dev & Build Performance**:
  - Configured `allowedDevOrigins` in `next.config.ts` for cross-origin HMR support.
  - Verified `npx tsc --noEmit` with 0 errors and production build (`bun run build`) with all 12 routes statically and dynamically generated.
