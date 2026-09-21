# AI Studio — 3DAIGC-API Integration, Wiring, Bug-Fix & Completion Loop

## 0. Mission

This `plan.md` is an execution plan for an AI coding agent working on the supplied AI Studio project.

The task is now to:

1. Deep-audit the current project as it exists.
2. scan the backend 
3. Verify that the backend is complete and correctly integrated.
4. Finish all missing frontend ↔ backend wiring.
5. Find and fix all integration bugs.
6. Remove stale assumptions from the previous architecture.
7. Rework setup/start/stop/restart/status/log/manager scripts to operate the **current actual architecture**.
8. Update outdated documentation so it describes the real system.
9. Verify every existing UI feature against the actual backend capability.
10. Run real end-to-end tests and keep fixing issues until the acceptance gate passes.


These repositories are references for **current contracts and integration behaviour only**. Do not replace the already-installed backend with a fresh clone.

---

# 1. ABSOLUTE EXECUTION RULES

## 1.1 PLAN-FIRST GATE — MANDATORY

Do **not** start implementation immediately.

First perform a complete audit and prepare an implementation plan for the user.

The initial pass must:

1. Read all project instructions and agent rules.
2. Inspect the complete current project.
3. Inspect the currently installed `backend/` as the source of truth for the active backend.
4. Inspect the current frontend and every backend integration point.
5. Inspect the startup/setup/manager scripts.
6. Inspect all relevant documentation.
7. Build a concrete implementation plan listing every issue, missing wiring, obsolete assumption, feature mismatch, and documentation problem.
8. **STOP.**

Do not edit source code during this planning gate except temporary analysis artifacts that do not change application behaviour.

when you planned then start working 
---

## 1.2 NO BACKEND RECLONE / REINSTALL / REPLACEMENT

The current `backend/` is already the installed 3DAIGC-API backend.

Do NOT:
- delete and recreate `backend/`
- reinstall the backend from scratch
- replace `backend/` with another copy
- rebuild the backend architecture
- selectively copy upstream backend files over the current backend
- overwrite working backend code merely to make it look like upstream
- create a second backend runtime

Only make changes inside the backend if an actual integration/configuration bug is proven and the change is required for the application to work correctly.

Prefer configuration, adapter, and integration fixes over modifying backend internals.

---

## 1.3 EXISTING UI REMAINS THE PRODUCT UI

The current AI Studio UI is the product UI and must remain intact.

Do NOT redesign pages as part of this migration.

Do NOT remove existing UI features merely because the backend integration is incomplete.

Only modify UI code where necessary to:

- connect to the real backend
- fix broken state handling
- fix incorrect API contracts
- fix loading/error/progress behaviour
- expose real backend capabilities
- remove obsolete backend assumptions
- repair broken result rendering
- repair upload/download/task flows

---

## 1.4 ONE ACTIVE AI BACKEND

The application must not continue to run multiple competing AI execution systems.

The active AI runtime is the existing  backend.

Remove or disable stale runtime assumptions such as if it exists:

- old ComfyUI execution paths
- old inference workers
- old model launchers
- obsolete AI queues
- old model-manager execution code
- obsolete generation endpoints
- obsolete AI service containers

Keep unrelated application infrastructure only when it is demonstrably still required.

---

## 1.5 NO MOCKS / NO FAKE SUCCESS

Do not use:

- fake progress
- fake job completion
- mocked generation responses in production code
- placeholder assets presented as real results
- silent fallback to obsolete backend APIs
- hardcoded success values
- fake GPU/VRAM values

If a feature cannot be supported by the real backend, expose the limitation clearly and preserve the UI gracefully.

---

# 2. CURRENT BACKEND ASSUMPTION

The project already contains the new backend under:

```text
backend/
```

Treat it as the active  installation.

Before implementation, verify only these facts:

- backend structure is present
- backend starts successfully using the current setup
- backend exposes its expected API
- Redis/scheduler dependencies required by the current installation are healthy
- current backend models/runtime are discoverable
- current frontend is actually targeting this backend

This is a **verification task**, not a fresh installation task.

