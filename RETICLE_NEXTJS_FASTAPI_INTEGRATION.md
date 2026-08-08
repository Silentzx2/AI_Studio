================================================================================
RETICLE INTEGRATION SETUP - NEXT.JS + FASTAPI HYBRID STACK
AI3DStudio (Corrected Architecture)
Executable Meta-Prompt | Zero Filler | Token-Optimized
================================================================================

**PROJECT STRUCTURE CONFIRMED:**
- Frontend: Next.js 16.2.12 (Turbopack) → :3000
- Backend: FastAPI (Python) → :8000
- Proxy: Next.js API routes (`/app/api/v1/[...path]/route.ts`) → proxies to FastAPI
- Services: PostgreSQL, Redis, Celery workers (via scripts/start.sh)
- Startup: manager.sh / scripts/start.sh (orchestrates all services)

---

## ROLE ASSIGNMENT
You are: **Full-Stack Observability Architect for Hybrid Next.js+FastAPI**

Domain expertise required:
- FastAPI middleware lifecycle + async context
- Next.js App Router + API route interceptors
- Next.js environment variable resolution (BACKEND_URL)
- Request/response streaming for SSE endpoints
- Dev vs Production environment gating

---

## STEP 1: STARTUP & INITIALIZATION VERIFICATION (CRITICAL - DO FIRST)

### Current Startup Flow Analysis

Your project uses **scripts/start.sh** orchestrator:
```
1. uv (package manager) setup
2. PostgreSQL check
3. Redis check
4. Database migrations (alembic)
5. Backend API (uvicorn) → FastAPI on :8000
6. Celery Worker
7. Frontend (next dev) → Next.js on :3000
```

**Key Discovery**: Next.js `/app/api/v1/[...path]/route.ts` proxies all API calls to FastAPI backend.

### Verification Checklist

✅ **Backend Middleware**: FastAPI `/backend/app/main.py`
- Lines 1-180: App initialization + CORS middleware setup
- **Middleware insertion point**: After `CORSMiddleware`, before route registration

✅ **Frontend Env Detection**: `.env.development.local` + process.env.BACKEND_URL
- Next.js reads BACKEND_URL at REQUEST time (via route.ts)
- Reticle must inject at Next.js root render level

✅ **Startup Script Chain**:
- `manager.sh` → `scripts/start.sh` → spawns FastAPI + Next.js concurrently
- Both must start cleanly with Reticle middleware active

⚠️ **Reticle Port Binding**: 
- Backend (FastAPI) on :8000
- Frontend (Next.js) on :3000
- Reticle observer on :7777 (internal, localhost-only)
- **NO conflicts** ✅

---

## STEP 2: CONTEXT-READING RULES (STRICT)

### ✅ DO READ (exact files):
1. Reticle official docs:
   - https://github.com/reticlehq/reticle → README (Dev-only section)
   - Focus: middleware for FastAPI, SDK for React

2. Your AI3DStudio **backend** files:
   - `backend/app/main.py` → lines 1-180 (app initialization + middleware order)
   - `backend/app/middleware.py` (if exists) → check current middleware chain
   - `backend/requirements.txt` → verify no conflicts with reticle-server

3. Your AI3DStudio **frontend** files:
   - `app/layout.tsx` → root React app structure
   - `.env.example` → existing env var patterns
   - `next.config.ts` → any API/proxy config
   - `app/api/v1/[...path]/route.ts` → understand proxy chain (context only, no changes)

4. Existing docs:
   - `Docs/setup-guide.md` → current dev workflow
   - `scripts/start.sh` → startup sequence

