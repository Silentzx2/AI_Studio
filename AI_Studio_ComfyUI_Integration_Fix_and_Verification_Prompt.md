/# AI Studio — Backend / ComfyUI Integration Fix & Verification Prompt

## Mission

You are working on the supplied **AI Studio** repository.

The current repository already contains a partially rebuilt backend and ComfyUI integration. **Do not blindly rebuild everything again.** First inspect the current implementation and fix the verified problems below while preserving the existing frontend/product.

### Official sources

- ComfyUI: https://github.com/Comfy-Org/ComfyUI
- ComfyUI-3D-Pack: https://github.com/MrForExample/ComfyUI-3D-Pack

Use the real repositories and verify the current installed/versioned APIs, node registrations, installation requirements, and workflow behavior before changing anything.

---

# 1. PRESERVE THE PRODUCT

Do not redesign or replace the existing:

- Next.js UI
- Workspace
- Projects
- 3D Viewer
- Model Manager UI
- Generation UI
- navigation
- frontend services/hooks/stores
- storage/product semantics
- setup/Colab/Docker entrypoints unless they are being corrected
- existing user-facing behavior

Only change frontend code when a concrete backend integration issue requires it.

---

# 2. CURRENT REPOSITORY STATUS

The repository already contains a new-style FastAPI backend and Comfy client layer.

Before implementation, inspect the current tree and treat it as the source of truth.

Static verification already shows:

- Python `compileall` passes.
- All shell scripts pass `bash -n`.
- `ENGINE/ComfyUI` is not included in the ZIP and is expected to be created by setup.
- `app/comfyui/page.tsx` is currently missing.
- An active admin backend router is currently missing.
- The current Comfy workflow templates contain unverified/fake 3D node classes.
- The current model API reports installed/available states statically.
- Current setup has stale legacy runtime/model-management paths.
- Current startup checks for `celery`, while the active backend dependency manifests do not provide the same active Celery architecture.
- `scripts/update-models.sh` still imports the removed `runtime.installer` path.
- Documentation still contains large amounts of old runtime/per-model-venv/Celery architecture.
- The current backend does not yet fully match the frontend API surface.

Treat these as implementation blockers to resolve, not as assumptions to ignore.

---

# 3. CRITICAL FIX: REAL COMFYUI EXECUTION

The active backend must use **real ComfyUI execution**, not an invented workflow engine.

Do NOT invent or preserve fake abstractions such as:

- fake `PromptExecutor` usage unless verified against the exact pinned ComfyUI revision
- invented workflow executors
- invented node classes
- invented 3D pipeline nodes
- fake model loaders
- fake save nodes
- fake workflow schemas

The current `backend/app/core/comfy/workflows.py` contains unverified classes such as:

```text
TRELLISModelLoader
TRELLISSampler
TRELLISMeshDecoder
TripoSRModelLoader
TripoSRSampler
TextureModelLoader
TextureGenerator
QuadRemesh
SaveMesh
```

and Hunyuan templates using image-generation nodes such as:

```text
CLIPTextEncode
CLIPLoader
UNETLoader
KSampler
VAEDecode
SaveImage
```

These must NOT be treated as real 3D workflows unless verified in the actual installed ComfyUI + ComfyUI-3D-Pack environment.

Replace/remove these fake templates with **verified real ComfyUI workflows**.

Do not invent node names to make the code appear complete.

---

# 4. 3D-PACK MUST BE THE REAL 3D LAYER

ComfyUI-3D-Pack must be installed as an actual custom-node package:

```text
ENGINE/
└── ComfyUI/
    └── custom_nodes/
        └── ComfyUI-3D-Pack/
```

Use the official repository:

https://github.com/MrForExample/ComfyUI-3D-Pack

The existing `scripts/install_comfyui.sh` clones the repository and installs `requirements.txt`, but it currently does not execute the package's own `install.py`.

Fix the bootstrap so it follows the package's verified installation process for the selected revision.

