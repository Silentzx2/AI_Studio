# Backend Integration

## Active Backend

- **Framework**: FastAPI (Python 3.12+)
- **Entry Point**: `backend/api/main_singleworker.py`
- **API Prefix**: `/api/v1`
- **Health Check**: `GET /health` (no prefix)
- **Interactive Docs**: `/docs` (Swagger UI)

## Integration Layer

The frontend communicates with the backend exclusively through:

1. **Next.js API Proxy** (`app/api/v1/[...path]/route.ts`)
   - Runtime proxy that forwards `/api/v1/*` requests to `BACKEND_URL`
   - Reads `BACKEND_URL` from environment at request time
   - Handles CORS, SSE streaming, and file uploads

2. **Frontend API Client** (`services/apiClient.ts`)
   - Axios-based client with `baseURL: ''` (same-origin)
   - All requests go through the Next.js proxy
   - Centralized error handling and retry logic

## Request Flow

```
Browser → Next.js Route Handler → Proxy Route → Backend FastAPI
```

All API calls use same-origin `/api/v1/*` paths. The Next.js proxy forwards to the backend at runtime.

## Job Flow

1. **Upload** (optional): `POST /api/v1/file-upload/image` → returns `file_id`
2. **Submit**: `POST /api/v1/mesh-generation/{text,image}-to-{raw,textured}-mesh` → returns `{ job_id, status, message }`
3. **Poll**: `GET /api/v1/system/jobs/{job_id}` → returns job status with `progress` (0-1 fraction), `result` (with `mesh_url`, `thumbnail_url`)
4. **Complete**: When `status === 'completed'`, the `result` contains `mesh_url` and `thumbnail_url`

## Upload/Download Flow

### Upload
- Images: `POST /api/v1/file-upload/image` (multipart/form-data, field `file`)
- Meshes: `POST /api/v1/file-upload/mesh` (multipart/form-data, field `file`)
- Response: `{ file_id, filename, file_type, file_size_mb, upload_time, expires_at }`

### Download
- Job results: `GET /api/v1/system/jobs/{job_id}/download`
- Thumbnails: `GET /api/v1/system/jobs/{job_id}/thumbnail`
- Input images: `GET /api/v1/system/jobs/{job_id}/input`

## Error Handling

The backend returns errors in FastAPI format:
```json
{ "detail": "Error description" }
```

The frontend `parseApiError` function extracts the `detail` field and surfaces it as an `Error` object.

## Model/Capability Discovery

- **Available Models**: `GET /api/v1/system/models` → returns `{ available_models: { feature: [models] } }`
- **Features**: `GET /api/v1/system/features` → returns `{ features: [...] }`
- **Model Parameters**: `GET /api/v1/system/models/{model_id}/parameters` → returns parameter schema
- **Scheduler Status**: `GET /api/v1/system/scheduler-status` → returns queue and adapter status

## Backend Routers

| Router | Prefix | Endpoints |
|---|---|---|
| `system` | `/api/v1/system` | `/health`, `/info`, `/status`, `/models`, `/jobs/{id}`, `/jobs/history`, `/logs`, etc. |
| `file_upload` | `/api/v1/file-upload` | `/image`, `/mesh`, `/metadata/{id}`, `/list`, `/{id}` |
| `mesh_generation` | `/api/v1/mesh-generation` | `/text-to-raw-mesh`, `/text-to-textured-mesh`, `/image-to-raw-mesh`, `/image-to-textured-mesh`, `/text-mesh-painting`, `/image-mesh-painting` |
| `mesh_editing` | `/api/v1/mesh-editing` | `/text-mesh-editing`, `/image-mesh-editing` |
| `auto_rigging` | `/api/v1/auto-rigging` | `/generate-rig` |
| `mesh_segmentation` | `/api/v1/mesh-segmentation` | `/segment-mesh` |
| `mesh_retopology` | `/api/v1/mesh-retopology` | `/retopologize-mesh` |
| `mesh_uv_unwrapping` | `/api/v1/mesh-uv-unwrapping` | `/unwrap-mesh` |