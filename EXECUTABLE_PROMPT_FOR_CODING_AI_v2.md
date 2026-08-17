# EXECUTABLE PROMPT: AI3DStudio Installation Contract Refactor

================================================================================
1. ASSIGNED DOMAIN-EXPERT PERSONA
================================================================================

**You are a PyTorch/FastAPI Installation & State Management Architect.**

Your expertise:
- Multi-model dependency resolution (different repos, different CUDA requirements)
- State machine design for reliable model lifecycle management
- Preflight/health-check patterns for ML pipelines
- Background task orchestration (Celery + async progress tracking)

**Your constraint**: Do NOT redesign the entire project. Surgical fixes only within scope.

================================================================================
2. MANDATORY STARTUP & INITIALIZATION CHECK
================================================================================

**BEFORE modifying any code:**

1. Run the startup/status check NON-INTERACTIVELY:
   - `cd /AI_Studio-main && printf '\n' | bash manager.sh status 2>&1 | head -80`
   - If `manager.sh status` is interactive in this checkout, do NOT wait for input indefinitely; use the non-interactive equivalent or inspect the underlying status path directly.
   - Verify backend starts WITHOUT errors
   - Confirm entrypoint is `backend/app/main.py` + `manager.sh` orchestration
   - Check that `GET /api/v1/admin/install/status` returns valid JSON

2. Inspect startup flow:
   - `manager.sh start` → how does it invoke FastAPI backend?
   - `backend/runtime/__main__.py` → any initialization hooks?
   - `backend/app/config.py` → where do settings load?
   - Confirm: no blocking imports that would prevent boot

3. Check current installer state:
   - Run: `python3 -c "from backend.runtime.installer import get_install_status; import json; print(json.dumps(get_install_status(), indent=2))" 2>&1 | head -80`
   - Note which models show `"installed": true` but should be marked "partial"
   - Verify storage paths exist: `/storage/third_party/`, `/storage/weights/`

**STOP if any check fails.** Report error and block fixes until resolved.

================================================================================
3. CONTEXT-READING RULES (MANDATORY)
================================================================================

**DO NOT scan the entire 300-file codebase.**

**DO read in this order:**
1. `INSTALLATION_CONTRACT_FIX_PLAN.md` (provided; root-cause analysis)
2. `backend/runtime/installer.py` (current implementation; lines 1-200)
3. `backend/app/api/v1/admin.py` (install endpoints; focus on `/install/provider`)
4. `Docs/architecture.md` (section: "Provider registry + state machine")
5. Specific file snippet provided in each fix step

**DO NOT read:**
- Entire codebase for "context"
- UI files unless explicitly asked
- Non-relevant backend services

**IF uncertain about a module, ask explicitly. Don't guess.**

**MANDATORY IMPLEMENTATION GUARDRAILS discovered during verification:**
- The model runtime uses per-model `.venv` environments under the model repository. Preflight MUST execute against the target model's own interpreter/environment; importing packages only from the backend interpreter is not sufficient.
- Do NOT make `READY` depend on a placeholder/stub preflight that returns `passed=True`. Until an actual check is implemented, the preflight state must remain `NOT_IMPLEMENTED`/`PENDING` and `READY` MUST NOT be granted.
- Do NOT treat `flash-attn` and `xformers` as universally mandatory TRELLIS dependencies. Model manifests must support mutually exclusive/alternative backends where upstream supports alternatives.
- Hunyuan3D 2.1 has capability-specific requirements: shape generation and texture/PBR generation must not be modeled as one global `native_build_required` boolean. Texture/PBR setup includes native build steps from upstream.
- A repository mapping change MUST propagate consistently to provider metadata, storage/venv resolution, weight paths, and provider lookup; changing only `REPOS` is insufficient.
- Native builds MUST use a dedicated installation queue/worker or equivalent isolation from the generation queue. Inspect the current Celery timeout/concurrency before adding a long-running native build task.
- Native-build task ownership/locking MUST survive the HTTP request that queued the task. Do not release the repository mutation lock merely because the request returned.
- Capability readiness MUST support `READY`, `PARTIAL`, and `BLOCKED` per capability/component. A missing capability-specific auxiliary asset must not unnecessarily block unrelated capabilities.


