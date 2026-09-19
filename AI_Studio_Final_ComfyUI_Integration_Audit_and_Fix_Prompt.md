# AI Studio — Final ComfyUI Integration Audit & Fix Prompt

## Mission

You are taking over the supplied **current AI Studio repository**.

Do NOT rebuild the frontend/product.
Do NOT blindly rewrite the current backend again.

The repository already contains a partially implemented **FastAPI → ComfyUI → ComfyUI-3D-Pack** architecture. Your job is to **audit the current implementation, fix the verified blockers, remove stale/broken legacy pieces, and finish the integration end-to-end**.

### Official sources

- ComfyUI: https://github.com/Comfy-Org/ComfyUI
- ComfyUI-3D-Pack: https://github.com/MrForExample/ComfyUI-3D-Pack

Use the exact repositories/revisions actually selected for this project and verify their real APIs, node registrations, installation requirements, and workflow behavior before changing code.

---

# 1. NON-NEGOTIABLE ARCHITECTURE

The final execution path must be:

```text
Existing AI Studio Next.js UI
            ↓
        FastAPI backend
      product/control layer
            ↓
          ComfyUI
     single execution core
            ↓
   ComfyUI-3D-Pack nodes
     primary 3D layer
            ↓
      real 3D execution
            ↓
     AI Studio artifacts
```

Keep ComfyUI as a **separate execution process/service** on its own port unless the verified current Comfy architecture explicitly requires otherwise.

Do NOT embed a second Comfy executor inside FastAPI.

Do NOT create:

- another inference engine
- another GPU scheduler
- another execution queue
- another workflow engine
- another provider runtime
- another model execution framework

FastAPI controls ComfyUI. It does not replace ComfyUI.

---

# 2. PRESERVE THE PRODUCT

Keep the existing:

- Next.js UI
- Workspace
- Projects
- 3D Viewer
- Model Manager UI
- Generation UI
- navigation
- frontend services/hooks/stores
- product storage semantics
- existing setup/Colab/Docker entrypoints
- existing product behavior

Only change frontend code when a concrete backend/Comfy integration requires it.

The dedicated `/comfyui` page already exists in the current repository. Preserve and fix it instead of creating another Comfy page.

---

# 3. FIRST FIX THE CURRENT BUILD BLOCKER

The current:

```text
backend/pyproject.toml
```

is invalid TOML because the first line is prose wrapped in triple quotes.

Fix that immediately.

Then verify:

```bash
python -c "import tomllib; tomllib.load(open('backend/pyproject.toml','rb')); print('pyproject OK')"
```

Do not continue while the package metadata is syntactically invalid.

---

# 4. DEPENDENCY CONTRACT MUST MATCH THE REAL BACKEND

Audit every import used by the active backend and every setup script.

At minimum verify and correct missing runtime dependencies such as:

- `psutil`
- `python-multipart` for FastAPI file/form uploads
- `huggingface_hub` if `scripts/update-models.sh` remains active
- `torch` and CUDA package expectations

Do not rely on unrelated transitive packages.

`backend/requirements.txt` and `backend/pyproject.toml` must describe a reproducible backend environment.

Do not duplicate conflicting dependency definitions without documenting which file is authoritative.

---

# 5. COMFYUI INSTALLATION MUST BE REAL

The current `scripts/install_comfyui.sh` correctly targets:

```text
ENGINE/ComfyUI
ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack
```

Keep that structure.

However, fix the installation flow so the actual ComfyUI-3D-Pack installation requirements are followed.

Current upstream 3D-Pack documentation requires:

```text
git clone
pip install -r requirements.txt
python install.py
```

and its `install.py` handles the prebuilt/native dependency installation or build fallback for the selected runtime.

Do not replace that with a speculative custom dependency system.

Reference:
https://github.com/MrForExample/ComfyUI-3D-Pack

The current bootstrap must:

1. install ComfyUI;
2. install ComfyUI-3D-Pack;
3. run the verified 3D-Pack installer where required;
4. fail loudly on critical dependency/native-build failures;
5. verify that the custom node package actually loads.

