# AI 3D Studio — Runtime Installer Plan

## Purpose

This plan defines **only** the required runtime-installer behavior.

The goal is to make the model installation flow reliable and predictable for:

- local
- VPS
- Google Colab

The implementation must focus on the requirements below and must **not add unrelated architecture, cleanup, refactors, or features**.

---

# 1. Mandatory Agent Workflow

Before changing any code:

1. Read `AGENTS.md` completely and follow its rules.
2. Read the relevant project documentation.
3. Read this `PLAN.md`.
4. Deep-scan the actual implementation before making decisions.
5. Trace the real execution path from:
   - `scripts/setup.sh`
   - `scripts/colab.sh`
   - runtime installer
   - manifest loader
   - dependency resolver
   - native dependency handling
6. Inspect **all model manifests** under:

```text
backend/runtime/manifests/
```

7. Inspect the configured model repositories and compare their actual runtime imports/dependency needs with the manifests.
8. Identify all existing dependency-installation paths and determine which ones can bypass the manifest.
9. Only after this verification, implement the minimum required changes.
10. Do not blindly copy upstream dependency files into the manifests.
11. Do not rewrite working code when a targeted change is sufficient.

If documentation and implementation disagree, verify the implementation first and report the discrepancy before changing behavior.

---

# 2. Core Rule — Manifest Is the Source of Truth

For every model/provider that has a YAML manifest:

```text
backend/runtime/manifests/<model>.yaml
```

that YAML is the **single source of truth for model dependency installation**.

Model dependencies must come from the model's YAML manifest.

The installer must **not** use the cloned repository's:

```text
requirements.txt
pyproject.toml
setup.py
setup.cfg
```

as a dependency source for that manifest-backed model.

These upstream files may be inspected during development to discover missing dependencies, but they must not silently become a fallback installation source.

Do not create a second model dependency source.

---

# 3. Required Runtime Flow

For each selected model/provider, the runtime installer must follow this logic:

```text
Select model/provider
        ↓
Load that model's YAML manifest
        ↓
Validate manifest
        ↓
Clone repository defined by manifest
        ↓
Create model-specific virtual environment
        ↓
Install model dependencies defined by YAML
        ↓
Handle native dependencies with wheel-first policy
        ↓
Run relevant runtime/preflight checks
        ↓
Runtime installation complete
```

Model weights remain a separate concern unless the existing project explicitly combines them in a later stage.

Do not move weight downloading into dependency installation just to satisfy this plan.

---

# 4. Repository Clone

The installer must:

1. Use the repository information defined by the model's YAML manifest.
2. Clone the correct repository/ref.
3. Reuse the project's existing repository/storage helpers.
4. Create the model-specific virtual environment using the existing runtime structure.

Do not create a new repository layout.

Do not hard-code model repository URLs when the manifest already defines them.

---

# 5. Model Virtual Environment

Each model must continue to use its own environment.

Conceptually:

```text
third_party/
    Model_A/
        .venv/

    Model_B/
        .venv/
```

The exact path must continue to come from the project's existing storage/runtime abstraction.

Do not replace the existing per-model environment architecture unless the source-code audit proves it is required for this task.

---

# 6. Model Dependency Installation

After the model repository and model-specific `.venv` are ready:

```text
manifest.dependencies.python
        ↓
model .venv
        ↓
install
```

The implementation must ensure that the model's Python dependencies are installed from the YAML manifest.

If the existing installer has:

- legacy `requirements.txt` installation
- `pyproject.toml` installation
- `setup.py` installation
- hard-coded extra model dependencies
- model-specific special dependency paths

the agent must inspect them and prevent them from bypassing the manifest for manifest-backed models.

Do not remove generic code that is genuinely required elsewhere without verifying its scope first.

---

# 7. Manifest Completeness

Before changing dependency installation behavior, compare each manifest against the actual model/provider code.

For each model, verify:

```text
manifest dependencies
        vs
actual provider imports
        vs
native/runtime requirements
```

