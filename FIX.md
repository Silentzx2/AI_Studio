AI 3D Studio — Deep Runtime & Dependency Audit

You are working on the AI 3D Studio repository.

CRITICAL INSTRUCTION

Before making ANY code/configuration change, you MUST:

1. Read and follow "AGENTS.md" if it exists.
2. Search the repository for any additional agent/developer instructions such as:
   - "AGENTS.md"
   - "CLAUDE.md"
   - "CONTRIBUTING.md"
   - project-specific instruction files
   - README/install/runtime documentation
3. Read all relevant instructions completely.
4. Do NOT blindly write, rewrite, delete, rename, or refactor code.
5. Do NOT assume the existing architecture from filenames or documentation alone.
6. Trace the actual execution path in source code and verify every conclusion.
7. If documentation and implementation disagree, report the discrepancy explicitly.
8. Before changing anything, produce an audit of what is actually happening.
9. Do not “fix” something merely because it looks unusual. First establish whether it is actually a bug.
10. Preserve the current architecture unless a concrete problem is proven.
11. Do not introduce a new dependency manager, process architecture, installer architecture, or manifest schema without first explaining why the current implementation cannot satisfy the requirement.

---

PRIMARY OBJECTIVE

Perform a deep technical audit of:

- model dependency installation
- per-model YAML manifests
- upstream model repositories
- model-specific virtual environments
- Python process isolation
- "sys.path" manipulation
- "sys.modules" cleanup
- model loading/unloading
- GPU switching between models
- model weight downloading
- missing dependencies
- dependency/version conflicts
- fallback installation mechanisms
- setup/Colab installation flow

The final goal is to determine exactly why model dependency/runtime issues may occur and whether the current architecture is reliable when multiple models share the same GPU.

---

IMPORTANT REPOSITORY AREAS

Inspect these areas first, then expand the search wherever necessary.

Installer

backend/runtime/installer.py

Trace all relevant functions, especially:

clone_repo()
load_manifest()
install_repo_deps()
_install_torch_stack()
prepare_runtime()
download_weights()

Also inspect every helper called by these functions.

---

Model manifests

Inspect ALL model-specific YAML files under:

backend/runtime/manifests/

Do NOT assume there is one global "manifest.yml".

The project uses per-model/per-provider YAML manifests.

Build a table containing at minimum:

provider/model
manifest path
repository URL
branch/ref
python dependencies
native dependencies
optional dependencies
one_of/alternative dependencies
hardware requirements
CUDA requirements
Python version requirements
weight definitions
auxiliary weights
preflight requirements
runtime requirements

Do not omit any YAML.

---

Model registry

Inspect the model/provider registry and determine exactly what role it plays.

Search for:

ModelRegistry
_PROVIDER_MAP
provider registry
provider loading
provider discovery

Determine:

1. Does registry control dependency installation?
2. Does registry select the provider?
3. Does registry map a provider ID to a manifest?
4. Does registry determine which model can run?
5. Is registry only discovery/runtime metadata?
6. Where exactly does registry hand off to manifest loading?

Provide exact file paths and function names.

---

Setup scripts

Inspect:

scripts/setup.sh
scripts/colab.sh

Trace their complete dependency/runtime flow.

Determine:

setup.sh
    ↓
backend environment
    ↓
backend/requirements.txt
    ↓
runtime installer
    ↓
model repository
    ↓
model environment
    ↓
model dependencies
    ↓
weights

Do the same for "colab.sh".

Explicitly identify differences between local/VPS/Colab behavior.

---

Backend dependencies

Inspect:

backend/requirements.txt

Determine which dependencies belong to:

AI Studio backend

versus:

individual model runtimes

Do not mix these two categories.

---

Upstream model repositories

Inspect every configured model repository under:

backend/third_party/

and the corresponding upstream repository definitions.

For EACH model, inspect whether the cloned repository contains:

requirements.txt
pyproject.toml
setup.py
setup.cfg
environment.yml
other dependency files

Also inspect the model's actual Python imports.

The goal is to compare:

UPSTREAM DECLARED DEPENDENCIES
vs
AI STUDIO YAML DEPENDENCIES
vs
ACTUAL IMPORTS USED BY PROVIDER CODE

