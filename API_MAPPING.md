# API Mapping

## UI Feature → Frontend Function → Backend Endpoint

| UI Feature | Frontend Function | Backend Endpoint | Method | Request Shape | Response Shape |
|---|---|---|---|---|---|
| Image Upload | `GeneratePanel.processImageFile` | `/api/v1/file-upload/image` | POST | multipart/form-data (`file`) | `{ file_id, filename, file_type, file_size_mb }` |
| Mesh Upload | `apiClient.uploadMeshFile` | `/api/v1/file-upload/mesh` | POST | multipart/form-data (`file`) | `{ file_id, ... }` |
| Text → 3D | `WorkspaceContext.generate3DModel` | `/api/v1/mesh-generation/text-to-raw-mesh` | POST | `{ text_prompt, output_format, model_preference, model_parameters }` | `{ job_id, status, message }` |
| Text → Textured 3D | `WorkspaceContext.generate3DModel` | `/api/v1/mesh-generation/text-to-textured-mesh` | POST | `{ text_prompt, texture_prompt, texture_resolution, ... }` | `{ job_id, status, message }` |
| Image → 3D | `WorkspaceContext.generateImageTo3D` | `/api/v1/mesh-generation/image-to-raw-mesh` | POST | `{ image_file_id, output_format, model_preference, model_parameters }` | `{ job_id, status, message }` |
| Image → Textured 3D | `WorkspaceContext.generateImageTo3D` | `/api/v1/mesh-generation/image-to-textured-mesh` | POST | `{ image_file_id, texture_resolution, ... }` | `{ job_id, status, message }` |
| Texture Generation | `WorkspaceContext.runTextureGeneration` | `/api/v1/mesh-generation/text-mesh-painting` | POST | `{ mesh_path, text_prompt, texture_resolution, ... }` | `{ job_id, status, message }` |
| Mesh Editing | `WorkspaceContext.runRemeshGeneration` | `/api/v1/mesh-editing/text-mesh-editing` | POST | `{ mesh_path, mask_bbox, source_prompt, target_prompt, ... }` | `{ job_id, status, message }` |
| Job Status | `WorkspaceContext` poll effect | `/api/v1/system/jobs/{job_id}` | GET | — | `{ job_id, status, progress, result: { mesh_url, thumbnail_url }, error }` |
| Job History | `useAppStore.loadHistory` | `/api/v1/system/jobs/history` | GET | `?limit=50` | `{ jobs: [...], pagination, filters, timestamp }` |
| Job Result Info | `apiClient.getJobResultInfo` | `/api/v1/system/jobs/{job_id}/info` | GET | — | `{ job_id, status, file_info, mesh_download_urls, ... }` |
| Download Result | `apiClient.downloadJobResult` | `/api/v1/system/jobs/{job_id}/download` | GET | `?format=file` | FileResponse (binary) |
| Download Thumbnail | `apiClient.downloadJobResult` | `/api/v1/system/jobs/{job_id}/thumbnail` | GET | `?format=file` | FileResponse (binary) |
| System Status | `apiClient.getSystemStatus` | `/api/v1/system/status` | GET | — | `{ system, gpu, models, queue }` |
| Available Models | `apiClient.getAvailableModels` | `/api/v1/system/models` | GET | `?feature=...` | `{ available_models: { feature: [models] } }` |
| Health Check | `apiClient.getHealthStatus` | `/health` | GET | — | `{ status: "healthy", timestamp, uptime }` |
| Logs | `apiClient.getLogs` | `/api/v1/system/logs` | GET | `?lines=N` | `{ logs: [...], total_entries, ... }` |
| Auto Rigging | `apiClient.generateRig` | `/api/v1/auto-rigging/generate-rig` | POST | `{ mesh_path, ... }` | `{ job_id, status, message }` |
| Mesh Segmentation | `apiClient.segmentMesh` | `/api/v1/mesh-segmentation/segment-mesh` | POST | `{ mesh_path, ... }` | `{ job_id, status, message }` |
| Mesh Retopology | `apiClient.retopologizeMesh` | `/api/v1/mesh-retopology/retopologize-mesh` | POST | `{ mesh_path, ... }` | `{ job_id, status, message }` |
| UV Unwrapping | `apiClient.unwrapMeshUV` | `/api/v1/mesh-uv-unwrapping/unwrap-mesh` | POST | `{ mesh_path, ... }` | `{ job_id, status, message }` |

## Job Lifecycle

```
1. Upload image (optional) → file_id
2. Submit generation → job_id
3. Poll /api/v1/system/jobs/{job_id}
   - status: queued → processing → completed|failed|cancelled
   - progress: 0..1 fraction (converted to 0..100 in UI)
4. On completed: result.mesh_url → load in 3D viewer
   result.thumbnail_url → display preview
5. Download: /api/v1/system/jobs/{job_id}/download
```

## Artifact Handling

- **Mesh URL**: Backend returns absolute URL (e.g., `http://127.0.0.1:8000/api/v1/system/jobs/{id}/download`)
  - Frontend rewrites to same-origin: `/api/v1/system/jobs/{id}/download`
  - Handled by `normalizeBackendJob` → `toProxyUrl`
- **Thumbnail URL**: Same rewriting applies
- **Input Image URL**: Same rewriting applies

## Unsupported Features

The following features from the previous architecture are NOT supported by the current backend:

| Feature | Reason |
|---|---|
| `/api/v1/generation` | Replaced by `/api/v1/mesh-generation/*` |
| `/api/v1/runtime/prewarm` | No runtime prewarm endpoint |
| `/api/v1/generation/enhance-prompt` | No prompt enhancement endpoint |
| `/api/v1/system/install/*` | No model install endpoints |
| `/api/v1/system/repair/*` | No repair endpoints |
| `/api/v1/runtime/*` | No runtime control endpoints |
| `/api/v1/settings/*` | No settings endpoints |
| `/api/v1/system/models/action` | No model action endpoint |
| Workflow queueing | No generic workflow endpoint |