If a dependency is genuinely required by the provider but missing from the manifest:

1. confirm the dependency from actual source code;
2. determine the correct package name;
3. determine whether it is Python, native, optional, or hardware-specific;
4. only then update the relevant YAML.

Do not add speculative dependencies.

Do not copy entire upstream `requirements.txt` files into manifests.

---

# 8. Native Dependency Rule — Wheel First

For every dependency that may require a native/compiled build:

```text
Check for compatible prebuilt wheel first.
```

Compatibility must be checked against the relevant environment, including where applicable:

- Python version
- platform
- architecture
- Torch version
- CUDA compatibility
- package version

### If a compatible prebuilt wheel exists

```text
Wheel found
    ↓
install wheel
    ↓
do NOT build from source
```

The installer should prefer the compatible prebuilt artifact rather than compiling unnecessarily.

---

# 9. No Wheel Available

If no compatible prebuilt wheel is available:

### Interactive setup

The installer must ask the user before starting a source build.

Example:

```text
No compatible prebuilt wheel found for <package>.
Build from source? [y/N]
```

Behavior:

```text
y / yes
    → build from source

anything else
    → skip this build
    → continue with the next dependency
```

The installer must not silently start an expensive native build.

Do not treat the mere presence of:

- CUDA
- NVCC
- a compiler
- GPU

as permission to build.

User approval is required.

---

# 10. Skip Behavior

When the user chooses `no`:

```text
native dependency
    ↓
skip
    ↓
record/report that it was skipped
    ↓
continue with remaining setup
```

Do not restart the entire setup.

Do not delete the model environment.

Do not block unrelated models/components from continuing.

However, if the skipped dependency is required for the selected model to function, the installer must clearly report that the model runtime is incomplete rather than falsely reporting it as fully ready.

---

# 11. Non-Interactive / Colab Handling

Both:

```text
scripts/setup.sh
scripts/colab.sh
```

must use the same core native dependency policy.

Do not maintain a separate dependency-installation algorithm for Colab.

If the environment cannot safely ask the user for approval, the installer must not silently auto-build a native dependency.

In non-interactive mode:

```text
no compatible wheel
    ↓
do not silently build
    ↓
skip or fail clearly according to existing runtime semantics
    ↓
report the reason
```

The behavior must be deterministic and must not hang waiting for input that cannot arrive.

---

# 12. Shared Installer Logic

The actual model installation logic must live in the existing backend/runtime installer system.

Both:

```text
scripts/setup.sh
scripts/colab.sh
```

should call the shared implementation.

Do not duplicate dependency-resolution logic separately in Bash.

The difference between local/VPS and Colab should only be environment/platform-specific behavior that already exists in the project.

The fundamental rule remains:

```text
YAML → dependencies → wheel-first native handling
```

for both.

---

# 13. No Hidden Dependency Installation

For manifest-backed models, audit and prevent hidden dependency installation through:

```text
requirements.txt
pyproject.toml
setup.py
setup.cfg
hard-coded model dependency lists
extra dependency lists
special-case model installers
```

Do not allow a special model path to silently install dependencies outside its YAML.

If a special installation sequence is genuinely required for a model, it may remain, but the dependency set must still come from the model's manifest.

---

# 14. Native Build Commands

If a manifest defines native build steps or repository-specific build commands:

1. Inspect how they are currently executed.
2. Preserve commands that are genuinely required.
3. Apply the wheel-first decision before invoking a source build.
4. Ask for user approval when no compatible wheel exists.
5. Build only after approval.
6. If declined, skip and continue.

Do not invent new build commands if the repository already defines the required build process.

---

# 15. Setup Script Requirements

## `scripts/setup.sh`

Verify that the script:

```text
setup.sh
    ↓
backend environment
    ↓
shared runtime installer
    ↓
manifest-driven model installation
```

does not directly install model repository dependency files.

The script itself should not contain a separate model dependency resolver.

---

# 16. Colab Script Requirements

## `scripts/colab.sh`

