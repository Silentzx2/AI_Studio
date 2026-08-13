# AI 3D Studio — Changelog

## v3.8.0 — 3D-SPACE Full Backend Integration (August 13, 2026)

### Changed
- Canvas3D drag-and-drop now uploads to `POST /api/v1/upload/model` and uses persistent backend URLs (no blob URLs).
- GenerationControls model upload uses persistent backend URL from upload response.
- Quality presets and credit estimates now sourced from shared `QUALITY_PRESETS` constant (`@/constants`) instead of hardcoded local arrays.
- AssetPanel 3D models category filter includes GLTF and STL.
- Backend upload/model endpoint now accepts `.fbx`, `.obj`, `.stl` in addition to `.glb`, `.gltf`.
- Backend assets listing endpoint recognizes all 5 3D formats (`.glb`, `.gltf`, `.fbx`, `.obj`, `.stl`).

### Added
- AssetPanel inspector now shows a delete button wired to real `DELETE /api/v1/jobs/{id}` endpoint.
- Session-local favorites documented with `ponytail:` annotation in `ThreeDGenWorkspace.tsx`.
- Proper blob URL cleanup on Canvas3D unmount (revokes only `blob:` URLs, never backend URLs).

### Removed
- Dead `outputFormat` state and its UI from GenerationControls (was never connected to generation config).
- Unused imports: `useProjectStore`, `Filter`, `MoreVertical`, `ImageIcon`, `Plus`, `ChevronDown`, `useCallback`.

### Verified
- All 3D workspace paths verified mock-free.
- TypeScript and ESLint pass with zero errors.

## v3.7.1 — 3D Generation Rebuilt as `/3d` (3D-SPACE components wired) (August 13, 2026)

### Added
- **`/3d` generation page** — full three-column 3D generation workspace, replacing the removed `ThreeDGenerationTab`.
- **`features/workspace/ThreeDGenWorkspace.tsx`** — composes the three `3D-SPACE/` building blocks (left `GenerationControls`, center `Canvas3D`, right `AssetPanel`) and feeds them real backend data via `useGenerationStore.loadHistory()`; refreshes the asset list when a generation completes.
- **`3D-SPACE/` components are now wired into the app**:
  - `GenerationControls` drives the real generation pipeline (`useGeneration` + `useGenerationStore` + `useRuntimeOptions`).
  - `Canvas3D` renders `currentJob.result` from `useGenerationStore` and reacts to `load-glb-model` custom events.
  - `AssetPanel` is fed real `jobHistory` assets with select → canvas (dispatch `load-glb-model`) and delete → backend (`DELETE /api/v1/jobs/:id`).
- **Nav link** added to `WorkspaceNavbar` (`/3d` — "3D Gen").

### Removed (Dead Code Cleanup)
- `features/workspace/viewer/DownloadArea.tsx` — zero importers.
- `features/workspace/new-ui/LayerVisibilityPanel.tsx` — zero importers.
- `features/workspace/new-ui/AssetLayersPanel.tsx` — zero importers.
- `features/workspace/new-ui/data.ts` — only exported the unused mock `officeChairShapes`; removed its dead import from `CreativeWorkspaceLayout.tsx`.

### Notes
- **No mock data**: the new page renders only real backend history; the previous `officeChairShapes` mock geometry is gone.
- The `viewer/` directory is retained (it still hosts the shared `ViewerScene.tsx` used by the Render and Texture features).

## v3.7.0 — 3D Generation Page Removed (Frontend Teardown) (Pending rebuild)

### Removed (frontend only — backend/API untouched)
- `features/workspace/new-ui/ThreeDGenerationTab.tsx` — the 3D Generation page (~1634 lines), including all inline sub-components (ModelToolPanel, SegmentToolPanel, RemeshToolPanel, TextureToolPanel, RigToolPanel, ViewerDropOverlay, ViewportTopBar, ViewerRightToolbar, MaterialBar, BottomDock, StatusBar, RightPanelWrapper).
- `features/workspace/new-ui/AssetStoragePanel.tsx` — right-panel asset browser, only used by the 3D Generation page.
- `features/workspace/viewer/ThreeDViewer.tsx` — 3D viewer wrapper, only used by the 3D Generation page.
- `features/workspace/viewer/ViewerToolbar.tsx` — viewer toolbar, only used by `ThreeDViewer`.

### Preserved for reuse
- `features/workspace/new-ui/ExportDialog.tsx` — GLB/ZIP export dialog (kept deliberately; will be reused by the rebuilt page).
- `features/workspace/viewer/ViewerScene.tsx` — shared Three.js scene, still used by the Render and Texture features.
- `features/render/` + `app/render` and `features/texture/` + `app/texture` — standalone render/texture pages (kept; not part of the 3D Generation page).

