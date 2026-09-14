# AI 3D Studio — Animation + Rigging Studio Implementation Prompt

## ROLE

Act as a Principal Frontend Engineer, 3D UI/UX Engineer, AI/ML Integration Engineer, Backend Engineer, and QA Engineer.

You are modifying the existing **AI 3D Studio** project.

The project already has an established application shell, navigation, workspace system, backend API architecture, model registry, runtime/model installer, 3D viewport, state management, and existing rigging utilities.

Your job is to add a production-quality **Animation Studio + Rigging Studio** without breaking or replacing the existing architecture.

---

# 1. MANDATORY FIRST STEP — UNDERSTAND THE PROJECT

Before writing or modifying code:

1. Read `AGENTS.md` completely and follow every instruction.
2. Read all relevant project documentation/instruction files.
3. Inspect the complete repository structure.
4. Trace the current routing architecture.
5. Trace `WorkspaceShell`.
6. Trace `TopHeader`.
7. Trace `LeftNavigation`.
8. Trace `WorkspaceContext` and existing workspace state.
9. Trace the current 3D viewport implementation.
10. Trace model loading and asset handling.
11. Trace backend API patterns.
12. Trace the model/provider registry.
13. Trace YAML model manifests.
14. Trace model/runtime installation.
15. Trace existing job/worker infrastructure.
16. Trace existing export functionality.
17. Inspect the existing Clay/Blender rigging implementation.
18. Identify existing reusable components before creating new ones.
19. Check all existing routes before creating new routes.
20. Check existing styling/design tokens before adding new ones.

Do not start implementation until the architecture is understood.

Do not guess how an existing system works.

Do not duplicate infrastructure that already exists.

---

# 2. EXISTING APPLICATION ARCHITECTURE MUST BE PRESERVED

The project already uses an application shell and workspace architecture.

Relevant existing components include:

- `features/new-workspace/WorkspaceShell.tsx`
- `features/new-workspace/Header/TopHeader.tsx`
- `features/new-workspace/Navigation/LeftNavigation.tsx`
- `features/new-workspace/store/WorkspaceContext.tsx`
- `features/new-workspace/Viewport/MeshViewer.tsx`

The project also contains:

- Next.js App Router
- React
- TypeScript
- Tailwind
- FastAPI
- model/provider architecture
- YAML model manifests
- model/runtime installation
- background worker/job infrastructure
- Blender/Clay utilities
- existing 3D viewport

These are the source of truth for the application.

## DO NOT

- replace the application shell
- replace the existing navigation
- create a second navigation
- create a second TopHeader
- create a second WorkspaceShell
- create a second 3D viewer unnecessarily
- create a second model registry
- create a second installer
- create a second job queue
- create a second unrelated state-management system
- rewrite unrelated pages
- break existing routes

Animation/Rigging must feel like a native part of AI 3D Studio.

---

# 3. DESIGN REFERENCE

Use the supplied Animation Studio reference image as the primary visual reference.

The implementation should closely follow its structure and visual hierarchy.

Design language:

- matte black
- dark charcoal panels
- subtle borders
- yellow accent
- compact professional controls
- clean typography
- clear hierarchy
- minimal visual noise
- restrained shadows
- subtle rounded corners
- professional 3D software feel

Avoid:

- heavy glassmorphism
- excessive blur
- neon backgrounds
- purple
- cyan
- blue neon
- large gradients
- unnecessary animations
- giant hero sections
- excessive empty space
- marketing-style cards
- decorative UI that does not provide functionality

Primary accent:

`#F9CF00`

The page should look like a professional 3D editor, not a SaaS landing page.

---

# 4. CRITICAL — NO MODEL SELECTOR

Do NOT add a model selector to Animation Studio.

There is one default AI motion-generation engine:

## ARDY

Official repository:

https://github.com/nv-tlabs/ardy

The user must NOT have to choose an animation model.

If useful, the UI may show a small informational label such as:

`Motion AI · ARDY`

but never provide:

`[ Select Model ▼ ]`

for the animation system.

---

