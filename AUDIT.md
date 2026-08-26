# AI 3D Studio — Deep Runtime & Dependency Audit Report

## 1. Executive Summary

The AI 3D Studio uses a **single-process architecture** with `sys.path` manipulation for model isolation. Each model has its own `.venv` with isolated dependencies, but all models run in the **same Python process** as the backend worker. The `_add_model_env()` function handles model switching by manipulating `sys.path` and clearing `sys.modules` for shared packages.

**Key Finding**: The architecture is functional but has several dependency gaps and implementation issues that cause runtime failures.

---

## 2. Exact Runtime Flow

```
request → FastAPI endpoint
       → Celery task (generate_3d_model)
       → RuntimeEngine.load_provider()
       → _instantiate_provider()
       → provider.load() [calls _add_model_env()]
       → sys.path manipulation + sys.modules cleanup
       → model imports from per-model venv
       → GPU allocation + weight loading
       → generate()
       → provider.unload()
       → RuntimeEngine.unload_provider()
```

---

## 3. Dependency Installation Flow

### Backend Dependencies
- Source: `backend/requirements.txt`
- Installed in: `backend/.venv/`
- Contains: FastAPI, Celery, torch, etc.

### Model Dependencies
- Source: `backend/runtime/manifests/*.yaml` (authoritative)
- Installed in: `backend/third_party/<repo>/.venv/`
- Flow:
  1. Clone repo → `backend/third_party/<repo>/`
  2. Read manifest → extract `dependencies.python` + `dependencies.native`
  3. Create `.venv` with Python 3.10
  4. Install torch stack (matching backend build)
  5. Install python deps via `uv pip install`
  6. Install native deps (wheel-first, then source build)
  7. Install EXTRA_DEPS (hy3dgen, diffusers, etc.)

### Weights
- Source: Hugging Face repositories
- Stored in: `backend/third_party/<repo>/weights/<weight_key>/`
- Downloaded in Stage B (separate from dependency installation)

---

## 4. Per-Model Manifest Table

| Provider | Manifest | Repo URL | Python Deps | Native Deps | Weights |
|----------|----------|----------|-------------|-------------|---------|
| hunyuan3d-2.1 | `hunyuan3d_21.yaml` | Tencent-Hunyuan/Hunyuan3D-2.1 | 20+ deps including omegaconf, pillow, imageio | None (uses hy3dgen) | tencent/Hunyuan3D-2.1 |
| hunyuan3d-2 | `hunyuan3d_2.yaml` | Tencent-Hunyuan/Hunyuan3D-2 | 20+ deps including omegaconf, pillow, imageio | None (uses hy3dgen) | tencent/Hunyuan3D-2 |
| hunyuan3d-2-mini | `hunyuan3d_2_mini.yaml` | Tencent-Hunyuan/Hunyuan3D-2 | 21 deps (same as hunyuan3d-2) | None (uses hy3dgen) | tencent/Hunyuan3D-2mini |
| trellis | `trellis.yaml` | microsoft/TRELLIS | 22 deps including diffusers, omegaconf | flash_attn, xformers, diffoctreerast, spconv, kaolin, nvdiffrast | microsoft/TRELLIS-image-large |
| triposg | `triposg.yaml` | VAST-AI-Research/TripoSG | 18 deps including peft | diso | VAST-AI/TripoSG |
| anigen | `anigen.yaml` | VAST-AI-Research/AniGen | 24 deps including geffnet, utils3d | spconv, pytorch3d, nvdiffrast | VAST-AI/AniGen_Weights |
| detailgen3d | `detailgen3d.yaml` | VAST-AI-Research/DetailGen3D | 17 deps including peft | diso, torch-cluster | VAST-AI/DetailGen3D |
| unirig | `unirig.yaml` | VAST-AI-Research/UniRig | 18 deps including pytorch_lightning | torch_scatter, torch_cluster, spconv | VAST-AI/UniRig |

---

## 5. Dependency Gap Table

