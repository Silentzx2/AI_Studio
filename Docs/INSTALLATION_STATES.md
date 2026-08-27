# Installation States Reference

## Component-Level State Machine

The installation process is now modeled as a set of independent component states, each with its own lifecycle. The overall model state is derived from the component states.

### RepoState

```text
missing → ready
          ↓
        failed
```

| State | Meaning |
|-------|---------|
| `missing` | Repository not yet cloned |
| `ready` | Repository cloned and valid |
| `failed` | Clone or validation failed |

### EnvState

```text
missing → creating → ready
                      ↓
                    failed
```

| State | Meaning |
|-------|---------|
| `missing` | Virtual environment not yet created |
| `creating` | Virtual environment is being created |
| `ready` | Virtual environment exists and is valid |
| `failed` | Environment creation failed |

### DepsState

```text
pending → installing → ready
              ↓           ↓
            failed     partial
```

| State | Meaning |
|-------|---------|
| `pending` | Dependencies not yet installed |
| `installing` | Dependency installation in progress |
| `ready` | All dependencies installed successfully |
| `partial` | Some dependencies installed, others failed (non-blocking) |
| `failed` | Dependency installation failed |

### NativeState

```text
not_required
    ↓
pending → checking_wheel → wheel_found → wheel_installed → ready
              ↓                              ↓
         build_pending → build_running → ready
                              ↓
                           failed
              ↓
           skipped
              ↓
           failed
```

| State | Meaning |
|-------|---------|
| `not_required` | No native build needed for this provider |
| `pending` | Native build queued, not yet started |
| `checking_wheel` | Checking wheel table for pre-built wheel |
| `wheel_found` | Pre-built wheel available |
| `wheel_installed` | Pre-built wheel installed successfully |
| `build_pending` | Source build queued (no wheel available) |
| `build_running` | Source compilation in progress |
| `ready` | Native build complete (wheel or source) |
| `skipped` | Native build skipped (user choice or non-blocking) |
| `failed` | Native build failed |

### WeightsState

```text
missing → downloading → verifying → ready
             ↓              ↓          ↓
           failed       failed    incomplete
```

| State | Meaning |
|-------|---------|
| `missing` | Weights not yet downloaded |
| `downloading` | Weight download in progress |
| `verifying` | Downloaded weights being verified (checksum/size) |
| `ready` | All weights downloaded and verified |
| `incomplete` | Some weights present, others missing (non-blocking aux weights) |
| `failed` | Weight download or verification failed |

### ModelState (Derived)

```text
not_ready → partial → ready
   ↓          ↓        ↓
blocked    blocked   failed
   ↓
failed
```

| State | Meaning |
|-------|---------|
| `not_ready` | Initial state; installation not started or in progress |
| `partial` | Some components ready, others pending (non-blocking) |
| `ready` | All required components ready; model is operational |
| `blocked` | A required component is missing or failed |
| `failed` | Installation failed; model is non-operational |

## Blocking / Failure States

| State | Meaning |
|-------|---------|
| `missing` | Component not yet started |
| `failed` | Component failed (clone, env, deps, native, or weights) |
| `partial` | Some sub-components failed but model may still operate |
| `incomplete` | Required weights missing (auxiliary) |
| `blocked` | A required component is missing or failed |
| `cuda_incompatible` | CUDA not available on the host |
| `vram_insufficient` | GPU does not meet manifest `minimum_vram_mb` — enforced as hard gate during preflight, not just displayed |

## Component Status

The `GET /api/v1/admin/install/status` endpoint returns detailed component-level status. The runtime status from `get_install_status()` is **live-authoritative** for `state`, `blocking_reason`, and `components`; persisted DB state only supplies historical/task detail and is never used to override a live `BLOCKED`/`PARTIAL`/`FAILED` or resurrect a stale `READY`.

