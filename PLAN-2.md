# PLAN-2 — Setup / Colab Runtime-Installation Failure Fix

## Scope

This plan covers **only the new failure observed during `setup.sh` / `colab.sh` runtime preparation**.

### Important

- **PLAN-1 is already considered completed.**
- Do NOT redo PLAN-1.
- Do NOT add PLAN-1 requirements again.
- Only make changes required for the failure described in this document.
- Do NOT introduce unrelated cleanup, refactors, architecture changes, or new features.

The goal is to make model runtime preparation complete safely without accidentally starting/using Celery during installation, without Redis retry failures, and without masking real runtime failures.

---

# 1. Mandatory Agent Rules

Before changing anything:

1. Read `AGENTS.md` completely and follow it.
2. Read the current setup/runtime documentation relevant to this issue.
3. Read this `PLAN-2.md`.
4. Deep-scan the actual source code before deciding on a fix.
5. Read the provided `log.md` and use it as observed evidence.
6. Verify the root cause from the repository code; do not infer the fix from the log alone.
7. Do not blindly rewrite code.
8. Do not repeat PLAN-1 implementation.
9. Do not change model dependency policy unless the verified root cause requires a small compatibility change.
10. Do not replace Redis, Celery, uv, the current runtime installer, or the service manager.
11. Reuse existing lifecycle helpers and health checks.
12. Make the smallest safe change that fixes the verified root cause.
13. Preserve all existing working behavior.
14. At the end, run focused tests, regression tests, and update only relevant documentation.

---

# 2. Observed Failure

The supplied `log.md` shows that runtime installation begins successfully and then unexpectedly initializes Celery while model runtime preparation is still running.

Observed sequence:

```text
setup.sh
  ↓
system dependencies
  ↓
backend environment
  ↓
model runtime preparation
  ↓
AniGen / DetailGen3D / Hunyuan / TRELLIS...
  ↓
Celery worker initialization appears during installation
  ↓
Redis result-backend connection retries
  ↓
retry limit exceeded
  ↓
Celery reports that the worker must be restarted
```

The log repeatedly contains:

```text
Celery worker initializing...
```

followed by:

```text
ERROR celery.backends.redis: Connection to Redis lost
```

and finally:

```text
CRITICAL celery.backends.redis:
Retry limit exceeded while trying to reconnect to the Celery Redis result store backend.
The Celery application must be restarted.
```

The agent MUST verify why Celery is being initialized during model runtime preparation.

---

# 3. Root-Cause Direction Already Visible in Source

The current code contains a specific path that must be investigated first.

## Runtime installer

File:

```text
backend/runtime/installer.py
```

Relevant area:

```text
prepare_runtime()
```

The current native-build branch uses:

```python
from app.workers.installation_workers import run_native_build
```

and can call:

```python
run_native_build.apply_async(...)
```

when native work is pending and `allow_native_build=False`.

This is a direct dependency from the runtime installer into the Celery worker system.

## Celery application

File:

```text
backend/app/workers/celery_app.py
```

The Celery application configures:

```text
CELERY_BROKER_URL
CELERY_RESULT_BACKEND
```

and includes worker modules, including:

```text
app.workers.installation_workers
```

Therefore importing worker-side installation code from the runtime installer can initialize/load the Celery application path.

## Source-level problem to prove

The current runtime installer is mixing:

```text
runtime preparation
```

with:

```text
background Celery task dispatch
```

during setup.

This is the primary root-cause direction.

Do not assume it is the only cause; verify the complete import/call chain.

---

# 4. Critical Requirement

## Runtime preparation must not require Celery

During:

```text
scripts/setup.sh
scripts/colab.sh
```

the following flow must remain independent of Celery:

```text
clone repo
→ create model venv
→ install runtime dependencies
→ handle native dependency decision/build
→ runtime/preflight checks
```

Model runtime preparation must not need to initialize a Celery worker merely to decide or process native installation.

The installer must not create an unnecessary dependency chain like:

```text
runtime installer
  ↓
installation_workers
  ↓
celery_app
  ↓
Redis
```

unless there is a proven, unavoidable reason.

The preferred implementation is to keep the installer operation synchronous or use an existing non-Celery mechanism where appropriate.

