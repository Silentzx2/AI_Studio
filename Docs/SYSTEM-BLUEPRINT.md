# 🏛️ AI 3D Studio — Complete System Architecture & Pipeline Blueprint

> **System Version**: 0.1.0 (FastAPI + Next.js 16)
> **Target Deployments**: Single-GPU Linux / Cloud GPU / Local Workstations
> **Last Verified**: September 2026

---

## 1. Executive System Overview

AI 3D Studio is an end-to-end generative 3D reconstruction and asset optimization platform that converts 2D images or text prompts into game-ready 3D assets (`.glb`, `.obj`, `.fbx`, `.stl`, PBR textures, LOD cascades, collision hulls).

### Core Stack
- **Frontend**: Next.js 16 (React 19, TypeScript, Three.js, React Three Fiber, Tailwind CSS)
- **API Gateway**: FastAPI (Python 3.12, Pydantic V2, AsyncIO)
- **Model Adapters**: Python adapters for TRELLIS, Hunyuan3D-2.1, PartPacker, UltraShape, PartField, P3-SAM, UniRig, FastMesh, VoxHammer
- **Scheduler**: VRAM-aware multiprocess scheduler with GPU monitoring
- **Queue/Broker**: Redis 7 (optional, multi-worker mode only)
- **File Storage**: Local filesystem + Redis FileStore (multi-worker mode)

```mermaid
graph TD
    UI["Next.js 16 Frontend<br/>Three.js / React Three Fiber :3000"]
    API["FastAPI Gateway :8000<br/>Routers: system, generation,<br/>editing, rigging, segmentation"]
    SCHED["VRAM-Aware Scheduler"]
    ADAPTERS["Model Adapters<br/>TRELLIS · Hunyuan3D ·<br/>PartPacker · UltraShape<br/>PartField · UniRig · FastMesh"]
    REDIS["Redis :6379<br/>Job Queue (multi-worker)"]
    STORAGE["Persistent Storage<br/>backend/storage/models/<job_id>"]

    UI -->|REST / SSE| API
    API --> SCHED
    SCHED --> ADAPTERS
    ADAPTERS -->|Raw Mesh| STORAGE
    STORAGE -->|Static Delivery| API
    API -->|Viewport Render| UI

    API -.->|Job Queue| REDIS
```

---

## 2. End-to-End Generation Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend as Next.js 16 Frontend
    participant API as FastAPI Router (:8000)
    participant SCHED as VRAM-Aware Scheduler
    participant Adapter as Model Adapter
    participant Storage as backend/storage/

    User->>Frontend: Select prompt / image + Platform budget
    Frontend->>API: POST /api/v1/mesh-generation/text-to-textured-mesh
    API->>SCHED: Submit job (VRAM-aware)
    SCHED->>Adapter: Run inference (TRELLIS/Hunyuan3D/etc.)
    Adapter-->>SCHED: Raw 3D mesh output
    SCHED->>Storage: Save master source.glb (Untouched Master)
    SCHED->>Storage: Save game_ready.glb (Decimated)
    SCHED->>Storage: Save lods/lod0..3.glb (LOD Cascade)
    SCHED->>Storage: Save collision.glb (Convex Hull)
    SCHED->>Storage: Save quality_report.json (QA 0-100 Score)
    SCHED-->>API: Job complete
    API-->>Frontend: Return {job_id, status: "completed", outputs}
    Frontend->>User: Render 3D model in WebGL Viewport
```

---

## 3. High-Throughput & Low-Latency Performance Architecture

### 3.1 VRAM-Aware Scheduling

| Optimization | Mechanism | Impact |
|---|---|---|
| **GPU Mutual Exclusion** | Strict locking prevents multi-provider GPU OOM | Safe concurrent inference |
| **GPU Monitoring** | Real-time VRAM/temperature polling via `GPUMonitor` | Dynamic scheduling decisions |
| **VRAM Safety Buffer** | `memory_buffer=1024` (1GB free) + `VRAM_SAFETY_MARGIN_MB=1024` | Prevents OOM on loaded models |
| **Auto Unload** | `AUTO_UNLOAD_AFTER_JOB=true` | Frees VRAM between jobs |

### 3.2 API Performance

| Optimization | Mechanism | Impact |
|---|---|---|
| **Request Timing** | `X-Process-Time` response header on every request | Latency visibility |
| **Connection Reuse** | Frontend uses axios singleton (`services/apiClient.ts`) | Eliminates per-request overhead |
| **SSE Streaming** | Server-Sent Events for generation progress | Real-time feedback without polling |

---

## 4. Multi-Format Asset Packaging & Delivery

The production export endpoint (`POST /api/v1/project/export`) packages generated assets:

| Format | Target Software / Engine | PBR Support |
|---|---|---|
| **GLB** | WebGL, Three.js, Godot 4 | Complete PBR (Roughness/Metallic) |
| **GLTF** | WebGL, Three.js | Complete PBR |
| **FBX** | Unreal Engine 5, Unity | Skeletal Rig + Materials |
| **OBJ** | Wavefront, ZBrush | Geometry + MTL |
| **STL** | 3D Printing, CAD | Pure Surface Geometry |
| **PLY** | Point Clouds, MeshLab | Vertex Coordinates & Colors |

Production ZIP bundles:
```
Project_Export_<job_id>.zip
├── Source/
│   └── source.glb              # Original byte-for-byte neural output
├── GameReady/
│   └── game_ready.glb          # Engine-compliant decimated mesh
├── LODs/
│   ├── lod0.glb                # 100% triangles (Master baseline)
│   ├── lod1.glb                # 50% triangles (Mid distance)
│   ├── lod2.glb                # 25% triangles (Long distance)
│   └── lod3.glb                # 12.5% triangles (Proxy geometry)
├── Collision/
│   └── collision.glb           # Watertight physics convex hull
└── QA/
    └── quality_report.json     # Topology validation score (0-100)
```

---

## 5. Deployment Modes

### Single-Worker (Default)

```bash
cd backend
uvicorn api.main_singleworker:app --workers 1 --port 8000
```

- Embedded VRAM-aware scheduler
- No external broker required
- Best for single-GPU and CPU deployments

### Multi-Worker (Redis Queue)

```bash
# Terminal 1: Start Redis
redis-server

# Terminal 2: Start scheduler service
python backend/scripts/scheduler_service.py

# Terminal 3: Start API workers
cd backend
uvicorn api.main_multiworker:app --workers 4 --port 8000
```

- Redis-backed job queue (`RedisJobQueue`)
- Multiple uvicorn workers
- Redis FileStore for cross-worker metadata sharing
- Optional Redis-based authentication (`P3D_USER_AUTH_ENABLED=true`)

---

## 6. Verification Matrix & Health Check

Automated self-check command:
```bash
python3 backend/tests/test_backend_e2e.py
```

Expected output:
```
Running AI Studio Backend E2E Validation...
[PASS] Configuration check
[PASS] Database CRUD check
[PASS] Scheduler check
[PASS] Model registry check
[PASS] File upload check
All backend checks PASSED successfully!
```

Quick health check:
```bash
curl -s http://localhost:8000/health | jq .
# {"status": "healthy", "timestamp": ..., "version": "1.0.0"}
```
