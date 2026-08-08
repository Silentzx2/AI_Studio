# Plan: Integrate Hugging Face Accelerate + Reticle Debugging Tool

## Context & Analysis

### Current architecture (verified)

**Provider categories (6 distinct loading patterns):**

| Provider | Pattern | Actually loads PyTorch model? | File |
|---|---|---|---|
| TRELLISLocalProvider | `from_pretrained()` → `.to(device)` → verify GPU | Yes | `trellis_local.py` |
| Hunyuan3D21LocalProvider | `from_pretrained(device=device)` → verify GPU | Yes | `hunyuan3d_local.py` |
| Hunyuan3D2LocalProvider | same as above, different variant | Yes | `hunyuan3d_local.py` |
| TripoSRLocalProvider | `from_pretrained()` → `.to(device)` → verify GPU | Yes | `triposr_local.py` |
| AniGenProvider | `vram_tracker.allocate()` + optional SMPL load | Partially (SMPL only) | `anigen_provider.py` |
| HoloPart/UniRig/TripoSG/TripoSF/DetailGen3D | `vram_tracker.allocate()` only (simulated) | No | respective files |
| MockProvider | No loading | No | `mock.py` |

**Load flow (local model-loading providers – TRELLIS, Hunyuan3D-2, TripoSR):**
1. `RuntimeEngine.load_provider(name)` → `_instantiate_provider(name, device)` → imports provider class from `_PROVIDER_MAP`
2. Provider `__init__` resolves weights via `StorageConfig.get_weight_path()`
3. Provider `_ensure_loaded()` (on first `generate()` call) → calls `from_pretrained(weights_dir)` → calls `.to(device)` or passes `device=device`
4. `_verify_gpu_placement()` checks tensors are on CUDA
5. `_log_gpu_memory()` before/after load and inference
6. Unload: set model attr to `None` → `empty_cuda_cache()`

**Device/VRAM management:**
- `runtime/gpu.py`: `get_gpu_info()`, `select_device()`, `empty_cuda_cache()`, `check_vram_sufficient()`
- `runtime/capability.py`: `get_model_vram_required()` reads from `PROVIDER_METADATA.vram_required_mb`
- `app/core/managers/vram_tracker.py`: Redis-backed `VRAMAllocationTracker` for simulated providers
- `RuntimeEngine.get_best_provider_name()`: VRAM-aware fallback selection using `PROVIDER_PRIORITY`
- `RuntimeEngine.load_provider()`: uses `select_device("auto", max_vram_mb=vram_needed)`

**Per-model venv isolation:**
- Each model: `backend/third_party/<RepoName>/.venv/bin/python`
- `_add_model_env()` prepends venv site-packages to `sys.path` (local providers load in-process)
- AniGen runs inference via subprocess using per-model venv python
- `StorageConfig.get_weight_path()`: checks per-model dir first, then falls back to centralized `weights_dir/`

**Key finding — `MODEL_VRAM_REQUIREMENTS` bug:**
- `tasks.py:163` imports `MODEL_VRAM_REQUIREMENTS` from `runtime.engine`, but it is **NOT defined** in `engine.py`
- This is silently swallowed by the `except Exception` block in the fallback path (lines 185–197)
- Should be replaced with `get_model_vram_required()` from `runtime.capability`

**Existing Accelerate awareness in model repos:**
- Hunyuan3D-2's `pipelines.py` already imports `is_accelerate_available` and has `enable_model_cpu_offload()` using `cpu_offload_with_hook`
- Hunyuan3D-2's `Hunyuan3DDiTPipeline` has `to(device, dtype)` method that manually moves sub-models
- TRELLIS pipeline has `Pipeline.to(device)` and `Pipeline.cpu()` methods
- TripoSR's `TSR` uses `torch.load(..., map_location="cpu")` then standard loading

**AGENTS.md constraints (must not violate):**
- Every model lives under `third_party/<RepoName>/` — repo, venv, weights all in one folder
- `resolve_install_targets()` is the only allowed entry point for deciding which models to install
- Model inference runs via per-model `.venv/bin/python` as subprocess (current local providers load in-process — this is the existing architecture, must not be broken)
- Docker volumes for `storage` and `third_party` must stay bind mounts
- File-based install locks (`third_party/<RepoName>/.installing.lock`) must be respected
- `get_weight_path()` checks per-model first, then falls back to centralized (migration safety)

---

## Integration Strategy