Do not repeat the user's already-completed installation work.

---

# 3. DEEP AUDIT — CURRENT PROJECT

Perform a full code and configuration audit before implementation.

## 3.1 Read project instructions

Read:

- `AGENTS.md`
- `agent.md`
- project README files
- architecture documents
- contributor instructions
- development notes
- existing migration plans
- operational documentation

Follow all applicable project-specific instructions.

---

## 3.2 Frontend audit

Inspect:

- all routes/pages
- API clients
- service modules
- hooks
- state stores
- task managers
- realtime/WebSocket code
- upload utilities
- download utilities
- 3D viewer logic
- model selectors
- feature flags
- workspace logic
- generation UI
- texture UI
- rigging UI
- retopology UI
- UV UI
- segmentation UI
- mesh-editing UI
- history/task UI
- asset management
- settings
- runtime/status panels
- error boundaries
- loading states

Search for all backend assumptions, including:

- `localhost:8000`
- `localhost:7842`
- `localhost:8188`
- old API routes
- old job routes
- old model routes
- old manifest endpoints
- old GPU/runtime endpoints
- WebSocket URLs
- proxy URLs
- environment variables
- hardcoded paths
- obsolete ComfyUI references
- obsolete database references

---

## 3.3 Backend integration audit

Inspect the current integration layer between UI and backend.

Verify:

- API base URL
- request client
- auth headers if used
- upload endpoint mapping
- job creation mapping
- job polling
- cancellation
- result retrieval
- download URLs
- error normalization
- backend health detection
- feature discovery
- model discovery
- advanced parameters
- previous-result chaining
- artifact metadata

Trace actual requests from UI button to backend endpoint.

Do not infer wiring from filenames alone.

---
4## Do not replace the current UI with it.

Inspect the available source/reference and document:

- API base URL configuration
- API client structure
- file upload flow
- job creation flow
- polling strategy
- result retrieval
- download handling
- feature discovery
- model discovery
- advanced parameter handling
- backend health handling
- auth assumptions
- task chaining
- error handling
- web/Electron differences

Then compare those patterns against the current AI Studio implementation.

Use evidence from the actual current source. Do not invent endpoints or payloads.

---

# 5. BACKEND CONTRACT AUDIT

Build an exact contract map for every frontend operation.

Use actual current backend source/schema/Swagger/OpenAPI where available.

Create an internal matrix:

| UI Feature | Current UI Request | Actual Backend Endpoint | Payload Correct? | Response Correct? | Result Handling | Status |
|---|---|---|---|---|---|---|
| Text → 3D | | | | | | |
| Image → 3D | | | | | | |
| Texture | | | | | | |
| Segmentation | | | | | | |
| Rigging | | | | | | |
| Retopology | | | | | | |
| UV | | | | | | |
| Mesh Editing | | | | | | |
| Task status | | | | | | |
| Upload | | | | | | |
| Download | | | | | | |
| History | | | | | | |

Every row must be backed by real source evidence.

---

# 6. FIND ALL BROKEN / PARTIAL WIRING

Search for:

- wrong endpoint names
- wrong HTTP methods
- wrong request fields
- wrong response fields
- wrong task/job IDs
- stale status values
- broken polling
- broken cancellation
- incorrect multipart field names
- wrong content types
- incorrect download URLs
- incorrect backend URL resolution
- server/client URL confusion
- stale proxy/rewrite rules
- stale WebSocket logic
- missing auth headers
- incorrect error parsing
- incorrect feature-name mapping
- incorrect model-name mapping
- stale model manifests
- hardcoded model lists
- broken environment-variable usage
- API client type errors
- undefined exports
- incorrect imports
- dead API functions
- duplicate API clients
- duplicate task abstractions
- race conditions in task state
- stale tasks after page refresh
- results that do not populate the viewer
- generated files that cannot be downloaded
- task completion that never reaches the UI
- progress loops
- infinite polling
- missing cleanup

Trace every identified issue to its root cause before fixing it.

---

# 7. FEATURE-PARITY AUDIT

Do not assume every current UI feature is wired simply because the page exists.

