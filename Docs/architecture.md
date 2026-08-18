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

Component-level install state is persisted to the database via the `ProviderInstallState` model (`backend/app/models/registry.py`). The installer calls `persist_provider_state()` after status changes, and the runtime API serves cached status via `get_persisted_install_status()`.

### Manifest-driven repair

`POST /repair/{provider_name}` delegates to `install_provider()` in `runtime/installer.py`. The endpoint:
1. Loads the provider's YAML manifest
2. Calls `install_provider(provider_name, hf_token, allow_native_build=False, skip_preflight=False)` as a background task
3. Returns `state`, `components`, and `blocking_reason` via `GET /install/status`

Repair is manifest-driven rather than a hard-coded re-clone/re-install: it re-runs the full install pipeline (repo, env, weights, preflight) and surfaces the exact blocking component if the provider still cannot reach READY.

### Race-safe lock ownership

The native-build lock now tracks `owner_type` (`api` or `celery`) so that an API-initiated install can safely hand off to a Celery worker without deadlocking or stale lock claims.

See `Docs/INSTALLATION_STATES.md` for full reference.

## Frontend Architecture

### Persistent Workspace Layout

The frontend follows a Tripo Studio-style persistent workspace: ONE global 3D canvas that never unmounts, with dynamic left/right panels that swap based on the active sidebar tab.

#### Routing
- `app/page.tsx` and `app/workspace/page.tsx` both render `WorkspaceShell`.
- `WorkspaceShell` wraps `CreativeWorkspaceLayout` (single entry point).

#### Layout Structure
```
┌─────────────────────────────────────────────────────┐
│  #creative-top-bar  (app name + active tab label)   │
├───────────┬─────────────────────────────────┬──────┤
│           │                                 │      │
│ #creative-│    CENTER: Canvas3D             │ Right│
│ sidebar   │    (persistent 3D canvas —      │panel │
│ (tabs)    │     NEVER unmounts)             │      │
│           │                                 │      │
│ Left panel│         (R3F Canvas)            │      │
│ (dynamic) │                                 │      │
│           │                                 │      │
└───────────┴─────────────────────────────────┴──────┘
```

#### Component Flow
- **Left sidebar** (`#creative-sidebar`): Tab navigation. Tabs: Dashboard, 3D Gen, Rigging & Animation, Remesh, Texture Gen, My Assets, Models, Favorites, API Access, Settings. Collapsible, mobile drawer.
- **Left panel (dynamic)**: Swaps content based on active tab — `GenerationControls`, `RemeshTab`, `TextureGenTab`, `RiggingAnimationTab`, or tab-specific content.
- **Center**: `Canvas3D` (`3D-SPACE/Canvas3D.tsx`) — persistent, wraps R3F `<Canvas>`, handles GLB/GLTF/FBX/OBJ/STL loading, drag-drop, shading presets, lighting presets, snapshot capture.
- **Right panel (contextual)**: `AssetPanel` for 3D-related tabs (3D Gen, Remesh, Texture Gen, Rigging), `AssetPanelHost` for other tabs.

#### Global State
- `useViewerStore`: Single source of truth for loaded model URL + name. Updated via `loadModelInViewer()`. Survives tab switches because Canvas3D stays mounted.
- `useUIStore`: Viewer mode, fullscreen, grid, wireframe, stats, capabilities flags, mobile menu.
- `useGenerationStore`: Prompt, mode, quality, currentJob, jobHistory.
- `useProjectStore`: Project/layer state.
- `useAppStore`: Main global Zustand store with persistence.

#### Dead Code Removed
- `WorkspaceNavbar.tsx`: Never imported. The sidebar in `CreativeWorkspaceLayout` handles all tab navigation.
- `features/workspace/viewer/ViewerScene.tsx`: Not imported by any page.
