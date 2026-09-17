# AI 3D Studio — Changelog

All notable changes, architectural updates, and feature implementations for AI 3D Studio are documented in this file.

---

## [Unreleased] — 2026-09-17

### 🎨 UI Polish, Design Tokens & Animation Architecture
- **CSS Variable Design Token Harmonization**:
  - Replaced hardcoded hex color literals across the frontend with canonical CSS variable semantic tokens (`hsl(var(--surface-0..4))`, `hsl(var(--primary))`, `hsl(var(--neon-amber))`, `hsl(var(--border))`, `hsl(var(--foreground))`).
  - Standardized surface elevation hierarchy from canvas backdrop (`--surface-0`) up to raised floating panels and modal borders (`--surface-4`).
- **Unified Motion Presets (`lib/motion.ts`)**:
  - Added universal motion presets (`MOTION_FAST`, `MOTION_BASE`, `MOTION_SLOW`, `MOTION_SPRING`, `MOTION_SPRING_SNAPPY`).
  - Standardized on `motion/react` across all panels and dialogs to eliminate conflicting animation contexts and prevent dual-library bundle bloat.
- **Fluid Navigation Animations**:
  - **TopHeader**: Added animated sliding pill indicator using `motion/react` (`layoutId="topNavActiveIndicator"`, spring physics `stiffness: 450, damping: 32`) across `Home`, `3D Studio`, `Animation`, `Assets`, and `System`.
  - **LeftNavigation**: Reorganized into **Studio Views** (`Overview`, `Assets`, `System`) and **3D Generation Tools** (`Model`, `Poly`, `Texture`, `Animate`, `Segment`). Docked at `md:left-[72px]` so the rail stays visible across dashboard/assets/system views.
  - **GeneratePanel Subaction Tabs**: Subaction pills (`Image`, `Multi`, `Text`, `Sketch`) use `motion.div layoutId="subActionActiveTab"` with spring transitions.
- **Premium UI Components**:
  - Added MagicUI-themed `ShimmerButton` (`components/ui/shimmer-button.tsx`) as the primary 3D generation CTA.
  - Integrated `@dnd-kit` sortable drag-and-drop in `OutputsPage.tsx` for visual reordering of generated 3D assets.
  - Added Shadcn `Skeleton` loaders across `OutputsPage`, `InstalledModelsTab`, and `StudioDashboard`.

---

### 🧩 Generation Panel Modes (Multi-View, Text-to-3D, Sketchpad)
- **Multi-View 4-Angle Orthogonal Studio (`subAction === 'crop'`)**:
  - Dedicated 4-perspective orthogonal capture grid: `Front*` (primary required), `Right`, `Back`, and `Left`.
  - Drag-and-drop and slot-specific upload support with individual remove actions.
  - "Load 4-View Sample Set" and "Clear All Views" actions.
  - State persisted in `generationSettings.multiviewImages` and wired to generation API payloads.
- **2D Concept Sketchpad Canvas (`subAction === 'edit'`)**:
  - High-performance HTML5 `<canvas>` interactive sketching area.
  - Brush and eraser modes, 4 curated color swatches (`#FFFFFF`, `#F59E0B`, `#06B6D4`, `#10B981`), 3 stroke sizes (Fine 2px, Med 5px, Bold 10px), and instant canvas wipe.
  - "Use as 3D Reference" button exports PNG data URL directly into `generationSettings.image`.
- **Text-to-3D Workshop (`subAction === 'wand'`)**:
  - Dedicated Text-to-3D workspace with prompt enhancer and **"Inspire Me"** / Roll Random Idea button powered by curated prompt concepts.
  - Collapsible **Negative Prompt** input for artifact exclusion.
  - Fast style preset chips (`+ PBR Game Asset`, `+ Clean Quad Topology`, `+ Sci-Fi`, `+ Stylized`, `+ Photorealistic`, `+ Cyberpunk`, `+ Fantasy`).

---

### ⚡ Performance, SSR Acceleration & App Router
- **Eliminated Dynamic CSR Bailouts**:
  - Replaced lazy dynamic imports (`dynamic(..., { ssr: false })`) with direct imports in `WorkspaceShell.tsx` for all standard DOM panels (`GeneratePanel`, `TexturePanel`, `RemeshPanel`, `SecondaryPanels`, `RightWorkspacePanel`, `OutputsPage`, `SystemPage`, `StudioDashboard`).
  - Pre-renders static HTML shells on the server for instant First Contentful Paint (FCP) and seamless hydration.
- **Client Boundary Architecture**:
  - Placed `'use client'` explicitly on root route entry points (`app/workspace/page.tsx`, `app/workspace/[...tool]/page.tsx`, `app/page.tsx`, `app/dashboard/page.tsx`, `app/outputs/page.tsx`, `app/system/page.tsx`, `app/animation/page.tsx`).
- **Dev & Build Performance**:
  - Configured `allowedDevOrigins` in `next.config.ts` for cross-origin HMR support.
  - Verified `npx tsc --noEmit` with 0 errors and production build (`npm run build`) with all 12 routes statically and dynamically generated.