Do not replace the package's own installer with a giant manually maintained dependency list unless a verified compatibility reason requires a specific patch.

Do not use `|| true` to hide critical native/dependency failures.

After installation, verify:

1. ComfyUI starts.
2. ComfyUI loads the custom node package.
3. The expected 3D node registrations actually exist.
4. A real 3D-pack workflow loads.
5. A real 3D-pack workflow can execute.

A directory existing on disk is NOT sufficient proof that 3D-Pack is installed correctly.

---

# 5. FIX MODEL SELECTION

The current generation flow does not reliably map the user's selected model/provider to a verified workflow.

Fix the flow so:

```text
AI Studio model selection
        ↓
verified model/workflow mapping
        ↓
real ComfyUI workflow
        ↓
ComfyUI execution
```

Do not silently default every model to a Hunyuan workflow.

Do not mark a model supported until the actual node/workflow/model combination is verified.

The model API must not contain hardcoded claims such as:

```text
installed = True
available = True
status = installed
```

unless the state has actually been verified.

Use real runtime/model/node readiness checks.

---

# 6. REMOVE THE CUSTOM YAML WORKFLOW ENGINE UNLESS PROVEN NECESSARY

The current implementation introduces:

```text
backend/app/core/comfy/workflows.py
backend/comfyui_workflows/*.yaml
WorkflowBuilder
```

with a custom YAML → Comfy graph translation system.

Do NOT maintain a second workflow language unless the repository proves it is genuinely necessary.

Prefer real ComfyUI workflow JSON/API-format workflows that can also be opened and edited in the actual ComfyUI UI.

The workflow used by AI Studio should be the same real workflow a user can inspect and edit in ComfyUI.

If a thin model → workflow mapping is needed, keep it minimal.

Do not build a parallel graph engine.

---

# 7. JOB IDENTITY AND WORKFLOW PERSISTENCE

Every AI Studio job must map to the actual Comfy execution.

Persist, using the existing DB conventions:

```text
AI Studio job ID
Comfy prompt/execution ID
model ID
workflow ID/version where applicable
serialized workflow or reproducible workflow reference
input assets
status
progress/current node
output artifacts
```

Do not keep critical job identity only in in-memory dictionaries.

A server restart must not destroy the ability to reconcile an active or completed Comfy job.

After a restart or frontend reload, the backend must be able to query Comfy and restore the product job state.

---

# 8. FIX PROGRESS / EVENTS

The current system has both polling and in-memory WebSocket tracking.

Keep one authoritative integration path.

Use ComfyUI's real execution events/history/queue mechanisms as verified.

The AI Studio frontend should receive a product-friendly status derived from the actual Comfy execution.

Do not invent progress.

Do not report completion until:

- Comfy execution is actually complete,
- required output exists,
- output is valid,
- artifact registration succeeds.

Progress must survive page reloads and backend reconnection through persisted job state.

---

# 9. FIX CANCELLATION

The current implementation uses a global Comfy `/interrupt`.

Do not allow a user cancellation request to accidentally interrupt an unrelated job.

Use the exact job-aware Comfy mechanism supported by the pinned ComfyUI version, and verify it.

Required behavior:

```text
User cancels
    ↓
actual target Comfy execution is cancelled
    ↓
AI Studio job becomes cancelled
    ↓
no fake completion
    ↓
no orphaned product state
```

---

# 10. DO NOT KEEP CELERY AS A SECOND EXECUTION SYSTEM

The final active generation path must be:

```text
Next.js
   ↓
FastAPI
   ↓
ComfyUI
```

Do not maintain:

```text
FastAPI
   ↓
Celery
   ↓
another generation executor
```

If Celery is no longer required by any real product responsibility:

- remove it from active execution;
- remove stale startup checks;
- remove stale environment variables;
- remove stale docs;
- remove stale UI references;
- remove stale scripts;
- remove obsolete tests.

Redis may remain only if the repository proves it is still needed for a non-inference responsibility.

---

# 11. FIX THE FRONTEND/BACKEND API GAP