```json
{
  "hunyuan3d-2.1": {
    "state": "blocked",
    "components": {
      "repo": {"state": "ready", "path": "..."},
      "env": {"state": "ready", "path": "..."},
      "deps": {"state": "ready"},
      "native": {"state": "not_required", "detail": ""},
      "weights": {"state": "ready", "path": "..."},
      "auxiliary_weights": [],
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

## Wheel-First Dependency Resolution

Native dependencies use a **wheel-first** resolution strategy:

1. **Check wheel table** — Look up the dependency in the pre-built wheel table for the current platform/CUDA version
2. **Wheel found** → Install the pre-built wheel directly (fast path)
3. **No wheel** → Ask user: build from source or skip
4. **Build** → Queue source compilation (`build_pending` → `build_running` → `ready`)
5. **Skip** → Mark as `skipped` (non-blocking; model may still operate without this capability)

This avoids unnecessary source compilation and reduces install time significantly when pre-built wheels are available.

## Storage Contract

**Canonical path**: `third_party/<repo>/weights/`

All model weights are stored under `third_party/<repo>/weights/` where `<repo>` matches the repository name. This is the single canonical location for weight storage.

**Legacy paths deprecated**: Older weight locations (e.g., `models/`, `weights/`, or provider-specific paths) are deprecated. The installer migrates legacy weights to the canonical path on first access and logs a deprecation warning.

## Two-Stage Contract

Installation is split into two independent stages:

### Stage A: Runtime

Stage A covers everything needed to load the model runtime:

- Repository clone (`RepoState`)
- Virtual environment (`EnvState`)
- Python dependencies (`DepsState`)
- Native builds (`NativeState`)

A model that completes Stage A can be loaded and run, but may not produce output without weights.

### Stage B: Weights

Stage B covers weight acquisition:

- Primary weights download (`WeightsState`)
- Auxiliary weights download (`WeightsState`)
- Weight verification (`verifying` state)

Stage B is independent of Stage A. Weights can be downloaded before, during, or after runtime installation. A model is only `ready` when **both** stages complete successfully.

### Benefits

- **Parallelism**: Stage A and Stage B can run concurrently
- **Resumability**: Failure in one stage does not restart the other
- **Partial operation**: Stage A complete + Stage B partial = `partial` model state (model loads but some capabilities unavailable)
- **Repair**: Repair endpoint can target a specific stage without affecting the other

## Troubleshooting

| Symptom | Likely State | Action |
|---------|-------------|--------|
| Model shows `not_ready` | Installation not started | Run install for the provider |
| `repo.state: failed` | Clone failed | Check network, repo URL, disk space |
| `env.state: failed` | Virtual environment creation failed | Check Python version, `uv` availability |
| `deps.state: failed` | Dependency install failed | Check manifest, network, build tools |
| `deps.state: partial` | Some deps failed | Check which deps; may be non-blocking |
| `native.state: checking_wheel` | Looking up pre-built wheel | Wait or check wheel table configuration |
| `native.state: build_pending` | Source build queued | Start native build or wait for background worker |
| `native.state: build_running` | Source compilation in progress | Wait for completion |
| `native.state: failed` | Build failed | Check build logs, CUDA toolkit, compatibility |
| `native.state: skipped` | Build skipped | Re-run install with build enabled if capability needed |
| `weights.state: downloading` | Download in progress | Wait for completion |
| `weights.state: verifying` | Checksum verification in progress | Wait for completion |
| `weights.state: incomplete` | Some weights missing | Run repair endpoint to download missing weights |
| `weights.state: failed` | Download or verification failed | Check network, storage path, checksum |
| Model shows `blocked` | Required component failed | Check `blocking_reason` and component states |
| Model shows `partial` | Non-blocking component failed | Model may operate with reduced capabilities |
| `cuda_incompatible` | No GPU/CUDA | Install on a GPU-enabled host |
| `vram_insufficient` | GPU too small | Use a GPU with more VRAM or enable low-VRAM mode |
| TripoSG shows `blocked` + RMBG missing | Auxiliary weights missing | Download `briaai/RMBG-1.4` via the repair endpoint |
| Hunyuan3D 2.1 shows wrong repo | Old repo mapping | Verify REPOS table has `Hunyuan3D-2.1` entry |

## Ready Gate Rule

A model is only marked `ready` when:

1. **RepoState** = `ready` — Repository cloned and valid
2. **EnvState** = `ready` — Virtual environment exists and valid
3. **DepsState** = `ready` — All dependencies installed
4. **NativeState** = `ready` or `not_required` — Native builds complete or not needed
5. **WeightsState** = `ready` — Primary weights downloaded and verified
6. All required auxiliary weights present
7. CUDA is available and compatible
8. VRAM meets minimum requirement
9. Preflight validation has passed
10. Model load test has passed
11. Capability smoke test has passed

**Never mark a model `ready` because its repository and weights exist.**

## Dependency Installation

Dependency installation is **manifest-driven**. `install_repo_deps()` in `runtime/installer.py`
reads the provider's YAML manifest (`backend/runtime/manifests/<provider>.yaml`) and uses:

- `manifest["environment"]["python"]` → pins the venv Python version (`uv venv --python`)
- `manifest["dependencies"]["python"]` + `manifest["dependencies"]["native"]` → combined into a
  requirements file installed via `_uv_install`
- `_install_torch_stack()` → installs the backend-matching torch/torchvision/torchaudio build

Native dependencies follow the **wheel-first** resolution strategy (see above).

The `REPOS[*]["requirements"]` field is only used when no manifest exists (backward-compat
fallback).

## Runtime Health States (v4.3.0+)

The runtime health endpoint (`GET /api/v1/runtime/health`) now exposes a clear,
actionable state machine for each provider and an overall system status.

### Per-provider states

| State | Meaning | Can the engine use it? |
|-------|---------|------------------------|
| `runtime_ready` | All components (venv, deps, native, preflight) are in their success state | Yes — full functionality |
| `runtime_partial` | Install succeeded but some required deps failed or a representation-specific native dep failed | No — registry marks it unavailable; UI shows `blocking_reason` |
| `runtime_failed` | Critical component (venv or deps) not ready | No |
| `not_installed` | Provider not yet selected for install | No |
| `discovered` | Repo not yet cloned | No |

### Overall system status

| Status | Meaning |
|--------|---------|
| `healthy` | All installed providers are `runtime_ready` |
| `partial` | At least one provider is `runtime_partial` or `blocked` but none are `failed` |
| `degraded` | At least one provider is `runtime_failed` |
| `not_initialized` | No providers installed yet |

### Why this changed

Previously the runtime reported `runtime_partial` as a non-fatal warning and the
registry marked the provider available based only on `repo_ok and weight_ok`.
This meant a provider with broken deps would be auto-selected by the engine
and crash at first use with no clear error to the user.

The new semantics:
1. `prepare_runtime()` no longer accepts `DepsState.PARTIAL` as "deps OK"
2. The registry checks the overall state, not just repo+weights
3. The API exposes per-provider states with `blocking_reason` so the UI can show
   exactly what's wrong (e.g., "Some required dependencies failed: [kaolin]")

### Representation-specific vs optional native deps

The resolver distinguishes three classes of native dependency:

| Class | Example | On wheel failure + non-interactive |
|-------|---------|-------------------------------------|
| Truly optional (alternative) | `flash-attn`, `xformers` | Skip cleanly |
| Representation-required | `nvdiffrast`, `kaolin`, `diffoctreerast`, `vox2seq`, `diff-gaussian-rasterization` | Attempt build if CUDA toolkit present; on failure, mark the corresponding capability as unavailable |
| Fully required | `spconv-cu118` (for sparse voxel) | Attempt build if CUDA toolkit present; on failure, fail the install |

A package is "representation-required" if TRELLIS uses it for a specific 3D
output format (mesh, Gaussian splat, structured latent, sparse voxel). These
are not "nice-to-have" — they enable specific outputs. Marking them optional
would silently disable representations.

## VCS Dependency Wheel Resolution (v4.3.1+)

VCS dependencies (e.g. `git+https://github.com/JeffreyXiang/diffoctreerast.git`)
require special handling because uv's `--find-links` flag does **not** substitute
a wheel for a VCS spec — it only tells uv where to look for *transitive
dependency* wheels. The main package is always cloned and built from source.

