================================================================================
RETICLE INTEGRATION SETUP PROMPT FOR AI3DSTUDIO
Executable Meta-Prompt | Token-Optimized | Zero Conversational Filler
================================================================================

## ROLE ASSIGNMENT
You are: **Full-Stack Web Observability & DevTools Integration Specialist**

Domain expertise required:
- FastAPI middleware architecture & lifecycle hooks
- React dev-time SDK injection & tree-shaking validation
- pnpm monorepo dependency resolution
- Localhost-only bridge binding patterns
- Dev vs Production environment gating

---

## STEP 1: STARTUP & INITIALIZATION VERIFICATION (MANDATORY — DO THIS FIRST)

### Check Current AI3DStudio Startup Flow
Before writing ANY integration code, examine:

1. **Backend startup**: Read `backend/main.py`
   - Look for: FastAPI app instantiation, middleware list, startup event handlers
   - Question: Does middleware load BEFORE or AFTER other systems?
   - Requirement: Reticle observer must init after FastAPI app creation, before uvicorn bind

2. **Frontend startup**: Read `frontend/src/main.tsx` or `index.tsx`
   - Look for: React root render call, any existing context wrappers
   - Question: Does React mount to a root element? What's the mount target?
   - Requirement: Reticle SDK wrapper must wrap React app at render boundary

3. **Dev launch script**: Read `startup.sh` or `package.json` scripts
   - Look for: `npm run dev` / `yarn dev` entry point
   - Question: Does it use concurrently to start backend + frontend?
   - Requirement: Both services must start cleanly with Reticle middleware active

4. **Environment detection**: Check for env files
   - Look for: `.env.development.local`, `.env.production`, NODE_ENV detection in code
   - Requirement: Reticle must only initialize when ENVIRONMENT === "development"

### ⚠️ VALIDATION GATE
If startup verification reveals:
- ❌ Middleware not yet abstracted: Create a `middleware.py` wrapper file first
- ❌ React render not in single entry: Refactor to single root render call
- ❌ No env detection: Implement environment detection before proceeding

**ONLY PROCEED if startup flow is clear and documented**

---

## STEP 2: CONTEXT-READING RULES (STRICT)

### ✅ DO READ (in this order):
1. Reticle official docs (first 2 min):
   - https://github.com/reticlehq/reticle → README.md (sections: "Installation", "How it Works", "Dev-only")
   - @reticlehq/server package purpose: middleware observer, localhost:7777 binding
   - @reticlehq/react package purpose: SDK injection, auto tree-shaking in production

2. Your AI3DStudio project files (exact snippets):
   - `backend/main.py` → lines 1-50 (FastAPI app init + current middleware)
   - `frontend/src/main.tsx` → lines 1-30 (React root render)
   - `package.json` → scripts section (dev/build targets)
   - `pyproject.toml` → dependencies section (Python package list)

3. Your existing docs:
   - `SETUP_GUIDE.md` (to understand current dev workflow)
   - `DEVELOPER_GUIDE.md` (to understand debugging practices)
   - `ARCHITECTURE.md` → Backend section (middleware patterns)

### ❌ DO NOT READ:
- Entire Reticle monorepo codebase
- Every file in AI3DStudio (only specified snippets above)
- Old/deprecated Reticle docs or alternatives (TanStack Query, Playwright, etc.)
- Build config files unless directly needed (webpack, vite, tsconfig)

---

## STEP 3: INTEGRATION TO-DO LIST (Sequential Execution Required)

### 3.1 Install Dependencies
```bash
# Backend: Add Reticle server package
cd backend
pip install reticle-server

# Frontend: Add Reticle React package
cd ../frontend
pnpm add @reticlehq/react
```

**Validation**: No install errors, versions pinned in lock files

---

### 3.2 Backend Integration (FastAPI Middleware)

**File**: `backend/main.py`

**Context**: FastAPI app initialization section

**Change**: Add Reticle observer middleware after app creation, wrapped in dev-only check

