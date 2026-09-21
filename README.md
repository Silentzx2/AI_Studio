<!-- ===================== HERO BANNER ===================== -->

<p align="center">
  <img src="https://i.postimg.cc/2ScFBzgs/file-000000006864720bb59405440766bb68-2.jpg" alt="AI 3D Studio Banner" width="100%">
</p>

<h1 align="center">
    AI 3D Studio
</h1>

<p align="center">
  <strong>Production-Grade AI 3D Generation, Optimization & Game-Ready Asset Pipeline</strong><br>
  Neural Reconstruction • Safe Post-Processing • Multi-Tier LODs • Physics Colliders • Automated QA • Multi-Format Export
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-0.1.0-8A2BE2?style=for-the-badge" alt="Version 0.1.0">
  <img src="https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Frontend-Next.js_16-000000?style=for-the-badge&logo=nextdotjs" alt="Next.js 16">
  <img src="https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.12+">
  <img src="https://img.shields.io/badge/Stack-Bun-FF0000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License MIT">
</p>

---

<p align="center">
  <strong>⭐ Star this repo if you find it useful!</strong>
</p>

---

## 📖 Table of Contents

- [⚡ Overview](#-overview)
- [🏗️ System Architecture](#️-system-architecture)
- [🤖 Supported Model Catalog](#-supported-model-catalog)
- [🛠️ Technology Stack](#️-technology-stack)
- [📦 Installation & Quick Start](#-installation--quick-start)
  - [Prerequisites](#prerequisites)
  - [Automated Setup](#automated-setup)
  - [Access Points](#access-points)
  - [Manual Development Setup](#manual-development-setup)
- [⚙️ Configuration](#️-configuration)
- [🎮 Application Usage](#-application-usage)
- [🔌 API Endpoints Reference](#-api-endpoints-reference)
- [🛠️ Development & Testing](#️-development--testing)
- [📁 Project Structure](#-project-structure)
- [🔧 Troubleshooting](#-troubleshooting)
- [🔐 Security](#-security)
- [📚 Documentation Index](#-documentation-index)
- [📄 License](#-license)

---

## ⚡ Overview

**AI 3D Studio** is an open-source generative 3D asset factory. It bridges state-of-the-art neural shape and texture synthesis models (**Hunyuan3D-2.1**, **TRELLIS**, **PartPacker**, **UltraShape**, **PartField**, **FastMesh**, **VoxHammer**) with a non-destructive production pipeline that preserves raw master geometry while generating engine-compliant game assets with automated Level-of-Detail (LOD) cascades, physics collision hulls, and objective QA validation scores.

### Key Highlights
- **FastAPI Backend**: High-throughput REST API with VRAM-aware multiprocess scheduler and optional Redis multi-worker queue.
- **Master Asset Preservation**: Always archives the original byte-for-byte neural output (`source.glb`) alongside optimized game meshes.
- **Automated LOD Generation**: Generates LOD0 (100%), LOD1 (50%), LOD2 (25%), and LOD3 (12.5%) variants with UV and material preservation.
- **Convex Hull Physics Colliders**: Produces watertight simplified collision geometry for immediate game engine physics.
- **Objective QA Diagnostic Engine**: Analyzes non-manifold edges, UV overlap, component counts, and poly budgets with a composite 0–100 score.
- **Modular Game-Ready Export**: One-click download of structured ZIP packages formatted for Unreal Engine 5, Unity, and Godot 4.

---

## 🏗️ System Architecture

```mermaid
flowchart TB
    classDef client fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#fff,rounded-8
    classDef gateway fill:#0f172a,stroke:#8b5cf6,stroke-width:2px,color:#fff,rounded-8
    classDef scheduler fill:#1e293b,stroke:#f97316,stroke-width:2px,color:#fff,rounded-8
    classDef adapters fill:#0f172a,stroke:#10b981,stroke-width:2px,color:#fff,rounded-8
    classDef storage fill:#1e293b,stroke:#64748b,stroke-width:2px,color:#fff,rounded-8
    classDef queue fill:#0f172a,stroke:#ec4899,stroke-width:2px,color:#fff,rounded-8

    subgraph Client["Next.js 16 Frontend 🌐 :3000"]
        UI["Interactive UI<br/>React 19 + Three.js"]
        STATE["Zustand Global State"]
        QUERY["TanStack Query"]
        RADIX["Radix UI"]
        MOTION["Framer Motion"]
    end

    subgraph Gateway["FastAPI Gateway 🌐 :8000"]
        ROUTERS["API Routers<br/>/v1/system /v1/generation<br/>/v1/mesh-* /v1/users"]
        AUTH["CORS · Auth<br/>Rate Limiting"]
        SCHED["VRAM-Aware Scheduler"]
    end

    subgraph S["VRAM-Aware Scheduler"]
        GPU_LOCK["GPU Mutual Exclusion"]
        MONITOR["GPU Monitoring<br/>VRAM / Temp"]
        SAFETY["VRAM Safety Buffer<br/>1GB Free Margin"]
        AUTO_UNLOAD["Auto-Unload After Job"]
    end

    subgraph Adapters["Model Adapters"]
        TRELLIS["TRELLIS<br/>FlexiCubes PBR"]
        HUNY["Hunyuan3D-2.1<br/>DiT + Paint"]
        PP["PartPacker<br/>Rectified Flow"]
        US["UltraShape<br/>Arbitrary Topology"]
        PF["PartField<br/>Segmentation"]
        UR["UniRig<br/>Auto-Rigging"]
        FM["FastMesh<br/>Retopology"]
        VH["VoxHammer<br/>Mesh Editing"]
    end

    subgraph Storage["Persistent Storage"]
        SRC["source.glb<br/>Untouched Master"]
        GAME["game_ready.glb<br/>Engine-Optimized"]
        L0["LOD0 (100%)"]
        L1["LOD1 (50%)"]
        L2["LOD2 (25%)"]
        L3["LOD3 (12.5%)"]
        COL["collision.glb<br/>Convex Hull"]
        QA["quality_report.json<br/>QA 0-100"]
    end

    Client -- "REST / SSE / WS" --> Gateway
    Gateway --> AUTH
    Gateway --> SCHED
    SCHED --> GPU_LOCK
    SCHED --> MONITOR
    SCHED --> SAFETY
    SCHED --> AUTO_UNLOAD
    Gateway --> ROUTERS
    ROUTERS --> Adapters
    Adapters -- "Raw Mesh Output" --> Storage
    Storage -- "Static Delivery" --> Gateway

    style Client fill:#1e293b,stroke:#3b82f6
    style Gateway fill:#0f172a,stroke:#8b5cf6
    style S fill:#1e293b,stroke:#f97316
    style Adapters fill:#0f172a,stroke:#10b981
    style Storage fill:#1e293b,stroke:#64748b
```

**Two Deployment Modes**:
- **Single-Worker**: Embedded async scheduler, no external broker. Best for single-GPU and CPU.
- **Multi-Worker**: Redis-backed job queue, multiple uvicorn workers, external scheduler service.

### Generation Workflow

```mermaid
flowchart LR
    classDef input fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#fff,rounded-8
    classDef process fill:#0f172a,stroke:#8b5cf6,stroke-width:2px,color:#fff,rounded-8
    classDef output fill:#1e293b,stroke:#10b981,stroke-width:2px,color:#fff,rounded-8
    classDef check fill:#0f172a,stroke:#f59e0b,stroke-width:2px,color:#fff,rounded-8

    IN["User Input<br/>Prompt / Reference Image<br/>Target Platform Budget"]:::input --> GEN["Neural Generation<br/>TRELLIS / Hunyuan3D /<br/>PartPacker / UltraShape"]:::process
    GEN --> SRC["source.glb<br/>Untouched Master<br/>Byte-for-Byte Archive"]:::output
    SRC --> OPT["Post-Processing<br/>meshoptimizer Decimation<br/>xatlas UV Unwrapping<br/>Texture Projection Baking"]:::process
    OPT --> GUARD{"Safe Component Guard<br/>Preserve Anatomical Features<br/>≥0.5% Verts or ≥15 Verts"}:::check
    GUARD -->|Keep| GAME["game_ready.glb<br/>Engine-Optimized Mesh"]:::output
    GUARD -->|Prune| GAME
    GAME --> LOD["Multi-Tier LOD Cascade<br/>LOD0 100% · LOD1 50%<br/>LOD2 25% · LOD3 12.5%"]:::process
    GAME --> COL["collision.glb<br/>Convex Hull Physics Mesh"]:::output
    GAME --> QA{"Geometry QA Diagnostics<br/>Manifoldness · Normals · UVs<br/>Component Count · Polycount"}:::check
    QA --> SCORE["quality_report.json<br/>Game-Ready Score 0-100"]:::output
    GAME --> EXP["Production Export<br/>GLB / GLTF / FBX / OBJ / STL / PLY"]:::process
    SRC --> EXP
    LOD --> EXP
    COL --> EXP
    SCORE --> EXP
    EXP --> ZIP["Structured Production ZIP<br/>Source/ + GameReady/ + LODs/<br/>Collision/ + QA/"]:::output
```

---

## 🤖 Supported Model Catalog

| Model | Category | VRAM | Speed | Key Capabilities |
|---|---|---|---|---|
| **Hunyuan3D-2.1** | Shape + Texture | 8–16 GB | ~90s | High-fidelity shape generation, multi-view paint diffusion |
| **TRELLIS** | Structured 3D | 11.5 GB | ~60s | FlexiCubes PBR meshes, 2048x2048 textures |
| **TRELLIS.2** | Structured 3D | 23 GB | ~60s | Higher-fidelity FlexiCubes with PBR |
| **PartPacker** | Image-to-Mesh | 10 GB | ~60s | Rectified-flow shape generation |
| **UltraShape** | Image-to-Mesh | 26.6 GB | ~30s | Arbitrary-topology mesh reconstruction |
| **PartField** | Segmentation | 4 GB | ~15s | Mesh segmentation into semantic parts |
| **P3-SAM** | Segmentation | 60 GB | ~15s | High-precision 3D SAM segmentation |
| **UniRig** | Auto-Rigging | 9 GB | ~20s | Automated bipedal armature generation |
| **FastMesh-V1K** | Retopology | 16 GB | ~30s | Retopology, decimation, manifold cleanup |
| **FastMesh-V4K** | Retopology | 24.5 GB | ~30s | High-resolution retopology |
| **VoxHammer** | Mesh Editing | 40 GB | ~20s | Local mesh editing with text/image prompts |

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend Framework** | Next.js 16 (App Router), React 19, TypeScript | Reactive web application |
| **UI Components** | Tailwind CSS v4, Radix UI, Lucide Icons | Dark Tripo-style interface |
| **State Management** | Zustand | Real-time global client state |
| **Data Fetching** | TanStack Query (React Query) | Server-state caching & synchronization |
| **3D Rendering** | Three.js, React Three Fiber | WebGL model inspection, lighting, wireframe |
| **Backend Framework** | FastAPI, Python 3.12+, Pydantic V2 | High-throughput async REST API |
| **Scheduler** | VRAM-aware multiprocess scheduler | GPU mutual exclusion, job queuing |
| **Queue/Broker** | Redis 7 (multi-worker mode) | Distributed job queue |
| **Database** | PostgreSQL 16 (optional) | Jobs & asset metadata |
| **File Storage** | Local filesystem + Redis FileStore | Upload metadata, cross-worker sharing |
| **Package Manager** | Bun | Frontend dependencies |
| **Python PM** | uv | Backend virtual environment |

---

## 📦 Installation & Quick Start

### Prerequisites

- **OS**: Linux (Ubuntu 20.04, 22.04, or 24.04 recommended)
- **GPU**: NVIDIA GPU with CUDA compute capability (or CPU mode with auto-fallback)
- **Package Manager**: Bun (`npm install -g bun`)
- **Disk Space**: 50 GB free disk space
- **System Memory**: 16 GB+ RAM (8 GB minimum)

### Automated Setup

```bash
# 1. Clone repository
git clone https://github.com/Silentzx2/AI_Studio.git
cd AI_Studio

# 2. Make scripts executable
chmod +x scripts/*.sh manager.sh

# 3. Run automated setup
./scripts/setup.sh

# 4. Start all services
./scripts/start.sh
```

The setup script installs:
- System dependencies (CUDA 12.4 toolkit, system libs)
- Python 3.12 + uv + PyTorch (GPU or CPU wheels)
- Backend Python dependencies (from `backend/requirements.txt`)
- Node.js 20 + Bun
- Optional: Blender (for post-processing)
- Optional: PostgreSQL 16 + Redis 7

### Access Points

| Service | Address | Port | Description |
|---|---|---|---|
| **Frontend Workspace** | `http://localhost:3000` | 3000 | Interactive generation and 3D viewport |
| **Backend REST API** | `http://localhost:8000` | 8000 | FastAPI application gateway |
| **Interactive API Docs** | `http://localhost:8000/docs` | 8000 | Swagger UI with test sandbox |
| **Health Check** | `http://localhost:8000/health` | 8000 | Service health status |

### Manual Development Setup

```bash
# Terminal 1 - Backend API
cd backend
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
uvicorn api.main_singleworker:app --reload --port 8000

# Terminal 2 - Frontend
bun install
bun run dev
```

---

## ⚙️ Configuration

Copy the example configuration file to create your local `.env`:

```bash
cp .env.example .env
```

### Key Environment Variables

```env
# ===== APPLICATION =====
ENVIRONMENT=development
DEBUG=true
APP_NAME=AI 3D Studio API
APP_VERSION=3.9.4

# ===== BACKEND =====
BACKEND_URL=http://localhost:8000
DATABASE_URL=postgresql+asyncpg://ai_studio:ai_studio_dev@127.0.0.1:5432/ai_studio
REDIS_URL=redis://localhost:6379/0

# ===== GPU / CUDA =====
CUDA_DEVICE=auto
MAX_VRAM_MB=0        # 0 = auto-detect
VRAM_SAFETY_MARGIN_MB=1024
AUTO_UNLOAD_AFTER_JOB=true

# ===== STORAGE =====
STORAGE_LOCAL_PATH=./backend/storage
DOWNLOAD_CHUNK_SIZE_MB=5
DOWNLOAD_MAX_RETRIES=3

# ===== API =====
API_V1_PREFIX=/api/v1
CORS_ORIGINS=["http://localhost:3000"]
P3D_USER_AUTH_ENABLED=false
```

---

## 🎮 Application Usage

### Workspaces

| Workspace | Route | Purpose | Compatible Models |
|---|---|---|---|
| **Generate** | `/workspace` | Primary shape generation from text or image | TRELLIS, Hunyuan3D, PartPacker, UltraShape |
| **Texture** | `/workspace/texture` | PBR material synthesis, multi-view paint projection | TRELLIS, Hunyuan3D |
| **Remesh** | `/workspace/remesh` | Retopology, decimation, manifold cleanup | FastMesh-V1K, FastMesh-V4K |
| **Edit** | `/workspace/edit` | Local mesh editing with VoxHammer | VoxHammer |
| **Upscale** | `/workspace/upscale` | Mesh upscaling | PartField |
| **PBR** | `/workspace/pbr` | PBR processing | TRELLIS |
| **Animation** | `/animation` | Auto-rigging + motion generation | UniRig |
| **Segment** | `/workspace/segment` | Mesh segmentation | PartField, P3-SAM |
| **Dashboard** | `/` / `/dashboard` | Overview & asset browser | — |
| **System** | `/system` | Telemetry & diagnostics | — |
| **Admin** | `/admin` | Settings & model manager | — |

### Basic Workflow

1. **Navigate to Workspace**: Open `http://localhost:3000` → choose a workspace tab.
2. **Select Input Mode**: Choose **Image-to-3D** or **Text-to-3D**.
3. **Upload Image or Enter Prompt**: Provide a clean reference image or text description.
4. **Choose Target Platform Budget**: Mobile (18k tris), Low (28k), Medium (45k), High (85k), Cinematic (180k).
5. **Toggle Pipeline Options**:
   - Enable **Multi-Tier LODs** to generate LOD0–LOD3.
   - Enable **Physics Collision** to build a convex hull collider.
6. **Click Generate**: Real-time progress updates via SSE/WebSocket.
7. **Inspect in 3D Viewport**: Orbit, pan, zoom, inspect wireframe mode, toggle lighting.
8. **Export Production ZIP**: Click **Export** to package master source, game mesh, LODs, collider, and QA reports.

---

## 🔌 API Endpoints Reference

### System & Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check with timestamp and version |
| `GET` | `/api/v1/system/health` | System health check |
| `GET` | `/api/v1/system/info` | Host hardware specs, OS, RAM, GPU telemetry |
| `GET` | `/api/v1/system/auth-status` | Authentication mode status |

### File Upload

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/file-upload/image` | Upload image for generation |
| `POST` | `/api/v1/file-upload/mesh` | Upload mesh for editing/segmentation |
| `GET` | `/api/v1/file-upload/{file_id}` | Get file metadata |
| `DELETE` | `/api/v1/file-upload/{file_id}` | Delete uploaded file |

### Mesh Generation

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/mesh-generation/text-to-raw-mesh` | Generate mesh from text prompt |
| `POST` | `/api/v1/mesh-generation/text-to-textured-mesh` | Generate textured mesh from text |
| `POST` | `/api/v1/mesh-generation/image-to-raw-mesh` | Generate mesh from image |
| `POST` | `/api/v1/mesh-generation/image-to-textured-mesh` | Generate textured mesh from image |
| `POST` | `/api/v1/mesh-generation/text-mesh-painting` | Paint textures on existing mesh |
| `POST` | `/api/v1/mesh-generation/image-mesh-painting` | Paint textures from image reference |
| `GET` | `/api/v1/mesh-generation/status/{job_id}` | Query job progress |
| `POST` | `/api/v1/mesh-generation/cancel/{job_id}` | Cancel active job |
| `POST` | `/api/v1/mesh-generation/cost-estimate` | Estimate VRAM and execution time |

### Mesh Editing

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/mesh-editing/text-edit` | Edit mesh with text prompt |
| `POST` | `/api/v1/mesh-editing/image-edit` | Edit mesh with image reference |

### Auto Rigging

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auto-rigging` | Generate bipedal armature for mesh |

### Mesh Segmentation

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/mesh-segmentation` | Segment mesh into semantic parts |

### Mesh Retopology

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/mesh-retopology` | Retopologize mesh to target density |

### Mesh UV Unwrapping

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/mesh-uv-unwrapping` | Unwrap mesh UVs |

### Users (Multi-Worker Mode)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/users/register` | Register new user |
| `POST` | `/api/v1/users/login` | Authenticate user |
| `GET` | `/api/v1/users/me` | Get current user profile |

---

## 🛠️ Development & Testing

### Running Tests

```bash
# Verify health endpoint
curl -s http://localhost:8000/health | jq .

# Check runtime options
curl -s http://localhost:8000/api/v1/runtime/options | jq .

# Verify frontend TypeScript types
npx tsc --noEmit

# Test production frontend build
bun run build
```

### Project Structure

```
AI_Studio/
├── app/                               # Next.js 16 App Router
│   ├── layout.tsx                     # Root layout
│   ├── page.tsx                       # Landing → WorkspaceShell
│   ├── workspace/page.tsx             # Workspace home
│   ├── animation/page.tsx             # Animation studio
│   ├── admin/page.tsx                 # Admin dashboard
│   └── api/                           # API proxy routes
│
├── features/                          # Feature modules
│   ├── workspace/                     # Main workspace shell & panels
│   ├── admin/                         # System monitoring & diagnostics
│   └── settings/                      # Settings & model manager
│
├── components/                        # Shared UI component library
├── hooks/                             # React hooks (telemetry, tasks)
├── services/                          # Shared service layer
│   └── apiClient.ts                   # Unified FastAPI REST client
├── stores/                            # Zustand stores
├── types/                             # TypeScript type definitions
│
├── backend/                           # FastAPI Python backend
│   ├── api/
│   │   ├── main_singleworker.py       # Single-worker entry point
│   │   ├── main_multiworker.py        # Multi-worker entry point
│   │   └── routers/                   # API route controllers
│   │       ├── system.py
│   │       ├── file_upload.py
│   │       ├── mesh_generation.py
│   │       ├── mesh_editing.py
│   │       ├── auto_rigging.py
│   │       ├── mesh_segmentation.py
│   │       ├── mesh_retopology.py
│   │       ├── mesh_uv_unwrapping.py
│   │       └── users.py
│   ├── core/
│   │   ├── config.py                  # Pydantic + YAML settings
│   │   ├── file_store.py              # Redis/local file metadata
│   │   ├── scheduler/                 # VRAM-aware scheduler
│   │   ├── auth/                      # Authentication service
│   │   └── utils/                     # File utils, exceptions
│   ├── adapters/                      # Model adapters (TRELLIS, etc.)
│   ├── config/                        # YAML configs (system.yaml, models.yaml)
│   ├── scripts/                       # Scheduler service, utilities
│   ├── pyproject.toml
│   └── requirements.txt
│
├── scripts/                           # System orchestration
│   ├── setup.sh                       # Full system setup
│   ├── start.sh / stop.sh / restart.sh
│   ├── install_comfyui.sh            # ComfyUI engine installer
│   └── colab.sh                      # Colab launcher
│
├── Docs/                              # Technical documentation
├── README.md                          # This file
├── .env.example                       # Environment template
└── package.json                       # Frontend metadata (v0.1.0)
```

> **Unified API Client**: The frontend uses a single `services/apiClient.ts` for all FastAPI communication. All feature modules import directly from this client.

---

## 🔧 Troubleshooting

### 1. GPU / CUDA Detection
```bash
nvidia-smi
# If no GPU is available, the system falls back to CPU mode (slower).
```

### 2. Port Already in Use (3000, 8000, or 8188)
```bash
bash scripts/stop.sh
# Or force free specific ports:
lsof -ti :3000 | xargs -r kill -9
lsof -ti :8000 | xargs -r kill -9
```

### 3. Out of Memory (CUDA OOM)
- The VRAM-aware scheduler prevents multi-provider GPU OOM via strict mutual exclusion.
- For low-VRAM GPUs (≤8GB), use lighter models (e.g., TRELLIS at 11.5GB or PartPacker at 10GB).

### 4. Checking Service Logs
```bash
tail -f logs/app.log
```

---

## 🔐 Security

- **Safe Subprocess Execution**: Strict command allowlists prevent shell injection.
- **Path Traversal Protection**: Export and storage paths are strictly bounded to asset directories.
- **Resource Limiting**: Redis-backed sliding-window rate limiting protects API endpoints.
- **Auth Mode**: `P3D_USER_AUTH_ENABLED=false` runs in simple mode (no isolation); set to `true` for per-user job isolation.

---

## 📚 Documentation Index

- [Product Vision & Architectural North Star](file:///teamspace/studios/this_studio/AI_Studio/Docs/PRODUCT_VISION.md)
- [3D Quality Pipeline Specification](file:///teamspace/studios/this_studio/AI_Studio/Docs/3D_QUALITY_PIPELINE.md)
- [Game-Ready Asset Specification](file:///teamspace/studios/this_studio/AI_Studio/Docs/GAME_READY_SPEC.md)
- [Quality Benchmark & Verification](file:///teamspace/studios/this_studio/AI_Studio/Docs/QUALITY_BENCHMARK.md)
- [Complete System Architecture & Blueprint](file:///teamspace/studios/this_studio/AI_Studio/Docs/SYSTEM-BLUEPRINT.md)
- [Architecture & Storage Guide](file:///teamspace/studios/this_studio/AI_Studio/Docs/architecture.md)
- [Complete REST API Documentation](file:///teamspace/studios/this_studio/AI_Studio/Docs/api-documentation.md)
- [Pipeline Status & Changelog](file:///teamspace/studios/this_studio/AI_Studio/Docs/pipeline-status.md)
- [Developer & Testing Guide](file:///teamspace/studios/this_studio/AI_Studio/Docs/developer-guide.md)
- [Setup & Deployment Guide](file:///teamspace/studios/this_studio/AI_Studio/Docs/setup-guide.md)

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](file:///teamspace/studios/this_studio/AI_Studio/LICENSE) file for details.