For every visible feature, verify the full path:

```text
UI control
  ↓
frontend state
  ↓
API client
  ↓
HTTP request
  ↓
backend 
  ↓
job/model execution
  ↓
status/result
  ↓
frontend state
  ↓
3D viewer / asset UI
```

Audit at minimum:

- Text → 3D
- Image → 3D
- texture generation
- segmentation
- rigging
- retopology
- UV
- mesh editing
- upload
- task creation
- progress
- task completion
- task failure
- history
- result preview
- result download
- previous-result reuse
- settings
- backend health
- model/capability discovery

Also audit less-obvious features:

- keyboard shortcuts
- drag/drop
- file validation
- cancel buttons
- retry buttons
- empty states
- loading states
- error states
- viewer reset
- result replacement
- task selection
- page navigation while job is running
- refresh while job is running
- duplicate submission prevention

Nothing is considered complete merely because the page renders.

---

# 8. SETUP / START / STOP / RESTART / STATUS

This is a major required workstream.

The user already completed backend installation. Do not reinstall it.

Instead, inspect the current operational scripts and make them match the current architecture.

## 8.1 `setup.sh`

Determine what `setup.sh` actually does today.

Remove stale installation behaviour related to the old architecture.

It should become an idempotent project setup/verification entrypoint, not a destructive reinstall script.

It should validate as appropriate:

- required system tools
- frontend dependencies
- backend environment availability
- Python executable used by backend
- Redis availability/required runtime
- backend configuration
- model/runtime prerequisites
- required environment variables
- frontend configuration


---

## 8.2 `start.sh`

Rebuild it around the **actual current architecture**.

It must start only the services that actually exist and are required.

Do not start obsolete services.

It must:

- validate prerequisites
- start required backend dependencies
- start the backend using its real launcher
- start the frontend
- record PIDs or use a reliable process manager
- report actual URLs
- fail clearly when a required component does not start

---

## 8.3 `stop.sh`

Stop only processes/services that belong to the current application.

Do not kill unrelated user processes.

It must cleanly stop:

- frontend
- backend
- any project-owned helper services required by runtime

It must report failures rather than silently pretending everything stopped.

---

## 8.4 `restart.sh`

Must call the new stop/start lifecycle correctly.

No stale commands.

---

## 8.5 `manager.sh`

The current manager must be audited and rewritten where required.

It must represent the **actual current architecture**, not the old one.

Required operations:

```text
setup
start
stop
restart
status
health
logs
```

Optional safe operations:

```text
clean
reset
repair
```

But destructive actions must require explicit confirmation.

The manager must report:

- frontend state
- backend state
- Redis state if required
- backend health
- API URL
- frontend URL
- active process IDs
- recent errors
- model/runtime availability when safely queryable

It must never reference removed services such as an obsolete ComfyUI process or obsolete PostgreSQL runtime unless those services are genuinely still used elsewhere.

---

# 9. DATABASE / LEGACY INFRASTRUCTURE CLEANUP

The user expects the old backend infrastructure to no longer drive the application.

Audit every database-related reference.

Determine whether PostgreSQL, old schemas, old migration scripts, old ORM code, or old persistence layers are still required by the current product.

Do not delete infrastructure merely because the word "database" appears somewhere.

For each legacy database component classify it as:

1. required
2. obsolete
3. uncertain — requires verification

Remove obsolete runtime dependencies and startup references only after proving they are not needed.

Do not break user-facing functionality by removing storage that is still actually used.

---

# 10. OBSOLETE COMFYUI / OLD RUNTIME REFERENCES

Perform a repository-wide search for obsolete runtime assumptions.

At minimum search for:

```text
comfyui
ComfyUI
8188
8000
old model managers
old scheduler
old provider registry
old generation routes
old runtime routes
old GPU endpoints
old WebSocket paths
```

For every match classify it:

- active and still required
- obsolete and must be removed
- documentation-only and must be updated
- test fixture that must be migrated

No stale active code should survive the migration.

---

# 11. API CLIENT AND STATE MANAGEMENT REPAIR

