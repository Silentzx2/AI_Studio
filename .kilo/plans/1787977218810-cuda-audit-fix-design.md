# AI Studio — Safe Fix Design Report: CUDA Audit & Fix Priority

**Date:** 2026-08-29
**Agent:** Agent 4 (Safe Fix Design)
**Input:** DEEP_DEPENDENCY_AUDIT.md + full codebase CUDA audit

---

## 1. CUDA Audit Results

### 1.1 Hard-coded CUDA values found

| Location | Value | Classification | Reasoning |
|----------|-------|----------------|-----------|
| `backend/runtime/manifests/anigen.yaml:11` | `cuda: '12.4'` | ✅ **Legitimate** | Model-specific upstream requirement. Matches AniGen's tested config. |
| `backend/runtime/manifests/detailgen3d.yaml:11` | `cuda: '12.4'` | ✅ **Legitimate** | Model-specific upstream requirement. |
| `backend/runtime/manifests/hunyuan3d_21.yaml:11` | `cuda: '12.4'` | ✅ **Legitimate** | Model-specific upstream requirement. |
| `backend/runtime/manifests/hunyuan3d_2_mini.yaml:11` | `cuda: '12.4'` | ✅ **Legitimate** | Model-specific upstream requirement. |
| `backend/runtime/manifests/trellis.yaml:11` | `cuda: '11.8'` | ✅ **Legitimate** | Model-specific upstream requirement. TRELLIS uses older CUDA. |
| `backend/runtime/manifests/triposg.yaml:11` | `cuda: '12.4'` | ✅ **Legitimate** | Model-specific upstream requirement. |
| `backend/runtime/manifests/unirig.yaml:11` | `cuda: '12.4'` | ✅ **Legitimate** | Model-specific upstream requirement. |
| `backend/runtime/manifests/*:build_env.CUDA_HOME` | `"/usr/local/cuda"` | ✅ **Legitimate default** | Standard CUDA installation path. Manifest can override. All manifests declare it explicitly. |
| `backend/runtime/manifests/*:build_env.TORCH_CUDA_ARCH_LIST` | `"7.0 7.5 8.0 8.6 8.9 9.0"` | ✅ **Legitimate default** | Covers Pascal through Hopper. Manifest can override. |
| `backend/runtime/dependency_resolver.py:1074-1075` | `setdefault("TORCH_CUDA_ARCH_LIST", ...)` `setdefault("CUDA_HOME", "/usr/local/cuda")` | ✅ **Legitimate fallback** | Only applies when manifest doesn't specify. Correct defensive coding. |
| `backend/runtime/dependency_resolver.py:210-211` | `("/usr/local/cuda", "/opt/cuda")` | ✅ **Legitimate detection** | Standard CUDA installation paths for runtime detection. |
| `backend/runtime/installer.py:558-559` | `("/usr/local/cuda", "/opt/cuda")` | ✅ **Legitimate detection** | Same as above. |
| `backend/runtime/gpu.py:147` | `"...whl/cu121"` | ⚠️ **Stale/misleading** | Hard-coded cu121 in error message. Doesn't match backend's actual CUDA. |
| `backend/runtime/gpu.py:276` | `"...whl/cu121"` | ⚠️ **Stale/misleading** | Same as above. |
| `backend/runtime/manifests/trellis.yaml:55` | `spconv-cu118` | ✅ **Legitimate** | Correct CUDA 11.8 variant for TRELLIS. |
| `backend/runtime/manifests/unirig.yaml:37` | `spconv-cu124` | ✅ **Legitimate** | Correct CUDA 12.4 variant for UniRig. |
| `backend/runtime/manifests/anigen.yaml:41` | `spconv` (generic) | ❌ **BROKEN** | No such package on PyPI. AniGen doesn't use spconv upstream. |
| `backend/runtime/manifests/trellis.yaml:115-116` | `torch-2.4.0_cu121.html`, `torch-2.5.1_cu124.html` | ✅ **Legitimate fallback** | Fallback wheel sources for kaolin. Correct pattern. |
| `backend/runtime/manifests/trellis.yaml:96` | `torch-{torch_ver}_cu{cuda_ver}.html` | ✅ **Legitimate template** | Dynamic template using manifest's torch+cuda values. |

