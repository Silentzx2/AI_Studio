# Final Fix Report

## Bugs Found

### P0 — Core Workflow Broken

1. **Job polling used wrong endpoint**
   - **Symptom**: Generation status never updated; 404 on every poll
   - **Root Cause**: `WorkspaceContext.tsx` polled `/api/v1/generation/{id}/status` which doesn't exist
   - **Fix**: Changed to `/api/v1/system/jobs/{id}` and integrated `normalizeBackendJob` for URL rewriting
   - **File**: `features/workspace/store/WorkspaceContext.tsx`

2. **Job submission used wrong endpoint**
   - **Symptom**: Generation never started; 404 on POST
   - **Root Cause**: `generateImageTo3D`, `generate3DModel`, `runRemeshGeneration`, `runTextureGeneration`, `queueWorkflow` all POSTed to `/api/v1/generation`
   - **Fix**: Rewrote all 5 functions to use real backend endpoints (`/api/v1/mesh-generation/*`)
   - **File**: `features/workspace/store/WorkspaceContext.tsx`

3. **Progress scaling wrong**
   - **Symptom**: Progress bar showed 0-1% instead of 0-100%
   - **Root Cause**: Backend returns progress as 0-1 fraction, frontend used it directly
   - **Fix**: Added `Math.round(progress * 100)` in `useTaskManager.ts`
   - **File**: `hooks/useTaskManager.ts`

### P1 — Important Feature Broken

4. **Backend absolute URLs unreachable from browser**
   - **Symptom**: Download/thumbnail URLs pointed to `http://backend:8000/...` which browser can't reach
   - **Root Cause**: Backend returned `request.base_url`-prefixed absolute URLs
   - **Fix**: Added `normalizeBackendJob` with `toProxyUrl` to rewrite to same-origin paths
   - **File**: `features/workspace/store/WorkspaceContext.tsx`

5. **Dead apiClient methods calling non-existent endpoints**
   - **Symptom**: 15 methods would silently fail with 404
   - **Root Cause**: Methods like `clearCache`, `clearVRAM`, `restartRuntime`, `getInstallProgress`, etc. called endpoints that don't exist
   - **Fix**: Replaced with honest error throws that surface the limitation
   - **File**: `services/apiClient.ts`

6. **Health check used wrong endpoint**
   - **Symptom**: Backend status always showed "offline"
   - **Root Cause**: `useBackendData.ts` checked `/api/v1/runtime/health` which doesn't exist
   - **Fix**: Changed to `/health`
   - **File**: `hooks/useBackendData.ts`

7. **System stats used wrong endpoint**
   - **Symptom**: GPU/VRAM info never populated
   - **Root Cause**: `lib/api.ts` queried `/api/v1/runtime/status` which doesn't exist
   - **Fix**: Changed to `/api/v1/system/scheduler-status`
   - **File**: `features/workspace/lib/api.ts`

8. **History endpoint wrong**
   - **Symptom**: Job history never loaded
   - **Root Cause**: `useAppStore.ts` queried `/api/v1/generation/history` which doesn't exist
   - **Fix**: Changed to `/api/v1/system/jobs/history`
   - **File**: `stores/useAppStore.ts`

### P2 — UI Feature Broken

9. **Prewarm called non-existent endpoint**
   - **Symptom**: Console 404 on model selection
   - **Root Cause**: `GeneratePanel.tsx` called `/api/v1/runtime/prewarm`
   - **Fix**: Made it a no-op with comment explaining the limitation
   - **File**: `features/workspace/Panels/GeneratePanel.tsx`

10. **Prompt enhancement called non-existent endpoint**
    - **Symptom**: "Enhance Prompt" button did nothing useful
    - **Root Cause**: `GeneratePanel.tsx` called `/api/v1/generation/enhance-prompt`
    - **Fix**: Surface limitation honestly instead of silently failing
    - **File**: `features/workspace/Panels/GeneratePanel.tsx`

## Files Changed

| File | Changes |
|---|---|
| `features/workspace/store/WorkspaceContext.tsx` | Polling endpoint, job submission, URL rewriting |
| `features/workspace/Panels/GeneratePanel.tsx` | Prewarm, enhance prompt |
| `services/apiClient.ts` | Dead methods → honest errors |
| `hooks/useTaskManager.ts` | Polling endpoint, progress scaling |
| `hooks/useBackendData.ts` | Health check, options endpoint |
| `features/workspace/lib/api.ts` | System stats endpoint |
| `app/api/v1/[...path]/route.ts` | Stale comments |
| `stores/useAppStore.ts` | History endpoint |
| `features/workspace/types.ts` | Added `imageFileId` field |

## Tests Executed

- **TypeScript typecheck**: Passes (3 pre-existing `MeshViewer.tsx` errors only)
- **ESLint**: 0 errors (17 pre-existing warnings only)
- **Next.js build**: Succeeds
- **Backend scan**: No backend code modified

## Remaining Limitations

1. **Workflow queueing**: `queueWorkflow` throws honest error — no generic workflow endpoint in backend
2. **Remesh**: Uses `/api/v1/mesh-editing/text-mesh-editing` as closest available endpoint
3. **Texture generation**: Uses `/api/v1/mesh-generation/text-mesh-painting` or `image-mesh-painting`
4. **Model management**: Install/repair/stream endpoints don't exist in current backend
5. **Settings**: No settings endpoints in current backend
6. **ComfyUI**: Old ComfyUI integration scripts still exist but are not used by the current architecture

## Stale References Removed

- PostgreSQL from README, architecture docs, setup guide
- ComfyUI from README, developer guide
- Port 8188 from README troubleshooting
- `/api/v1/generation` from all frontend code
- `/api/v1/runtime/*` from all frontend code
- `/api/v1/system/install/*`, `/repair/*`, `/settings/*` from all frontend code
- `/api/v1/system/models/action` from all frontend code