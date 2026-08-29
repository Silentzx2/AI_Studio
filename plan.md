# TASK: Deep Dependency / Runtime Manifest Audit and Safe Fix Plan for AI Studio

IMPORTANT ARCHITECTURE CONSTRAINT:
AI Studio is YAML-driven for model/runtime dependencies. YAML manifests are the authoritative dependency contract. Do not redesign the system so Python code hard-codes dependency versions or CUDA choices. Audit the code only to verify that it correctly consumes the YAML contract. If runtime behavior conflicts with YAML, identify the contract violation and fix the minimum required parser/resolver/installer logic or YAML schema so that YAML remains the source of truth.

You are operating as a **Principal Software Engineer + AI/ML Infrastructure Architect + CUDA/Python Dependency Specialist + DevOps/Build Systems Engineer**.

Your task is to perform a **deep, evidence-based dependency audit** of the uploaded AI Studio project and produce a safe, minimal, production-oriented correction plan for the runtime model manifests.

## NON-NEGOTIABLE RULES

1. **READ AND FOLLOW `AGENT.md` / `AGENTS.md` / repository agent instructions first.**

   * Search the entire repository for all agent/instruction files.
   * Follow them before inspecting or modifying anything.

2. Treat the current project source as the **source of truth for runtime behavior**.

   * Do NOT assume YAML semantics from field names alone.
   * Trace how the runtime actually parses and consumes every manifest field.
   * Inspect dependency resolver, installer, environment builder, native build runner, wheel resolver, Python/CUDA compatibility logic, capability logic, and model/provider registration.

3. **Do not blindly modify dependencies.**
   Every proposed change must be backed by:

   * upstream repository evidence,
   * actual source/setup/requirements evidence,
   * and evidence from AI Studio's runtime implementation showing why the change is necessary.

4. **Do not globally force one CUDA version across all models.**
   CUDA, PyTorch, torchvision, compiled extensions, wheels, and native builds may differ by upstream project.
   Determine whether CUDA should be:

   * global,
   * runtime-detected,
   * model-specific,
   * or expressed as a compatibility range/matrix.
     Hard-coded CUDA versions must be treated as a potential design flaw unless proven otherwise.

5. Preserve the existing architecture.

   * Do not redesign the entire runtime.
   * Do not replace the manifest system.
   * Do not replace provider architecture.
   * Do not remove existing safety/compatibility mechanisms unless evidence proves they are wrong.
   * Prefer the smallest change that makes the runtime correct and reproducible.

6. No fake dependencies, fake versions, fake wheel URLs, or guessed compatibility claims.

7. Distinguish clearly between:

   * Python package
   * PyTorch package
   * CUDA runtime/toolkit dependency
   * CUDA-specific binary wheel
   * native source extension
   * local extension
   * Git/VCS dependency
   * optional accelerator
   * training-only dependency
   * inference-only dependency
   * demo/UI dependency
   * Blender/tooling dependency
   * model checkpoint / asset dependency

8. A repository's `requirements.txt` is NOT automatically the same as AI Studio's runtime dependency set.
   Determine which upstream dependencies are actually required for the execution path AI Studio uses.

Never "fix" a YAML dependency merely by copying the upstream requirements.txt.
Translate upstream requirements into the AI Studio YAML dependency schema, preserving the distinction between:
- exact package versions
- version ranges
- model-specific Torch/CUDA compatibility
- CUDA-specific wheels
- source builds
- optional dependencies
- training-only dependencies
- inference dependencies
- demo-only dependencies
- local extensions
---

# PART 1 — PROJECT DEEP SCAN

Inspect the entire uploaded AI Studio repository.

At minimum inspect:

* `runtime/`
* every YAML manifest under runtime
* all dependency manifest files
* dependency resolver implementation
* installer implementation
* wheel resolution logic
* native build logic
* CUDA detection logic
* Python version compatibility logic
* environment creation logic
* capability/feature gating
* provider/model registration
* startup/runtime execution flow
* scripts used for installation
* Docker/container configuration relevant to model environments
* any dependency lock or requirements files
* any comments documenting manifest schema

Find ALL YAML manifests recursively.

Do not assume there are only a few.

Create an inventory:

| Manifest | Provider/Model | Python | Torch | CUDA | Python deps | Native deps | Wheels | Optional deps | Build env | Potential issues |
| -------- | -------------- | ------ | ----- | ---- | ----------- | ----------- | ------ | ------------- | --------- | ---------------- |

Also identify:

* duplicate dependencies
* conflicting dependencies
* same package with different versions
* same native package represented in multiple incompatible ways
* dependencies declared but never consumed by runtime
* dependencies consumed by runtime but absent from YAML
* fields present in YAML but ignored by runtime
* fields expected by runtime but missing from YAML

---

# PART 2 — TRACE ACTUAL RUNTIME SEMANTICS