# 5. ARDY IS THE MOTION MODEL — NOT THE RIGGING SYSTEM

This distinction is mandatory.

ARDY is used for AI motion generation.

ARDY is NOT the rigging engine.

Architecture:

Character Model
    ↓
Rigging
    ↓
Valid Skeleton
    ↓
Motion AI
    ↓
ARDY
    ↓
Generated Motion
    ↓
Motion Conversion
    ↓
Retargeting
    ↓
Target Character
    ↓
IK / Cleanup
    ↓
Timeline
    ↓
Bake
    ↓
Export

ARDY should power the **Motion AI / Text → Motion** workflow.

Rigging remains a separate pipeline.

---

# 6. MANDATORY ARDY REPOSITORY INSPECTION

Before implementing ARDY integration, independently inspect the actual repository:

https://github.com/nv-tlabs/ardy

Do not rely only on the README.

Clone/inspect the repository separately from the AI 3D Studio repository.

Inspect at minimum:

- README
- `pyproject.toml`
- package structure
- model loading
- checkpoint loading
- configuration
- generation scripts
- inference/entry points
- motion representation
- skeleton representation
- text/prompt processing
- generation pipeline
- output format
- visualization
- interactive demo
- CLI/headless execution
- dependencies
- CUDA requirements
- GPU requirements
- checkpoint sources
- environment variables
- supported skeletons
- output conversion/export

Determine exactly:

1. How ARDY loads its model.
2. How checkpoints are downloaded/located.
3. How prompts are processed.
4. How motion is generated.
5. What skeleton representation ARDY uses.
6. What generated data is returned.
7. How generated motion is visualized.
8. How output is converted/exported.
9. How headless inference should be executed.
10. Which dependencies are mandatory.
11. Which dependencies are optional.
12. What GPU/VRAM requirements exist.
13. Whether the upstream project supports multiple skeleton types.
14. Which parameters are actually supported.

Then integrate using the real upstream implementation.

---

# 7. DO NOT REWRITE ARDY

The upstream ARDY repository is the source of truth for ARDY behavior.

Use its real:

- model loading
- inference
- motion generation
- representations
- skeleton logic
- checkpoint handling

Do not replace the model with:

- a fake implementation
- a random animation generator
- placeholder keyframes
- hardcoded motion
- a dummy provider
- an API simulation

Only create a thin AI 3D Studio adapter where required.

The adapter should isolate ARDY-specific implementation from the rest of AI 3D Studio.

---

# 8. ARDY OUTPUT MUST BE RETARGETED

Do not assume ARDY output can directly animate every arbitrary GLB/GLTF/FBX character.

Required flow:

ARDY Motion
    ↓
Source Skeleton
    ↓
Bone Mapping
    ↓
Target Skeleton
    ↓
Retarget
    ↓
Animation Clip

If the active character is not rigged:

do not generate motion blindly.

Show:

`Rig required`

with a clear action:

`[Auto Rig]`

or:

`[Manual Rig]`

---

# 9. ANIMATION PAGE ROUTING

Add Animation Studio through the existing application routing architecture.

Do not create a separate standalone animation application.

Do not create a second React application.

Do not force browser reloads.

Do not destroy the existing application shell.

Animation must load in the same way existing pages/tools load.

Existing:

- TopHeader
- LeftNavigation
- WorkspaceShell
- state
- viewport
- loading behavior
- error behavior
- responsive behavior

must remain intact.

---

# 10. LEFT NAVIGATION

Integrate Animation into the existing LeftNavigation.

Use the existing navigation component and visual style.

Expected navigation concept:

Dashboard
Generate
Workspace
Models
Texture
Animation
Render
Assets
Projects
Tools
Settings

Do not duplicate the sidebar.

Active Animation state uses the existing yellow accent.

Existing navigation items must continue working.

---

# 11. ANIMATION STUDIO PAGE STRUCTURE

Use this structure:

TOP:

Existing AI 3D Studio TopHeader.

PAGE HEADER:

`Animation Studio`

Subtitle:

`Rig, animate and bring your 3D models to life with AI.`

Actions:

