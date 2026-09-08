# AI Studio — Plan 2: UI Controls + Export System Integration

## Objective

Upgrade the existing AI Studio UI so that the newly improved 3D-generation/post-processing pipeline is actually controllable from the product UI and the Export flow can produce the requested asset variants without state mismatches.

This plan is intentionally focused on **UI controls, workflow state, export controls, backend contract alignment, and integration with the already-planned pipeline improvements**.

Do NOT redesign the entire AI generation pipeline again in this task. Assume the generation-quality/pipeline improvements from the previous plan are the source of truth and integrate the UI/export layer with them correctly.

---

## Mandatory Rules

1. Read and obey `AGENTS.md` and all applicable agent rules before changing code.
2. Re-read the existing workspace docs relevant to UI, generation, jobs, and export.
3. Do not create a second generation settings system if an existing one can be extended.
4. `WorkspaceContext` remains the canonical client-side workflow state.
5. FastAPI/backend remains the source of truth for execution capability and final asset state.
6. Every UI switch must map to a real backend behavior.
7. Never show a toggle as enabled when the selected model/provider cannot actually perform that stage.
8. Never silently discard an enabled stage.
9. Never silently enable a disabled stage.
10. Preserve existing API compatibility unless a change is required for correctness.
11. Do not add fake export formats or fake export capabilities.
12. Do not generate a fake LOD/rig/texture file merely to satisfy the UI.
13. Do not break the existing model manager, generation, remesh, texture, or asset viewer workflows.
14. Reuse existing UI primitives/components and existing API utilities wherever possible.

---

# 1. Current-Code Integration Findings

The existing project already has:

- `features/new-workspace/Panels/GeneratePanel.tsx`
- `features/new-workspace/store/WorkspaceContext.tsx`
- `features/new-workspace/types.ts`
- `features/new-workspace/Modals/ExportModal.tsx`
- `backend/app/schemas/generation.py`
- `backend/app/api/v1/generation.py`
- `backend/app/api/v1/project.py`
- `backend/app/core/blender/pipeline.py`
- `backend/app/core/blender/scripts/process_mesh.py`
- provider capability/manifest infrastructure
- model-aware optimization settings
- texture controls
- auto-rig field
- project export endpoint with layer toggles

Important current mismatch:

`backend/app/api/v1/project.py` already accepts:

- `layers`
- `assembleAll`
- `includeOriginals`
- `texture`
- `rigging`
- `animation`
- `lod`

but the current `ExportModal.tsx` does not expose those controls and primarily downloads the current source asset directly.

Therefore the new implementation must connect:

`Workspace UI state`
→ `canonical generation/pipeline state`
→ `stored job metadata`
→ `asset state`
→ `export state`
→ `backend export endpoint`

without creating duplicate truth.

---

# 2. Core UX Requirement

The user wants the controls for pipeline stages to be visible at the point where they matter.

Example:

If the user wants LODs, they must be able to choose LOD generation either:

A. during generation, when LOD generation is configured as a generation/post-process stage,
OR
B. later at export time, when the system can generate/export LOD variants from an existing master asset,

but the UI must clearly distinguish these two cases.

Do NOT create a misleading toggle that appears to “enable LOD” but only changes a label.

The same principle applies to:

- texture generation
- PBR material generation
- topology optimization
- UV repair
- retopology
- detail enhancement
- game optimization
- LOD generation
- rigging
- collision generation
- animation inclusion

Only stages that are actually implemented and executable should be exposed.

---

# 3. Introduce a Canonical Pipeline Options Model

Extend the existing `GenerationSettings` instead of creating another unrelated settings object.

Add fields as required by the already-existing pipeline implementation, using consistent camelCase on the frontend.

Suggested shape:

