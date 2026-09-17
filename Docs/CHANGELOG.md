# AI 3D Studio — Changelog

All notable changes, architectural updates, and feature implementations for AI 3D Studio are documented in this file.

---

## [5.0.81] — 2026-09-17

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
  - Verified `npx tsc --noEmit` with 0 errors and production build (`npm run build`) with all 12 routes statically and dynamically generated.