`[Save]`
`[Share]`
`[Export ▼]`

Then workspace tabs:

`[Animate]`
`[Rigging]`
`[Retarget]`
`[Motion AI]`
`[Blend]`
`[Library]`

These are modes inside the Animation Studio.

Switching modes must not destroy the active session/model/rig/animation.

---

# 12. MAIN LAYOUT

The main workspace should have:

LEFT:
Model & Assets

CENTER:
3D Viewport

BOTTOM CENTER:
Timeline

RIGHT:
Properties / Rigging / Animation inspector

BOTTOM:
Quick Actions

Conceptually:

+----------------+-----------------------------+----------------+
| Model & Assets |                             | Properties     |
|                |                             | Rigging        |
|                |       3D VIEWPORT           | Animation      |
|                |                             |                |
+----------------+-----------------------------+----------------+
|                |          TIMELINE           |                |
+----------------+-----------------------------+----------------+

Bottom:

[AI Motion Generator]
[Auto Rig]
[Pose Editor]
[Animation Mixer]
[Bake & Export]

Keep the layout compact and organized.

---

# 13. LEFT PANEL — MODEL & ASSETS

## Current Model

Show the currently active model.

Example:

`character.glb`
`3D Model · 2.4 MB`

Buttons:

`[Replace]`
`[Import]`

Do not add a model selector.

The current project/workspace model is automatically the animation target.

---

## Model List

Display loaded/project assets.

Example:

- character.glb
- robot.fbx
- creature.glb
- human.obj

Selecting one makes it the active animation target.

Use real project asset state.

Do not hardcode fake assets.

---

# 14. ANIMATION LIBRARY

Include:

Search:

`[ Search animations... ]`

Categories:

- All Animations
- Idle
- Walk
- Run
- Jump
- Actions
- Custom

Button:

`[+ Add]`

Animations must come from actual application data.

Do not hardcode fake animation counts.

---

# 15. CENTER 3D VIEWPORT

Reuse the existing 3D viewport wherever possible.

Existing:

`features/new-workspace/Viewport/MeshViewer.tsx`

must be inspected first.

Extend it instead of creating another viewer if practical.

Viewport tools:

- Select
- Move
- Rotate
- Scale

View:

`[Perspective ▼]`

Display:

`[Solid]`
`[Wireframe]`
`[Skeleton]`

Additional controls:

- Grid
- Ground
- Skeleton
- IK targets
- Frame selected
- Reset camera
- Fullscreen

The active character must be displayed using actual project data.

---

# 16. TIMELINE

Timeline is a core Animation Studio component.

Playback controls:

`[Play]`
`[Stop]`
`[Previous]`
`[Next]`

Show:

`00:00 / 00:02`

FPS:

`[24 FPS ▼]`

Tracks may include:

- Character
- Body
- Arms
- Legs
- Face
- Root
- IK

Tracks must represent actual animation data.

Never render fake keyframes.

---

# 17. TIMELINE FUNCTIONALITY

Implement where supported:

- play
- pause
- stop
- seek
- frame step
- scrubbing
- current frame
- duration
- FPS
- loop
- playback speed
- keyframes
- track visibility
- track locking
- clip selection
- clip trimming
- clip duplication
- clip deletion

If a feature is not supported by the actual backend/runtime:

do not create a button that does nothing.

Either:

1. implement it properly, or
2. omit/disable it with a clear explanation.

---

# 18. RIGHT PANEL

Tabs:

`[Properties]`
`[Rigging]`
`[Animation]`

## Properties

Model Info:

- filename
- vertices
- faces
- materials
- mesh status
- rig status

Transform:

Position:
X / Y / Z

Rotation:
X / Y / Z

Scale:
X / Y / Z

Use real values.

---

# 19. ANIMATION PROPERTIES

Show:

Current Animation

Duration

FPS

Playback Speed

Loop

Root Motion

Foot Lock

Display:

Show Skeleton

Show Grid

Show Ground

Show IK Targets

All values must reflect actual state.

No fake values.

---

# 20. RIGGING STUDIO

Rigging must exist inside Animation Studio.