```ts
interface GenerationPipelineOptions {
  generateTexture: boolean;
  generatePBR: boolean;
  optimizeMesh: boolean;
  repairUVs: boolean;
  preserveDetails: number;
  targetPolycount?: number;
  retopology: boolean;
  detailEnhancement: boolean;
  generateLOD: boolean;
  lodPreset?: 'mobile' | 'low' | 'medium' | 'high' | 'custom';
  lodCount?: number;
  autoRig: boolean;
  generateCollision: boolean;
  targetPlatform?: 'generic' | 'mobile' | 'low' | 'medium' | 'high' | 'cinematic';
}
```

Do not add every field blindly.

First inspect the final pipeline implementation from the previous plan and only expose fields that have real backend support.

If a stage is not ready, do not expose a fake switch for it.

---

# 4. Generation UI Controls

Update `GeneratePanel.tsx` so the user can configure the complete generation/post-processing intent before pressing Generate.

The UI should remain compact and Tripo-style, not turn into a giant settings page.

Recommended sections:

## A. Core Generation

- Model
- Quality
- Seed
- Guidance only when meaningful/supported
- Background removal only when meaningful/supported
- Texture generation toggle

## B. Asset Quality / Processing

Collapsible section containing only supported stages:

- Optimize Mesh
- Repair UVs
- Preserve Details
- Target Polygon Budget
- Retopology, when supported
- Detail Enhancement, when supported
- PBR generation, when supported

## C. Game Ready

Optional collapsed section:

- Game Ready Mode
- Target Platform
- Generate LODs
- LOD preset
- LOD count
- Collision mesh
- Rigging

The default UI should remain simple.

Advanced controls should be hidden behind an expandable section.

---

# 5. Toggle Semantics

Every toggle must have explicit semantics.

Example:

### Generate Texture

ON:
- request the texture stage
- backend/provider decides whether supported
- if unsupported, UI prevents enabling it

OFF:
- generate mesh-only
- export must not falsely claim textured output

### Optimize Mesh

ON:
- invoke the real optimization stage after generation

OFF:
- preserve the source/master mesh
- do not silently decimate during export unless the user explicitly requests a game-ready export variant

### Repair UVs

ON:
- repair only when needed
- preserve valid provider UVs

OFF:
- do not run UV repair unnecessarily

### Generate LODs

ON:
- produce LOD metadata/artifacts according to the selected LOD preset/count
- store the resulting LOD state on the asset/job

OFF:
- no LOD artifacts should be generated or claimed to exist

### Auto Rig

ON:
- only enable for assets/providers/pipeline modes that support safe rigging
- run type-aware rigging logic

OFF:
- export without rig unless an already-rigged source asset is explicitly being exported

### Collision

ON:
- generate actual collision geometry when supported

OFF:
- no collision asset in the export package

---

# 6. Model-Aware Capability Logic

Use the existing manifest/provider capability system.

Do not hardcode:

```ts
if (model === 'x') supportsLOD = true;
```

Prefer a capability-driven system.

The UI should query/use backend capabilities such as:

- texture generation
- PBR
- rigging
- optimization
- remesh/retopology
- LOD
- collision
- multiview
- low VRAM

If the backend does not report a capability, default to unavailable rather than pretending support.

Add tooltips explaining why a control is disabled.

Example:

`Rigging unavailable for this provider`

not

`Coming soon`

unless that is genuinely a product-state message.

---

# 7. LOD UX — Important

LOD must work in two coherent modes if the backend supports both.

## Mode A — Generate-Time LOD

User configures:

```text
Generate
 ├── Optimize Mesh ✓
 ├── Game Ready ✓
 └── Generate LODs ✓
       ├── Preset: High
       └── LOD Count: 4
```

The job pipeline produces:

- LOD0/source master
- LOD1
- LOD2
- LOD3

and stores the LOD metadata with the resulting asset.

## Mode B — Export-Time LOD

For an already-generated asset, Export can provide:

`Generate LODs for Export`

This must run a real export/processing job against the stored source/master asset.

Do not confuse “include existing LODs” with “generate LODs now”.

Use distinct labels:

- `Use Existing LODs`
- `Generate LODs`

Never use a generic `LOD` checkbox for both behaviors.

---

# 8. Export Modal Rewrite

`features/new-workspace/Modals/ExportModal.tsx` needs to become a real export configuration UI.