### Changed
- `features/workspace/new-ui/CreativeWorkspaceLayout.tsx` — removed the `ThreeDGenerationTab` import, the `3D Generation` sidebar item, and its render block; the four `setActiveSidebarItem('3D Generation')` navigations now land on `Workspace`.
- `features/workspace/new-ui/WorkspaceTab.tsx` and `CommunityTab.tsx` — "go to 3D Generation" actions now navigate to `Workspace`.

### Notes
- This is a deliberate teardown: the 3D Generation page will be rebuilt from scratch. No backend provider/API code was modified.

## v3.6.9 — 3D Generation Page Tripo-Style Redesign (August 12, 2026)

### Changed
- **3D Generation Page Complete Redesign**: Replaced the old multi-component 3D generation layout with a professional Tripo-style workspace featuring a three-column design: contextual tool strip + panel (left), central 3D viewer (center), and asset/inspector panel (right).
- **Tool Panel System**: Implemented five contextual tool panels — Model (Text→3D / Image→3D with mode switching, model selector, capability badges, prompt/image input, advanced settings, 3D model import), Segment (capability-gated segmentation), Retopology (topology mode, polygon target slider), Texture (capability-gated texture generation with PBR warning), Rig/Animate (rig status tracking with animation dependency gate).
- **Viewer Integration**: Preserved and reused the existing Three.js viewer (ThreeDViewer, ViewerScene, ViewerToolbar) without modification. Added drag-and-drop model upload overlay for the central viewport.
- **Asset / Inspector / History Right Panel**: Replaced the old right sidebar with a tabbed panel containing the real-backend-driven AssetStoragePanel, an InspectorTab for model metadata, and a HistoryTabContent for generation history.
- **Responsive Design**: Added mobile tool sheet and mobile right sheet overlays for tablet/mobile viewports while keeping the desktop three-column layout.

### Fixed
- **TypeScript: Invalid `Cube` icon import**: Removed `Cube` from lucide-react imports (not exported by the library).
- **TypeScript: `apiClient.post` return type**: Fixed five tool panels that incorrectly checked `res?.ok` on the parsed JSON response. The apiClient throws on non-OK HTTP status, so the `.ok` property does not exist on the return type. Changed to try/catch pattern.
- **TypeScript: `GenerationMode` type mismatch**: Fixed the `setMode` prop type in ModelToolPanel to accept `string` with an explicit cast at the call site where the store's `GenerationMode`-typed setter is passed.

### Removed (Dead Code Cleanup)
- `features/workspace/viewer/DownloadArea.tsx` — replaced by AssetStoragePanel export functionality.
- `features/workspace/new-ui/LayerVisibilityPanel.tsx` — zero importers, superseded by AssetStoragePanel.
- `features/workspace/new-ui/AssetLayersPanel.tsx` — zero importers, superseded by AssetStoragePanel.

### Unused Import Cleanup
- Removed 20 unused lucide-react icon imports from ThreeDGenerationTab.tsx (Play, EyeOff, ArrowRight, FileDown, Star, Search, Filter, MousePointer2, Hand, Focus, Grid2X2, ChevronRight, Clock, Download, Eye, RotateCcw, ZoomIn, Maximize2, Trash2, Move, Grid3X3).
- Removed unused `EXPORT_FORMATS` and `SUPPORTED_IMAGE_FORMATS` constant imports.

### Files Modified
- Frontend: `features/workspace/new-ui/ThreeDGenerationTab.tsx`
- Documentation: `Docs/architecture.md`, `Docs/CHANGELOG.md`

### Pre-Merge Deletion Checklist
> These files should be deleted before merging to the main branch. They are already removed from the EXTRACT directory but may still exist in the target branch.

The following files were listed in the original redesign spec (Section 0) for removal. Most were already deleted in prior releases. Verify they do not exist in the target branch:

- `features/workspace/BottomDock.tsx`
- `features/workspace/CenterWorkspace.tsx`
- `features/workspace/GenerateButton.tsx`
- `features/workspace/GeneratePanel.tsx`
- `features/workspace/ImageUpload.tsx`
- `features/workspace/JobProgressMonitor.tsx`
- `features/workspace/LeftSidebar.tsx`
- `features/workspace/ModelSelector.tsx`
- `features/workspace/PromptInput.tsx`
- `features/workspace/QualitySelector.tsx`
- `features/workspace/RightSidebar.tsx`
- `features/workspace/ToggleOptions.tsx`

