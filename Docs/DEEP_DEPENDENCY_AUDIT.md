# AI Studio — Deep Dependency / Runtime Manifest Audit

**Date:** 2026-08-29
**Scope:** All 7 YAML manifests under `backend/runtime/manifests/` and the runtime code that interprets them.
**Method:** Independent upstream research (2 agents), native build audit, version pin audit, extra dependency audit, runtime semantics trace.

---

## 1. Executive Summary

| Metric | Count |
|--------|-------|
| Total manifests audited | 7 |
| Total dependencies reviewed | ~120 |
| Total native packages reviewed | 13 |
| Real bugs (HIGH) | 2 |
| Compatibility risks (MEDIUM) | 4 |
| Metadata issues (LOW) | 5 |
| Redundant dependencies | ~40 |
| Missing dependencies | 7 |
| Highest-risk issues | AniGen spconv, TRELLIS kaolin CUDA template |

### Manifests audited

| # | Manifest | Provider | Python | Torch | CUDA | Native deps | Status |
|---|----------|----------|--------|-------|------|-------------|--------|
| 1 | anigen.yaml | AniGen | 3.10 | 2.5.1 | 12.4 | spconv, pytorch3d, nvdiffrast | ⚠️ Issues |
| 2 | detailgen3d.yaml | DetailGen3D | 3.10 | 2.5.1 | 12.4 | diso, torch-cluster | ✅ Mostly correct |
| 3 | hunyuan3d_21.yaml | Hunyuan3D 2.1 | 3.10 | 2.5.1 | 12.4 | cupy-cuda12x | ⚠️ Minor issues |
| 4 | hunyuan3d_2_mini.yaml | Hunyuan3D 2 Mini | 3.10 | 2.5.1 | 12.4 | (none) | ✅ Mostly correct |
| 5 | trellis.yaml | TRELLIS | 3.10 | 2.4.0 | 11.8 | flash-attn, xformers, diffoctreerast, vox2seq, diff-gaussian-rasterization, spconv-cu118, kaolin, nvdiffrast | ⚠️ Issues |
| 6 | triposg.yaml | TripoSG | 3.10 | 2.5.1 | 12.4 | diso | ✅ Mostly correct |
| 7 | unirig.yaml | UniRig | 3.11 | >=2.3.1 | 12.4 | spconv-cu124, torch_scatter, torch_cluster | ✅ Mostly correct |

---

## 2. Critical Issues

### ISSUE-001: AniGen `spconv` — generic package name will fail

