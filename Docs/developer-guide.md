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

## Dependency Resolver (`backend/runtime/dependency_resolver.py`)

Replaces the old "drop from requirements" pattern with a wheel-first resolver. No network calls — deterministic, works offline.

### Resolution Flow
1. Discover dependency files (requirements.txt, pyproject.toml, setup.py, manifest)
2. Classify each dependency: `NORMAL`, `NATIVE`, `BUILD_ONLY`, or `OPTIONAL`
3. For `NATIVE` deps: check static `WHEEL_COMPAT_TABLE` for prebuilt availability
4. If wheel exists → install it (no compilation)
5. If no wheel → interactive prompt: build from source? [y/N]
   - YES → build inside model venv
   - NO → skip, mark SKIPPED, continue

### Key Functions
- `resolve_dependencies(repo_dir, manifest)` — discover and classify deps
- `check_wheel_available(dep, py_ver, cuda_ver, torch_ver)` — check static table for wheel
- `normalize_py312_pin(spec)` — rewrite Py3.12-incompatible pins or return None to drop
- `install_resolved_deps(deps, venv_python, repo_dir, ...)` — execute wheel-first install

### Static Wheel Table
`WHEEL_COMPAT_TABLE` maps native packages (torch-cluster, flash-attn, pytorch3d, spconv, etc.) to wheel availability per (py_ver, cuda_ver). Single source of truth — add entries as packages gain wheels for new versions.

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