**Implementation**:
```python
# DIFF: After FastAPI app = FastAPI(...) instantiation

import os
from reticle_server import ReticleMiddleware

# Only initialize in development
if os.getenv("ENVIRONMENT", "development") == "development":
    app.add_middleware(ReticleMiddleware, port=7777, bind_address="127.0.0.1")
```

**Output Format**: Code diff only (no explanation beyond 1 sentence)

**Validation Checkpoint**:
- ✅ FastAPI starts without errors
- ✅ Reticle logs appear: "Reticle observer listening on localhost:7777"
- ✅ No middleware order conflicts with existing middleware

---

### 3.3 Frontend Integration (React SDK Wrapper)

**File**: `frontend/src/main.tsx` (or `index.tsx`)

**Context**: Root React render call location

**Change**: Wrap React App with Reticle observer context

**Implementation**:
```typescript
// DIFF: Modify root render

import { ReticleProvider } from "@reticlehq/react";

// Before: ReactDOM.createRoot(...).render(<App />)
// After:
ReactDOM.createRoot(document.getElementById("root")!).render(
  <ReticleProvider enabled={process.env.NODE_ENV === "development"}>
    <App />
  </ReticleProvider>
);
```

**Output Format**: Code diff only (show import + modified render call)

**Validation Checkpoint**:
- ✅ React dev server starts without errors
- ✅ Console shows no SDK warnings
- ✅ Production build (`npm run build`) has ZERO Reticle code in bundle

---

### 3.4 Environment Configuration

**File**: `frontend/.env.development.local` (create if missing)

**Change**: Add Reticle dev config flag

```env
RETICLE_ENABLED=true
RETICLE_SERVER_PORT=7777
```

**File**: `backend/.env.development`

```env
ENVIRONMENT=development
RETICLE_ENABLED=true
```

**Validation**: Both files exist in `.gitignore` (dev-only, never committed)

---

### 3.5 Startup Script Verification

**File**: `startup.sh` or `package.json` (scripts section)

**Check**: Does it start both backend + frontend concurrently?

**If using package.json**:
```json
{
  "scripts": {
    "dev": "concurrently \"npm run backend\" \"npm run frontend\"",
    "backend": "cd backend && uvicorn main:app --reload",
    "frontend": "cd frontend && pnpm dev"
  }
}
```

**Validation**:
- ✅ `npm run dev` starts FastAPI + React together
- ✅ Both log to console without blocking each other
- ✅ Reticle observer port (7777) doesn't conflict with app ports

---

### 3.6 Reticle CLI Connection (Local Dev Workflow)

**New terminal tab** (after `npm run dev` is running):
```bash
npm install -g @reticlehq/cli
reticle connect --port 7777
```

**What this does**:
- Connects CLI to localhost:7777 (Reticle observer)
- Opens web dashboard showing live:
  - HTTP requests + response times
  - React component renders
  - State mutations (if Zustand instrumented)
  - Performance metrics

**Output**: Dashboard URL printed to terminal (e.g., `http://localhost:9000`)

---

### 3.7 Production Build Validation

**Run**:
```bash
npm run build
# Inspect bundle
ls -lah frontend/dist
```

**Verify**:
- ✅ No `@reticlehq` in bundle size report
- ✅ Tree-shaking removed SDK (production should be <1KB smaller for validation)
- ✅ `npm run preview` (serve production build locally) works without Reticle errors

---

## STEP 4: STRICT OUTPUT RULES (Token Optimization)

✅ **DO**:
- Output code diffs with `# /path/to/file` prefix
- Show only changed lines + 1-2 context lines
- Use unified diff format for clarity
- Limit root-cause explanations to 1 sentence max

❌ **DO NOT**:
- Print entire files unchanged
- Add conversational filler ("Here's the integration...", "This connects...")
- Repeat code already shown in previous diffs
- Add empty lines or excessive whitespace
- Explain what Reticle is (already known)

**Token Budget**: ~500 tokens maximum for all code + changes

---

## STEP 5: DOCUMENTATION SYNC (Automatic — Final Step)

After all code changes integrated, update these `.md` files:

### 5.1 Update `SETUP_GUIDE.md`