### 1.2 Is the project assuming one global CUDA version?

**No.** Each manifest declares its own `environment.cuda`. TRELLIS uses 11.8, others use 12.4. The resolver uses per-manifest CUDA for wheel resolution (e.g., `spconv-cu118` for TRELLIS, `spconv-cu124` for UniRig). This is correct.

### 1.3 Is the project assuming one global Torch version?

**No.** Each manifest declares its own `environment.torch`. TRELLIS uses 2.4.0, others use 2.5.1, UniRig uses >=2.3.1. The installer mirrors the backend's actual torch into per-model venvs via `_backend_torch_stack()`.

### 1.4 Is the project assuming one global native build environment?

**Partially.** All manifests have identical `build_env` values. The `CUDA_HOME: "/usr/local/cuda"` is hard-coded in every manifest. This is a legitimate default for standard CUDA installations, but it's not adaptable to non-standard CUDA locations without manifest editing. The `TORCH_CUDA_ARCH_LIST` covers all common GPU architectures (Pascal through Hopper).

**Verdict:** This is acceptable. The manifest schema allows per-dependency `build_env` overrides. The global values are sensible defaults.

### 1.5 Is the project assuming one generic spconv package?

**Yes, in anigen.yaml.** The manifest declares generic `spconv` which doesn't exist on PyPI. This is a real bug (ISSUE-001 in the audit).

### 1.6 Is the project assuming one universal wheel source?

**No.** Different manifests use different wheel sources:
- spconv-cu118/cu124 from PyPI
- pytorch3d from miropsota.github.io
- nvdiffrast from HF
- kaolin from nvidia-kaolin.s3
- flash-attn from mjun0812 GitHub
- torch_scatter/torch_cluster from data.pyg.org

This is correct and model-specific.

---

## 2. Fix Priority List

### HIGH Priority

| # | Fix | Risk if NOT fixed | Effort |
|---|-----|-------------------|--------|
| H1 | Remove generic `spconv` from anigen.yaml | Install 404s on PyPI, falls through to source build which also fails | Trivial |
| H2 | Add missing `omegaconf` to anigen.yaml | `ImportError` at runtime when loading AniGen provider | Trivial |
| H3 | Add missing `Pillow` to 4 manifests | `ImportError` at runtime for image processing | Trivial |
| H4 | Add missing `briarmbg` and `image_process` to triposg.yaml | `ImportError` at runtime for background removal | Trivial |

### MEDIUM Priority

| # | Fix | Risk if NOT fixed | Effort |
|---|-----|-------------------|--------|
| M1 | Fix `gpu.py` hard-coded `cu121` in error messages | Users get wrong CUDA wheel suggestion; confusing diagnostics | Trivial |
| M2 | Clean up TRELLIS `cuda_native_packages` (remove pytorch3d, torchmcubes) | Dead code; confusion for future maintainers | Trivial |
| M3 | Fix hunyuan3d_21 `cuda_native` metadata (add cupy-cuda12x) | Metadata inconsistency; may affect CPU-only detection logic | Trivial |

### LOW Priority

| # | Fix | Risk if NOT fixed | Effort |
|---|-----|-------------------|--------|
| L1 | Upgrade cupy-cuda12x from 13.4.1 to 14.2.0 | Minor: may miss bug fixes; low risk of numpy incompatibility | Low |
| L2 | Verify TRELLIS kaolin primary URL exists | Fallback mechanism already handles failure; no code change needed | None |

---

## 3. Detailed Fix Specifications

### H1: Remove generic `spconv` from anigen.yaml

**FILE:** `backend/runtime/manifests/anigen.yaml`

**CHANGE 1 — Remove from `native` (line 41):**
```yaml
# CURRENT:
native:
- spconv
- pytorch3d
- nvdiffrast

# REPLACE WITH:
native:
- pytorch3d
- nvdiffrast
```