Verify that Colab reaches the same runtime installer and the same dependency policy.

Required behavior:

```text
clone repo
    ↓
create model venv
    ↓
install model dependencies from YAML
    ↓
wheel-first native handling
    ↓
user decision for source build when interactive
```

Do not create a separate Colab-only dependency source.

---

# 17. Error Handling

The installer must clearly distinguish:

```text
installed successfully
skipped by user
no compatible wheel
build failed
dependency missing
manifest invalid
manifest missing
preflight failed
```

Do not hide an installation failure as success.

Do not silently continue while reporting a required model runtime as ready.

Error messages should identify:

```text
model
dependency
reason
next action
```

Keep output concise and useful.

---

# 18. Idempotency

Do not reinstall a dependency or rebuild a native package unnecessarily if the existing installer already has a reliable verification mechanism.

Reuse existing state/checks.

Do not introduce a new state-storage architecture merely for this task.

The installer should be safe to run again after:

- successful installation
- skipped optional/native build
- failed build
- partially completed setup

without corrupting the existing model environment.

---

# 19. Verification Workflow

After implementation, verify each model path from source code and, where possible, with targeted runtime checks.

At minimum verify:

```text
[ ] Each manifest loads correctly.
[ ] Each configured model maps to the correct YAML.
[ ] Repository cloning still works.
[ ] Model-specific .venv creation still works.
[ ] Model dependencies come from YAML.
[ ] Manifest-backed models do not install repo requirements.txt.
[ ] Manifest-backed models do not install repo pyproject.toml dependencies.
[ ] Manifest-backed models do not install repo setup.py dependencies.
[ ] Existing special model dependency paths do not bypass the manifest.
[ ] Native dependencies check for compatible wheels first.
[ ] A compatible wheel prevents a source build.
[ ] No compatible wheel triggers the approval flow in interactive mode.
[ ] YES/yes starts the source build.
[ ] NO/anything else skips the build.
[ ] Skipping continues to the next dependency.
[ ] Non-interactive setup does not silently auto-build.
[ ] setup.sh and colab.sh use the same installer logic.
[ ] Required skipped/failed dependencies are not falsely reported as ready.
```

---

# 20. Agent Implementation Discipline

The agent must work in this order:

```text
1. Read AGENTS.md
2. Read this PLAN.md
3. Read relevant documentation
4. Deep-scan current implementation
5. Trace actual installer flow
6. Inspect all model manifests
7. Inspect dependency resolver
8. Inspect native build logic
9. Inspect setup.sh
10. Inspect colab.sh
11. Identify exact gaps
12. Explain the gaps internally/before implementation
13. Make the smallest required changes
14. Run focused verification
15. Report what changed and what was verified
```

Do not:

- perform unrelated refactoring;
- redesign the installer;
- introduce a new dependency manager;
- introduce a new storage/state system;
- change model runtime architecture;
- change model weights architecture;
- add unrelated UI features;
- upgrade packages without evidence;
- copy upstream dependency files blindly;
- add speculative dependencies;
- solve issues that are not required by this plan.

---

# 21. Completion Criteria

This task is complete when all current manifest-backed models follow:

```text
Model selected
    ↓
model YAML loaded
    ↓
repo cloned
    ↓
model .venv created
    ↓
YAML-only model dependencies installed
    ↓
native dependency checked for compatible wheel
    ↓
wheel installed when available
    ↓
otherwise explicit build decision
    ↓
YES → source build
NO → skip and continue
    ↓
runtime verification
```

and the same core behavior is used by:

```text
scripts/setup.sh
scripts/colab.sh
```

No unrelated architecture should be introduced.

---

# 22. Final Rule

**Verify first. Modify second.**

The agent must understand the existing codebase before changing it.

The agent must use the model YAML manifests as the authoritative dependency definition.

The agent must prefer compatible prebuilt wheels over source builds.

The agent must never silently perform an expensive native source build when user approval is required.

The agent must keep the implementation focused on the requirements in this plan and must not add unwanted scope.
