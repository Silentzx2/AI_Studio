# UI Design System & Component Reference

## 1. Design Tokens (`app/globals.css`)

All colors and surfaces in ForMash 3D use HSL CSS variable design tokens. Direct hex color literals in UI code are strictly disallowed.

| Token | CSS Variable Value | Hex / Color Equivalent | Purpose / Usage |
| :--- | :--- | :--- | :--- |
| `background` | `0 0% 3.1%` | `#080808` | Global Matte Black app backdrop / canvas shell base |
| `foreground` | `0 0% 96%` | `#F5F5F5` | Primary high-contrast typography (clean crisp white) |
| `--surface-0` | `0 0% 2.4%` | `#060606` | Deepest surface (3D viewport, canvas background) |
| `--surface-1` | `0 0% 6.7%` | `#111111` | Primary panel backgrounds, cards, navigation rails |
| `--surface-2` | `0 0% 10.2%` | `#1A1A1A` | Secondary containers, active tabs, nested sub-panels |
| `--surface-3` | `0 0% 14.1%` | `#242424` | Hovered interactive states, input backgrounds |
| `--surface-4` | `0 0% 20%` | `#333333` | Raised borders, highlighted elements |
| `--primary` | `48 100% 50%` | `#FFCC00` | Vivid Studio Electric Gold (high-saturation, maximum LCD punch) |
| `--primary-foreground`| `0 0% 3%` | `#080808` | High-contrast dark typography on primary yellow (>12:1 WCAG contrast) |
| `--accent-dark` | — | `#E09800` | Pressed states, gradient bottom stop |
| `--accent-light` | — | `#FFE066` | Hover states, specular highlight top stop |
| `--border` | `0 0% 20%` | `#333333` | Standard card and container borders |
| `--muted-foreground` | `0 0% 63%` | `#A0A0A0` | Readable secondary/placeholder typography (>4.5:1 WCAG AA) |
| `--chart-gpu` | `48 100% 50%` | `#FFCC00` | Telemetry GPU telemetry line |
| `--chart-vram`| `48 100% 70%`| `#FFE066` | Telemetry VRAM telemetry line |
| `--chart-cpu` | `0 0% 75%` | `#BFBFBF` | Telemetry CPU telemetry line |
| `--chart-temp`| `40 100% 44%`| `#E09800` | Telemetry temperature line |
| Semantic Success | — | `#22C55E` / `emerald-400` | Online status, completed jobs, healthy checks |
| Semantic Warning | — | `#FFCC00` / `amber-400` | Degraded service, queue wait |
| Semantic Destructive | `0 72% 56%` | `#EF4444` / `rose-500` | Errors, deletion modals, fatal logs |
| Semantic Info | — | `#3B82F6` / `sky-400` | Info notices, informative tooltips |

---

## 2. Motion Presets (`lib/motion.ts`)

Universal motion specifications compatible with `motion/react`:

- `MOTION_FAST`: `{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }` — Tooltips, micro-hovers, toggles.
- `MOTION_BASE`: `{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }` — Tab transitions, dropdown menus.
- `MOTION_SLOW`: `{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }` — Modal entry/exit, panel expand/collapse.
- `MOTION_SPRING`: `{ type: 'spring', stiffness: 300, damping: 30 }` — Mobile drawer slides, floating panels.
- `MOTION_SPRING_SNAPPY`: `{ type: 'spring', stiffness: 400, damping: 25 }` — Pill indicators, selection rings.

---

## 3. UI Components

### Existing UI Primitives
- `components/premium/*`: `GlassCard`, `NeonButton`, `Badge`, `StatusDot`, `MetricCard`, `ProgressBar`, `Spinner`.

### Core Components
- `components/ui/simple-tooltip.tsx`: Tooltip with configurable position and delay.
- `components/ui/skeleton.tsx`: Loading skeleton with shimmer animation.
- `components/Providers.tsx`: Root providers (Theme, Toast, etc.).

---

## 4. Workspace Layout Architecture

The `WorkspaceShell` (`features/workspace/WorkspaceShell.tsx`) is the main application layout:

```
┌─────────────────────────────────────────────────────┐
│ TopHeader (h-16, z-50)                              │
│ ┌──────┐ ┌──────────────────────────┐ ┌──────────┐ │
│ │Logo  │ │ Navigation Title         │ │Settings  │ │
│ └──────┘ └──────────────────────────┘ └──────────┘ │
├──────┬──────────────────────────┬───────────────────┤
│      │                          │                   │
│ Left │    Center Viewport       │  Right Panel      │
│ Nav  │    (Three.js WebGL)      │  (Inspector)      │
│      │                          │                   │
│ Rail │                          │                   │
│      │                          │                   │
├──────┴──────────────────────────┴───────────────────┤
│ Bottom Dock (mobile only, z-20)                     │
│ [ Tools ] [ Inspector ]                             │
└─────────────────────────────────────────────────────┘
```

### Responsive Breakpoints
- **Desktop (≥1024px)**: Full 3-column layout with docked left nav rail (64px) and right inspector panel.
- **Tablet (768–1023px)**: Left nav rail stays; right panel collapses to overlay.
- **Mobile (<768px)**: Both panels become slide-over overlays; bottom dock provides toggle buttons. Panels are mutually exclusive.

