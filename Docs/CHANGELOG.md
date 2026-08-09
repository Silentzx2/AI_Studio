# AI 3D Studio — Changelog

## v3.4.2 — Remaining error.md Batch: Async Fixes, Wiring, Cleanup (August 9, 2026)

Second wave of fixes from `error.md` (full deep-scan report). All 53 reported issues addressed; two verified as false positives/non-issues.

### Frontend

- **FE-003 (P1)**: `BottomDock` replaced all 7 tabs' hardcoded mock arrays with real `useAppStore` data (recent prompts, tasks, current job, downloads, job history, project layers) + empty states.
- **FE-004 (P1)**: `TextureShell` and `RenderShell` buttons now register a task and call `generationService.startGeneration` (mode cast fix; RENDER_QUEUE wired to store tasks of type `render`).
- **FE-005 (P1)**: `WorkspaceNavbar` active-link detection now matches query-string links (e.g. `/settings?section=models`).
- **FE-007 (P2)**: `useTaskManager` switched from whole-store destructure to per-value selectors — re-renders only on task state changes.
- **FE-008 (P2)**: Resolved by FE-001 mirror (mode/uploadedImage/currentJob now reactive).
- **FE-009 (P2)**: `generationService` now routes POST/status-poll/cancel through `apiClient` (retry + timeout + API_URL prefix). Status poll uses `useCache=false` so a stale cached status can't freeze the loop.
- **FE-010 (P2)**: `useGenerationStore.loadHistory` now uses `/api/v1/generation/history` (same endpoint + shape as `useGenerationHistory`) instead of `/api/v1/jobs`.
- **FE-011 (P3)**: `apiClient` circuit-breaker `setTimeout` is now cleared in a `finally` after the race settles.
- **FE-012 (P3)**: `app/admin/page.tsx` — removed dead `isRedirecting` state (always true, never set false).
- **FE-013 (P3)**: `hooks/use-toast.ts` `TOAST_REMOVE_DELAY` lowered from 1,000,000 ms (~11 min) to 5,000 ms.
- **FE-014 (P3)**: `AdminJob` type gained `mode` and `error_message` fields used by `adminService.listJobs`.
- **FE-015 (P3)**: `ViewerScene` revokes the previous blob object URL when a new GLB is loaded.
- **FE-016 (P3)**: Removed misleading `"use client"` from `services/cacheService.ts` (utility module).
- **FE-017 (P4)**: Removed hardcoded "47%" from `app/loading.tsx`.
- **FE-018 (P4)**: Renamed workspace `SettingsTab` → `WorkspaceSettingsTab` to remove name collision with admin's `SettingsTab`.
- **FE-019 (P4)**: Kept as deliberate reuse — `ModelsTab` from admin is embedded in the creative workspace (reuse over duplication per AGENTS.md; no fix suggested in report).
- **FE-020 (P4)**: `ModelSelector` dropped the redundant 30s polling loop (initial load + open-refresh remain).
- **FE-021 (P4)**: `AppearanceProvider` — removed unused `useId`/`styleId` and dead `initialApplied` ref.
- **FE-022 (P4)**: Removed dead `NAVIGATION_ITEMS` (unused, `Docs` link went to `#`) and the redirect-only `/admin` link from `WorkspaceNavbar`.
- **FE-023/024/026 (P4)**: `useAppStore` no longer persists `uploadedImage` (File — unserializable) or `currentJob` (Date objects degrade to strings + stale jobs resurrect on refresh). `jobHistory` remains refreshed from backend via `loadHistory()`.
- **FE-025 (P4)**: Non-issue — `recentPrompts` already capped at 10.

### Backend

