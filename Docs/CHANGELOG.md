# AI 3D Studio — Changelog

All notable changes, architectural updates, and feature implementations for AI 3D Studio are documented in this file.

---

## [0.1.0] — 2026-09-21

### 🏗️ Initial FastAPI + Next.js Architecture

#### Frontend
- **Next.js 16 App Router**: React 19, TypeScript, Tailwind CSS v4, Bun package manager.
- **Workspace Shell**: `features/workspace/WorkspaceShell.tsx` — main app shell with 3D viewport, tool panels, inspector, and responsive layout.
- **API Client**: Unified `services/apiClient.ts` (axios-based) for all FastAPI communication.
- **State Management**: Zustand stores (`useAppStore.ts`, `useWorkspace.ts`) + TanStack Query.
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
