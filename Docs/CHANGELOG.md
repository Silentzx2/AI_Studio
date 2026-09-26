# ForMash 3D — Changelog

All notable changes, architectural updates, and feature implementations for ForMash 3D are documented in this file.

---

## [Unreleased]

### 🛡️ Generation Runtime Hardening & Jobs UI Consolidation (2026-09-26)
- **TripoSR Adapter Hardening**: Added path resolution (`backend/pretrained/TripoSR` or `pretrained/TripoSR`), explicit catching of native extension / CUDA mismatch errors (e.g. `torchmcubes` or `libcudart`) with chained root cause preservation (`from e`), fixed texture metadata reporting (`texture_requested`, `texture_bake_succeeded`, `has_texture`), and verified output file existence, size, and valid non-empty mesh topology before returning success.
- **TripoSG Adapter Hardening**: Added deterministic snapshot provenance resolving local weights or downloading snapshot locally to prevent remote mutable diffusers custom code resolution failures; preserved real load exceptions with `from e`; added strict output mesh validation.
- **Scheduler Worker Lifecycle & VRAM Safety**:
  - Implemented worker process initialization handshake via `control_response_queue`, eliminating false worker starts when model loading fails.
  - Replaced endless `"NO_VRAM"` requeue loops on worker startup failure with `"MODEL_LOAD_FAILED"` that immediately marks the job `FAILED` in the job queue with actionable diagnostic details.
  - Added 600s timeout handling in `_handle_job_result`.
  - Added pending future resolution in `_cleanup_dead_workers` so the scheduler never hangs when worker processes terminate unexpectedly.
  - Added `proc.is_alive()` validation in `_find_available_worker`.
  - Hardened `JobQueue.fail_job` to look up and mark failed jobs in both `_processing_cache` and `_queue_cache`.
- **Installer Hardening**:
  - Removed masked `|| true` errors on TripoSF, TripoSG, TripoSR, and ardy requirements in `backend/scripts/install.sh`, halting on failure with model-specific diagnostics.
  - Added comprehensive post-installation runtime environment diagnostics (Python, PyTorch, Torch CUDA, GPU name, capability, NumPy, Diffusers, Transformers, Open3D, MeshLab, Trimesh).
- **Jobs UI Consolidation**:
  - Added authoritative `Jobs` entry to the main workspace left navigation rail (`features/workspace/Navigation/LeftNavigation.tsx`) with hotkey shortcut `⌘3`, linking directly to `/workspace/jobs`.
  - Consolidated Admin `JobsTab.tsx`: eliminated artificial 50% progress bars in favor of truthful status badges, removed non-functional fake "Try Repair" button and toast, added canonical inspector header banner, and preserved deep-linking to `/workspace/jobs?id={id}`.
- **Model Registry Documentation Alignment**: Reconciled documentation in `README.md` to reflect all 23 discrete registered model adapters configured across 15 neural architectures.
- **Unit Test Suite**: Added `backend/tests/test_fix_plan_verification.py` verifying TripoSR/TripoSG error handling, output validation, worker liveness, dead worker future resolution, and immediate failure propagation on model load errors.

### 🔧 Backend Environment Discovery & Startup Resilience
- **Robust Conda & Venv Resolution**: Rewrote Python 3.10 runtime lookup in `backend/scripts/run_server.sh` to auto-detect Conda installations (`/opt/conda`, `~/miniconda3`, `/content/miniconda3`) and locate the `3daigc-api` environment even within non-interactive subshells.
- **Eliminated Destructive Startup Reinstalls**: Prevented blind creation of empty `.venv` and unconstrained raw PyPI package downloads on startup that previously caused disk-space exhaustion (`No space left on device`) and missing module errors (`yaml`).
- **Configuration Persistence**: Added automatic persistence of `FORMASH3D_ENV_MANAGER` and `PYTHON_EXEC` into `.env` upon environment setup in `backend/scripts/install.sh`.
- **HuggingFace CLI Python Fallback**: Updated `backend/scripts/download_models.sh` to resolve `PYTHON_EXEC` for fallback downloads.
- **Unified Banner Art**: Synchronized ASCII banner art across `manager.sh` and `scripts/setup.sh` to display `FORMASH 3D`.
- **Automated Self-Check**: Added `scripts/test_env_resolution.sh` smoke test to verify non-destructive environment discovery.

### 🏷️ Project Rebrand to ForMash 3D & Repository Migration
- **Project Rebrand**: Executed complete first-party rebrand from AI Studio to **ForMash 3D** (short technical identifier: `ForMash3D`) across UI components, browser titles, metadata, app icons, webmanifest, local caches, storage keys, CLI scripts, and backend FastAPI documentation.
- **Repository & Submodule Migration**: Updated canonical repository origin to `https://github.com/Silentzx2/ForMash3D.git` and submodule remote to `https://github.com/Silentzx2/ForMash3D-ThirdParty.git`.
- **Submodule Update**: Fast-forwarded `backend/thirdparty` submodule to latest upstream commit (`e617f28`) with bundled prebuilt CUDA wheels and static banner asset.
- **Static Asset Migration**: Switched project banner from external hosted image to local static asset `assets/banner.png`.
- **Backward Compatibility**: Preserved fallback support for legacy environment variables (`FORMASH3D_*` with `AI_STUDIO_*` fallback).
- **Attribution & Licensing**: Preserved all upstream third-party attributions, licenses, and model architectures (`3DAIGC-API`, `TripoSR`/`SG`/`SF`, `TRELLIS`, `Hunyuan3D`, `PartField`, `UniRig`, `ARDY`, `PartPacker`, `UltraShape`).

---

## Versioning

This project follows [Semantic Versioning](https://semver.org/).