- **BE-007 (P2)**: `upload.py` MIME/extension mismatch now rejects with 422 instead of warning-and-accepting (`.jpg`/`.jpeg` tolerate `image/jpeg`).
- **BE-009 (P2)**: `installation_workers.py` — removed unused `SessionLocal` + `db.close()`.
- **BE-010 (P2)**: `system.py test_connection` — DB/Redis checks moved to `asyncio.to_thread`.
- **BE-011 (P2)**: `rigging.py` — sync Redis calls in async handlers wrapped in `asyncio.to_thread`.
- **BE-012 (P2)**: `environment_manager.py` — blocking `subprocess.run` (60s/300s) moved to `asyncio.to_thread`.
- **BE-014 (P2)**: `download_manager.py` download ID changed from `{model_id}_{timestamp}` to `str(uuid.uuid4())` — the old format violated the PG UUID column.
- **BE-015 (P3)**: `health.py` engine status uses `engine.health().get("initialized")` instead of a nonexistent `.status` attribute (was always "unknown").
- **BE-016 (P3)**: `tasks.py` VRAM-fallback exception no longer silently swallowed — logs a warning.
- **BE-017 (P3)**: Documented — `get_settings()` is an intentional cached singleton; runtime provider/config mutations are deliberate (registry tracks availability separately). No functional change.
- **BE-018 (P3)**: Already resolved — `_KNOWN_PROVIDERS` includes `instant-mesh` (registry.py:97).
- **BE-019/022 (P4)**: `admin.py` — removed redundant `import time` and in-function `import re as _re`.
- **BE-020/021 (P4)**: `system.py` / `download.py` — moved imports below module docstring so `__doc__` is correct.
- **BE-023 (P4)**: `schemas/manifest.py` — `class Config: use_enum_values` → `model_config = ConfigDict(use_enum_values=True)`.
- **BE-024 (P4)**: `tasks.py` — removed redundant local `import redis as redis_sync`.
- **BE-025 (P4)**: `admin.py` — imports `HFTokenRequest` from `hf_token.py` instead of redefining it.
- **BE-026 (P4)**: `upload.py` — removed redundant `".." in str(file_path)` check (`relative_to` is the authoritative guard).

### Housekeeping

- Deleted `error.md` (root) — the full deep-scan report it held has been fully addressed across v3.4.1 and v3.4.2; its fixes are now recorded here in the changelog instead.

### Files Modified

- Frontend: `features/workspace/BottomDock.tsx`, `features/texture/TextureShell.tsx`, `features/render/RenderShell.tsx`, `features/workspace/WorkspaceNavbar.tsx`, `hooks/useTaskManager.ts`, `hooks/use-toast.ts`, `services/generationService.ts`, `services/apiClient.ts`, `services/cacheService.ts`, `stores/useGenerationStore.ts`, `stores/useAppStore.ts`, `types/index.ts`, `app/loading.tsx`, `app/admin/page.tsx`, `constants/index.ts`, `components/AppearanceProvider.tsx`, `features/workspace/ModelSelector.tsx`, `features/workspace/viewer/ViewerScene.tsx`, `features/workspace/new-ui/CreativeWorkspaceLayout.tsx`, `features/workspace/new-ui/WorkspaceSettingsTab.tsx` (renamed from `SettingsTab.tsx`)
- Backend: `app/api/v1/upload.py`, `app/api/v1/system.py`, `app/api/v1/rigging.py`, `app/api/v1/health.py`, `app/api/v1/admin.py`, `app/api/v1/download.py`, `app/api/v1/hf_token.py`, `app/workers/tasks.py`, `app/workers/installation_workers.py`, `app/core/managers/environment_manager.py`, `app/core/managers/download_manager.py`, `app/schemas/manifest.py`

## v3.4.1 — Bugfix Batch: Store Reactivity, DB Sync, Security (August 9, 2026)

Applied the first wave of fixes from `error.md` (full deep-scan report):

### Frontend

- **FE-001 (P0)**: Proxy stores (`useGenerationStore`, `useUIStore`, `useProjectStore`) were completely non-reactive — getters read from `useAppStore` but never called `set()`, so `subscribeWithSelector` subscribers never re-rendered (20+ components frozen). Fixed by subscribing to `useAppStore` and mirroring the relevant data into each proxy store's state.
- **FE-002 (P0)**: Settings page called `useSearchParams()` without a `<Suspense>` boundary. Split the page into a `SettingsContent` component wrapped in `<Suspense>` by the default export.
- **FE-006 (P2)**: `BottomDock.tsx` used the un-mounted Radix toast system (invisible). Replaced all `useToast()` calls with `sonner`'s `toast()`.

### Backend

- **BE-002 (P1)**: Download endpoints passed an `AsyncSession` into `DownloadManager` (sync `.query()` calls) — every download endpoint crashed. Added a sync `get_sync_db()` dependency in `database.py` and switched `download.py` to it; removed the unused `db` param from `models_api.py`.
- **BE-001 (P0 latent)**: `RotatingFileHandler` referenced in `admin.py` but never imported. Added the import.
- **BE-003 (P1)**: `plugin_manager.py` router registered `/admin/models` before `admin.py`, shadowing the richer implementation ModelsTab needs. Removed the dead router registration.
- **BE-004 (P1)**: Reported `/health/all` shadowed by `/{model_id}` — verified as a false positive (FastAPI matches by path segments) and left unchanged.
- **BE-005 (P1)**: Terminal endpoint used an easily-bypassed blocklist with `shell=True` (command injection). Now rejects shell metacharacters outright and runs the command with `shlex.split` + `shell=False`.
- **BE-006 (P1)**: `main.py` masked DB URL leaked the password (`***` only replaced the username). Now masks `***:***@` with the host preserved.
- **BE-013 (P2)**: `models_api.py` iterated manifest dicts as model-ID strings. Extracts `model_id` from each dict.
- **BE-008 (P2)**: `download_manager.py` `get_statistics` omitted `avg_speed_mb_per_sec` on zero-duration downloads (potential KeyError). Initialized to `0`.