================================================================================
4. STEP-BY-STEP DYNAMIC TO-DO LIST
================================================================================

### PHASE 1: Create Model Manifests (2 models, validate pattern)

**TODO 1.1: Hunyuan3D 2.1 Manifest**
- Create: `backend/runtime/manifests/hunyuan3d_21.yaml`
- Content structure:
  ```yaml
  name: hunyuan3d-2.1
  label: "Hunyuan3D 2.1"
  upstream_repo: "https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git"
  upstream_weights: "tencent/Hunyuan3D-2.1"
  python_version: "3.10"
  torch_version: "2.5.1"
  cuda_required: "12.4"
  environment:
    python_version: "3.10"
    torch_version: "2.5.1"
    cuda_required: "12.4"
  dependencies:
    python:
      - "dependencies from upstream docs, NOT studio generic"
    imports:
      - "transformers"
      - "diffusers"
      - "torch"
  weights:
    primary: "tencent/Hunyuan3D-2.1"
    auxiliary: []
  capabilities:
    shape:
      enabled: true
      native_build_required: false
    texture_pbr:
      enabled: true
      native_build_required: true
      native_steps:
        - "upstream texture/custom rasterizer setup"
  vram_required_mb: 29000
  vram_low_vram_mb: 10240
  preflight_checks:
    - check_model_venv: true
    - import_packages: ["transformers", "diffusers", "torch"]
    - check_weights: true
    - check_cuda: true
    - load_weights: true
    - smoke_inference: true
  ```
- Validate: Load in Python without errors

**TODO 1.2: TRELLIS Manifest**
- Create: `backend/runtime/manifests/trellis.yaml`
- Differences from Hunyuan:
  - `git_submodules: true` (must init --recursive)
  - `vram_required_mb: 24000` as Studio target/recommended, not an invented upstream hard minimum
  - model manifest MUST support alternative attention backends (for example `flash-attn` OR `xformers`) rather than treating both as unconditionally mandatory
  - native dependencies must be represented separately from ordinary Python packages
- Validate: Structure matches Hunyuan + supports native-build fields

**TODO 1.3: Loader Validation**
- Create: `backend/runtime/manifest_loader.py`
- Implement:
  ```python
  def load_manifest(provider_name: str) -> dict:
      """Load manifest from YAML, validate schema, return dict."""
      # Load from manifests/ directory
      # Validate one canonical schema used by installer + preflight
      # Return parsed config
  ```
- Canonical schema MUST use one field naming convention. Do not create `requirements` in the manifest while preflight expects `requirements_packages`; use `dependencies.python` + `dependencies.imports` (or one equivalent canonical structure) everywhere.
- Validate: `load_manifest("hunyuan3d-2.1")` and `load_manifest("trellis")` succeed; `load_manifest("unknown")` raises a clear error

---

### PHASE 2: Refactor Installer State Machine

**TODO 2.1: Define State Enum & ComponentStatus**
- File: `backend/runtime/installer.py` (top, after imports)
- Add:
  ```python
  from enum import Enum
  from dataclasses import dataclass, field
  
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
      READY = "ready"
      PARTIAL = "partial"
      BLOCKED = "blocked"
      FAILED = "failed"
      ENV_FAILED = "env_failed"
      WEIGHTS_INCOMPLETE = "weights_incomplete"
      PREFLIGHT_FAILED = "preflight_failed"
      CUDA_INCOMPATIBLE = "cuda_incompatible"
      VRAM_INSUFFICIENT = "vram_insufficient"
      NOT_IMPLEMENTED = "not_implemented"
  
  @dataclass
  class ComponentStatus:
      name: str
      state: InstallState
      detail: str = ""
      last_error: str | None = None
  ```