Do not make it a disconnected feature.

Workspace tab:

`[Rigging]`

Two workflows:

## AUTO RIG

## MANUAL RIG

---

# 21. AUTO RIG FLOW

Primary button:

`[Auto Rig]`

Pipeline:

MODEL
 ↓
Character Detection
 ↓
Rig Type Detection
 ↓
Skeleton Generation
 ↓
Bone Placement
 ↓
Skinning / Weighting
 ↓
IK Setup
 ↓
Validation
 ↓
Rig Ready

Initial rig profiles:

- Humanoid
- Quadruped
- Generic

If automatic rigging fails, show a real failure state.

Never claim success when the backend failed.

---

# 22. EXISTING CLAY/BLENDER RIGGING MUST BE REUSED

Before creating new rigging code inspect:

`backend/clay/blender/scripts/rig.py`

The existing project already has rigging functionality for:

- humanoid
- quadruped
- vehicle
- generic

Reuse/extend this implementation where appropriate.

Do not duplicate the same rigging algorithms in a new file without a strong technical reason.

The existing Blender/Clay implementation is the source of truth for supported rigging behavior.

---

# 23. RIGGING UI

Rigging workspace:

LEFT:

### Auto Rig

`[Auto Rig]`

Rig Type:

`[Auto Detect ▼]`

Options:

`[✓] Automatic Bone Placement`
`[✓] Automatic Weights`
`[✓] Generate IK`
`[✓] Validate Rig`

---

### Manual Rig

`[Add Bone]`
`[Delete Bone]`
`[Parent Bone]`
`[Rename Bone]`
`[Mirror Bone]`

---

CENTER:

3D viewport with:

- skeleton
- bones
- bone names
- joints
- IK targets

---

RIGHT:

Rig Status:

- Not Rigged
- Preparing
- Rigging
- Rigged
- Validation Failed

Skeleton:

actual rig profile

Bone Count:

actual count

Skinning:

Automatic / Manual

IK:

Enabled / Disabled

---

# 24. MANUAL RIGGING

Basic manual rigging should support:

- add bone
- delete bone
- move bone
- rotate bone
- rename bone
- parent bone
- unparent bone
- duplicate bone
- mirror bone
- edit hierarchy

A basic humanoid hierarchy may include:

Root
 └─ Hips
     ├─ Spine
     │   ├─ Chest
     │   │   ├─ Neck
     │   │   │   └─ Head
     │   │   ├─ UpperArm_L
     │   │   │   └─ LowerArm_L
     │   │   │       └─ Hand_L
     │   │   └─ UpperArm_R
     │   │       └─ LowerArm_R
     │   │           └─ Hand_R
     ├─ UpperLeg_L
     │   └─ LowerLeg_L
     │       └─ Foot_L
     └─ UpperLeg_R
         └─ LowerLeg_R
             └─ Foot_R

Use the actual project's rig representation rather than blindly hardcoding this hierarchy.

---

# 25. IK

Basic IK support:

- Left Hand
- Right Hand
- Left Foot
- Right Foot
- Head

Control:

`[Enable IK]`

IK targets should be manipulatable inside the viewport.

If the existing 3D runtime has an IK implementation, reuse it.

If not, implement the minimum correct system required by the supported rig.

Never create non-functional IK buttons.

---

# 26. RETARGETING

Retarget workspace:

Source Animation
 ↓
Source Skeleton
 ↓
Bone Mapping
 ↓
Target Skeleton
 ↓
Retarget
 ↓
Validation
 ↓
Animation Clip

Buttons:

`[Auto Map Bones]`
`[Manual Mapping]`
`[Retarget]`
`[Preview]`

Basic mapping should support:

- Hips
- Spine
- Chest
- Neck
- Head
- UpperArm
- LowerArm
- Hand
- UpperLeg
- LowerLeg
- Foot

Unmapped required bones must be clearly displayed.

Do not silently discard required bones.

---

# 27. MOTION AI

Motion AI workspace:

Do NOT provide a model selector.

ARDY is the default engine.

Show an informational label if useful:

`Motion AI · ARDY`