### ❌ DO NOT READ:
- Entire backend/ or app/ directory (only specified files above)
- Celery/Redis setup (Reticle doesn't instrument them)
- Database schema (irrelevant to middleware)
- Old Reticle docs or alternatives
- Component implementations (only layout.tsx)

---

## STEP 3: INTEGRATION CHECKLIST (Sequential)

### 3.1 Install Reticle Packages

```bash
# Backend: Python observer middleware
cd backend
pip install reticle-server

# Frontend: React SDK (Next.js compatible)
cd ../
npm install @reticlehq/react
```

**Validation**: No conflicts, versions pinned in lock files

---

### 3.2 Backend Integration: FastAPI Middleware

**File**: `backend/app/main.py`

**Context**: FastAPI app initialization (around line 170-200 where app is created)

**Requirement**: Add Reticle observer middleware AFTER CORSMiddleware, BEFORE route registration

**Implementation**:
```python
# DIFF: After CORSMiddleware is added to app

import os
from reticle_server import ReticleMiddleware

# Only in development
if os.getenv("ENVIRONMENT", "development") == "development":
    app.add_middleware(
        ReticleMiddleware,
        port=7777,
        bind_address="127.0.0.1"
    )
```

**Location in file**: Insert AFTER line with `.add_middleware(CORSMiddleware, ...)` and BEFORE any `@app.on_event` or route includes

**Validation checkpoint**:
- ✅ FastAPI starts: `uvicorn app.main:app --reload` (no errors)
- ✅ Log shows: "Reticle observer listening on localhost:7777"
- ✅ No middleware ordering conflicts

---

### 3.3 Frontend Integration: Next.js Root Wrapper

**File**: `app/layout.tsx` (or `app/page.tsx` if no layout)

**Context**: Root React component structure

**Requirement**: Wrap children/providers with Reticle SDK context, gated to dev environment only

**Implementation**:
```typescript
// DIFF: In app/layout.tsx root level

import { ReticleProvider } from "@reticlehq/react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isDev = process.env.NODE_ENV === "development";

  return (
    <html lang="en">
      <body>
        <ReticleProvider enabled={isDev}>
          {/* existing providers/components */}
          {children}
        </ReticleProvider>
      </body>
    </html>
  );
}
```

**Alternative if layout already has multiple providers** (likely):
Wrap the existing `<providers>` component:
```typescript
<ReticleProvider enabled={isDev}>
  <Providers>
    {children}
  </Providers>
</ReticleProvider>
```

**Validation checkpoint**:
- ✅ Next.js dev server starts: `npm run dev` (no errors)
- ✅ Console has NO Reticle warnings (prod build mode)
- ✅ Production build (`npm run build`) has ZERO Reticle in bundle

---

### 3.4 Environment Configuration

**File**: `.env.development.local` (create if missing)

```env
# Reticle observability (dev-only)
RETICLE_ENABLED=true
RETICLE_SERVER_PORT=7777
RETICLE_BIND_ADDRESS=127.0.0.1

# Backend communication (already exists, verify)
BACKEND_URL=http://localhost:8000
```

**File**: `backend/.env.development` (or `.env` if unified)

```env
ENVIRONMENT=development
RETICLE_ENABLED=true
```

**Validation**: Both files in `.gitignore` (dev-only, never committed)

---

### 3.5 Startup Flow Verification

**Current flow** (scripts/start.sh):
```
1. PostgreSQL (system service)
2. Redis (system service)
3. Migrations (alembic)
4. Backend API (uvicorn)
5. Celery Worker
6. Frontend (next dev)
```

**NO CHANGES NEEDED** ✅

Your startup script already:
- Starts Backend API separately from Frontend
- Both can run with Reticle middleware active
- Ports don't conflict (:8000 backend, :3000 frontend, :7777 reticle internal)

---

### 3.6 Reticle CLI Connection (Local Dev Workflow)

**After `manager.sh start` completes** (wait 10-15s for all services):

**Terminal 1** - Already running:
```bash
./manager.sh start
# OR manually:
bash scripts/start.sh
```

**Terminal 2** - New terminal:
```bash
# Install CLI globally (one-time)
npm install -g @reticlehq/cli

# Connect to running observer
reticle connect --port 7777
```

**Expected output**:
```
✓ Connected to Reticle observer on localhost:7777
✓ Dashboard available at: http://localhost:9000
```

**Terminal 3** - (Optional) Open app in browser:
```bash
# Frontend
open http://localhost:3000

# Reticle dashboard
open http://localhost:9000
```

---

### 3.7 Dashboard Usage - What You'll See

**Network Tab** (HTTP requests):
```
GET  /api/v1/runtime/options → 200 OK | 45ms
POST /api/v1/generation → 200 OK | 3200ms (3D generation)
GET  /api/v1/health → 200 OK | 12ms
```

Shows all API calls proxied through Next.js → FastAPI

**React Components Tab**:
```
<RootLayout>
  ├── <ReticleProvider>
  ├── <ThemeProvider>
  ├── <Workspace>
  │   ├── <GeneratePanel> [re-rendered 2x | 120ms]
  │   ├── <ModelViewer> [heavy Three.js render]
  └── ...
```

Shows all Next.js component renders

**Performance Tab**:
```
Slow requests (>1s):
  - POST /api/v1/generation: 3.2s (model generation)

Slow renders (>16ms):
  - <ModelViewer>: 245ms (Three.js update)
```

---

### 3.8 Production Build Validation

```bash
npm run build
npm run start   # serve production build locally

# Verify in browser
open http://localhost:3000

# Check bundle size (Reticle should NOT be present)
npm run build 2>&1 | grep -i reticle  # should have NO results
```

**Checklist**:
- ✅ Build succeeds with ZERO Reticle warnings
- ✅ Production bundle served from :3000
- ✅ No Reticle SDK bytecode in `/app/.next/`
- ✅ Tree-shaking removed all `@reticlehq/react` code

---

## STEP 4: STRICT OUTPUT RULES

✅ **DO**:
- Output code diffs with `# /path/to/file` prefix
- Show exact lines to insert (with surrounding context)
- Limit explanations to 1 sentence max
- Use unified diff format where relevant

❌ **DO NOT**:
- Print unchanged code
- Add conversational filler ("Here's the setup...", etc.)
- Repeat code from previous diffs
- Add empty lines or excessive whitespace
- Explain Reticle again

---

## STEP 5: DOCUMENTATION SYNC (Final Step)

After all code changes integrated, update these `.md` files:

### 5.1 Update `Docs/setup-guide.md`

**Add section** (after "Development Environment"):

```markdown
### Runtime Observability with Reticle

Reticle provides real-time visibility into API requests (FastAPI ↔ Next.js), 
React renders, and performance metrics during development.

**One-time setup**:
```bash
npm install -g @reticlehq/cli
```

**To use**:
1. Start services: `./manager.sh start` (waits for all to be ready)
2. In new terminal: `reticle connect --port 7777`
3. Open dashboard URL printed above (typically http://localhost:9000)
4. Interact with app at http://localhost:3000
5. Watch real-time API calls and component renders in Reticle dashboard

**Environment**: Reticle only active in development (`NODE_ENV=development`). 
Production builds are unaffected (code tree-shaken out).

**To disable**: Set `RETICLE_ENABLED=false` in `.env.development.local`
```

---

### 5.2 Update `Docs/developer-guide.md`

**Add section** (under "Debugging"):

```markdown
#### Debugging with Reticle Dashboard

Reticle observes real-time application behavior at the network & component level:

**Network latency debugging**:
- Slow 3D generation? Check POST /api/v1/generation in Reticle
- Compare model-to-model generation times (TripoSR vs Hunyuan3D-2)
- Identify network bottlenecks in model downloads

**Component performance debugging**:
- ModelViewer re-rendering too often? Check Reticle React Components tab
- Unnecessary state updates? Track component render reasons
- Plug memory leaks (watch component tree for unbounded growth)

**State mutation tracking**:
- See every state change in real-time
- Identify where state is being mutated
- Catch store/hook bugs early

Example: Generate a 3D model
1. Start `manager.sh start` + `reticle connect --port 7777`
2. Open http://localhost:3000 + http://localhost:9000 (side-by-side)
3. Upload image → click "Generate"
4. Reticle shows: image upload → backend processing → model download timeline
```

---

### 5.3 Update `Docs/architecture.md`

**Add section** (under "Middleware / Observability"):

```markdown
### Development Observability Stack (Reticle)

**Layer**: Injected at startup in dev environment only

**Backend observability** (@reticlehq/server):
- Middleware inserted into FastAPI app
- Observes all HTTP requests/responses
- Tracks timing, payload size, errors
- Binds to localhost:7777 (internal bridge)

**Frontend observability** (@reticlehq/react):
- SDK injected at Next.js root via ReticleProvider
- Observes component renders, state mutations
- Connects to same localhost:7777 bridge
- Auto tree-shaken in production builds

**Environment gating**:
- Dev: Both middleware + SDK active
- Prod: Tree-shaken out, zero runtime cost
- Bridge: localhost:7777 (internal, never exposed)

**CLI integration**:
- `reticle connect --port 7777` bridges to running observer
- Dashboard: http://localhost:9000
- Shows live network + component telemetry
```

---

## STEP 6: FINAL VALIDATION CHECKLIST

Run through this AFTER all code changes:

- [ ] `./manager.sh start` runs without errors
- [ ] FastAPI logs show: "Reticle observer listening on localhost:7777"
- [ ] Next.js logs show: no Reticle warnings (ReticleProvider enabled in dev)
- [ ] `reticle connect --port 7777` connects to dashboard
- [ ] Open http://localhost:9000 → Reticle dashboard loads
- [ ] Open http://localhost:3000 → App loads and works
- [ ] Interact with app (upload, generate model)
- [ ] Reticle dashboard shows API calls + component renders in real-time
- [ ] `npm run build` completes with ZERO Reticle in bundle
- [ ] `npm run start` (production) works without Reticle SDK
- [ ] `.gitignore` includes `.env.development.local`
- [ ] Documentation files updated (SETUP_GUIDE, DEVELOPER_GUIDE, ARCHITECTURE)

---

## EDGE CASES & TROUBLESHOOTING

**If FastAPI middleware fails**:
- Check middleware order: Reticle should be AFTER CORS, BEFORE route includes
- Verify Python version ≥ 3.9 (reticle-server requirement)
- Check: `pip list | grep reticle` → should show reticle-server

**If Next.js shows Reticle warnings**:
- Verify import: `from "@reticlehq/react"` (exact case)
- Check NODE_ENV detection: `process.env.NODE_ENV === "development"`
- Ensure ReticleProvider wraps layout root (before other providers)

**If Reticle CLI won't connect**:
- Check port: `lsof -i :7777` → should show FastAPI process
- If port in use, change in `main.py` (port=7778) + CLI (--port 7778)
- Verify `--port` flag value matches RETICLE_SERVER_PORT in env

**If dashboard shows no requests**:
- Wait 2-3 seconds after app interaction
- Try clicking/uploading again to trigger API calls
- Check browser console for errors
- Verify BACKEND_URL env var is set (should default to localhost:8000)

---

## EXECUTION TIME & RISK

**Time to implement**: ~20 minutes
- 2 min: Install packages
- 5 min: Add middleware (2 code changes)
- 3 min: Env config
- 5 min: Start services + connect CLI
- 5 min: Test + validate

**Risk level**: 🟢 **LOW**
- Dev-only initialization (zero production impact)
- No breaking changes to existing code
- Fully reversible (remove middleware + SDK wrapper)
- Ports don't conflict

**Testing**: 
- `./manager.sh start` → all services start
- `reticle connect --port 7777` → dashboard connects
- Interact with app → see requests/renders in real-time

---

## NEXT STEP

Once Reticle is live, your team can use it to:
✅ Debug plugin loading (TripoSR vs Hunyuan3D-2 timing)
✅ Profile 3D generation pipeline (image upload → model → download)
✅ Identify API latency bottlenecks
✅ Track unexpected component re-renders
✅ Catch state mutation bugs early

================================================================================
END PROMPT
================================================================================

**TO EXECUTE**: 
1. Copy this entire prompt into Claude Code (or any AI tool)
2. Attach your AI_Studio-main/ project folder
3. AI will integrate Reticle for Next.js + FastAPI hybrid stack
4. Follow validation checklist after integration completes

---

**Qasih Hindi Summary** 🇮🇳
- Next.js + FastAPI dono ko Reticle se observe karo
- Dashboard pe real-time API calls + component renders dekho
- `./manager.sh start` → `reticle connect --port 7777` → http://localhost:9000