The current modal supports only a small subset of formats and primarily performs client-side download of the current source URL.

Replace that behavior with a backend-aware export flow while preserving simple one-click export.

## Export UI Structure

### A. Asset Variant

Provide:

- Source / Master
- Game Ready
- Existing LOD Package, when available

If the asset does not have a game-ready version, the UI should show:

`Generate Game Ready on Export`

rather than pretending it exists.

### B. Export Format

Only show actually supported formats:

- GLB
- GLTF
- OBJ
- FBX
- STL
- PLY

Only expose a format if the backend/exporter can actually produce it.

Do not claim that merely changing a file extension performs conversion.

### C. Export Components

Provide toggles/checks for:

- Textures
- PBR materials
- Rig
- Animations
- LODs
- Collision mesh
- Metadata
- QA report

Only expose a control when the corresponding artifact exists or can genuinely be generated.

### D. LOD Export Options

When LOD is enabled:

- Use Existing LODs
- Generate LODs
- LOD preset
- LOD count

### E. Quality / Target

When generating a game-ready export variant:

- Mobile
- Low
- Medium
- High
- Cinematic

Use the backend's actual optimization profiles.

### F. Package Options

Offer:

- Single asset file
- Textures as separate files
- Complete ZIP package

Complete ZIP should include only files that actually exist.

---

# 9. Export Backend Contract

Extend `backend/app/api/v1/project.py` only as necessary.

The export request should become explicit rather than relying on a loosely structured `layers` array alone.

A compatible request can retain `layers`, but add a validated structure for the new export options.

Example conceptual model:

```py
class ExportOptions(BaseModel):
    variant: Literal['source', 'game_ready', 'lod_package'] = 'source'
    format: str = 'glb'
    include_textures: bool = True
    include_pbr: bool = True
    include_rig: bool = False
    include_animations: bool = False
    include_lods: bool = False
    include_collision: bool = False
    include_metadata: bool = True
    include_qa_report: bool = True
    generate_lods: bool = False
    lod_preset: str | None = None
    lod_count: int | None = None
    target_platform: str | None = None
    package_zip: bool = False
```

Adapt to the actual architecture instead of blindly copying this schema.

The API must validate combinations.

Examples:

- `include_lods=true` with no existing LODs and `generate_lods=false` → explicit warning/error or safe fallback, never silent success.
- `include_rig=true` when no rig exists → explicit error/warning and do not pretend the rig is present.
- `format=stl` with textures enabled → STL cannot carry the same PBR material package; export mesh correctly and explain that textures are not embedded.
- `package_zip=true` → return a real archive containing actual outputs.

---

# 10. Export Processing Architecture

Do not run expensive Blender/export work in the browser.

Frontend:

`ExportModal`
→ API request
→ backend export/processing job
→ progress tracking
→ final artifact URLs
→ download

Use the existing job/worker infrastructure whenever possible.

Do not create a separate ad-hoc export execution engine.

---

# 11. Export Result Contract

The backend should return a structured result rather than only a raw file URL.

Conceptual result:

```json
{
  "status": "completed",
  "variant": "game_ready",
  "format": "glb",
  "file_url": "...",
  "package_url": "...",
  "artifacts": {
    "source": "...",
    "game_ready": "...",
    "lod": ["...", "...", "...", "..."],
    "textures": ["..."],
    "collision": ["..."],
    "metadata": "...",
    "qa_report": "..."
  },
  "stats": {
    "triangles": 32000,
    "vertices": 18000,
    "materials": 2,
    "texture_resolution": "2048"
  },
  "validation": {
    "game_ready_score": 91,
    "status": "pass"
  }
}
```

Use the actual project response conventions.

Do not expose URLs for artifacts that do not exist.

---

# 12. Asset State / Availability

The frontend asset model must understand whether an asset has:

- source/master
- game-ready
- LODs
- textures
- PBR
- rig
- animations
- collision
- metadata
- QA report

Do not infer these from filenames.

Prefer backend metadata/job result fields.