**Section to add** (after "Development Environment" section):

```markdown
### Runtime Observability with Reticle

Reticle provides real-time visibility into API requests, React renders, and performance metrics during development.

**One-time setup**:
```bash
npm install -g @reticlehq/cli
```

**To use**:
1. Start dev server: `npm run dev`
2. In new terminal: `reticle connect --port 7777`
3. Open web dashboard (URL printed above)

Reticle only runs in development (`ENVIRONMENT=development`). Production builds are unaffected.

To disable: Set `RETICLE_ENABLED=false` in `.env.development.local`
```

---

### 5.2 Update `DEVELOPER_GUIDE.md`

**Section to add** (under "Debugging" section):

```markdown
#### Debugging with Reticle

Reticle visualizes real-time application behavior:

**Network requests**: See all HTTP calls with latency
**Component renders**: Track React re-renders and performance
**State changes**: Inspect Zustand state mutations (if store instrumented)

Common debug scenarios:
- **Slow API call?** Look at Reticle network timeline
- **Unexpected re-render?** Check Reticle component tree
- **State mutation loop?** Track state changes in Reticle dashboard

Reticle only observes your local machine (localhost:7777 binding). No data leaves your machine.
```

---

### 5.3 Update `ARCHITECTURE.md`

**Section to add** (under "Middleware / Observability" or create new section):

```markdown
### Development Observability Stack

**Reticle** (localhost-only, dev-time):
- Server: @reticlehq/server middleware (FastAPI)
- Client: @reticlehq/react SDK (React)
- Bridge: localhost:7777 (internal, never exposed)
- Dashboard: CLI tool connects to observe real-time behavior

**Environment gating**:
- Dev: Reticle middleware + SDK active
- Prod: Tree-shaken out of build, zero runtime cost
```

---

## STEP 6: FINAL VALIDATION CHECKLIST

Run through this AFTER all changes:

- [ ] `npm run dev` starts without errors
- [ ] Reticle observer middleware loads (check logs for "Reticle listening on localhost:7777")
- [ ] `reticle connect --port 7777` connects to dashboard
- [ ] Dashboard shows live API requests when you interact with app
- [ ] Dashboard shows React component renders
- [ ] `npm run build` succeeds with ZERO Reticle code in bundle
- [ ] `npm run preview` (serve production build) works without Reticle SDK
- [ ] `.gitignore` includes `.env.development.local`
- [ ] Documentation files updated (SETUP_GUIDE, DEVELOPER_GUIDE, ARCHITECTURE)

---

## EDGE CASES & TROUBLESHOOTING

**If Reticle middleware conflicts with existing middleware**:
- Insert Reticle middleware AFTER FastAPI app creation, BEFORE other middleware
- Verify middleware order: [Reticle] → [CORS] → [Auth] → [other]

**If React SDK causes build warnings**:
- Verify import path: `from "@reticlehq/react"` (not root package)
- Check `node_modules/@reticlehq/react/package.json` → `sideEffects: false` (should be false for tree-shaking)

**If localhost:7777 is already in use**:
- Change port in backend middleware: `port=7778`
- Update `reticle connect --port 7778` command

**If Reticle shows up in production bundle**:
- Verify `NODE_ENV` detection: `process.env.NODE_ENV === "development"`
- Check build tool tree-shaking config (Vite/Webpack sideEffects)

---

## EXECUTION NOTES

**Time to implement**: ~15 minutes (install + 3 code changes + doc sync)

**Risk level**: 🟢 LOW
- Zero breaking changes to existing code
- Dev-only initialization (production unaffected)
- Reversible: remove middleware + SDK wrapper, delete dependencies

**Testing**: Run `npm run dev` → interact with app → verify Reticle dashboard shows requests/renders

**Next step**: Once Reticle is live, team can use it for debugging plugin-loading, API latency, and 3D model generation workflows.

================================================================================
END PROMPT
================================================================================

**TO EXECUTE**: Copy this entire prompt into Claude Code (or any AI coding tool) along with your AI3DStudio project repo. The AI will integrate Reticle end-to-end following this exact structure.
