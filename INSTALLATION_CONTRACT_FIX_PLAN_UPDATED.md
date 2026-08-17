# AI3DStudio — Installation Contract Fix Plan (Verified Updated)

**Status:** VERIFIED + CORRECTED AFTER CODEBASE REVIEW  
**Priority:** P0 — Architectural  
**Scope:** `backend/runtime/installer.py` + model manifests + state machine + preflight + native-build orchestration

---

## Executive Summary

The recurring "missing dependency" failures across Hunyuan3D, TRELLIS, AniGen, UniRig, TripoSG and similar providers are not isolated package bugs.

They are primarily symptoms of a broken **installation contract**:

```text
BROKEN:
repo + weights downloaded
        ↓
installed = true
        ↓
user loads model
        ↓
missing dependency / native extension / auxiliary weight
```

Correct:

```text
repo
+ correct per-model environment
+ native dependencies
+ main weights
+ required auxiliary weights
+ CUDA compatibility
+ VRAM validation
+ preflight
+ actual provider load
+ capability smoke test
        ↓
READY
```

Only a model that passes the required checks may be exposed as `READY`.

---

# 1. Verified Root Causes

## 1.1 False installed state

Current installation state can effectively be derived from:

```python
repo_ok and weight_ok
```

This is insufficient.

It does not prove:

- model venv exists and works
- required Python dependencies are installed
- native CUDA/C++ extensions are installed
- CUDA is compatible
- auxiliary checkpoints exist
- model can initialize
- provider can actually load
- advertised capability works

Therefore:

```text
repo + weights != installed
```

and:

```text
installed != ready
```

---

## 1.2 Repository mapping mismatch

Hunyuan3D 2.1 must use its dedicated upstream repository:

```text
https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git
```

not the older:

```text
https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git
```

This mapping must be corrected everywhere it is consumed:

```text
REPOS
provider metadata
manifest
repository path
model environment path
provider lookup
weight/runtime path resolution
```

Do not change only the `REPOS` dictionary and leave other layers pointing at the old identity.

---

## 1.3 Generic dependency installation is insufficient

Different models require different installation contracts.

Examples:

```text
Hunyuan3D 2.1
TRELLIS
AniGen
UniRig
TripoSG
DetailGen3D
```

may require:

- exact Python version
- exact PyTorch/CUDA combination
- CUDA-specific wheels
- Git submodules
- native CUDA/C++ compilation
- `spconv`
- PyTorch3D
- PyG wheels
- `nvdiffrast`
- `flash-attn`
- `xformers`
- repository-specific setup commands
- auxiliary model checkpoints

Therefore the installer must become **manifest-driven**.

---

# 2. Correct Installation State Machine

```text
DISCOVERED
    ↓
REPO_READY
    ↓
ENV_CREATING
    ↓
ENV_READY
    ↓
WEIGHTS_DOWNLOADING
    ↓
WEIGHTS_READY
    ↓
NATIVE_BUILD_PENDING / RUNNING / READY
    ↓
PREFLIGHT_RUNNING
    ↓
MODEL_LOAD_TEST
    ↓
CAPABILITY_SMOKE_TEST
    ↓
READY
```

Failure/blocking states:

```text
INSTALL_FAILED
ENV_FAILED
NATIVE_BUILD_FAILED
WEIGHTS_INCOMPLETE
AUXILIARY_WEIGHTS_MISSING
CUDA_INCOMPATIBLE
VRAM_INSUFFICIENT
PREFLIGHT_FAILED
MODEL_LOAD_FAILED
CAPABILITY_FAILED
BLOCKED
```

### Important

`READY` must never be assigned by a placeholder/stub preflight.

If the real preflight has not been implemented:

```text
preflight = NOT_IMPLEMENTED
```

and the model must not become `READY` solely because an import stub returned `True`.

---

# 3. Model Manifest Architecture

Create:

```text
backend/runtime/manifests/
├── hunyuan3d_21.yaml
├── hunyuan3d_2.yaml
├── hunyuan3d_2_mini.yaml
├── trellis.yaml
├── anigen.yaml
├── unirig.yaml
├── triposg.yaml
└── detailgen3d.yaml
```

Each manifest is the authoritative installation contract.

## Canonical schema

Do not create duplicate field names such as:

```text
requirements
requirements_packages
```

Use one schema:

```yaml
name: triposg
label: "TripoSG"

source:
  repo: "https://github.com/VAST-AI-Research/TripoSG.git"
  ref: "main"
  submodules: false

environment:
  python: "3.10"
  torch: "<supported version>"
  cuda: "<supported version>"

dependencies:
  python:
    - "..."
  imports:
    - "torch"
    - "diffusers"
    - "transformers"
  native:
    - "..."

weights:
  primary:
    repo: "VAST-AI/TripoSG"
  auxiliary:
    - name: "RMBG-1.4"
      repo: "briaai/RMBG-1.4"
      required: true

hardware:
  minimum_vram_mb: 8192
  recommended_vram_mb: 12288

capabilities:
  shape: true
  texture: false

preflight:
  imports: true
  model_load: true
  smoke_inference: true
```

The exact dependency versions must be derived from the upstream repository/setup for that model. Do not invent versions.

---

# 4. Manifest Loader

Create:

```text
backend/runtime/manifest_loader.py
```

Implement:

```python
def load_manifest(provider_name: str) -> dict:
    """
    Load and validate one model manifest.
    Raise a clear error when the provider or schema is invalid.
    """
```

Validation must include:

```text
name
source
environment
dependencies
weights
hardware
capabilities
preflight
```

Test:

```bash
python3 -c "from backend.runtime.manifest_loader import load_manifest; print(load_manifest('hunyuan3d-2.1'))"
```

and:

```bash
python3 -c "from backend.runtime.manifest_loader import load_manifest; load_manifest('unknown')"
```

The second command must fail with a clear provider/manifest error.

---

# 5. Per-Model Environment Rule

This is critical.

The project uses isolated model environments under the model repository/runtime area.

Preflight must validate the **actual model environment**, not merely the main backend Python environment.

Bad:

```python
import torch
import diffusers
```

inside the backend process and assuming the model environment is valid.

Correct:

```text
provider
   ↓
resolve model repo
   ↓
resolve model .venv/bin/python
   ↓
run checks inside that interpreter
```

Conceptually:

```bash
<model-venv>/bin/python -c "import torch; import diffusers"
```

This ensures the environment that will actually load the provider is being tested.

---

# 6. State Machine Implementation

Modify:

```text
backend/runtime/installer.py
```

Add:

```python
from enum import Enum
from dataclasses import dataclass

class InstallState(Enum):
    DISCOVERED = "discovered"
    REPO_READY = "repo_ready"
    ENV_CREATING = "env_creating"
    ENV_READY = "env_ready"
    WEIGHTS_DOWNLOADING = "weights_downloading"
    WEIGHTS_READY = "weights_ready"
    NATIVE_BUILD_PENDING = "native_build_pending"
    NATIVE_BUILD_RUNNING = "native_build_running"
    NATIVE_BUILD_READY = "native_build_ready"
    PREFLIGHT_RUNNING = "preflight_running"
    MODEL_LOAD_TEST = "model_load_test"
    CAPABILITY_SMOKE_TEST = "capability_smoke_test"
    READY = "ready"
    BLOCKED = "blocked"
    FAILED = "failed"

@dataclass
class ComponentStatus:
    name: str
    state: InstallState
    detail: str = ""
    last_error: str | None = None
```

---

# 7. `get_install_status()` Refactor

Current binary logic must not be the authoritative readiness calculation.

Return detailed state:

```python
{
    "state": "ready",
    "components": {
        "repo": {
            "state": "ok",
            "path": "..."
        },
        "venv": {
            "state": "ok",
            "path": "..."
        },
        "weights": {
            "state": "ok"
        },
        "auxiliary_weights": [],
        "native_build": {
            "state": "ready"
        },
        "preflight": {
            "state": "passed"
        },
        "model_load": {
            "state": "passed"
        },
        "capabilities": {
            "state": "passed"
        },
        "cuda": {
            "state": "ok",
            "version": "..."
        },
        "vram": {
            "state": "ok",
            "required_mb": 0,
            "available_mb": 0
        }
    },
    "blocking_reason": None,

    # Backward compatibility only.
    "installed": True
}
```

The old `installed` field may remain temporarily so existing UI/API callers do not immediately break.

But new code must use:

```text
state
```

as the authoritative readiness state.

---

# 8. Hunyuan3D 2.1

Official repository:

```text
Tencent-Hunyuan/Hunyuan3D-2.1
```

Official weight source:

```text
tencent/Hunyuan3D-2.1
```

Reference environment includes:

```text
Python 3.10
PyTorch 2.5.1
CUDA/cu124
```

The published VRAM requirements are approximately:

```text
Shape:       ~10 GB
Texture:     ~21 GB
Combined:    ~29 GB
```