For every relevant manifest field, trace the exact code path.

Examples:

* `dependencies`
* `native`
* `optional`
* `wheels`
* `build_env`
* `build_flags`
* `local_extensions`
* `native_build_required`
* `native_steps`
* `python`
* `torch`
* `cuda`
* architecture flags
* shallow clone flags
* extra indexes
* VCS sources
* wheel sources

For each field answer:

1. Where is it parsed?
2. What exact schema does the parser expect?
3. What code consumes it?
4. What happens if the field is missing?
5. What happens if the field is in the wrong shape?
6. Does the YAML value actually affect installation?
7. Is there a fallback that silently overrides it?
8. Can the field create incorrect or unnecessary builds?

Pay special attention to cases where a field name suggests one meaning but the implementation expects another structure.

Example pattern to investigate:

```yaml
build_env:
  CUDA_HOME: ...
  TORCH_CUDA_ARCH_LIST: ...
```

versus code that may expect:

```yaml
build_env:
  package_name:
    ...
```

Do not assume either form is correct; verify it from code.

---

# PART 3 — AGENT 1: UPSTREAM RESEARCH

Run one independent **Web Research Agent** focused only on upstream repositories.

This agent must independently research every model repository referenced by AI Studio manifests.

At minimum investigate any repos found in the manifests, including where applicable:

* VAST-AI-Research/AniGen
* VAST-AI-Research/UniRig
* Microsoft TRELLIS
* Tencent Hunyuan3D repositories
* DetailGen3D
* TripoSG
* any other model repo discovered in the YAMLs

For each repository inspect, where available:

* current `main` / default branch
* README
* `requirements.txt`
* `setup.sh`
* `pyproject.toml`
* `setup.py`
* native extension directories
* installation documentation
* Dockerfile
* environment files
* CUDA-specific install instructions
* wheel URLs/indexes
* training vs inference instructions
* optional/demo instructions
* model checkpoint requirements
* recent issues/PRs affecting dependency installation

Do NOT rely on third-party blogs as primary evidence.

The agent must return a structured report:

```text
Repository
Upstream branch/commit/date checked
Python requirement
PyTorch requirement
CUDA requirement
CUDA-tested versions
CUDA-specific wheels
Native source builds
Optional accelerators
Training-only dependencies
Inference dependencies
Demo-only dependencies
Known incompatibilities
Installation caveats
Evidence URLs
Confidence level
```

### Important research targets

Verify carefully:

### AniGen

Determine:

* exact Python range
* exact tested CUDA versions
* PyTorch installation behavior
* spconv package naming
* pytorch3d installation behavior
* nvdiffrast installation behavior
* whether CUBVH is required for inference or only training
* whether flash-attn/xformers are optional
* actual VRAM requirement
* whether CUDA should be detected rather than hard-coded

Do not assume any older setup information is still valid.

### UniRig

Determine:

* Python 3.11 requirement
* supported PyTorch versions
* exact spconv installation mechanism
* exact torch_scatter/torch_cluster wheel mechanism
* numpy pin
* flash_attn requirement/status
* Blender/bpy role
* optional VRM tooling

### TRELLIS

Determine:

* upstream Python version
* Torch/CUDA baseline
* how spconv is selected from CUDA
* whether nvdiffrast is source-built
* diffoctreerast build mechanism
* mip-splatting subdirectory install
* vox2seq local/HF behavior
* kaolin installation
* xformers/flash-attn optionality
* whether shallow clone/recurse-submodules is required

### Hunyuan3D family

For each relevant Hunyuan manifest determine:

* exact pinned requirements
* package index requirements
* CUDA-specific packages
* bpy source/index requirements
* demo-only dependencies
* whether Blender is truly required by AI Studio's execution path
* current upstream changes/issues that affect installation

---

# PART 4 — AGENT 2: INDEPENDENT UPSTREAM VALIDATION

Run a second independent **Web Research Agent**.

This agent must NOT simply trust Agent 1.

Its job is to independently verify:

1. Version claims
2. CUDA claims
3. Native extension claims
4. Wheel source claims
5. Training-vs-inference classification
6. Optional-vs-required classification
7. Python compatibility
8. Current upstream installation behavior
9. Whether the repo's current instructions differ from stale older documentation
10. Whether a claimed wheel/source repository actually exists and matches the expected framework version

The second agent should explicitly look for:

* current upstream commits
* current setup scripts
* current issues
* current PRs
* current release changes
* package index changes
* CUDA wheel naming differences
* Python wheel availability
* known build failures

It must produce:

```text
CONFIRMED
DISPUTED
OUTDATED
UNKNOWN
```

for every important dependency claim.

No dependency may be recommended for removal/addition solely because Agent 1 suggested it.

---

# PART 5 — AGENT 3: RECONCILIATION + RUNTIME AUDIT

