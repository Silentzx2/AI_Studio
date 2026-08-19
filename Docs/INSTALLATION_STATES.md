# Installation States Reference

## State Machine

```text
DISCOVERED
    |
REPO_READY
    |
ENV_CREATING
    |
ENV_READY
    |
WEIGHTS_DOWNLOADING
    |
WEIGHTS_READY
    |
NATIVE_BUILD_PENDING / RUNNING / COMPLETE / FAILED
    |
PREFLIGHT_RUNNING
    |
MODEL_LOAD_TEST
    |
CAPABILITY_SMOKE_TEST
    |
READY
```

> **Note**: `NATIVE_BUILD_PENDING/RUNNING/COMPLETE/FAILED` are blocking states for models that require CUDA compilation. Models without native build requirements skip directly from `WEIGHTS_READY` to `PREFLIGHT_RUNNING`.

## Blocking / Failure States

| State | Meaning |
|-------|---------|
| `discovered` | Provider registered but repo not yet cloned |
| `env_creating` | Virtual environment is being created |
| `env_failed` | Virtual environment creation or dependency install failed |
| `weights_incomplete` | Primary or required auxiliary weights are missing |
| `native_build_pending` | CUDA compilation queued but not started (may be per-capability, e.g. `texture_pbr`) |
| `native_build_running` | CUDA compilation in progress |
| `native_build_complete` | CUDA compilation finished successfully |
| `native_build_failed` | CUDA compilation failed — blocking_reason contains the error |
| `blocked` | A required component is missing or failed |
| `auxiliary_weights_missing` | A required auxiliary weight (`required: true` in manifest) is not downloaded |
| `cuda_incompatible` | CUDA not available on the host |
| `vram_insufficient` | GPU does not meet manifest `minimum_vram_mb` — enforced as hard gate during preflight, not just displayed |
| `preflight_failed` | Preflight validation failed |
| `not_implemented` | Preflight checks not yet implemented for this provider (replaced by real tests where available) |
| `failed` | Generic failure state |

## Component Status

The `GET /api/v1/admin/install/status` endpoint returns detailed component-level status. The runtime status from `get_install_status()` is **live-authoritative** for `state`, `blocking_reason`, and `components`; persisted DB state only supplies historical/task detail and is never used to override a live `BLOCKED`/`PARTIAL`/`FAILED` or resurrect a stale `READY`.

```json
{
  "hunyuan3d-2.1": {
    "state": "blocked",
    "components": {
      "repo": {"state": "ok", "path": "..."},
      "venv": {"state": "ok", "path": "..."},
      "weights": {"state": "ok", "path": "..."},
      "auxiliary_weights": [],
      "native_build": {"state": "not_required", "detail": ""},
      "preflight": {"state": "not_implemented"},
      "capabilities": {
        "shape": {"state": "pending", "reason": "..."},
        "texture_pbr": {"state": "pending", "reason": "..."}
      },
      "cuda": {"state": "ok", "version": "12.4"},
      "vram": {"state": "ok", "required_mb": 29000, "available_mb": 40000}
    },
    "blocking_reason": "Preflight not implemented for hunyuan3d-2.1"
  }
}
```

> **Note**: Component-level install states are persisted to the database via the `ProviderInstallState` model (`backend/app/models/registry.py`). The installer calls `persist_provider_state()` after status changes to record historical and in-flight task details. The `GET /api/v1/admin/install/status` endpoint is **live-authoritative**: it computes readiness from `get_install_status()` at request time. Persisted DB state only fills in task/locking detail and is never used to override a live `BLOCKED`/`PARTIAL`/`FAILED` or resurrect a stale `READY`.

## Troubleshooting

| Symptom | Likely State | Action |
|---------|-------------|--------|
| Model shows `discovered` | Repo not cloned | Run install for the provider |
| Model shows `blocked` with preflight reason | Preflight failing (real tests) | Check `components.preflight` for details — preflight now runs real model_load and capability_smoke tests |
| Model shows `auxiliary_weights_missing` | Required aux weight missing | Run repair endpoint to download missing weight |
| Model shows `native_build_pending` | CUDA compilation needed | Start native build or wait for background worker |
| Model shows `cuda_incompatible` | No GPU/CUDA | Install on a GPU-enabled host |
| Model shows `vram_insufficient` | GPU too small | Use a GPU with more VRAM or enable low-VRAM mode |
| TripoSG shows `blocked` + RMBG missing | Auxiliary weights missing | Download `briaai/RMBG-1.4` via the repair endpoint |
| Hunyuan3D 2.1 shows wrong repo | Old repo mapping | Verify REPOS table has `Hunyuan3D-2.1` entry |

## Ready Gate Rule

A model is only marked `READY` when:

1. Repository is cloned and valid
2. Virtual environment exists with all dependencies **installed from the YAML manifest** (`dependencies.python` + `dependencies.native`), with `environment.python` pinning the venv Python version and the backend-matching torch stack pre-installed
3. Primary weights are downloaded
4. All required auxiliary weights are present
5. Native builds (if required) are complete
6. CUDA is available and compatible
7. VRAM meets minimum requirement
8. Preflight validation has passed
9. Model load test has passed
10. Capability smoke test has passed

**Never mark a model READY because its repository and weights exist.**

## Dependency Installation

Dependency installation is **manifest-driven**. `install_repo_deps()` in `runtime/installer.py`
reads the provider's YAML manifest (`backend/runtime/manifests/<provider>.yaml`) and uses:

- `manifest["environment"]["python"]` → pins the venv Python version (`uv venv --python`)
- `manifest["dependencies"]["python"]` + `manifest["dependencies"]["native"]` → combined into a
  requirements file installed via `_uv_install`
- `_install_torch_stack()` → installs the backend-matching torch/torchvision/torchaudio build

The `REPOS[*]["requirements"]` field is only used when no manifest exists (backward-compat
fallback). The TRELLIS upstream conda-based setup (`_install_trellis_deps`) is preserved as
the no-manifest fallback when TRELLIS has no manifest.

## Repair

The `POST /api/v1/admin/repair/{provider_name}` endpoint (future) will:

1. Identify the failing component via manifest lookup
2. Repair the exact component
3. Revalidate all components
4. Run preflight
5. Return updated state

The endpoint is now **manifest-driven**: it loads the provider's YAML manifest, identifies the failing component, delegates to `install_provider()` to repair it, re-validates, and returns the updated state.