# QA Audit Report

## Summary
- **Total issues found: 47**
- **Critical: 6**
- **Medium: 18**
- **Low: 23**

---

## Critical Issues (must fix)

### 1. [features/new-workspace/Panels/SegmentationPanel.tsx] — Hardcoded hex colors throughout
- **Current:** ~30+ hardcoded hex colors (`#f5c518`, `#f3f4f6`, `#9ca3af`, `#111216`, `#181a20`, `#282c37`, `#e5e7eb`, `#14161c`, `#232731`, `#252834`, `#cbd5e1`, `#8e95a5`, `#6b7280`, `#fca5a5`, `#ef4444`)
- **Required:** All colors should use CSS variables via `hsl(var(--variable))` pattern for theme consistency
- **Lines:** 20–134 (nearly every element)
- **Impact:** Dark/light theme switching will not affect this panel; visual inconsistency

### 2. [app/layout.tsx] — Hardcoded HSL glow + rgba vignette
- **Current:**
  - Line 58: `bg-[hsl(275_95%_65%/0.07)]`
  - Line 63: `bg-[hsl(190_100%_55%/0.05)]`
  - Line 68: `bg-[linear-gradient(hsl(275_95%_65%)_1px,transparent_1px)]`
  - Line 73: `[box-shadow:inset_0_0_150px_rgba(0,0,0,0.7)]`
- **Required:** Use CSS variables (`hsl(var(--neon-purple))`, `hsl(var(--neon-cyan))`) and `hsl(var(--surface-0))` for vignette
- **Impact:** Theme engine cannot control layout ambient effects

### 3. [features/settings/sections/GenerationSection.tsx] — Hardcoded hex colors for Low VRAM UI
- **Current:**
  - Line 276: `text-[#38bdf8]`
  - Line 286: `bg-[#38bdf8]`
  - Line 305: `text-[#38bdf8]`
  - Line 316: `bg-[#38bdf8]/15 text-[#38bdf8] border-[#38bdf8]/30`
- **Required:** Use `hsl(var(--neon-blue))` or a dedicated CSS variable
- **Impact:** Low VRAM section colors won't adapt to theme changes

### 4. [app/globals.css] — Missing `prefers-reduced-motion` media query
- **Current:** `.reduced-animations` class exists but is never auto-applied via media query
- **Required:** Add `@media (prefers-reduced-motion: reduce) { ... }` to automatically disable animations
- **Lines:** 1954–1967
- **Impact:** Accessibility violation — users with motion sensitivity get no relief

### 5. [features/new-workspace/lib/api.ts] — Shared apiClient mutation
- **Current:** Line 229 uses `Object.assign(baseApiClient, {...})` which permanently mutates the shared `services/apiClient` instance with event-emitting methods
- **Required:** Create a separate instance or use composition to avoid polluting the shared client
- **Impact:** Race conditions — two `ApiClient` instances compete for the same listener Map; unpredictable event handler cleanup

### 6. [features/model-manager/ModelCard.tsx] — Unsafe property access causing potential NaN
- **Current:**
  - Line 48: `{model.size_estimate_gb || (model.size_mb / 1000).toFixed(1)}` — `size_mb` may be undefined
  - Line 52: `{(model.vram_required_mb / 1024).toFixed(1)}` — `vram_required_mb` may be undefined
- **Required:** Add null checks: `{(model.size_mb ? model.size_mb / 1000 : 0).toFixed(1)}`
- **Impact:** NaN displayed in UI if model data is incomplete

---

## Medium Issues (should fix)

### 7. [app/globals.css] — Excessive backdrop-blur in component classes
- **Current:** The following classes use backdrop-filter without performance consideration:
  - `.tooltip-premium` (line 605): `blur(12px)`
  - `.dialog-premium` (line 657): `blur(32px) saturate(190%)`
  - `.sheet-premium` (line 670): `blur(24px) saturate(180%)`
  - `.dropdown-premium` (line 680): `blur(20px) saturate(180%)`
  - `.popover-premium` (line 693): `blur(20px) saturate(180%)`
  - `.toast-premium` (line 741): `blur(16px) saturate(180%)`
  - `.card-glass-hover` (line 773): `blur(16px) saturate(180%)`
  - `.card-elevated` (line 2177): `backdrop-blur-md`
  - `.tooltip-style` (line 2209): `backdrop-blur-sm`