The resolver now distinguishes:

| Dependency class | Compat table entry | `check_wheel_available` | Install path |
|------------------|---------------------|------------------------|--------------|
| Non-VCS, custom index | `index` URL | `available=True` | Install with `--find-links` |
| Non-VCS, direct `.whl` template | `direct_url_template` | `available=True, is_direct_wheel=True` | Install the `.whl` URL directly |
| Non-VCS, PyPI | (no entry or `pypi`) | `available=True, source=pypi` | Install from PyPI |
| VCS, real direct wheel URL (e.g. `nvdiffrast`) | `direct_url_template` | `available=True, is_direct_wheel=True` | **Direct wheel install** |
| VCS, index-only (e.g. `diffoctreerast`) | `index` URL | `available=False, reason="VCS spec with index-only..."` | **Source build** |
| VCS, no compat entry | (no entry) | `available=False, reason="VCS spec with no compat table entry..."` | **Source build** |

A VCS dep with an index-only source (like `diffoctreerast` pointing to a GitHub
Releases page that 404s) is **not** a verified wheel target. It falls through to
the source-build path, where the representation-required/optional/required policy
applies as normal. The logs clearly say "No verified wheel" rather than
misleading "Wheel found".

**nvdiffrast exception:** The `miropsota.github.io/torch_packages_builder` index
page lists 402 real `.whl` files hosted on GitHub Releases
(`MiroPsota/torch_packages_builder`). Verified reachable wheel for our
environment (Python 3.10, Torch 2.5.1, CUDA 12.4):
`nvdiffrast-0.4.0+253ac4fpt2.5.1cu124-cp310-cp310-linux_x86_64.whl` (18.5MB).
The resolver now installs this wheel directly via `direct_url_template`,
bypassing the VCS spec entirely. No Git clone, no source compilation.