**CHANGE 2 — Remove from `wheels` (lines 62-64):**
```yaml
# CURRENT:
wheels:
  spconv:
    available: true
    mode: pypi
  pytorch3d:
    ...

# REPLACE WITH:
wheels:
  pytorch3d:
    ...
```

**CHANGE 3 — Remove from `cuda_native` (line 89):**
```yaml
# CURRENT:
cuda_native:
- spconv
- pytorch3d
- nvdiffrast

# REPLACE WITH:
cuda_native:
- pytorch3d
- nvdiffrast
```

**WHY:** Generic `spconv` doesn't exist on PyPI. AniGen's upstream setup.sh doesn't install spconv. The wheel install 404s, falls through to source build which also fails (no source spec).

**ALTERNATIVE (if AniGen actually uses spconv):** Change to `spconv-cu124` and update wheels section accordingly. However, upstream evidence says AniGen doesn't use spconv.

---

### H2: Add missing `omegaconf` to anigen.yaml

**FILE:** `backend/runtime/manifests/anigen.yaml`

**CHANGE — Add to `dependencies.python` (after line 36):**
```yaml
# ADD:
- omegaconf>=2.3.0
```

**WHY:** `anigen_provider.py` line 84 imports `from omegaconf import OmegaConf`. Without this, the provider crashes at import time.

---

### H3: Add missing `Pillow` to 4 manifests

**FILES:**
- `backend/runtime/manifests/hunyuan3d_21.yaml`
- `backend/runtime/manifests/hunyuan3d_2_mini.yaml`
- `backend/runtime/manifests/detailgen3d.yaml`
- `backend/runtime/manifests/triposg.yaml`

**CHANGE — Add to `dependencies.python` in each:**
```yaml
- Pillow>=10.0
```

**WHY:** All 4 providers import `from PIL import Image`. Without Pillow, image processing fails at runtime.

---

### H4: Add missing `briarmbg` and `image_process` to triposg.yaml

**FILE:** `backend/runtime/manifests/triposg.yaml`

**CHANGE — Add to `dependencies.python`:**
```yaml
- briarmbg
- image_process
```

**WHY:** `triposg_local.py` imports both:
- `from briarmbg import BriaRMBG` (line 41)
- `from image_process import prepare_image` (line 40)

**NOTE:** Verify these are actual pip packages before finalizing. If they're local modules, they should be added to the project, not the manifest.

---

### M1: Fix `gpu.py` hard-coded `cu121` in error messages

**FILE:** `backend/runtime/gpu.py`

**CHANGE — Line 147:**
```python
# CURRENT:
"Run: uv pip install torch --index-url https://download.pytorch.org/whl/cu121"

# REPLACE WITH:
"Run: uv pip install torch --index-url https://download.pytorch.org/whl/cu124"
```

**CHANGE — Line 276:**
```python
# CURRENT:
"Verify PyTorch CUDA: uv pip install torch --index-url https://download.pytorch.org/whl/cu121"

# REPLACE WITH:
"Verify PyTorch CUDA: uv pip install torch --index-url https://download.pytorch.org/whl/cu124"
```

**WHY:** The hard-coded `cu121` is stale. Most manifests use CUDA 12.4. The error message should suggest the correct CUDA version or be generic. Using `cu124` matches the majority of manifests.

**ALTERNATIVE:** Make the error message dynamic by reading the backend's actual CUDA version. However, this adds complexity for a simple error message. Using `cu124` is the simplest correct fix.

---

### M2: Clean up TRELLIS `cuda_native_packages`

**FILE:** `backend/runtime/manifests/trellis.yaml`

**CHANGE — Lines 59-63:**
```yaml
# CURRENT:
cuda_native_packages:
- flash-attn
- xformers
- pytorch3d
- torchmcubes

# REPLACE WITH:
cuda_native_packages:
- flash-attn
- xformers
```

**WHY:** `pytorch3d` and `torchmcubes` are not in the `native` list, so they're never installed. This is dead code that confuses future maintainers.

---

### M3: Fix hunyuan3d_21 `cuda_native` metadata

**FILE:** `backend/runtime/manifests/hunyuan3d_21.yaml`