**Scope:** Accelerate is a dependency that lives in the **backend venv** (not per-model venvs), because the local model-loading providers (TRELLIS, Hunyuan3D-2, TripoSR) import and run models **in-process** via `_add_model_env()` sys.path manipulation. The backend venv already has `torch` installed (via `requirements.txt`), so `accelerate` will resolve there.

**What NOT to do:**
- Do not modify any files in `third_party/<Repo>/` (upstream repos stay pristine)
- Do not change provider routing, model selection, or VRAM check thresholds
- Do not change the per-model venv isolation model
- Do not add fallback behavior that changes existing working paths
- Do not change model outputs (same dtype, same device for inference when VRAM is sufficient)

**What TO do:**
- Install `accelerate` in the backend venv and pin it in `backend/requirements.txt`
- Create a thin `runtime/accelerate_loader.py` that wraps Accelerate's big-model APIs
- Refactor the 3 local providers to use Accelerate for **device dispatch + memory-aware placement** when the model is large or VRAM is constrained, falling back to the existing `from_pretrained` + `.to(device)` path when Accelerate is unavailable (Colab without GPU, CPU-only, etc.)
- Fix the `MODEL_VRAM_REQUIREMENTS` bug

---

## Implementation Plan

### Phase 1: Install Accelerate in backend environment

**Task 1.1:** Add `accelerate` to `backend/requirements.txt`
- Add `accelerate>=0.34.0` (compatible with torch 2.5.1, supports `dispatch_model`, `init_empty_weights`, `load_checkpoint_and_dispatch`)
- Pin version to match the torch CUDA 12.1 stack

**Task 1.2:** Install `accelerate` into the backend venv
```bash
uv pip install "accelerate>=0.34.0"
```
- Verify import works: `python -c "from accelerate import dispatch_model, init_empty_weights, load_checkpoint_and_dispatch; print('OK')"`