Do not invent a new task framework.

---

# 5. Native Build Handling in This Task

PLAN-1 already defines the required native dependency policy.

For PLAN-2, **only fix the setup-time execution path so that the PLAN-1 behavior can work without accidentally booting Celery**.

Required behavior remains:

```text
Native dependency required
        ↓
Check compatible prebuilt wheel
        ↓
Wheel available → install wheel
        ↓
No compatible wheel
        ↓
Existing PLAN-1 user decision
        ↓
YES → build
NO → skip
```

Do NOT redesign this logic.

The specific objective here is:

> A native dependency decision/build must not cause the setup process to initialize a Celery application simply because the installer needs to handle the result.

---

# 6. Setup.sh Audit

Inspect:

```text
scripts/setup.sh
```

Trace:

```text
main()
→ system setup
→ Python dependencies
→ prepare_model_runtimes()
→ service startup
```

Verify the exact ordering.

The model runtime preparation phase must not unexpectedly start the application's worker.

The current setup script intentionally starts application services only near the end:

```text
prepare model runtimes
→ frontend/build steps
→ start.sh
```

Preserve this design.

Do not move general service startup earlier just to hide the error.

Do not solve the issue by starting Celery before model installation.

---

# 7. Colab Audit

Inspect:

```text
scripts/colab.sh
```

Trace the exact runtime preparation path:

```text
Colab setup
→ Python environment
→ runtime installer
→ selected providers
→ prepare_runtime()
→ later service startup
```

Verify that Colab does not accidentally trigger the Celery worker during runtime preparation.

Preserve Colab-specific Redis fallback behavior already present in the script.

Do not redesign Colab networking or storage.

---

# 8. Redis Must Not Be a Hidden Installer Dependency

The runtime installer must not require an active Redis connection merely to:

```text
clone a repository
create a venv
install dependencies
perform a native build
run runtime checks
```

Redis is an application-service dependency.

It must remain a service dependency for:

```text
Celery / application runtime
```

not an accidental dependency for:

```text
model installation
```

If an existing runtime-preparation operation can be performed without Celery, it must remain independent.

---

# 9. Do Not Mask Redis Errors

Do not solve the issue by:

```text
ignoring Redis errors
suppressing Celery logs
increasing retry count
adding infinite retries
catching and discarding Redis exceptions
```

The correct fix is to stop runtime preparation from unnecessarily entering the Celery/Redis path.

If Redis genuinely fails during the later application-service startup, the existing service-health logic must still report it accurately.

---

# 10. Do Not Break Service Startup

After the runtime-preparation fix:

```text
setup.sh
→ runtime preparation
→ setup completes
→ start.sh
→ API
→ Celery worker
→ frontend
```

must still work.

The project must still use the existing:

```text
scripts/start.sh
```

for normal worker startup.

Do not remove Celery from the application.

Do not modify the worker's normal runtime behavior unless the verified issue requires it.

---

# 11. Preserve Existing Redis / Celery Fallbacks

Inspect the existing startup behavior in:

```text
scripts/start.sh
scripts/colab.sh
backend/app/workers/celery_app.py
```

There is already logic for:

```text
Redis available
    → Redis-backed Celery

Redis unavailable in supported fallback mode
    → memory/eager fallback
```

Do not redesign this.

PLAN-2 only needs to ensure that model installation does not accidentally invoke that application path prematurely.

---

# 12. Model Installation Loop

Inspect the loop that prepares multiple providers in:

```text
scripts/setup.sh
scripts/colab.sh
backend/runtime/installer.py
```

Required behavior:

```text
Model A
  ↓
prepare runtime
  ↓
result recorded
  ↓
Model B
  ↓
prepare runtime
  ↓
result recorded
  ↓
Model C
```

A runtime-preparation problem in one model must not unnecessarily initialize or kill a global application worker.

If one model has a genuine dependency/native failure:

```text
Model A → partial/failed
Model B → continue where safe
Model C → continue where safe
```

Do not hide the model failure.

---

# 13. Runtime State Must Remain Truthful

The current code has component states such as:

```text
READY
PARTIAL
BLOCKED
FAILED
```

and model runtime states such as:

