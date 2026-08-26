# Runtime Architecture

This document describes the **backend runtime** that loads, schedules, and runs the
local 3D-generation / rigging / post-processing models on GPU. It is the source of
truth for how a generation job reaches a model on the GPU.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     API (FastAPI)                            │
│  app/api/v1/{generation, runtime, admin, models, ...}        │
└───────────────────────────────┬─────────────────────────────┘
                                 │  enqueue
┌───────────────────────────────▼─────────────────────────────┐
│              Workers (Celery + Redis)                        │
│  app/workers/tasks.py :: generate_3d_model()                 │
│    - selects provider (engine.get_best_provider_name)        │
│    - loads provider (engine.load_provider, VRAM-aware)       │
│    - runs provider.generate()                                │
│    - OOM retry once in low-VRAM mode                         │
│    - unloads after job / on failure                          │
│  app/workers/installation_workers.py :: run_native_build()   │
│    - executes manifest native_steps inside per-model venv    │
│    - owns native-build lock for build + preflight + smoke    │
│    - auto-triggers preflight on success                      │
│    - queues on dedicated `installation` queue                │
└───────────────────────────────┬─────────────────────────────┘
                                 │
┌───────────────────────────────▼─────────────────────────────┐
│                Runtime Engine (runtime/engine.py)            │
│  RuntimeEngine: single GPU slot, provider registry,          │
│  VRAM-aware best-provider selection (PROVIDER_PRIORITY,      │
│  PROVIDER_MODES), low/normal vram planning.                  │
└───────────────────────────────┬─────────────────────────────┘
                                 │  instantiate