Prompt:

------------------------------------------------
Character walks forward and waves with the
right hand.
------------------------------------------------

Primary:

`[Generate Motion]`

Only expose ARDY parameters that are actually supported.

Possible controls only if confirmed from upstream:

- duration
- FPS
- seed
- generation parameters

Do not invent unsupported ARDY parameters.

---

# 28. MOTION GENERATION FLOW

When the user clicks:

`[Generate Motion]`

Perform:

1. Validate active model.
2. Validate rig.
3. Validate skeleton.
4. Prepare ARDY input.
5. Verify ARDY installation.
6. Load ARDY runtime if required.
7. Load ARDY model/checkpoint.
8. Generate motion.
9. Convert ARDY output.
10. Retarget to target skeleton.
11. Apply IK/cleanup if configured.
12. Create animation clip.
13. Insert into timeline.
14. Preview.

Actual status stages:

- Preparing skeleton
- Loading ARDY
- Generating motion
- Converting motion
- Retargeting
- Applying animation
- Ready

No fake percentage progress.

Use actual backend job state.

---

# 29. BACKEND JOB STATES

Use the existing job system if available.

Animation jobs should have real states such as:

- queued
- preparing
- loading_model
- generating
- converting
- retargeting
- processing
- completed
- failed
- cancelled

Do not create a separate queue if the project already has one.

---

# 30. ARDY PROVIDER / ADAPTER

If the project uses providers, add ARDY as a proper provider.

Provider responsibilities:

- environment resolution
- dependency validation
- model readiness
- checkpoint resolution
- model loading
- generation
- output conversion
- cleanup
- health/readiness
- error handling

Keep ARDY-specific implementation isolated.

Do not leak ARDY-specific code throughout the frontend.

---

# 31. ARDY YAML MANIFEST

Add ARDY through the existing YAML-driven model system.

Do not hardcode the model metadata into React.

The manifest should define, using the project's existing schema:

- model ID
- display name
- description
- author
- license
- source repository
- checkpoint source
- dependencies
- runtime
- entrypoint
- hardware requirements
- VRAM requirements
- capabilities
- workspace compatibility

Conceptual example:

model:
  id: ardy
  label: ARDY
  category: animation
  description: AI motion generation
  author: NVIDIA

source:
  repo: https://github.com/nv-tlabs/ardy

runtime:
  type: local

capabilities:
  motion_generation: true

workspace_compatibility:
  - animation
  - motion-generation
  - retargeting

IMPORTANT:
This is only conceptual.

Use the exact existing AI 3D Studio YAML schema after inspecting it.

Do not invent a second manifest schema.

---

# 32. MODEL INSTALLATION

ARDY must use the existing model installation/runtime system.

Do not create a random downloader.

Use the existing:

- YAML manifest
- model installer
- runtime environment
- model storage
- provider registry
- readiness checks
- dependency management

The model installation state must come from the backend.

---

# 33. NO FAKE MODEL STATE

Never show:

Ready

unless ARDY is actually ready.

Never show:

Generating

unless a real job exists.

Never show:

100%

unless the operation actually completed.

Never fake:

- GPU
- VRAM
- RAM
- generation time
- bone count
- animation count
- model readiness
- progress

Use actual backend/runtime data.

---

# 34. SESSION PERSISTENCE

Switching:

Animate
Rigging
Retarget
Motion AI
Blend
Library

must preserve as much session state as the existing architecture supports:

- active model
- rig
- skeleton
- animation
- timeline
- selection
- camera
- current frame
- current workspace mode

Use existing WorkspaceContext/state.

Do not reload the entire application.

---

# 35. LOADING BEHAVIOR

Animation must load exactly like other existing AI 3D Studio pages.

Requirements:

- no browser refresh
- no full React remount unnecessarily
- persistent header
- persistent navigation
- persistent workspace state
- existing loading behavior
- existing error boundaries
- existing transitions
- existing responsive behavior

Do not destroy the viewport just because the user changes workspace tabs.

---

# 36. PERFORMANCE

Do not load ARDY unnecessarily.

Preferred:

Animation page opens:
→ UI loads immediately

ARDY:
→ not loaded yet

User opens Motion AI / Generate Motion:
→ verify installation
→ verify hardware
→ initialize runtime
→ load model
→ generate

After initialization, reuse the loaded runtime/model when safe.

Do not reload ARDY for every prompt.

---

# 37. RESOURCE SAFETY

Before ARDY initialization:

check:

- CUDA availability
- GPU availability
- VRAM availability
- dependency state
- checkpoint state
- runtime state

If resources are insufficient:

show a clear error.

Do not crash FastAPI.

Do not crash the worker.

Do not take down unrelated model runtimes.

Use existing environment isolation where available.

---

# 38. POSE EDITOR

Implement a basic pose editor.

Workflow:

Select bone
 ↓
Move / Rotate
 ↓
Create keyframe

Buttons:

`[Add Keyframe]`
`[Delete Keyframe]`
`[Reset Pose]`
`[Mirror Pose]`

Pose editing must modify the real rig/skeleton.

---

# 39. ANIMATION BLENDING

Animation Mixer:

Animation A:

`[Idle ▼]`

Animation B:

`[Walk ▼]`

Blend:

`────────●──────`

Transition:

`0.5 s`

Possible controls:

- blend weight
- transition duration
- clip offset
- loop
- preview

Only implement controls that actually modify animation data.

Do not create fake sliders.

---

# 40. BAKE ANIMATION

Button:

`[Bake Animation]`

Flow:

Current Animation
 ↓
Resolve IK
 ↓
Resolve Constraints
 ↓
Bake Transforms
 ↓
Generate Keyframes
 ↓
Validate
 ↓
Ready for Export

Only expose Bake functionality if the backend/3D runtime can actually perform it.

---

# 41. EXPORT

Top action:

`[Export ▼]`

Formats should reflect actual backend support.

Potential formats:

- GLB
- GLTF
- FBX

Options:

- Full Character + Rig + Animation
- Animation Only
- Model + Rig

Before export validate:

- mesh
- rig
- skeleton
- weights
- animation
- materials where relevant

Export through existing project export infrastructure.

Do not create a frontend-only fake download.

---

# 42. BOTTOM QUICK ACTIONS

Use five compact action cards exactly in the visual hierarchy of the reference:

### AI Motion Generator
Text to 3D Animation

### Auto Rig
One-click character rigging

### Pose Editor
Edit and create poses

### Animation Mixer
Blend multiple animations

### Bake & Export
Export animation

Each card must open/trigger a real function.

No decorative non-functional cards.

---

# 43. ERROR STATES

Every major operation needs a real error state.

Examples:

No model:

`Import a character to continue.`

No rig:

`Create or generate a rig before generating motion.`

Auto rig failure:

`Automatic rigging could not determine a supported skeleton.`

ARDY unavailable:

`ARDY is not installed or the runtime is not ready.`

CUDA unavailable:

Show actual backend resource error.

Out of VRAM:

Show actual resource error.

Retarget failure:

Show actual bone-mapping problem.

Export failure:

Show actual export error.

Do not hide useful backend errors behind generic messages.

---

# 44. API INTEGRATION

Before creating APIs, inspect the existing FastAPI patterns.

Reuse:

- existing routers
- schemas
- service patterns
- job system
- worker system
- error handling
- authentication/session patterns if present

Animation generation should become part of the existing backend architecture.

Do not create a second backend architecture.

---

# 45. FRONTEND STATE

Reuse existing state management.

Required state concepts:

- active character
- rig status
- skeleton
- current animation
- timeline
- current frame
- selected bone
- IK state
- generation job
- generation status
- generated motion
- retarget state
- export state

Avoid unnecessary global state.

Keep state as local as possible unless it must persist across workspace modes.

---

# 46. RESPONSIVE BEHAVIOR

Desktop is the primary target.

Preserve existing responsive behavior.

On smaller screens:

- left asset panel becomes collapsible
- right inspector becomes collapsible
- timeline remains usable
- viewport remains usable
- existing mobile navigation remains functional

