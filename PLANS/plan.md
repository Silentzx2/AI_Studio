You are the Principal 3D AI Engineer, ML Systems Architect, Graphics Engineer, Game-Asset Pipeline Engineer, and Senior Python/TypeScript engineer responsible for upgrading this existing AI Studio project into a production-grade local AI 3D asset generation platform comparable in workflow quality to commercial systems such as Tripo-style generators.

IMPORTANT:
This is an EXISTING production-oriented codebase. Do NOT rewrite the architecture blindly.
Do NOT create a parallel architecture.
Do NOT replace working systems just for style.
Do NOT add unnecessary dependencies.
Do NOT fake quality, progress, capabilities, model support, or validation.
Backend/runtime must remain the source of truth.
Read and obey AGENTS.md and all applicable .kilo rules before changing anything.

PRIMARY OBJECTIVE

Upgrade the current image-to-3D and text-to-3D generation stack so that generated assets are as close as realistically possible to production/game-ready quality.

The target is NOT merely “the model runs”.

The target is:

INPUT IMAGE / PROMPT
→ intelligent input analysis
→ model-specific preprocessing
→ correct official model inference path
→ high-quality geometry reconstruction
→ geometry validation
→ repair/completion when justified
→ topology optimization / retopology when appropriate
→ semantic-aware UV generation
→ texture generation
→ PBR material generation
→ texture baking / consistency validation
→ optional detail enhancement
→ scale/orientation normalization
→ non-destructive cleanup
→ game-oriented optimization
→ final validation
→ GLB/GLTF export
→ thumbnail + QA renders
→ final asset report

The generated result should aim to be “game-ready by default”, while preserving the original high-quality source asset internally.

Do NOT claim that every asset can literally be 80–90% game-ready.
Instead, engineer the pipeline toward that target and create measurable validation scores so we can objectively see how close an asset is.

==================================================
PHASE 0 — MANDATORY PROJECT AUDIT
==================================================

Before modifying code:

