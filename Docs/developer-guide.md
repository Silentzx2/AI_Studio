# Developer Guide

## Project Structure

### Architecture Overview
The project follows a layered architecture with clear separation:

1. **Frontend**: React with TypeScript, using Next.js 16
2. **State Management**: Custom hooks with `useRef`-based patterns
3. **Backend Integration**: API proxy at `/api/v1/*` with runtime BACKEND_URL
4. **Build**: TypeScript strict mode enabled; dev server uses Turbopack (Next.js 16)

### Component Guidelines

#### State Management
- **Anti-pattern**: Direct `setState` inside `useEffect` without guards
- **Pattern**: Use `useRef` for mutable values, guard state updates
- **Dependency arrays**: Always include all reactive values

```tsx
// Good pattern
useEffect(() => {
  if (ready && !initialized) {
    init();
    setInitialized(true);
  }
}, [ready, initialized]);

// Avoid
useEffect(() => {
  setState(value); // Potential cascading render
}, [value]);
```

#### Backend Integration
- All API calls go through `/api/v1/*` routes
- BACKEND_URL env var must be set for production
- Error handling: always check `response.ok` before `.json()`

## Two-Stage Model Setup (v4.1+)

Model installation is split into two strictly separated stages. Each stage is independently retryable and reportable.

### Stage A — Runtime Preparation
`prepare_runtime()` in `backend/runtime/installer.py`:
1. Clone repo into `third_party/<repo>/` (idempotent: reuse if valid)
2. Create `third_party/<repo>/.venv` (idempotent: reuse if valid)
3. Discover dependency files (requirements.txt, pyproject.toml, manifest)
4. Install normal dependencies via wheel-first resolver
5. Resolve native dependencies (CUDA/C++ packages) via wheel-first logic
6. Run preflight (without weights check)

**Does NOT download weights.**

### Stage B — Weight Download
`download_model_weights()` in `backend/runtime/installer.py`:
1. Check runtime status — if not ready, return error directing caller to Stage A first
2. Resolve weight manifest
3. Download to `third_party/<repo>/weights/<provider>` (canonical location)
4. Verify checksum + completeness

**Does NOT clone repos, create venvs, or install deps.**

### Entry Points
- `scripts/setup.sh` → Stage A only (no weights)
- `scripts/colab.sh` → Stage A at bootstrap, Stage B on-demand or via `--weights-only`
- `POST /api/v1/runtime/prepare-runtime` → Stage A
- `POST /api/v1/runtime/download-weights` → Stage B
- `POST /api/v1/runtime/install` → Stage A + B (backward compat)

## YAML-Only Architecture (v4.4+)

The installation pipeline is **fully YAML-driven**. The Python installer and
dependency resolver are generic engines; every model-specific detail lives in
`backend/runtime/manifests/*.yaml`. This means:

- **No hardcoded model configuration**: All model-specific installation data
  lives in YAML manifests. Adding a new model requires only a new YAML file.
- **Manifest as single source of truth**: `backend/runtime/manifest_loader.py`
  is the single access point for model metadata. It exposes `load_manifest()`,
  `list_manifests()`, `get_provider_metadata()`, and `get_all_provider_metadata()`.
  For backward compatibility, it also exports generated compatibility views
  (`REPOS`, `HF_MODELS`, `PROVIDER_METADATA`) that are derived from YAML at
  import time — they are not hardcoded configuration.
- **Generic engine**: The installer and resolver use the manifest's fields
  (`dependencies.python`, `dependencies.extra`, `dependencies.native`,
  `dependencies.wheels`, `dependencies.local_extensions`, etc.) without
  any model-specific knowledge.

### Adding a new model

To add a new model, create `backend/runtime/manifests/<name>.yaml` with the
required keys (name, source, environment, dependencies, weights, hardware,
capabilities, preflight) and add a provider_name → filename entry to
`manifest_loader.py`'s `_PROVIDER_MANIFEST_MAP`. No Python-side
configuration changes are required.

## Dependency Resolver (`backend/runtime/dependency_resolver.py`)

The resolver is a generic execution engine. Per-model installation policy is declared
in `backend/runtime/manifests/*.yaml`; the resolver does not own a Python-side
per-model wheel/fallback/extra-dependency table. YAML is authoritative for the model
dependency contract, including native build policy and toolchain environment.

