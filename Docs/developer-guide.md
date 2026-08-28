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
per-model wheel/fallback/extra-dependency table.

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

**Therefore the backend torch stack is authoritative.** The manifests'
`environment.torch` and `environment.cuda` fields document the upstream-tested
configuration but are NOT installation targets. `_backend_torch_stack()` reads
the backend's actual installed torch via `importlib.metadata`, extracts the
`+cuXXX` local version tag, and mirrors the exact build into every per-model
venv. Extra dependency installs (`hy3dgen`, `diffusers`, `accelerate`, etc.)
also include this torch pin to prevent transitive resolution from upgrading
torch to an ABI-incompatible version (e.g. 2.13.0).

Manifest torch fields are preserved as **compatibility metadata** — they
describe what the upstream repo tested with, not what will be installed.

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

## Client-Side File Validation

The `features/new-workspace/lib/fileValidation.ts` module provides client-side validation for 3D file uploads:

- **GLB magic bytes**: Validates the `glTF` header (bytes `0x47, 0x6c, 0x54, 0x46`)
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

## Compare View

The compare view consists of two components:

- **`Panels/ComparePanel.tsx`**: Left panel with asset selectors, view mode toggles, and property diff display
- **`Viewport/CompareViewport.tsx`**: Three.js viewport for rendering models in compare mode

To extend the compare view:
- Add new property diffs in the `PropertyDiff` interface
- Add new view modes in the `viewMode` state
- Add new shading modes in the `ShadingMode` type

## Auto-Optimize Mesh

The `backend/app/core/mesh_optimizer.py` module provides post-generation mesh optimization:

- **Decimation**: Reduces polygon count to target (default 30,000 triangles)
- **UV fixing**: Repairs overlapping UVs and fills UV islands
- **Normal recalculation**: Recomputes vertex normals after optimization

Configuration is exposed via the GeneratePanel settings (`auto_optimize`, `target_polycount`, `preserve_details`).

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