**TODO 2.2: Refactor get_install_status()**
- File: `backend/runtime/installer.py::get_install_status()` (around line 1710)
- Replace:
  ```python
  # OLD
  status[name] = {"installed": repo_ok and weight_ok, ...}
  
  # NEW
  status[name] = {
      "state": "READY" or "BLOCKED",
      "components": {
          "repo": {"state": "ok", "path": "..."},
          "venv": {"state": "ok"},
          "weights": {"state": "ok"},
          "auxiliary_weights": [{"name": "RMBG-1.4", "state": "missing"}],
          "native_build": {"state": "pending", "eta_sec": 900},
          "preflight": {"state": "pending"},
          "capabilities": {
              "shape": {"state": "ready"},
              "texture_pbr": {"state": "blocked", "reason": "..."},
          },
          "cuda": {"state": "ok", "version": "12.4"},
          "vram": {"state": "ok", "required": 29000, "available": 40000},
      },
      "blocking_reason": "...",
      "installed": True/False,  # backward compat
  }
  ```
- Validate: Old `installed=true/false` field still present (backward compat for UI)

**TODO 2.3: Fix Repository Mappings**
- File: `backend/runtime/installer.py::REPOS` (line ~33)
- Change:
  ```python
  "Hunyuan3D-2.1": {  # NEW: separate entry
      "url": "https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git",  # FIXED
      "branch": "main",
      "requirements": "requirements.txt",
      "category": "3d_generation",
      "providers": ["hunyuan3d-2.1"],  # Only 2.1
  },
  "Hunyuan3D-2": {  # OLD: keep for backward compat
      "url": "https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git",
      ...
      "providers": ["hunyuan3d-2"],  # Only 2
  },
  ```
- Validate: Both entries exist, no collision in providers list.
- ALSO update any provider metadata, storage path resolution, model venv resolution, weight mapping, and provider lookup that still point `hunyuan3d-2.1` at the old `Hunyuan3D-2` repository. Do not patch `REPOS` alone.

---

### PHASE 3: Implement Preflight Module

**TODO 3.1: Create preflight.py**
- File: `backend/runtime/preflight.py` (new)
- Implement:
  ```python
  @dataclass
  class PreflightResult:
      passed: bool
      checks: dict  # {"import": ok, "load": ok, "inference": ok, "memory": {...}}
      error_detail: str = ""
      inference_time_ms: float = 0
      peak_memory_mb: float = 0
  
  async def run_preflight_for_provider(provider_name: str, hf_token: str = None) -> PreflightResult:
      """
      1. Import all required packages
      2. Load model from weights path
      3. Run 1 dummy inference
      4. Measure memory + timing
      5. Return result
      """
  ```
- Start simple: import-only test; expand to full inference in separate TODO

**TODO 3.2: Import-Only Preflight (MVP)**
- In `preflight.py::run_preflight_for_provider()`:
  ```python
  def _check_imports(manifest: dict, venv_python: str) -> tuple[bool, str]:
      """Check manifest-specified imports using the target model interpreter."""
      # Execute a small subprocess with venv_python so imports match the runtime environment.
      # Read package names from manifest["dependencies"]["imports"].
  ```
- Test: Call with hunyuan3d-2.1 manifest, verify it passes/fails correctly

**TODO 3.3: Model Load Test (defer to preflight refactor PR)**
- TODO: Full smoke test (load + inference) requires per-provider logic
- For now: stub with `return PreflightResult(passed=True, ...)`

---

### PHASE 4: Refactor install_provider() Entrypoint

**TODO 4.1: Update install_provider() signature**
- File: `backend/runtime/installer.py` (around line ~1500)
- Change:
  ```python
  def install_provider(
      name: str,
      hf_token: str | None = None,
      log_cb: Callable | None = None,
      allow_native_build: bool = False,  # ADDED
      skip_preflight: bool = False,       # ADDED
  ) -> dict:
  ```