## Important correction

Do NOT define the entire Hunyuan3D 2.1 model as:

```yaml
native_build_required: false
```

for all capabilities.

The full 2.1 texture/PBR path includes native renderer/build steps.

Use capability-specific requirements:

```text
Shape
  → normal model environment

Texture/PBR
  → native renderer/build requirements
```

Therefore manifest capability data must support per-capability dependencies.

---

# 9. TRELLIS

Official repository:

```text
microsoft/TRELLIS
```

TRELLIS requires a CUDA/native environment and recursive submodules.

The manifest must support:

```yaml
source:
  submodules: true
```

Do not blindly define both:

```text
flash-attn
xformers
```

as universally mandatory.

The attention backend can be selected/configured depending on the supported environment.

Represent alternatives explicitly, conceptually:

```yaml
attention_backend:
  one_of:
    - flash-attn
    - xformers
```

Native extensions required by the actual supported Studio capability must remain mandatory.

The upstream setup should be treated as the reference instead of inventing a simplified `requirements.txt`.

---

# 10. AniGen

Official repository:

```text
VAST-AI-Research/AniGen
```

The manifest must represent its actual environment and model assets, including CUDA/native dependencies.

Potential dependency classes include:

```text
PyTorch
spconv
PyTorch3D
nvdiffrast
DINOv2-related assets
DSINE-related assets
VGG-related assets
SMPL/data assets
```

Do not reduce AniGen to a generic requirements file.

A model should not become `READY` while any required asset/dependency is missing.

---

# 11. UniRig

Official repository:

```text
VAST-AI-Research/UniRig
```

The installation contract includes CUDA/PyTorch-compatible packages such as:

```text
spconv
torch_scatter
torch_cluster
numpy==1.26.4
```

plus repository-specific requirements and flash-attn handling.

The manifest must support:

```text
CUDA-specific wheel
PyG wheel/source
spconv variant
native build
```

Do not assume a generic `pip install -r requirements.txt` is sufficient.

---

# 12. TripoSG

Official repository:

```text
VAST-AI-Research/TripoSG
```

Main weights:

```text
VAST-AI/TripoSG
```

Required auxiliary model:

```text
briaai/RMBG-1.4
```

The provider loads RMBG locally, so missing RMBG must be treated as a real dependency.

Correct state:

```text
Main weights      ✓
RMBG-1.4          ✗
CUDA              ✓

Overall:
BLOCKED
Reason:
AUXILIARY_WEIGHTS_MISSING
```

Do not silently treat RMBG as installed.

---

# 13. Hunyuan3D 2 Mini

Mini has capability-specific dependencies.

Use:

```text
Shape:
READY

Texture:
BLOCKED/PARTIAL
Reason:
required Hunyuan texture/paint assets unavailable
```

Do not block the entire model if only an optional/non-selected capability is missing.

This is why the state model must support:

```text
READY
PARTIAL
BLOCKED
```

at capability level.

---

# 14. DetailGen3D

Treat DetailGen3D as its own environment contract.

Do not assume the global backend requirements cover it.

Include only dependencies verified against the upstream setup actually used by the provider.

---

# 15. Preflight Module

Create:

```text
backend/runtime/preflight.py
```

Result:

```python
@dataclass
class PreflightResult:
    passed: bool
    checks: dict
    error_detail: str = ""
    inference_time_ms: float = 0
    peak_memory_mb: float = 0
```

Checks should be layered:

```text
1. Python version
2. PyTorch version
3. CUDA availability/version
4. GPU visibility
5. VRAM
6. required imports
7. native extension imports
8. primary weights
9. auxiliary weights
10. model initialization
11. provider model load
12. minimal capability smoke test
```

## Important

Do not use:

```python
return PreflightResult(passed=True)
```

as a temporary implementation if `READY` depends on preflight.

Until real validation exists:

```text
preflight = NOT_IMPLEMENTED
```

and:

```text
READY = forbidden
```

for that provider.

---

# 16. Model Load vs Capability Test

These are separate.

```text
MODEL_LOAD_TEST
```

proves:

```text
model initialization + weights + runtime
```

works.

It does NOT necessarily prove:

```text
Studio generation endpoint
```

works.

Therefore:

```text
MODEL_LOAD_TEST
        ↓
CAPABILITY_SMOKE_TEST
        ↓
READY
```

For each advertised capability, run the smallest safe representative test possible.

---

# 17. `install_provider()` Refactor

