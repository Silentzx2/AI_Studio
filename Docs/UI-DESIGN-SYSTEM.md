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
5. **Clean SaaS Left Navigation Rail (`LeftNavigation.tsx`)**:
   - Streamlined, high-contrast SaaS icon rail (64px width) without visual clutter:
     - **3D Creation Tools**: Model (`G`), Poly/Remesh (`R`), Texture (`T`), Animate (`A`), Segment (`S`).
     - **Hairline Divider**: Minimal, high-precision divider line (`w-7 h-px bg-white/[0.08]`).
     - **Workspace & Hub Views**: Overview (`⌘1`), Assets (`⌘2`), ComfyUI (`⌘4`).
   - Removed cluttered text category headers and glowing decorations in favor of clean typography, subtle hover states, and standard SaaS tooltips.
   - **Framer Motion Active Indicator**:
     - Scoped `<LayoutGroup id="workspace-left-navigation">` with layout-enabled `<motion.nav>` and `<motion.button>`.
     - `layoutId="saasNavActivePill"`: Seamless spring-animated backdrop pill (`stiffness: 440, damping: 32`) sliding cleanly behind active selections.
     - Execution status indicator with subtle, non-intrusive animated pulse dot when a task is running.
     - Tactile spring feedback on hover and tap (`whileHover={{ scale: 1.03 }}`, `whileTap={{ scale: 0.96 }}`).
6. **Smart Button Arrangement & UI Streamlining**:
   - `GeneratePanel.tsx`: Refactored prompt card with a dedicated micro-toolbar containing "Inspire" (random prompt generator), "AI Enhance" (3D quality descriptor expansion), and quick style chips (+PBR Game Asset, +Clean Quad Topology, etc.).
   - Pre-flight configuration summary bar docked directly above the primary `ShimmerButton` action trigger.
   - Standardized button padding, consistent hover states, and smooth click feedback across panels.
7. **Multi-View 4-Angle Orthogonal Capture Grid**:
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

8. **Workspace Shell & Inspector Stabilization**:
   - `WorkspaceShell.tsx`: Standardized overlay left offset to `md:left-[64px]` matching the precision 64px LeftNavigation icon rail.
   - `RightWorkspacePanel.tsx`: Established permanent 3-tab inspector layout (`Properties`, `Console/Executing`, `Assets`) with zero tab shifting or jumping during generation transitions, featuring live execution badge indicators.

---

## 4. Rendering Performance & SSR Architecture

- **Elimination of Dynamic CSR Bailouts**: Replaced lazy `next/dynamic` wrappers (`ssr: false`) with direct panel imports in `WorkspaceShell.tsx`. This avoids client-side hydration delays and ensures instant HTML markup delivery during server-side rendering.
- **Client Boundary Placement**: Added explicit `'use client'` directives to root route wrappers (`app/workspace/page.tsx`, `app/workspace/[...tool]/page.tsx`, `app/animation/page.tsx`, `app/dashboard/page.tsx`, `app/outputs/page.tsx`, `app/system/page.tsx`) to clearly separate SSR delivery from stateful interactive widgets.
- **Unified Motion Runtime**: Standardized motion imports to `motion/react` across all panels and modals (`LeftNavigation`, `TopHeader`, `GeneratePanel`, `LiveExecutionPanel`, `ExportModal`) to prevent bundle duplication and conflicting animation contexts.

---

## 5. Mobile Responsiveness & Overlap Elimination Standards

To ensure a seamless, high-contrast SaaS experience on mobile devices (phones and tablets, 320px–1024px) without overlapping controls or cutoffs:

1. **Panel Mutual Exclusion (< 768px)**:
   - Left tool panels (`isLeftPanelOpen`) and right inspector panels (`isRightPanelOpen`) are mutually exclusive on mobile viewports. Opening one automatically dismisses the other.
   - Active window resize listeners enforce mutual exclusion if the screen width falls below 768px while both panels are active.

2. **Unified Mobile Bottom Dock**:
   - Replaced competing, overlapping floating action buttons with a unified bottom bar (`bottom-2.5 inset-x-3`).
   - Dock displays `[ Tools ]` on the left and `[ Inspector ]` on the right with tactile pill styling.
   - Automatically hides when either panel is opened, eliminating clutter and overlapping click targets.

3. **Viewport Transport & Shading HUD Elevation**:
   - Transport and camera controls in `MeshViewer.tsx` are positioned at `bottom-14 md:bottom-4`.
   - On mobile screens, this elevates the capsule 46px above the bottom dock, preventing any touch conflicts or visual overlap.

4. **Responsive Modal Sheets with Dismiss Headers**:
   - Panels on mobile render as edge-to-edge modal sheets (`inset-x-2 top-2 bottom-2`) with an explicit top bar, title, and `X` close button to return to the 3D viewport instantly.

5. **Animation Studio Responsiveness**:
   - Replaced fixed desktop columns with responsive viewport stage (`flex-1`) and mobile bottom dock (`Library & Assets` and `Inspector`).
   - Compact mode selector pills in the header with icons and responsive labels (`hidden sm:inline`).

6. **ComfyUI Mobile Integration**:
   - `TopHeader` hamburger menu is wired into the mobile navigation drawer overlay.
   - Subheader toolbar controls feature responsive icon-only presentation on small viewports with no horizontal overflow.

7. **Admin Control Center Drawer**:
   - Mobile navigation drawer in `AdminShell.tsx` features `fixed top-0 bottom-0 left-0 max-w-[85vw]` with a dark blurred backdrop (`bg-black/60 backdrop-blur-sm`).