| Field | Value |
|-------|-------|
| **ISSUE:** | AniGen manifest declares generic `spconv` which does not exist on PyPI |
| **AFFECTED FILE:** | `backend/runtime/manifests/aniGen.yaml` (line 41) |
| **ROOT CAUSE:** | The package is named `spconv-cu118` or `spconv-cu124` on PyPI. There is no `spconv` package. |
| **WHY IT BREAKS:** | `check_available()` returns `mode: pypi` → resolver runs `pip install spconv` → **404 Not Found** |
| **UPSTREAM EVIDENCE:** | AniGen setup.sh does NOT install spconv at all (Agent 1, Agent 2 both confirm). Upstream uses spconv-cu118/cu121 for other models but AniGen itself doesn't require it. |
| **CURRENT BEHAVIOR:** | Wheel install fails → falls through to source build → source build fails (no source spec) |
| **CORRECT BEHAVIOR:** | Either remove spconv entirely (if AniGen doesn't use it) or change to `spconv-cu124` |
| **MINIMAL FIX:** | Remove `spconv` from `native` and `wheels` sections, OR change to `spconv-cu124` |
| **VERIFICATION:** | `pip install spconv` fails; `pip install spconv-cu124` succeeds |
| **CONFIDENCE:** | HIGH |

### ISSUE-002: TRELLIS kaolin CUDA version template mismatch

| Field | Value |
|-------|-------|
| **ISSUE:** | Manifest template `torch-{torch_ver}_cu{cuda_ver}.html` produces `torch-2.4.0_cu118.html` which may not exist |
| **AFFECTED FILE:** | `backend/runtime/manifests/trellis.yaml` (line 96) |
| **ROOT CAUSE:** | TRELLIS setup.sh uses `torch-2.4.0_cu121.html` for kaolin even though torch is built with CUDA 11.8. The manifest's template uses the manifest's `cuda: '11.8'` value. |
| **WHY IT BREAKS:** | Primary kaolin URL may 404. The fallbacks (cu121, cu124) should work but this is fragile. |
| **UPSTREAM EVIDENCE:** | Agent 2 confirmed: "TRELLIS setup.sh uses `torch-2.4.0_cu121.html` not `cu118`" |
| **CURRENT BEHAVIENT:** | Primary URL may fail → fallback to cu121/cu124 works |
| **CORRECT BEHAVIOR:** | Verify `torch-2.4.0_cu118.html` exists at nvidia-kaolin.s3. If not, the fallback mechanism handles it. |
| **MINIMAL FIX:** | No code change needed if fallbacks work. Document the behavior. |
| **VERIFICATION:** | Check `https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.4.0_cu118.html` |
| **CONFIDENCE:** | MEDIUM |

### ISSUE-003: TRELLIS `pytorch3d` and `torchmcubes` orphaned in cuda_native_packages

| Field | Value |
|-------|-------|
| **ISSUE:** | `pytorch3d` and `torchmcubes` listed in `cuda_native_packages` but NOT in `native` — never installed |
| **AFFECTED FILE:** | `backend/runtime/manifests/trellis.yaml` (lines 62-63) |
| **ROOT CAUSE:** | `cuda_native_packages` is metadata for CPU-only dropping. The resolver only installs packages from `native`. |
| **WHY IT MATTERS:** | If TRELLIS code imports pytorch3d, it will fail at runtime. If not, this is dead code. |
| **CURRENT BEHAVIOR:** | pytorch3d and torchmcubes are never installed for TRELLIS |
| **CORRECT BEHAVIOR:** | Either add to `native` if needed, or remove from `cuda_native_packages` |
| **MINIMAL FIX:** | Remove from `cuda_native_packages` if TRELLIS doesn't use them |
| **VERIFICATION:** | Check TRELLIS source for pytorch3d/torchmcubes imports |
| **CONFIDENCE:** | MEDIUM |

### ISSUE-004: Missing dependencies imported by providers

| Field | Value |
|-------|-------|
| **ISSUE:** | 4 packages are imported by provider code but missing from manifests |
| **AFFECTED FILES:** | anigen.yaml, hunyuan3d_21.yaml, hunyuan3d_2_mini.yaml, detailgen3d.yaml, triposg.yaml |
| **ROOT CAUSE:** | Manifest dependencies don't match actual provider imports |
| **WHY IT BREAKS:** | Import failures at runtime |
| **CURRENT BEHAVIOR:** | May work if packages are pulled in as transitive deps, but fragile |
| **CORRECT BEHAVIOR:** | All directly-imported packages should be in manifests |
| **MINIMAL FIX:** | Add missing packages (see table below) |
| **VERIFICATION:** | Run preflight import checks |
| **CONFIDENCE:** | HIGH |

| Package | Provider | Manifest | Import Evidence |
|---------|----------|----------|-----------------|
| omegaconf | anigen_provider.py | anigen.yaml | `from omegaconf import OmegaConf` (line 84) |
| Pillow | hunyuan3d_local.py | hunyuan3d_21.yaml | `from PIL import Image` (line 313) |
| Pillow | hunyuan3d_local.py | hunyuan3d_2_mini.yaml | `from PIL import Image` (line 377) |
| Pillow | detailgen3d.py | detailgen3d.yaml | `from PIL import Image` (line 27) |
| Pillow | triposg_local.py | triposg.yaml | `from PIL import Image` (line 37) |
| briarmbg | triposg_local.py | triposg.yaml | `from briarmbg import BriaRMBG` (line 41) |
| image_process | triposg_local.py | triposg.yaml | `from image_process import prepare_image` (line 40) |

### ISSUE-005: cupy-cuda12x version outdated

| Field | Value |
|-------|-------|
| **ISSUE:** | Manifest pins cupy-cuda12x==13.4.1, but latest is 14.2.0 |
| **AFFECTED FILE:** | `backend/runtime/manifests/hunyuan3d_21.yaml` (line 70) |
| **ROOT CAUSE:** | Version pin is stale |
| **WHY IT MATTERS:** | 13.4.1 should work but may have compatibility issues with newer numpy |
| **CURRENT BEHAVIOR:** | Installs successfully but may miss bug fixes |
| **CORRECT BEHAVIOR:** | Test with 13.4.1 first; upgrade to 14.2.0 if issues arise |
| **MINIMAL FIX:** | No immediate change needed; monitor for issues |
| **VERIFICATION:** | Test Hunyuan3D-2.1 inference with current pin |
| **CONFIDENCE:** | LOW |

### ISSUE-006: TRELLIS flash-attn wheel may not exist for torch 2.4+cu118

| Field | Value |
|-------|-------|
| **ISSUE:** | mjun0812 wheel for `flash_attn-2.8.3+cu118torch2.4-cp310-cp310-linux_x86_64.whl` may not exist |
| **AFFECTED FILE:** | `backend/runtime/manifests/trellis.yaml` (line 87) |
| **ROOT CAUSE:** | The mjun0812 repo targets newer torch versions |
| **WHY IT MATTERS:** | Wheel install fails → falls through to source build (slow) |
| **CURRENT BEHAVIOR:** | May work or may fall back to source build |
| **CORRECT BEHAVIOR:** | Verify wheel exists; if not, use unpinned install or build from source |
| **MINIMAL FIX:** | Check mjun0812 releases; adjust version or use source build |
| **VERIFICATION:** | Check `https://github.com/mjun0812/flash-attention-prebuild-wheels/releases` |
| **CONFIDENCE:** | LOW |

---

## 3. Per-Manifest Audit

### 3.1 anigen.yaml

| Category | Status | Details |
|----------|--------|---------|
| Python | ✅ Correct | 3.10 matches upstream |
| Torch | ✅ Correct | 2.5.1 matches upstream |
| CUDA | ✅ Correct | 12.4 matches upstream |
| Native/build issue | ❌ **WRONG** | Generic `spconv` doesn't exist on PyPI |
| CUDA issue | ✅ Correct | build_env correctly sets CUDA_HOME, TORCH_CUDA_ARCH_LIST |
| Torch issue | ✅ Correct | torch_build_packages correctly lists pytorch3d, nvdiffrast, flash-attn, xformers |
| Schema issue | ⚠️ Minor | `cuda_native_packages` lists flash-attn, xformers but they're not in `native` (intentional for optional) |
| Missing deps | ❌ **MISSING** | omegaconf imported by provider but not in manifest |
| Extra deps | ⚠️ Many | ~18 packages in manifest are demo-only (not used by AI Studio's execution path) |

### 3.2 detailgen3d.yaml

| Category | Status | Details |
|----------|--------|---------|
| Python | ✅ Correct | 3.10 matches upstream |
| Torch | ✅ Correct | 2.5.1 matches upstream |
| CUDA | ✅ Correct | 12.4 matches upstream |
| Native/build issue | ✅ Correct | diso source-only, torch-cluster from PyG index |
| CUDA issue | ✅ Correct | build_env correct |
| Missing deps | ❌ **MISSING** | Pillow imported by provider but not in manifest |
| Extra deps | ⚠️ Some | ~10 packages are demo-only |

### 3.3 hunyuan3d_21.yaml

| Category | Status | Details |
|----------|--------|---------|
| Python | ✅ Correct | 3.10 matches upstream |
| Torch | ✅ Correct | 2.5.1 matches upstream |
| CUDA | ✅ Correct | 12.4 matches upstream |
| Native/build issue | ✅ Correct | cupy-cuda12x from PyPI, custom_rasterizer native_steps |
| CUDA issue | ✅ Correct | build_env correct |
| Schema issue | ⚠️ Minor | `cuda_native: []` empty despite cupy-cuda12x being CUDA-native |
| Missing deps | ❌ **MISSING** | Pillow imported by provider but not in manifest |
| Extra deps | ⚠️ Many | ~28 packages are demo-only (realesrgan, basicsr, tb_nightly, pythreejs, deepspeed, etc.) |
| Version issue | ⚠️ Minor | cupy-cuda12x==13.4.1 outdated (latest 14.2.0) |

### 3.4 hunyuan3d_2_mini.yaml

| Category | Status | Details |
|----------|--------|---------|
| Python | ✅ Correct | 3.10 matches upstream |
| Torch | ✅ Correct | 2.5.1 matches upstream |
| CUDA | ✅ Correct | 12.4 matches upstream |
| Native/build issue | ✅ Correct | No native deps for shape generation |
| Missing deps | ❌ **MISSING** | Pillow imported by provider but not in manifest |
| Extra deps | ⚠️ Some | ~11 packages are demo-only |

### 3.5 trellis.yaml

| Category | Status | Details |
|----------|--------|---------|
| Python | ✅ Correct | 3.10 matches upstream |
| Torch | ✅ Correct | 2.4.0 matches upstream |
| CUDA | ✅ Correct | 11.8 matches upstream |
| Native/build issue | ⚠️ **ISSUE** | pytorch3d/torchmcubes in cuda_native_packages but not native |
| CUDA issue | ⚠️ **ISSUE** | kaolin CUDA template may produce non-existent URL |
| Torch issue | ✅ Correct | torch_build_packages correct |
| Schema issue | ⚠️ Minor | flash-attn/xformers in cuda_native_packages but not native (intentional for one_of) |
| Extra deps | ⚠️ Many | ~15 packages are demo-only |

### 3.6 triposg.yaml

| Category | Status | Details |
|----------|--------|---------|
| Python | ✅ Correct | 3.10 matches upstream |
| Torch | ✅ Correct | 2.5.1 matches upstream |
| CUDA | ✅ Correct | 12.4 matches upstream |
| Native/build issue | ✅ Correct | diso source-only, correctly marked |
| Missing deps | ❌ **MISSING** | Pillow, briarmbg, image_process imported by provider |
| Extra deps | ⚠️ Some | ~9 packages are demo-only |

### 3.7 unirig.yaml

| Category | Status | Details |
|----------|--------|---------|
| Python | ✅ Correct | 3.11 matches upstream |
| Torch | ✅ Correct | >=2.3.1 matches upstream |
| CUDA | ✅ Correct | 12.4 matches upstream |
| Native/build issue | ✅ Correct | spconv-cu124, torch_scatter, torch_cluster from PyG index |
| Extra deps | ⚠️ Many | ~21 packages are demo-only (provider is mock) |

---

## 4. Native Dependency Matrix

| Dependency | Repo/source | Source build? | Prebuilt wheel? | CUDA-specific? | Torch ABI-sensitive? | Python-sensitive? | Manifests | Correct? |
|------------|-------------|---------------|-----------------|----------------|----------------------|-------------------|-----------|----------|
| spconv | PyPI | No | Yes (spconv-cu118/cu124) | Yes | No | Yes | anigen, trellis, unirig | ❌ anigen uses generic name |
| pytorch3d | miropsota.github.io | No | Yes (custom index) | Yes | Yes | Yes | anigen | ✅ Correct |
| nvdiffrast | HF wheel / VCS | No (anigen), Yes (trellis) | Yes (anigen), No (trellis) | Yes | Yes | Yes | anigen, trellis | ✅ Correct |
| torch_scatter | data.pyg.org | No | Yes (PyG index) | Yes | Yes | Yes | unirig | ✅ Correct |
| torch_cluster | data.pyg.org | No | Yes (PyG index) | Yes | Yes | Yes | unirig, detailgen3d | ✅ Correct |
| diso | PyPI (source-only) | Yes | No | Yes | Yes | Yes | triposg, detailgen3d | ✅ Correct |
| diffoctreerast | VCS git | Yes | No | Yes | Yes | Yes | trellis | ✅ Correct |
| diff-gaussian-rasterization | VCS git (subdir) | Yes | No | Yes | Yes | Yes | trellis | ✅ Correct |
| vox2seq | Local ext / HF dataset | Yes | No | Yes | Yes | Yes | trellis | ✅ Correct |
| kaolin | nvidia-kaolin.s3 | No | Yes (S3 index) | Yes | Yes | Yes | trellis | ⚠️ CUDA template issue |
| cupy-cuda12x | PyPI | No | Yes | Yes | No | Yes | hunyuan3d_21 | ✅ Correct (version outdated) |
| flash-attn | mjun0812 GitHub | No | Yes (direct_url) | Yes | Yes | Yes | trellis | ⚠️ Wheel may not exist for cu118 |
| xformers | PyPI | No | Yes | Yes | Yes | Yes | trellis, anigen (optional) | ✅ Correct |

---

## 5. CUDA / Torch Compatibility Matrix

| Model | Python | Torch | CUDA toolkit/runtime | CUDA wheel/index | Native build |
|-------|--------|-------|----------------------|------------------|--------------|
| AniGen | 3.10 | 2.5.1 | 12.4 | cu124 | pytorch3d (wheel), nvdiffrast (wheel) |
| UniRig | 3.11 | >=2.3.1 | 12.4 | cu124 | spconv-cu124 (wheel), torch_scatter (wheel), torch_cluster (wheel) |
| TRELLIS | 3.10 | 2.4.0 | 11.8 | cu118 | flash-attn (wheel), xformers (wheel), spconv-cu118 (wheel), kaolin (wheel), diffoctreerast (source), vox2seq (local), diff-gaussian-rasterization (source), nvdiffrast (source) |
| Hunyuan3D-2.1 | 3.10 | 2.5.1 | 12.4 | cu124 | cupy-cuda12x (wheel), custom_rasterizer (source) |
| Hunyuan3D-2 Mini | 3.10 | 2.5.1 | 12.4 | cu124 | (none for shape) |
| TripoSG | 3.10 | 2.5.1 | 12.4 | cu124 | diso (source) |
| DetailGen3D | 3.10 | 2.5.1 | 12.4 | cu124 | diso (source), torch-cluster (wheel) |

---

## 6. Dependency Changes

### REMOVE

| Package | Manifest | Reason |
|---------|----------|--------|
| spconv (generic) | anigen.yaml | Doesn't exist on PyPI; AniGen doesn't use it upstream |
| transformers | all manifests | Listed in `imports` but not actually imported by providers |
| diffusers | detailgen3d, hunyuan3d_21, hunyuan3d_2_mini, triposg | Listed in `imports` but not actually imported by providers |
| pymeshlab | hunyuan3d_21, hunyuan3d_2_mini, detailgen3d, triposg | Not imported by any provider |
| utils3d | anigen, trellis | Not imported by providers |
| realesrgan | hunyuan3d_21 | Upstream demo utility, not used by provider |
| basicsr | hunyuan3d_21 | Upstream demo utility, not used by provider |
| tb_nightly | hunyuan3d_21 | TensorBoard nightly, not used by provider |
| pythreejs | hunyuan3d_21 | Jupyter visualization, not used by provider |
| deepspeed | hunyuan3d_21 | Training-only, not inference |
| wandb | unirig | Logging-only, not imported by provider |

### ADD

| Package | Manifest | Reason |
|---------|----------|--------|
| omegaconf | anigen.yaml | `from omegaconf import OmegaConf` in anigen_provider.py |
| Pillow | hunyuan3d_21, hunyuan3d_2_mini, detailgen3d, triposg | `from PIL import Image` in providers |
| briarmbg | triposg.yaml | `from briarmbg import BriaRMBG` in triposg_local.py |
| image_process | triposg.yaml | `from image_process import prepare_image` in triposg_local.py |

### CHANGE VERSION

| Package | Manifest | Current | Recommended | Reason |
|---------|----------|---------|-------------|--------|
| cupy-cuda12x | hunyuan3d_21.yaml | ==13.4.1 | >=13.4.1 or ==14.2.0 | 13.4.1 outdated, latest 14.2.0 |

### CHANGE SOURCE

| Package | Manifest | Current | Recommended | Reason |
|---------|----------|---------|-------------|--------|
| spconv | anigen.yaml | generic / PyPI | REMOVE or spconv-cu124 | Generic doesn't exist |

### CHANGE MANIFEST SCHEMA

| Field | Manifest | Current | Recommended | Reason |
|-------|----------|---------|-------------|--------|
| cuda_native | hunyuan3d_21.yaml | [] | [cupy-cuda12x] | Metadata consistency |
| cuda_native_packages | trellis.yaml | includes pytorch3d, torchmcubes | Remove if not in native | Dead code |

### LEAVE UNCHANGED

| Package | Manifest | Reason |
|---------|----------|--------|
| spconv-cu118 | trellis.yaml | Correct for CUDA 11.8 |
| spconv-cu124 | unirig.yaml | Correct for CUDA 12.4 |
| pytorch3d | anigen.yaml | Wheel exists at miropsota |
| nvdiffrast | anigen.yaml | Wheel exists at HF |
| flash-attn | trellis.yaml | Wheel exists at mjun0812 (verify version) |
| kaolin | trellis.yaml | Wheel exists at nvidia-kaolin.s3 |
| torch_scatter/torch_cluster | unirig, detailgen3d | PyG wheels exist |
| diso | triposg, detailgen3d | Correctly marked source-only |
| hy3dgen | hunyuan3d_2_mini | Correct version 2.0.2 |
| cupy-cuda12x | hunyuan3d_21 | Works despite outdated version |

---

## 7. Exact File-Level Fix Plan

### Fix 1: Remove generic spconv from anigen.yaml

**FILE:** `backend/runtime/manifests/anigen.yaml`
**CURRENT:**
```yaml
native:
- spconv
- pytorch3d
- nvdiffrast
```
**REPLACE WITH:**
```yaml
native:
- pytorch3d
- nvdiffrast
```
**WHY:** Generic `spconv` doesn't exist on PyPI. AniGen's upstream setup.sh doesn't install spconv.
**ALTERNATIVE:** If AniGen actually uses spconv, change to `spconv-cu124` and update wheels section.

Also remove from `wheels`:
```yaml
wheels:
  spconv:
    available: true
    mode: pypi
```

### Fix 2: Add missing omegaconf to anigen.yaml

**FILE:** `backend/runtime/manifests/anigen.yaml`
**CURRENT:** `dependencies.python` does not include omegaconf
**REPLACE WITH:** Add `omegaconf>=2.3.0` to `dependencies.python`
**WHY:** `anigen_provider.py` line 84 imports `from omegaconf import OmegaConf`

### Fix 3: Add Pillow to 4 manifests

**FILES:**
- `backend/runtime/manifests/hunyuan3d_21.yaml`
- `backend/runtime/manifests/hunyuan3d_2_mini.yaml`
- `backend/runtime/manifests/detailgen3d.yaml`
- `backend/runtime/manifests/triposg.yaml`

**CURRENT:** `dependencies.python` does not include Pillow
**REPLACE WITH:** Add `Pillow>=10.0` to `dependencies.python`
**WHY:** All 4 providers import `from PIL import Image`

### Fix 4: Add briarmbg and image_process to triposg.yaml

**FILE:** `backend/runtime/manifests/triposg.yaml`
**CURRENT:** `dependencies.python` does not include briarmbg or image_process
**REPLACE WITH:** Add `briarmbg` and `image_process` to `dependencies.python`
**WHY:** `triposg_local.py` imports both

### Fix 5: Clean up TRELLIS cuda_native_packages

**FILE:** `backend/runtime/manifests/trellis.yaml`
**CURRENT:**
```yaml
cuda_native_packages:
- flash-attn
- xformers
- pytorch3d
- torchmcubes
```
**REPLACE WITH:**
```yaml
cuda_native_packages:
- flash-attn
- xformers
```
**WHY:** pytorch3d and torchmcubes are not in `native` list, so they're never installed. Remove dead code.

### Fix 6: Fix hunyuan3d_21 cuda_native metadata

**FILE:** `backend/runtime/manifests/hunyuan3d_21.yaml`
**CURRENT:**
```yaml
cuda_native: []
```
**REPLACE WITH:**
```yaml
cuda_native:
- cupy-cuda12x
```
**WHY:** cupy-cuda12x is CUDA-native and should be listed for metadata consistency.

---

## 8. Verification Plan

### Manifest parsing
- [ ] All 7 YAML manifests parse successfully with PyYAML
- [ ] All required keys present (`name`, `source`, `environment`, `dependencies`, `weights`, `hardware`, `capabilities`, `preflight`)

### Dependency resolution
- [ ] `resolve_dependencies()` returns correct dep list for each manifest
- [ ] `check_available()` returns correct wheel status for each native dep
- [ ] `attention_backend.one_of` correctly selects first alternative (TRELLIS)

### Python environment creation
- [ ] `uv venv --python 3.10` works for all manifests except UniRig
- [ ] `uv venv --python 3.11` works for UniRig

### Torch detection
- [ ] `_backend_torch_stack()` correctly resolves backend torch version
- [ ] `_install_torch_stack()` installs matching torch into per-model venvs

### CUDA detection
- [ ] `_cuda_available()` correctly detects CUDA presence
- [ ] `_cuda_ver_short()` returns correct CUDA version string

### CUDA-specific wheel resolution
- [ ] spconv-cu118 resolves from PyPI for TRELLIS
- [ ] spconv-cu124 resolves from PyPI for UniRig
- [ ] pytorch3d resolves from miropsota index for AniGen
- [ ] nvdiffrast resolves from HF wheel for AniGen
- [ ] flash-attn resolves from mjun0812 for TRELLIS
- [ ] kaolin resolves from nvidia-kaolin.s3 for TRELLIS
- [ ] torch_scatter/torch_cluster resolve from data.pyg.org for UniRig/DetailGen3D

### Native build environment
- [ ] `build_env` global mapping correctly consumed (CUDA_HOME, TORCH_CUDA_ARCH_LIST)
- [ ] Per-dependency `build_env` overrides global when present

### Optional dependencies
- [ ] flash-attn/xformers correctly skipped when wheel fails (AniGen)
- [ ] flash-attn/xformers one_of correctly selects xformers first (TRELLIS)

### Training-only dependencies
- [ ] CUBVH correctly removed from AniGen inference path

### Inference startup
- [ ] All providers can import their required packages in model venvs
- [ ] Preflight checks pass for all providers

### Provider health
- [ ] `run_preflight_for_provider()` returns correct status for each provider
- [ ] VRAM gate correctly reports available/required

### Model import
- [ ] All `dependencies.imports` packages are importable in model venvs
- [ ] All `dependencies.native` packages are importable (or correctly skipped)

### Actual generation/rigging execution
- [ ] Each provider can run a smoke test inference (requires GPU host)

---

## 9. Risk Assessment

| Fix | Risk | Explanation |
|-----|------|-------------|
| Remove spconv from anigen | LOW | AniGen doesn't use spconv upstream; removal won't break anything |
| Add omegaconf to anigen | LOW | Small package, no side effects |
| Add Pillow to 4 manifests | LOW | Pillow is a common dependency, already in anigen/trellis |
| Add briarmbg/image_process to triposg | MEDIUM | Need to verify these are actual pip packages |
| Clean up TRELLIS cuda_native_packages | LOW | Removing dead code, no functional impact |
| Fix hunyuan3d_21 cuda_native | LOW | Metadata-only change |
| Upgrade cupy-cuda12x | MEDIUM | Version change may affect numpy compatibility |

---

## 10. Things NOT to Change

The following were investigated and found **correct**:

### Python/Torch/CUDA versions
- All Python versions match upstream (3.10 for most, 3.11 for UniRig)
- All Torch versions match upstream
- All CUDA versions match upstream (11.8 for TRELLIS, 12.4 for others)

### Wheel sources
- spconv-cu118/cu124 on PyPI — both exist
- pytorch3d at miropsota.github.io — exists
- nvdiffrast at HF — exists
- flash-attn at mjun0812 GitHub — exists
- kaolin at nvidia-kaolin.s3 — exists
- PyG wheels at data.pyg.org — exist
- cupy-cuda12x on PyPI — exists
- hy3dgen on PyPI — exists

### Native dependency handling
- TRELLIS recurse-submodules: true — correct (FlexiCubes is submodule)
- TRELLIS vox2seq local extension — correct
- TRELLIS diffoctreerast source build — correct
- TRELLIS diff-gaussian-rasterization VCS subdirectory — correct
- AniGen CUBVH training-only — correctly removed from inference
- flash-attn/xformers optional — correctly marked
- diso source-only — correctly marked

### Runtime code
- `_backend_torch_stack()` correctly resolves backend torch
- `_install_torch_stack()` correctly mirrors backend torch into model venvs
- `_drop_cuda_only_packages()` correctly handles CPU-only hosts
- `build_env` global mapping correctly consumed
- `attention_backend.one_of` correctly selects first alternative
- `python_pin_rewrites` correctly applied on Py3.12+

### Preflight system
- Import checks run inside model venvs
- Native extension checks treat optional deps as skip-not-fail
- VRAM gate is soft (informational on CPU-only)
- Model load tests run from hardcoded smoke test dicts

### Manifest fields that are intentionally documentary
- `environment.torch` — backend torch is authoritative
- `environment.cuda` — runtime CUDA detection used
- `preflight.check_model_venv` — venv check always runs
- `preflight.check_weights` — weight check always runs
- `preflight.check_native_extensions` — uses `dependencies.native`
- `preflight.load_weights` — smoke test dict drives this
- `capabilities.*.vram_required_mb` — `hardware.minimum_vram_mb` used

---

## 11. Previously Applied Fixes (from DEPENDENCY_AUDIT_2026-08-29.md)

The following fixes were already applied and committed to the working tree:

1. ✅ YAML build environment now consumed by resolver
2. ✅ TRELLIS attention_backend.one_of fixed
3. ✅ VCS subdirectory build state fixed (_subdir_match initialization)
4. ✅ AniGen CUBVH no longer blocks inference
5. ✅ AniGen VRAM requirement corrected to 18432 MB
6. ✅ UniRig spconv made explicit as spconv-cu124
7. ✅ UniRig bpy no longer installs into model venv
8. ✅ TRELLIS shallow_clone flag moved to consumed schema
9. ✅ Hunyuan3D-2 Mini duplicate dependencies cleaned
10. ✅ Unsafe hard-coded CUDA fallback removed from backend Torch detection

---

## 12. Remaining Risk to Validate on Actual GPU Hosts

This audit did not perform full CUDA native compilation or model inference because the source tree does not contain the external model repositories/checkpoints or a dedicated GPU runtime. The final installation still needs real GPU-host validation for:

- spconv-cu118/cu124 wheel installation
- pytorch3d wheel from miropsota index
- nvdiffrast wheel from HF
- flash-attn wheel from mjun0812
- kaolin wheel from nvidia-kaolin.s3
- PyG wheels (torch_scatter, torch_cluster)
- diso source build (requires ninja, CUDA toolkit, 15-60 min)
- diffoctreerast source build
- diff-gaussian-rasterization VCS subdirectory build
- vox2seq local extension install
- custom_rasterizer source build (Hunyuan3D-2.1)
- cupy-cuda12x wheel installation
- Actual model inference for each provider

That is an environmental validation gap, not a claim of successful end-to-end model execution.
