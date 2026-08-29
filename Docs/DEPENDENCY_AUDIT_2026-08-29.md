# AI Studio Dependency / Runtime Manifest Audit — 2026-08-29

## Scope

Audited the current YAML-driven model runtime under `backend/runtime/manifests/` and the
runtime code that interprets those manifests. Seven manifests were checked:

- `anigen.yaml`
- `detailgen3d.yaml`
- `hunyuan3d_21.yaml`
- `hunyuan3d_2_mini.yaml`
- `trellis.yaml`
- `triposg.yaml`
- `unirig.yaml`

The audit also traced `manifest_loader.py`, `dependency_resolver.py`, `installer.py`,
`preflight.py`, and the relevant local providers. Upstream installation sources were
cross-checked against the current upstream repositories.

## Architecture decision

AI Studio remains YAML-driven for model dependency/runtime configuration. No new
Python-side model dependency table was introduced. Runtime code changes are limited to
making the existing YAML contract behave as declared.

There is one deliberate process-level constraint: local providers share the backend's
already-loaded Torch/libtorch process, so their isolated model venvs must mirror the
backend Torch stack to avoid ABI failures. This constraint is documented rather than
replaced with unsafe per-model hard-coded Torch installs.

## Fixes applied

### 1. YAML build environment is now actually consumed

**Root cause:** the resolver only looked for per-package dictionaries, while manifests
use a global `dependencies.build_env` mapping for variables such as `CUDA_HOME` and
`TORCH_CUDA_ARCH_LIST`.

**Fix:** `dependency_resolver.py` now supports the existing global YAML mapping and
applies manifest values over process defaults. Per-dependency dictionaries continue to
work.

**Why:** a YAML value that is never consumed is not a real source-of-truth contract and
native builds can silently use the host environment instead.

### 2. TRELLIS attention backend selector fixed

**Root cause:** `attention_backend.one_of` is declared under `dependencies`, but the
resolver looked at the manifest top level. The selector was therefore ignored.

**Fix:** resolver reads `dependencies.attention_backend.one_of`.

**Why:** only one attention backend should be selected; otherwise both alternatives can
be installed/considered and the manifest's intended choice is not deterministic.

### 3. VCS subdirectory build state fixed

**Root cause:** `_subdir_match` could be referenced after a local-extension branch where
it had never been initialized.

**Fix:** initialize `_subdir_match` before the branch.

**Why:** local-extension/native paths must not produce an unrelated `UnboundLocalError`.

### 4. AniGen CUBVH no longer blocks inference

**Root cause:** the manifest attached `extensions/CUBVH` to the shape and rigging
capabilities as a required native build.

**Fix:** removed those capability-level CUBVH steps and marked shape inference as not
requiring that special build.

**Evidence:** AniGen's current upstream guidance states that CUBVH is required for
training and is not needed for inference (`example.py` / `app.py`).

### 5. AniGen VRAM requirement and provider accounting corrected

**Root cause:** YAML and provider code used a 6200 MB / 6.2 GB requirement even though
current upstream repository guidance specifies NVIDIA GPU >=18 GB VRAM.

**Fix:** YAML now uses 18432 MB for minimum/recommended/capability VRAM, and the provider
reads the manifest instead of hard-coding 6.2 GB.

**Why:** preflight/admission and actual VRAM reservation must agree. Otherwise the runtime
can accept a model that is very likely to OOM.

### 6. UniRig CUDA-specific spconv dependency made explicit

**Root cause:** the manifest used the generic `spconv` package even though UniRig's
upstream installation explicitly requests `spconv-{your-cuda-version}`.

**Fix:** the current manifest target is represented as `spconv-cu124` consistently in
`native`, `cuda_native_packages`, `torch_build_packages`, wheel metadata, and capability
steps.

**Why:** CUDA-specific binary packages should not be represented as an ambiguous generic
package when the manifest already declares a CUDA target.

### 7. UniRig Blender dependency no longer installs into the model venv

**Root cause:** `bpy==4.2` was simultaneously represented as a normal Python dependency
and optional, which makes it a required model-venv installation under the resolver.

**Fix:** removed `bpy==4.2` from `dependencies.python`; it remains an optional Blender
capability with no PyPI wheel target.