Extend `ModelAsset` only as needed.

Potential shape:

```ts
interface AssetArtifacts {
  source?: string;
  gameReady?: string;
  lods?: string[];
  textures?: string[];
  pbr?: string[];
  rig?: string;
  animations?: string[];
  collision?: string[];
  metadata?: string;
  qaReport?: string;
}
```

Again, adapt to the existing asset architecture rather than duplicating data structures.

---

# 13. Generation → Export State Synchronization

When the user changes generation settings:

- snapshot the effective settings at job creation
- store them in job metadata
- show the effective settings with the resulting asset

Important:

A later change in UI settings must NOT retroactively alter an already-generated asset.

Example:

Generation:

`LOD OFF`

Asset created.

Later:

`Export → Generate LODs`

Only the export variant gets LODs.
The original asset remains LOD-free.

---

# 14. UI State Persistence

Use the existing `WorkspaceContext` state system.

Persist only sensible user preferences.

Recommended persistent preferences:

- default quality
- default texture toggle
- default optimization toggle
- default game-ready toggle
- default target platform
- default LOD preference
- default export format

Do NOT persist transient job state as user preferences.

---

# 15. Smart Dependency Between Controls

Controls should intelligently respond to one another.

Examples:

### Texture OFF
Disable:
- texture-specific quality controls
- texture-only export settings

### Optimize OFF
Disable:
- preserve-details slider
- target-poly slider

### LOD OFF
Hide or disable:
- LOD preset
- LOD count

### Rig OFF
Disable:
- animation export inclusion when the animation depends on generated rigging

### Game Ready OFF
Hide advanced platform budget controls unless explicitly exporting a game-ready variant.

Do not reset unrelated user choices just because a parent toggle is temporarily disabled.

---

# 16. Preview / Summary Before Generation

Add a compact `Pipeline Summary` area near the Generate button.

Example:

```text
Hunyuan3D 2.1
High Quality
Texture ✓
Optimize ✓ 35k tris
Game Ready ✓
LOD ×4
Rig — Auto
Collision ✓
```

This summary must reflect the actual request that will be sent to the backend.

Never display settings that are not actually being submitted.

---

# 17. Preview / Summary Before Export

Similarly, Export should show:

```text
Export

Variant: Game Ready
Format: GLB
Textures: ON
PBR: ON
LOD: 4
Rig: OFF
Collision: ON
Metadata: ON
QA Report: ON

[Export]
```

The user should be able to understand exactly what will be produced.

---

# 18. Progress UI

Export may invoke expensive operations.

Use the existing progress/event system.

Show real stages such as:

```text
Preparing export
Generating LODs
Optimizing mesh
Preparing UVs
Packaging textures
Validating asset
Creating GLB
Packaging ZIP
Complete
```

Do not invent percentages.

If the backend provides stage progress, use that.

If it cannot provide reliable percentage progress, show an indeterminate/progress-by-stage state rather than fake numbers.

---

# 19. Capability-Aware Export Formats

Format availability must be backend-driven.

Example:

```text
GLB     ✓
GLTF    ✓
OBJ     ✓
FBX     ✓/depends on exporter
STL     ✓
PLY     ✓
```

Do not expose FBX simply because it is listed in a TypeScript union if the current exporter cannot actually generate it.

Correct backend support first, then expose it.

---

# 20. Important STL Behavior

STL is geometry-only.

When the user selects STL:

- disable/hide texture embedding
- disable/hide PBR material options
- warn that only geometry is exported
- keep the mesh manifold/print-safe where possible

Do not export a `.glb` file with `.stl` extension.

---

# 21. Complete ZIP Package

Implement a real package export when requested.

Example:

```text
Dog_Asset.zip
├── Source/
│   └── dog_source.glb
├── GameReady/
│   └── dog_game_ready.glb
├── LOD/
│   ├── dog_LOD0.glb
│   ├── dog_LOD1.glb
│   ├── dog_LOD2.glb
│   └── dog_LOD3.glb
├── Textures/
│   ├── BaseColor.png
│   ├── Normal.png
│   ├── Roughness.png
│   ├── Metallic.png
│   └── AO.png
├── Collision/
│   └── dog_collision.glb
├── Metadata/
│   └── asset_metadata.json
└── QA/
    └── quality_report.json
```