After Agent 1 and Agent 2 finish, run an **Implementation / Runtime Audit Agent**.

This agent reads:

* AI Studio source code
* all YAMLs
* Agent 1 report
* Agent 2 report

Its task is to reconcile upstream truth with actual AI Studio behavior.

For every issue classify:

### A. REAL BUG

Manifest/runtime combination can produce incorrect installation or execution.

### B. REAL COMPATIBILITY RISK

May work today but can fail for a legitimate supported Python/Torch/CUDA combination.

### C. METADATA BUG

Manifest information is wrong/inaccurate, but installation path may still work.

### D. UNUSED / REDUNDANT

Entry is harmless but unnecessary.

### E. INTENTIONAL DIFFERENCE

AI Studio intentionally uses a subset/different structure from upstream and it is valid.

### F. UNKNOWN

Insufficient evidence; do not modify.

For each issue provide:

```text
Issue ID
Severity
Affected manifest(s)
Current YAML behavior
Actual runtime behavior
Upstream expected behavior
Why it is wrong
Why fixing it matters
Exact minimum change
Files to change
Potential side effects
Verification test
Evidence
Confidence
```

---

# PART 6 — AGENT 4: SAFE FIX DESIGN

Run a final **Senior Build/Dependency Engineer Agent**.

This agent must NOT immediately edit the repository.

Its first responsibility is to create the safest minimal fix set based on:

* project behavior
* Agent 1 research
* Agent 2 validation
* Agent 3 reconciliation

It must especially evaluate whether the project is incorrectly assuming:

```text
one global CUDA version
one global Torch version
one global native build environment
one generic spconv package
one universal wheel source
```

before proposing changes.

## Critical requirement: CUDA must not be hard-coded blindly

Search the entire project for:

* `cuda:`
* `CUDA_VERSION`
* `CUDA_MAJOR`
* `CUDA_HOME`
* `TORCH_CUDA_ARCH_LIST`
* `cu118`
* `cu121`
* `cu124`
* `spconv-cu`
* hard-coded CUDA wheel indexes
* hard-coded CUDA paths

Determine which are:

* legitimate defaults
* required compatibility constraints
* stale assumptions
* dangerous hard-coded values

The final design should prefer:

```text
runtime-detected CUDA
+
model-specific compatibility rules
+
Torch/CUDA matched wheels
+
validated native build configuration
```

when upstream requires it.

Do not replace a hard-coded value merely because dynamic configuration sounds better. Prove that the current design is wrong and that the proposed dynamic behavior is compatible with the existing architecture.

---

# PART 7 — NATIVE BUILD AUDIT

This is critical.

For EVERY native dependency determine:

| Dependency | Repo/source | Source build? | Prebuilt wheel? | CUDA-specific? | Torch ABI-sensitive? | Python-sensitive? | Current YAML | Current runtime behavior | Correct representation |
| ---------- | ----------- | ------------- | --------------- | -------------- | -------------------- | ----------------- | ------------ | ------------------------ | ---------------------- |

Specifically inspect:

* spconv
* pytorch3d
* nvdiffrast
* torch_scatter
* torch_cluster
* diso
* diffoctreerast
* mip-splatting / diff-gaussian-rasterization
* vox2seq
* kaolin
* cupy-cuda*
* CUBVH
* any other native extension discovered

Do not call every binary package a "native source build".

Distinguish:

```text
prebuilt CUDA wheel
```

from:

```text
source compilation against local CUDA/Torch
```

from:

```text
local package install
```

from:

```text
Git package with setup.py/pyproject
```

This classification must drive the manifest design.

---

# PART 8 — VERSION PIN AUDIT

For every manifest inspect:

* missing versions
* minimum-only constraints
* broad ranges
* exact pins
* incompatible pins
* duplicate pins
* pins that cannot coexist with the selected Torch/CUDA
* Python-specific pins
* stale pins
* pins which upstream explicitly does NOT require

Do NOT blindly pin every dependency.

Instead categorize:

```text
MUST PIN
SHOULD CONSTRAIN
CAN REMAIN FLEXIBLE
UPSTREAM-OWNED VERSION
CUDA/TORCH RESOLVED DYNAMICALLY
UNKNOWN
```

Explain why each category is appropriate.

---

# PART 9 — EXTRA DEPENDENCY AUDIT

Find packages that exist in AI Studio manifests but are NOT required by the actual upstream execution path.

Classify as:

```text
Required
Optional
Demo-only
Training-only
Developer-only
Redundant
Incorrect
Unknown
```

Do the same for missing upstream dependencies.

Important:
Do NOT remove an apparently unused package until source/import/runtime evidence confirms it is not required by AI Studio.

---

# PART 10 — FINAL OUTPUT

The final report must be structured exactly like this:

## 1. Executive Summary

State:

* total manifests
* total dependencies reviewed
* total native packages reviewed
* real bugs
* compatibility risks
* metadata issues
* redundant dependencies
* missing dependencies
* highest-risk issues

## 2. Critical Issues

Only genuine high-risk issues.

For each:

```text
ISSUE:
AFFECTED FILE:
ROOT CAUSE:
WHY IT BREAKS:
UPSTREAM EVIDENCE:
CURRENT BEHAVIOR:
CORRECT BEHAVIOR:
MINIMAL FIX:
VERIFICATION:
```

## 3. Per-Manifest Audit

One section per YAML.

Show:

```text
Correct
Wrong
Missing
Extra
Unpinned
Native/build issue
CUDA issue
Torch issue
Python issue
Schema issue
```

## 4. Native Dependency Matrix

Use the table described above.

## 5. CUDA / Torch Compatibility Matrix

Build a real compatibility matrix from evidence:

| Model | Python | Torch | CUDA toolkit/runtime | CUDA wheel/index | Native build |
| ----- | ------ | ----- | -------------------- | ---------------- | ------------ |

Do NOT invent combinations that were not validated.

## 6. Dependency Changes

Group into:

```text
REMOVE
ADD
CHANGE VERSION
CHANGE SOURCE
CHANGE MANIFEST SCHEMA
CHANGE RUNTIME LOGIC
LEAVE UNCHANGED
```

## 7. Exact File-Level Fix Plan

For every change:

```text
FILE:
CURRENT:
REPLACE WITH:
WHY:
```

Do not provide speculative code.

## 8. Verification Plan

Create tests for:

* manifest parsing
* dependency resolution
* Python environment creation
* Torch detection
* CUDA detection
* CUDA-specific wheel resolution
* native build environment
* optional dependencies
* training-only dependencies
* inference startup
* provider health
* model import
* actual generation/rigging execution

## 9. Risk Assessment

For every fix:

* low
* medium
* high

and explain why.

## 10. Things NOT to Change

Explicitly list dependencies/configuration that were investigated and found correct.

This section is required to prevent accidental over-fixing.

---

# IMPORTANT EXAMPLE OF THE LEVEL OF EVIDENCE EXPECTED

Do NOT say:

> "spconv should be changed because it is usually CUDA-specific."

Instead say something like:

> "Upstream repository X installs `spconv-cuXXX` based on the detected CUDA major version. AI Studio currently resolves the generic `spconv` package from PyPI, therefore the manifest cannot reproduce the upstream installation path for the supported CUDA environment. This is a real compatibility issue."

Then cite:

* upstream setup source
* AI Studio resolver source
* affected manifest

The same evidence standard applies to CUDA, Torch, flash-attn, CUBVH, bpy, PyG wheels, and all native extensions.

---

# SPECIAL CASE: DO NOT OVER-CORRECT

Several research repositories have messy or evolving upstream dependency files.

The objective is NOT:

> "Make AI Studio identical to requirements.txt."

The objective is:

> "Make AI Studio install and execute the actual required inference/runtime path reliably, while preserving model-specific compatibility constraints."

Therefore:

* demo dependencies can remain excluded if AI Studio doesn't run the demo
* training-only dependencies should not block inference
* optional accelerators should not become mandatory without evidence
* Blender should not be mandatory if the provider does not execute Blender functionality
* source builds should not be replaced with wheels unless the wheel is actually compatible
* wheels should not be assumed interchangeable across Torch/CUDA/Python combinations

---

# SPECIAL CASE: MANIFEST SCHEMA VS RUNTIME CODE

If YAML contains a field but the runtime does not consume it correctly, classify it as a **runtime/manifest contract bug**.

Do not merely "fix the YAML".

Determine whether:

1. YAML is wrong, or
2. runtime parser is wrong, or
3. both are inconsistent.

Then choose the minimum architecture-preserving correction.

---

# DO NOT MODIFY YET

During the first pass, do NOT edit the repository.

First produce:

```text
DEEP_DEPENDENCY_AUDIT.md
```

containing all evidence and proposed changes.

Only after that, if explicitly instructed, apply the changes one by one.

---

# FINAL ACCEPTANCE CRITERIA

The audit is successful only if:

* every YAML was examined
* every referenced repository was independently researched
* at least two independent web research agents were used
* two additional agents reconciled and validated the research
* upstream evidence is cited
* runtime behavior was traced to code
* CUDA hard-coding was explicitly audited
* Torch/CUDA/native build coupling was audited
* native dependency source correctness was audited
* missing versions were identified
* unnecessary dependencies were identified
* missing dependencies were identified
* schema mismatches were identified
* no speculative dependency change is proposed
* every proposed fix has a reason and verification test
* unchanged/correct dependencies are explicitly documented

Do not optimize for the number of changes.
Optimize for **correctness, reproducibility, compatibility, and minimal architectural disturbance**.