### Resolution Flow
1. Load the selected model manifest.
2. Read normal dependencies from `dependencies.python`.
3. Read native dependencies from `dependencies.native`.
4. Read optional/representation-required semantics from the same manifest.
5. Check the dependency's manifest `dependencies.wheels` entry.
6. If a real wheel target is declared and compatible, install the wheel.
7. For VCS dependencies, only a direct `.whl` target can substitute the Git source.
8. If no verified wheel target exists, evaluate manifest-driven fallbacks.
9. If a native dependency still needs installation, apply the non-interactive build policy.
10. Use `dependencies.local_extensions` for local/native sources that require a separate acquisition step.
11. Report truthful `ready`, `partial`, `skipped`, and `failed` states.

### Manifest-Owned Installation Data
All model-specific installation configuration belongs in YAML:

```yaml
source:
  repo: "https://..."
  ref: "main"
  submodules: true
  local_dir: "TRELLIS"

dependencies:
  python:
    - "transformers"
  extra:
    - "accelerate>=0.34.0"
  native:
    - "..."
  wheels:
    package-name:
      available: true
      mode: "pypi"
      # or direct_url_template / index
  fallbacks:
    package-name:
      - "pypi"
  optional:
    - "flash-attn"
  representation_required:
    - "..."
  local_extensions:
    package-name:
      path: "extensions/..."
      hf_dataset: "owner/dataset"

weights:
  primary:
    repo: "owner/repo"
  size_estimate_gb: 3
  allow_patterns: []
  ignore_patterns: []
```

`source.local_dir` is the canonical checkout name. `source.repo/ref/submodules` controls
repository acquisition. `weights` controls weight acquisition. `dependencies.extra`
controls additional Python packages that are required by the provider but absent from
the upstream repository requirements. No equivalent model-specific Python dictionary
should be added to `installer.py` or `dependency_resolver.py`.