Keep existing lower-level helpers wherever possible:

```text
clone_repo
install_repo_deps
download_weights
```

Refactor orchestration around them.

Conceptual sequence:

```text
1. Load manifest
2. Resolve provider identity
3. Prepare repository
4. Initialize submodules if required
5. Create/validate model venv
6. Install exact dependencies
7. Download primary weights
8. Download required auxiliary weights
9. Native build if required
10. Preflight
11. Model load test
12. Capability smoke test
13. READY
```

---

# 18. Native Build Orchestration

Do not make the normal API request wait for long CUDA compilation.

Use a dedicated installation/background worker.

However, the current project already has Celery configuration, so do not create a second arbitrary task system.

Use the existing Celery infrastructure with an **installation-specific queue/worker**.

Recommended conceptual architecture:

```text
generation queue      → normal generation
images queue          → image jobs
installation queue    → native builds
```

The installation worker must have a substantially longer timeout than ordinary generation jobs.

Do not run a 20–60 minute CUDA compilation under the existing ~10 minute normal job timeout.

---

# 19. Native Build Locking

Do not release the repository mutation lock immediately after queuing a native build.

Bad:

```text
API install
   ↓
queue build
   ↓
return
   ↓
release lock
   ↓
second install mutates same repo
```

Correct:

```text
native build pending/running
        ↓
persist build state
        ↓
repository remains locked
        ↓
worker owns build lock
        ↓
build finishes
        ↓
preflight
        ↓
release lock
```

Persist:

```text
native_build_task_id
native_build_state
lock owner
lock timestamp
```

and prevent concurrent installation/repair against the same provider.

---

# 20. Admin API

Modify:

```text
backend/app/api/v1/admin.py
```

without breaking the existing request shape.

The endpoint should return the new state information while preserving compatibility.

Conceptually:

```json
{
  "success": true,
  "state": "native_build_pending",
  "components": {},
  "native_build_task_id": "..."
}
```

Do not call a model `READY` merely because its native build was queued.

---

# 21. Database State

Do not create a parallel state system if an existing persistence mechanism already covers the same responsibility.

If provider-state persistence is required, store component-level state:

```text
provider_name
overall_state

repo_state
env_state
weights_state
auxiliary_weights_state
native_build_state
preflight_state
model_load_state
capability_state

blocking_component
blocking_reason
repair_available

last_preflight_run
last_preflight_result
```

The persisted state should survive process restart.

---

# 22. Repair System

Add:

```text
repair_provider(provider_name)
```

only after the state model and manifest are stable.

Flow:

```text
identify failing component
        ↓
manifest lookup
        ↓
repair exact component
        ↓
revalidate
        ↓
preflight
        ↓
model load
        ↓
capability smoke test
        ↓
READY / BLOCKED
```

Do not implement a generic:

```text
pip install random_missing_package
```

repairer.

Repair must follow the model manifest.

---

# 23. UI Readiness

The existing UI may continue consuming:

```text
installed
```

during migration.

New UI data should expose:

```text
Repository
Environment
Main weights
Auxiliary weights
Native build
CUDA
VRAM
Preflight
Model load
Capabilities
Blocking reason
Repair availability
```

Example:

```text
TripoSG

Repository       ✓
Environment      ✓
Main weights     ✓
RMBG-1.4         ✗
CUDA             ✓
VRAM             ✓

STATUS: BLOCKED

Reason:
Required auxiliary weight RMBG-1.4 is missing.
```

Use progressive disclosure rather than redesigning the entire admin UI.

---

# 24. Storage/Disk Estimates

Do not hard-code stale repository-size estimates.

For every model distinguish:

```text
download size
installed weight size
environment/package size
temporary build space
required auxiliary weights
```

Use manifest data and, where feasible, actual discovered snapshot size.

---

# 25. Documentation

Actual repository filenames are case-sensitive.

Use the existing project filenames:

```text
Docs/architecture.md
Docs/setup-guide.md
Docs/CHANGELOG.md
```

Create:

```text
Docs/INSTALLATION_STATES.md
```

with:

- state machine
- component definitions
- failure reasons
- troubleshooting examples
- repair behavior

Update architecture/setup documentation only after implementation is verified.

---

# 26. Validation Checklist

## Baseline

```bash
python3 -m compileall -q backend
```

must pass.

Verify:

```text
GET /api/v1/admin/install/status
```

returns valid JSON.

## Manifest