Scan the entire frontend for real `/api/v1/...` usage.

The active backend must either:

1. implement the required endpoints with correct behavior, or
2. remove/update the frontend calls only when that feature is intentionally obsolete.

Do not leave silent 404s.

Pay particular attention to currently referenced areas such as:

```text
/admin/*
/realtime/ws
/settings/*
/system/*
/download/*
/generation/enhance-prompt
/runtime/*
```

and any upload/assets routes.

The existing frontend must continue to function against the rebuilt backend.

---

# 12. ADD THE REAL COMFYUI PAGE

The current repository does not contain the required dedicated ComfyUI page.

Add the smallest correct integration for the real ComfyUI web UI.

Requirements:

- show the actual ComfyUI interface;
- do not create a fake node editor;
- preserve full ComfyUI control;
- keep it inside the AI Studio product experience;
- use a safe network/proxy arrangement;
- avoid exposing an unnecessary public raw Comfy endpoint.

The normal AI Studio Generate flow and the ComfyUI page must interact with the SAME ComfyUI engine and jobs.

No duplicate execution.

---

# 13. BOOTSTRAP AND COLAB

Fix the existing setup system; do not create a second setup framework.

Existing setup/Colab flow should produce:

```text
Existing AI Studio setup
        ↓
ENGINE/ComfyUI
        ↓
ComfyUI
        ↓
ComfyUI-3D-Pack
        ↓
verified dependencies
        ↓
real node-load smoke test
        ↓
ComfyUI startup
        ↓
FastAPI startup
        ↓
Next.js startup
```

Make setup idempotent.

Do not create duplicate ComfyUI installation paths.

Use verified/pinned commits where reproducibility matters.

Do not assume `main` branch is a stable production dependency without verification.

---

# 14. FIX STALE SETUP / MODEL MANAGEMENT

Inspect and correct:

```text
scripts/setup.sh
scripts/start.sh
scripts/stop.sh
scripts/colab.sh
scripts/update-models.sh
manager.sh
.env.example
```

Remove or rewrite references to obsolete:

```text
backend/runtime
per-model virtual environments
backend/third_party model runtimes
RuntimeInstaller
old provider installers
old provider weight paths
Celery worker startup
obsolete runtime cache paths
```

`manager.sh` must not call dead runtime code.

Model management should reflect actual ComfyUI/3D-Pack state instead of the removed runtime installer architecture.

---

# 15. FIX PATHS / STORAGE

Use one canonical Comfy installation path:

```text
ENGINE/ComfyUI
```

Do not simultaneously support ambiguous paths such as:

```text
backend/third_party/ComfyUI
ENGINE/ComfyUI
third_party/ComfyUI
```

unless there is an explicitly verified reason.

Canonical product storage remains AI Studio storage.

ComfyUI temporary/output files are execution-layer data.

Final product artifacts must be copied/registered into canonical AI Studio storage.

Artifact discovery should use real Comfy history/output metadata rather than guessing filenames from prompt IDs.

---

# 16. PRESERVE MASTER OUTPUT

For successful generation:

```text
Comfy generated master
        ↓
preserve immutable source.glb
        ↓
derived outputs
```

Do not allow cleanup/optimization to overwrite the master.

Do not report a generation as complete until the master output is present and validated.

---

# 17. DATABASE SAFETY

Inspect the current DB models and existing project/history behavior.

Do not rely on unconditional `Base.metadata.create_all()` as the only migration mechanism for an established deployment.

Use the project's existing migration approach where persistent schema changes are required.

Preserve required project/history/storage relationships.

Do not destroy existing user/product data just to simplify the rebuild.

---

# 18. CLEANUP OLD CODE

After the real Comfy path works, remove obsolete active code and configuration.

Candidates must be reference-scanned before deletion:

- old runtime code
- old providers
- old model installers
- old model download managers
- obsolete Celery execution code
- stale backend helpers
- dead scripts
- duplicate shell scripts
- obsolete test files
- stale `.env` variables
- stale docs
- duplicate storage paths