Additionally, these dead-code files were removed in this release:

- `features/workspace/viewer/DownloadArea.tsx`
- `features/workspace/new-ui/LayerVisibilityPanel.tsx`
- `features/workspace/new-ui/AssetLayersPanel.tsx`

**Note**: `features/workspace/WorkspaceNavbar.tsx` is NOT deleted — it is the global navigation bar used by WorkspaceShell and is outside the scope of the 3D Generation page redesign.

## v3.6.8 — CLI Host Parameter Mapping (August 11, 2026)

### Fixed
- **Next.js CLI Start Options Mapping**: Implemented a dedicated `scripts/dev.js` script to cleanly intercept and map the unsupported `--host` parameter to Next.js's native `--hostname` option.
- **Frontend Startup Resolution**: Prevented Node.js from misinterpreting appended arguments as native node options, resolving the `node: bad option: --port` crash on start and restoring normal container routing on port 3000.

## v3.6.7 — Clean JSX Compile & Linter Compliance (August 11, 2026)

### Fixed
- **JSX Compilation Syntax Error**: Fixed a JSX element matching and closing tag syntax issue in `features/workspace/new-ui/ThreeDGenerationTab.tsx` around line 1320, resolving the `'Expected </', got 'jsx text'` build error.
- **Verification and Clean Dev Environment**: Recompiled the frontend application and restarted the development server to ensure a 100% clean, error-free runtime.

## v3.6.6 — Workspace Redesign & Centered Search Header (August 11, 2026)

### Added
- **Centered Header Cleanup**: Removed all side navigation links, brand tags, and notification components from the workspace header, resulting in a single centered, highly responsive commands search input.
- **Interactive Workspace Tab Redesign**: Completely refactored the project dashboard into a beautiful, fluid bento-grid layout:
  - **Real-Time Project Querying**: Integrated a responsive file filter search bar alongside format-specific badges (`GLB`, `OBJ`, `FBX`, `All`).
  - **Diagnostic Load Gauges**: Transformed simple bars into visual hardware monitors with real-time gradient loads.
  - **Automated Live Node Logs Stream**: Added a real-time reactive activity terminal that automatically documents node activities and file caching status.
  - **Interactive Tip Carousel**: Added a dynamic tipping guide displaying material, polygon reduction, and light baking parameters.

### Files Modified
- Frontend: `features/workspace/WorkspaceNavbar.tsx`
- Frontend: `features/workspace/new-ui/WorkspaceTab.tsx`

## v3.6.5 — Backend & Runtime Live Integration Verification (August 11, 2026)

### Verified
- **Strict Live Connection Policy**: Verified that the entire System Monitor panel pulls real-time data from native endpoints:
  - **GPU Engine Metrics**: Fetched dynamically via `apiClient.get('/api/v1/runtime/status')` to bind real CUDA, driver, GPU name, and utilization telemetry.
  - **Connection/Backend Indicator**: Polled every 5 seconds using `/api/v1/runtime/health` health checks for status detection.
  - **VRAM Utilization**: Computes percentages based on actual available device memories returned by the container environment.
- **Zero-Mock Policy Enforcement**: Inspected and verified that no mock states or dummy fallbacks exist in the monitoring footer.

### Files Audited
- `features/workspace/new-ui/CreativeWorkspaceLayout.tsx`
- `hooks/useBackendData.ts`
- `services/runtimeService.ts`

## v3.6.4 — Interactive System Monitor & GPU Accordion (August 11, 2026)

### Added
- **System Monitor Visibility Toggle**: Integrated a chevron-based collapse/expand button in the "System Monitor" header, allowing users to tuck away the monitor widgets.
- **Collapsible GPU Engine Details**: Converted the static GPU indicator into an interactive accordion. Clicking the GPU row reveals deep device metrics:
  - **Name** (e.g., CUDA device model/vendor)
  - **Utilization** (real-time processing load percentage)
  - **Temperature** (live thermodynamic reading)
  - **CUDA & Driver versions**

### Files Modified
- Frontend: `features/workspace/new-ui/CreativeWorkspaceLayout.tsx`

## v3.6.3 — Layout Zoom Responsiveness & Flex Enhancements (August 11, 2026)

### Fixed
- **Viewport Layout Zoom Scaling**: Resolved sidebar vertical overflow where footer elements were pushed out of view on 100% default zoom (or smaller screen heights). Removed parent relative `h-full` limits and introduced a flattened `min-h-0` flex sidebar model that scrolls beautifully when compressed while keeping the footer pinned at the bottom.

### Files Modified
- Frontend: `features/workspace/new-ui/CreativeWorkspaceLayout.tsx`

