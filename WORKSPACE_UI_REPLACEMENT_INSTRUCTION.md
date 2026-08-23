# 🎯 AI STUDIO - WORKSPACE UI REPLACEMENT WORKFLOW

**Project**: AI 3D Studio (Next.js + FastAPI Backend)  
**Task**: Replace OLD workspace UI with NEW UI from `/ui/src/components` while keeping Admin/Settings untouched  
**Backend**: NO CHANGES - All API calls to existing `/api/v1/*` endpoints  
**Status**: Ready for AI Agent Execution  
**Date Generated**: Aug 23, 2026

---

## 📋 EXECUTIVE SUMMARY

Replace `/features/workspace/new-ui/` and root entry points with NEW UI components from `ui.zip`:
- ✅ **Keep**: Admin (`/features/admin/`), Settings (`/features/settings/`), Model Manager, Backend APIs  
- ✅ **Replace**: Workspace pages, Canvas, Panels, State Management integration  
- ✅ **API Sync**: Repoint all new UI API calls to OLD FastAPI `/api/v1/` endpoints (NO new backend needed)  
- ✅ **Stores**: Merge WorkspaceContext into existing Zustand stores for persistence

---

## 🔄 FILE MAPPING: OLD → NEW

### **Entry Point (Root Workspace)**
| Old Path | New File | Action |
|----------|----------|--------|
| `/app/workspace/page.tsx` | UI uses `Workspace/WorkspaceShell.tsx` | **REPLACE** - Replace WorkspaceShell content |
| `/features/workspace/WorkspaceShell.tsx` | `Workspace/WorkspaceShell.tsx` (new) | **REPLACE ENTIRELY** |
| `/features/workspace/new-ui/CreativeWorkspaceLayout.tsx` | N/A - Folded into new WorkspaceShell | **DELETE** |

### **Canvas/Viewport (3D Viewer)**
| Old Path | New File | Action |
|----------|----------|--------|
| `/3D-SPACE/Canvas3D.tsx` | `Viewport/MeshViewer.tsx` | **REPLACE** - MeshViewer replaces Canvas3D |
| `/3D-SPACE/AssetPanel.tsx` | `RightPanel/RightAssetsPanel.tsx` | **REPLACE** - New assets panel |
| `/3D-SPACE/GenerationControls.tsx` | `ToolPanel/GeneratePanel.tsx` | **REPLACE** - New generation panel |

### **Left Panels / Tool Panels**
| Old Path | New File | Action |
|----------|----------|--------|
| `/features/workspace/new-ui/WorkspaceTab.tsx` | `ToolPanel/GeneratePanel.tsx` | **REPLACE** |
| `/features/workspace/new-ui/TextureGenTab.tsx` | `ToolPanel/TexturePanel.tsx` | **REPLACE** |
| `/features/workspace/new-ui/RemeshTab.tsx` | `ToolPanel/RemeshPanel.tsx` | **REPLACE** |
| `/features/workspace/new-ui/RiggingAnimationTab.tsx` | `ToolPanel/RiggingPanel.tsx` + `ToolPanel/AnimatePanel.tsx` | **REPLACE** |

### **Navigation & Layout**
| Old Path | New File | Action |
|----------|----------|--------|
| Navigation Sidebar | `ToolRail/LeftNavigation.tsx` | **REPLACE** - New sidebar navigation |
| Top Header | `Header/TopHeader.tsx` | **KEEP IF EXISTS** or **ADD NEW** |

### **Right Panels**
| Old Path | New File | Action |
|----------|----------|--------|
| `/features/workspace/new-ui/RightContextPanel.tsx` | `RightPanel/RightPropertyPanel.tsx` + `RightPanel/RightPromptPanel.tsx` | **REPLACE** |

### **Modals & Dialogs**
| Old Path | New File | Action |
|----------|----------|--------|
| `/features/workspace/new-ui/ExportDialog.tsx` | `Modals/ExportModal.tsx` | **REPLACE** |

