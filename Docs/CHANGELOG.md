# ForMash 3D — Changelog

All notable changes, architectural updates, and feature implementations for ForMash 3D are documented in this file.

---

## [Unreleased]

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
