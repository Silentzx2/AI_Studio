# UI Design System & Component Reference

## 1. Design Tokens (`app/globals.css`)

All colors and surfaces in AI 3D Studio use HSL CSS variable design tokens. Direct hex color literals in UI code are strictly disallowed.

| Token | CSS Variable Value | Purpose / Usage |
| :--- | :--- | :--- |
| `background` | `0 0% 5%` | App backdrop / canvas shell base |
| `foreground` | `0 0% 98%` | Primary high-contrast typography |
| `--surface-0` | `0 0% 6%` | Deepest surface (viewports, canvas backgrounds) |
| `--surface-1` | `0 0% 10%` | Primary panel backgrounds, cards, navigation rails |
| `--surface-2` | `0 0% 14%` | Secondary containers, active tabs, nested sub-panels |
| `--surface-3` | `0 0% 18%` | Hovered interactive states, input backgrounds |
| `--surface-4` | `0 0% 24%` | Raised borders, highlighted elements |
| `--primary` | `48 96% 50%` | Vibrant studio amber (#F9CF00), primary accents |
| `--neon-amber` | `48 100% 50%` | Glowing accents, progress bars, active badges |
| `--neon-green` | `142 71% 45%` | Online/connected status, success indicators |
| `--destructive` | `0 72% 56%` | Error states, dangerous actions, delete modals |
| `--border` | `0 0% 22%` | Standard card and container borders |

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
- `components/animate-ui/*`: `SlidingNumber`, `RippleButton`, `AnimatedTabs`, `AnimatedSwitch`, `CodeBlock`, `FileTree`, `ImageZoom`, `AnimatedIcon`, `BorderBeam`, `AnimatedStatusBadge`.

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
| `/animation` | workspace | animation | AnimationStudio |
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
| ⌘3 | Navigate to System |
| ⌘, | Navigate to Settings |
| G | Generate tool |
| R | Remesh tool |
| T | Texture tool |
| A | Animation tool |
| S | Segment tool |