## v3.6.2 — Persistent GPU & VRAM System Monitoring (August 11, 2026)

### Added
- **Refined System Monitor Footer Area**: Rebuilt the bottom-left sidebar monitor into 3 flat, clean, and distinct rows matching the native workspace design theme perfectly.
- **Separated Status Rows & Logic**: Completely decoupled the GPU engine and the backend connection states:
  - **GPU**: Displays active physical CUDA engine status.
  - **Backend**: Tracks network connectivity status to the server.
- **Compact Inline VRAM Monitor**: Embedded a highly responsive, space-efficient, sub-component visual progress bar alongside the VRAM usage metrics.
- **Clean Section Heading**: Standardized the monitoring zone with a subtle, grey, uppercase uppercase "System Monitor" header consistent with other sidebar elements.

### Files Modified
- Frontend: `features/workspace/new-ui/CreativeWorkspaceLayout.tsx`, `features/workspace/WorkspaceNavbar.tsx`

## v3.6.1 — Bug Fixes & Hardening (August 11, 2026)

### Fixed
- **Generation endpoint broken**: `req.provider` and `req.workspace` raised `AttributeError` on every request because the inline `GenerationRequest` in `generation.py` was missing those fields. Consolidated to the schema `GenerationRequest` (single source of truth) with full field coverage and validation.
- **Celery task registration gap**: `download_workers`, `health_workers`, and `installation_workers` used `@shared_task` but were never imported by `celery_app`, so their tasks (`execute_download`, `get_system_health`, `install_model`, etc.) were dispatched by the API but never executed. Added modules to `includes` + explicit imports + `task_routes` → `images` queue.
- **OOM retry NameError**: `_can_retry_low_vram` logged `job_id` which was not in scope, crashing the worker exactly when an OOM should be skipped. Added `job_id` parameter and updated the call site.
- **Celery beat never started**: `beat_schedule` was defined but `celery beat` was never launched in `start.sh` or `colab.sh`. Added embedded `-B` to both worker launch commands so the periodic VRAM health check actually runs.
- **ViewerScene TypeScript errors**: fixed missing parentheses on `if` conditions, corrected `three-stdlib` imports to use the root package export, and aligned `useLoader` return types (`Group` for FBX/OBJ, `BufferGeometry` for STL).

### Changed
- **Colab bootstrap**: removed unnecessary `python3-venv` apt install (uv handles venv creation), exported `PROJECT_ROOT` for heredoc/subprocess safety.
- **Docs**: updated architecture, developer guide, setup guide, API docs, and pipeline status to reflect the actual celery config, worker queues, and generation request schema.

### Files Modified
- Backend: `backend/app/api/v1/generation.py`, `backend/app/schemas/generation.py`, `backend/app/workers/celery_app.py`, `backend/app/workers/tasks.py`, `backend/runtime/installer.py`, `backend/app/core/providers/trellis_local.py`
- Frontend: `features/workspace/viewer/ViewerScene.tsx`
- Scripts: `scripts/start.sh`, `scripts/colab.sh`
- Docs: `Docs/architecture.md`, `Docs/developer-guide.md`, `Docs/setup-guide.md`, `Docs/api-documentation.md`, `Docs/pipeline-status.md`, `Docs/CHANGELOG.md`

## v3.6.0 — DetailGen3D (real) + TripoSG Providers (August 10, 2026)

### Added
- **DetailGen3D provider** (`detailgen3d`): real generative 3D geometry enhancement. Takes a coarse mesh (GLB) + reference image → detailed mesh GLB. Based on TripoSG; uses HunyuanDiT, FlashVDM, 3DShape2VecSet. `PROVIDER_MODES` is `{"remesh", "post-processing"}` — it does NOT do texture. Pure-PyTorch FPS fallback added to `detailgen3d/models/autoencoders/autoencoder_kl_triposg.py` so the `torch-cluster` CUDA build is avoided.
- **TripoSG provider** (`triposg`): real 1.5B rectified-flow image→3D mesh/GLB pipeline. `PROVIDER_MODES` is `{"image-to-3d"}` — image-to-3d ONLY (no text-to-3d, no texture/PBR). Adds both `backend/third_party/TripoSG` (for the `triposg` package) and `backend/third_party/TripoSG/scripts` (for `briarmbg`, `image_process`) to `sys.path`. Loads `BriaRMBG` for background removal and `TripoSGPipeline` for mesh generation; exports GLB via `prepare_image` + `TripoSGPipeline(..., guidance_scale=7.0, num_inference_steps=50)`.
- **Installer wiring**: `REPOS["TripoSG"]` and `REPOS["DetailGen3D"]` added; `HF_MODELS["triposg"] = VAST-AI/TripoSG` (~2 GB) and `HF_MODELS["detailgen3d"] = VAST-AI/DetailGen3D`; `PROVIDER_METADATA` entries added with honest VRAM/capability/workspace metadata.
- **Engine registration**: `triposg` added to `PROVIDER_PRIORITY` (after `hunyuan3d-2-mini`) and `PROVIDER_MODES`/`_PROVIDER_MAP`. `detailgen3d` modes corrected to `{"remesh", "post-processing"}`.
- **Model registry + frontend**: both models surfaced in `model_registry.py` `_raw` list and the offline `LOCAL_MODELS` fallback in `ThreeDGenerationTab.tsx` with honest capability flags.
- **Tests**: `backend/tests/test_detailgen3d.py` and `backend/tests/test_triposg.py` verify metadata honesty, engine routing/modes, provider import + `_HAS_DEPS` guard, HF_MODELS entries, and weights-path resolution.