```text
runtime_ready
runtime_partial
runtime_failed
```

Do not mark a runtime fully ready when:

```text
required dependency failed
required native dependency was not completed
preflight failed
```

This is especially important because the log shows cases such as:

```text
Normal deps install failed
Failed to install chumpy
native dependencies skipped
```

The agent must verify the existing state calculation and ensure the fix does not make these errors disappear or become falsely successful.

This is a correctness requirement, not a request to redesign the state system.

---

# 14. Important Log Cases to Verify

The agent should trace these observed failures:

## AniGen

```text
chumpy==0.70
```

fails to build.

Also:

```text
pytorch3d
nvdiffrast
```

are considered native/conditional.

Do not automatically add or change packages because of this log.

Only verify whether the installer state and service lifecycle remain correct.

## DetailGen3D

Observed:

```text
torch-cluster wheel installation failed
diso skipped
torch-cluster skipped
```

Again:

- do not redesign dependency policy;
- verify state;
- verify no Celery/Redis dependency is introduced during this handling.

## Hunyuan3D

Observed large dependency installation followed by:

```text
Celery Redis connection failures
```

Verify whether those worker/Redis errors originate from runtime installation itself rather than normal post-setup service startup.

## TRELLIS

Observed Celery/Redis errors after special installation activity.

Verify whether TRELLIS's native/special installation path can also reach a Celery import or background task dispatch.

The final fix must work for both generic and special model paths.

---

# 15. Do Not Fix the Wrong Layer

The agent must distinguish between:

```text
A. dependency installation failure
B. native build decision failure
C. runtime installer / Celery coupling
D. Redis service failure
E. normal application worker startup
```

The log may contain all of these at once.

The goal of PLAN-2 is specifically:

```text
C. runtime installer / Celery coupling
```

plus any directly related lifecycle bug proven by source inspection.

Do not change A/B/D/E unless required to safely fix C.

---

# 16. Required Source Inspection

At minimum inspect:

```text
AGENTS.md

scripts/setup.sh
scripts/colab.sh
scripts/start.sh
scripts/stop.sh
scripts/restart.sh
manager.sh

backend/runtime/installer.py
backend/runtime/dependency_resolver.py
backend/runtime/manifest_loader.py

backend/app/workers/celery_app.py
backend/app/workers/installation_workers.py
```

Also inspect any file directly imported/called by the runtime installer or service startup path.

Search for:

```text
run_native_build
apply_async
Celery(
CELERY_BROKER_URL
CELERY_RESULT_BACKEND
installation queue
installation_workers
celery_app
redis-cli ping
start.sh
prepare_runtime
install_repo_deps
```

---

# 17. Implementation Constraint

Preferred direction:

```text
Runtime installer
    ↓
native/dependency handling
    ↓
no Celery import
    ↓
no Redis connection requirement
```

If an existing helper can execute the native-build action directly and safely, reuse it.

If asynchronous execution is genuinely required somewhere else in the application, keep that behavior there and prevent setup/runtime preparation from invoking it unnecessarily.

Do not create duplicate build implementations.

Do not maintain two different native-build algorithms.

---

# 18. Regression Protection

The fix must NOT break:

```text
PLAN-1 manifest-driven dependency handling
PLAN-1 wheel-first native handling
PLAN-1 build/skip decision behavior
per-model virtual environments
model repository cloning
model preflight
weights stage
normal service startup
Redis-backed Celery runtime
Colab Redis fallback
```

These are existing behaviors and must remain intact.

Do not reimplement PLAN-1.

Only verify compatibility after the PLAN-2 change.

---

# 19. Required Tests

After implementation, test the real execution path.

## Test A — setup.sh

Run:

```text
scripts/setup.sh
```

or the project's supported setup test path.

Verify:

```text
model runtime preparation starts
no unexpected Celery worker initializes during model preparation
no unexpected Redis result-backend connection is opened by runtime installer
model installation continues correctly
setup reaches service startup only after preparation
```

## Test B — Colab

Run the supported Colab setup path.

Verify:

```text
runtime preparation
→ no premature Celery startup
→ selected model installation
→ later normal worker startup
```

## Test C — Multiple models

Prepare multiple models and verify:

```text
Model A → Model B → Model C
```

