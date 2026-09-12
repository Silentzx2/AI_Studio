You are working on the existing AI Studio project.

## PRIMARY OBJECTIVE

REMOVE the current custom 6-stage post-processing pipeline from AI Studio and replace it with the existing **OpenX Clay** post-processing implementation.

IMPORTANT:

- DO NOT modify the existing AI model generation pipeline.
- DO NOT modify model providers.
- DO NOT modify generation APIs.
- DO NOT modify the existing generation workflow.
- DO NOT redesign the frontend generation flow.
- DO NOT add any new AI generation pipeline.
- The existing AI generation system must continue working exactly as it currently does.

The only target is:

**CURRENT 6-STAGE POST-PROCESSING PIPELINE → REMOVE IT → USE OPENX CLAY INSTEAD.**

## SOURCE REPOSITORY

OpenX Clay:

https://github.com/OpenX-Inc/clay

First clone it OUTSIDE the AI Studio project source tree.

Example:

```text
external_repos/
    clay/
```

Do not immediately copy random files into AI Studio.

First inspect the Clay repository and understand its actual implementation.

## REQUIRED APPROACH

Do NOT build a new post-processing pipeline from scratch.

Do NOT recreate Clay's algorithms.

Do NOT rewrite Clay's mesh-processing logic.

Reuse Clay's existing implementation as much as technically possible.

Preferred order:

1. Use Clay's existing executable/CLI/modules directly.
2. Adapt Clay through a thin AI Studio wrapper if required.
3. Add only the minimum integration code required for AI Studio's existing worker/job/storage system.
4. Never recreate an algorithm that Clay already provides.

## EXISTING AI STUDIO FLOW

Keep this EXACTLY as it is:

```text
AI MODEL
   ↓
EXISTING GENERATION PIPELINE
   ↓
RAW GENERATED 3D MODEL
   ↓
EXISTING STORAGE
```

Only AFTER the generated model is successfully stored, invoke Clay:

```text
RAW GENERATED MODEL
        ↓
      CLAY
        ↓
PROCESSED / GAME-READY MODEL
        ↓
EXISTING AI STUDIO STORAGE
```

Do not merge Clay into the model-generation process.

Clay is a POST-PROCESSING ENGINE ONLY.

## REMOVE CURRENT PIPELINE

Find the existing custom 6-stage post-processing implementation.

Trace:

- all six stages
- stage orchestration
- Celery tasks
- worker execution
- progress handling
- logs
- job state
- post-processing imports
- post-processing API endpoints
- output handling

Remove/replace the existing custom six-stage processing logic.

Do not leave the old six-stage implementation running in parallel with Clay.

There must be only ONE post-processing implementation after this change:

**OpenX Clay.**

If old files are no longer required, remove them or disconnect them cleanly from the runtime.

## CLAY INTEGRATION

Use Clay's real implementation.

Determine from the Clay source:

- supported input formats
- supported output formats
- mesh processing commands/modules
- retopology
- UV processing
- baking
- LOD generation
- collision generation
- optimization
- material/texture processing
- export
- validation
- required Blender/tools
- required Python dependencies
- GPU/CPU requirements

Then integrate the Clay functionality that corresponds to the current post-processing requirements.

Do NOT invent a new six-stage architecture.

Let Clay perform its existing processing workflow.

## IMPORTANT

The goal is NOT:

```text
AI Studio custom pipeline
+
Clay
```

The goal is:

```text
AI Studio generation
        ↓
Clay post-processing
```

The old 6-stage implementation must be replaced, not supplemented.

## EXISTING JOB SYSTEM

Reuse AI Studio's existing:

- Celery worker
- job database/state
- progress reporting
- logging system
- storage system
- cancellation/retry mechanisms if already present

Do not create a second job system.

The worker should simply invoke Clay and report the real Clay execution state through the existing AI Studio job system.

## INPUT

The input to Clay must be the already-generated model from the existing AI generation pipeline.

Example:

```text
/storage/generated/model.glb
        ↓
      CLAY
        ↓
/storage/processed/model.glb
```

Do not regenerate the model.

Do not call an AI generation model from the Clay integration.

## OUTPUT

Processed assets must return to the existing AI Studio storage architecture.

Do not create a completely separate storage system.

Preserve whatever metadata/job relationships are already used by AI Studio.

## PROGRESS AND LOGGING

Expose REAL Clay progress wherever Clay provides progress information.

Do NOT create fake percentages.

Do NOT simulate progress.

Do NOT keep a job in RUNNING state when Clay has already exited.

If Clay fails:

```text
Clay process
    ↓
non-zero exit / exception
    ↓
AI Studio job = FAILED
```

If Clay succeeds:

```text
Clay process
    ↓
validated output exists
    ↓
AI Studio job = COMPLETED
```

No silent failures.

No warning-only success.

No infinite RUNNING state.

## ERROR HANDLING

Properly handle:

- Clay executable/module missing
- Blender missing
- dependency missing
- invalid input model
- corrupted model
- Clay processing failure
- timeout
- empty output
- missing output
- permission errors
- worker exception

All real failures must propagate to the existing AI Studio job system.

## DEPENDENCIES

Inspect Clay's actual dependency requirements.

Add only the dependencies necessary to run Clay.

Update the appropriate:

- requirements
- Docker image
- setup scripts
- runtime environment

only where necessary.

Do not add unnecessary dependencies from unrelated repositories.

## TESTING

After integration, test ONLY the post-processing replacement.

Verify:

```text
Existing AI generation
        ↓
generated model saved
        ↓
post-processing job starts
        ↓
Clay executes
        ↓
real logs appear
        ↓
real progress appears
        ↓
processed asset is created
        ↓
asset reaches existing storage
        ↓
job completes
```

Also test Clay failure and verify the job becomes FAILED instead of remaining RUNNING.

## DO NOT CHANGE

These are OUT OF SCOPE:

- AI model generation
- model providers
- generation UI
- prompt system
- generation APIs
- model downloading
- existing storage architecture
- unrelated frontend components
- unrelated backend modules

Only change what is required to replace the old six-stage post-processing pipeline with Clay.

## CODE REUSE RULE

Before writing new code, search the Clay repository for an existing implementation.

If Clay already implements something:

**USE IT.**

Do not create another implementation.

Only write small integration adapters where AI Studio needs to communicate with Clay.

## FINAL RESULT

The resulting architecture should be:

```text
┌─────────────────────────────┐
│ EXISTING AI MODEL GENERATOR │
└──────────────┬──────────────┘
               ↓
        GENERATED MODEL
               ↓
        EXISTING STORAGE
               ↓
┌─────────────────────────────┐
│         OPENX CLAY          │
│      POST-PROCESSING        │
└──────────────┬──────────────┘
               ↓
       PROCESSED 3D ASSET
               ↓
        EXISTING STORAGE
```

There must be NO dependency on the old custom six-stage pipeline after the migration.

## FINAL REPORT

Create a markdown report describing:

- old six-stage pipeline removed
- Clay integration architecture
- exact Clay components reused
- files changed
- files removed/deactivated
- dependencies added
- runtime requirements
- how the worker invokes Clay
- how progress/logging works
- how failures propagate
- testing performed
- remaining Clay limitations

Most important:

**Do not build a replacement pipeline yourself. Replace the existing six-stage implementation with the actual OpenX Clay implementation and use AI Studio only as the integration/orchestration layer.**