**diffoctreerast:** The configured releases page (`iiiytn1k/sd-webui-some-stuff`)
returns 404. No wheel exists. Source build is the correct and only path.

## Local Extension Resolution (v4.3.2+)

Some model repos (e.g. TRELLIS) expect local extension directories that are
not part of the git clone. For example, TRELLIS's `extensions/vox2seq` must
be acquired separately from a HuggingFace dataset
(`argojuni0506/TRELLIS-3D`).

The resolver handles this via `LOCAL_EXTENSION_PATHS`, which now stores a
tuple `(relative_path, hf_dataset_source)`:

```python
LOCAL_EXTENSION_PATHS = {
    "vox2seq": ("extensions/vox2seq", "argojuni0506/TRELLIS-3D"),
}
```

When the local extension is not found in the cloned repo, the resolver
attempts to fetch it from the configured HF dataset. If the fetch also
fails, the dep is marked `capability_degraded` (not silently skipped) so
the runtime health correctly reflects that the structured latent capability
is unavailable.

## Git Subdirectory Source Resolution (v4.3.2+)

VCS dependencies with `#subdirectory=` (e.g.
`git+https://github.com/autonomousvision/mip-splatting.git#subdirectory=submodules/diff-gaussian-rasterization`)
require cloning the full repo and installing from the subdirectory path. The
resolver:

1. Uses **full clone** (not `--depth 1`) with `--recurse-submodules` for
   reliability. Shallow clones with `--recurse-submodules` have known issues
   where the submodule content is not fetched.
2. Verifies the subdirectory exists after clone.
3. Verifies the subdirectory contains a Python package definition
   (setup.py, pyproject.toml, or setup.cfg) before attempting install.
4. If any check fails, the dep is marked `capability_degraded`.

## Repair

The `POST /api/v1/admin/repair/{provider_name}` endpoint is manifest-driven: it:

1. Identify the failing component via manifest lookup
2. Repair the exact component
3. Revalidate all components
4. Run preflight
5. Return updated state

The endpoint is now **manifest-driven**: it loads the provider's YAML manifest, identifies the failing component, delegates to `install_provider()` to repair it, re-validates, and returns the updated state.