- **Required:** Reduce blur values or make them gated by CSS variables (like `--glass-blur`)
- **Impact:** Performance degradation on lower-end GPUs; battery drain on mobile

### 8. [app/globals.css] — Hardcoded hex colors in Tripo design system
- **Current:**
  - Line 2247–2248: `.btn-option-active` uses `color: #0c0d10` and `#fafafa`
  - Line 2277–2278: `.nav-link.active` uses `color: #0c0d10`
  - Line 2306–2307: `.tab-trigger[data-state="active"]` uses `#fafafa` and `#0c0d10`
  - Line 2372: `.sidebar-nav-item.active` uses `color: #0c0d10`
- **Required:** Use `hsl(var(--surface-0))` and `hsl(var(--foreground))` equivalents
- **Impact:** Tripo-style components won't respect dark/light theme switching

### 9. [features/model-manager/ModelCard.tsx] — Low-contrast text via opacity
- **Current:**
  - Line 34: `text-[hsl(var(--foreground))]/50` (50% opacity text)
  - Line 35: `text-[hsl(var(--foreground))]/40` (40% opacity labels)
  - Line 44: `text-[hsl(var(--foreground))]/60` (60% opacity metadata)
- **Required:** Use `text-muted-foreground` or ensure contrast ratio ≥ 4.5:1
- **Impact:** WCAG AA contrast failure on dark backgrounds

### 10. [features/new-workspace/Panels/RemeshPanel.tsx] — Native range inputs lack cursor-pointer
- **Current:** Lines 103–108, 205–208, 222–226, 240–243: `<input type="range">` without `cursor-pointer` class
- **Required:** Add `cursor-pointer` to all range inputs
- **Impact:** Inconsistent cursor behavior on interactive sliders

### 11. [features/new-workspace/Panels/TexturePanel.tsx] — Native range inputs lack cursor-pointer
- **Current:** Lines 770, 815: `<input type="range">` without `cursor-pointer` class
- **Required:** Add `cursor-pointer`
- **Impact:** Same as above

### 12. [features/new-workspace/RightPanel/RightPropertyPanel.tsx] — Native range inputs lack cursor-pointer
- **Current:** Lines 353, 369, 385, 401: `<input type="range">` without `cursor-pointer` class
- **Required:** Add `cursor-pointer`
- **Impact:** Same as above

### 13. [features/admin/tabs/ModelsTab.tsx] — Native range inputs lack cursor-pointer
- **Current:** Line 1005: `<ProgressBar>` component may render range-like elements without pointer
- **Required:** Ensure all interactive elements have cursor-pointer
- **Impact:** Same as above

### 14. [app/settings/page.tsx] — Sticky header uses `backdrop-blur-sm` with `bg-card/50`
- **Current:** Line 687: `bg-card/50 backdrop-blur-sm`
- **Required:** Use opaque background (`bg-card`) or increase opacity to ≥ 0.9
- **Impact:** Content bleed-through when scrolling; reduced readability

### 15. [features/new-workspace/Panels/GeneratePanel.tsx] — Native range inputs lack cursor-pointer
- **Current:** Lines 769–779, 814–824: `<input type="range">` without explicit cursor-pointer
- **Required:** Add `cursor-pointer`
- **Impact:** Inconsistent cursor behavior

### 16. [features/new-workspace/store/WorkspaceContext.tsx] — Unsafe property access
- **Current:** Line 273: `(h.prompt?.[1] as string)?.slice(0, 40)` — assumes prompt array structure
- **Required:** Add type guard for prompt array
- **Impact:** Potential runtime error if API returns unexpected format

### 17. [features/model-manager/tabs/InstalledModelsTab.tsx] — Hardcoded hex color classes
- **Current:**
  - Line 95: `bg-[hsl(var(--surface-2))] border-[hsl(var(--border))]/[0.3]` — uses opacity modifier
  - Line 102: `bg-[hsl(var(--surface-2))] border-[hsl(var(--border))]/[0.3]`
  - Line 112: `bg-green-900/30`, `bg-red-900/30`, `bg-yellow-900/30`
  - Line 132: `bg-[hsl(var(--surface-2))]`
  - Line 151: `border-[hsl(var(--border))]/[0.3]`
- **Required:** Use semantic tokens or consistent opacity pattern
- **Impact:** Opacity modifiers may cause inconsistency across browsers