**Why:** the project uses Blender's own Python API in the separate headless Blender
subprocess; installing `bpy` into the normal provider venv is the wrong ownership model.

### 8. TRELLIS shallow-clone flag moved to the consumed schema

**Root cause:** `shallow_clone` was nested in `dependencies.wheels`, while the resolver
looks under `dependencies.build_flags`.

**Fix:** moved it to `dependencies.build_flags.diff-gaussian-rasterization.shallow_clone`.

### 9. Hunyuan3D-2 Mini duplicate dependency declarations cleaned

**Root cause:** `hy3dgen` appeared both in `dependencies.python` and `dependencies.extra`,
and `accelerate` appeared in both as well.

**Fix:** keep `hy3dgen` as an explicit extra pinned to the upstream package version
`2.0.2`, and remove the duplicate `accelerate` extra.

### 10. Unsafe hard-coded CUDA fallback removed from backend Torch detection

**Root cause:** when the backend Torch CUDA tag could not be inferred, the helper silently
selected `cu121`, which could produce the wrong wheel family.

**Fix:** no CUDA family is guessed. If no CUDA build tag is exposed, the helper falls
back to CPU rather than silently selecting a CUDA wheel family.

**Why:** CUDA wheel selection must be evidence-based and environment-derived, not a hidden
fallback to a specific CUDA version.

## What was deliberately NOT changed

### Per-model Torch installation

Not changed to per-manifest Torch installation. Local providers share one backend process
and one loaded libtorch instance. Installing a different Torch/torchvision pair into a
model venv can produce C++ operator/ABI failures.

The manifests continue to declare upstream/model compatibility values, while the existing
backend stack is mirrored into model venvs for process safety. Replacing that constraint
would require process isolation and is outside a safe dependency-only patch.

### CUDA values in model manifests

Not globally replaced with a single CUDA version. Different upstream projects explicitly
use different CUDA/toolkit baselines, and CUDA-specific wheels are not interchangeable by
name alone. The audit therefore preserves model-specific YAML declarations instead of
inventing a universal CUDA value.

### Upstream dependency files copied wholesale

No upstream `requirements.txt` was copied wholesale. AI Studio's manifests represent the
actual provider runtime, so demo-only/training-only packages are not automatically added.

## Upstream evidence checked

- AniGen `AGENTS.md`: Python 3.10+, NVIDIA GPU >=18 GB VRAM, CUDA 11.8/12.2, and CUBVH training-only.
- AniGen `README.md`: CUBVH is not needed for inference.
- AniGen `setup.sh`: auto-detects CUDA and selects matching Torch/spconv/pytorch3d/nvdiffrast paths.
- UniRig `README.md`: Python 3.11, Torch >=2.3.1, CUDA-specific spconv, PyG wheel indexes, NumPy 1.26.4.
- UniRig `requirements.txt`: `transformers==4.51.3`, `bpy==4.2`, `flash_attn`, and the other upstream runtime packages.
- TRELLIS `setup.sh`: Python 3.10, Torch 2.4.0, CUDA 11.8 baseline, CUDA-specific spconv, source builds for nvdiffrast/diffoctreerast/mip-splatting, and local vox2seq.
- Hunyuan3D-2 `setup.py`: `hy3dgen` package version 2.0.2 and its runtime dependencies.

## Verification performed

The following checks passed after modification:

```bash
python backend/runtime/test_dependency_manifest_contract.py
python -m py_compile backend/runtime/dependency_resolver.py \
    backend/runtime/installer.py \
    backend/runtime/manifest_loader.py \
    backend/app/core/providers/anigen_provider.py
python -m compileall -q backend/runtime backend/app/core/providers
```

All seven runtime YAML manifests also parse successfully with PyYAML.

## Remaining risk to validate on actual GPU hosts

This environment did not perform a full CUDA native compilation or model inference run,
because the uploaded source tree does not contain the external model repositories/checkpoints
or a dedicated GPU runtime. The final installation still needs a real GPU-host validation
for each supported provider, especially CUDA-native packages such as spconv, PyG wheels,
PyTorch3D, nvdiffrast, diso, diffoctreerast, and the TRELLIS rasterization extension.

That is an environmental validation gap, not a claim of successful end-to-end model
execution on this container.
