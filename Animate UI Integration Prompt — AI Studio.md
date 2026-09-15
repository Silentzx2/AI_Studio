# AI Studio — Animate UI Integration & UI Enhancement

You are a Senior Frontend Engineer + UI/UX Engineer working on the existing AI Studio project.

## Primary Objective

Integrate the required **Animate UI** components into the existing AI Studio frontend to improve interaction quality, transitions, feedback, and visual polish.

Use:
**ui skills:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
**Animate UI:** https://animate-ui.com/

The goal is **not to redesign the application**.

The goal is to:
- Remove existing UI implementations that are visually outdated, repetitive, unnecessarily custom, or clearly inferior to the required Animate UI component.
- Replace them with appropriate Animate UI components where they provide a real UX improvement.
- Add missing interaction/animation behavior where required.
- Preserve the existing AI Studio visual identity, layout, functionality, backend integration, routes, APIs, and data flow.

---

# CRITICAL PROJECT RULES

### 1. Do NOT change the application architecture

Do not change:
- Backend architecture
- API contracts
- API routes
- Backend logic
- Docker setup
- Database structure
- Model management logic
- Generation pipeline logic
- Existing state/data flow unless required for the UI integration
- Existing authentication or project infrastructure

Animate UI must be integrated into the existing frontend architecture.

### 2. Backend remains the source of truth

Never create:
- Fake progress
- Fake GPU usage
- Fake VRAM values
- Fake RAM values
- Fake model status
- Fake generation status
- Mock runtime values
- Simulated backend responses

Animations must represent **real existing frontend state/backend data**.

For example:

```text
Backend Progress: 42%
UI Animation: visually transitions to 42%
```

The animation must never invent progress.

### 3. Preserve existing design system

Keep the existing AI Studio visual direction:

- Matte black
- Dark gray
- Yellow accent
- Clean professional SaaS appearance
- Premium but restrained
- High information density where appropriate
- Minimal visual noise
- No unnecessary glassmorphism
- No excessive blur
- No neon gradients
- No random purple/cyan/blue effects
- No animated background gimmicks
- No excessive particle effects

Animate UI must adapt to the existing AI Studio styling rather than forcing the default Animate UI appearance onto the project.

---

# REQUIRED INTEGRATIONS

Implement the following integrations.

## 1. Workspace

Use Animate UI for:

- Animated Tabs
- Smooth tab/content transitions
- Relevant animated icons

Target areas:

```text
Generate
Preview
Settings
```

Requirements:
- Preserve existing workspace layout.
- Do not rebuild the workspace from scratch.
- Keep tab state and existing routing/state logic.
- Add subtle content transitions.
- Avoid excessive movement.

---

# 2. Prompt Panel

Use:

- Ripple Button or Liquid Button where appropriate
- AnimateIcon / animated Lucide icons

Primary target:

```text
Generate
```

Requirements:
- Keep the existing button functionality.
- Do not create a new generation API.
- Preserve loading/disabled/error/success states.
- Animation must react to the actual button state.
- Keep the animation subtle and premium.

Use animated icons for relevant actions such as:

```text
Generate
Upload
Clear
Refresh
Settings
```

Only animate icons where it improves interaction feedback.

---

# 3. Model Manager

Use Animate UI's:

- Files / folder tree style components
- Expand/collapse animation
- Relevant animated icons

Use this for:

```text
Models
Checkpoints
Weights
Model folders
Model files
Configuration files
```

Requirements:
- Preserve real model data from the backend.
- Do not hardcode model names.
- Preserve existing download/install/delete actions.
- Preserve model loading state.
- Preserve backend status.
- Use tree expansion/collapse animations.
- Make the hierarchy visually clean and compact.

Do not replace the entire Model Manager architecture.

Only replace/improve the presentation layer where appropriate.

---

# 4. Generation Status / Runtime Statistics

Use:

- Counting Number
- Sliding Number
- Smooth value transitions

Apply to real values such as:

```text
GPU Usage
VRAM
RAM
CPU
Temperature
Storage
Queue
Generation progress
Job counts
```

Requirements:

- Animate only when values actually change.
- Preserve the actual backend values.
- Do not add fake interpolation that suggests incorrect data.
- Avoid excessive animation on rapidly changing metrics.
- Prefer short, subtle transitions.

---

# 5. Pipeline

Improve the existing pipeline UI using suitable Animate UI components such as:

- Tabs
- Accordion/collapsible interactions
- Fade
- Slide
- Animated icons

Pipeline stages must remain compatible with the existing pipeline architecture.

Example:

```text
Prompt
Load Model
Load Weights
GPU Allocation
Generate Base Mesh
Texture
Remesh
Rigging
Optimization
Validation
Export
```

Requirements:

Each stage should clearly communicate actual state:

```text
Pending
Running
Completed
Failed
Skipped
```

Use animation to communicate state transitions.

Do NOT fabricate stage progress.

Do NOT modify backend pipeline execution.

---

# 6. Logs / Terminal

Use:

- CodeBlock / Code component
- Appropriate animated transitions

For real logs such as:

```text
Model loading...
CUDA allocation...
Generating mesh...
Texture generation...
Remeshing...
Exporting...
```

Requirements:

- Display actual existing logs.
- Preserve streaming behavior.
- Preserve auto-scroll behavior if already implemented.
- Do not replace the logging system.
- Do not fabricate terminal output.

Animation should improve readability rather than distract from the logs.

---

# 7. Model Cards

Improve model cards with:

- Subtle hover transitions
- Preview transitions
- Animated action icons
- Smooth reveal for secondary information

Show additional information only where useful.

Avoid:
- oversized hover effects
- excessive scaling
- floating cards
- unnecessary glow effects

---

# 8. Settings

Use Animate UI components for relevant controls:

- Animated Switch
- Toggle
- Tabs where useful
- Animated icons

Apply to:

```text
Texture support
Rigging
Optimization
GPU-related settings
Pipeline options
Other existing feature toggles
```

Important:

Do not modify the underlying settings logic.

Only improve the presentation and interaction behavior.

---

# 9. Dialogs

Use:

- Dialog
- Alert Dialog
- Appropriate enter/exit animations

Apply to existing actions such as:

```text
Delete Model
Delete File
Reset
Export
Remove
Confirmation
Dangerous actions
```

Requirements:

- Preserve existing confirmation logic.
- Preserve callbacks.
- Preserve backend calls.
- Improve opening/closing transitions.
- Maintain keyboard accessibility.

---

# 10. Notifications

Improve existing notification/toast behavior with appropriate animated transitions.

Use for real application events:

```text
Generation completed
Generation failed
Model downloaded
Model installed
Model removed
Export completed
Validation failed
```

Do not introduce fake notifications.

Do not create duplicate notification systems if one already exists.

Reuse the existing notification/state architecture whenever possible.

---

# 11. Icons

Use Animate UI / animated Lucide-style icons for appropriate interactive elements:

```text
Download
Upload
Refresh
Play
Pause
Stop
Settings
Folder
File
GPU
Terminal
Check
Warning
Error
Chevron
Expand
Collapse
Search
Trash
Export
```

Rules:

- Animate only interactive/state-changing icons.
- Do not animate every icon.
- Preserve icon meaning and accessibility.
- Keep animations short and subtle.

---

# 12. Image / 3D Preview

Use:

- ImageZoom where applicable
- Subtle toolbar transitions
- Relevant animated controls

For generated previews:

```text
Generated image
Rendered preview
Model preview
Result thumbnails
```

Requirements:
- Preserve existing preview functionality.
- Preserve generated asset URLs/data.
- Do not modify the rendering pipeline.
- Do not replace the existing 3D viewer unless specifically required.
- Add zoom/inspection behavior only where technically compatible.

---

# 13. Numbers / Metrics

Where numerical values already exist, use:

- Sliding Number
- Counting Number

Suitable areas:

```text
GPU %
VRAM
RAM
CPU
Storage
Queue
Jobs
Generation progress
Model counts
```

Do not animate values that are static unless there is a clear UX reason.

---

# 14. Navigation

Improve navigation using:

- Animated Tabs
- Collapsible navigation primitives
- Subtle icon transitions
- Smooth expand/collapse

Apply only where existing navigation benefits from interaction feedback.

Do not redesign the entire sidebar/navigation structure.

Do not change routing.

---

# 15. Empty / Loading / Transition States

Use:

- Fade
- Slide
- Blur only where appropriate
- Subtle entrance/exit transitions

Apply to:

```text
Empty model list
Empty result
Loading model
Loading preview
Loading pipeline stage
No jobs
No logs
No generated assets
```

Rules:

- Never use fake progress.
- Never create misleading skeletons.
- Never use large decorative loading animations.
- Keep loading states fast and readable.

---

# COMPONENT REPLACEMENT POLICY

Before implementing anything:

1. Scan the existing frontend.
2. Identify existing components responsible for:
   - Buttons
   - Tabs
   - Dialogs
   - Switches
   - Toasts
   - Icons
   - Number displays
   - Model tree/list
   - Loading states
   - Pipeline UI
   - Navigation