### Honest capability notes
- **DetailGen3D**: `supports_image_to_3d: False`, `supports_texture: False`, `supports_detail_enhancement: True`. Workspace compatibility: `["post-processing", "remesh"]`. VRAM ceiling `vram_required_mb: 4000` (provisional, not GPU-verified on this box).
- **TripoSG**: `supports_text_to_3d: False`, `supports_image_to_3d: True`, `supports_texture: False`. Workspace compatibility: `["mesh-generation"]`. VRAM ceiling `vram_required_mb: 8192` (official "at least 8 GB VRAM"; not GPU-verified here).
- **Both real implementations are NOT GPU-verified on this box** (no GPU present; tests run CPU-only and only assert wiring/metadata). Inference must be validated on real hardware before marking READY.

### Files Modified
- Backend: `runtime/installer.py`, `runtime/engine.py`, `app/core/providers/detailgen3d.py`, `app/core/providers/triposg_local.py` (new), `app/core/registry/model_registry.py`, `app/workers/tasks.py` (detail pass verified), `tests/test_detailgen3d.py` (new), `tests/test_triposg.py` (new)
- Frontend: `features/workspace/new-ui/ThreeDGenerationTab.tsx`, `features/workspace/new-ui/RemeshTab.tsx` (verified)

## v3.5.2 — Hunyuan3D-2 Mini Provider (August 10, 2026)

### Added
- **Hunyuan3D-2 Mini provider** (`hunyuan3d-2-mini`): 0.6B image-to-shape model added to the existing Hunyuan provider family. Installs only the `hunyuan3d-dit-v2-mini/` subfolder (~4 GB) from `tencent/Hunyuan3D-2mini`, avoiding the ~25 GB full repo. Downloads via `snapshot_download` with `allow_patterns`/`ignore_patterns` (skips duplicate `.ckpt` files).
- **Image-to-3D only**: the mini pipeline (`Hunyuan3DDiTFlowMatchingPipeline`) has no text prompt — `PROVIDER_MODES` gates routing to `image-to-3d` only and `_text_to_3d` raises `NotImplementedError`. Frontend model lists surface `text_to_3d: false` automatically.
- **Combined texture flow**: `generate_texture` on an image-to-3d request textures the mesh via the sibling Hunyuan3D-2 paint pipeline (upstream `textured_shape_gen_mini.py`). Soft dependency — logs and skips when the `hunyuan3d-2` (2.0) delight weights are absent. The mini is NOT a standalone texture-generation model.
- **Nested weights layout support**: `_has_real_weight_files` in `runtime/storage.py` is now recursive so snapshots that keep weights in a per-model subfolder (`hunyuan3d-dit-v2-mini/`) are detected as installed (also fixes a regression where `hunyuan3d-2` could resolve to a shared weights root when only a sibling model was present).
- **UI**: `Hunyuan3D-2 Mini` surfaced in the workspace model picker (via the runtime options API, which iterates `PROVIDER_METADATA`) and in the offline `LOCAL_MODELS` fallback in `ThreeDGenerationTab.tsx`.

### Honest VRAM notes
- `vram_required_mb: 6144` is derived from the official figure (6 GB VRAM for shape generation on the 1.1B model; the 0.6B mini is smaller, so 6 GB is a conservative ceiling).
- `low_vram_required_mb: 4096` is an **estimate, not GPU-verified** — flagged provisional until measured on real hardware.
- The mini supports `cpu_offload`, `attention_slicing`, and `vae_cpu_offload` low-VRAM strategies.