| Model | Missing Dependency | Evidence | Manifest | Provider | Severity |
|-------|-------------------|----------|----------|----------|----------|
| **AniGen** | `smplx` | `anigen_provider.py:93` imports `smplx` | `anigen.yaml` | `anigen_provider.py` | **P1 - HIGH** |
| TRELLIS | `one_of` not respected | Installer combines python+native | `trellis.yaml` | `installer.py` | **P2 - MEDIUM** |
| All | EXTRA_DEPS may fail silently | No verification after install | `installer.py` | `installer.py` | **P2 - MEDIUM** |

### AniGen smplx Detail
- `anigen_provider.py:93`: `import smplx`
- `anigen_provider.py:96`: `smplx.create(model_path=..., model_type="smpl", ...)`
- Manifest `anigen.yaml` does NOT list `smplx`
- Provider has try/except fallback, but main functionality is broken

---

## 6. Dependency Conflict Table

| Package | Model A | Model B | Conflict Risk | Evidence |
|---------|---------|---------|---------------|----------|
| transformers | 4.40 (AniGen) | 5.15.1 (TripoSG) | LOW | Per-model venv isolates versions |
| diffusers | 0.34 (TripoSG) | 0.40 (TRELLIS) | LOW | Per-model venv isolates versions |
| huggingface_hub | 0.27.1 (Hunyuan3D) | latest (TRELLIS) | LOW | Per-model venv isolates versions |
| numpy | 1.24-2.0 (AniGen) | 2.2.6 ( TripoSG) | LOW | Per-model venv isolates versions |

**Note**: Per-model venvs effectively isolate package versions. Conflicts are unlikely.

---

## 7. Python Isolation Analysis

| Question | Answer |
|----------|--------|
| Separate process? | **NO** - All models run in same Python process |
| Separate interpreter? | **NO** - Single Python interpreter |
| Separate venv? | **YES** - Each model has its own `.venv` |
| Separate sys.modules? | **PARTIAL** - Shared packages cleared from `sys.modules` on switch |
| Separate CUDA context? | **NO** - Single CUDA context shared |

### How Model Switching Works
1. `_add_model_env("Model_B")` is called
2. Model B's repo path prepended to `sys.path`
3. Model B's `.venv/site-packages` prepended to `sys.path`
4. Backend `.venv/site-packages` moved to end of `sys.path`
5. Shared packages removed from `sys.modules`: `accelerate`, `huggingface_hub`, `transformers`, `diffusers`, `pydantic`, `requests`, `httpx`, `urllib3`
6. Fresh imports come from Model B's venv

### Potential Issues
- Native `.so`/CUDA extensions may remain loaded after model switch
- Singleton/global state may survive model switch
- Objects from Model A may retain references after unload

---

## 8. Model Switching Analysis

### A → B → A Flow
1. Load Model A → `_add_model_env("Model_A")` → sys.path = [A_repo, A_venv, ..., backend_venv]
2. Model A imports → uses A_venv packages
3. Generate → weights on GPU
4. Unload Model A → `safe_unload()` → weights off GPU
5. Load Model B → `_add_model_env("Model_B")` → sys.path = [B_repo, B_venv, ..., backend_venv]
6. Shared packages cleared from `sys.modules`
7. Model B imports → uses B_venv packages
8. Generate → weights on GPU
9. Switch back to A → `_add_model_env("Model_A")` again
10. Model A imports → uses A_venv packages

### Verdict
Model switching should work reliably because:
- Each model's venv is isolated
- `sys.path` is correctly manipulated
- `sys.modules` is cleared for shared packages

### Risk
- Native extensions (`.so` files) may remain loaded
- CUDA contexts may persist
- Memory leaks possible if references retained

---

## 9. GPU Lifecycle Analysis

| Stage | What Happens |
|-------|--------------|
| Load provider | `vram_tracker.allocate()` → `select_device()` → `acquire()` |
| Load weights | Model weights loaded to GPU via `provider.load()` |
| Generate | Inference runs on GPU |
| Unload | `safe_unload()` → `vram_tracker.deallocate()` → `release()` |
| Next provider | `torch.cuda.empty_cache()` called? **NOT VERIFIED** |