Audit the main API client and all consumers.

Verify:

- exported functions actually exist
- imports match exports
- types match runtime responses
- errors are typed/handled
- methods are not duplicated
- base URL is centralized
- server/client execution does not misuse browser-only variables
- polling is cancellable
- polling stops when job finishes/fails
- retries are bounded
- page unmount cleans timers/subscriptions

Fix all TypeScript/build errors caused by incorrect API integration.

Do not hide type errors with `any` unless there is a documented reason.

---

# 12. MODEL / FEATURE MANAGER AUDIT

The old model manager must not be assumed useful.

Audit:

- model lists
- model manifests
- local model registry
- feature capability maps
- provider registry
- model selector logic
- model install/remove controls
- runtime status


Determine which pieces are still valid with backend 

For each manager feature:

- wire it to the real backend if supported
- replace stale assumptions
- remove unsupported UI actions
- preserve useful information
- never show fake model status
- never show fake GPU/VRAM values

If the backend itself owns model discovery/runtime scheduling, the frontend must consume the backend's source of truth rather than maintaining a second conflicting registry.

---

# 13. WORKSPACE / JOB SYSTEM AUDIT

The Workspace is the main user-facing workflow.

Audit:

```text
Create job
   ↓
Upload inputs if required
   ↓
Submit job
   ↓
Receive job identifier
   ↓
Track status
   ↓
Display progress
   ↓
Completion/failure
   ↓
Retrieve artifact
   ↓
Display in viewer
   ↓
Allow download / next operation
```

Verify every transition.

Special cases:

- refresh page during job
- navigate away during job
- submit two jobs
- cancel job
- backend restart
- failed job
- missing artifact
- expired artifact
- malformed response

Fix state synchronization instead of adding more UI-only timers.

---

# 14. 3D VIEWER / ARTIFACT FLOW

A generated artifact is not considered successfully wired until the actual file reaches the viewer correctly.

Verify:

- result path/URL
- MIME type
- file extension
- GLB/GLTF handling
- OBJ handling where supported
- FBX handling where supported
- texture files
- referenced assets
- skeleton/rig display
- generated materials
- cleanup of old viewer assets
- loading/error states

Test a real generated asset from backend to browser viewer.

---

# 15. REAL-TIME / POLLING AUDIT

Determine whether the current system uses:

- polling
- WebSocket
- SSE
- backend push

Do not retain an old real-time channel simply because the file still exists.

Use the current backend's actual job status mechanism.

Requirements:

- one authoritative job state
- bounded polling/reconnect behaviour
- no memory leaks
- no duplicate subscriptions
- no status race conditions
- no permanent "running" state
- no stale task state after completion

---

# 16. ERROR HANDLING

Handle real failures:

- backend unavailable
- Redis unavailable
- invalid configuration
- authentication failure
- invalid input
- unsupported format
- unsupported feature
- insufficient VRAM
- model unavailable
- job creation failure
- job execution failure
- timeout
- result retrieval failure
- download failure
- corrupted artifact
- frontend/backend version mismatch

Error messages must be actionable.

Do not surface raw stack traces to users unless in an explicit development/debug view.

---

# 17. DOCUMENTATION MIGRATION

The existing documentation is heavily outdated.

Do a repository-wide documentation audit.

Search for stale references to:

- old backend
- PostgreSQL as a required runtime
- ComfyUI
- port `8000`
- port `8188`
- obsolete API routes
- old setup commands
- old model managers
- old architecture diagrams
- removed services
- old environment variables
- obsolete troubleshooting steps

Update documentation based on the **actual final code**, not assumptions.

At minimum verify/update:

- root README
- setup documentation
- startup documentation
- troubleshooting
- architecture docs
- API integration docs
- model documentation
- manager documentation
- environment variable docs
- developer workflow docs

Do not leave contradictory documentation.

---

# 18. REQUIRED DOCUMENTATION OUTPUT

After implementation, create/update:

## `BACKEND_INTEGRATION.md`

Document:

- active backend
- API base URL
- integration layer
- request flow
- job flow
- upload/download flow
- error handling
- model/capability discovery