### Files Modified
- Backend: `runtime/installer.py`, `runtime/storage.py`, `runtime/engine.py`, `app/core/providers/hunyuan3d_local.py`, `app/core/registry/model_registry.py`, `tests/test_hunyuan_mini.py` (new)
- Frontend: `features/workspace/new-ui/ThreeDGenerationTab.tsx`

## v3.5.1 — Auto VRAM Planner: Low-VRAM Mode End-to-End (August 10, 2026)

### Added
- **Low-VRAM generation mode**: providers with a verified low-VRAM footprint (Hunyuan3D-2 / 2.1) can now be loaded with a memory-optimized strategy. The engine resolves the requested mode (`auto`/`normal`/`low`) via the existing Auto VRAM planner (`plan_vram_usage`), gates device selection on the actual footprint, and instantiates providers with `low_vram=True`.
- **Hunyuan low-VRAM loading**: `_HunyuanBase` loads pipelines on CPU then applies the strategy from `apply_low_vram_mode` (Accelerate dispatch / attention slicing / float16), with an Accelerate offload folder under the per-model weights dir. Texture pipeline honors the same mode.
- **OOM retry**: when a job OOMs during generation, the worker retries once in low VRAM mode (only for providers that support it, so a buggy provider is not double-run). Job record is updated to `low_vram=True` so the UI shows the fallback.

### Fixed
- **Provider selection now respects low mode**: `get_best_provider_name` previously rejected any provider whose *normal* VRAM requirement exceeded free VRAM (e.g. a 12 GB Hunyuan3D-2 on an 8 GB GPU) even when low mode fits. It now accepts a candidate that fits either footprint.
- **Output validation**: the worker now validates the generated GLB (`validate_glb`) before Blender post-processing, rejecting corrupt/empty output instead of surfacing it in the UI.

### Files Modified
- Backend: `runtime/engine.py`, `app/core/providers/hunyuan3d_local.py`, `app/workers/tasks.py`

## v3.5.0 — API Connectivity & History Synchronization (August 9, 2026)

### Fixed
- **Proxy Header Refinement**: Removed redundant `content-type: application/json` from GET requests in the API proxy, improving compatibility with standard backend expectations.
- **Job History Deduplication**: Unified generation history management in the `useGenerationStore`. History is now deduplicated by ID and normalized to handle varied backend responses (flat prompt vs nested config) correctly.
- **Asset Loading Logic**: Fixed a bug where loading a project from history would lose its model URL. `HistoryItem` now carries the `modelUrl`, allowing the workspace to load the actual 3D asset instead of a geometric mockup.

### Improved
- **Store Source of Truth**: Refactored `CreativeWorkspaceLayout` to rely on the centralized `useGenerationStore` for history, ensuring all tabs (`My Assets`, `Favorites`, etc.) stay in sync.
- **Refresh Capability**: Added `refreshHistory` action to the generation store to allow manual revalidation of the asset list.

## v3.4.9 — Workspace UI Cleanup & Layout Optimization (August 9, 2026)

### Fixed
- **Double Header Issue**: Removed the redundant global `WorkspaceNavbar` from `WorkspaceShell`. The workspace now uses a unified single-header layout where tab-specific toolbars handle secondary actions, reducing vertical clutter.
- **3D Viewer Expansion**: Removed `max-h` constraints on the 3D viewport in `ThreeDGenerationTab`, allowing the canvas to expand vertically and utilize the full available height.

### Removed
- **Scene Grid**: Removed the `<Grid />` component and its toggle button from the 3D Generation workspace per user request for a cleaner viewing environment.

---

## v3.4.8 — UI Polishing & Animation Enhancement (August 9, 2026)

### Added
- **AnimeJS Animations:** Added smooth, spring-based animations to all drag-and-drop file upload zones across `ThreeDGenerationTab`, `TextureGenTab`, `RemeshTab`, and `RiggingAnimationTab`.
- **Button Feedback:** Implemented a subtle `scale` bounce animation for the "Generate" button in the ThreeD Generation tab when clicked.
- **Model Auto-load:** After a GLB/GLTF file completes uploading on any workspace tab, a custom `load-glb-model` event is now dispatched. The `ViewerScene` intercepts this and immediately loads the preview of the model in the canvas, improving the UX.

### Fixed
- **Linter Purity Error:** Fixed a React Hooks purity warning in `BottomDock.tsx` where `Date.now()` was called synchronously inside the component body. Wrapped it inside `useCallback` to stabilize it.
- **Build Types:** Added missing `@types/animejs` to resolve type-checking errors during the build step.

---