**TODO 4.2: Refactor install_provider() flow**
- Sequence:
  ```python
  1. Load manifest → validate provider exists
  2. Clone repo (call existing clone_repo)
  3. Install deps (call existing install_repo_deps, honor native_build flag)
  4. Download weights (call existing download_weights, add auxiliary weight support)
  5. IF native_build: queue background task on a dedicated installation queue/worker (DON'T WAIT)
  6. Persist native-build task ownership/state before returning
  7. Run preflight only when the environment and all required native/auxiliary components are actually ready
  8. Return: {
       "success": True/False,
       "state": InstallState.READY / PARTIAL / BLOCKED,
       "components": {...},
       "native_build_task_id": "celery-uuid" if queued,
     }
  ```
- Keep all existing functions unchanged (clone_repo, install_repo_deps, download_weights)
- Only change orchestration logic

**TODO 4.3: Handle native-build flag**
- When `native_req and not allow_native_build`:
  - DO NOT skip required dependency setup silently
  - Queue the build on a dedicated installation worker/queue
  - Set state: `NATIVE_BUILD_PENDING` (not READY)
  - Persist task id + build ownership/lock before the HTTP request returns
  - Log: "Native build queued; model will be READY only after native build + preflight pass"
- Do NOT release the repository mutation lock merely because the request returns; the background build must own the lock/lease until completion or failure.
- Inspect current Celery timeout/concurrency before implementation. Native compilation must not use a 10-minute generation task timeout or block the normal generation queue.

---

### PHASE 5: Wire into Admin API

**TODO 5.1: Update admin /install/provider endpoint**
- File: `backend/app/api/v1/admin.py` (around line ~1614)
- No change to endpoint signature
- Change internal call:
  ```python
  result = install_provider(
      req.provider,
      hf_token=req.hf_token,
      log_cb=_log_cb,
      allow_native_build=False,  # Default: defer native build to background
      skip_preflight=False,
  )
  ```
- If result has `native_build_task_id`, log it

**TODO 5.2: Add /repair/provider endpoint** (defer to Phase 2 PR)
- TODO: Implement auto-repair flow
- For now: stub endpoint that returns `{"message": "not yet implemented"}`

---

### PHASE 6: Documentation Sync

**TODO 6.1: Update Docs/architecture.md**
- Section: "Installation States"
- Add:
  ```markdown
  ## New Installation State Machine (v4.0+)
  
  Models now report detailed component status instead of binary "installed".
  
  States: DISCOVERED → REPO_READY → ENV_READY → WEIGHTS_READY → PREFLIGHT_RUNNING → READY
  
  Blocking states: NATIVE_BUILD_PENDING, BLOCKED, FAILED
  
  See INSTALLATION_STATES.md for full reference.
  ```

**TODO 6.2: Create Docs/INSTALLATION_STATES.md**
- Reference page listing all states + component meanings
- Quick-reference table

**TODO 6.3: Update Docs/setup-guide.md**
- Add: "Troubleshooting" section
- Template: "TripoSG blocked on auxiliary weights — run: `curl -X POST /api/v1/repair/triposg`"

---

### PHASE 7: Validation & Test

**TODO 7.1: Startup Test**
- Run `bash manager.sh start` → wait 30sec
- Call: `curl http://localhost:8000/api/v1/admin/install/status`
- Verify:
  - All 8 models present
  - No model shows `"state": "unknown"` or error
  - At least 1 model shows `"state": "blocked"` (if native build is one)
  - All responses are valid JSON (no parse errors)

**TODO 7.2: State Transition Test**
- If hunyuan3d-2.1 is already installed:
  - Call: `POST /api/v1/admin/install/provider` with `{"provider": "hunyuan3d-2.1"}`
  - Poll: `GET /api/v1/admin/install/status` every 2sec
  - Verify state transitions: `env_creating` → `weights_downloading` → `preflight_running` → `ready`