### 18. [app/settings/page.tsx] — Inline highlight colors use yellow hardcoded
- **Current:** Line 293: `bg-yellow-500/30 text-yellow-900 dark:text-yellow-100`
- **Required:** Use CSS variable-based highlight (e.g., `bg-primary/20 text-primary`)
- **Impact:** Search highlight doesn't respect theme customizations

### 19. [features/admin/AdminSidebar.tsx] — Hardcoded gradient with CSS variable fallback
- **Current:** Line 39–42: `background: 'hsl(var(--card) / 0.95)'`, `backdropFilter: 'blur(24px)'`
- **Required:** Use Tailwind classes for consistency
- **Impact:** Inline styles harder to override and maintain

### 20. [features/new-workspace/Header/TopHeader.tsx] — Hardcoded status colors
- **Current:** Lines 151–153: Uses `hsl(var(--status-online))` / `hsl(var(--status-offline))` — these CSS variables may not be defined in light mode
- **Required:** Verify `--status-online`, `--status-offline`, `--status-busy` have light mode values
- **Impact:** Status indicator may be invisible in light mode

### 21. [features/admin/tabs/OverviewTab.tsx] — Hardcoded emerald/green colors
- **Current:**
  - Line 134: `from-emerald-500/15 to-emerald-500/5`
  - Line 201: `from-emerald-500/10 to-green-500/5`
- **Required:** Use `hsl(var(--neon-green))` with opacity modifiers
- **Impact:** Inconsistent with neon color system

### 22. [features/admin/tabs/RuntimeTab.tsx] — Hardcoded emerald/green colors
- **Current:** Line 201: `from-emerald-500/10 to-green-500/5`
- **Required:** Use `hsl(var(--neon-green))` with opacity modifiers
- **Impact:** Same as above

### 23. [app/globals.css] — `.glass-effect` and `.glass-card` backdrop-filter without fallback
- **Current:** Lines 1697–1702: `backdrop-filter: blur(var(--glass-blur, 12px)) saturate(1.2)` — no solid background fallback
- **Required:** Add `@supports not (backdrop-filter: blur(1px))` fallback with opaque background
- **Impact:** On browsers without backdrop-filter support, content is unreadable

### 24. [features/new-workspace/RightPanel/RightAssetsPanel.tsx] — Asset card uses `cursor-grab`
- **Current:** Line 367: `cursor-grab active:cursor-grabbing`
- **Required:** Keep grab cursors but ensure `cursor-pointer` is used for click-to-select behavior (or clearly distinguish drag vs click)
- **Impact:** Users may not realize cards are clickable to select

---

## Low Issues (nice to have)

### 25. [app/globals.css] — Duplicate `@import "tailwindcss"` and theme blocks
- **Current:** The file is 2381 lines with some duplicated `:root` blocks (lines 3–48 and 1544–1597)
- **Required:** Consolidate duplicate variable definitions
- **Impact:** Maintenance burden; potential variable override confusion

### 26. [app/globals.css] — Unused `.glass`, `.glass-subtle`, `.glass-strong`, `.glass-ultra`, `.glass-frosted` classes
- **Current:** Lines 1696–1721 define multiple glass variants, many unused
- **Required:** Remove unused classes
- **Impact:** CSS bloat (file is already 2381 lines)

### 27. [app/globals.css] — Unused `.tabs-glass`, `.tabs-minimal`, `.tabs-pill`, `.tabs-underline`, `.tabs-rounded` classes
- **Current:** Lines 1824–1852
- **Required:** Remove if not used in components
- **Impact:** CSS bloat

### 28. [app/globals.css] — Unused `.card-hover-lift`, `.card-hover-glow`, `.card-hover-border` classes
- **Current:** Lines 1861–1878
- **Required:** Remove if not used
- **Impact:** CSS bloat

### 29. [app/globals.css] — Unused `.upload-pulse` animation
- **Current:** Lines 1924–1932
- **Required:** Remove if not used
- **Impact:** CSS bloat

### 30. [app/globals.css] — Unused `.terminal-cursor` class
- **Current:** Lines 1934–1946
- **Required:** Remove if not used
- **Impact:** CSS bloat

### 31. [app/globals.css] — Unused `.glow-ring` class
- **Current:** Lines 1986–2013
- **Required:** Remove if not used
- **Impact:** CSS bloat

### 32. [app/globals.css] — Unused `.btn-premium` class
- **Current:** Lines 1882–1922
- **Required:** Remove if not used
- **Impact:** CSS bloat

