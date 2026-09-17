# UI Design System & Component Reference

## 1. Design Tokens (`app/globals.css`)

All colors and surfaces in AI Studio use HSL CSS variable design tokens. Direct hex color literals in UI code are strictly disallowed.

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

Universal motion specifications compatible with both `framer-motion` and `motion/react`:

- `MOTION_FAST`: `{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }` — Tooltips, micro-hovers, toggles.
- `MOTION_BASE`: `{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }` — Tab transitions, dropdown menus.
- `MOTION_SLOW`: `{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }` — Modal entry/exit, panel expand/collapse.
- `MOTION_SPRING`: `{ type: 'spring', stiffness: 300, damping: 30 }` — Mobile drawer slides, floating panels.
- `MOTION_SPRING_SNAPPY`: `{ type: 'spring', stiffness: 400, damping: 25 }` — Pill indicators, selection rings.

---

## 3. Premium & Animated UI Components

### Existing UI Primitives
- `components/premium/*`: `GlassCard`, `NeonButton`, `Badge`, `StatusDot`, `MetricCard`, `ProgressBar`, `Spinner`.
- `components/animate-ui/*`: `SlidingNumber`, `RippleButton`, `AnimatedTabs`, `AnimatedSwitch`, `CodeBlock`, `FileTree`, `ImageZoom`, `AnimatedIcon`, `BorderBeam`, `AnimatedStatusBadge`.

### Components Added (Pass 4.5 & 4.6)
1. **Skeleton Loaders (`components/ui/skeleton.tsx`)**:
   - Installed via base shadcn.
   - Wired in `OutputsPage.tsx`, `InstalledModelsTab.tsx`, and `StudioDashboard.tsx`.
2. **Sortable Drag-and-Drop (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)**:
   - Wired in `features/new-workspace/Dashboard/OutputsPage.tsx` for client-side asset ordering.
3. **ShimmerButton (`components/ui/shimmer-button.tsx`)**:
   - Re-themed to `hsl(var(--neon-amber))` / `hsl(var(--primary))` gradient.
   - Wired in `features/new-workspace/Panels/GeneratePanel.tsx` as the primary 3D generation CTA.
4. **Animated Navigation Tabs & Sliding Indicator**:
   - Powered by unified `motion/react` with spring physics (`stiffness: 450, damping: 32`).
   - `TopHeader.tsx`: Sliding active pill highlight (`layoutId="topNavActiveIndicator"`) across Home, 3D Studio, Animation, Assets, and System.
   - `GeneratePanel.tsx`: Subaction switch (`layoutId="subActionActiveTab"`) seamlessly transitioning between Image, Multi, Text, and Sketch modes.
5. **Multi-View 4-Angle Orthogonal Capture Grid**:
   - Orthogonal 4-perspective slots: `Front*` (primary required), `Right`, `Back`, and `Left`.
   - Supports drag-and-drop, individual slot file selection, sample 4-view set loading, and image clearing.
   - State synchronized into `generationSettings.multiviewImages` and forwarded to generation API.
6. **2D Concept Sketchpad Canvas (`subAction === 'edit'`)**:
   - Lightweight, zero-lag HTML5 `<canvas>` interactive sketching area.
   - Features brush/eraser modes, 4 curated palette swatches (#FFFFFF, #F59E0B, #06B6D4, #10B981), 3 stroke sizes (Fine 2px, Med 5px, Bold 10px), and instant canvas wipe.
   - "Use as 3D Reference" button exports PNG data URL directly into `generationSettings.image`.
7. **Text-to-3D Workshop (`subAction === 'wand'`)**:
   - Dedicated prompt workspace with "Inspire Me" / Roll Random Idea button with curated 3D concepts.
   - Collapsible Negative Prompt input with fast chip toggles (+PBR Game Asset, +Clean Quad Topology, etc.).

---

## 4. Rendering Performance & SSR Architecture

- **Elimination of Dynamic CSR Bailouts**: Replaced lazy `next/dynamic` wrappers (`ssr: false`) with direct panel imports in `WorkspaceShell.tsx`. This avoids client-side hydration delays and ensures instant HTML markup delivery during server-side rendering.
- **Client Boundary Placement**: Added explicit `'use client'` directives to root route wrappers (`app/workspace/page.tsx`, `app/workspace/[...tool]/page.tsx`, `app/animation/page.tsx`, `app/dashboard/page.tsx`, `app/outputs/page.tsx`, `app/system/page.tsx`) to clearly separate SSR delivery from stateful interactive widgets.
- **Unified Motion Runtime**: Standardized motion imports to `motion/react` across all panels and modals (`LeftNavigation`, `TopHeader`, `GeneratePanel`, `LiveExecutionPanel`, `ExportModal`) to prevent bundle duplication and conflicting animation contexts.

