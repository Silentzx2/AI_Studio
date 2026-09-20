# Developer Guide — AI 3D Studio

> **Version**: 6.0.0 (ComfyUI Execution Core & FastAPI Gateway)  
> **Last Updated**: September 2026

---

## 1. Architectural Principles

AI 3D Studio follows a strict separation between presentation, product business logic, and neural computation:

1. **Frontend (`app/`, `features/`, `components/`)**: Next.js 16 with React 19, TypeScript strict mode, Tailwind CSS, and Three.js for interactive WebGL 3D rendering.
2. **Product API Gateway (`backend/app/`)**: FastAPI Python backend handling HTTP authentication, CORS, rate-limiting, job tracking (PostgreSQL 16), and proxying to the execution core.
3. **Execution Core (`ENGINE/ComfyUI/`)**: Upstream ComfyUI 0.36.0 running as a standalone high-performance computational engine on port 8188.
4. **3D Node Layer (`ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack`)**: ComfyUI-3D-Pack custom nodes providing neural reconstruction (Hunyuan3D-2.1, TRELLIS, TripoSR, SV3D), texture baking, and mesh decimation.

```text
Existing AI Studio Product (Next.js 16)
               ↓ [REST / WebSocket Proxy]
      FastAPI Gateway (:8000)
               ↓ [TCP Connection Pool / WebSocket]
      ComfyUI 0.36.0 Core (:8188)
               ↓ [Node Graph Execution]
   ComfyUI-3D-Pack Custom Nodes
               ↓ [Asset Output & Serialization]
    backend/storage/models/<job_id>/
```

---

## 2. Backend Development Workflow

### 2.1 Backend Directory Structure
```
backend/
├── app/
│   ├── main.py              # FastAPI application entry point, lifespan, middleware
│   ├── config.py            # Pydantic Settings (environment configuration)
│   ├── database.py          # SQLAlchemy async session engine & Base metadata
│   ├── models/              # Database models (GenerationJob, VramAuditLog)
│   ├── schemas/             # Pydantic request/response schemas (SuccessResponse, etc.)
│   ├── core/
│   │   ├── comfy/           # ComfyUI client, workflow manager, artifact manager
│   │   ├── storage.py       # Storage root path resolution & disk tracking
│   │   └── security.py      # Rate limiting and Hugging Face token storage
│   └── api/v1/              # API route modules
│       ├── generation.py    # POST /generation, /generation/status/{id}, /cancel
│       ├── health.py        # GET /health (multi-service status)
│       ├── jobs.py          # GET /jobs, GET /jobs/{id}, DELETE /jobs/{id}
│       ├── models.py        # GET /models, /models/installed, /models/available
│       ├── projects.py      # POST /project/export (ZIP bundling)
│       ├── runtime.py       # GET /runtime/options, POST /runtime/clear-vram
│       └── system.py        # GET /system/info, GET /system/health
├── tests/
│   └── test_backend_e2e.py  # Automated 5/5 self-check validation suite
├── pyproject.toml           # Project metadata
└── requirements.txt         # Core dependencies (FastAPI, SQLAlchemy, aiohttp, etc.)
```

### 2.2 Frontend API Client (`services/apiClient.ts`)

The frontend uses a **single unified `apiClient`** for all FastAPI communication. This is the only service layer the frontend depends on.

- **Constructor**: `createApiClient(config: ApiConfig)` initializes the singleton with baseURL, timeout, and optional Bearer auth token.
- **HTTP Methods**: `get<T>(path, ...args)`, `post<T>(path, data?, ...args)` — thin wrappers over `axios` that return `response.data` directly.
- **Admin/Runtime Methods**: `getLogs`, `clearLogs`, `streamLogs`, `listModels`, `modelAction`, `getInstallProgress`, `getInstallStatus`, `repairProvider`, `getSettings`, `getHFTokenStatus`, `saveHFToken`, `removeHFToken`, `clearCache`, `clearVRAM`, `restartRuntime`, `updateConfig`, `getGenerationSettings`, `saveGenerationSettings`, `streamEvents`, `streamInstallProgress`.
- **Generation Methods**: `textToRawMesh`, `textToTexturedMesh`, `imageToRawMesh`, `imageToTexturedMesh`, `textMeshPainting`, `imageMeshPainting`, `partCompletion`, `segmentMesh`, `generateRig`, `retopologizeMesh`, `unwrapMeshUV`, `textMeshEditing`, `imageMeshEditing`.
- **Streaming**: `streamEvents(path, onEvent, onDone)` for SSE, `streamLogs(onEntry, lastN)` for log streaming, `streamInstallProgress(modelId, onProgress, onDone)` for install progress.
- **Export Helpers**: `getApiClient()` returns the singleton; `getApiUrl()` returns the configured baseURL.
- **Legacy Services Removed**: `services/adminService.ts` and `services/runtimeService.ts` were deleted; all callers migrated to `apiClient`.

### 2.3 Adding or Modifying ComfyUI Workflows
ComfyUI workflows are managed in `backend/app/core/comfy/client.py` by `WorkflowManager`:
1. **Templates**: Built-in templates exist for `text_to_3d`, `image_to_3d`, `texture`, and `remesh`.
2. **Dynamic Workflows**: To add a new workflow, place a ComfyUI API-format JSON export into `ENGINE/ComfyUI/user/default/workflows/<workflow_name>.json`.
3. **Parameter Binding**: `prepare_workflow()` dynamically injects user prompts, negative prompts, seed, steps, CFG, and checkpoint names into the target nodes.

### 2.3 Frontend Contract & Response Envelopes
All FastAPI responses returned to the Next.js frontend must follow the standard envelope:
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional status message",
  "errors": null
}
```
The frontend's `services/apiClient.ts` validates `json.success !== false`. Always return `SuccessResponse` or `ErrorResponse` from `app.schemas`.

---

## 3. High-Performance Client Guidelines

When writing backend code that communicates with ComfyUI:
1. **Reuse Connection Pool**: Always call `get_comfyui_client()` instead of instantiating `aiohttp.ClientSession` directly. The global client maintains a connection pool (`TCPConnector(limit=100, keepalive_timeout=60.0)`).
2. **Micro-Caching**: If an endpoint polls ComfyUI system state, leverage the micro-cache in `client.health_check()`.
3. **Memory Management**: When triggering memory cleanup, call `await client.free_memory(unload_models=False)` to free intermediate activations without evicting warm weights from GPU RAM.

---

## 4. Testing & Verification

Run the automated self-check test suite before committing changes:
```bash
python3 backend/tests/test_backend_e2e.py
```

The suite validates:
- **Configuration**: Ensures database URLs, paths, and settings parse properly.
- **Database CRUD**: Verifies PostgreSQL connection, job insertion, query, and cleanup.
- **ComfyUI Connection**: Pings `http://127.0.0.1:8188/system_stats` and verifies ComfyUI version.
- **Workflow Manager**: Validates compilation and parameter injection for all workflows.
- **Model Registry**: Confirms registered 3D models and capability flags.

---

## 5. Service Orchestration Scripts

- **`scripts/install_comfyui.sh`**: Idempotent installer for ComfyUI and ComfyUI-3D-Pack.
- **`scripts/start.sh`**: Starts PostgreSQL, Redis, ComfyUI, FastAPI, and Next.js.
- **`scripts/stop.sh`**: Gracefully stops all services and frees ports 3000, 8000, and 8188.