---

Dependency completeness audit

For every model, construct this matrix:

Model
Manifest dependency
Upstream dependency
Provider import
Actually installed?
Source of installation
Missing?
Optional?
Native/CUDA?

Pay special attention to imports that may not be obvious package names.

Examples:

import smplx
import transformers
import diffusers
import accelerate
import xformers
import flash_attn
import spconv
import nvdiffrast
import pytorch3d
import kaolin

Do NOT assume that an import name equals its pip package name.

Resolve each one correctly.

---

DEFINITE CHECK: AniGen

Inspect:

backend/runtime/manifests/anigen.yaml

and the AniGen provider implementation.

Specifically verify whether:

import smplx

is used.

If "smplx" is required by actual runtime code but absent from the manifest, report it as a concrete dependency gap.

Do NOT automatically modify the manifest until the evidence is documented.

---

DEFINITE CHECK: TRELLIS

Inspect:

backend/runtime/manifests/trellis.yaml

Pay special attention to:

dependencies:
  python:
  native:

and:

attention_backend:
  one_of:

Verify whether the installer actually respects:

one_of / alternatives

or whether it simply combines:

python + native

into one installation list.

Determine whether:

flash-attn
xformers

are treated as alternatives or accidentally installed together.

This must be verified from actual installer code, not inferred from YAML.

---

DEFINITE CHECK: TripoSG

Inspect:

backend/runtime/manifests/triposg.yaml

and the TripoSG provider implementation.

Trace:

image_process
BriaRMBG
TripoSGPipeline

Determine whether these are:

1. local repository modules
2. Python packages
3. external model dependencies
4. model weights
5. runtime-generated components

Also verify:

weights:
  primary:
  auxiliary:

against what the provider actually downloads/loads.

If an auxiliary model/checkpoint is required but not declared, report it.

Do not change it blindly.

---

MOST IMPORTANT: Python environment architecture

Deeply inspect how model-specific ".venv" environments are used.

Determine whether the application executes:

third_party/Model_A/.venv/bin/python

as a separate process.

OR whether it uses:

backend worker Python
    ↓
sys.path manipulation
    ↓
Model_A/.venv/site-packages

This distinction is critical.

Trace the exact implementation of:

_add_model_env()
sys.path
sys.modules
model venv
provider loading
provider unloading

Provide exact source paths and function names.

---

REQUIRED MULTI-MODEL TEST MODEL

Use this conceptual scenario:

GPU = one shared GPU

Model A:
third_party/Model_A/
third_party/Model_A/.venv/

Model B:
third_party/Model_B/
third_party/Model_B/.venv/

Trace this exact sequence:

1. Start worker
2. Load Model A
3. Model A imports dependencies
4. Model A loads weights to GPU
5. Generate
6. Unload Model A
7. Load Model B
8. Model B imports dependencies
9. Model B loads weights to GPU
10. Generate
11. Switch back to Model A
12. Generate again

Determine what actually happens at every stage.

---

sys.path / sys.modules AUDIT

Inspect whether the project does something similar to:

sys.path.insert(...)

and:

sys.modules.pop(...)

Determine:

1. Which model's ".venv/site-packages" is active?
2. Is the backend ".venv" still present?
3. Which packages are removed from "sys.modules"?
4. Which packages are NOT removed?
5. Can transitive imports remain cached?
6. Can native ".so"/CUDA extensions remain loaded?
7. Can singleton/global state survive model switching?
8. Can objects from Model A retain references after Model A is unloaded?
9. Can Model B accidentally use Model A's already-imported module?
10. Does switching A → B → A work reliably?

Do not claim a problem unless supported by code or reproducible reasoning.

---

PROCESS ISOLATION AUDIT

Explicitly answer:

Does each model run in:

A. separate Python process
OR
B. same Python process with environment/path switching?

If it is B, explain all consequences.

Specifically inspect whether the system ever executes something equivalent to:

third_party/Model_A/.venv/bin/python <command>

or:

subprocess.Popen(...)
subprocess.run(...)
asyncio.create_subprocess_exec(...)

for model inference.

If not, state clearly:

Per-model .venv exists,
but per-model Python process does not.

---

GPU lifecycle audit