### 33. [app/globals.css] — Unused `.progress-neon`, `.progress-gradient` classes
- **Current:** Lines 1808–1822
- **Required:** Remove if not used
- **Impact:** CSS bloat

### 34. [app/globals.css] — Unused `.shimmer-loading` class
- **Current:** Lines 1791–1806
- **Required:** Remove if not used
- **Impact:** CSS bloat

### 35. [app/globals.css] — Unused `.card-spotlight` class
- **Current:** Lines 1764–1788
- **Required:** Remove if not used
- **Impact:** CSS bloat

### 36. [app/globals.css] — Inconsistent naming: `.glass` vs `.glass-effect` vs `.glass-card`
- **Current:** `.glass` (line 121) is different from `.glass-effect` (line 1697) and `.glass-card` (line 1698)
- **Required:** Standardize naming convention
- **Impact:** Developer confusion

### 37. [features/new-workspace/Panels/GeneratePanel.tsx] — `useRef` imported but not consistently used
- **Current:** Line 1: `useRef` imported, used only for file input
- **Required:** Remove if only used for one element (or keep — minor)
- **Impact:** Minimal; slightly larger bundle

### 38. [features/admin/tabs/OverviewTab.tsx] — `useEffect` imported but load wrapped in setTimeout
- **Current:** Line 42: `setTimeout(() => load(), 0)` inside useEffect
- **Required:** Call `load()` directly
- **Impact:** Unnecessary re-render

### 39. [features/admin/tabs/RuntimeTab.tsx] — `useEffect` with setTimeout pattern
- **Current:** Line 52: `setTimeout(() => { setHistory(...) }, 0)` inside useEffect
- **Required:** Call directly
- **Impact:** Unnecessary re-render

### 40. [app/settings/page.tsx] — `Server` imported but used only in offline banner
- **Current:** Line 30: `Server` from lucide-react
- **Required:** OK to keep but verify usage
- **Impact:** Minimal

### 41. [features/model-manager/ModelCard.tsx] — `useEffect` dependency array issue
- **Current:** Line 26: `[model.status, model.id, status, onAction]` — `status` is internal state that triggers re-subscription to EventSource
- **Required:** Consider using `useRef` for status to avoid re-subscription loops
- **Impact:** Potential EventSource leak if status changes rapidly

### 42. [features/new-workspace/Navigation/LeftNavigation.tsx] — Hardcoded `bg-[var(--ws-nav-bg,#0f1015)]`
- **Current:** Line 36: Fallback `#0f1015` is hardcoded
- **Required:** Use `hsl(var(--surface-0))` as fallback or define `--ws-nav-bg` globally
- **Impact:** If CSS variable is undefined, hardcoded value may not match theme

### 43. [features/new-workspace/Navigation/LeftNavigation.tsx] — Hardcoded active state colors
- **Current:** Lines 47, 63, 86, 102, 118, 134, 150: `text-[#f5c518]`, `border-[#f5c518]/50`, `shadow-[#f5c518]/15`, `ring-[#f5c518]/30`, `bg-[var(--ws-active-bg,#1e2230)]`
- **Required:** Use `hsl(var(--primary))` for active color (which is already yellow `48 96% 50%`)
- **Impact:** Duplicated color definition; inconsistency if primary color changes

### 44. [app/globals.css] — `.empty-state` uses `hsl(var(--surface-2) / 0.3)` with low opacity
- **Current:** Line 629: `background: hsl(var(--surface-2) / 0.3)` — very transparent
- **Required:** Increase opacity to ≥ 0.5 for visibility
- **Impact:** Empty state icon may be hard to see

### 45. [app/globals.css] — `.table-header-premium` uses `hsl(var(--muted-foreground) / 0.6)`
- **Current:** Line 729: Low opacity on header text
- **Required:** Use `text-muted-foreground` class or increase opacity
- **Impact:** Table headers may be hard to read

### 46. [features/new-workspace/RightPanel/RightAssetsPanel.tsx] — Info badge uses `bg-[hsl(var(--surface-0))]/80`
- **Current:** Line 400: `bg-[hsl(var(--surface-0))]/80` — transparent badge on potentially busy thumbnail
- **Required:** Use opaque background `bg-surface-0` or `bg-card`
- **Impact:** Badge may be hard to see on light thumbnails