**TODO 7.3: Blocking Test**
- For a native-build model (e.g., TRELLIS):
  - Call: `POST /install/provider` with allow_native_build=false
  - Verify: returns immediately with `state: "native_build_pending"`
  - Verify: `blocking_reason` is "Native CUDA build queued for background execution"

---

================================================================================
4A. VERIFIED IMPLEMENTATION SAFEGUARDS (ADDED)
================================================================================

1. MODEL-VENV PREFLIGHT
- The project uses per-model virtual environments. A backend-level `import torch` is NOT evidence that a provider's runtime environment is healthy.
- All dependency import checks MUST run through the target provider's `.venv/bin/python` (or equivalent interpreter).
- For actual model load tests, use the same environment/path resolution as the provider itself.

2. READY GATE
- `READY` requires all mandatory components plus a successful implemented preflight.
- `NOT_IMPLEMENTED`, `PENDING`, or `SKIPPED` preflight MUST NOT result in `READY`.
- `skip_preflight=True` may be used only for an explicit expert/debug path and MUST result in a non-ready state unless separately overridden by an existing project safety rule.

3. CAPABILITY-LEVEL STATE
- Support `READY`, `PARTIAL`, and `BLOCKED` for individual capabilities.
- Example: Hunyuan3D Mini shape can be READY while texture is BLOCKED because a paint checkpoint is missing.
- Do not globally block a provider when only an unrelated optional/capability-specific component is missing.

4. NATIVE BUILD WORKER ISOLATION
- Inspect existing Celery queues, worker concurrency, pool mode, and time limits before creating the task.
- Native compilation MUST run on an installation-specific queue/worker with an appropriate timeout and must not block generation/image queues.
- Persist task id and installation lease/lock ownership before returning the HTTP response.

5. REPO IDENTITY
- A provider's canonical repo/weight identity comes from the manifest.
- Any change to Hunyuan3D 2.1 repository mapping MUST update all consumers: provider metadata, repo path, venv path, weight path, provider loader, and status reporting.

6. UPSTREAM ACCURACY
- Do not convert upstream alternatives into mandatory dependencies.
- Do not hard-code package versions from memory if the repository's own requirements/setup files are available locally; read and use the upstream setup selected by the manifest.
- Keep Studio-specific VRAM/storage values clearly labeled as Studio target/recommended when they are not upstream hard minimums.

================================================================================
5. STRICT OUTPUT & TOKEN-OPTIMIZATION RULES
================================================================================

**ZERO conversational filler:**
- No "Sure, I'll help", "Here's the solution", "Let me explain"
- Start with code diffs immediately

**NO empty newlines or excessive whitespace:**
- Remove blank lines between function definitions (keep single newline)
- Compact docstrings to single line if possible

**Output ONLY:**
- Code diffs (old_str → new_str)
- Exact file paths (e.g., `backend/runtime/installer.py:line 1710`)
- Brief root-cause explanation (1-2 sentences max)

**Format example:**
```
backend/runtime/installer.py:33-40

-    "Hunyuan3D-2": {
+    "Hunyuan3D-2.1": {  # FIXED: separate entry for 2.1
-        "url": "https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git",
+        "url": "https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git",
         "branch": "main",

ROOT CAUSE: Repo mapping collision — 2.1 was aliased to wrong repo.
```

**DO NOT:**
- Print unchanged lines
- Include line numbers in actual code
- Re-explain the context

================================================================================
6. AUTOMATIC DOCUMENTATION SYNC (FINAL STEP)
================================================================================

**After ALL code fixes are applied, MANDATORY:**

1. **Update Docs/architecture.md**
   - Search: `## Provider registry`
   - Add subsection: `## Installation States (v4.0+)`
   - Copy from INSTALLATION_CONTRACT_FIX_PLAN.md section: "Correct Installation State Machine"

