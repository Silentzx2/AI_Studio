# AI 3D Studio - Complete API Documentation

> **Version**: 3.4.3 (Reticle Removal + Unified Logger)  
> **Base URL**: `http://localhost:8000` (Backend API)  
> **API Prefix**: `/api/v1`  
> **Documentation**: Interactive docs at `/docs` (Swagger UI)

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Generation APIs](#generation-apis)
4. [Model Management APIs](#model-management-apis)
5. [Model Discovery APIs](#model-discovery-apis)
6. [Download APIs](#download-apis)
7. [System & Diagnostics APIs](#system--diagnostics-apis)
8. [Upload APIs](#upload-apis)
9. [Admin APIs](#admin-apis)
10. [Pipelines APIs](#pipelines-apis)
11. [Runtime APIs](#runtime-apis)
12. [Image Generation APIs](#image-generation-apis)
13. [Error Handling](#error-handling)
14. [Rate Limiting](#rate-limiting)
15. [WebSocket/SSE Events](#websocketsse-events)

---

## Overview

The AI 3D Studio REST API follows RESTful conventions and returns JSON responses. All endpoints are prefixed with `/api/v1`.

### Standard Response Format

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

### Error Response Format

```json
{
  "success": false,
  "error": "Error description",
  "errors": ["Detailed error 1", "Detailed error 2"],
  "code": "ERROR_CODE"
}
```

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| `200` | OK | Successful GET, PUT, DELETE |
| `201` | Created | Resource created successfully |
| `202` | Accepted | Async task started |
| `400` | Bad Request | Invalid parameters |
| `401` | Unauthorized | Authentication required |
| `403` | Forbidden | Insufficient permissions |
| `404` | Not Found | Resource doesn't exist |
| `422` | Validation Error | Invalid request body |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Server-side error |

---

## Authentication

Currently, the API uses **no authentication** for development mode. Production deployment should configure:

- **API Keys** via header: `X-API-Key: your-key`
- **JWT Tokens** for user sessions
- **HuggingFace Token** for model downloads (stored in `.env`)

### Set HuggingFace Token

```bash
POST /api/v1/hf-token/set
Content-Type: application/json

{ "token": "hf_xxxxxxxxxxxxxxxxxxxx" }
```

---

## Generation APIs

Handle 3D model generation from text prompts or images.

### Start 3D Generation

Initiate a new 3D generation job.

```http
POST /api/v1/generation
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "A cute cartoon robot holding a flower",
  "mode": "text-to-3d",
  "quality": "standard",
  "provider": "hunyuan3d-2.1",
  "generate_texture": true,
  "reference_image_base64": null,
  "reference_image_url": null,
  "settings": {
    "remesh": false,
    "texture_resolution": 1024
  }
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | ✅ | Text description for generation |
| `mode` | string | ❌ | `text-to-3d` or `image-to-3d` (default: `text-to-3d`) |
| `quality` | string | ❌ | `low-poly`, `standard`, or `high-poly` |
| `provider` | string | ❌ | AI provider to use (auto-selected if omitted) |
| `generate_texture` | boolean | ❌ | Generate textures for the model |
| `reference_image_base64` | string | ❌ | Base64 encoded image for image-to-3d |
| `reference_image_url` | string | ❌ | URL of reference image |

**Response (202):**
```json
{
  "success": true,
  "data": {
    "job_id": "gen_abc123",
    "status": "queued",
    "message": "Generation job queued"
  }
}
```

---

### Get Job Status

Check the status of a generation job.

```http
GET /api/v1/generation/{job_id}/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "job_id": "gen_abc123",
    "status": "processing",
    "progress": 65,
    "stage": "generating",
    "message": "Running inference...",
    "output_files": null,
    "created_at": "2026-01-22T12:00:00Z"
  }
}
```

**Job Status Values:**

| Status | Description |
|--------|-------------|
| `queued` | Waiting in queue |
| `processing` | Currently generating |
| `completed` | Generation finished successfully |
| `failed` | Generation failed |
| `cancelled` | Job was cancelled |

---

### Get Generation History

List past generation jobs.

```http
GET /api/v1/generation/history?limit=20&offset=0&status=completed
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 20 | Number of results |
| `offset` | integer | 0 | Pagination offset |
| `status` | string | all | Filter by status |

---

## Model Management APIs

Manage installed AI models.

### List Installed Models

Get all models installed on the system.

```http
GET /api/v1/models/installed?include_health=true
```

**Response:**
```json
{
  "success": true,
  "data": {
    "models": [
      {
        "id": "hunyuan3d-2.1",
        "name": "Hunyuan3D 2.1",
        "health": "healthy",
        "manifest": {
          "version": "2.1.0",
          "category": "image-to-3d",
          "capabilities": ["image-to-3d", "text-to-3d"],
          "min_vram_mb": 16384
        }
      }
    ],
    "count": 1
  }
}
```

---

### Get Model Details

Get detailed information about a specific model.

```http
GET /api/v1/models/{model_id}?include_health=true
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `model_id` | string | Unique model identifier |

---

### Uninstall Model

Remove an installed model (async operation).

```http
DELETE /api/v1/models/{model_id}
```

**Response (202):**
```json
{
  "success": true,
  "message": "Uninstallation started for hunyuan3d-2.1",
  "model_id": "hunyuan3d-2.1"
}
```

---

### Repair Model

Run diagnostics and attempt to fix issues.

```http
POST /api/v1/models/{model_id}/repair
```

**Response:**
```json
{
  "success": true,
  "message": "Repair task started for hunyuan3d-2.1",
  "task_id": "repair_abc123",
  "model_id": "hunyuan3d-2.1"
}
```

---

### Get Model Health Check

Run comprehensive health check for a model.

```http
GET /api/v1/models/{model_id}/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "model_id": "hunyuan3d-2.1",
    "model_name": "Hunyuan3D 2.1",
    "status": "healthy",
    "timestamp": "2026-01-22T12:00:00Z",
    "checks": {
      "files": { "status": "ok", "message": "All files present" },
      "dependencies": { "status": "ok", "message": "All dependencies satisfied" },
      "manifest": { "status": "ok", "message": "Manifest valid" },
      "disk_space": { "status": "ok", "message": "50GB free" },
      "gpu": { "status": "ok", "compatible": true }
    },
    "summary": {
      "total_checks": 5,
      "passed": 5,
      "warnings": 0,
      "errors": 0
    }
  }
}
```

---

### Run Model Benchmark

Execute performance benchmark for a model.

```http
POST /api/v1/models/{model_id}/benchmark
```

**Response:**
```json
{
  "success": true,
  "data": {
    "model_id": "hunyuan3d-2.1",
    "inference_time_ms": 2450.5,
    "throughput_samples_per_sec": 0.41,
    "memory_usage_mb": 14250,
    "gpu_utilization_percent": 94.2
  }
}
```

---

### Get All Models Health Summary

Health overview of all installed models.

```http
GET /api/v1/models/health/all
```

---

## Model Discovery APIs

Browse and discover available models from various providers.

### Discover Models

Search across all configured providers.

```http
GET /api/v1/discover/models?category=3d-generation&search=hunyuan&limit=50&offset=0
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `category` | string | "" | Filter by category |
| `search` | string | "" | Search in name/description |
| `provider` | string | "" | Specific provider only |
| `limit` | integer | 50 | Max results |
| `offset` | integer | 0 | Pagination offset |

**Available Categories:**
- `3d-generation`
- `text-to-image`
- `image-to-3d`
- `text-to-3d`
- `remeshing`
- `texture-generation`
- `upscaling`
- `inpainting`

**Response:**
```json
{
  "success": true,
  "data": {
    "models": [
      {
        "id": "hunyuan3d-2.1",
        "name": "Hunyuan3D 2.1",
        "provider": "internal",
        "category": "image-to-3d",
        "description": "High-quality image-to-3D generation",
        "tags": ["featured", "production-ready"],
        "min_vram_mb": 16384
      }
    ],
    "count": 1,
    "total": 1
  }
}
```

---

### Get Specific Model Info

Get details from a specific provider.

```http
GET /api/v1/discover/models/{model_id}?provider=huggingface
```

---

### List Providers

Get status of all model providers.

```http
GET /api/v1/discover/providers
```

**Response:**
```json
{
  "success": true,
  "data": {
    "providers": [
      { "name": "huggingface", "available": true, "configured": true },
      { "name": "github", "available": true, "configured": true },
      { "name": "civitai", "available": true, "configured": true },
      { "name": "modelscope", "available": false, "error": "API key not set" }
    ]
  }
}
```

---

### Get Featured Models

Get curated list of recommended models.

```http
GET /api/v1/discover/featured?limit=10
```

---

### List Categories

Get available model categories.

```http
GET /api/v1/discover/categories
```

---

## Download APIs

Manage model downloads with queue support.

### Start Download

Queue a new model download.

```http
POST /api/v1/download/start
Content-Type: application/json
```

**Request Body:**
```json
{
  "model_id": "trellis-v1.0",
  "model_name": "TRELLIS v1.0",
  "url": "https://example.com/models/trellis.bin",
  "filename": "trellis.bin",
  "total_size": 5368709120,
  "checksum": "sha256:abcdef1234567890...",
  "provider": "huggingface"
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model_id` | string | ✅ | Model identifier |
| `model_name` | string | ✅ | Human-readable name |
| `url` | string | ✅ | Download URL |
| `filename` | string | ✅ | Target filename |
| `total_size` | integer | ✅ | Expected size in bytes |
| `checksum` | string | ❌ | SHA256 checksum for validation |
| `provider` | string | ❌ | Source provider name |

**Response:**
```json
{
  "success": true,
  "data": {
    "download_id": "trellis-v1.0_1705948800",
    "status": "queued"
  }
}
```

---

### Start Batch Download

Download multiple files for a single model.

```http
POST /api/v1/download/start-batch
Content-Type: application/json
```

**Request Body:**
```json
{
  "model_id": "large-model",
  "model_name": "Large Model Pack",
  "files": [
    {
      "model_id": "large-model",
      "model_name": "Large Model - Weights",
      "url": "https://example.com/weights.bin",
      "filename": "weights.bin",
      "total_size": 5000000000
    },
    {
      "model_id": "large-model",
      "model_name": "Large Model - Config",
      "url": "https://example.com/config.json",
      "filename": "config.json",
      "total_size": 5000
    }
  ]
}
```

---

### Get Download Queue

List all downloads with optional filtering.

```http
GET /api/v1/download/queue?status=pending
```

**Status Values:** `pending`, `downloading`, `paused`, `completed`, `failed`, `cancelled`

---

### Get Active Downloads

Get currently active downloads only.

```http
GET /api/v1/download/queue/active
```

---

### Get Download Status

Get detailed status of a specific download.

```http
GET /api/v1/download/{download_id}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "download_abc123",
    "model_id": "trellis-v1.0",
    "model_name": "TRELLIS v1.0",
    "status": "downloading",
    "progress_percent": 67.5,
    "downloaded_size": 3623878656,
    "total_size": 5368709120,
    "created_at": "2026-01-22T11:55:00Z",
    "started_at": "2026-01-22T11:56:00Z"
  }
}
```

---

### Pause Download

Pause an active download (supports resume).

```http
POST /api/v1/download/{download_id}/pause
```

---

### Resume Download

Resume a paused download.

```http
POST /api/v1/download/{download_id}/resume
```

---

### Cancel Download

Cancel download and cleanup partial file.

```http
POST /api/v1/download/{download_id}/cancel
```

---

### Cleanup Completed Downloads

Remove old completed/failed downloads from queue.

```http
DELETE /api/v1/download/queue/cleanup
```

---

### Get Download Statistics

Get aggregate download statistics.

```http
GET /api/v1/download/statistics
```

**Response:**
```json
{
  "success": true,
  "data": {
    "by_status": {
      "pending": 2,
      "downloading": 1,
      "completed": 15,
      "failed": 1
    },
    "total_downloaded_bytes": 25000000000,
    "total_downloaded_mb": 23841.86,
    "avg_speed_mb_per_sec": 12.5
  }
}
```

---

### Process Queue Manually

Trigger processing of pending downloads.

```http
POST /api/v1/download/process-queue
```

---

## System & Diagnostics APIs

System information and compatibility checking.

### Get System Information

Comprehensive system info (CPU, RAM, disk, Python).

```http
GET /api/v1/system/info
```

**Response:**
```json
{
  "success": true,
  "data": {
    "service": { "name": "AI 3D Studio", "version": "3.0.0" },
    "os": {
      "system": "Linux",
      "release": "5.15.0",
      "machine": "x86_64"
    },
    "python": {
      "version": "3.12.0",
      "executable": "/usr/bin/python3"
    },
    "cpu": { "count": 16, "logical_count": 32 },
    "memory": {
      "total_mb": 65536,
      "available_mb": 32000,
      "percent": 51
    },
    "disk": {
      "total_gb": 500,
      "free_gb": 200,
      "used_percent": 60
    }
  }
}
```

---

### Check System Compatibility

Verify system meets model requirements.

```http
POST /api/v1/system/compatibility
Content-Type: application/json
```

**Request Body:**
```json
{
  "manifest": {
    "min_vram_mb": 16384,
    "cuda_required": true,
    "min_cuda_version": "11.8",
    "python_min": "3.10",
    "disk_space_gb": 50,
    "min_ram_gb": 16
  },
  "model_id": "hunyuan3d-2.1",
  "model_name": "Hunyuan3D 2.1"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "compatible": true,
    "errors": [],
    "warnings": [],
    "requirements": {
      "vram": { "required": 16384, "available": 24576, "ok": true },
      "cuda": { "required": "11.8", "available": "12.1", "ok": true },
      "disk": { "required": 50, "available": 200, "ok": true },
      "python": { "required": "3.10", "current": "3.12", "ok": true },
      "ram": { "required": 16, "available": 62.5, "ok": true }
    }
  }
}
```

---

### Get GPU Information

Detailed GPU/CUDA information.

```http
GET /api/v1/system/gpu
```

**Response:**
```json
{
  "success": true,
  "data": {
    "available": true,
    "gpus": [
      {
        "id": 0,
        "name": "NVIDIA RTX 4090",
        "vram_gb": 24,
        "cuda_version": "12.1",
        "compute_capability": "8.9"
      }
    ],
    "cuda": {
      "torch_cuda_available": true,
      "cuda_version": "12.1"
    }
  }
}
```

---

### Check Dependencies

Verify critical Python packages are installed.

```http
GET /api/v1/system/dependencies
```

**Response:**
```json
{
  "success": true,
  "data": {
    "all_critical_satisfied": true,
    "critical": {
      "torch": { "installed": true, "version": "2.5.1", "satisfied": true },
      "fastapi": { "installed": true, "version": "0.115.6", "satisfied": true },
      "celery": { "installed": true, "version": "5.4.0", "satisfied": true }
    },
    "optional": {
      "transformers": { "installed": true, "version": "4.46.0", "satisfied": true }
    }
  }
}
```

---

### Get Storage Information

Disk usage and storage details.

```http
GET /api/v1/system/storage
```

---

### Test Connections

Test database, Redis, and storage connectivity.

```http
POST /api/v1/system/test/connection
```

---

### Record Client Activity Log

Accepts client-side activity events (API calls, button clicks) forwarded by the frontend `ActivityLogger`, and writes them to the backend log output — the same log the backend request timing middleware writes to.

```http
POST /api/v1/system/log
Content-Type: application/json
```

**Request Body:**
```json
{
  "ts": "2026-08-09T07:00:00.000Z",
  "type": "click",
  "detail": "Generate"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ts` | string | ISO timestamp (client clock) |
| `type` | string | Event type: `api` \| `click` \| `error` |
| `detail` | string | Human-readable event detail |

Fire-and-forget from the frontend; failures are swallowed client-side.

---

### Get Public Configuration

Non-sensitive configuration values.

```http
GET /api/v1/system/config
```

---

## Upload APIs

File upload handling.

### Upload Image

Upload an image for generation.

```http
POST /api/v1/upload/image
Content-Type: multipart/form-data
```

**Form Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | ✅ | Image file (PNG, JPG, WebP) |
| `purpose` | string | ❌ | `generation`, `reference`, `texture` |

**Response:**
```json
{
  "success": true,
  "data": {
    "file_id": "upload_abc123",
    "filename": "robot.png",
    "url": "/static/uploads/robot.png",
    "size_bytes": 1524000,
    "content_type": "image/png"
  }
}
```

**Supported Formats:** PNG, JPEG, WebP, GIF  
**Max Size:** 50MB (configurable via `MAX_UPLOAD_SIZE`)

---

## Admin APIs

Administrative operations.

### System Overview

Dashboard metrics and stats.

```http
GET /api/v1/admin/overview
```

**Response includes:**
- Total jobs (by status)
- Storage usage
- System health
- Active downloads
- Worker status

---

### View Logs

Access application logs.

```http
GET /api/v1/admin/logs?lines=100&level=INFO
```

---

### Manage Workers

Control Celery workers.

```http
POST /api/v1/admin/workers/restart
POST /api/v1/admin/workers/scale?count=4
GET /api/v1/admin/workers/status
```

---


## Pipelines APIs

Model capability gating for the Settings → Pipelines page.

### List Pipelines

```http
GET /api/v1/pipelines
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pipelines": [
      {
        "id": "triposg",
        "label": "TripoSG",
        "category": "3d_generation",
        "status": "not_installed",
        "installed": false,
        "enabled": false,
        "available": true,
        "vram_required_mb": 12000,
        "speed_seconds": 45,
        "supports": {
          "texture_generation": false,
          "rigging_animation": false,
          "detail_enhancement": true,
          "text_to_3d": false,
          "image_to_3d": true
        },
        "workspace_compatibility": ["mesh-generation"]
      }
    ],
    "computed_features": {
      "texture_generation": true,
      "rigging_animation": true,
      "detail_enhancement": true,
      "text_to_3d": true,
      "image_to_3d": true
    },
    "input_modes": ["text-to-3d", "image-to-3d"],
    "total_models": 8,
    "workspace_types": [
      "mesh-generation",
      "texture-generation",
      "rigging",
      "animation",
      "remesh",
      "post-processing"
    ],
    "updated_at": "2026-07-27T00:00:00Z"
  }
}
```

### Toggle Pipeline

```http
POST /api/v1/pipelines/{model_id}/toggle
Content-Type: application/json
```

**Request Body:**
```json
{ "enabled": true }
```

**Behavior:**
- Validates the model id against installed + available models.
- Persists the toggle state in the runtime cache.
- Recomputes the feature matrix for the UI.

### Get Workspace Models

```http
GET /api/v1/pipelines/workspace-models?workspace=<type>&installed_only=<bool>
```

**Query Parameters:**
- `workspace` (required): One of `mesh-generation`, `texture-generation`, `rigging`, `animation`, `remesh`, `post-processing`.
- `installed_only` (optional, default `false`): If `true`, only return installed models.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pipelines": [
      {
        "id": "hunyuan3d-2.1",
        "label": "Hunyuan3D 2.1",
        "installed": true,
        "status": "ready",
        "vram_required_mb": 16000,
        "supports": {
          "text_to_3d": true,
          "image_to_3d": true,
          "texture_generation": true
        },
        "workspace_compatibility": ["mesh-generation", "texture-generation", "post-processing"]
      }
    ]
  }
}
```

### List Workspace Types

```http
GET /api/v1/pipelines/workspace-types
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "workspace_types": [
      "mesh-generation",
      "texture-generation",
      "rigging",
      "animation",
      "remesh",
      "post-processing"
    ],
    "descriptions": {
      "mesh-generation": "Generate 3D meshes from text or images",
      "texture-generation": "Generate PBR textures and materials",
      "rigging": "Auto-rig 3D character meshes",
      "animation": "Generate skeletal animations",
      "remesh": "Retopology and mesh optimization",
      "post-processing": "Detail enhancement and mesh polishing"
    }
  }
}
```

### Supported model ids in the current catalog

`hunyuan3d-2.1`, `trellis`, `triposg`, `unirig`


## Runtime APIs

GPU runtime management, provider discovery, and HuggingFace token helpers.

> The backend exposes runtime sub-routes such as `/status`, `/health`, `/options`, and HuggingFace token helpers under `/api/v1/runtime/*`. The root path `GET /api/v1/runtime` is **not** registered in this build.

### Runtime Status

```http
GET /api/v1/runtime/status
```

Returns the current engine, provider, storage, and worker snapshot.

**Response fields:**
- `engine`
- `system`
- `active_provider`
- `runtime_mode`
- `providers`
- `storage`
- `workers`

### Runtime Health

```http
GET /api/v1/runtime/health
```

Returns runtime health summary, GPU availability, and provider count.

### Runtime Options

```http
GET /api/v1/runtime/options
```

Returns the selectable runtime options used by the frontend:

- `three_d_models`
- `texture_models`
- `rigging_providers`
- `render_qualities`
- `resolutions`
- `texture_resolutions`
- `output_formats`
- `vram_limits`
- `gpu_options`
- `active_provider`
- `gpu_available`
- `gpu_required`
- `hf_token_configured`

### HuggingFace Token Status

```http
GET /api/v1/runtime/hf-token
GET /api/v1/runtime/hf-token/status
```

The `status` route returns a simplified `{ configured, valid }` payload for the UI.

### HuggingFace Token Management

```http
POST /api/v1/runtime/hf-token
DELETE /api/v1/runtime/hf-token
POST /api/v1/runtime/hf-token/verify
```

### Install Progress Stream

```http
GET /api/v1/runtime/install/stream?model_id=triposg
```

Server-sent events stream installation progress for the active model installer.

> **v3.1.0+ breaking change**: The underlying `POST /api/v1/runtime/install` endpoint now **requires** a `models` list in the request body. Passing no models or `null` will return a validation error. Use `resolve_install_targets()` to validate the list before installing.

```json
// POST /api/v1/runtime/install — request body (models is now REQUIRED)
{
  "models": ["hunyuan3d-2.1", "trellis"]
}
```

## Image Generation APIs

SDXL-based 2D image generation.

### Generate Image

Create an image from text prompt.

```http
POST /api/v1/image-generation/generate
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "A futuristic cityscape at sunset",
  "negative_prompt": "blurry, low quality",
  "width": 1024,
  "height": 1024,
  "steps": 30,
  "cfg_scale": 7.5,
  "sampler": "euler_a",
  "seed": 42
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "job_id": "img_gen_xyz",
    "status": "processing",
    "preview_url": null
  }
}
```

---

### Get Image Job Status

```http
GET /api/v1/image-generation/jobs/{job_id}
```

---

### List Available Models

```http
GET /api/v1/image-generation/models
```

---

## Error Handling

### Standard Error Response

All errors follow this format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MODEL_NOT_FOUND` | 404 | Model ID doesn't exist |
| `DOWNLOAD_FAILED` | 500 | Download could not complete |
| `INSUFFICIENT_VRAM` | 400 | Not enough GPU memory |
| `PROVIDER_UNAVAILABLE` | 503 | AI provider not ready |
| `INVALID_MANIFEST` | 400 | Model manifest validation failed |
| `CHECKSUM_MISMATCH` | 500 | File integrity check failed |
| `QUEUE_FULL` | 503 | Download queue at capacity |
| `RATE_LIMITED` | 429 | Too many requests |

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Generation | 10 requests | per minute |
| Download start | 5 requests | per minute |
| Discovery | 60 requests | per minute |
| System info | 30 requests | per minute |
| Default | 100 requests | per minute |

Headers returned:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705949000
```

---

## WebSocket/SSE Events

### Real-time Progress Updates

Subscribe to job progress via SSE:

```javascript
const eventSource = new EventSource('/api/v1/generation/{job_id}/stream');

eventSource.addEventListener('progress', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Progress: ${data.progress}%`);
  console.log(`Stage: ${data.stage}`);
});

eventSource.addEventListener('complete', (e) => {
  const result = JSON.parse(e.data);
  console.log('Output:', result.output_files);
});
```

**Event Types:**

| Event | Data | Description |
|-------|------|-------------|
| `progress` | `{ progress, stage, message }` | Progress update |
| `complete` | `{ output_files, thumbnails }` | Job complete |
| `error` | `{ error, code }` | Job failed |
| `queued` | `{ position }` | Position in queue |

---

## SDK Examples

### Python Client

```python
import httpx

class AI3DStudioClient:
    def __init__(self, base_url="http://localhost:8000"):
        self.client = httpx.Client(base_url=base_url)
    
    def generate(self, prompt: str, mode: str = "text-to-3d") -> dict:
        resp = self.client.post("/api/v1/generation", json={
            "prompt": prompt,
            "mode": mode
        })
        resp.raise_for_status()
        return resp.json()["data"]
    
    def get_job_status(self, job_id: str) -> dict:
        resp = self.client.get(f"/api/v1/generation/{job_id}/status")
        return resp.json()["data"]
    
    def list_models(self) -> list:
        resp = self.client.get("/api/v1/models/installed")
        return resp.json()["data"]["models"]

# Usage
client = AI3DStudioClient()
job = client.generate("A fantasy castle")
print(f"Job ID: {job['job_id']}")
```

### JavaScript/TypeScript Client

```typescript
// services/apiClient.ts is already implemented

import { apiClient } from '@/services/apiClient';

async function generate3D(prompt: string) {
  const response = await apiClient.post('/generation', {
    prompt,
    mode: 'text-to-3d',
    quality: 'standard'
  });
  
  const jobId = response.data.job_id;
  
  // Poll for completion
  while (true) {
    const status = await apiClient.get(`/generation/${jobId}/status`);
    
    if (status.data.status === 'completed') {
      return status.data.output_files;
    } else if (status.data.status === 'failed') {
      throw new Error(status.data.error);
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
}
```

---

## Changelog

### v3.4.3 (Reticle Removal + Unified Logger)

#### Added
- `POST /api/v1/system/log` — frontend activity logger endpoint. The `ActivityLogger` component (mounted in `app/layout.tsx`) captures all frontend API calls and button/link clicks and forwards them here, so the whole project writes to one unified log (`logs/api.log`).

#### Removed
- `ReticleMiddleware` and the localhost:7777 observer server removed along with the Reticle SDK.

### v3.4.2 (Bugfix & Cleanup Batch)

#### Removed
- `plugin_manager_router` removed from the API aggregator — it previously shadowed the richer `/admin/models` implementation that the ModelsTab needs. The dead `plugin_manager.py` registration is gone (BE-003).

#### Fixed
- `POST /api/v1/download/*` endpoints now use a proper synchronous DB session (`get_sync_db`) instead of the async session, fixing session/threading errors during download operations (BE-001).
- Various async fixes across the download queue and generation history endpoints (see `Docs/CHANGELOG.md` for the full 53-fix list).

### v3.2.0 (uv-Only Package Management)

#### Breaking
- **uv is now a hard dependency**: `python -m venv` and `pip` are no longer used anywhere. All Python environments are created and managed by `uv`. `install_repo_deps()` will fail immediately if `uv` is not found.

#### Changed
- Backend dependencies installed with `uv pip install` instead of `pip install`.
- Application directories created at runtime by `storage.ensure_dirs()`.
- Model weights now resolved from `third_party/<RepoName>/weights/` with legacy fallback.

#### Inherited from v3.1.0
- **Install endpoint requires explicit model list**: `POST /api/v1/runtime/install` now requires a non-empty `models` array. The previous behavior of passing `null` to install all models is removed.
- Model weights now resolved from `third_party/<RepoName>/weights/` with legacy fallback.
- Native deployment via shell scripts (no Docker deployment path).
- `GET /api/v1/runtime/install/stream?model_id=<id>` — SSE install progress.
- Migration script accessible via `./scripts/update-models.sh --migrate`.

### v3.1.0 (Per-Model Pipeline Restructure)

#### Breaking
- **Install endpoint requires explicit model list**: `POST /api/v1/runtime/install` now requires a non-empty `models` array. The previous behavior of passing `null` to install all models is removed.

#### Changed
- Model weights now resolved from `third_party/<RepoName>/weights/` with legacy fallback.
- Per-model virtual environments via `uv venv`.

#### Added
- `GET /api/v1/runtime/install/stream?model_id=<id>` — SSE install progress (documented).
- Migration script accessible via `./scripts/update-models.sh --migrate`.

### v3.0.0 (Pipeline V2)

#### Added
- **Model Management APIs**: Full CRUD for installed models
- **Discovery APIs**: Browse models from HuggingFace, GitHub, CivitAI, ModelScope
- **Download APIs**: Queue-based downloads with pause/resume/cancel
- **System APIs**: Compatibility checking, diagnostics, GPU info
- **Health APIs**: Comprehensive model health checks
- **Benchmark APIs**: Performance testing endpoints

#### Enhanced
- Download system with chunked transfers and mirror fallback
- Health checks with dependency validation
- System compatibility verification

---

*Last Updated: August 9, 2026*


### Frontend Connectivity Notes

- The frontend checks backend availability via the health and runtime status endpoints.
- Workspace tabs are URL-synced with `?view=...` so section changes survive refresh and back/forward navigation.