Do NOT hide critical installation errors behind `|| true`.

---

# 6. PIN AND VERIFY THE ENGINE

The current installer clones the latest `main` branch with shallow clones.

For reproducible self-hosted deployment, choose and document tested commits/revisions for:

```text
ComfyUI
ComfyUI-3D-Pack
```

Do not claim compatibility based only on a README.

Record the exact tested:

- Python
- PyTorch
- CUDA
- ComfyUI commit
- ComfyUI-3D-Pack commit
- important native dependency versions

---

# 7. REAL 3D-PACK NODE DISCOVERY

Do not trust handwritten node names just because they look plausible.

ComfyUI-3D-Pack really does expose native 3D nodes, and current upstream source contains Hunyuan3D, TripoSR, mesh, save, preview and other 3D functionality.

However, every workflow used by AI Studio must be validated against the actual installed runtime.

Use verified mechanisms such as ComfyUI's real:

```text
/object_info
```

and/or actual example workflow JSON from the installed package.

For each workflow:

```text
node class exists
node inputs exist
node outputs exist
model/checkpoint references exist
workflow loads in ComfyUI
workflow executes successfully
```

Do not invent node classes, input names, output indexes, or checkpoint paths.

---

# 8. FIX THE CURRENT WORKFLOW SYSTEM

The current backend has:

```text
backend/app/core/comfy/workflows.py
```

which manually synthesizes prompt-format dictionaries.

Some current node names correspond to real 3D-Pack nodes, but the workflow definitions still need runtime verification and are not guaranteed to match canonical ComfyUI UI workflows.

Fix this so the AI Studio request resolves to a **real, verified ComfyUI workflow**.

Prefer actual ComfyUI workflow JSON / API-format workflow definitions that can also be opened in the native ComfyUI UI.

Do NOT create another workflow language.

Do NOT invent a large YAML-to-Comfy engine.

If a model → workflow mapping is needed, keep it thin:

```text
AI Studio model ID
    ↓
verified Comfy workflow
```

---

# 9. REMOVE SILENT MODEL FALLBACKS

The current generation path can fall back to TripoSR when a provider is not explicitly recognized.

Do NOT silently do this.

Required behavior:

```text
selected model/provider
        ↓
verified workflow exists?
    YES → execute that workflow
    NO  → return explicit error
```

Never generate with a different model than the user selected.

---

# 10. MODEL READINESS MUST BE REAL

The current model registry contains static claims such as:

```text
installed = true
available = true
status = installed
```

Remove false readiness claims.

Model readiness must be derived from actual checks such as:

```text
ComfyUI reachable
+
required 3D-Pack nodes loaded
+
required model assets/checkpoints available
+
workflow load/validation succeeds
+
optional smoke test succeeds
```

Do not report a model as READY merely because a source directory exists.

Do not assume all listed models are supported by the current 3D-Pack revision.

---

# 11. FIX MODEL CAPABILITY METADATA

Audit all model metadata for correctness.

Do not claim:

```text
text-to-3d
image-to-3d
texture
Colab compatibility
VRAM requirement
```

unless verified for the actual integrated workflow/model.

The UI must reflect actual capabilities of the selected workflow.

---

# 12. FIX JOB PERSISTENCE

Every generation job must persist its relationship to the real Comfy job.

Persist in the database:

```text
AI Studio job_id
Comfy prompt/job ID
model ID
workflow identity/version
serialized workflow or reproducible workflow reference
input assets
status
current stage
progress
output artifact references
```

Do not keep critical job state only in:

```text
Python dicts
in-memory trackers
background task state
```

The system must survive:

```text
frontend reload
backend restart
Comfy restart where recoverable
```

and reconcile the product job against Comfy's real job/history state.

---

# 13. USE CURRENT COMFY JOB APIs

Current ComfyUI exposes job-oriented APIs including:

```text
GET  /api/jobs/{job_id}
POST /api/jobs/{job_id}/cancel
```

Use those verified APIs where applicable rather than relying on fragile filesystem polling.

Source:
https://github.com/Comfy-Org/ComfyUI