Only include directories/artifacts that actually exist.

Do not create empty placeholder files.

---

# 22. Quality Score Visibility

The UI should show the final validation result when available:

```text
Game Ready Score: 91/100
Status: PASS
```

And warnings:

```text
Topology: PASS
UV: PASS
Materials: PASS
LOD: PASS
Collision: WARN
```

The score must come from backend validation.

Never calculate an arbitrary frontend score from triangle count alone.

---

# 23. Export History / Asset Variants

When export creates a new variant, do not overwrite the source asset.

Example:

```text
Dog_Original
Dog_GameReady
Dog_GameReady_LOD
```

Store variant relationships if the existing asset system supports them.

The UI should make it obvious which file is the source/master and which is generated/optimized.

---

# 24. Existing Backend Export Endpoint — Required Audit

Audit and, where required, fix:

`backend/app/api/v1/project.py`

Specifically verify:

- path resolution
- format validation
- layer handling
- LOD behavior
- rig behavior
- animation behavior
- texture stripping
- collision handling
- package generation
- file naming
- cleanup of temporary export directories
- security/path traversal
- error reporting

The existing `_resolve_model_path` logic must remain secure.

Do not weaken it while adding new artifact handling.

---

# 25. Blender Export Pipeline Integration

Audit:

- `backend/app/core/blender/pipeline.py`
- `backend/app/core/blender/scripts/process_mesh.py`

The export pipeline must respect explicit options.

Do not let the Blender script apply transformations merely because a generic export is running.

Especially verify:

- no accidental re-decimation
- no accidental UV destruction
- no accidental removal of disconnected valid components
- no unwanted armature removal when rig is requested
- no unwanted material removal when textures/PBR are requested
- no fake LOD generation
- no accidental collision omission

Separate source-preserving export from game-ready processing.

---

# 26. Do Not Repeat Earlier Pipeline Work

This plan is NOT asking the agent to reimplement the entire model-quality pipeline from scratch.

The previously planned pipeline improvements are assumed to exist or be under implementation.

This task is specifically:

`UI controls + canonical state + backend contract + export pipeline integration + artifact visibility`

The agent should connect the controls to those pipeline features correctly.

If an earlier pipeline feature is missing entirely, stop at the integration boundary, report the missing capability, and only add the minimal adapter needed for a clean contract.

Do not branch into an unrelated rewrite.

---

# 27. Files to Audit / Likely Change Set

Frontend:

- `features/new-workspace/Panels/GeneratePanel.tsx`
- `features/new-workspace/store/WorkspaceContext.tsx`
- `features/new-workspace/types.ts`
- `features/new-workspace/Modals/ExportModal.tsx`
- `features/new-workspace/RightPanel/RightAssetsPanel.tsx`
- `features/new-workspace/lib/api.ts`
- `services/apiClient.ts`
- any existing generation/settings components

Backend:

- `backend/app/schemas/generation.py`
- `backend/app/api/v1/generation.py`
- `backend/app/api/v1/project.py`
- `backend/app/workers/tasks.py`
- `backend/app/core/blender/pipeline.py`
- `backend/app/core/blender/scripts/process_mesh.py`
- asset/job models if metadata persistence requires it
- export/registry utilities where appropriate

Do not modify all of these automatically.

Only touch files required by the real dependency graph.

---

# 28. API Backward Compatibility

Existing generation requests must continue to work.

Existing fields such as:

- `generate_texture`
- `auto_rig`
- `auto_optimize`
- `auto_optimize_settings`
- `low_vram`
- `vram_mode`

must remain compatible.

New fields should be optional/defaulted where possible.

Do not remove old request keys merely because new pipeline fields were added.

---

# 29. Testing Requirements

Add/extend tests for:

## Generation settings