1. Read:
   - AGENTS.md
   - .kilo/rules/*
   - relevant .kilo/agent instructions
   - Docs/README.md
   - Docs/SYSTEM-BLUEPRINT.md
   - Docs/architecture.md
   - Docs/developer-guide.md
   - Docs/pipeline-status.md
   - Docs/api-documentation.md
   - latest changelog entries

2. Trace the real generation flow end-to-end:
   frontend request
   → API
   → task/worker
   → provider selection
   → model environment
   → model loading
   → image preprocessing
   → inference
   → texture generation
   → Blender processing
   → export
   → asset registration
   → frontend viewer

3. Inspect the actual implementation files, especially:
   - backend/app/core/providers/*
   - backend/runtime/*
   - backend/app/core/blender/*
   - backend/app/core/mesh_processor.py
   - backend/app/workers/tasks.py
   - generation schemas/routes
   - model manifests
   - workspace generation UI
   - any optimization/remesh/rigging modules

4. Build a ROOT-CAUSE matrix:
   - issue
   - file
   - current behavior
   - intended behavior
   - impact on quality
   - evidence
   - recommended fix
   - confidence

5. Do NOT trust comments/docs blindly.
   Verify claims against implementation.

6. Before every new function/class/dependency:
   ask whether an existing helper or subsystem can be reused.

==================================================
PHASE 1 — MODEL FIDELITY FIRST
==================================================

The biggest goal is to reproduce the intended official inference behavior of each model as closely as licensing and local execution permit.

For every provider:
- Hunyuan3D-2.1
- Hunyuan3D-2 Mini
- TRELLIS
- TripoSG
- DetailGen3D
- any other active provider

create a PROVIDER QUALITY CONTRACT.

For each provider document:

A. Official repository/version
B. Official model architecture
C. Official preprocessing
D. Official image background behavior
E. Official image normalization
F. Official inference arguments
G. Official default sampler settings
H. Official mesh extraction settings
I. Official texture pipeline
J. official post-processing
K. VRAM requirements
L. known limitations
M. expected best-use cases

Do not mix packages from different model generations unless explicitly verified compatible.

HUNYUAN3D-2.1 SPECIAL REQUIREMENT:

Audit the current implementation and verify whether it is actually using the official Hunyuan3D-2.1 shape and paint implementation, including the correct package/API family.

Do NOT assume that installing “hy3dgen” means we are correctly running Hunyuan3D-2.1.

Compare the local implementation against the official Tencent Hunyuan3D-2.1 repository and examples.

Correct any version/package mismatch that can affect geometry or texture quality.

Use the official Hunyuan3D-2.1 quality controls where applicable:
- seed
- num_inference_steps
- guidance_scale
- octree_resolution
- num_chunks
- face_count
- other official supported parameters

Do NOT expose fake frontend settings.
Every quality setting shown in UI must actually affect the selected provider OR be disabled/hidden for providers that do not support it.

==================================================
PHASE 2 — INTELLIGENT INPUT IMAGE PIPELINE
==================================================

Do NOT simply pass the user image directly to every model.

Build/reuse an intelligent preprocessing layer that can determine:

- subject/background separation
- transparency
- object bounding box
- subject occupancy ratio
- image resolution
- aspect ratio
- background complexity
- multiple subjects
- cropped body/partial object
- object orientation
- possible floor/ground contact
- shadows
- reflections
- silhouette quality

For image-to-3D:

1. Preserve original input.
2. Create model-specific normalized image.
3. Remove background only when beneficial.
4. Do not destroy useful object boundary information.
5. Center and scale subject intelligently.
6. Preserve aspect ratio when required.
7. Avoid over-cropping.
8. Avoid adding artificial backgrounds unless the model explicitly benefits.
9. Store preprocessing diagnostics.

Generate an input QA record:
- source resolution
- processed resolution
- foreground percentage
- crop box
- segmentation confidence
- warnings

IMPORTANT:
Do NOT blindly apply one preprocessing pipeline to every model.
Each provider should use the preprocessing expected by that provider.

==================================================
PHASE 3 — MULTI-STAGE RECONSTRUCTION
==================================================

The system must stop thinking of generation as one function call.

Use a staged pipeline:

STAGE A
Image understanding / conditioning

STAGE B
Base geometry generation

STAGE C
Geometry quality analysis

STAGE D
Optional mesh completion / repair

STAGE E
Topology / retopology

STAGE F
UV generation

STAGE G
Texture generation

STAGE H
PBR material generation

STAGE I
Detail enhancement

STAGE J
Game optimization

STAGE K
Validation

STAGE L
Export

Do not force every stage for every asset.

Use model capability metadata and asset classification to determine which stages are required.

==================================================
PHASE 4 — ASSET CLASSIFICATION
==================================================

Before deciding post-processing, classify the generated object when feasible:

- humanoid character
- animal
- creature
- hard-surface prop
- weapon
- vehicle
- furniture
- environment prop
- organic object
- stylized object
- generic unknown

The classifier can use:
- input image
- generated geometry
- semantic heuristics
- lightweight image model if already available
- existing AI capability infrastructure

Do not introduce a huge new model merely for classification unless necessary.

Use classification to choose pipeline presets.

Example:

ANIMAL:
- preserve ears/tail/legs/paws
- do not delete small disconnected anatomy blindly
- preserve silhouette
- use organic smoothing
- texture continuity prioritized

HARD SURFACE:
- preserve sharp edges
- stronger topology cleanup
- weighted normals/bevel only when justified
- avoid aggressive smoothing

CHARACTER:
- preserve symmetry where appropriate
- character-aware topology
- UV islands suitable for deformation
- optional rig preparation
- validate limbs/joints

==================================================
PHASE 5 — REMOVE DESTRUCTIVE POST-PROCESSING
==================================================

Audit the current Blender pipeline extremely carefully.

Never use generic cleanup rules that can destroy valid generated geometry.

In particular, do NOT blindly:
- keep only the largest disconnected island
- delete every small component
- replace existing UVs
- regenerate UVs when valid provider UVs already exist
- decimate textured meshes without preserving UV/materials
- fill every hole automatically
- merge geometry without topology validation

Examples of valid disconnected parts:
- ears
- horns
- tails
- claws
- handles
- wheels
- accessories
- separate eyes
- teeth
- armor pieces
- small props attached to a character

Replace “largest island only” behavior with intelligent component classification.

Components should be preserved or removed using measurable heuristics such as:
- relative volume
- bounding-box relationship
- distance from main body
- material/texture presence
- semantic position
- connectivity
- silhouette relevance

If a destructive heuristic is retained for some mode, clearly mark it with:
ponytail:
and explain its ceiling and upgrade path.

==================================================
PHASE 6 — UV PIPELINE
==================================================

UV quality must become a first-class production stage.

Requirements:

1. Preserve valid provider UVs.
2. Only regenerate UVs when:
   - missing
   - corrupt
   - unsuitable for target pipeline
3. Use deterministic UV strategies.
4. Minimize stretching.
5. Minimize wasted UV space.
6. Respect seams.
7. Avoid tiny unusable islands.
8. Preserve texture coordinates during optimization.
9. Support texture atlas generation.
10. Track texel density.

Implement diagnostics:
- UV coverage
- stretch estimate
- island count
- wasted space
- overlap detection
- out-of-bounds detection
- texel density estimate

Do not use `Smart UV Project` as a universal replacement for a production UV pipeline.

==================================================
PHASE 7 — TEXTURE + PBR
==================================================

Texture generation must be multi-view consistent and asset-aware.

For supported models, use the official/high-quality texture pipeline rather than a crude front projection fallback.

A simple single-view projection must never be silently presented as equivalent to neural multi-view texturing.

Required PBR outputs where supported:

- Base Color / Albedo
- Roughness
- Metallic
- Normal
- optional AO
- optional emissive when relevant

Texture quality modes:

DRAFT
STANDARD
HIGH
ULTRA

Map these modes to actual provider parameters.

Example behavior:
DRAFT:
- fast
- reduced texture resolution

STANDARD:
- balanced

HIGH:
- more inference steps
- higher texture resolution
- better baking

ULTRA:
- highest practical local settings
- slower
- max supported texture resolution

Do not fake ULTRA if provider does not support it.

==================================================
PHASE 8 — MULTIVIEW QUALITY BOOST
==================================================

Investigate whether an image-to-multiview stage can materially improve single-image reconstruction quality.

Commercial systems expose multiview generation and multiview-to-3D workflows.

Where practical:

single input
→ synthetic additional views
→ consistency checks
→ multi-image 3D reconstruction

However:

- do NOT automatically add this stage if it reduces quality
- do NOT generate views blindly
- do NOT introduce excessive VRAM usage
- allow automatic fallback to single-image generation
- use confidence-based routing

Add:
input_mode =
single_view
multi_view
auto

`auto` should select the best route based on available model capability and hardware.

==================================================
PHASE 9 — GEOMETRY QUALITY ANALYSIS
==================================================

After generation, run actual mesh diagnostics before any destructive processing.

Compute:

- triangle count
- vertex count
- connected components
- non-manifold edges
- boundary edges
- self intersections if feasible
- degenerate faces
- zero-area triangles
- normal consistency
- bounding box
- aspect ratios
- scale
- manifoldness
- isolated geometry
- density
- surface irregularity
- UV validity
- material integrity

Do not simply “clean until it looks okay”.

Generate a machine-readable quality report.

Example:

{
  "geometry_score": 0.91,
  "topology_score": 0.84,
  "uv_score": 0.94,
  "texture_score": 0.89,
  "material_score": 0.92,
  "game_ready_score": 0.87,
  "warnings": [...]
}

The score must be based on real measurable criteria.

==================================================
PHASE 10 — GAME-READY OPTIMIZATION
==================================================

The original generated mesh should be preserved.

Create:
SOURCE_ASSET
and
GAME_READY_ASSET

Do not destroy the original high-quality asset.

Optimization should be target-based rather than blindly reducing everything.

Support target profiles:

MOBILE
LOW
MEDIUM
HIGH
CINEMATIC

For each target:
- triangle budget
- texture resolution
- material count
- draw-call target
- UV requirements
- normal requirements
- collision recommendation
- optional LOD levels

Generate LODs when appropriate:

LOD0 = source/high quality
LOD1 = optimized
LOD2 = lower
LOD3 = distant

Do not destroy silhouette-critical details.

For organic objects:
preserve silhouette and anatomy.

For hard surface:
preserve edges and design lines.

==================================================
PHASE 11 — RETOPOLOGY / MESH OPTIMIZATION
==================================================

Audit existing DetailGen3D / remesh / PyMeshLab / Blender capabilities.

Prefer the best existing installed solution.

Do not add multiple overlapping mesh optimization systems.

Separate:

A. geometry repair
B. simplification
C. retopology
D. UV rebuild
E. texture rebake

They are not the same operation.

Where a provider already produces acceptable topology:
do not retopologize unnecessarily.

Where source topology is poor:
run retopology only when needed.

Preserve:
- texture coordinates
- material assignments
- normals
- silhouette
- sharp features

==================================================
PHASE 12 — MATERIAL AND TEXTURE CONSISTENCY
==================================================

Validate that:

geometry
+
UVs
+
materials
+
textures

still correspond after every transformation.

Every mesh-transform stage must have invariants:

BEFORE:
mesh hash / topology metadata / UV presence / material count

AFTER:
compare for unintended loss

If an operation changes UVs, explicitly mark it.

If an operation strips materials, fail validation rather than silently exporting a damaged asset.

==================================================
PHASE 13 — NORMALS / SHADING
==================================================

Improve visual quality through correct normals and shading.

Add safe handling for:
- face winding
- split normals
- smooth/flat shading
- auto smooth equivalent where supported
- weighted normals where beneficial
- tangent consistency
- normal map compatibility

Do not globally smooth every mesh.

Organic and hard-surface assets need different shading strategies.

==================================================
PHASE 14 — SCALE / ORIENTATION / TRANSFORMS
==================================================

Every exported asset must have predictable:

- orientation
- up axis
- forward axis
- origin
- scale
- transforms

Add automatic normalization based on target engine profile.

Do not arbitrarily rescale mesh geometry without retaining source metadata.

Support:
- Blender
- Unity
- Unreal
as export profiles where practical.

==================================================
PHASE 15 — GAME-READY VALIDATION
==================================================

Create an actual asset validation system.

Validation categories:

GEOMETRY
TOPOLOGY
UV
TEXTURE
MATERIAL
TRANSFORMS
EXPORT
RIG
PERFORMANCE

Example final report:

GAME READY: PASS / WARN / FAIL

Geometry:
PASS

Topology:
WARN - 3 non-manifold edges

UV:
PASS

Textures:
PASS

Materials:
PASS

Triangle budget:
PASS

LOD:
PASS

Scale:
PASS

Export:
PASS

Do not let a failed validation silently look like success.

==================================================
PHASE 16 — RIGGING
==================================================

Do NOT automatically rig everything.

For character-capable assets:

1. Determine whether object is riggable.
2. Run rig compatibility checks.
3. Normalize pose/orientation.
4. Attempt rigging.
5. Validate weights.
6. Detect catastrophic weight assignments.
7. Provide rig-ready and unrigged outputs separately.

The current basic human Rigify metarig logic must NOT be used blindly for animals or non-human characters.

Create type-aware rig routing.

At minimum distinguish:
- human
- quadruped
- generic humanoid
- non-rigged prop

If the system cannot safely rig something:
return a truthful “rig preparation only / rigging unavailable” state.

==================================================
PHASE 17 — ASSET PRESETS
==================================================

Create provider-aware presets instead of one generic quality switch.

Example:

HUNYUAN_ULTRA
HUNYUAN_HIGH
TRELLIS_HIGH
TRIPOSG_HIGH
FAST_PREVIEW
GAME_READY
CINEMATIC

Presets should define real parameters.

No fake options.

Store preset definitions in the existing manifest/config system if that matches project architecture.

==================================================
PHASE 18 — HARDWARE-AWARE QUALITY ROUTING
==================================================

The system must adapt quality to available VRAM without silently degrading to broken inference.

Detect:
- GPU
- VRAM
- CUDA
- compute capability
- available system RAM
- model capability
- expected peak VRAM

Then choose:

BEST_QUALITY
BALANCED
LOW_VRAM
FAST

Important:
LOW_VRAM must not mean “use a fundamentally different lower-quality path” unless explicitly documented.

Where CPU offloading is used:
verify correctness and compare output quality.

Avoid excessive offloading if sufficient GPU memory exists.

==================================================
PHASE 19 — QUALITY BENCHMARK SUITE
==================================================

Create a local benchmark/evaluation workflow.

Use a fixed test set containing:
- dog
- human character
- hard-surface prop
- vehicle
- furniture
- organic object
- stylized character

For each:
- fixed source image
- fixed seed
- same provider
- same requested quality

Generate:
- raw mesh
- processed mesh
- final game-ready mesh
- thumbnails from multiple angles

Measure:
- triangle count
- topology errors
- UV quality
- texture quality
- material retention
- silhouette preservation
- geometry completeness

Keep before/after metrics.

The purpose is to prove that quality actually improved.

==================================================
PHASE 20 — DEBUGGING THE CURRENT QUALITY ISSUE
==================================================

Specifically reproduce the reported issue:

Same dog image:
1. Upload to AI Studio
2. Generate using Hunyuan3D-2.1
3. Generate using any currently supported alternative provider
4. Compare raw provider output
5. Compare post-processed output
6. Compare final exported GLB

The debugging must determine:

CASE A:
Raw provider output is already poor
→ inference/model/preprocessing issue.

CASE B:
Raw provider output is good but Blender output becomes poor
→ post-processing/export issue.

CASE C:
Geometry is good but textures are poor
→ texture pipeline issue.

CASE D:
Only viewer appears bad
→ frontend rendering/material issue.

Do not guess.
Capture artifacts and compare each stage.

==================================================
PHASE 21 — DO NOT REPEAT EXISTING FIXES
==================================================

The project already contains fixes related to:
- background removal
- GPU placement
- TripoSG fallback
- texture output selection
- model-aware optimization
- Blender processing
- dependency compatibility

Verify each one before modifying it.

Improve only where the implementation is actually insufficient.

==================================================
PHASE 22 — WHAT “COMMERCIAL-LIKE” MEANS
==================================================

Do NOT interpret “Tripo-like” as copying proprietary implementation.

The objective is to reproduce the WORKFLOW CHARACTERISTICS:

- high-fidelity initial generation
- consistent preprocessing
- multi-stage processing
- model-aware routing
- texture quality
- PBR materials
- intelligent retopology
- good UVs
- mesh cleanup
- asset validation
- game-oriented optimization
- LODs
- optional rigging
- deterministic settings
- source asset preservation
- truthful status reporting

The system should feel like a professional 3D asset factory, not just a model inference demo.

==================================================
PHASE 23 — DEPENDENCY POLICY
==================================================

Before adding any package:

1. Check whether the project already has an equivalent.
2. Check whether the selected provider already bundles it.
3. Check whether Blender/PyMeshLab/Open3D/Trimesh/etc. already solves the requirement.
4. Add a new dependency only when technically justified.

Never introduce a large ML model just to solve a problem that can be handled deterministically.

==================================================
PHASE 24 — PERFORMANCE
==================================================

Quality must improve without making inference unnecessarily slow.

Use:
- lazy loading
- model warm cache
- memory cleanup
- device reuse
- batching only where beneficial
- cached preprocessing
- deterministic seed support
- asynchronous job execution
- existing worker infrastructure

Do not sacrifice output quality solely to make progress bars faster.

Do not fake progress percentages.

==================================================
PHASE 25 — FAILURE HANDLING
==================================================

Every stage must fail safely.

Example:

Texture generation failed
→ retain valid geometry
→ mark texture stage WARN
→ do not claim “fully textured”

UV stage failed
→ do not export broken UVs as production-ready

Retopology failed
→ retain source mesh
→ mark fallback

Rigging failed
→ preserve unrigged asset
→ mark rigging unavailable

Validation failed
→ export source asset only if safe
→ clearly mark game-ready status

==================================================
PHASE 26 — FRONTEND QUALITY CONTROL
==================================================

Audit the generation UI.

Every visible setting must map to an actual backend behavior.

Settings should include where supported:

- model
- quality
- seed
- texture
- PBR
- target platform
- optimization
- LOD
- rigging
- output format

Provider-specific unsupported settings should be hidden or disabled with an explanation.

Do not let frontend send meaningless values.

==================================================
PHASE 27 — OBSERVABILITY
==================================================

For every job record:

- provider
- model version
- model weights revision if available
- seed
- inference parameters
- preprocessing mode
- post-processing preset
- mesh stats
- texture stats
- validation score
- final game-ready score
- warnings
- failed stages
- timings
- peak VRAM

This is required for debugging quality.

==================================================
PHASE 28 — DOCUMENTATION
==================================================

After implementation, update relevant Markdown documentation as required by AGENTS.md.

At minimum document:

- architecture changes
- provider quality contracts
- generation pipeline
- presets
- quality settings
- game-ready validation
- optimization profiles
- benchmark methodology
- known limitations
- hardware requirements
- troubleshooting

Do not leave documentation claiming something the code does not implement.

==================================================
PHASE 29 — TESTING
==================================================

After implementation:

1. Run existing tests.
2. Add the smallest meaningful regression tests.
3. Run syntax/import checks.
4. Verify every provider imports.
5. Verify model loading.
6. Run smoke generation.
7. Run Blender processing.
8. Run export.
9. Validate generated GLB.
10. Verify texture/material integrity.
11. Verify frontend build.
12. Verify no existing API contract broke.

For non-trivial logic, leave at least one runnable check as required by AGENTS.md.

==================================================
PHASE 30 — IMPLEMENTATION ORDER
==================================================

Do NOT attack everything at once.

Use this priority:

P0:
1. Reproduce the bad dog-generation case.
2. Trace raw vs processed output.
3. Fix actual root cause.
4. Correct official model inference fidelity.
5. Remove destructive geometry/UV processing.
6. Fix texture pipeline fidelity.

P1:
7. Geometry diagnostics.
8. Smart component handling.
9. UV validation/preservation.
10. PBR texture pipeline.
11. Intelligent post-processing.
12. Game-ready validation.

P2:
13. Retopology.
14. LOD generation.
15. asset profiles.
16. rigging routing.
17. multiview enhancement.
18. benchmark suite.

P3:
19. polish/performance/UI improvements.

==================================================
STRICT ENGINEERING CONSTRAINTS
==================================================

- Read AGENTS.md before coding.
- Do not rewrite architecture.
- Do not invent APIs.
- Do not invent provider capabilities.
- Do not fake progress.
- Do not fake quality.
- Do not silently downgrade.
- Do not delete valid geometry.
- Do not replace valid UVs without justification.
- Do not discard source-quality assets.
- Do not add unnecessary dependencies.
- Do not duplicate existing utilities.
- Do not silently swallow critical failures.
- Do not call an asset “game-ready” unless validation supports it.
- Preserve backwards compatibility.
- Preserve existing API routes unless change is genuinely necessary.
- Keep model-specific logic isolated from unrelated providers.
- Prefer official upstream implementations when compatible.
- Verify every claimed improvement using real output.

==================================================
FINAL DELIVERABLE
==================================================

At the end, produce:

1. ROOT_CAUSE_REPORT.md
   - exact cause of current low quality
   - evidence
   - files/functions involved
   - before/after behavior

2. 3D_QUALITY_PIPELINE.md
   - complete production pipeline
   - stage responsibilities
   - provider routing
   - presets

3. GAME_READY_SPEC.md
   - measurable game-ready criteria
   - validation rules
   - platform budgets

4. QUALITY_BENCHMARK.md
   - test assets
   - parameters
   - before/after results

5. Update existing docs according to AGENTS.md.

6. Final response must contain:
   - exact files changed
   - exact root causes
   - exact fixes
   - actual tests run
   - actual benchmark results
   - remaining limitations
   - any unresolved quality bottleneck

MOST IMPORTANT:

Do not optimize for the appearance of progress.

Optimize for actual output quality.

A model loading successfully is NOT success.

A mesh being generated is NOT success.

A GLB being exported is NOT success.

SUCCESS means:

INPUT
→ CORRECT MODEL INFERENCE
→ GOOD GEOMETRY
→ GOOD UVs
→ GOOD PBR MATERIALS
→ PRESERVED DETAIL
→ VALID TOPOLOGY
→ OPTIMIZED GAME ASSET
→ VERIFIED EXPORT

with measurable evidence at every critical stage.