Do not create a completely separate mobile application.

---

# 47. DESIGN CONSISTENCY

Do not alter unrelated pages.

Animation Studio should inherit the existing AI 3D Studio design system.

Do not introduce new colors unless required.

Primary accent:

Yellow.

Do not change the project's established accent globally just for Animation.

---

# 48. IMPLEMENTATION ORDER

Follow this sequence.

## Phase 1 — Architecture

Understand and document existing architecture.

## Phase 2 — UI

Implement Animation Studio shell inside existing workspace.

## Phase 3 — Assets

Implement Model & Animation asset panels.

## Phase 4 — Viewport

Integrate existing MeshViewer.

## Phase 5 — Timeline

Implement actual animation timeline/state.

## Phase 6 — Rigging

Integrate existing Clay/Blender rigging.

## Phase 7 — Manual Rig

Implement basic manual rig editing.

## Phase 8 — Retargeting

Implement source → target skeleton mapping.

## Phase 9 — ARDY Research

Clone and inspect actual upstream ARDY.

## Phase 10 — ARDY Manifest

Add ARDY through existing YAML model system.

## Phase 11 — ARDY Runtime

Implement provider/adapter around real ARDY code.

## Phase 12 — Motion AI

Implement prompt → ARDY → motion.

## Phase 13 — Conversion

Convert ARDY output into the project's motion representation.

## Phase 14 — Retargeting

Apply generated motion to active rig.

## Phase 15 — Editing

Pose editing / timeline / blending.

## Phase 16 — Bake

Bake final animation.

## Phase 17 — Export

Export through existing infrastructure.

## Phase 18 — QA

Run build, lint, typecheck, tests, backend checks, and real workflow tests.

## Phase 19 — Regression

Verify every existing page and major workflow still works.

---

# 49. REQUIRED TEST WORKFLOW

Perform a real end-to-end test.

## Test A — Page

1. Open AI 3D Studio.
2. Open Animation.
3. Verify existing navigation remains.
4. Verify existing header remains.
5. Verify viewport loads.
6. Verify asset panel loads.
7. Verify timeline loads.

## Test B — Rigging

1. Import/load a character.
2. Open Rigging.
3. Run Auto Rig.
4. Verify backend job.
5. Verify skeleton.
6. Verify weights.
7. Verify IK.
8. Validate rig.
9. Test pose.

## Test C — ARDY

1. Open Motion AI.
2. Confirm ARDY runtime state.
3. Enter a prompt.
4. Generate.
5. Verify real job.
6. Verify ARDY model loading.
7. Verify generated motion.
8. Convert output.
9. Retarget.
10. Insert into timeline.
11. Preview.

## Test D — Editing

1. Play.
2. Scrub.
3. Add keyframe.
4. Modify pose.
5. Test IK.
6. Test blend.
7. Bake.

## Test E — Export

1. Export supported format.
2. Re-import exported asset.
3. Verify mesh.
4. Verify rig.
5. Verify animation.

---

# 50. REGRESSION TEST

After implementation verify that the following still work:

- Dashboard
- Generate
- Workspace
- Models
- Texture
- Render
- Assets
- Projects
- Tools
- Settings
- existing 3D generation
- existing model manager
- existing model installation
- existing providers
- existing Docker setup
- existing FastAPI
- existing workers
- existing viewport

Do not consider the task complete if Animation works but existing functionality is broken.

---

# 51. TYPE / BUILD / LINT

Before finishing:

Run the project's existing:

- TypeScript checks
- ESLint
- frontend build
- backend checks
- relevant tests
- runtime checks

Fix all errors introduced by the implementation.

Do not hide errors by weakening TypeScript or lint configuration.

Do not disable tests.

Do not add `any` unnecessarily.

Do not silence errors with comments.

---

# 52. DOCUMENTATION

Update relevant documentation.

Document:

- Animation Studio architecture
- Rigging architecture
- ARDY integration
- ARDY runtime requirements
- ARDY checkpoint requirements
- YAML manifest
- provider/runtime
- motion generation flow
- retargeting
- supported skeletons
- export
- known limitations
- troubleshooting