2. **Create Docs/INSTALLATION_STATES.md**
   - Copy full state machine diagram + descriptions
   - Add troubleshooting table

3. **Update Docs/setup-guide.md**
   - Add: "## Troubleshooting Models Not Ready"
   - Include examples for each blocking reason

4. **Update Docs/CHANGELOG.md**
   - Add entry: "v4.0: Installation contract refactor — detailed component states, manifest-driven installers, native-build background tasks"

5. **Verify all .md files compile without syntax errors**

================================================================================
7. VERIFICATION CHECKLIST (CI/CD)
================================================================================

After each TODO, run:

**TODO 1.x (Manifests)**
- [ ] `python3 -c "from backend.runtime.manifest_loader import load_manifest; load_manifest('hunyuan3d-2.1')"` succeeds
- [ ] `python3 -c "from backend.runtime.manifest_loader import load_manifest; load_manifest('trellis')"` succeeds

**TODO 2.x (State Machine)**
- [ ] Backend boots without error: `python3 backend/app/main.py` (Ctrl+C after 5sec)
- [ ] `GET /api/v1/admin/install/status` returns JSON with every real provider registered by the project (do not hard-code a model count)

**TODO 3.x (Preflight)**
- [ ] `python3 -c "from backend.runtime.preflight import run_preflight_for_provider; ..."` imports without error
- [ ] Preflight returns PreflightResult type with expected fields

**TODO 4.x (install_provider refactor)**
- [ ] All existing callers still work (backward compat)
- [ ] install_provider returns new schema with `state` + `components`

**TODO 5.x (Admin API)**
- [ ] `POST /api/v1/admin/install/provider` still accepts old request format
- [ ] Response includes new `state` field (even if not displayed in old UI)

**TODO 6.x (Docs)**
- [ ] No .md files have syntax errors (test with `mdlint` or preview)
- [ ] All cross-references (e.g., "See INSTALLATION_STATES.md") point to real files

**TODO 7.x (Validation)**
- [ ] Manager starts: `bash manager.sh start 2>&1 | grep -i error | wc -l` = 0
- [ ] Status endpoint: `curl -s http://localhost:8000/api/v1/admin/install/status | jq '.hunyuan3d-2-1.state'` = valid string

================================================================================
8. QUESTIONS FOR YOU BEFORE STARTING
================================================================================

Confirm these before the coding AI begins:

1. **Should manifest YAML files be checked into Git or generated at startup?**
   - Option A: YAML files → Git (this prompt assumes A)
   - Option B: Python dicts inside installer.py (simpler but less maintainable)

2. **Should preflight run async (background) or sync (blocks install)?**
   - Option A: Sync (blocks, but guarantees state = READY means load will succeed)
   - Option B: Async (faster install, but READY doesn't guarantee load success)
   - Recommendation: Start with A; optimize to B in separate PR

3. **For native-build models, should background compilation start automatically?**
   - Option A: Auto-start immediately (uses resources, but faster ready)
   - Option B: Wait for user click "Start native build" (user controls resource usage)
   - Recommendation: A (background Celery tasks don't block other work)

4. **Should auxiliary weight failures block READY state or just warn?**
   - Option A: Block (RMBG missing → TripoSG can't run)
   - Option B: Warn but allow READY (model loads, but background removal fails)
   - Recommendation: A (fail loudly, user can add weights later via repair)

================================================================================
9. START HERE
===============================================================

**Read this file top-to-bottom.**
**Verify startup checks (section 2) before modifying any code.**
**Follow the TODO list in section 4 sequentially.**
**Output only code diffs + file paths (section 5).**
**Sync docs last (section 6).**
**Run validation after each TODO (section 7).**

Ask clarifying questions inline if context is ambiguous.
Do NOT make assumptions about folder structure or module imports.

Good luck. Ship clean.