The current ComfyUI server code provides job lookup and job-specific cancellation.

Do not assume that `/interrupt` is equivalent to cancelling one arbitrary AI Studio job.

---

# 14. FIX REAL-TIME PROGRESS

The current event listener has a wildcard registration:

```text
listener.on("*", ...)
```

but the dispatcher does not dispatch wildcard callbacks.

Fix the root cause.

Also ensure the generation path actually starts the event listener for the submitted Comfy job.

The frontend progress must come from real Comfy execution signals:

```text
queued
executing
current node
node progress
completed
error
cancelled
```

Do not fake progress using fixed values such as:

```text
20%
60%
100%
```

unless those are derived from real execution state.

---

# 15. FIX JOB COMPLETION DETECTION

Do not treat:

```text
"job disappeared from queue"
```

as sufficient proof of success.

A job is successful only when:

```text
Comfy job completed successfully
+
expected output exists
+
output is valid
+
artifact registration succeeds
```

Use real Comfy history/job data.

Do not infer completion from queue absence alone.

---

# 16. FIX ARTIFACT ASSOCIATION

The current artifact manager can fall back to:

```text
newest *.glb in ENGINE/ComfyUI/output
```

That is unsafe.

Never assign the newest file to a job merely because it happens to be newest.

Use the actual Comfy job/history/output metadata associated with the exact prompt/job ID.

The final AI Studio artifact must belong to exactly the Comfy execution that created it.

Preserve:

```text
source.glb
```

as the immutable master.

Derived outputs must be separate.

---

# 17. FIX POST-PROCESSING SEMANTICS

Audit the current generation request fields:

```text
generate_lod
lod_preset
lod_count
generate_collision
generate_pbr
repair_uvs
auto_optimize
remesh_settings
strict_watertight
preserve_details
...
```

At present many of these are stored in `processing_metadata` but are not actually executed by the generation path.

Do not leave UI options that silently do nothing.

For each feature:

1. verify whether ComfyUI-3D-Pack already provides it;
2. use the real Comfy workflow/node if available;
3. otherwise preserve only genuinely required existing AI Studio processing;
4. ensure the selected options actually change execution.

No fake toggles.

No ignored settings.

No duplicate post-processing engine.

---

# 18. FIX MASTER / DERIVED ARTIFACT FLOW

Required:

```text
Comfy generation
      ↓
immutable source.glb
      ↓
optional processing
      ├── optimized/game-ready
      ├── LODs
      ├── collision
      ├── textures
      └── other derived variants
```

Never overwrite `source.glb`.

The viewer must reference canonical AI Studio storage, not a transient Comfy output directory.

---

# 19. FIX THE DEDICATED COMFYUI PAGE

The existing:

```text
app/comfyui/page.tsx
```

must remain the real native ComfyUI interface.

Fix these issues:

### HTTPS

The current page converts:

```text
https:
```

to:

```text
http:
```

for ComfyUI.

That can create mixed-content failures on a HTTPS deployment.

Use a same-origin/reverse-proxy architecture or another verified secure path.

### Exposure

The current startup scripts bind ComfyUI broadly.

Do not accidentally expose an unauthenticated raw ComfyUI service to the public internet on a VPS.

Keep full ComfyUI control for the user, but put it behind the deliberate AI Studio access path.

### Same job

The Comfy page must show the same Comfy execution submitted through AI Studio.

Do not create a duplicate job just to display it.

---

# 20. WORKFLOW PERSISTENCE / DEFAULT WORKFLOW

The product requirement is:

```text
User edits workflow in native ComfyUI
        ↓
saves it
        ↓
new workflow version becomes active default for that model
        ↓
old versions remain reproducible
```

The current repository does not yet implement this completely.

Implement only the minimum required persistent workflow/version model.

Required data:

```text
model_id
workflow_id
version
serialized workflow
created_at
updated_at
active/default pointer
```

Every AI Studio generation must record which workflow version it used.

Do not destroy historical versions.

---

# 21. FRONTEND API CONTRACT AUDIT

Scan the real frontend code and compare it with active FastAPI routes.