**Task 1.3:** Add `accelerate` to per-model venv requirements where needed
- For TRELLIS, Hunyuan3D-2, and TripoSR per-model venvs: ensure `accelerate` is installed (via `EXTRA_DEPS` or the repo's own requirements)
- The Hunyuan3D-2 repo already conditionally imports accelerate (`is_accelerate_available`), so this just makes it available
- Update `EXTRA_DEPS` in `runtime/installer.py` if needed:
  ```python
  EXTRA_DEPS = {
      "Hunyuan3D-2": ["hy3dgen", "accelerate"],
      "TRELLIS": ["accelerate"],
      "TripoSR": ["accelerate"],
  }
  ```

### Phase 2: Create `runtime/accelerate_loader.py` helper module

**Task 2.1:** Create `backend/runtime/accelerate_loader.py` with the following functions:

- `accelerate_available() -> bool` — checks `import accelerate` without crashing if missing
- `compute_device_map(model, max_memory: dict | None = None, dtype=None) -> dict` — wraps `infer_auto_device_map` with `max_memory` from GPU/VRAM state
- `dispatch_to_device(model, device: str, offload_folder: Path | None = None, max_memory: dict | None = None) -> tuple[nn.Module, Any]` — uses `dispatch_model` or `attach_execution_device_hook` to move model to device with optional CPU offload
- `cleanup_model(model)` — removes Accelerate hooks, moves to CPU, calls `empty_cuda_cache()`
- `get_max_memory_per_device() -> dict` — reads from `runtime.gpu.get_gpu_info()` to build `max_memory` dict for `infer_auto_device_map`

The module must:
- Be import-safe when `accelerate` is not installed (graceful no-op, not crash)
- Preserve the existing `ponytail:` comment style
- Follow the lazy-import pattern already used in `runtime/gpu.py` and `runtime/storage.py`
- Log a `ponytail: Accelerate available / not available` line at first use

**Design decision (per-AGENTS.md — no unnecessary abstractions):**
This module provides ONE responsibility: bridge between the project's device/VRAM tracking and Accelerate's big-model APIs. It does NOT create a new provider abstraction layer. Each provider calls into it directly.

### Phase 3: Integrate Accelerate into local model-loading providers

#### Task 3.1: TRELLISLocalProvider (`trellis_local.py`)

**Current flow:**
```python
self._pipeline = TrellisImageTo3DPipeline.from_pretrained(str(self.weights_dir))
self._pipeline = self._pipeline.to(self.device)
```

**New flow:**
- After `from_pretrained()` and before `.to(device)`: check if `accelerate` is available and if VRAM is constrained (`vram_required_mb` > `free_vram_mb * safety_factor`)
- If constrained: use `dispatch_model()` on each sub-model in `self._pipeline.models` with `device_map="auto"` and `max_memory` from GPU info
- If unconstrained or Accelerate unavailable: keep existing `.to(device)` path
- If Accelerate dispatch is used: store a flag so `unload()` knows to call `cleanup_model()`

**Key constraint:** TRELLIS pipeline's `.to(device)` iterates `self.models.values()` and calls `.to(device)` on each. Accelerate's `dispatch_model` works on individual `nn.Module` instances. We dispatch each sub-model in `self._pipeline.models` individually, preserving the pipeline's own structure.

#### Task 3.2: Hunyuan3D21LocalProvider & Hunyuan3D2LocalProvider (`hunyuan3d_local.py`)

**Current flow:**
```python
self._model = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(str(self.weights_dir), device=self.device)
```
The `from_pretrained` accepts a `device` parameter and internally calls `self.to(device, dtype)`.

**New flow:**
- If Accelerate is available and VRAM is constrained:
  - Load with `device='cpu'` (or use `init_empty_weights` + `load_checkpoint_and_dispatch`)
  - Then use `dispatch_model()` on each sub-model (`self._model.model`, `self._model.vae`, `self._model.conditioner`) with `device_map="auto"`
  - Hunyuan3D-2 already has `model_cpu_offload_seq = "conditioner->model->vae"` and `enable_model_cpu_offload()` — leverage this
- If unconstrained or Accelerate unavailable: keep existing `device=self.device` path
- Set a flag for cleanup in `unload()`

**Key constraint:** Hunyuan3D-2 pipeline has multiple sub-models. Accelerate's `cpu_offload_with_hook` can chain them (conditioner→model→vae) for sequential offload, matching the `model_cpu_offload_seq`.

#### Task 3.3: TripoSRLocalProvider (`triposr_local.py`)

**Current flow:**
```python
self._model = TSR.from_pretrained(str(self.weights_dir), config_name="config.yaml", weight_name="model.ckpt")
self._model = self._model.to(self.device)
```

**New flow:**
- Same pattern as TRELLIS: after `from_pretrained()`, use `dispatch_model()` on `self._model` with `device_map="auto"` if VRAM is constrained
- `unload()`: call `cleanup_model()` which removes hooks and clears cache

### Phase 4: Fix `MODEL_VRAM_REQUIREMENTS` bug

**Task 4.1:** Remove the broken `from runtime.engine import MODEL_VRAM_REQUIREMENTS` (line 163 in `tasks.py`)
**Task 4.2:** Replace with `from runtime.capability import get_model_vram_required` and use `get_model_vram_required(provider_name)` instead of `MODEL_VRAM_REQUIREMENTS.get(provider_name, 0)`

This is the root-cause fix: `MODEL_VRAM_REQUIREMENTS` was never defined in `engine.py`, and the fallback path in `tasks.py` silently used `0` VRAM (meaning no VRAM check in the fallback path). Using the existing `get_model_vram_required()` from `capability.py` fixes this properly.

### Phase 5: Install Reticle debugging tool

**Reticle** is a dev-only verification tool (`@reticlehq/react` + framework plugin). It observes app network/state/console during development. It must be dev-only and gitignored.

**Task 5.1:** Add Reticle to devDependencies in `package.json`:
```bash
npm install -D @reticlehq/react
```

**Task 5.2:** Add gitignore entries:
- Add to `.gitignore`:
  ```
  # Reticle dev-only debugging tool
  .reticle/
  ```

**Task 5.3:** Create Reticle flow spec file for debugging generation flow
- Create `reticle.json` at project root defining a flow that verifies:
  1. Generation API call returns 200 with job_id
  2. SSE progress stream fires
  3. Status polling returns "completed" with model_url

### Phase 6: Verification

**Task 6.1:** Write a self-check test `backend/tests/test_accelerate_integration.py`
- Verify `runtime.accelerate_loader.accelerate_available()` returns bool without crash
- Verify `get_max_memory_per_device()` returns a dict (or empty dict on CPU)
- Verify `accelerate_loader` functions are import-safe when accelerate is absent (simulate with monkeypatch)

**Task 6.2:** Run existing test suite
```bash
cd backend && python -m pytest tests/ -v
```
Ensure no regressions in `test_runtime_routes.py` and `test_pipeline_registry.py`.

**Task 6.3:** Verify end-to-end (manual, since no GPU in this environment)
- `python -c "from runtime.accelerate_loader import accelerate_available; print(accelerate_available())"`
- `python -c "from runtime.engine import get_engine; print(get_engine().health())"`
- Verify `tasks.py` fallback path uses `get_model_vram_required()` correctly

---

## Per-Provider Accelerate Decision Matrix

| Provider | Integrates Accelerate? | Why |
|---|---|---|
| TRELLISLocalProvider | **Yes** — dispatch_model on each sub-model in `self._pipeline.models` | Loads full model into VRAM via `.to(device)`, no memory-aware dispatch |
| Hunyuan3D21LocalProvider | **Yes** — leverage existing `enable_model_cpu_offload` / `cpu_offload_with_hook` | Already has accelerate import + `model_cpu_offload_seq`; `from_pretrained` loads all weights to GPU at once |
| Hunyuan3D2LocalProvider | **Yes** — same as 2.1 variant | Same loading pattern |
| TripoSRLocalProvider | **Yes** — dispatch_model on `self._model` | Loads model then `.to(device)`, no offload |
| AniGenProvider | **No** — uses vram_tracker + subprocess; SMPL is small | Provider-specific SMPL loading doesn't benefit from accelerate; keep existing logic |
| HoloPartProvider | **No** — simulated loading, no PyTorch model | No actual model to dispatch |
| UniRigProvider | **No** — simulated loading, no PyTorch model | No actual model to dispatch |
| TripoSGProvider | **No** — simulated loading, no PyTorch model | No actual model to dispatch |
| TripoSFProvider | **No** — simulated loading, no PyTorch model | No actual model to dispatch |
| DetailGen3DProvider | **No** — simulated loading, no PyTorch model | No actual model to dispatch |
| MockProvider | **No** — no model loading | N/A |

**Rationale:** Only the 3 providers that actually load PyTorch model weights into GPU VRAM benefit from Accelerate's `dispatch_model` / `load_checkpoint_and_dispatch` / CPU offload hooks. The simulated providers (which use `vram_tracker.allocate()` as a memory reservation without loading a real model) and the mock provider have no model to dispatch. AniGen has a small SMPL model and already uses a subprocess pattern — Accelerate would add complexity without benefit.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Accelerate not installed in Colab/VPS environments | `accelerate_available()` check in all provider code — falls back to existing `.to(device)` path |
| Accelerate version incompatibility with per-model venv torch | Pin `accelerate>=0.34.0` in backend requirements; per-model venv gets same via `EXTRA_DEPS` |
| `dispatch_model` changes inference device placement → different outputs | Only use dispatch when VRAM is constrained; otherwise use existing path unchanged; dispatch to same CUDA device |
| `MODEL_VRAM_REQUIREMENTS` fix changes fallback VRAM behavior | The fix replaces a broken `0` with the real VRAM requirement — this is strictly better, prevents silent OOM |
| Reticle adds weight to production build | Dev-only (`-D` flag); tree-shaken in production; gitignored |
| Breaking existing `_verify_gpu_placement` checks | Keep verify checks unchanged; Accelerate dispatch puts tensors on CUDA, verify still passes |

---

## Validation Checklist

- [ ] `pip list | grep accelerate` shows it in backend venv
- [ ] `python -c "from runtime.accelerate_loader import accelerate_available; print(accelerate_available())"` runs without error
- [ ] `python -c "from runtime.engine import get_engine; e=get_engine(); print(e.health())"` works
- [ ] `tasks.py` no longer imports `MODEL_VRAM_REQUIREMENTS`; uses `get_model_vram_required()`
- [ ] `backend/tests/test_accelerate_integration.py` passes
- [ ] `cd backend && python -m pytest tests/ -v` — all existing tests pass
- [ ] `backend/requirements.txt` has `accelerate` pinned
- [ ] `package.json` has `@reticlehq/react` in devDependencies
- [ ] `.gitignore` has Reticle entries
- [ ] No changes to `third_party/<Repo>/` files (upstream repos untouched)
- [ ] Provider routing unchanged (same `_PROVIDER_MAP` and `PROVIDER_PRIORITY`)
- [ ] VRAM checks unchanged (`select_device`, `check_vram_sufficient` untouched)
- [ ] Model load/unload still works via existing path when Accelerate unavailable