## `RUNTIME_GUIDE.md`

Document:

- setup
- start
- stop
- restart
- status
- health
- logs
- troubleshooting

## `API_MAPPING.md`

Document:

- UI feature
- frontend function
- backend endpoint
- request shape
- response shape
- job lifecycle
- artifact handling

## `FINAL_FIX_REPORT.md`

Document:

- bugs found
- root causes
- fixes
- files changed
- tests executed
- remaining limitations

Only create additional documentation when useful. Do not create duplicate docs with conflicting information.

---

# 19. STATIC VALIDATION

After implementation, run the project's real validation commands.

At minimum, where applicable:

- frontend install check
- typecheck
- lint
- build
- backend import/startup check
- Python syntax/compile check
- API contract check
- script shellcheck or equivalent shell validation

Fix all introduced errors.

Do not suppress errors just to obtain a green build.

---

# 20. LIVE BACKEND VALIDATION

Verify the already-installed backend directly.

Check:

- API responds
- health endpoint works
- docs/OpenAPI works if exposed
- required scheduler/runtime is reachable
- Redis/runtime dependencies are healthy
- real models/features are discoverable
- file upload works
- job creation works
- status retrieval works
- result retrieval works

Do not reinstall the backend as part of this test.

---

# 21. END-TO-END FEATURE TEST MATRIX

Use real backend execution.

| Workflow | Submit | Progress | Complete | Result | Viewer | Download | Pass |
|---|---|---|---|---|---|---|---|
| Text → 3D | | | | | | | |
| Image → 3D | | | | | | | |
| Texture | | | | | | | |
| Segmentation | | | | | | | |
| Rigging | | | | | | | |
| Retopology | | | | | | | |
| UV | | | | | | | |
| Mesh Editing | | | | | | | |

Only mark a feature PASS when it works through the real UI against the real backend.

If a feature is not supported by the actual current backend:

- document it
- make the UI state honest
- do not fake functionality

---

# 22. UI REGRESSION AUDIT

After API changes, re-check the entire UI.

Verify that no unrelated UI feature was broken.

Check:

- route loading
- navigation
- workspace
- settings
- asset pages
- animation/rigging page
- texture page
- viewer
- history
- downloads
- modals
- keyboard shortcuts
- drag/drop
- responsive layouts
- loading states
- notifications
- empty states
- error states

Do not accept backend integration if it breaks unrelated product behaviour.

---

# 23. LOOP — THIS PLAN MUST NOT STOP AFTER ONE FIX

This is a continuous implementation/validation loop.

```text
AUDIT
  ↓
IDENTIFY
  ↓
ROOT-CAUSE ANALYSIS
  ↓
PLAN / PRIORITIZE
  ↓
IMPLEMENT
  ↓
STATIC VALIDATION
  ↓
LIVE BACKEND VALIDATION
  ↓
END-TO-END TEST
  ↓
UI REGRESSION TEST
  ↓
FULL RESCAN
  ↓
NEW BUGS / MISSING WIRING?
  ├── YES → FIX → REPEAT
  └── NO  → ACCEPTANCE GATE
```

Every loop must update the issue ledger.

Never stop after fixing only the first discovered issue.

Never assume that one successful generation means the integration is complete.

---

# 24. ISSUE LEDGER

Maintain an internal or repository-local issue ledger during the work.

For every issue record:

- ID
- severity
- affected area
- symptom
- root cause
- file(s)
- fix
- validation
- status

Severity:

- P0 — application cannot start / core backend unavailable
- P1 — core workflow broken
- P2 — important feature broken
- P3 — non-critical issue
- P4 — documentation/cleanup

Do not close an issue without verification.

---

# 25. FINAL RESCAN

Before declaring completion, perform a fresh repository-wide scan.

Search again for:

```text
8000
8188
ComfyUI
comfyui
old backend routes
old job APIs
old model APIs
old database startup
obsolete manager commands
stale environment variables
fake progress
mock generation
hardcoded backend URLs
broken imports
TODOs in critical paths
```

Every remaining match must be classified.