Trace:

load_provider()
instantiate provider
load model
move to CUDA
generate
unload_provider()
cleanup
CUDA cache cleanup
next provider

Determine:

1. When weights enter GPU memory.
2. When they leave GPU memory.
3. Whether Python references are actually released.
4. Whether "torch.cuda.empty_cache()" is used.
5. Whether "gc.collect()" is used.
6. Whether CUDA contexts remain alive.
7. Whether model A can prevent model B from loading.
8. Whether OOM recovery unloads the previous model first.
9. Whether the worker process itself ever gets restarted.

---

Weight download audit

Separate dependency installation from model-weight downloading.

Determine:

Dependency source
Model code source
Weight source

For every model identify:

Git repository
Hugging Face repository
checkpoint URL
auxiliary checkpoint
cache location
verification mechanism

Do not confuse:

pip dependency

with:

model weight

---

Fallback dependency mechanisms

Search the entire repository for:

requirements.txt
pyproject.toml
setup.py
setup.cfg

Determine the exact precedence.

For example:

manifest exists
    ↓
manifest dependency path

manifest missing
    ↓
fallback discovery
    ↓
requirements / pyproject / setup.py

Verify this from actual code.

Do not rely on comments alone.

---

Dependency conflict audit

For every model, identify version-sensitive packages:

torch
torchvision
torchaudio
transformers
diffusers
accelerate
huggingface_hub
xformers
flash-attn
pytorch3d
spconv
kaolin
nvdiffrast
torch-scatter
torch-cluster
numpy
Pillow
opencv

Determine:

Model A required version
Model B required version
Shared backend version
Compatible?
Potential conflict?

Especially inspect packages that have:

- compiled extensions
- CUDA bindings
- ABI compatibility
- strict Torch version coupling

---

DO NOT BLINDLY FIX

This is an audit first.

Before changing anything:

1. Identify issue.
2. Locate exact file/function.
3. Prove issue from code/config.
4. Determine impact.
5. Determine safest fix.
6. Check whether fix affects other models.
7. Only then propose a patch.

Do not make speculative changes such as:

adding random dependencies
upgrading torch
downgrading transformers
changing CUDA version
changing manifest schema
moving models to subprocesses
rewriting installer

unless evidence shows that the change is required.

---

REQUIRED OUTPUT

After the audit, provide:

1. Executive Summary

Short explanation of the actual architecture.

2. Exact Runtime Flow

Show:

request
→ task
→ worker
→ registry
→ provider
→ manifest
→ model venv
→ import
→ GPU

3. Dependency Installation Flow

Show exactly:

backend dependencies
vs
model dependencies
vs
weights

4. Per-Model Manifest Table

Include every YAML.

5. Dependency Gap Table

Use:

Model | Missing dependency | Evidence | Manifest path | Provider path | Severity

Only include confirmed or strongly evidenced issues.

6. Dependency Conflict Table

Package | Model A | Model B | Conflict risk | Evidence

7. Python Isolation Analysis

Clearly answer:

Separate process?
Separate interpreter?
Separate venv?
Separate sys.modules?
Separate CUDA context?

8. Model Switching Analysis

Trace:

A → B → A

and explain exactly what happens.

9. GPU Lifecycle Analysis

Explain model load/unload and CUDA memory behavior.

10. Confirmed Bugs

Only actual bugs.

11. Potential Risks

Things that need testing but are not yet proven bugs.

12. Recommended Fixes

Rank:

P0 — critical
P1 — high
P2 — medium
P3 — low

For every recommendation include:

file path
function/class
current behavior
proposed behavior
why
possible side effects

13. DO NOT IMPLEMENT YET

Unless explicitly instructed afterward, do not modify the repository.

The first deliverable is an evidence-backed audit report only.

---

FINAL RULE

Read "AGENTS.md" and all relevant project instructions first. Follow them exactly.

Do not blindly trust:

- README
- comments
- manifest names
- registry names
- assumptions about Python environments
- assumptions about pip package names

Always verify against actual source code and actual repository contents.

If two files disagree, show both and explain which one is authoritative according to actual execution.

No speculative coding. No blind rewrites. No dependency additions without evidence. No architecture changes without proof.