**CHANGE — Line 99:**
```yaml
# CURRENT:
cuda_native: []

# REPLACE WITH:
cuda_native:
- cupy-cuda12x
```

**WHY:** `cupy-cuda12x` is CUDA-native and should be listed for metadata consistency. This field is used by `_drop_cuda_only_packages()` to skip CUDA-only packages on CPU-only hosts.

---

## 4. Risk Assessment

| Fix | Risk | Mitigation |
|-----|------|------------|
| H1: Remove spconv from anigen | LOW | AniGen doesn't use spconv upstream. Removal won't break anything. If AniGen actually needs spconv, change to `spconv-cu124` instead. |
| H2: Add omegaconf to anigen | LOW | Small package, no side effects. Already in unirig.yaml. |
| H3: Add Pillow to 4 manifests | LOW | Pillow is a common dependency. Already in anigen.yaml and trellis.yaml. |
| H4: Add briarmbg/image_process to triposg | MEDIUM | Need to verify these are actual pip packages. If they're local modules, the fix is different. |
| M1: Fix gpu.py cu121 | LOW | Error message only. No functional impact. |
| M2: Clean up TRELLIS cuda_native_packages | LOW | Removing dead code. No functional impact. |
| M3: Fix hunyuan3d_21 cuda_native | LOW | Metadata-only change. May affect CPU-only detection. |
| L1: Upgrade cupy-cuda12x | MEDIUM | Version change may affect numpy compatibility. Test before deploying. |

---

## 5. Verification Plan

### For each fix:

1. **YAML parsing:** Verify all manifests still parse with PyYAML
2. **Dependency resolution:** Run `resolve_dependencies()` for each manifest
3. **Import checks:** Verify all `dependencies.imports` packages are importable
4. **Provider startup:** Run `run_preflight_for_provider()` for each provider

### Specific verification:

| Fix | Verification |
|-----|--------------|
| H1 | `pip install spconv` fails (confirming the bug); after fix, AniGen provider imports successfully |
| H2 | `from omegaconf import OmegaConf` succeeds in AniGen venv |
| H3 | `from PIL import Image` succeeds in all 4 provider venvs |
| H4 | `from briarmbg import BriaRMBG` and `from image_process import prepare_image` succeed in TripoSG venv |
| M1 | Error message shows `cu124` instead of `cu121` |
| M2 | TRELLIS install still works; pytorch3d/torchmcubes not installed (expected) |
| M3 | `cupy-cuda12x` correctly identified as CUDA-native in metadata |
| L1 | Hunyuan3D-2.1 inference works with cupy-cuda12x==14.2.0 |

### Regression tests to run:

```bash
# Run existing test suite
cd /teamspace/studios/this_studio/AI_Studio
python -m pytest backend/runtime/test_dependency_manifest_contract.py -v
python -m pytest backend/runtime/test_dependency_resolver.py -v
python -m pytest backend/runtime/test_installer.py -v
```

---

## 6. Things NOT to Change

The following were investigated and found **correct**. Do NOT modify:

### CUDA/Torch versions per manifest
- `environment.cuda` values — model-specific and match upstream
- `environment.torch` values — model-specific and match upstream
- `environment.python` values — model-specific and match upstream

### Build environment
- `build_env.CUDA_HOME: "/usr/local/cuda"` — legitimate default; manifest can override
- `build_env.TORCH_CUDA_ARCH_LIST: "7.0 7.5 8.0 8.6 8.9 9.0"` — covers all common architectures

### Wheel sources
- `spconv-cu118` for TRELLIS — correct for CUDA 11.8
- `spconv-cu124` for UniRig — correct for CUDA 12.4
- `pytorch3d` at miropsota.github.io — exists
- `nvdiffrast` at HF — exists
- `flash-attn` at mjun0812 GitHub — exists
- `kaolin` at nvidia-kaolin.s3 — exists
- `torch_scatter`/`torch_cluster` at data.pyg.org — exist
- `cupy-cuda12x` on PyPI — exists