---

## 5. Rendering Performance & SSR Architecture

- **Client Boundaries**: Heavy interactive pages use `'use client'` directive (e.g., `app/workspace/page.tsx`, `app/animation/page.tsx`).
- **Dynamic Imports**: 3D viewport uses `next/dynamic` with `ssr: false` and loading skeleton.
- **Motion**: All animations use `motion/react` for consistent runtime.

---

## 6. Workspace Route Mapping

| Route | Main Nav | Active Tool | Panel |
|---|---|---|---|
| `/` | dashboard | — | StudioDashboard |
| `/workspace` | workspace | model | GeneratePanel |
| `/workspace/texture` | workspace | texture | TexturePanel |
| `/workspace/remesh` | workspace | remesh | RemeshPanel |
| `/workspace/edit` | workspace | edit | SecondaryPanel |
| `/workspace/segment` | workspace | segment | SecondaryPanel |
| `/animation` | workspace | animation | AnimationStudio (ARDY) |
| `/rigging` | workspace | rigging | RiggingStudio (UniRig/AI) |
| `/outputs` | assets | — | OutputsPage |
| `/system` | system | — | SystemPage |
| `/admin` | — | — | AdminDashboard |

---

## 7. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| ⌘1 | Navigate to Dashboard |
| ⌘2 | Navigate to Assets |
| ⌘3 | Navigate to System |
| ⌘, | Navigate to Settings |
| G | Generate tool |
| R | Remesh tool |
| T | Texture tool |
| A | Animation tool |
| K | Rigging tool |
| S | Segment tool |

---

## 8. Unified CSS Variable Theme & Studio Standards

- **Canonical CSS Surface Tokens**: All studios (3D Generation, Animation, and Rigging) strictly depend on global CSS design tokens defined in `app/globals.css`:
  - Canvas & Viewport Base: `bg-[hsl(var(--surface-0))]`
  - Side Panels & Toolbars: `bg-[hsl(var(--surface-1))]`
  - Cards, Containers & Inputs: `bg-[hsl(var(--surface-2))]`
  - Sliders, Checkboxes & Sub-elements: `bg-[hsl(var(--surface-3))]`
  - Subdued Borders: `border-white/[0.08]` and `border-white/[0.12]`
  - Brand Accent: `text-primary`, `bg-primary`, `border-primary` (`hsl(var(--primary))`)
- **Dual-Track Animation Timeline**:
  - Clean `h-[148px]` compact layout avoiding mesh clutter.
  - **Track 1**: Generated Motion clip bar with character prompt label, duration, and FPS badge.
  - **Track 2**: Discrete keyframe pose markers with diamond badges and tooltips.
  - Scrubber with draggable triangular playhead needle and transport playback controls.
- **Rigging Architecture (UniRig AI & Manual Symmetry)**:
  - **Auto-Rig (UniRig AI)**: Invokes backend `unirig_auto_rig` pipeline with user-chosen target skeleton presets (`biped`, `humanoid`, `quadruped`). No ARDY references appear in the rigging module.
  - **Manual Rig with Bilateral Symmetry (X-Mirror)**: Interactive 3D bone placement with automatic opposite-side mirroring (`[-x, y, z]`). Editing or translating a bone on one side automatically mirrors to its anatomical counterpart (`Left*` <-> `Right*`, `*_L` <-> `*_R`).
  - **Real 3D Armature**: Three.js octahedron bone meshes and glowing spherical joints rendered natively in `MeshViewer` (no fake 2D SVG overlays), with gizmo controls (`select`, `move`, `rotate`, `scale`).

---

## 9. Specular Lighting, Button Shine & DCC Bridge Integration

- **Button Specular Sweep (`.btn-lighting-shine`)**:
  - Implements an interactive lighting shine animation (`btn-specular-sweep`) across primary generation buttons (3D Generation, PBR Texturing, Retopology, Segmentation, Motion, and Export).
  - Uses an angled pseudo-element `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)` translating across the surface on idle and hover.
- **Glassmorphism Tokens**:
  - `.glass-panel`: Ultra-clean frosted glass container with `backdrop-blur-xl`, subtle background tint, and 1px specular border highlights (`rgba(255,255,255,0.12)`).
  - `.glass-card-interactive`: Elevated interactive card with hover transform, shadow elevation, and primary border transition.
- **Studio Environment Engine**:
  - Real-time Three.js scene environment customization with 6 backdrop color presets, 5 lighting atmospheres, and 4 chromatic light tones (Studio, Warm Gold, Cyber Cool, Neutral).
  - Fully dynamic directional lighting calculation (Key, Fill, Rim, Ambient) and contact shadow intensity.
- **DCC Live Bridge (`DccBridgeModal.tsx`)**:
  - Out-of-the-box bridge support for Blender 4.x/5.x, Unreal Engine 5 (Remote Control API), Unity Editor, and Autodesk Maya.
  - Features local daemon health checking, custom port binding, pipeline toggle flags, and 1-click Python ingestion scripts.