## v3.4.7 — Fix TRELLIS/Hunyuan3D Load: torch/torchvision Version Mismatch (August 9, 2026)

### Problem

Pressing **Generate** on the 3D generation page failed for the `trellis` provider with:

```
RuntimeError: operator torchvision::nms does not exist
```

Root cause: the per-model install step installed **unpinned** `torch torchvision torchaudio`
into each model's `.venv`, which resolved to the latest builds (`torch 2.13.0 / torchvision
0.28.0`). But the backend process loads its own `torch 2.5.1+cu121` first. When a provider
runs in-process, `_add_model_env()` prepends the per-model venv's site-packages, so
`torchvision 0.28.0` is imported from the per-model venv while `torch` stays the already-loaded
backend `2.5.1`. torchvision's C++ operator registration (`torchvision::nms`) then fails against
the incompatible torch → the `nms` error. The same broken stack (`2.13/0.28`) was also present in
the Hunyuan3D-2 venv (same install path).

### Solution

- **`backend/runtime/installer.py`**: added `_backend_torch_stack()` which resolves the backend
  venv's exact `torch`/`torchvision`/`torchaudio` versions + the matching PyTorch wheel index
  (derived from the `+cuXXX` build tag) and a `_install_torch_stack()` helper. Both install paths
  (`_uv_install` and `_install_trellis_deps`) now pin the per-model venv's torch stack to the
  backend build instead of installing unpinned latest. This keeps every in-process provider on a
  single ABI-compatible torch.
- **`clone_repo()`** now runs `git submodule update --init --recursive` after cloning: `--depth 1`
  skips submodules (e.g. TRELLIS's FlexiCubes CUDA extension), which previously left in-repo source
  missing.

### Verification

- Confirmed broken state: TRELLIS venv had `torch 2.13.0+cu130 / torchvision 0.28.0+cu130`; backend
  had `2.5.1+cu121 / 0.20.1+cu121`.
- Reinstalled the torch stack in the existing `TRELLIS` and `Hunyuan3D-2` venvs to
  `2.5.1+cu121 / 0.20.1+cu121 / 2.5.1+cu121` and confirmed `trellis` now imports past
  `torchvision` (the `nms` error no longer occurs).
- `_backend_torch_stack()` returns
  `https://download.pytorch.org/whl/cu121` + `['torch==2.5.1+cu121','torchvision==0.20.1+cu121','torchaudio==2.5.1+cu121']`.

### Known follow-up (separate, pre-existing)

TRELLIS still requires its **FlexiCubes** submodule to be built (`pip install` of the
`MaxtirError/FlexiCubes` extension, which needs `kaolin` + a CUDA build). That is a distinct
install/build issue from this torch mismatch and is tracked separately.

### Files Modified

- `backend/runtime/installer.py` — `_backend_torch_stack()`, `_install_torch_stack()`,
  updated `_uv_install()` and `_install_trellis_deps()`, `clone_repo()` submodule init

---

## v3.4.6 — Remove Pipelines Page + TripoSR/HoloPart Cleanup (August 9, 2026)

### Removed

- **Pipelines page** fully removed from Settings (`features/settings/sections/PipelinesSection.tsx` and `pipelines/PipelinesDashboard.tsx` deleted; section def, reset keys, and render case removed from `app/settings/page.tsx`).
- **TripoSG removed entirely**: backend providers (`triposg_provider.py`), `model_registry` entry, `engine.py`/`providers/registry.py` maps, tests, docs, and shell scripts.
- **HoloPart** removed: deleted `backend/third_party/HoloPart` folder and the unused `backend/third_party/TripoSR` folder.
- Removed dead `adminService.getPipelines()`/`togglePipeline()` and the now-unused `PipelineSnapshot`/`PipelineStatus`/`PipelineFeatureFlags` types.

### Moved

- The 4 **Global AI Capability** toggles (3D Generation, Remesh & Refine, Texture Generation, Rigging & Animation) now live in the **AI Models** page (`ModelsTab.tsx`) via `useUIStore.capabilities`.

### Kept

- TripoSF and all other providers untouched. Backend `/api/v1/pipelines` endpoints kept — `/workspace-models` still powers the workspace model pickers.

### Files Modified