### Runtime code
- `_backend_torch_stack()` — correctly resolves backend torch; already fixed to not guess CUDA
- `_install_torch_stack()` — correctly mirrors backend torch into per-model venvs
- `_cuda_available()` — comprehensive detection (env vars, nvcc, nvidia-smi, standard paths)
- `_drop_cuda_only_packages()` — correctly handles CPU-only hosts
- `_manifest_dependency_config()` — correctly reads global and per-dep build_env
- `build_env.setdefault()` in dependency_resolver.py — correct fallback pattern

### Manifest schema
- `cuda_native_packages` — used for CPU-only dropping
- `cuda_native` — metadata for CUDA-native packages
- `torch_build_packages` — packages needing `--no-build-isolation`
- `attention_backend.one_of` — mutually exclusive attention backends
- `fallbacks` — fallback wheel sources
- `optional` — truly optional packages
- `representation_required` — packages that degrade capability on failure

### Native dependency handling
- TRELLIS `recurse-submodules: true` — correct (FlexiCubes is submodule)
- TRELLIS `vox2seq` local extension — correct
- TRELLIS `diffoctreerast` source build — correct
- TRELLIS `diff-gaussian-rasterization` VCS subdirectory build — correct
- AniGen CUBVH training-only — correctly removed from inference
- `flash-attn`/`xformers` optional — correctly marked
- `diso` source-only — correctly marked

---

## 7. Summary

The project's CUDA architecture is **mostly correct**. The key findings:

1. **No global CUDA assumption** — each manifest declares its own CUDA version
2. **No global Torch assumption** — each manifest declares its own Torch version
3. **Build environment defaults are acceptable** — standard paths and arch lists
4. **One real CUDA-related bug** — anigen.yaml uses generic `spconv` which doesn't exist
5. **One stale value** — gpu.py error messages reference cu121 instead of cu124
6. **Missing dependencies** — 4 packages imported by providers but not in manifests

The fixes are all **low-risk, high-impact** changes that align the manifests with actual provider imports and upstream requirements.

---

## Appendix: Complete CUDA-related code locations

### Manifests with `environment.cuda`
- `backend/runtime/manifests/anigen.yaml:11` — `12.4`
- `backend/runtime/manifests/detailgen3d.yaml:11` — `12.4`
- `backend/runtime/manifests/hunyuan3d_21.yaml:11` — `12.4`
- `backend/runtime/manifests/hunyuan3d_2_mini.yaml:11` — `12.4`
- `backend/runtime/manifests/trellis.yaml:11` — `11.8`
- `backend/runtime/manifests/triposg.yaml:11` — `12.4`
- `backend/runtime/manifests/unirig.yaml:11` — `12.4`

### Manifests with `build_env.CUDA_HOME`
- `backend/runtime/manifests/anigen.yaml:94`
- `backend/runtime/manifests/detailgen3d.yaml:71`
- `backend/runtime/manifests/hunyuan3d_21.yaml:102`
- `backend/runtime/manifests/hunyuan3d_2_mini.yaml:53`
- `backend/runtime/manifests/trellis.yaml:150`
- `backend/runtime/manifests/triposg.yaml:67`
- `backend/runtime/manifests/unirig.yaml:82`

### Runtime CUDA detection
- `backend/runtime/dependency_resolver.py:197-225` — `_cuda_available()`
- `backend/runtime/dependency_resolver.py:1074-1075` — build_env fallback defaults
- `backend/runtime/installer.py:545-574` — `_cuda_available()`
- `backend/runtime/installer.py:577-634` — `_backend_torch_stack()`
- `backend/runtime/gpu.py:34-61` — `_normalize_cuda_env()`
- `backend/runtime/gpu.py:64-151` — `get_gpu_info()`
- `backend/runtime/gpu.py:266-278` — `_build_cuda_unavailable_reason()`

### Wheel resolution using CUDA
- `backend/runtime/dependency_resolver.py:474-476` — CUDA version compatibility check
- `backend/runtime/dependency_resolver.py:500-508` — direct URL template with `{cuda}` placeholder
- `backend/runtime/dependency_resolver.py:525-540` — index URL with `{cuda_ver}` placeholder