### **Dashboard (Settings-like areas)**
| Old Path | New File | Action |
|----------|----------|--------|
| (If exists) | `Dashboard/StudioDashboard.tsx` | **ADD NEW** (Don't touch Admin) |

### **Store/State Management**
| Old Path | Integration Point |
|----------|-------------------|
| `/stores/useGenerationStore.ts` | Merge with `WorkspaceContext` data |
| `/stores/useViewerStore.ts` | Merge with `WorkspaceContext` data |
| `/stores/useUIStore.ts` | Merge with `WorkspaceContext` UI state |

---

## 🛡️ CRITICAL CONSTRAINTS (MUST NOT BREAK)

### **A. DO NOT TOUCH**
```
❌ /features/admin/           → Admin panel STAYS EXACTLY AS IS
❌ /features/settings/        → Settings STAYS EXACTLY AS IS
❌ /features/model-manager/   → Model manager STAYS EXACTLY AS IS
❌ /app/settings/page.tsx     → Settings page STAYS
❌ /backend/                  → ZERO backend changes
❌ /components/ui/            → UI primitives (shadcn) stay
❌ /components/premium/       → Premium components stay
```

### **B. API ENDPOINT MAPPING**
All new UI API calls MUST point to OLD FastAPI:

| New UI Endpoint | Maps To | Example |
|-----------------|---------|---------|
| `POST /generate` | `/api/v1/generation/submit` | Shape/Texture/Rigging gen |
| `POST /upload` | `/api/v1/upload` | Image/Model upload |
| `GET /models` | `/api/v1/models_api/list` | Model discovery |
| `GET /status` | `/api/v1/jobs/{job_id}` | Job status polling |
| `GET /health` | `/api/v1/health` | Backend health check |

**Action**: Search all `.tsx` in new UI for API calls like `fetch("/comfy/...")` or `fetch("/api/...")` and replace with `/api/v1/...` equivalents.

### **C. STATE MANAGEMENT INTEGRATION**
New UI uses `WorkspaceContext` (React Context). **Must merge with existing Zustand stores:**

```typescript
// OLD: useGenerationStore, useViewerStore, useUIStore (Zustand)
// NEW: WorkspaceContext (React.Context)

// ACTION: 
// 1. Keep old Zustand stores 100% intact
// 2. Create adapter in /lib/storeAdapter.ts to sync Context ↔ Zustand
// 3. Wrap WorkspaceContext with Zustand provider
```

---

## 📂 NEW FOLDER STRUCTURE (Post-Replacement)

**Recommendation**: Create `/features/new-workspace/` for clean organization:

```
features/
├── admin/                        ← UNTOUCHED ✅
├── settings/                     ← UNTOUCHED ✅
├── model-manager/                ← UNTOUCHED ✅
├── workspace/                    ← OLD (backup if needed)
│   ├── AssetPanelHost.tsx        ← TO DELETE (replaced by RightAssetsPanel)
│   ├── WorkspaceShell.tsx        ← TO DELETE (replaced by new one)
│   └── new-ui/                   ← WILL BE DELETED ENTIRELY
│       └── *.tsx                 ← All replaced
│
├── new-workspace/                ← 🆕 NEW STRUCTURE
│   ├── index.ts                  ← Barrel exports
│   ├── WorkspaceShell.tsx        ← Entry point (from ui/Workspace/WorkspaceShell.tsx)
│   ├── Viewport/
│   │   └── MeshViewer.tsx        ← 3D Canvas (from ui/Viewport/MeshViewer.tsx)
│   ├── Panels/
│   │   ├── ToolPanel.tsx         ← Aggregator component
│   │   ├── GeneratePanel.tsx     ← from ui/ToolPanel/
│   │   ├── TexturePanel.tsx      ├─ from ui/ToolPanel/
│   │   ├── RiggingPanel.tsx      ├─ from ui/ToolPanel/
│   │   ├── AnimatePanel.tsx      ├─ from ui/ToolPanel/
│   │   ├── RemeshPanel.tsx       ├─ from ui/ToolPanel/
│   │   └── ...
│   ├── Navigation/
│   │   └── LeftNavigation.tsx    ← from ui/ToolRail/
│   ├── RightPanel/
│   │   ├── RightPropertyPanel.tsx  ← from ui/RightPanel/
│   │   ├── RightPromptPanel.tsx    ├─ from ui/RightPanel/
│   │   └── RightAssetsPanel.tsx    ├─ from ui/RightPanel/
│   ├── Header/
│   │   └── TopHeader.tsx         ← from ui/Header/
│   ├── Modals/
│   │   ├── ExportModal.tsx       ← from ui/Modals/
│   │   ├── DccBridgeModal.tsx    ├─ from ui/Modals/
│   │   └── ...
│   └── store/
│       └── WorkspaceContextAdapter.tsx  ← NEW: bridges Context → Zustand
```

---

## ⚙️ STEP-BY-STEP EXECUTION WORKFLOW

### **PHASE 1: STARTUP & INITIALIZATION VERIFICATION** 
*(This happens FIRST before any code changes)*

**Step 1.1**: Check Docker/startup files (if using Docker)
```bash
# Verify startup doesn't break
cat scripts/start.sh
docker-compose.yml  # if exists
# GATE: Confirm startup commands reference /features/workspace, NOT /features/new-workspace
```

**Step 1.2**: Verify Next.js routing works
```bash
# Check app/workspace/page.tsx imports
cat app/workspace/page.tsx
# GATE: Confirm it imports from /features/workspace/WorkspaceShell.tsx
```

**Step 1.3**: Verify package.json has required deps
```bash
# Check for React, React-DOM, Three.js, Zustand
grep -E "react|three|zustand|@react-three" package.json
# GATE: Confirm all present (install if missing)
```

**Step 1.4**: Backend health check (CRITICAL)
```bash
# Verify FastAPI is expected at port 8000
grep -r "localhost:8000\|http://.*:8000" app/ | head -5
# GATE: Confirm API base URL points to /api/v1/
```

---

### **PHASE 2: CONTEXT READING & ANALYSIS** 
*(NO full codebase scan - read ONLY these files)*

**Step 2.1**: Read architecture docs (REQUIRED)
```
Docs/architecture.md          ← Frontend architecture section (lines 193-235)
Docs/api-documentation.md     ← Generation/Upload endpoint specs
```

**Step 2.2**: Read ONLY affected files (NOT entire codebase)
```
# OLD FILES TO UNDERSTAND (30 min scan, not full read):
features/workspace/WorkspaceShell.tsx
features/workspace/new-ui/CreativeWorkspaceLayout.tsx
stores/useGenerationStore.ts          ← Only store signatures, not full logic
stores/useViewerStore.ts              ← Only store signatures, not full logic
3D-SPACE/Canvas3D.tsx                 ← Only imports & external interface
```

**Step 2.3**: Read new UI structure
```
# NEW FILES TO UNDERSTAND (30 min):
ui/src/store/WorkspaceContext.tsx       ← State structure
ui/src/components/Workspace/WorkspaceShell.tsx  ← Entry point
ui/src/components/Viewport/MeshViewer.tsx      ← 3D viewer
lib/next-compat-dynamic.tsx             ← Check for dynamic imports needed
```

**Step 2.4**: Identify ALL API calls in new UI
```bash
# CRITICAL: Find all fetch/axios calls
grep -r "fetch\|axios\|api\|/comfy\|/workflow" ui/src/components/ --include="*.tsx"
# ACTION: Document each API call and its target endpoint
```

---

### **PHASE 3: COPY NEW UI COMPONENTS** 
*(Systematic file-by-file replacement)*

**Step 3.1**: Create destination folder structure
```bash
mkdir -p features/new-workspace/
mkdir -p features/new-workspace/{Viewport,Panels,Navigation,RightPanel,Header,Modals,store}

# Copy all new UI components
cp -r ui/src/components/Workspace/* features/new-workspace/
cp -r ui/src/components/Viewport/* features/new-workspace/Viewport/
cp -r ui/src/components/ToolPanel/* features/new-workspace/Panels/
cp -r ui/src/components/ToolRail/* features/new-workspace/Navigation/
cp -r ui/src/components/RightPanel/* features/new-workspace/RightPanel/
cp -r ui/src/components/Header/* features/new-workspace/Header/
cp -r ui/src/components/Modals/* features/new-workspace/Modals/
cp ui/src/store/WorkspaceContext.tsx features/new-workspace/store/
```

**Step 3.2**: Copy shared utility/store files
```bash
cp ui/src/types.ts features/new-workspace/types.ts
cp ui/src/lib/* lib/  # If any new utility functions
```

**Step 3.3**: Identify missing imports (CRITICAL)
```bash
# For each .tsx file in new-workspace/, check imports:
# Example: grep "^import" features/new-workspace/Panels/GeneratePanel.tsx

# ACTION:
# 1. Find all import paths like "../../../components/..."
# 2. Map them to /components/ui/ (shadcn primitives) → These stay
# 3. Map them to /hooks/ → Check if hooks exist in old project
# 4. Map them to /lib/ → Copy any missing utilities
# 5. Map them to /store/ → Point to Zustand stores (see PHASE 4)
```

---

### **PHASE 4: API ENDPOINT REWRITING** 
*(Critical for backend compatibility)*

**Step 4.1**: Find all API calls in new components
```bash
grep -r "fetch(\|axios(\|\.get(\|\.post(" features/new-workspace/ --include="*.tsx" -n
# Output format: file:line: api_call

# Example output:
# features/new-workspace/Panels/GeneratePanel.tsx:45: fetch('/api/generate', ...)
# features/new-workspace/Panels/GeneratePanel.tsx:67: fetch('/comfy/queue', ...)
```

**Step 4.2**: Map new API calls → old FastAPI endpoints
| New UI Call | Old FastAPI Endpoint | Rewrite |
|------------|----------------------|---------|
| `POST /api/generate` | `POST /api/v1/generation/submit` | ✅ Replace |
| `POST /comfy/upload` | `POST /api/v1/upload` | ✅ Replace |
| `GET /comfy/queue` | `GET /api/v1/jobs` | ✅ Replace |
| `GET /models/list` | `GET /api/v1/models_api/list` | ✅ Replace |
| `GET /health` | `GET /api/v1/health` | ✅ Replace |

**Step 4.3**: Rewrite each API call
```typescript
// BEFORE (in new UI):
fetch('/api/generate', { method: 'POST', body: JSON.stringify({...}) })
fetch('/comfy/queue')
fetch('/models/list')

// AFTER (rewritten for old backend):
fetch('/api/v1/generation/submit', { method: 'POST', body: JSON.stringify({...}) })
fetch('/api/v1/jobs')
fetch('/api/v1/models_api/list')
```

**Step 4.4**: Update API service layer (if separate file exists)
```bash
# Check if new UI has an api/service file
ls -la ui/src/services/ ui/src/lib/api.* 2>/dev/null

# ACTION: Copy to lib/ and update endpoints there instead of in components
# This allows single-point API maintenance
```

**Step 4.5**: Validate all endpoints exist in old backend
```bash
# For each endpoint found, verify it exists:
grep -r "def submit\|@router.post.*generation" backend/app/api/v1/generation.py
grep -r "def upload\|@router.post.*upload" backend/app/api/v1/upload.py
grep -r "def list\|@router.get.*list" backend/app/api/v1/models_api.py

# GATE: If endpoint missing, ADD SHIM in backend (unlikely if using old FastAPI)
```

---

### **PHASE 5: STATE MANAGEMENT INTEGRATION** 
*(Merge WorkspaceContext with Zustand stores)*

**Step 5.1**: Analyze WorkspaceContext structure
```typescript
// Read: features/new-workspace/store/WorkspaceContext.tsx
// Extract: What state is managed?
// Examples: currentTab, selectedModel, generationParams, etc.
```

**Step 5.2**: Analyze old Zustand stores
```typescript
// Read: stores/useGenerationStore.ts
// Read: stores/useViewerStore.ts
// Read: stores/useUIStore.ts
// Extract: What do they manage? (Same as above?)
```

**Step 5.3**: Create adapter layer (NEW FILE)
```typescript
// Create: lib/storeAdapter.ts

import { useGenerationStore } from '@/stores/useGenerationStore'
import { useViewerStore } from '@/stores/useViewerStore'
import { useUIStore } from '@/stores/useUIStore'

// Adapter: Convert WorkspaceContext dispatch → Zustand setState
export const useWorkspaceAdapter = () => {
  const genStore = useGenerationStore()
  const viewerStore = useViewerStore()
  const uiStore = useUIStore()

  return {
    // Map context actions to store setters
    setCurrentTab: (tab) => uiStore.setActiveTab(tab),
    setGenerationMode: (mode) => genStore.setMode(mode),
    setLoadedModel: (url, name) => viewerStore.setModelUrl(url, name),
    // ... etc
  }
}
```

**Step 5.4**: Wrap WorkspaceContext with Zustand
```typescript
// In: features/new-workspace/WorkspaceShell.tsx

// BEFORE:
function WorkspaceShell() {
  return <WorkspaceContext.Provider value={...}>
    {/* children */}
  </WorkspaceContext.Provider>
}

// AFTER:
import { useAppStore } from '@/stores/useAppStore'
import { useWorkspaceAdapter } from '@/lib/storeAdapter'

function WorkspaceShell() {
  const zustandStore = useAppStore()
  const adapter = useWorkspaceAdapter()

  // Sync: Context changes ↔ Zustand state
  const contextValue = {
    // ... context state from Zustand
    currentTab: zustandStore.activeTab,
    dispatch: adapter, // Use adapter to update stores
  }

  return <WorkspaceContext.Provider value={contextValue}>
    {/* children use context, but backed by Zustand */}
  </WorkspaceContext.Provider>
}
```

---

### **PHASE 6: UPDATE ROUTING & ENTRY POINTS** 
*(Point everything to new workspace)*

**Step 6.1**: Update app/workspace/page.tsx
```typescript
// OLD:
import WorkspaceShell from '@/features/workspace/WorkspaceShell'

// NEW:
import WorkspaceShell from '@/features/new-workspace/WorkspaceShell'
```

**Step 6.2**: Update app/page.tsx (if it redirects to /workspace)
```typescript
// Verify it still works:
cat app/page.tsx | grep -i "redirect\|/workspace"

// GATE: Confirm homepage still routes to workspace correctly
```

**Step 6.3**: Create barrel export
```typescript
// Create: features/new-workspace/index.ts

export { default as WorkspaceShell } from './WorkspaceShell'
export { default as MeshViewer } from './Viewport/MeshViewer'
export { default as GeneratePanel } from './Panels/GeneratePanel'
export { default as LeftNavigation } from './Navigation/LeftNavigation'
// ... export all major components
```

**Step 6.4**: Update all internal imports
```bash
# Find all old imports in features/workspace
grep -r "from.*features/workspace" app/ features/ --include="*.tsx"

# ACTION: For each import, verify the file exists in new-workspace
# If not, it was deleted intentionally - remove the import
```

---

### **PHASE 7: DEPENDENCY & IMPORT FIXES** 
*(Handle external dependencies)*

**Step 7.1**: Check for external UI libraries
```bash
# Does new UI use any extra libraries?
grep -r "^import.*from" ui/src/components/ | grep -v "@/\|react\|./\|../\|three"

# Examples to look for:
# - @radix-ui (shadcn deps)
# - framer-motion (animations)
# - zustand (state)
# - tailwindcss (styling)

# ACTION: Verify these are in package.json
# If missing, add to package.json and run npm install
```

**Step 7.2**: Update import aliases
```bash
# New UI might use "@/" alias differently
# Find all "@/" imports:
grep -r "from \"@/" ui/src/ | head -10

# Examples:
# from "@/components/ui/button"      ← Should be /components/ui/button ✅
# from "@/store"                      ← Should be /features/new-workspace/store ✅
# from "@/types"                      ← Should be /features/new-workspace/types ✅

# ACTION: Fix all "@/store" → "@/features/new-workspace/store", etc.
```

**Step 7.3**: Check hooks usage
```bash
# Does new UI use any custom hooks not in /hooks?
grep -r "use[A-Z]" ui/src/components/ --include="*.tsx" | grep "import.*from" | grep -v react | head -20

# ACTION: If new hooks exist, copy to /hooks/ and update imports
```

---

### **PHASE 8: COMPONENT INTEGRATION VERIFICATION** 
*(Verify all pieces fit together)*

**Step 8.1**: Verify imports in entry point
```bash
# In features/new-workspace/WorkspaceShell.tsx, check:
grep "^import" features/new-workspace/WorkspaceShell.tsx | wc -l

# Should resolve without errors:
# - /components/ui/* → Exists ✅
# - /lib/* → Exists ✅
# - /stores/* → Exists ✅
# - /features/new-workspace/* → Exists ✅
```

**Step 8.2**: Verify MeshViewer setup (3D canvas)
```typescript
// Check: features/new-workspace/Viewport/MeshViewer.tsx

// GATE: Must import React Three Fiber or equivalent 3D library
grep -E "react-three-fiber|@react-three|canvas" features/new-workspace/Viewport/MeshViewer.tsx

// ACTION: If imports missing, add:
// npm install @react-three/fiber @react-three/drei three
```

**Step 8.3**: Check Panel imports consistency
```bash
# All ToolPanels should import same UI primitives
for file in features/new-workspace/Panels/*.tsx; do
  echo "=== $file ==="
  grep "from.*ui/" "$file" | sort | uniq
done

# GATE: Verify all use consistent UI imports from /components/ui/
```

**Step 8.4**: Verify Navigation sidebar setup
```bash
# Check: features/new-workspace/Navigation/LeftNavigation.tsx
# Must have routes to all workspace tabs:
# - Generate, Texture, Rigging, Animate, Remesh, etc.

grep -E "generate|texture|rigging|animate|remesh" \
  features/new-workspace/Navigation/LeftNavigation.tsx
```

---

### **PHASE 9: DOCUMENTATION SYNC** 
*(Update project docs to reflect new structure)*

**Step 9.1**: Update Docs/architecture.md
```markdown
# OLD Section (lines 193-235):
## Frontend Architecture

### Persistent Workspace Layout
The frontend follows a Tripo Studio-style persistent workspace: ONE global 3D canvas that never unmounts, with dynamic left/right panels that swap based on the active sidebar tab.

#### Routing
- `app/page.tsx` and `app/workspace/page.tsx` both render `WorkspaceShell`.
- `WorkspaceShell` wraps `CreativeWorkspaceLayout` (single entry point).

# NEW SECTION (REPLACE WITH):
## Frontend Architecture

### Persistent Workspace Layout (v2 - Refactored)
The frontend uses a modern persistent workspace: ONE global 3D viewport (`MeshViewer`) that never unmounts, with dynamic left/right panels that swap based on the active sidebar tab.

#### Routing
- `app/page.tsx` and `app/workspace/page.tsx` both render `WorkspaceShell`.
- `WorkspaceShell` wraps the new modular layout structure.

#### New Component Organization
- `/features/new-workspace/` contains all workspace components
- Zustand stores (`useGenerationStore`, `useViewerStore`) persist workspace state
- `WorkspaceContext` provides real-time UI state (tab, panels)
- `MeshViewer` (React Three Fiber) renders persistent 3D canvas
- `LeftNavigation` provides tab routing
- Panels (`GeneratePanel`, `TexturePanel`, etc.) swap based on active tab
- Right panels (`RightPropertyPanel`, `RightAssetsPanel`) provide contextual tools

#### API Layer
- All frontend API calls target `/api/v1/*` FastAPI endpoints
- No ComfyUI backend required; existing FastAPI handles generation
```

**Step 9.2**: Update Docs/README.md (Frontend Section)
```markdown
# OLD:
## Frontend Structure
app/
├── workspace/ → WorkspaceShell (old UI)

# NEW:
## Frontend Structure
app/
├── workspace/ → WorkspaceShell (new UI)

features/new-workspace/
├── Viewport/ → MeshViewer (3D canvas)
├── Panels/ → Tool panels (Generate, Texture, Rigging, etc.)
├── Navigation/ → Sidebar tabs
├── RightPanel/ → Context-sensitive right panels
├── Modals/ → Dialogs and modals
└── store/ → WorkspaceContext + Zustand adapter
```

**Step 9.3**: Create WORKSPACE_UI_MIGRATION.md
```markdown
# Workspace UI Migration (v1 → v2)

## What Changed
- **Old**: `/features/workspace/new-ui/` (dated structure)
- **New**: `/features/new-workspace/` (modern modular)
- **Canvas**: `Canvas3D.tsx` → `MeshViewer.tsx` (upgraded)
- **State**: WorkspaceContext + Zustand (better persistence)

## API Compatibility
- All API calls still use `/api/v1/*` FastAPI endpoints
- No backend changes required
- 100% backward compatible

## Migration Checklist
- [x] Components copied from ui.zip
- [x] API endpoints rewritten to /api/v1/
- [x] State management integrated (Context + Zustand)
- [x] Admin/Settings untouched
- [x] Routing updated
- [x] Dependencies verified
- [x] End-to-end tested
```

**Step 9.4**: Update Docs/CHANGELOG.md
```markdown
## v3.9.0 - Workspace UI Refactor (Aug 23, 2026)

### Features
- 🎨 New modular workspace UI (from Forge3D design)
- 📊 Improved panel layout with persistent 3D viewport
- 🔧 Better tool organization (Generate, Texture, Rigging, Animate, Remesh)
- 📦 Enhanced asset management panels

### Under the Hood
- Migrated to `/features/new-workspace/` structure
- Upgraded Canvas: `Canvas3D.tsx` → `MeshViewer.tsx`
- State management: WorkspaceContext + Zustand sync
- API: All calls still use existing `/api/v1/` endpoints

### Breaking Changes
- NONE - Fully backward compatible

### Migration
- Auto-migrated: `/features/workspace/new-ui/` → `/features/new-workspace/`
- Admin/Settings/ModelManager: Unchanged
- Backend: Unchanged (0 changes)
```

---

### **PHASE 10: CLEANUP & DELETION** 
*(Remove old files - do LAST)*

**Step 10.1**: Backup old workspace (if needed)
```bash
# Optional: Archive old structure
tar -czf /tmp/workspace-ui-old-backup.tar.gz features/workspace/

# Then delete:
rm -rf features/workspace/
rm -rf features/workspace/new-ui/

# Delete old 3D components (replaced by MeshViewer)
rm -rf 3D-SPACE/

# GATE: Verify /tmp/workspace-ui-old-backup.tar.gz created before deleting
```

**Step 10.2**: Verify deletions don't break imports
```bash
# Find any remaining imports from old workspace paths
grep -r "from.*features/workspace\|from.*3D-SPACE" app/ features/ --include="*.tsx"

# ACTION: Should return 0 results. If any found, update those imports first.
```

**Step 10.3**: Check for dead code
```bash
# Look for unused components that might reference old workspace
grep -r "WorkspaceShell\|CreativeWorkspaceLayout\|Canvas3D" . \
  --include="*.tsx" --include="*.ts" | grep -v "node_modules"

# ACTION: Verify only references are in new-workspace/ (expected)
```

---

### **PHASE 11: FINAL VALIDATION & END-TO-END TESTING** 
*(Critical - Must complete successfully)*

**Step 11.1**: TypeScript compilation check
```bash
cd /path/to/project
npm run build

# GATE: Must complete with 0 errors
# If errors:
#   - Check import paths (Step 8)
#   - Verify dependencies installed (Step 7)
#   - Check component props interfaces (Step 9)
```

**Step 11.2**: Startup test
```bash
# Option A: Using start.sh
bash scripts/start.sh

# Option B: Manual startup
npm run dev &
cd backend && python -m app.main &

# Wait 30 seconds for startup
sleep 30

# GATE: Both frontend (3000) and backend (8000) should be running
curl http://localhost:3000/workspace  # Should load without errors
curl http://localhost:8000/api/v1/health  # Should return {"status": "ok"}
```

**Step 11.3**: Browser manual testing (CRITICAL)
```
1. Navigate to http://localhost:3000/workspace
2. Visual checks:
   ✅ 3D viewport renders (center canvas)
   ✅ Left sidebar visible with tabs
   ✅ Right panel visible
   ✅ Top header present
   ✅ All panels load without errors (check console)

3. Interaction checks:
   ✅ Click "Generate" tab → GeneratePanel loads
   ✅ Click "Texture" tab → TexturePanel loads
   ✅ Click "Rigging" tab → RiggingPanel loads
   ✅ Upload an image → API call to /api/v1/upload succeeds
   ✅ Generate 3D → API call to /api/v1/generation/submit succeeds

4. Console checks:
   ✅ No errors (only warnings OK)
   ✅ Network tab shows requests to /api/v1/* (not /comfy/*)

5. Verify untouched areas:
   ✅ Navigation menu still has "Settings" link
   ✅ Settings page still loads (click "Settings")
   ✅ Admin panel unchanged (verify if accessible)
```

**Step 11.4**: API connectivity validation
```bash
# Test each major API endpoint:

# 1. Health check
curl http://localhost:8000/api/v1/health

# 2. Models list
curl http://localhost:8000/api/v1/models_api/list

# 3. Upload (if test image available)
curl -X POST -F "file=@test.jpg" http://localhost:8000/api/v1/upload

# 4. Generation job submission (example)
curl -X POST http://localhost:8000/api/v1/generation/submit \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test", "mode": "text-to-3d"}'

# GATE: All should return 200/201 with valid JSON responses
```

**Step 11.5**: Performance baseline
```bash
# Use DevTools (F12 → Network tab) to check:
- Initial workspace load time: < 3s (target)
- 3D viewport render: < 5s (target)
- API response times: < 2s (target)
- No memory leaks (check Perf tab for sustained growth)

# GATE: If significantly slower than old UI, investigate:
#   - Large bundle size (check source maps)
#   - Unoptimized re-renders (check React DevTools Profiler)
#   - Slow API endpoints (check backend logs)
```

**Step 11.6**: Verify admin/settings/model-manager untouched
```bash
# Navigate to untouched areas and test:

1. Go to Settings (/app/settings)
   ✅ Appearance settings work
   ✅ Workspace settings work
   ✅ Export/backup still available

2. Go to Admin (if exists)
   ✅ All tabs render (Health, Jobs, Models, etc.)
   ✅ No console errors

3. Model Manager
   ✅ Install/uninstall buttons work
   ✅ Model list displays
   ✅ Downloads show progress
```

---

## 📝 FINAL CHECKLIST (Agent Must Complete All)

### ✅ Code Replacement Phase
- [ ] New UI components copied to `/features/new-workspace/`
- [ ] All API calls rewritten to `/api/v1/*` endpoints
- [ ] State management integrated (WorkspaceContext + Zustand sync)
- [ ] Imports updated (no broken references)
- [ ] Dependencies installed (npm install if needed)
- [ ] Old workspace files deleted (after backup)

### ✅ Documentation Phase
- [ ] `Docs/architecture.md` updated (Frontend Architecture section)
- [ ] `Docs/README.md` updated (Frontend structure)
- [ ] `WORKSPACE_UI_MIGRATION.md` created
- [ ] `Docs/CHANGELOG.md` updated (v3.9.0 entry)

### ✅ Testing Phase
- [ ] `npm run build` completes (0 errors)
- [ ] `bash scripts/start.sh` completes successfully
- [ ] Browser: `/workspace` loads without errors
- [ ] Browser console: 0 errors (warnings OK)
- [ ] API calls: All `/api/v1/*` endpoints working
- [ ] Untouched areas: Settings, Admin, ModelManager still work
- [ ] Performance: Initial load < 3s, viewport render < 5s

### ✅ Verification Phase
- [ ] Workspace tabs (Generate, Texture, Rigging, etc.) all functional
- [ ] 3D viewport renders models
- [ ] Upload → Generate → Download workflow works
- [ ] Mobile responsive (if needed)
- [ ] No console warnings/errors on interaction

---

## 🚨 ERROR RECOVERY

### **If Build Fails**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Next.js cache
rm -rf .next

# Rebuild
npm run build
```

### **If Startup Fails**
```bash
# Check port conflicts
lsof -i :3000
lsof -i :8000

# Check logs
cat ~/.pm2/logs/*  # if using PM2
docker logs <container>  # if using Docker

# Verify environment
cat .env.local | grep -i api
```

### **If API Calls Fail**
```bash
# Check FastAPI running
curl http://localhost:8000/docs  # Should show Swagger UI

# Check endpoint exists
curl -X OPTIONS http://localhost:8000/api/v1/health

# Check CORS (if needed)
curl -H "Origin: http://localhost:3000" http://localhost:8000/api/v1/health
```

### **If Components Don't Render**
```bash
# Check React DevTools (F12 → Components)
# Look for:
# - WorkspaceContext value is null → Provider wrapper issue
# - MeshViewer not mounted → Canvas not in DOM
# - Panel component errors → Check import paths

# Re-verify imports in /features/new-workspace/WorkspaceShell.tsx
grep "^import" features/new-workspace/WorkspaceShell.tsx | head -20
```

---

## 📞 AGENT HANDOFF SUMMARY

### **What to Do (In Order)**
1. **Read** Docs/architecture.md + api-documentation.md (15 min)
2. **Copy** UI components from ui.zip → /features/new-workspace/ (10 min)
3. **Rewrite** all API calls to /api/v1/* endpoints (20 min)
4. **Integrate** WorkspaceContext with Zustand stores (15 min)
5. **Update** routing in app/workspace/page.tsx (5 min)
6. **Sync** Docs (5 min)
7. **Delete** old /features/workspace/ directory (2 min)
8. **Test** via npm run build → bash scripts/start.sh → browser (30 min)

### **What NOT to Do**
❌ Don't change backend code  
❌ Don't touch /features/admin/, /features/settings/, /features/model-manager/  
❌ Don't rename endpoint paths (they're fixed in backend)  
❌ Don't skip PHASE 1 startup verification  
❌ Don't delete old files before testing  

### **Success Criteria**
✅ `npm run build` → 0 errors  
✅ `/workspace` loads in browser  
✅ 3D viewport renders  
✅ All tabs (Generate, Texture, Rigging) work  
✅ API calls hit `/api/v1/*` (verified in Network tab)  
✅ Admin/Settings pages unchanged and working  

---

**Generated**: Aug 23, 2026  
**Status**: Ready for Execution  
**Estimated Time**: 2-3 hours (including testing)  
**Risk Level**: MEDIUM (UI replacement, but backend untouched = recoverable)