┌───────────────────────────────▼─────────────────────────────┐
│   Local Providers (app/core/providers/*_local.py)            │
│  Hunyuan3D 2.1 / 2 / 2-Mini, TRELLIS, TripoSG,             │
│  AniGen, UniRig, DetailGen3D, Mock                          │
│  - each calls _add_model_env() BEFORE imports so the         │
│    per-model .venv packages win over the backend's           │
│  - load on device via accelerate_loader                      │
└───────────────────────────────┬─────────────────────────────┘
                                 │
┌───────────────────────────────▼─────────────────────────────┐
│   runtime/  support modules                                  │
│  gpu.py        - CUDA/VRAM detection, device selection      │
│  accelerate_loader.py - cpu offload / device_map dispatch,   │
│                    verify_gpu_placement, safe_unload         │
│  capability.py - per-model VRAM + low-VRAM policy            │
│  installer.py  - clone repos, per-model venv, weights       │
│  storage.py    - per-model path resolution (StorageConfig)   │
└─────────────────────────────────────────────────────────────┘
```

## Provider registry (the integration boundary)

Two maps must stay in sync — `runtime/engine.py::_PROVIDER_MAP` (engine load path)
and `app/core/providers/registry.py::_RUNTIME_PROVIDER_MAP` (validation +
`get_provider()`). They list the **same** runtime providers:

| provider id | engine class | low-VRAM |
|-------------|--------------|----------|
| `hunyuan3d-2.1` | `Hunyuan3D21LocalProvider` | verified |
| `hunyuan3d-2` | `Hunyuan3D2LocalProvider` | verified |
| `hunyuan3d-2-mini` | `Hunyuan3D2MiniLocalProvider` | verified (image-to-3D only) |
| `trellis` | `TRELLISLocalProvider` | no (native CUDA build) |
| `triposg` | `TripoSGLocalProvider` | no |
| `anigen` | `AniGenProvider` | no (native build) |
| `unirig` | `UniRigProvider` | no (native build) |
| `detailgen3d` | `DetailGen3DProvider` | no |
| `mock` | `MockProvider` | n/a (testing) |

Aliases `hunyuan3d` / `hunyuan3d-1.0` resolve to `hunyuan3d-2.1`.

> **v3.8.7 fix**: `hunyuan3d-2-mini` and `triposg` were missing from the registry
> map (engine-only), so `validate_provider_switch()` rejected them and
> `get_provider()` silently fell back to mock. Both maps are now aligned.

## GPU loading & low-VRAM

1. `engine.load_provider()` resolves a mode via `capability.plan_vram_usage()`
   (normal vs verified low-VRAM) and selects a device with `gpu.select_device()`.
2. The local provider loads weights with `accelerate_loader`:
   - **normal**: `pipeline.from_pretrained(device=...)` (tensors on CUDA).
   - **low-VRAM** (Hunyuan3D only): `enable_model_cpu_offload` / `device_map`
     keeps tensors on CPU between steps and moves them to GPU on demand.
3. `verify_gpu_placement()` runs after load. It **skips** the hard CUDA assertion
   when the model is offloaded via Accelerate (CPU<->GPU by design) and only fails
   on a genuine silent CPU fallback.

   > **v3.8.7 fix**: previously the check raised `RuntimeError` on every low-VRAM
   > load because offloaded tensors rest on CPU at rest — aborting all low-VRAM
   > Hunyuan3D runs.

## Per-model isolation

Each model is self-contained under `third_party/<RepoName>/`: its own `.venv/`
(created by `uv`, torch pinned to the backend's exact build), `weights/`, and
`cache/`. `storage.StorageConfig` resolves weight paths with a legacy fallback.
Install state is mirrored in `runtime/installer.py::get_install_status()`.

## Two-Stage Model Setup (v3.9+)

Model installation is split into two strictly separated stages:

### Stage A — Runtime Installation
`prepare_runtime(provider_name)` in `runtime/installer.py`:
1. Clone repo into `third_party/<repo>/` (idempotent: reuse if valid)
2. Create `third_party/<repo>/.venv` (idempotent: reuse if valid)
3. Discover dependency files (requirements.txt, pyproject.toml, manifest)
4. Install normal dependencies into model venv
5. Resolve native dependencies via **wheel-first** logic:
   - Check static `WHEEL_COMPAT_TABLE` for prebuilt wheel
   - Wheel found → install wheel (no compilation)
   - No wheel → interactive prompt "build from source? [y/N]"
     - YES → build inside model venv
     - NO → skip, mark SKIPPED, continue
6. Run preflight (without weights check)
7. Return: `runtime_ready` | `runtime_partial` | `runtime_blocked` | `runtime_failed`

**Does NOT download weights.**

### Stage B — Weight Download
`download_model_weights(provider_name)` in `runtime/installer.py`:
1. Check runtime status → if not ready, return error "Runtime not ready"
2. Resolve weight manifest
3. Download to `third_party/<repo>/weights/<provider>` (canonical location)
4. Verify checksum + completeness
5. Return: `weights_ready` | `weights_failed`

**Does NOT clone repos, create venvs, or install deps.**

### Entry Points
- `scripts/setup.sh` → Stage A only (no weights)
- `scripts/colab.sh` → Stage A + Stage B (separate steps)
- `POST /api/v1/runtime/prepare-runtime` → Stage A
- `POST /api/v1/runtime/download-weights` → Stage B
- `POST /api/v1/runtime/install` → Stage A + B (backward compat)

### Wheel-First Dependency Resolver
`runtime/dependency_resolver.py` classifies dependencies into:
- **NORMAL** — standard pip install
- **NATIVE** — compiles CUDA/C++ (diso, torch-cluster, flash-attn, pytorch3d, spconv, etc.)
- **BUILD_ONLY** — only needed at build time
- **OPTIONAL** — platform-specific optional

Static `WHEEL_COMPAT_TABLE` maps native packages to wheel availability per (py_ver, cuda_ver, platform). No network calls — deterministic, works offline.

### Component-Level State Machine
Fine-grained states for UI status:
- `RepoState`: missing | ready | failed
- `EnvState`: missing | creating | ready | failed
- `DepsState`: pending | installing | ready | partial | failed
- `NativeState`: not_required | pending | checking_wheel | wheel_found | wheel_installed | build_pending | build_running | ready | skipped | failed
- `WeightsState`: missing | downloading | verifying | ready | incomplete | failed
- `ModelState`: not_ready | partial | ready | blocked | failed

MODEL_READY requires: repo=ready AND env=ready AND deps=ready AND (native=ready OR wheel_installed OR not_required) AND weights=ready AND preflight=passed.

## Manifest authority for dependency installation

YAML manifests in `backend/runtime/manifests/` are the **authoritative installation contract**
for dependency installation. `install_repo_deps()` in `runtime/installer.py` now consumes
`manifest["environment"]` and `manifest["dependencies"]` directly:

- **Python version pin**: `environment.python` is passed to `uv venv --python <version>` when
  creating the per-model venv (only when a manifest exists; existing behavior is preserved
  otherwise).
- **Dependency source**: `dependencies.python` + `dependencies.native` are combined into a
  temporary requirements file and installed via `_uv_install`. `REPOS[*]["requirements"]` is
  **not consulted** when a manifest is present — the manifest is the single source of truth.
- **Torch stack**: `_install_torch_stack()` is called to mirror the backend's exact
  torch/torchvision/torchaudio build into each per-model venv.
- **Backward-compat fallback**: When no manifest exists for a provider, `install_repo_deps`
  falls back to `REPOS[*]["requirements"]`. The TRELLIS upstream conda-based setup
  (`_install_trellis_deps`) is preserved as the no-manifest fallback for TRELLIS.
- **External caller compat**: The `requirements_override` parameter on `install_repo_deps()`
  is retained for backward-compatible callers that still pass it (e.g.
  `RuntimeInstaller.install_repo_deps_for_models`).

JSON/Python provider metadata tables (`REPOS`, `HF_MODELS`, `PROVIDER_METADATA`) remain
authoritative only for **catalog/UI/API identity** (repo URLs, VRAM estimates, provider
aliases, weight keys). They no longer drive dependency installation.

## Installation States

YAML manifests are the installation-contract authority. Component-level state is persisted to the database. Preflight runs real model load + smoke tests. Repair is manifest-driven.

Models now report detailed component status instead of binary "installed".

### State flow

```text
DISCOVERED -> REPO_READY -> ENV_READY -> WEIGHTS_READY -> PREFLIGHT_RUNNING -> READY
```

Blocking states: `NATIVE_BUILD_PENDING`, `BLOCKED`, `AUXILIARY_WEIGHTS_MISSING`, `FAILED`, `CUDA_INCOMPATIBLE`, `VRAM_INSUFFICIENT`

### Key components

Each provider reports status for: Repository, Environment, Main weights, Auxiliary weights, Native build, CUDA, VRAM, Preflight, Capabilities.

### Manifest-driven installation

Each model has a YAML manifest in `backend/runtime/manifests/` that defines:
- Source repository + submodules
- Environment requirements (Python, PyTorch, CUDA versions)
- Dependencies (python packages, import checks, native extensions)
- Primary and auxiliary weights
- Hardware requirements (VRAM)
- Per-capability settings (including per-capability native build requirements)
- Preflight checks

### Preflight (real tests, not stubs)

`preflight.py` now implements **real** `model_load` and `capability_smoke` tests inside the target model's venv (not the backend interpreter). The previous `NOT_IMPLEMENTED` stubs have been replaced with actual validation, so a provider that fails preflight stays blocked until the issue is resolved.

### VRAM enforcement

Manifest `minimum_vram_mb` (from the `hardware` section) is now a **hard preflight/READY gate** — not just an informational display. During preflight the reported available VRAM is compared against the manifest value; if insufficient the provider transitions to `VRAM_INSUFFICIENT` and cannot reach `READY`.

### Per-capability native builds

Capabilities can declare `native_build_required: true` in their manifest section (e.g., Hunyuan3D 2.1's `texture_pbr`). This triggers a capability-level build step during installation, tracked via a per-capability `native_build_pending` state so other capabilities (e.g., `shape`) remain unblocked.

### Auxiliary weight enforcement

Auxiliary weights marked `required: true` in the manifest produce an `AUXILIARY_WEIGHTS_MISSING` blocking state when the download is missing — even if the primary weights and environment are fine.

### Component-level install state persistence

Component-level install state is persisted to the database via the `ProviderInstallState` model (`backend/app/models/registry.py`). The installer calls `persist_provider_state()` after status changes. The `GET /api/v1/admin/install/status` endpoint is **live-authoritative**: it calls `get_install_status()` at request time and treats the runtime result as the source of truth for `state`, `blocking_reason`, and `components`. Persisted DB state only supplies historical/task details (e.g. last task id, timestamps) and is never used to override a live `BLOCKED`/`PARTIAL`/`FAILED` state or to resurrect a stale `READY`.

### Manifest-driven repair

`POST /repair/{provider_name}` delegates to `install_provider()` in `runtime/installer.py`. The endpoint:
1. Loads the provider's YAML manifest
2. Calls `install_provider(provider_name, hf_token, allow_native_build=False, skip_preflight=False)` as a background task
3. Returns `state`, `components`, and `blocking_reason` via `GET /install/status`

Repair is manifest-driven rather than a hard-coded re-clone/re-install: it re-runs the full install pipeline (repo, env, weights, preflight) and surfaces the exact blocking component if the provider still cannot reach READY.

### Race-safe lock ownership

The install lock tracks `owner_type` (`api` or `celery`) so that an API-initiated install can safely hand off to a Celery worker without deadlocking or stale lock claims. The native-build lock is held by the `native_build_worker` owner for the entire native-build workflow — from start through preflight, model load, and capability smoke tests — and is released only after the complete workflow succeeds or fails. Lock ownership is held across the entire install/native-build workflow and is released only after the complete workflow succeeds or fails.

See `Docs/INSTALLATION_STATES.md` for full reference.

## Frontend Architecture

### Persistent Workspace Layout (v2 - Refactored)

The frontend uses a modern persistent workspace: ONE global 3D viewport (`MeshViewer`) that never unmounts, with dynamic left/right panels that swap based on the active sidebar tab.

#### Routing
- `app/page.tsx` and `app/workspace/page.tsx` both render `WorkspaceShell` (wrapped in `WorkspaceProvider`).
- `WorkspaceShell` wraps the new modular layout structure from `/features/new-workspace/`.

#### Layout Structure
```
┌─────────────────────────────────────────────────────┐
│  #persistent-top-header  (brand + nav + status)     │
├───────────┬─────────────────────────────────┬──────┤
│           │                                 │      │
│ #left-    │    CENTER: MeshViewer           │ Right│
│ tool-rail │    (persistent 3D viewport —   │panel │
│ (tools)   │     NEVER unmounts)             │      │
│           │                                 │      │
│ Left panel│         (Three.js Canvas)       │      │
│ (dynamic) │                                 │      │
│           │                                 │      │
└───────────┴─────────────────────────────────┴──────┘
```

#### New Component Organization (`/features/new-workspace/`)
- **WorkspaceShell**: Entry point — renders TopHeader, LeftNavigation, tool panels, MeshViewer, right panels, modals
- **Viewport/MeshViewer.tsx**: Full Three.js viewport with 3-point lighting, floor grid, turntable auto-rotation, camera presets, drag-and-drop asset loading
- **Navigation/LeftNavigation.tsx**: Vertical icon rail with 8 tool buttons
- **Panels/**: Tool-specific panels (GeneratePanel, TexturePanel, RiggingPanel, AnimatePanel, RemeshPanel, SegmentationPanel, SecondaryPanels)
- **RightPanel/**: Contextual panels (RightAssetsPanel, RightPropertyPanel, RightPromptPanel)
- **Header/TopHeader.tsx**: Brand logo, workspace mode switcher, navigation links, backend status pill
- **Modals/**: ExportModal, SettingsModal, DccBridgeModal
- **Notifications/ProgressOverlay.tsx**: Real-time generation progress overlay
- **Dashboard/**: StudioDashboard, SystemPage, OutputsPage
- **store/WorkspaceContext.tsx**: React Context for UI state, bridged to Zustand via `lib/storeAdapter.ts`
- **lib/api.ts**: API client targeting `/api/v1/*` FastAPI endpoints

#### Global State
- `useAppStore`: Primary persisted Zustand store (localStorage) — generation params, UI state, tasks, downloads, project
- `useViewerStore`: Independent store — loaded model URL/name, shading mode, model stats, rig/animation info
- `useGenerationStore`: Proxy store — mirrors generation state from `useAppStore` with `subscribeWithSelector`
- `useUIStore`: Proxy store — mirrors UI state from `useAppStore`
- `useProjectStore`: Proxy store — project/layer management
- `WorkspaceContext`: New React Context for workspace UI state (tool selection, assets, execution status), synced with Zustand via `lib/storeAdapter.ts`

#### API Layer
- All frontend API calls target `/api/v1/*` FastAPI endpoints
- No ComfyUI backend required; existing FastAPI handles all generation
- API client in `features/new-workspace/lib/api.ts` provides system stats, history, job management

#### Dead Code Removed
- `/features/workspace/` — old workspace UI (backed up to `/tmp/workspace-ui-old-backup.tar.gz`)
- `NodesPanel.tsx` / `NodeList.tsx` — ComfyUI-style node graph editor (not needed, FastAPI handles all generation)
- `SecondaryPanels.tsx` image pre-processor — GPT-Img tab removed (image-to-3D still available in GeneratePanel)

#### Theme System
- `stores/useThemeStore.ts` — Zustand store for workspace colors (14 color properties)
- `components/AppearanceProvider.tsx` — Outputs CSS custom properties for all workspace colors
- `features/settings/sections/AppearanceSection.tsx` — Color pickers + preset swatches in Settings → Appearance
- All workspace components use `var(--ws-*, fallback)` for colors
- Default theme preserved (dark with gold accent) — user can customize via Appearance settings
- Settings persist to localStorage and apply live without page reload
- `/3D-SPACE/` — old 3D components (Canvas3D, AssetPanel, GenerationControls)
- All ComfyUI-specific code and `react-router-dom` dependency from workspace

#### Dependency Installation
- **Manifest-based**: Each model's `manifest.yaml` is the single source of truth for dependencies
- **EXTRA_DEPS**: Packages not in the repo's requirements.txt (e.g., `hy3dgen` for Hunyuan3D) are installed separately with `--reinstall`
- **one_of / alternatives**: `attention_backend.one_of` in manifest is respected (only first alternative installed)
- **Pillow fix**: Force-reinstalls Pillow if C extension (`_imaging`) is missing or corrupted (detects from manifest or repo files)
- **CUDA 12.x support**: All CUDA 12.0-12.8 versions supported with automatic wheel selection
- **CPU fallback**: On CPU-only machines, installs CPU wheels and marks models as PARTIAL
- **Preflight**: Stage A skips weights check (weights are Stage B)
- **GPU cleanup**: Explicit `torch.cuda.empty_cache()` + `gc.collect()` on model unload

#### 3D Model Upload
- **Endpoint**: `POST /api/v1/upload/model` handles GLB, GLTF, FBX, OBJ, STL
- **Storage**: Files saved to `storage_local_path/models/`
- **Thumbnails**: Generated server-side for GLB/GLTF, stored in `storage_local_path/thumbnails/`
- **Frontend**: `RightAssetsPanel.tsx` uploads via `apiClient.uploadFile()` and uses backend-returned URLs
