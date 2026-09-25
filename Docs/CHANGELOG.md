# AI 3D Studio — Changelog

All notable changes, architectural updates, and feature implementations for AI 3D Studio are documented in this file.

---

## [Unreleased]

### 🔧 Documentation Updates
- Corrected backend port from `8000` to `7842` across all docs (matches `.env.example` and `manager.sh`).
- Corrected Python version from 3.12 to 3.10 (Conda env `3daigc-api`).
- Corrected version number from `1.0.0`/`3.9.4` to `0.1.0` for consistency.
- Removed references to non-existent files: `backend/tests/test_backend_e2e.py`, `backend/core/mesh_optimizer.py`, `backend/core/mesh_processor.py`, `POST /api/v1/project/export`, colab orchestration scripts, `components/animate-ui/*`.
- Added `PartUV` adapter to model catalog and adapter table.
- Added local wheelhouse (`backend/thirdparty/wheels/`) documentation to architecture and setup guides.
- Fixed duplicate section in `PRODUCT_VISION.md` and duplicate shortcut in `UI-DESIGN-SYSTEM.md`.

### 🎨 Frontend & Model Segregation
- Added canonical model registry (`constants/models.ts`) covering all 19 models with category, feature, VRAM, and path metadata.
- Strict model segregation between workspace panels:
  - **GeneratePanel**: Displays only mesh generation models (`image_to_textured_mesh`, `image_to_raw_mesh`, `text_to_textured_mesh`).
  - **TexturePanel**: Displays only texture painting models (`image_mesh_painting`, `text_mesh_painting`).
- Dynamic endpoint and model routing in `WorkspaceContext`:
  - Image-to-raw models route to `/api/v1/mesh-generation/image-to-raw-mesh`.
  - Image-to-textured models route to `/api/v1/mesh-generation/image-to-textured-mesh`.
  - **MeshSegmentPanel**: Added selectable model dropdown between `partfield_mesh_segmentation` (4GB VRAM) and `p3sam_mesh_segmentation` (60GB VRAM), passing user-selected `modelPreference` to backend segmentation endpoint.
- Updated `ModelsTab.tsx` in Admin to consume the canonical 19-model registry.

### 🐳 Backend
- Added local wheelhouse support to `backend/scripts/install.sh`: prebuilt wheels in `backend/thirdparty/wheels/` are checked before source builds for `diff_gaussian_rasterization`, `custom_rasterizer`, and `cubvh`, with `--find-links="$PROJECT_ROOT/backend/thirdparty/wheels"` on all other applicable installs.
- Removed GitHub Release wheel downloader (`scripts/download_wheels.py`). Wheels are now provided via the `backend/thirdparty` git submodule.

---

## [0.1.0] — 2026-09-21

### 🏗️ Initial FastAPI + Next.js Architecture

#### Frontend
- **Next.js 16 App Router**: React 19, TypeScript, Tailwind CSS v4, Bun package manager.
- **Workspace Shell**: `features/workspace/WorkspaceShell.tsx` — main app shell with 3D viewport, tool panels, inspector, and responsive layout.
- **API Client**: Unified `services/apiClient.ts` (axios-based) for all FastAPI communication.
- **State Management**: Zustand stores (`useAppStore.ts`, `useViewerStore.ts`, `useAnimationStore.ts`, `useUIStore.ts`) + TanStack Query.
- **3D Rendering**: Three.js / React Three Fiber / OrbitControls.
- **UI Components**: Radix UI primitives, Lucide icons, Framer Motion animations.

#### Backend
- **FastAPI Gateway** (`backend/api/`):
  - `main_singleworker.py` — embedded VRAM-aware scheduler (default).
  - `main_multiworker.py` — Redis-backed job queue (optional scaling).
- **API Routers**: `system`, `file_upload`, `mesh_generation`, `mesh_editing`, `auto_rigging`, `mesh_segmentation`, `mesh_retopology`, `mesh_uv_unwrapping`, `users`.
- **Core Modules**: `config.py` (Pydantic + YAML), `scheduler/` (multiprocess scheduler, GPU monitor, Redis queue), `file_store.py`, `auth/`.
- **Model Adapters**: `adapters/` — TRELLIS, TRELLIS.2, Hunyuan3D-2.1, PartPacker, UltraShape, PartField, P3-SAM, UniRig, FastMesh, VoxHammer.

#### Configuration
- YAML-based configs: `backend/config/system.yaml` (logging, security, env) and `backend/config/models.yaml` (per-feature model definitions with VRAM requirements).
- `.env.example` with full configuration template.

#### Documentation
- Complete documentation rewrite: README.md, Docs/architecture.md, Docs/api-documentation.md, Docs/setup-guide.md, Docs/developer-guide.md, Docs/3D_QUALITY_PIPELINE.md, Docs/SYSTEM-BLUEPRINT.md, Docs/PRODUCT_VISION.md, Docs/GAME_READY_SPEC.md, Docs/QUALITY_BENCHMARK.md, Docs/UI-DESIGN-SYSTEM.md, Docs/pipeline-status.md.

---

## [Legacy] — Pre-0.1.0

Previous architecture versions (ComfyUI-based, PostgreSQL, Blender pipeline) are superseded. See git history for prior releases.

---

## Versioning

This project follows [Semantic Versioning](https://semver.org/). The current version `0.1.0` indicates an early development release.