- every toggle serializes correctly
- disabled stage remains disabled
- unsupported capability cannot be enabled
- model switch updates capability-dependent controls correctly
- texture toggle still behaves correctly with non-texture providers

## Export

- source GLB export
- game-ready export
- LOD existing export
- LOD generation on export
- texture stripping
- rig inclusion/exclusion
- animation inclusion/exclusion
- collision inclusion/exclusion
- metadata inclusion
- QA report inclusion
- ZIP package generation
- unsupported format handling
- STL texture behavior
- missing artifact handling

## Regression

- generation still works
- remesh still works
- texture generation still works
- current asset viewer still loads generated GLB
- existing model naming behavior remains intact
- existing warm-cache/runtime behavior is unaffected

---

# 30. UI Validation

Use the project's existing browser/UI verification tooling where available.

Verify at minimum:

1. Generate panel with texture-capable model
2. Generate panel with texture-incapable model
3. Generate panel with low-VRAM-capable model
4. Game Ready controls
5. LOD control visibility/state
6. Rigging capability state
7. Export modal
8. Export modal with LOD disabled
9. Export modal with LOD enabled
10. Export modal with STL selected
11. ZIP export configuration
12. error state
13. long export/progress state

No control may be visually clipped or hidden by the modal footer/scroll container.

---

# 31. Final UX Goal

The final workflow should feel like this:

```text
UPLOAD IMAGE
     ↓
SELECT MODEL
     ↓
SELECT QUALITY
     ↓
OPTIONAL PIPELINE CONTROLS
     ├─ Texture
     ├─ Optimize
     ├─ UV Repair
     ├─ Game Ready
     ├─ LOD
     ├─ Rig
     └─ Collision
     ↓
GENERATE
     ↓
MASTER ASSET
     ↓
VIEW / VALIDATE
     ↓
EXPORT
     ├─ Source
     ├─ Game Ready
     ├─ LOD package
     ├─ GLB/GLTF/OBJ/FBX/STL/PLY (only when truly supported)
     ├─ Textures/PBR
     ├─ Rig/Animations
     ├─ Collision
     ├─ Metadata
     ├─ QA Report
     └─ Complete ZIP
```

The UI must make the available pipeline capabilities visible without forcing the user to understand the internal architecture.

---

# 32. Final Engineering Acceptance Criteria

The work is complete only when all of the following are true:

- Generation settings map 1:1 to actual backend behavior.
- Pipeline-stage toggles are model/provider capability aware.
- LOD can be explicitly configured rather than being an invisible backend behavior.
- Export can distinguish source/master vs game-ready variants.
- Export can include or exclude supported pipeline artifacts explicitly.
- Existing LODs and newly generated LODs are clearly distinguished.
- Export never claims artifacts that do not exist.
- Unsupported formats are not exposed as functional options.
- STL behavior is truthful about materials/textures.
- Source assets are never overwritten by optimization/export variants.
- Export is processed server-side/worker-side for expensive operations.
- Progress is real.
- Validation results are visible when available.
- Complete ZIP contains actual artifacts only.
- Existing workspace generation, remesh, texture, model manager, and viewer workflows remain functional.
- Tests and UI verification pass.

---

# Final Deliverables

1. Updated generation UI with capability-aware pipeline toggles.
2. Updated `GenerationSettings`/state contract.
3. Updated generation API request contract where required.
4. Fully functional export configuration modal.
5. Backend export contract aligned with the UI.
6. Real LOD/export artifact handling where supported.
7. Source/Game-Ready variant handling.
8. Real multi-artifact ZIP export where supported.
9. Metadata/QA artifact handling.
10. Tests and UI verification.
11. Documentation updates for the new UI/export contract.
12. A concise final report describing:
    - files changed
    - controls added
    - backend endpoints/contracts changed
    - export formats actually supported
    - LOD behavior
    - artifact/package behavior
    - tests run
    - remaining limitations

## Final Warning

Do not implement a visually impressive UI over fake backend behavior.

Every toggle, selector, export option, status badge, and artifact link must correspond to a real executable capability and real output.