### Missing
- `gc.collect()` not explicitly called
- `torch.cuda.empty_cache()` usage not verified
- CUDA context cleanup not verified

---

## 10. Confirmed Bugs

### P1 - HIGH: AniGen Missing `smplx`
- **File**: `backend/app/core/providers/anigen_provider.py:93`
- **Manifest**: `backend/runtime/manifests/anigen.yaml`
- **Issue**: `smplx` imported but not in manifest
- **Impact**: AniGen rigging functionality broken

### P2 - MEDIUM: TRELLIS `one_of` Not Respected
- **File**: `backend/runtime/dependency_resolver.py`
- **Manifest**: `backend/runtime/manifests/trellis.yaml:50-53`
- **Issue**: Manifest says `one_of: [flash-attn, xformers]` but installer installs both
- **Impact**: Unnecessary builds, potential conflicts

### P2 - MEDIUM: Preflight Weights Check in Stage A
- **File**: `backend/runtime/preflight.py:495-500`
- **Issue**: Stage A preflight checked for weights (not downloaded until Stage B)
- **Impact**: False "runtime partial" warnings
- **Status**: **FIXED** in previous commit

### P2 - MEDIUM: Redis Fallback Not Working
- **File**: `backend/app/workers/celery_app.py:66-69`
- **Issue**: Celery app reads from settings, not environment variables
- **Impact**: Redis connection errors on Colab
- **Status**: **FIXED** in previous commit

---

## 11. Potential Risks

| Risk | Description | Severity |
|------|-------------|----------|
| Native extension leak | `.so` files may remain loaded after model switch | MEDIUM |
| CUDA memory leak | `empty_cache()` not explicitly called | MEDIUM |
| Reference retention | Model objects may retain references after unload | LOW |
| Corrupted venv reuse | Packages from previous installs may be corrupted | **HIGH** |

---

## 12. Recommended Fixes

### P1: Add `smplx` to AniGen Manifest
- **File**: `backend/runtime/manifests/anigen.yaml`
- **Change**: Add `- "smplx"` to `dependencies.python`
- **Why**: Provider code imports `smplx` but it's not installed
- **Side effects**: None

### P2: Respect `one_of` in Installer
- **File**: `backend/runtime/dependency_resolver.py`
- **Change**: Parse `one_of` from manifest and install only one
- **Why**: Manifest declares alternatives, not both
- **Side effects**: May break models that need both

### P2: Verify EXTRA_DEPS Installation
- **File**: `backend/runtime/installer.py`
- **Change**: Verify packages can be imported after install
- **Why**: Silent failures leave models non-functional
- **Side effects**: Slightly slower install

### P3: Explicit CUDA Cleanup
- **File**: `backend/runtime/engine.py`
- **Change**: Add `torch.cuda.empty_cache()` and `gc.collect()` in `unload_provider()`
- **Why**: Prevent GPU memory leaks
- **Side effects**: Slightly slower model switching

---

## 13. DO NOT IMPLEMENT YET

This audit identifies issues but does not implement fixes. Await explicit instruction before modifying code.

---

## Appendix: File Paths Referenced

| Path | Role |
|------|------|
| `backend/runtime/installer.py` | Core installer logic |
| `backend/runtime/preflight.py` | Preflight validation |
| `backend/runtime/dependency_resolver.py` | Dependency resolution |
| `backend/runtime/manifests/*.yaml` | Per-model dependency manifests |
| `backend/app/core/providers/base.py` | `_add_model_env()` function |
| `backend/app/core/providers/anigen_provider.py` | AniGen provider (smplx gap) |
| `backend/app/core/providers/triposg_local.py` | TripoSG provider |
| `backend/runtime/engine.py` | RuntimeEngine (model loading/unloading) |
| `backend/app/workers/celery_app.py` | Celery configuration |
| `scripts/setup.sh` | Local/VPS setup |
| `scripts/colab.sh` | Colab setup |