Follow `AGENTS.md` documentation rules.

---

# 53. CODE QUALITY RULES

Use the existing project conventions.

Prefer:

- existing components
- existing hooks
- existing utilities
- existing API client
- existing state
- existing services
- existing schemas
- existing job infrastructure

Avoid:

- duplicated logic
- giant monolithic components
- hardcoded backend data
- fake UI state
- unnecessary dependencies
- unrelated refactors
- architectural rewrites

Animation Studio should be maintainable by the existing project.

---

# 54. FINAL TARGET LAYOUT

The final page should closely resemble the supplied design:

LEFT:
Existing AI 3D Studio navigation.

MAIN:

Animation Studio

Tabs:

Animate
Rigging
Retarget
Motion AI
Blend
Library

LEFT WORKSPACE PANEL:

Model & Assets
Animation Library

CENTER:

3D Viewport

BOTTOM CENTER:

Timeline

RIGHT:

Properties
Rigging
Animation

BOTTOM:

AI Motion Generator
Auto Rig
Pose Editor
Animation Mixer
Bake & Export

TOP:

Existing project header.

No model selector.

No duplicate navigation.

No separate app shell.

---

# 55. ACCEPTANCE CHECKLIST

The implementation is complete only if all applicable items below are true:

[ ] Existing AI 3D Studio shell is preserved.

[ ] Existing TopHeader is preserved.

[ ] Existing LeftNavigation is preserved.

[ ] Existing WorkspaceShell is preserved.

[ ] Existing WorkspaceContext/state architecture is preserved.

[ ] Existing MeshViewer is reused/extended where appropriate.

[ ] Animation loads through the existing routing architecture.

[ ] No browser/full-page reload is introduced.

[ ] No model selector exists.

[ ] ARDY is the default Motion AI engine.

[ ] Official ARDY repository was independently inspected.

[ ] Actual ARDY code is used.

[ ] ARDY is not replaced by a fake implementation.

[ ] ARDY is isolated behind a clean adapter/provider.

[ ] ARDY is installed through the existing model/runtime infrastructure.

[ ] ARDY has a YAML manifest using the existing schema.

[ ] ARDY readiness is real.

[ ] ARDY loading is real.

[ ] Motion generation is real.

[ ] ARDY output is actually converted.

[ ] ARDY output is actually retargeted.

[ ] Rigging exists inside Animation Studio.

[ ] Existing Clay/Blender rigging implementation is reused.

[ ] Auto Rig works.

[ ] Manual Rig works for supported operations.

[ ] Rig validation works.

[ ] Skeleton visualization works.

[ ] IK controls are functional.

[ ] Retargeting works.

[ ] Bone mapping is visible.

[ ] Motion AI works.

[ ] Timeline uses real animation data.

[ ] Pose editing works.

[ ] Animation blending works where supported.

[ ] Bake works where supported.

[ ] Export works through real infrastructure.

[ ] No fake progress exists.

[ ] No fake GPU/VRAM/RAM values exist.

[ ] No fake model readiness exists.

[ ] Real backend errors are shown.

[ ] Existing pages remain functional.

[ ] Existing generation remains functional.

[ ] Existing model manager remains functional.

[ ] TypeScript passes.

[ ] Lint passes.

[ ] Build passes.

[ ] Relevant backend/tests pass.

[ ] Documentation is updated.

---

# 56. FINAL NON-NEGOTIABLE RULE

Do not blindly implement this prompt.

First understand the existing AI 3D Studio codebase.

Then inspect the actual upstream ARDY repository.

Then inspect the existing Clay/Blender rigging implementation.

Then design the smallest maintainable integration between them.

The existing AI 3D Studio repository is the source of truth for application architecture.

The official ARDY repository is the source of truth for ARDY model/inference behavior.

The existing Clay/Blender implementation is the source of truth for the project's current rigging capabilities.

Never fake any of these systems.

Never break existing functionality merely to add Animation Studio.

The final result must be a clean, organized, production-quality Animation + Rigging workspace that behaves as a native part of AI 3D Studio.