3. Determine which existing components should be:
   - Reused unchanged
   - Enhanced with Animate UI
   - Replaced by Animate UI
4. Replace only where Animate UI provides a meaningful improvement.

Do NOT blindly replace every component.

---

# IMPORTANT: REMOVE OLD UI ONLY WHEN NECESSARY

If an existing implementation already works correctly and looks consistent with the desired design:

**KEEP IT.**

Replace it only when:
- It duplicates Animate UI functionality.
- It is visually inferior.
- It is unnecessarily complex.
- It causes inconsistent interaction behavior.
- Animate UI provides a clearly better implementation.

Do not create duplicate components for the same purpose.

---

# ANIMATION DESIGN RULES

All animations must follow:

```text
Fast
Subtle
Purposeful
Consistent
State-driven
Accessible
```

Prefer:

```text
opacity
translate
scale
height
width
icon rotation
value transition
```

Avoid:

```text
large bounce
constant motion
infinite decorative animation
particle backgrounds
neon glow
excessive blur
large elastic effects
```

Animations should communicate:

```text
State change
Hierarchy
Feedback
Transition
Focus
```

They must not exist merely for decoration.

---

# RESPONSIVE REQUIREMENTS

All integrated Animate UI components must work correctly on:

- Desktop
- Laptop
- Smaller screens

Do not introduce:
- overflow issues
- layout shifts
- broken dialogs
- inaccessible controls
- clipped animations
- horizontal scrolling unless already intentional

---

# ACCESSIBILITY

Maintain:

- Keyboard navigation
- Focus states
- ARIA attributes
- Screen-reader labels
- Disabled states
- Reduced-motion compatibility

Respect:

```text
prefers-reduced-motion
```

When reduced motion is enabled, animations should be reduced or disabled appropriately.

---

# PERFORMANCE

Animate UI integration must not introduce unnecessary performance overhead.

Pay special attention to:

- 3D viewer
- Pipeline updates
- Runtime metrics
- Streaming logs
- Frequent state updates
- Large model lists
- Model tree rendering

Do not trigger unnecessary re-renders.

Do not animate rapidly changing metrics excessively.

Avoid expensive effects inside frequently updating components.

---

# IMPLEMENTATION WORKFLOW

Follow this order:

### Step 1 — Audit

Scan the complete frontend and identify all UI components relevant to this request.

### Step 2 — Dependency Check

Check:

```text
package.json
React version
Next.js version
Tailwind version
Motion/Framer Motion setup
Existing animation libraries
Existing icon libraries
```

Ensure Animate UI integration is compatible with the current project.

Do not upgrade major dependencies unless absolutely necessary.

### Step 3 — Component Mapping

Create an internal mapping:

```text
Existing Component
→ Animate UI Component
→ Keep / Replace / Enhance
→ Reason
```

### Step 4 — Implementation

Implement the selected components incrementally.

### Step 5 — Preserve Logic

Verify that:
- APIs still work
- state updates still work
- backend data is untouched
- routes remain unchanged
- model operations remain unchanged
- pipeline behavior remains unchanged

### Step 6 — Visual Consistency

Make Animate UI components match the existing AI Studio theme:

```text
Matte Black
Dark Gray
Yellow Accent
Clean Borders
Subtle Motion
Premium SaaS
```

### Step 7 — Validation

Test:

- Loading
- Error states
- Success states
- Empty states
- Disabled states
- Hover
- Click
- Keyboard interaction
- Responsive layout
- Reduced motion
- Rapid backend updates

---

# DO NOT DO

Do NOT:

- redesign the application
- change backend APIs
- change backend behavior
- create mock data
- create fake progress
- add random animations
- add neon effects
- add excessive glassmorphism
- add animated backgrounds
- replace the 3D viewer unnecessarily
- replace working architecture unnecessarily
- introduce duplicate UI systems
- upgrade dependencies blindly
- remove working functionality
- change routing
- break existing pages

---

# FINAL QUALITY BAR

The final result should feel like:

**A professional AI/3D SaaS application with refined micro-interactions.**

It should NOT feel like:

**A demo project showing off animation components.**

The user should notice that the application feels more polished, responsive, and coherent — not that an animation library was added.

After implementation, provide a concise summary of:

1. Components replaced
2. Components enhanced
3. Animate UI components added
4. Existing functionality preserved
5. Any compatibility issues
6. Any components intentionally left unchanged and why

Do not modify anything outside the scope of this UI integration unless required to make the integration function correctly.