### Files Modified

- Frontend: `stores/useGenerationStore.ts`, `stores/useUIStore.ts`, `stores/useProjectStore.ts`, `app/settings/page.tsx`, `features/workspace/BottomDock.tsx`
- Backend: `app/database.py`, `app/api/v1/download.py`, `app/api/v1/models_api.py`, `app/api/v1/admin.py`, `app/api/v1/__init__.py`, `app/main.py`, `app/core/managers/download_manager.py`

## v3.4.0 — Remove TripoSF, HoloPart, and Segmentation Workspace (August 9, 2026)

### Problem

TripoSF and HoloPart providers were duplicative of TripoSG and DetailGen3D capabilities, and the segmentation workspace was only served by HoloPart. Keeping them added catalog surface without distinct user value.

### Solution

- Removed `triposf_provider.py` and `holopart_provider.py` from `backend/app/core/providers/`.
- Removed their registrations from `registry.py`, `engine.py` provider map, `installer.py` metadata, and `model_registry.py` manifests.
- Removed the `segmentation` workspace type and the `SegmentationTab.tsx` UI.
- Updated capability matrix, feature gating, workspace compatibility, and all docs to the reduced catalog.

### Files Modified

- Deleted: `backend/app/core/providers/triposf_provider.py`, `backend/app/core/providers/holopart_provider.py`, `features/workspace/new-ui/SegmentationTab.tsx`
- Updated: registry, engine, installer, capability matrix, model registry, generation schemas, pipelines APIs, stores, types, tests, and all `Docs/*.md`.

## v3.3.1 — Fix Shared Dependency Version Conflicts in Local Providers (August 7, 2026)

### Problem

When local providers (hunyuan3d_local, trellis_local, triposr_local) run in-process, they import model packages that depend on specific versions of shared packages (e.g., huggingface_hub>=0.28 for `is_offline_mode`). However, Python's import system found the backend process's already-cached `huggingface_hub` in `sys.modules` first, causing:

- `ImportError: cannot import name 'is_offline_mode'`
- Other version mismatch errors when model venvs have newer shared package versions

### Solution

- **Enhanced `_add_model_env()` in `base.py`**: Now prepends per-model venv site-packages to `sys.path` at position 0 (highest priority) and force-reloads shared packages (`huggingface_hub`, `transformers`, `diffusers`, `pydantic`, `requests`, `httpx`, `urllib3`) that may already be cached in the backend process.

- **Fixed import order in local providers**: Moved `_add_model_env()` calls to execute at the **very top** of provider modules (before any other imports including `asyncio`, `logging`, `from pathlib`, etc.). This ensures the per-model venv's site-packages take precedence.

- **Fixed provider map divergence**: Added missing provider mappings (`triposg`, `triposf`, `unirig`, `holopart`) to `registry.py` that existed in `engine.py`.

- **Added `EXTRA_DEPS` mechanism in `installer.py`**: Allows declaring inference libraries that are omitted from a repo's own requirements.txt (e.g., `hy3dgen` for Hunyuan3D-2) and installs them into the per-model venv.

### Files Modified

- `backend/app/core/providers/base.py` — Enhanced `_add_model_env()` with prepend + reload
- `backend/app/core/providers/hunyuan3d_local.py` — Early import of `_add_model_env()`
- `backend/app/core/providers/trellis_local.py` — Early import of `_add_model_env()`
- `backend/app/core/providers/triposr_local.py` — Early import of `_add_model_env()`
- `backend/app/core/providers/registry.py` — Added missing provider mappings
- `backend/runtime/installer.py` — Added `EXTRA_DEPS` mechanism

### Testing

```bash
# Verify provider imports work
python -c "from app.core.providers.base import _add_model_env"

# Check import order in providers
grep -n "_add_model_env" backend/app/core/providers/hunyuan3d_local.py
# Should see it at line ~17, before "import asyncio" or "import logging"
```

---

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