Current frontend calls include endpoints that are not currently implemented, including areas such as:

```text
/api/v1/runtime/install
/api/v1/runtime/update
/api/v1/runtime/remove
/api/v1/runtime/verify
/api/v1/realtime/ws
/api/v1/system/stream
```

Also inspect every `services/`, `hooks/`, `stores/`, and `app/` request.

For every frontend API:

```text
exists and works
OR
intentionally remove/update the frontend caller
```

No silent 404s.

---

# 22. REMOVE DEAD LEGACY RUNTIME REFERENCES

The active runtime directory no longer exists, but the repository still contains many references to:

```text
backend/runtime
runtime/manifests
RuntimeEngine
per-model virtual environments
old provider installers
old model storage
```

Clean these from the active implementation and relevant documentation.

Important active/stale areas include:

```text
scripts/update-models.sh
manager.sh
package-production.sh
services/runtimeService.ts
hooks/useManifestModels.ts
configuration
documentation
legacy test scripts
```

Do not leave commands that call deleted modules.

Example:

```text
scripts/test_latency.py
scripts/test_pipeline_and_export.py
```

must not assume `PYTHONPATH=backend:backend/runtime`.

---

# 23. MODEL INSTALLATION PATHS MUST BE UNIFIED

The active Comfy model/node path is:

```text
ENGINE/ComfyUI/
ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/
ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/Checkpoints/
```

Remove obsolete competing paths such as:

```text
backend/third_party/<provider>
backend/third_party/weights
backend/third_party/.hf_cache
```

unless they are still genuinely needed for a verified non-Comfy product responsibility.

Update `scripts/update-models.sh` so it does not download weights into locations the actual 3D-Pack nodes do not use.

If 3D-Pack manages a model through Hugging Face / its own loader, integrate with that real mechanism instead of duplicating downloads.

---

# 24. CLEAN UP FAKE / STUB RUNTIME APIS

The current runtime API contains operations that return success without performing the named operation, such as:

```text
POST /runtime/config
POST /runtime/repair
POST /runtime/restart
POST /runtime/prewarm
```

and token verification that only checks whether a token string exists.

Do not present no-op endpoints as successful operational controls.

Either:

- implement the real behavior, or
- remove/update the frontend calls for obsolete functionality.

---

# 25. DATABASE INITIALIZATION

The backend currently uses:

```text
Base.metadata.create_all()
```

during startup and swallows initialization errors.

Do not use silent `create_all()` as the production schema migration strategy for persistent deployments.

Use the existing migration tooling correctly.

If the project requires persistent schema changes for workflow versioning/job mapping, add proper migrations.

Do not allow the backend to report READY when the database is actually unusable.

---

# 26. REDIS / CELERY

There is no longer an active Celery generation implementation in the current backend, but Redis and stale Celery references remain.

Determine whether Redis is still needed for a genuine non-inference responsibility.

If not, remove the unnecessary dependency/service/startup requirement.

Do not maintain Redis merely because the previous architecture used it.

Do not reintroduce Celery just to solve ComfyUI job execution.

---

# 27. SETUP / COLAB / STARTUP

Keep the existing setup entrypoints, but make them accurate and fail-safe.

Verify:

```text
scripts/setup.sh
scripts/start.sh
scripts/stop.sh
scripts/colab.sh
scripts/colab_watch.sh
scripts/install_comfyui.sh
```

Requirements:

- ComfyUI installs correctly.
- 3D-Pack installs correctly.
- native dependency failures are not hidden.
- exact tested revisions are used.
- startup waits for ComfyUI readiness before submitting jobs.
- backend startup does not silently continue with a broken DB or Comfy engine.
- repeated setup does not duplicate installations.
- Colab follows the same execution architecture.

---

# 28. TEST SUITE MUST TEST REAL BEHAVIOR

The current `backend/tests/test_backend_e2e.py` mostly checks:

- configuration
- DB CRUD
- Comfy health
- non-empty workflow dictionaries
- static model registry

That is not an end-to-end generation test.

Replace/add the smallest useful tests for:

```text
Comfy node availability
workflow validation
model → workflow resolution
real Comfy submission
job ID mapping
job status/history
job-specific cancellation
artifact association
master preservation
frontend API contract
startup/recovery
```

Do not call a workflow “verified” because it returns a non-empty dictionary.

A real smoke generation must execute when GPU/runtime is available.

---

# 29. DOCUMENTATION MUST MATCH REALITY

The repository still contains large sections describing removed architecture:

```text
backend/runtime
per-model venvs
old provider engines
old Celery execution
old third_party model layout
old installer behavior
```

Update existing docs rather than creating many new docs.

Also fix version drift such as:

```text
backend version 4.x
docs architecture 6.x
README claiming ComfyUI 0.36.0
installer tracking unpinned main
```

The documentation must describe the actual tested stack.

---

# 30. REMOVE THE STALE MIGRATION PROMPT FROM ACTIVE GUIDANCE

The repository contains:

```text
AI_Studio_ComfyUI_Integration_Fix_and_Verification_Prompt.md
```

It currently contains stale statements about files/features that are already present or no longer match the current tree.

Do not allow this file to become accidental implementation guidance.

Either update it to match the final repository or move/remove it from the active project documentation.

---

# 31. REQUIRED VALIDATION CHECKPOINTS

## Checkpoint A — Static

Run:

```bash
python -m compileall -q backend
python -c "import tomllib; tomllib.load(open('backend/pyproject.toml', 'rb')); print('pyproject OK')"
find scripts -maxdepth 1 -type f -name '*.sh' -print0 | xargs -0 -n1 bash -n
```

plus the project's real frontend checks.

## Checkpoint B — Comfy

Prove:

```text
ComfyUI starts
3D-Pack loads
required 3D nodes are registered
```

## Checkpoint C — Workflow

Prove at least one real 3D workflow:

```text
input
→ real 3D-Pack node graph
→ GPU execution
→ real GLB
```

## Checkpoint D — AI Studio

Prove:

```text
Existing UI
→ FastAPI
→ ComfyUI
→ real result
→ canonical storage
→ 3D Viewer
```

## Checkpoint E — Native Comfy Page

Prove:

```text
AI Studio /comfyui
→ real ComfyUI UI
→ same running job/workflow
```

## Checkpoint F — Recovery

Prove that reload/restart does not lose the job-to-Comfy mapping.

## Checkpoint G — Cleanup

Final repository search must show no active references to obsolete runtime/provider/queue systems.

---

# 32. FINAL ACCEPTANCE CRITERIA

The work is complete only when:

```text
[ ] pyproject.toml is valid
[ ] clean dependency installation works
[ ] ComfyUI installs successfully
[ ] ComfyUI-3D-Pack installs successfully
[ ] 3D-Pack install/native build step is completed where required
[ ] real 3D nodes load
[ ] model readiness is real
[ ] selected model maps to correct workflow
[ ] no silent model fallback exists
[ ] real workflow JSON executes
[ ] AI Studio job maps to real Comfy job
[ ] progress is real
[ ] cancellation is job-specific
[ ] completion checks actual output
[ ] artifact association cannot pick another job's output
[ ] source.glb remains immutable
[ ] requested post-processing actually executes or is explicitly unsupported
[ ] dedicated native ComfyUI page works securely
[ ] same Comfy job appears in that page
[ ] workflow/version persistence works
[ ] modified saved workflow can become model default
[ ] historical workflow versions remain reproducible
[ ] frontend-required API endpoints work
[ ] stale runtime references are removed
[ ] stale model storage paths are removed
[ ] docs match implementation
[ ] setup.sh works
[ ] Colab works
[ ] final end-to-end real generation succeeds
```

## Final rule

Do not declare completion from static code inspection alone.

The final proof must be a real:

```text
AI Studio
   ↓
FastAPI
   ↓
ComfyUI
   ↓
ComfyUI-3D-Pack
   ↓
real 3D model
   ↓
real GLB
   ↓
AI Studio storage
   ↓
3D Viewer
```

with the same execution available in the native ComfyUI interface.