does not repeatedly initialize the application worker during installation.

## Test D — Native dependency path

Exercise a model with native dependency handling.

Verify:

```text
wheel available
```

and:

```text
no wheel / native decision
```

do not cause unintended Celery startup.

The PLAN-1 build/skip semantics must remain correct.

## Test E — Final services

After setup completes:

```text
Redis
Celery
Backend API
Frontend
```

must start normally using the existing service flow.

Verify:

```text
Redis responds
Celery worker is alive
API health passes
Frontend starts
```

---

# 20. Failure/Recovery Test

Where safe, verify that if:

```text
Redis is temporarily unavailable during normal application startup
```

the existing fallback/error behavior still works.

This test is for regression protection only.

Do not redesign Redis fallback.

---

# 21. No Arbitrary Workarounds

Do NOT solve this issue using:

```text
sleep 10
sleep 30
retry forever
ignore Celery errors
disable Redis globally
start Celery before model installation
hard-code memory broker for setup
```

unless source inspection proves the existing architecture requires a specific bounded readiness wait.

The fix should address the actual dependency/lifecycle mistake.

---

# 22. Documentation Update

After code and tests are complete:

1. Identify the existing docs that explain setup/runtime installation.
2. Update only those relevant documents.
3. Document the correct execution order.
4. Document that runtime preparation is independent from application-service startup.
5. Document any important remaining limitation.
6. Do not create unrelated documentation.
7. Do not update documentation before the implementation is verified.

Documentation must match the actual final code.

---

# 23. Agent Workflow

The agent must work in this exact order:

```text
1. Read AGENTS.md
2. Read PLAN-2.md
3. Read log.md
4. Scan setup.sh
5. Scan colab.sh
6. Scan start/stop/restart service flow
7. Scan runtime installer
8. Scan native-build path
9. Scan Celery application/import path
10. Scan Redis startup/readiness path
11. Reconstruct exact failure chain
12. Prove the root cause from source
13. Identify the smallest safe fix
14. Implement only that fix
15. Test setup.sh
16. Test colab.sh
17. Test multi-model runtime preparation
18. Test normal service startup
19. Verify PLAN-1 behavior did not regress
20. Update relevant docs
21. Report exact files changed and tests performed
```

---

# 24. Strict No-Unwanted-Changes Rule

Do NOT:

- redo PLAN-1;
- rewrite the dependency resolver unnecessarily;
- add unrelated dependencies;
- modify model manifests unless directly required by the proven PLAN-2 root cause;
- replace Celery;
- replace Redis;
- replace uv;
- replace the service manager;
- redesign model execution;
- redesign model storage;
- redesign weights;
- change frontend behavior;
- introduce a new task system;
- introduce a new state database;
- add arbitrary sleeps;
- hide real failures;
- suppress logs;
- make unrelated refactors.

Every modified line must directly contribute to fixing the setup/Colab runtime-installation failure or preventing a regression from that fix.

---

# 25. Completion Criteria

PLAN-2 is complete only when:

```text
[ ] Root cause of the Celery/Redis failure is proven from actual source.
[ ] Runtime preparation no longer unnecessarily initializes Celery.
[ ] Runtime preparation does not require Redis merely to install model runtimes.
[ ] setup.sh completes model runtime preparation without the observed Redis retry loop.
[ ] colab.sh follows the same safe runtime-preparation behavior.
[ ] Native dependency handling still follows PLAN-1.
[ ] Model-specific environments remain intact.
[ ] Real dependency/native failures remain visible.
[ ] Partial/failed runtimes are not falsely reported as ready.
[ ] Multiple model installations can proceed safely.
[ ] Normal Celery/Redis service startup still works afterward.
[ ] Final health checks pass.
[ ] Relevant documentation is updated.
[ ] No unrelated files/features were changed.
```

---

# Final Instruction

**Deep scan first. Prove root cause. Make the smallest safe fix. Test the complete flow. Update docs only after verification.**

The `log.md` is a failure report, not a replacement for source-code analysis.

The main suspected failure is the runtime installer reaching the Celery installation-worker path while model preparation is still running. This must be proven from the actual import/call chain before implementation.

Do not allow a convenient workaround to replace the real fix.