Do NOT delete useful tests merely because their names contain "test".

Classify tests as:

```text
KEEP
UPDATE
REMOVE
```

based on actual relevance.

---

# 19. DOCUMENTATION CLEANUP

The repository currently contains documentation that still describes old architecture such as:

- per-model virtual environments
- old provider runtimes
- Celery execution
- old `backend/third_party` paths
- old runtime installer behavior

Update the documentation so it matches the actual implementation.

Do not create many new documentation files if existing documentation can be corrected.

The final docs must describe:

```text
AI Studio UI
    ↓
FastAPI control layer
    ↓
ComfyUI
    ↓
ComfyUI-3D-Pack
```

---

# 20. DO NOT OVER-ENGINEER

Hard rules:

- Do not invent abstractions.
- Do not invent APIs.
- Do not invent node classes.
- Do not invent workflow formats.
- Do not create a second execution engine.
- Do not create a second queue.
- Do not create duplicate post-processing architecture.
- Do not generate custom nodes when ComfyUI-3D-Pack already provides the functionality.
- Do not create files without a concrete verified purpose.
- Do not keep dead compatibility layers merely because they are easy to leave behind.

Reuse first.

Verify second.

Implement third.

Delete only after verification.

---

# 21. REQUIRED VERIFICATION

Before declaring completion, run and record evidence for:

## Static

```text
python -m compileall backend
bash -n scripts/*.sh
```

plus the project's real frontend type/build/lint checks.

## ComfyUI

- ComfyUI starts successfully.
- `/system_stats` or the verified equivalent responds.
- ComfyUI-3D-Pack is actually loaded.
- Required 3D nodes appear in verified node metadata.
- At least one real 3D-Pack workflow executes.

## AI Studio

- FastAPI starts.
- frontend starts.
- generation request reaches Comfy.
- real Comfy prompt ID is associated with the AI Studio job.
- progress updates come from real Comfy execution.
- cancellation targets the correct job.
- output is validated.
- source master is preserved.
- final artifact is registered.
- viewer loads the artifact.

## Restart / Recovery

- reload the frontend during generation;
- restart FastAPI while Comfy continues;
- recover job state from persisted mapping + Comfy history;
- no duplicate execution is created.

## Cleanup

Prove that no obsolete execution path remains active.

---

# 22. FINAL ACCEPTANCE CRITERIA

The repository is complete only when:

```text
[ ] Existing AI Studio frontend still works.
[ ] FastAPI is the product/control backend.
[ ] ComfyUI is the real execution engine.
[ ] ComfyUI-3D-Pack is actually installed and loaded.
[ ] Real 3D workflows execute.
[ ] No fake/unverified node classes remain in active workflows.
[ ] Model selection maps to the correct verified workflow.
[ ] No second inference engine exists.
[ ] No second queue exists.
[ ] No active Celery inference path exists.
[ ] Job ↔ Comfy execution mapping is persisted.
[ ] Progress is real.
[ ] Cancellation is real and job-specific.
[ ] Dedicated real ComfyUI page exists.
[ ] Same Comfy job is observable from AI Studio and ComfyUI.
[ ] Master output is preserved.
[ ] Artifacts are registered in AI Studio storage.
[ ] Setup/Colab installs ComfyUI + 3D-Pack correctly.
[ ] No duplicate ComfyUI installation path exists.
[ ] Stale runtime/model-management code is removed.
[ ] Frontend-required API routes are functional.
[ ] Docs match the final architecture.
[ ] Final end-to-end generation succeeds.
```

## Final rule

**Do not declare success because the code compiles.**

A successful result requires an actual:

```text
AI Studio UI
   ↓
FastAPI
   ↓
real ComfyUI
   ↓
real ComfyUI-3D-Pack node
   ↓
real 3D model execution
   ↓
real output
   ↓
AI Studio artifact
   ↓
3D Viewer
```

with the same execution observable from the dedicated ComfyUI UI.