```bash
python3 -c "from backend.runtime.manifest_loader import load_manifest; print(load_manifest('hunyuan3d-2.1'))"
python3 -c "from backend.runtime.manifest_loader import load_manifest; print(load_manifest('trellis'))"
```

Unknown provider must fail clearly.

## State Machine

Verify every real provider has:

```text
state
components
blocking_reason
```

and no incomplete model is falsely reported as:

```text
READY
```

## Environment Validation

For every installed model verify its actual model `.venv`:

```text
<model repo>/.venv/bin/python
```

can import its required dependencies.

Do not rely solely on the main backend interpreter.

## Native Build

Verify:

```text
pending
→ running
→ ready
```

or:

```text
pending
→ running
→ failed
```

with a persistent error reason.

## TripoSG

Verify:

```text
VAST-AI/TripoSG
+
briaai/RMBG-1.4
```

are represented explicitly.

Missing RMBG must block only the capabilities that actually require it.

## Hunyuan3D 2.1

Verify:

```text
repo = Tencent-Hunyun/Hunyuan3D-2.1
```

and verify all environment/native requirements used by the actual Studio capabilities.

Do not globally mark native build as false if texture/PBR requires native components.

## TRELLIS

Verify:

```text
submodules
CUDA/native components
attention backend
model weights
```

Do not require both attention backends when one supported backend is sufficient.

## Capability Test

Do not declare:

```text
READY
```

until the advertised provider capability has passed the smallest practical smoke test.

---

# 27. Things the Coding AI Must NOT Do

Do not:

```text
- rewrite the whole backend
- rewrite all providers
- replace the existing task system
- replace the existing provider registry
- blindly change all dependency versions
- install arbitrary packages based only on ImportError text
- mark native-build models READY before compilation
- mark models READY from a stub preflight
- use the backend environment as proof that model .venv works
- change UI architecture unnecessarily
- silently remove backward-compatible fields
- duplicate the source of truth
```

---

# 28. Final Architecture

```text
                         MODEL CATALOG
                              │
                              ▼
                      MODEL MANIFEST
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
     SOURCE               ENVIRONMENT              ASSETS
       │                      │                      │
    Git repo              Python                 Main weights
    commit/ref            PyTorch                Auxiliary weights
    submodules            CUDA                   VAE/config/etc
       └──────────────────────┼──────────────────────┘
                              ▼
                         INSTALL STATE
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
           REPO              ENV             WEIGHTS
             └────────────────┼────────────────┘
                              ▼
                        NATIVE BUILD
                              │
                              ▼
                          PREFLIGHT
                              │
                              ▼
                       MODEL LOAD TEST
                              │
                              ▼
                    CAPABILITY SMOKE TEST
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
                  READY              BLOCKED
```

---

# 29. Final Engineering Rule

> **Never mark a model READY because its repository and weights exist. READY means the exact model environment, native dependencies, required assets, CUDA/VRAM constraints, model initialization, and the advertised capability's smoke test have all passed.**

This rule is the core of the installation-contract refactor.

---

# 30. Verified Upstream References

Use these as verification sources when writing each manifest:

- Hunyuan3D 2.1:
  `https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1`
  `https://huggingface.co/tencent/Hunyuan3D-2.1`

- Hunyuan3D 2:
  `https://github.com/Tencent-Hunyuan/Hunyuan3D-2`

- TRELLIS:
  `https://github.com/microsoft/TRELLIS`

- AniGen:
  `https://github.com/VAST-AI-Research/AniGen`

- UniRig:
  `https://github.com/VAST-AI-Research/UniRig`
  `https://huggingface.co/VAST-AI/UniRig`

- TripoSG:
  `https://github.com/VAST-AI-Research/TripoSG`
  `https://huggingface.co/VAST-AI/TripoSG`
  `https://huggingface.co/briaai/RMBG-1.4`

- DetailGen3D:
  `https://github.com/VAST-AI-Research/DetailGen3D`
  `https://huggingface.co/VAST-AI/DetailGen3D`

When a manifest requires a precise version, wheel, CUDA build, or auxiliary asset, verify it against the model's upstream installation documentation rather than inventing a value.

---

## Completion Criterion

The refactor is complete only when:

```text
All real providers
        ↓
have a valid manifest
        ↓
have explicit dependency/assets
        ↓
can report component-level state
        ↓
are tested in their actual model environment
        ↓
pass required preflight/load/capability checks
        ↓
are READY only when genuinely runnable
```

The goal is not merely to remove today's missing-dependency errors.

The goal is to make the installation system capable of explaining and preventing the same class of failure for future models.