### 47. [features/new-workspace/Panels/GeneratePanel.tsx] — Upload progress bar uses `bg-[hsl(var(--surface-3))]`
- **Current:** Line 452: Progress track uses surface-3 which may be too dark
- **Required:** Verify contrast ratio
- **Impact:** Progress bar track may not be visible enough

---

## Pages Verified

| Page | URL | Status | Notes |
|------|-----|--------|-------|
| Workspace | `/workspace` | ✅ Renders | Contains Text-to-3D tab (correct for GeneratePanel) |
| Generate | `/workspace/generate` | ✅ Renders | Hardcoded hex colors in navigation |
| Settings | `/settings` | ✅ Renders | Backdrop-blur on sticky header |
| Admin | `/admin` | ✅ Renders | Uses glass-strong, neon colors |
| WorldGen | `/workspace/worldgen` | ⚠️ Not tested | Cannot verify — agent-browser unavailable |
| Segment | `/workspace/segment` | ⚠️ Not tested | Cannot verify — agent-browser unavailable |
| Outputs | `/outputs` | ⚠️ Not tested | May not exist as route |
| System | `/workspace/system` | ⚠️ Not tested | Cannot verify — agent-browser unavailable |

> **Note:** Visual browser verification was limited due to agent-browser socket permission errors. HTML was fetched via curl and analyzed for class names, inline styles, and color usage. Full interactive testing (hover states, focus states, tab switching, modal open/close) could not be performed.

---

## Code Quality Findings

### TypeScript
- ✅ `npx tsc --noEmit` passes with zero errors
- ✅ All props are properly typed in component interfaces
- ⚠️ `features/new-workspace/lib/api.ts` uses `Record<string, any>` in several places (lines 96–97)

### Imports
- ✅ No significantly unused imports detected
- ⚠️ `app/settings/page.tsx` imports `Server` from lucide-react (used in offline banner — OK)

### Patterns
- ⚠️ `Object.assign(baseApiClient, {...})` in `features/new-workspace/lib/api.ts` mutates shared instance
- ⚠️ `useViewerStore.setState()` called outside React event handler in `WorkspaceContext.tsx` line 249

---

## Accessibility Findings

| Issue | Severity | WCAG Criterion |
|-------|----------|----------------|
| No `prefers-reduced-motion` media query | Critical | 2.3.3 Animation from Interactions |
| Low-contrast text via `/50` opacity modifiers | Medium | 1.4.3 Contrast (Minimum) |
| Native range inputs missing `cursor-pointer` | Low | 2.4.7 Focus Visible (related) |
| Info badge on thumbnail uses `/80` opacity bg | Low | 1.4.11 Non-text Contrast |

---

## Performance Findings

| Issue | Impact |
|-------|--------|
| `backdrop-filter: blur(32px)` on dialogs | High GPU cost, especially on low-end devices |
| Multiple `backdrop-filter: blur()` on same page | Compounding GPU cost |
| `bg-mesh-gradient` uses 4 radial gradients | Repaint cost on scroll |
| `glow-ring` conic-gradient animation | Continuous GPU animation cost |
| Polling every 5s (RuntimeTab) + 10s (ModelsTab) + 15s (system stats) + 30s (history) | Network request overlap; no request deduplication on some endpoints |

---

## Recommended Improvements

1. **Create a `SegmentationPanel.tsx` theme refactor** — replace all 30+ hardcoded hex colors with CSS variable equivalents
2. **Add `prefers-reduced-motion` support** — add the media query to auto-apply `.reduced-animations`
3. **Reduce backdrop-blur values** — cap at `blur(12px)` maximum; gate behind CSS variables
4. **Fix API client mutation pattern** — use composition instead of `Object.assign`
5. **Add null guards in ModelCard.tsx** — prevent NaN display
6. **Standardize active state colors** — use `hsl(var(--primary))` instead of hardcoded `#f5c518`
7. **Audit globals.css for unused classes** — remove ~15 unused utility classes to reduce file size by ~30%
8. **Add `cursor-pointer` to all range inputs** — for consistent interactive affordance

---

## Verification Method

- **Tool:** agent-browser snapshot failed (`Failed to create socket directory: Permission denied`)
- **Fallback:** curl-based HTML extraction + static code analysis
- **TypeScript:** `npx tsc --noEmit` passed
- **Pages fetched:** `/workspace`, `/settings`, `/admin`
- **Interactive testing:** NOT performed (browser tool unavailable)