### Key Functions
- `resolve_dependencies(repo_dir, manifest)` — discover and classify deps
- `check_wheel_available(dep, manifest, py_ver, cuda_ver, torch_ver)` — returns a `WheelCheckResult` (v4.3.0+) with explicit `available`, `source`, `is_direct_wheel`, `reason`, and `is_vcs_spec` fields. The previous `str | None` return collapsed four distinct states (artifact exists / matches env / installable / install succeeded) into a single boolean and caused false-positive "wheel found" results.
- `normalize_py312_pin(spec)` — rewrite Py3.12-incompatible pins or return None to drop
- `install_resolved_deps(deps, venv_python, repo_dir, ...)` — execute wheel-first install with the three-tier non-interactive policy
- `_is_vcs_spec(spec)` — detect VCS dependencies (git+http://, git+ssh://, etc.)

### Manifest Wheel Policy
the manifest's `dependencies.wheels` maps native packages (torch-cluster, flash-attn, pytorch3d, spconv, etc.) to wheel availability per (py_ver, cuda_ver). Single source of truth — add entries as packages gain wheels for new versions.

### Optional vs Representation-Required vs Required (v4.3.0+)

The resolver distinguishes three classes of native dependency. The classification
reflects application semantics, not build convenience:

| Class | Sets | Examples | On wheel failure + non-interactive |
|-------|------|----------|-------------------------------------|
| Truly optional (alternative) | the manifest's `dependencies.optional` | `flash-attn`, `xformers` | Skip cleanly |
| Representation-required | the manifest's `dependencies.representation_required` | `nvdiffrast`, `kaolin`, `diffoctreerast`, `vox2seq`, `diff-gaussian-rasterization` | Attempt build if CUDA toolkit; on failure, capability is marked unavailable |
| Fully required | (neither set) | `spconv-cu118` (for sparse voxel) | Attempt build if CUDA toolkit; on failure, fail the install |

A package is "representation-required" if TRELLIS uses it for a specific 3D
output format (mesh, Gaussian splat, structured latent, sparse voxel). These
are not "nice-to-have" — they enable specific outputs. Marking them optional
would silently disable representations.

### In-Process Torch ABI Constraint (v4.3.0+)

All local providers execute in-process in the backend Python interpreter.
Python's dynamic linker loads a single copy of `libtorch` into the backend
process. If a per-model venv's torchvision registers C++ operators against a
different torch build than the one already loaded in the backend, inference
crashes with `RuntimeError: operator torchvision::nms does not exist`.

Model manifests remain authoritative for model-specific Python, native, wheel, optional,
and build configuration. A separate process-level Torch ABI constraint remains deliberate:
all local providers run in one backend process, so each model venv must mirror the backend's
loaded torch/torchvision/torchaudio build. `_backend_torch_stack()` reads that installed
stack and prevents a per-model environment from loading a conflicting libtorch build.
The manifest's `environment.torch` and `environment.cuda` fields are therefore audited as
upstream/model compatibility metadata rather than copied into Python-side dependency tables.
Do not introduce per-model hard-coded Torch installation logic without process isolation.

### Manifest Contract Corrections (v4.5.2)

- `dependencies.attention_backend.one_of` is read from the nested YAML dependency section.
- Global `dependencies.build_env` values are honored for native source builds and override process defaults.
- VCS subdirectory resolution initializes its match state on every branch, including local-extension paths.
- TRELLIS `shallow_clone` is stored under `dependencies.build_flags`, the section consumed by the resolver.

### VCS Dependency Wheel Substitution (v4.3.1+)

For VCS dependencies (e.g. `git+https://github.com/JeffreyXiang/diffoctreerast.git`),
uv's `--find-links` flag does **not** substitute a wheel for the VCS spec — it only
tells uv where to look for *transitive dependency* wheels. The main package is
always cloned and built from source.

The only valid wheel substitution mechanisms for VCS specs are:

1. **Direct `.whl` URL** — generated from the manifest's `dependencies.wheels` `direct_url_template`
   with a pinned version. uv installs the `.whl` file directly, ignoring the VCS spec.
2. **PyPI** — if the package is published on PyPI, uv resolves it from there.

An `index` URL in the manifest's `dependencies.wheels` (e.g. a GitHub Releases landing page) is
**not** a valid wheel target for a VCS spec. The resolver now detects this and
returns `available=False` with a clear `reason`, so the dep falls through to the
source-build path.

**Behavior:**

| Dependency class | Compat table entry | `check_wheel_available` result | Install path |
|------------------|---------------------|-------------------------------|--------------|
| Non-VCS, custom index (e.g. `kaolin`) | `index` URL | `available=True, source=index` | Install with `--find-links` |
| Non-VCS, direct .whl template (e.g. pinned `flash-attn`) | `direct_url_template` | `available=True, is_direct_wheel=True` | Install the `.whl` URL directly |
| Non-VCS, PyPI (e.g. `spconv-cu118`) | (no entry, or pypi) | `available=True, source=pypi` | Install from PyPI |
| VCS, real direct wheel (e.g. `nvdiffrast`) | `direct_url_template` (no {version} needed) | `available=True, is_direct_wheel=True` | **Direct wheel install** |
| VCS, index-only (e.g. `diffoctreerast`) | `index` URL | `available=False, reason="VCS spec with index-only..."` | **Source build** (per policy) |
| VCS, no compat entry | (no entry) | `available=False, reason="VCS spec with no compat table entry..."` | **Source build** (per policy) |

**Fallback handling:** For VCS specs, `_get_fallback_sources()` filters out
index-page fallbacks (they are not real wheel targets). PyPI is kept but the
caller skips it for VCS specs (it would just clone the Git repo again).

**Why this matters:** Previously, the resolver logged "Wheel found" for
`diffoctreerast` and then ran `uv pip install --find-links <releases-page>
git+https://...diffoctreerast.git`, which cloned the Git repo and built from
source. The logs were misleading. The new logs clearly distinguish:

- `"Verified wheel target for diffoctreerast: direct .whl URL"` — real wheel install
- `"No verified wheel for diffoctreerast: VCS spec with index-only wheel source...; source build required"` — honest

### Local Extension Resolution (v4.3.2+)

Some model repos (e.g. TRELLIS) expect local extension directories that are
not part of the git clone. For example, TRELLIS's `extensions/vox2seq` must
be acquired separately from a HuggingFace dataset
(`argojuni0506/TRELLIS-3D`).

The resolver handles this via the manifest's `dependencies.local_extensions`, which now stores a
tuple `(relative_path, hf_dataset_source)`:

```python
manifest `dependencies.local_extensions` = {
    "vox2seq": ("extensions/vox2seq", "argojuni0506/TRELLIS-3D"),
}
```

When the local extension is not found in the cloned repo, the resolver
attempts to fetch it from the configured HF dataset. If the fetch also
fails, the dep is marked `capability_degraded` (not silently skipped) so
the runtime health correctly reflects that the structured latent capability
is unavailable.

### Git Subdirectory Source Resolution (v4.3.2+)

VCS dependencies with `#subdirectory=` (e.g.
`git+https://github.com/autonomousvision/mip-splatting.git#subdirectory=submodules/diff-gaussian-rasterization`)
require cloning the full repo and installing from the subdirectory path. The
resolver:

1. Uses **full clone** (not `--depth 1`) with `--recurse-submodules` for
   reliability.
2. Verifies the subdirectory exists after clone.
3. Verifies the subdirectory contains a Python package definition
   (setup.py, pyproject.toml, or setup.cfg) before attempting install.
4. If any check fails, the dep is marked `capability_degraded`.

### diso Wheel Classification (v4.3.2+)

`diso` is explicitly listed in the manifest's `dependencies.wheels` with `wheel_available=False`.
PyPI only provides sdist (source distribution) for all versions (0.1.0–0.1.4),
so the resolver now performs a genuine wheel-first check and reports
"No compatible prebuilt wheel verified for diso" before evaluating the
source-build policy, instead of silently skipping the wheel lookup.

### nvdiffrast Direct Wheel Install (v4.3.3+)

`nvdiffrast` is a VCS dependency (`git+https://github.com/NVlabs/nvdiffrast.git`)
that has real prebuilt wheels hosted on GitHub Releases
(`MiroPsota/torch_packages_builder`). The index page at
`miropsota.github.io/torch_packages_builder/nvdiffrast/` lists 402 `.whl` files;
their actual download URLs point to GitHub Releases assets.

The resolver now uses a `direct_url_template` for `nvdiffrast` that constructs
the exact wheel URL from the runtime's torch, CUDA, and Python versions. The
wheel filename embeds the torch+CUDA version in the local version identifier
(e.g. `nvdiffrast-0.4.0+253ac4fpt2.5.1cu124-cp310-cp310-linux_x86_64.whl`),
so the template uses `{torch}`, `{cuda}`, and `{python_nodot}` placeholders
instead of a pinned `{version}`.

Result: `nvdiffrast` installs the prebuilt wheel directly — no Git clone, no
source compilation.

**diffoctreerast remains on source-build path:** Its configured releases page
(`iiiytn1k/sd-webui-some-stuff/releases`) returns HTTP 404 — no wheel artifact
exists there. Source build is the correct and only path.

## Component-Level State Machine

Fine-grained states for UI status reporting:

| Component | States |
|-----------|--------|
| `RepoState` | missing \| ready \| failed |
| `EnvState` | missing \| creating \| ready \| failed |
| `DepsState` | pending \| installing \| ready \| partial \| failed |
| `NativeState` | not_required \| pending \| checking_wheel \| wheel_found \| wheel_installed \| build_pending \| build_running \| ready \| skipped \| failed |
| `WeightsState` | missing \| downloading \| verifying \| ready \| incomplete \| failed |
| `ModelState` | not_ready \| partial \| ready \| blocked \| failed |

**MODEL_READY requires**: repo=ready AND env=ready AND deps=ready AND (native=ready OR wheel_installed OR not_required) AND weights=ready AND preflight=passed.

## Storage Contract

Weight storage has a single canonical location:

- **CANONICAL**: `third_party/<repo>/weights/` — per-model, resolved via `StorageConfig.get_model_weights_dir(repo_name)`. This is the ONLY location for final model weights.
- **LEGACY**: `third_party/weights/` — centralized, deprecated. Detected for migration only; new downloads NEVER target this path.
- **HF CACHE**: `third_party/.hf_cache/` — shared download cache, NOT final storage.

Legacy weights are auto-migrated to per-model location on first access. See `POST /api/v1/runtime/migrate-legacy-weights` for explicit migration.

## New API Endpoints (v4.1+)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/runtime/prepare-runtime` | Stage A only — clone repos, create venvs, install deps. No weights. |
| POST | `/api/v1/runtime/download-weights` | Stage B only — download weights for already-prepared runtimes. |
| GET | `/api/v1/runtime/legacy-weights` | List weights in legacy `third_party/weights/` for migration UI. |
| POST | `/api/v1/runtime/migrate-legacy-weights` | Copy legacy weights to per-model location. Idempotent, read-only on source. |

All stage endpoints accept `{"models": ["model_id", ...]}` in the request body for targeted operation.

## Build Commands
```bash
npm run build    # Production build
npm run dev      # Development with Turbopack
npm run lint     # Lint check (eslint)
# Type-check via: npx tsc --noEmit   (no dedicated npm script)
```

## Adding New Features
1. Create API route in `app/api/v1/*`
2. Add corresponding hook in `hooks/`
3. Implement component in `features/`
4. Update docs in `Docs/`
5. Run `npx tsc --noEmit` + `npm run lint`

## WorldGen Model

WorldGen is a **dedicated workspace page** for text/image-to-3D scene generation via Gaussian Splatting. Unlike general providers (Hunyuan3D, Trellis, etc.), WorldGen runs in its own workspace page rather than the shared provider pool.

### Key Details
- **Provider ID**: `worldgen`
- **Provider class**: `WorldGenProvider`
- **Manifest**: `backend/runtime/manifests/worldgen.yaml`
- **Repo**: https://github.com/ZiYang-xie/WorldGen.git
- **Python**: 3.11
- **Torch**: 2.7.0
- **CUDA**: 12.4
- **VRAM**: 10 GB minimum, 24 GB recommended
- **Weights**: ~20 GB (LeoXie/WorldGen + FLUX.1-dev + auxiliary models)
- **Route**: `/workspace/worldgen` (dedicated page, not dynamic route)

### Architecture Notes
- WorldGen is registered in the provider map (`_PROVIDER_MAP` in `runtime/engine.py` and `_RUNTIME_PROVIDER_MAP` in `app/core/providers/registry.py`) for capability gating
- It uses the same manifest-driven installation pipeline as other models (Stage A: runtime, Stage B: weights)
- The workspace page renders via `WorkspaceShell` with `WorldGenToolPanel` as the left tool panel
- WorldGen is excluded from the model selectors in GeneratePanel and TexturePanel
- WorldGen page shows a status pill instead of a model selector (single model, no selection needed)
- `app/workspace/worldgen/page.tsx` renders `<WorkspaceShell />` directly (no redirect loop)

### Generation Modes
- **Text-to-World**: Generate 3D scenes from text descriptions
- **Image-to-World**: Generate 3D scenes from reference images

### Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `mood` | string | Scene mood/atmosphere |
| `shape` | string | Shape complexity |
| `style` | string | Visual style preset |
| `preset` | string | Generation preset |
| `resolution` | string | Output resolution |
| `seed` | integer | Random seed for reproducibility |
| `guidance` | float | Guidance scale |
| `size` | string | Scene size |
| `density` | float | Object density |

## Frontend Patterns

### Manifest-Driven Model Selection

The model selector is fully manifest-driven — no hardcoded model lists:

```typescript
// hooks/useManifestModels.ts
const { meshCapableModels, textureCapableModels, worldgenModel } = useManifestModels();
```

- `meshCapableModels`: Models with `supports_image_to_3d` OR `supports_text_to_3d` + `available`
- `textureCapableModels`: Models with `supports.texture_generation` + `available`
- `worldgenModel`: WorldGen model (excluded from other selectors)

### Status Pills

Each tool panel header shows a status pill indicating model availability:
- **Green "Ready"**: Model is available and weights are present
- **Amber "Weights missing"**: Model installed but weights not downloaded
- **Amber "Model not installed"**: Model not installed
- **No pill**: Everything is fine

### Responsive Design

The workspace uses `md:` breakpoints for responsive behavior:
- **Desktop (md+)**: Fixed 58px left rail, 264px left panel, 196px right panel
- **Mobile (<md)**: Left navigation becomes a slide-out drawer; panels become full-screen overlays
- All desktop behavior is preserved exactly

## Caching Patterns (v4.6.0+)

### In-Memory Cache with TTL

The backend uses an in-memory caching layer with configurable TTL per endpoint:

```python
from functools import wraps
import time

_cache = {}

def cached(ttl_seconds: int):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            key = f"{func.__name__}:{args}:{kwargs}"
            now = time.time()
            if key in _cache:
                result, expiry = _cache[key]
                if now < expiry:
                    return result
            result = await func(*args, **kwargs)
            _cache[key] = (result, now + ttl_seconds)
            return result
        return wrapper
    return decorator
```

### Cache Configuration

| Endpoint | TTL | Rationale |
|----------|-----|-----------|
| `/api/v1/system/info` | 30s | System info changes slowly |
| `/api/v1/system/gpu` | 10s | GPU telemetry updates frequently |
| `/api/v1/runtime/status` | 5s | Status changes rapidly |
| `/api/v1/runtime/health` | 10s | Health checks are expensive |
| `/api/v1/pipelines` | 30s | Pipeline config is static |

### Manual Cache Invalidation

```
POST /api/v1/system/cache/clear
```

Clears all cached entries. Called after configuration changes or model installation.

### Automatic Cache Invalidation (v4.6.1+)

The backend now automatically invalidates affected cache entries when model state changes:

- **Model uninstall**: Invalidates `models_list`, `model_status_{id}`, and `list_models*` keys
- **Model repair**: Same invalidation as uninstall
- **Cache function**: `invalidate_prefix(prefix)` removes all keys starting with a prefix

### LRU Eviction (v4.6.1+)

The cache now uses an `OrderedDict`-based LRU eviction strategy capped at 256 entries.
This prevents unbounded memory growth in long-running processes. When the cache is full,
the least recently used entry is evicted to make room for new entries.

### Frontend Integration

- **`useRealtime` hook**: WebSocket client with auto-reconnect; falls back to polling
- **`useSSE` hook**: SSE client for system stream; falls back to polling
- Polling intervals: 60s (status), 10s (GPU chart)
- **Client-side dedup**: `lib/requestDedup.ts` coalesces concurrent requests with TTL caching and periodic eviction

## Client-Side File Validation

The `features/new-workspace/lib/fileValidation.ts` module provides client-side validation for 3D file uploads:

- **GLB magic bytes**: Validates the `glTF` header (bytes `0x67, 0x6c, 0x54, 0x46`)
- **GLB structure**: Checks version, total length, and chunk headers
- **Truncation detection**: Compares declared file size against actual size
- **Format-specific checks**: Basic validation for OBJ, STL, PLY formats

To add a new validation rule, extend the `validateGlbStructure` function or add a new format-specific validator following the existing pattern.

## Upload Diagnostics Tool

The `features/new-workspace/lib/uploadDiagnostics.ts` module provides debugging capabilities for upload failures:

- Captures request details (URL, headers, FormData entries)
- Captures response details (status, headers, body)
- Detects HTML error pages (token errors, redirects)
- Provides actionable recommendations

The `UploadDiagnosticModal.tsx` provides a UI for invoking diagnostics. To use it, import and render the modal with the file you're attempting to upload.

## Asset Upload & Persistence

### Upload Flow

1. User selects file in `RightAssetsPanel` (assets panel)
2. Frontend validates file type/size/client-side structure (`fileValidation.ts`)
3. File uploads to backend via `apiClient.uploadFile()` (XHR with progress)
4. Backend stores file in `storage_local_path/models/` or `uploads/`
5. Backend generates thumbnail for GLB/GLTF (`mesh_processor.py:render_thumbnail`)
6. Backend returns `{ url, thumbnail_url, mesh_stats }`
7. Frontend creates a `ModelAsset` and adds it via `addAsset()`
8. Asset appears immediately in the assets panel

### Asset Persistence

`WorkspaceContext.refreshHistory()` polls generation history every 60s. It rebuilds the assets array as `[...newHistory, ...persistedLocals]`. **Uploaded assets must include `source.type: 'upload'` or `'input'`** so they survive the rebuild. Assets with only `source.localUrl` are local-preview-only and also persist.

```typescript
// WorkspaceContext.tsx — refreshHistory filter
const local = prev.filter(a =>
  a.source?.localUrl ||
  a.source?.type === 'upload' ||
  a.source?.type === 'input'
);
return [...newParsed, ...local];
```

### Image Upload

Images for 3D generation are uploaded via the generation panel (NOT the assets panel). The flow:
1. Frontend uploads to `POST /api/v1/upload/image`
2. Backend saves to `storage_local_path/uploads/` with UUID filename
3. Backend returns `{ url }` pointing to `/api/v1/upload/uploads/{filename}`
4. Image URL is used for generation — it stays in backend storage only
5. Images do NOT appear in the assets panel (by design — keeps the panel focused on 3D models)

The assets panel's `fetchUploadedAssets` only fetches models from `/api/v1/upload/assets`, skipping images entirely.

### Thumbnail Generation

- **GLB/GLTF**: Backend renders a 3D preview via trimesh, falls back to PIL-generated placeholder
- **OBJ/FBX/STL**: No thumbnail generated (by design) — frontend shows format badge fallback
- **Images**: The image URL itself serves as the thumbnail

### URL Resolution

- `/static/models/...` and `/static/thumbnails/...` → served by backend `/static` mount, proxied via `app/static/[...path]/route.ts`
- `/api/v1/upload/uploads/...` → served by backend `download_uploaded_image` endpoint, proxied via `app/api/v1/[...path]/route.ts`

## Storage Path

The storage path is resolved from the backend module location, NOT from CWD:

- **Config**: `backend/app/config.py` — `storage_local_path` defaults to absolute `backend/storage/`
- **Why**: The backend can be launched from `backend/` directory (via `cd backend && uvicorn`) or from project root. Using `Path(__file__).resolve().parent / "storage"` ensures the path is always correct regardless of launch directory.
- **Subdirectories**: `models/`, `uploads/`, `thumbnails/`, `exports/`, `images/`
- **Scripts**: `start.sh` and `colab.sh` both create `backend/storage/` at project root level

## Database Overload Prevention

The frontend has multiple polling loops that can overwhelm the backend in resource-constrained environments (Colab). All admin tab polling loops include `document.hidden` guards — they pause when the browser tab is in the background.

| Component | Endpoint | Interval | Tab-Aware |
|-----------|----------|----------|-----------|
| WorkspaceContext | runtime/status | 20s | ✅ |
| WorkspaceContext | generation/history | 60s | ✅ |
| RuntimeTab | runtime/status + logs | 10s | ✅ |
| OverviewTab | admin/overview | 15s | ✅ |
| QueueTab | admin/queue/status | 15s | ✅ |
| JobsTab | admin/jobs | 30s | ✅ |
| StorageTab | system/storage | 30s | ✅ |
| GpuVramLineChart | runtime/status | 15s | ✅ |
| HealthTab | models/health/all | 30s | ✅ |

This reduces total API calls from ~100/min to ~25/min when tab is active, and ~0 when backgrounded.

## Colab Keep-Alive

Google Colab kills background processes (nohup, sleep) during idle cleanup. The old `nohup curl` keepalive was unreliable.

**Current approach:**
1. **Browser JS keepalive** (primary): Auto-injects via IPython on startup — simulates mouse/keyboard activity every 60s
2. **Service watchdog** (secondary): Background loop checks services every 30s, restarts any that died

If IPython is unavailable, run manually:
```python
exec(open('scripts/colab_keepalive_js.py').read())
```

## Compare View

The compare view consists of two components:

- **`Panels/ComparePanel.tsx`**: Left panel with asset selectors, view mode toggles, and property diff display
- **`Viewport/CompareViewport.tsx`**: Three.js viewport for rendering models in compare mode

To extend the compare view:
- Add new property diffs in the `PropertyDiff` interface
- Add new view modes in the `viewMode` state
- Add new shading modes in the `ShadingMode` type

## 3D Quality Pipeline & Mesh Optimization

The `backend/app/core/mesh_optimizer.py`, `mesh_processor.py`, and Blender post-processing pipeline provide game-ready asset preparation:

- **Master Mesh Retention**: Untouched raw output is saved as `source.glb`, enabling non-destructive re-optimization.
- **Safe Component Pruning**: Detached geometry components with ≥0.5% vertices or ≥15 vertices are preserved (saving ears, horns, tails, accessories).
- **UV Preservation**: Preserves AI provider UV layouts and textures, preventing accidental overwrite by smart project unwrap.
- **Decimation & Platform Profiles**: Reduces polygon count to target platform budget (`mobile`: 8k, `low`: 15k, `medium`: 30k, `high`: 60k, `cinematic`: 100k) with detail preservation.
- **Multi-Tier LOD Generation**: Generates LOD0 (source), LOD1 (50%), LOD2 (25%), and LOD3 (12.5%) cascades.
- **Physics Collision Mesh**: Generates convex hulls (`collision.glb`) for physics engines.
- **Geometry Diagnostics & QA Scoring**: Calculates non-manifold edges, surface winding consistency, component counts, UV layout validity, and composite `game_ready_score` (0–100).
- **Project Export API**: `POST /api/v1/project/export` exports single variants or structured ZIP archives ({name}/Source, GameReady, LODs, Collision, QA).

## Settings Persistence (v4.7.2+)

Settings are stored in PostgreSQL and cached in Redis:

```python
from app.models.setting import Setting

# Read setting (with Redis cache)
value = await Setting.get(session, "default_provider", fallback="hunyuan3d-2.1")

# Write setting (invalidates Redis cache)
await Setting.set(session, "default_provider", "trellis")
```

## Rate Limiting (v4.7.2+)

The generation endpoint uses Redis-backed sliding-window rate limiting:

```python
from app.api.v1.generation import _check_rate_limit

# In your endpoint:
await _check_rate_limit(request, max_requests=10, window_seconds=60)
```

## Celery Install Tasks (v4.7.2+)

Long-running install operations use Celery for durability:

```python
from app.workers.installation_workers import prepare_runtime, download_weights

# Dispatch as Celery task
task = prepare_runtime.delay("hunyuan3d-2.1")
print(f"Task ID: {task.id}")
```

## Security Best Practices (v4.4.9+)

When contributing to AI 3D Studio, follow these security guidelines:

### Command Execution
- **Use allowlists, never blocklists**: The terminal/execution endpoints use an allowlist of approved commands. Blocklists are bypassable; allowlists are not by default.
- **Validate all user input**: Never pass unsanitized user input to shell commands or system calls.

### File Handling
- **Path traversal protection**: Always resolve paths with `.resolve()` and validate they stay within the intended directory. The static proxy (`app/static/[...path]/route.ts`) implements this pattern.
- **Streaming uploads**: Use chunked streaming for file uploads to prevent memory exhaustion. See `backend/app/api/v1/upload.py` for the implementation.
- **Client-side validation**: Validate file formats client-side (magic bytes, structure) as a first line of defense, but always re-validate server-side.

### API Security
- **CORS origin restriction**: Never use wildcard (`*`) CORS origins in production. Configure environment-specific origins via `CORS_ORIGINS`.
- **Request timeouts**: All proxy routes must enforce timeouts to prevent slowloris and resource exhaustion attacks.
- **SSE cleanup**: Always close Server-Sent Events connections on timeout to prevent connection leaks.

## Performance Best Practices (v4.4.9+)

### Frontend
- **Memoize context selectors**: Split large React Context providers into smaller memoized selectors to prevent cascading re-renders. See `WorkspaceContext.tsx` for the pattern.
- **Blob URLs for large files**: Use blob URLs to load models into Three.js, eliminating redundant network fetches.
- **Animation loop gating**: Stop animation loops when no work is being done (no model loaded) to avoid unnecessary GPU computation.

### Backend
- **Chunked streaming**: Stream large file operations in chunks rather than buffering in memory.
- **Connection cleanup**: Always close SSE and WebSocket connections on timeout or client disconnect.
- **Lazy initialization**: Use lazy initialization patterns for expensive resources, ensuring all references are properly scoped.

## Agent Skills Suite (`.agents/skills/`)

The workspace is configured with modular agent skills for frontend development, UI/UX architecture, performance optimization, and testing:

- **`ui-ux-pro-max`**: Design intelligence engine covering 79 UI styles, 192 product palettes, 74 font pairings, 119 UX guidelines, and 25 chart types. Run search via `python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --stack nextjs`.
- **`ui-styling` & `design-system`**: Tailwind styling utilities, design token validators, and shadcn component configuration helpers.
- **`vercel-react-best-practices`**: 70 rules prioritized by impact covering waterfall elimination, bundle optimization, and server action safety.
- **`vercel-composition-patterns`**: React 19 scalable composition patterns (compound components, context lifting, prop explosion prevention).
- **`frontend-design`**: Visual direction guidelines ensuring distinctive, non-generic, production-grade interface aesthetics.
- **`shadcn-component-discovery` & `shadcn-component-review`**: Upstream discovery across shadcn registries and post-implementation audits for spacing, styling, and slot consistency.
- **`webapp-testing`**: Playwright headless browser test execution and UI visual regression verification.
- **`web-design-guidelines`**: Web interface guideline conformance checks and automated accessibility inspection.
