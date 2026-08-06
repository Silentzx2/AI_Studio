# AI 3D Studio — Changelog

## v3.3.0 — Workspace Compatibility & Texture Pipeline (August 6, 2026)

### New Features

- **Model-to-Workspace Compatibility System**: Each model now declares `workspace_compatibility` in its manifest/metadata. Frontend workspace tabs (Mesh Generation, Texture, Rigging, Segmentation, Remesh) only present compatible models to users, preventing invalid selections.
- **Backend Capability Matrix** (`backend/app/core/capability_matrix.py`): Added `WORKSPACE_TYPES`, `is_compatible_with_workspace()`, `filter_by_workspace()`, and `_workspace_compatibility()` derivation. `build_pipeline_snapshot()` now includes `workspace_compatibility` per model.
- **New Pipelines API Endpoints** (`backend/app/api/v1/pipelines.py`):
  - `GET /api/v1/pipelines/workspace-models?workspace=<type>&installed_only=<bool>` — returns models compatible with a specific workspace.
  - `GET /api/v1/pipelines/workspace-types` — lists all workspace types with descriptions.
  - `GET /api/v1/pipelines` now returns `workspace_types` in the snapshot.
- **Model Registry Compatibility Filtering** (`backend/app/core/registry/model_registry.py`): Each manifest includes `workspace_compatibility`. Registry only surfaces models with a real provider class in `engine._PROVIDER_MAP`.
- **Generation API Workspace Validation** (`backend/app/api/v1/generation.py`): `GenerationRequest` now accepts optional `workspace` field and validates provider/workspace compatibility at submission.
- **Frontend Workspace Hooks** (`hooks/useBackendData.ts`): New `useWorkspaceModels(workspace)` hook returns workspace-filtered models. Existing `useAvailableModels()` returns all models.
- **Frontend Types** (`types/index.ts`): Added `WorkspaceType` union (`mesh-generation`, `texture-generation`, `rigging`, `animation`, `segmentation`, `remesh`, `post-processing`). Added `workspace?: WorkspaceType` to `GenerationConfig` and `workspace_compatibility?: WorkspaceType[]` to `ProviderOption`.
- **Workspace Tabs Model Filtering**: ThreeDGenerationTab, RiggingAnimationTab, SegmentationTab, and RemeshTab all consume `useWorkspaceModels()` to restrict model selection.
- **Texture Generation Workflow Improvements** (`features/workspace/new-ui/TextureGenTab.tsx`):
  - Workspace-aware texture model selector (`hunyuan3d-2.1`, `hunyuan3d-2`, `trellis`, `triposr`) fetched via `useWorkspaceModels('texture-generation')`.
  - Resolution options expanded: 512px (Draft), 1024px (Fast), 2048px (Balanced), 4096px (Ultra).
  - PBR material bias controls: Metalness Bias and Roughness Bias sliders (0–100%).
  - Style presets expanded: Photorealistic PBR, Stylized Handpainted, Anime/Cel-Shaded, Cyberpunk Neon, Procedural.
  - Generation payload now includes `provider`, `workspace`, and `processing_metadata` (weathering, metalness_bias, roughness_bias).
- **Settings → Pipelines Page** (`features/settings/sections/pipelines/PipelinesDashboard.tsx`):
  - Workspace filter bar with counts per workspace type.
  - Filtered model list with "Showing X of Y" caption.
  - Workspace compatibility badges rendered on each pipeline card.
  - Improved card hover states and spacing.

### Backend Changes

- `backend/runtime/installer.py` — Added `workspace_compatibility` to all `PROVIDER_METADATA` entries.
- `backend/app/core/capability_matrix.py` — New workspace functions; `build_pipeline_snapshot()` enriched.
- `backend/app/core/registry/model_registry.py` — Manifests include `workspace_compatibility`.
- `backend/app/api/v1/pipelines.py` — New `workspace-models` and `workspace-types` endpoints.
- `backend/app/api/v1/generation.py` — `workspace` field + provider/workspace soft validation.
- `backend/app/api/v1/runtime.py` — `three_d_models` now includes `workspace_compatibility`.

### Frontend Changes

- `hooks/useBackendData.ts` — New `useWorkspaceModels(workspace)` hook.
- `types/index.ts` — New `WorkspaceType` union and related interface fields.
- `features/workspace/new-ui/TextureGenTab.tsx` — Model selector + PBR bias controls.
- `features/settings/sections/pipelines/PipelinesDashboard.tsx` — Workspace filter bar, badges, polished cards.
- `features/workspace/new-ui/ThreeDGenerationTab.tsx` — Already wired to `useWorkspaceModels('mesh-generation')`.
- `features/workspace/new-ui/RiggingAnimationTab.tsx` — Already wired to `useWorkspaceModels('rigging')`.
- `features/workspace/new-ui/SegmentationTab.tsx` — Already wired to `useWorkspaceModels('segmentation')`.
- `features/workspace/new-ui/RemeshTab.tsx` — Already wired to `useWorkspaceModels('remesh')`.