No unexplained critical-path stale references are allowed.

---

# 26. ACCEPTANCE GATE — DEFINITION OF DONE

The migration/integration is DONE only when all applicable conditions are true.

## Backend

[ ] Existing 3DAIGC-API backend remains intact and operational.

[ ] No unnecessary backend reinstallation/reclone was performed.

[ ] No duplicate AI backend is active.

[ ] Backend health works.

[ ] Required runtime dependencies are healthy.

## Frontend integration

[ ] Existing UI remains the product UI.

[ ] Backend URL is centralized.

[ ] API client is correct.

[ ] Upload works.

[ ] Job creation works.

[ ] Job tracking works.

[ ] Job completion works.

[ ] Job failure works.

[ ] Results load into the viewer.

[ ] Downloads work.

[ ] Task/history state is correct.

[ ] Previous-result chaining works where supported.

## Feature compatibility

[ ] Every visible AI feature is audited.

[ ] Every supported feature is truly wired.

[ ] Unsupported features do not pretend to work.

[ ] No fake progress exists.

[ ] No fake model/GPU/VRAM data exists.

## Runtime tooling

[ ] `setup.sh` matches the current architecture.

[ ] `start.sh` matches the current architecture.

[ ] `stop.sh` matches the current architecture.

[ ] `restart.sh` matches the current architecture.

[ ] `manager.sh` matches the current architecture.

[ ] status/health/log commands report real state.

## Documentation

[ ] Outdated docs are corrected.

[ ] Setup instructions match reality.

[ ] Runtime instructions match reality.

[ ] API mapping is documented.

[ ] Architecture documentation matches actual code.

## Quality

[ ] Typecheck passes.

[ ] Lint passes where configured.

[ ] Build passes.

[ ] Backend startup check passes.

[ ] Real API tests pass.

[ ] Real end-to-end 3D workflow passes.

[ ] UI regression pass completed.

[ ] Final repository rescan completed.

[ ] Issue ledger has no unresolved P0/P1 issues.

---

# 27. REQUIRED FINAL REPORT

At completion provide:

1. Full list of bugs found.
2. Full list of wiring problems found.
3. Full list of stale/obsolete references removed.
4. Full list of UI features verified.
5. Features that remain unsupported and why.
6. Setup/start/stop/manager changes.
7. Documentation updated.
8. Files modified.
9. Files deleted, with reasons.
10. Tests executed and their results.
11. Real end-to-end workflows verified.
12. Remaining limitations, if any.
13. Final architecture diagram.

Do not report "complete" based on code edits alone.

Completion requires actual verification.

---

# 28. IMPORTANT BEHAVIOUR FOR THE AI AGENT

The agent must behave as an iterative senior engineer, not as a one-shot code generator.

The agent must:

- inspect before editing
- reason from actual code
- verify assumptions
- fix root causes
- test after changes
- rescan after testing
- continue until the acceptance gate passes

If a discovered issue reveals another dependent issue, continue into the next loop.

If a feature looks wired but its end-to-end flow is broken, treat it as incomplete.

If documentation contradicts the code, fix the documentation.

If manager scripts contradict the actual runtime, fix the manager.

If an API contract differs from the UI assumption, fix the integration layer.

If the backend is healthy but the UI cannot consume it, fix the UI integration rather than modifying working backend logic unnecessarily.

If the backend contract itself must be adjusted for compatibility, make the smallest justified backend change and document it.

Never declare success until the real system works end-to-end.

---

# 29. FIRST ACTION FOR THE AGENT

Start with:

```text
1. Read project instructions.
2. Audit the current source tree.
3. Audit current backend integration.
4. Audit startup/setup/manager scripts.
5. Audit documentation.
6. Audit every UI feature against the current backend.
7. Inspect upstream API contracts and Open3DStudio integration behaviour only as references.
8. Produce a detailed implementation plan with findings.
9. STOP and ask the user to approve that plan.
```

### Do NOT start coding before approval.

### Do NOT clone/reinstall/replace the already-installed backend.

### After approval, enter the implementation → test → rescan → fix loop until the acceptance gate passes.