- `app/settings/page.tsx`, `features/admin/tabs/ModelsTab.tsx`, `features/settings/sections/index.ts`, `services/adminService.ts`, `types/index.ts`, `stores/useAppStore.ts`, `components/CommandPalette.tsx`, `features/settings/sections/GenerationSection.tsx`, `features/workspace/new-ui/{ThreeDGenerationTab,TextureGenTab,WorkspaceSettingsTab}.tsx`, `package-production.sh`, `scripts/update-models.sh`, backend `config.py`, `discover.py`, `registry.py`, `model_registry.py`, `environment_manager.py`, `engine.py`, `installer.py`, tests
- Deleted: `PipelinesSection.tsx`, `pipelines/PipelinesDashboard.tsx`, `triposr.py`, `triposr_local.py`, `backend/third_party/{HoloPart,TripoSR}`, `backend/app/core/providers/triposg_provider.py`
- Docs: `Docs/README.md`, `Docs/architecture.md`, `Docs/api-documentation.md`, `Docs/developer-guide.md`

## v3.4.5 — Remove Downloads Page from Settings (August 9, 2026)

### Removed

- The **Downloads** page is fully removed from Settings and the admin sidebar (was `features/admin/tabs/DownloadsTab.tsx`).
- Removed the `downloads` entry from `ADMIN_NAV_ITEMS`, the `AdminTab` union, the settings section definition, and the render case in `app/settings/page.tsx`.
- The workspace **BottomDock** downloads tab is unchanged (it has its own inline `DownloadsTab`).

### Files Modified

- `constants/index.ts`, `features/admin/AdminShell.tsx`, `app/settings/page.tsx`, `features/admin/tabs/index.ts`, `Docs/README.md`, `Docs/architecture.md`
- Deleted: `features/admin/tabs/DownloadsTab.tsx`

## v3.4.4 — Terminal-Style Logs Page with Full ActivityLogger Integration (August 9, 2026)

### Improved

- **Logs page** (Settings → Logs / admin Logs tab) rebuilt as a large, authentic Linux terminal: near-black background (`#05070b`), macOS traffic-light title bar with a `tail -f app.log --follow` prompt + blinking cursor, a tmux-style status bar (LIVE mode, level/source/wrap state, per-level counts), and a much taller viewport (`calc(100vh-420px)`, min 460px) instead of the cramped 64vh card.
- Added a `terminal-cursor` blink animation in `app/globals.css`.

### Integrated

- The frontend `ActivityLogger` events are now fully visible in the Logs page: `components/ActivityLogger.tsx` captures all API calls and button/link clicks, forwards them to `POST /api/v1/system/log` (logger name `frontend`), and they render live in the terminal alongside backend logs with the `frontend` source badge (green).
- `SOURCE_COLORS` updated: `frontend` → green, `pipelines` → purple (replaced the undefined `--neon-orange`).

### Files Modified

- `features/admin/tabs/LogsTab.tsx`, `components/ActivityLogger.tsx`, `backend/app/api/v1/system.py`, `app/globals.css`

## v3.4.3 — Remove Reticle, Add Unified Project Logger (August 9, 2026)

### Removed

- **Reticle** (dev observability SDK) removed completely: `@reticlehq/next`, `@reticlehq/react`, `@reticlehq/server` packages, `.reticle.json`, `.mcp.json` MCP registration, `.kilo/reticle-generation-flow.json`, `app/reticle-dev.tsx`, `backend/app/reticle_observer.py`, `backend/app/middleware.py` (`ReticleMiddleware`), `reticle` pip dep, Reticle daemon startup + `RETICLE_*` env vars in `scripts/start.sh`, `.env.example`, `.env.development.local`, `backend/.env.development`, and the `.gitignore` Reticle section.
- Removed the now-obsolete `test_accelerate_in_gitignore` test (asserted Reticle entries in `.gitignore`).

### Added

- **Unified project logger**: `components/ActivityLogger.tsx` (mounted in `app/layout.tsx`) wraps `window.fetch` to capture all API calls and listens for button/link clicks. Events are logged to the browser console and fire-and-forget POSTed to the new `POST /api/v1/system/log` endpoint in `backend/app/api/v1/system.py`, which writes them to the backend log.
- Backend request timing middleware bumped from DEBUG to INFO so every API call lands in `logs/api.log` — one unified log for the whole project (backend requests + frontend API calls + user clicks).

### Files Modified

- Deleted: `app/reticle-dev.tsx`, `backend/app/reticle_observer.py`, `backend/app/middleware.py`, `.reticle.json`, `.mcp.json`, `.kilo/reticle-generation-flow.json`
- Modified: `app/layout.tsx`, `components/ActivityLogger.tsx` (new), `next.config.ts`, `package.json`, `package-lock.json`, `backend/app/main.py`, `backend/app/api/v1/system.py`, `backend/requirements.txt`, `backend/tests/test_accelerate_integration.py`, `scripts/start.sh`, `.env.example`, `.env.development.local`, `backend/.env.development`, `.gitignore`, `Docs/*.md`

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