### Documentation

- Updated `Docs/README.md`, `Docs/api-documentation.md`, `Docs/developer-guide.md`, `Docs/pipeline-status.md` to reflect the workspace compatibility system and new endpoints.

### Breaking Changes

- None. Backward-compatible additions. Existing pipelines without `workspace_compatibility` default to derivation from existing capability flags.

---

## v3.2.0 — uv-Only Package Management (January 25, 2026)

### Breaking Changes

- **Central install policy removed**: All install endpoints now require an explicit model list via `resolve_install_targets()` in `installer.py`. Passing `models=None` to install everything is no longer supported.
- **Weights directory moved**: Model weights are now stored in `third_party/<RepoName>/weights/` instead of the centralized `third_party/weights/<provider_name>/`. Run `./scripts/update-models.sh --migrate` to migrate existing weights.

### New Features

- **Per-model isolated environments**: Each model gets its own `.venv/` under `third_party/<RepoName>/.venv/`, created via `uv venv` (uv is a hard dependency — no fallback to pip/venv).
- **StorageConfig per-model methods**: `get_model_venv_path()`, `get_model_venv_python()`, `get_model_weights_dir()`.
- **Weight resolution with fallback**: `get_weight_path()` checks per-model location first, then falls back to old centralized path.
- **Migration script**: `backend/scripts/migrate_weights_to_per_model.py` with copy-then-verify strategy, accessible via `./scripts/update-models.sh --migrate`.
- **Install concurrency control**: File-based locks at `third_party/<repo_name>/.installing.lock` prevent parallel installs of the same model.
- **Pre-download disk space check**: Disk space is verified before starting weight downloads.

### Environment & Deployment Changes

- **Native deployment via shell scripts**: Services are managed via `scripts/setup.sh`, `scripts/start.sh`, and `scripts/manager.sh`. No Docker deployment path exists.
- **Per-model storage layout**: Each model is fully self-contained under `third_party/<RepoName>/` with its own `.venv/` (created by `uv`), `weights/`, `cache/`, `logs/`, and `metadata.json`.
- **Gitignore updates**: Excludes `third_party/*`, `third_party/*/.venv/`, `third_party/*/weights/`, `.runtime_cache/`, and `storage/`.
- **uv hard dependency**: `uv` is required for per-model venv creation; no fallback to `pip` or `python -m venv`.

### Files Changed

- `backend/runtime/installer.py` — `resolve_install_targets()`, per-model venv creation
- `backend/runtime/storage.py` — `get_model_venv_path()`, `get_model_venv_python()`, `get_model_weights_dir()`, updated `get_weight_path()`
- `backend/scripts/update-models.sh` — supports `--migrate`, `--repos-only`, `--weights-only`, `--verify` flags
- `AGENTS.md` — new "Model Pipeline Structure Rules (post-restructure)" section

---

## Frontend Rendering Fix - Changelog

## Issue Summary
Frontend components failed to render due to duplicate "use client" directives, blocking all page navigation and preventing API calls from being made.

## Root Cause
Invalid JavaScript syntax in 48 files:
```tsx
"use client";      // Valid
'use client';      // INVALID - second directive causes parser error
```

## Impact
- ❌ Workspace page wouldn't open
- ❌ Settings page wouldn't open  
- ❌ Admin redirects failed
- ❌ No API calls were made (rendering failed before fetch)
- ❌ "Backend Offline" message displayed (misleading - backend was fine)
- ❌ "GPU Unavailable" not detected (rendering failed before health check)

## Fix Applied
Removed all 48 duplicate single-quoted 'use client' directives from:
- 4 app routes
- 15 admin tab/dashboard files
- 13 workspace component files
- 4 settings section files
- 2 landing feature files
- 18 UI/motion/image-gen components
- 3 hook files

## Additional Improvements
1. Fixed admin page redirect router logic with proper timer handling
2. Added localStorage safety checks (typeof window guards)
3. Added comprehensive FIXES_APPLIED.md documentation

## Testing Checklist
- [x] Build completes without errors
- [x] All files parse correctly (no syntax errors)
- [x] Navigation works: home → workspace → settings → admin
- [x] Workspace page renders
- [x] Settings sections render
- [x] Admin redirect to settings works
- [x] No hydration errors
- [x] No console errors
- [x] Backend status calls complete
- [x] GPU status indicator works

## Deployment
1. Replace modified files in your frontend directory
2. Run: `npm run build`
3. Verify: `npm start`
4. Test navigation flow
5. No backend changes needed

## Files Modified: 52 Total
See FIXES_APPLIED.md for detailed breakdown.

## Before vs After
### Before
```
Frontend: ❌ All pages fail to render
Navigation: ❌ Completely blocked
API Calls: ❌ Never made (rendering fails first)
User Experience: ❌ "Something crashed" error
```

### After  
```
Frontend: ✅ All pages render correctly
Navigation: ✅ Full navigation flow works
API Calls: ✅ Complete successfully
User Experience: ✅ Full functionality restored
```
