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
  <img src="https://img.shields.io/badge/Version-5.0.18-8A2BE2?style=for-the-badge" alt="Version 5.0.18">
  <img src="https://img.shields.io/badge/Pipeline-Game--Ready_V2-00FF9D?style=for-the-badge" alt="Game-Ready V2">
  <img src="https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.12+">
  <img src="https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Next.js-16.x-Frontend-000000?style=for-the-badge&logo=nextdotjs" alt="Next.js 16">
  <img src="https://img.shields.io/badge/Blender-4.x_Headless-F5792A?style=for-the-badge&logo=blender&logoColor=white" alt="Blender 4.x">
  <img src="https://img.shields.io/badge/Linux-Ubuntu-E95420?style=for-the-badge&logo=ubuntu&logoColor=white" alt="Ubuntu">
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
- [🔄 3D Quality Pipeline Workflow](#-3d-quality-pipeline-workflow)
- [🎯 Target Platform Polygon Budgets](#-target-platform-polygon-budgets)
- [📈 Multi-Tier Level of Detail (LOD) Cascade](#-multi-tier-level-of-detail-lod-cascade)
- [📊 Automated QA Validation Rubric](#-automated-qa-validation-rubric)
- [📦 Structured Export Archive](#-structured-export-archive)
- [🚀 Features & Capabilities](#-features--capabilities)
- [🆕 What's New in V2](#-whats-new-in-v2)
- [🤖 Supported Model Catalog](#-supported-model-catalog)
- [🛠️ Technology Stack](#️-technology-stack)
- [📦 Installation & Quick Start](#-installation--quick-start)
  - [Prerequisites](#prerequisites)
  - [Native Two-Stage Setup](#native-two-stage-setup)
  - [Google Colab 1-Click Launch](#google-colab-1-click-launch)
  - [Access Points](#access-points)
  - [Manual Development Setup](#manual-development-setup)
- [⚙️ Configuration](#️-configuration)
- [🎮 Application Usage](#-application-usage)
  - [Basic Workflow](#basic-workflow)
  - [Workspace Features](#workspace-features)
  - [Supported Workspaces](#supported-workspaces)
  - [Texture Generation Workflow](#texture-generation-workflow)
  - [Model Manager Interface](#model-manager-interface)
  - [Admin & Monitoring Dashboard](#admin--monitoring-dashboard)
- [🔌 API Endpoints Reference](#-api-endpoints-reference)
- [🛠️ Development & Testing](#️-development--testing)
- [📁 Project Structure](#-project-structure)
- [🔧 Troubleshooting](#-troubleshooting)
- [📊 Pipeline Status](#-pipeline-status)
- [🔐 Security](#-security)
- [📚 Documentation Index](#-documentation-index)
- [📄 License](#-license)

---

## ⚡ Overview

**AI 3D Studio** is an open-source generative 3D asset factory. It bridges state-of-the-art neural shape and texture synthesis models (**Hunyuan3D-2.1**, **Hunyuan3D-2 Mini**, **TRELLIS**, **TripoSG**, **DetailGen3D**) with a non-destructive production pipeline that preserves raw master geometry while generating engine-compliant game assets with automated Level-of-Detail (LOD) cascades, physics collision hulls, and objective QA validation scores.

### Key Highlights
- **Two-Stage Runtime Engine**: Decouples dependency/venv preparation from gigabyte-scale weight downloads.
- **Master Asset Preservation**: Always archives the original byte-for-byte neural output (`source.glb`) alongside optimized game meshes.
- **Automated LOD Generation**: Generates LOD0 (100%), LOD1 (50%), LOD2 (25%), and LOD3 (12.5%) variants with UV and material preservation.
- **Convex Hull Physics Colliders**: Produces watertight simplified collision geometry for immediate game engine physics.
- **Objective QA Diagnostic Engine**: Analyzes non-manifold edges, UV overlap, component counts, and poly budgets with a composite 0–100 score.
- **Modular Game-Ready Export**: One-click download of structured ZIP packages formatted for Unreal Engine 5, Unity, and Godot 4.

---

## 🏗️ System Architecture

```mermaid
graph TB
    subgraph Client["Presentation & Workspace (Next.js 16 + Three.js)"]
        UI_VIEW["Interactive 3D Viewport<br/>(WebGL / OrbitControls / Matcaps)"]
        UI_GEN["Generate Panel<br/>(Platform Budgets & LOD Cascade)"]
        UI_EXP["Export Engine Modal<br/>(Variants, Conversions & ZIP Packaging)"]
        UI_MODELS["AI Models & Pipeline Telemetry"]
    end

    subgraph API["Backend Gateway (FastAPI 0.115 / AsyncIO)"]
        ROUTER_GEN["/api/v1/generation"]
        ROUTER_EXP["/api/v1/project/export"]
        ROUTER_MODELS["/api/v1/models"]
        ROUTER_SYS["/api/v1/system"]
        WS_STREAM["WS & SSE Telemetry Streams"]
        CACHE["In-Memory TTL & LRU Caches"]
    end

    subgraph Queue["Asynchronous Task Broker"]
        REDIS[("Redis :6379<br/>Task Queue & Locks")]
        CELERY["Celery Workers<br/>(Concurrency & GPU Slots)"]
    end

    subgraph Runtime["Runtime Engine & Provider Isolation"]
        SCHED["GPU Scheduler<br/>(Mutual Exclusion Slot)"]
        VRAM["VRAM Tracker & Low-VRAM Offload"]
        ENV["Dynamic ModelEnv Site-Packages Bridge"]
    end

    subgraph Providers["Generative AI Models"]
        HY21["Hunyuan3D-2.1 (Shape + Paint)"]
        HYMINI["Hunyuan3D-2 Mini (Fast DiT)"]
        TREL["TRELLIS (FlexiCubes PBR)"]
        TSG["TripoSG (Isosurface)"]
        DG["DetailGen3D (Refinement)"]
    end

    subgraph Pipeline["3D Quality Pipeline & Post-Processing"]
        BLENDER["Headless Blender 4.x<br/>(Safe Component Retention & UV Guard)"]
        OPT["Mesh Optimizer<br/>(Target Decimation & LOD0–LOD3)"]
        COL["Physics Collision<br/>(Convex Hull Generator)"]
        QA["QA Diagnostics<br/>(Topology & 0–100 Scoring)"]
    end

    subgraph Output["Production Asset Delivery"]
        MASTER["source.glb (Untouched Master)"]
        GAME["game_ready.glb (Engine Optimized)"]
        LODS["lods/lod0..3.glb (LOD Cascade)"]
        HULL["collision.glb (Physics Collider)"]
        ZIP["Structured ZIP Package"]
    end

    Client <==>|REST / SSE / WS| API
    API --> REDIS
    REDIS --> CELERY
    CELERY --> Runtime
    Runtime --> Providers
    Providers --> Pipeline
    Pipeline --> Output
    Output --> Client
```

---

## 🔄 3D Quality Pipeline Workflow

```mermaid
flowchart TD
    classDef stage fill:#1e1e24,stroke:#6366f1,stroke-width:2px,color:#fff;
    classDef file fill:#18181b,stroke:#22c55e,stroke-width:1.5px,color:#fff;
    classDef guard fill:#18181b,stroke:#f59e0b,stroke-width:1.5px,color:#fff;

    IN[Input Image / Prompt] --> P1[1. Preprocessing & Background Separation<br/>• Transparent alpha detection<br/>• RemBG / BriaRMBG silhouette extraction]:::stage
    
    P1 --> P2[2. Neural Provider Inference<br/>• Hunyuan3D / TRELLIS / TripoSG]:::stage
    
    P2 --> RAW[(source.glb<br/>Untouched Raw Master)]:::file

    P2 --> P3[3. Non-Destructive Blender Post-Processing]:::stage
    
    P3 --> G1{Safe Component Guard<br/>Islands ≥ 0.5% vertices or ≥ 15 verts?}:::guard
    G1 -->|Yes| KEEP[Preserve Ears, Horns, Tails & Accessories]
    G1 -->|No| PRUNE[Purge Floating Disconnected Noise]

    P3 --> G2{UV Layout Guard<br/>UV layers already exist?}:::guard
    G2 -->|Yes| UV_OK[Protect Provider UV Map & PBR Textures]
    G2 -->|No| UV_FIX[Run Smart UV Project]

    P3 --> G3{Humanoid Armature Guard<br/>Aspect Ratio ≥ 0.7 & Height ≥ 0.2?}:::guard
    G3 -->|Yes| RIG[Bind Rigify Biped Metarig]
    G3 -->|No| NORIG[Export Clean Unrigged Mesh]

    KEEP --> BASE[(model.glb<br/>Clean Baseline)]:::file
    UV_OK --> BASE
    UV_FIX --> BASE
    RIG --> BASE
    NORIG --> BASE

    BASE --> P4[4. Game-Ready Decimation<br/>• Target Platform Budgets]:::stage
    P4 --> G_OUT[(game_ready.glb<br/>Game-Ready Variant)]:::file

    BASE --> P5[5. Multi-Tier LOD Generation]:::stage
    P5 --> L0[(LOD0: 100% Master)]:::file
    P5 --> L1[(LOD1: 50% Polycount)]:::file
    P5 --> L2[(LOD2: 25% Polycount)]:::file
    P5 --> L3[(LOD3: 12.5% Polycount)]:::file

    BASE --> P6[6. Physics Collision Mesh]:::stage
    P6 --> C_OUT[(collision.glb<br/>Convex Hull)]:::file

    G_OUT --> P7[7. Geometry QA Diagnostics]:::stage
    P7 --> QA_OUT[(quality_report.json<br/>Score: 0–100)]:::file

    G_OUT --> P8[8. Production Export Endpoint<br/>• POST /api/v1/project/export]:::stage
    RAW --> P8
    L0 --> P8
    L1 --> P8
    L2 --> P8
    L3 --> P8
    C_OUT --> P8
    QA_OUT --> P8

    P8 --> ZIP[(Structured ZIP Package<br/>Source/ + GameReady/ + LODs/ + Collision/ + QA/)]:::file
```

---

## 🎯 Target Platform Polygon Budgets

Game-ready decimation adheres to standard engine polygon budgets:

| Platform | Target Polycount | Max Vertices | Draw Calls | Recommended Use Case |
|---|---|---|---|---|
| **Mobile** | ≤ 18,000 tris | ~10,000 | 1–2 | Mobile WebGL, iOS/Android games, XR headsets |
| **Low** | ≤ 28,000 tris | ~16,000 | 1–2 | Low-end PC, Nintendo Switch, background props |
| **Medium** | ≤ 45,000 tris | ~25,000 | 1–3 | Standard PC/Console games, hero props, web interactive |
| **High** | ≤ 85,000 tris | ~50,000 | 1–4 | High-end PC/Console hero characters, Unreal Engine 5 |
| **Cinematic** | ≤ 180,000 tris | ~100,000 | 1–5 | Pre-rendered cinematics, virtual production |

---

## 📈 Multi-Tier Level of Detail (LOD) Cascade

```mermaid
flowchart LR
    L0["<b>LOD0 (100%)</b><br/>Master Source<br/>Screen: > 50%"] -->|Decimate 50%| L1["<b>LOD1 (50%)</b><br/>Close Range<br/>Screen: 25% – 50%"]
    L1 -->|Decimate 50%| L2["<b>LOD2 (25%)</b><br/>Mid Range<br/>Screen: 10% – 25%"]
    L2 -->|Decimate 50%| L3["<b>LOD3 (12.5%)</b><br/>Distant Proxy<br/>Screen: < 10%"]
```

- **LOD0**: 100% original baseline triangles. Used for close-up hero rendering.
- **LOD1**: 50% of LOD0 polygon count. Preserves texture coordinates and visual silhouettes.
- **LOD2**: 25% of LOD0 polygon count. Ideal for medium camera distances.
- **LOD3**: 12.5% of LOD0 polygon count. Distant background proxy with minimal rendering overhead.

---

## 📊 Automated QA Validation Rubric

Every generated asset undergoes an objective topological evaluation producing a composite score:

```mermaid
pie title QA Score Weighting Distribution (100 Points Total)
    "Topology & Geometry Integrity" : 35
    "UV Mapping & Material Retention" : 35
    "Platform Polycount Budget" : 30
```

- **Topology & Geometry Integrity (35 pts)**: Base non-zero geometry (+15), normal winding consistency (+10), watertight manifoldness (+5), clean component count (+5).
- **UVs & Materials Retention (35 pts)**: Valid non-overlapping UV layout (+20), embedded PBR/Albedo texture map (+15).
- **Platform Budget Adherence (30 pts)**: Conformance to selected target polycount (≤ 1.0x budget: +30, 1.0–1.5x: +20, 1.5–2.5x: +10).

| Status | Score Range | Engine Compatibility |
|---|---|---|
| 🟢 **PASS** | 80 – 100 | Direct drag-and-drop ready for Unreal Engine 5, Unity, or Godot 4. |
| 🟡 **WARN** | 50 – 79 | Usable geometry with minor warnings (e.g., untextured mesh or slight budget overage). |
| 🔴 **FAIL** | < 50 | Geometry defects detected; requires re-generation or automated mesh repair. |

---

## 📦 Structured Export Archive

When exporting via `POST /api/v1/project/export` with `package_zip=true`, assets are organized into an engine-compliant archive:

```
Hero_Character.zip
├── Source/
│   └── source.glb            # Untouched raw neural output
├── GameReady/
│   └── Hero_Character.glb    # Platform-optimized engine asset
├── LODs/
│   ├── lod0.glb              # 100% master fidelity
│   ├── lod1.glb              # 50% decimation
│   ├── lod2.glb              # 25% decimation
│   └── lod3.glb              # 12.5% distant proxy
├── Collision/
│   └── collision.glb         # Lightweight convex hull collider
└── QA/
    └── quality_report.json   # Machine-readable diagnostics & QA scores
```

---

## 🚀 Features & Capabilities

### Complete Feature Matrix

| Feature | Description | Status | Version |
|---|---|---|---|
| **Image-to-3D** | High-fidelity neural mesh reconstruction from single image | ✅ | v1 |
| **Model Discovery** | Multi-source discovery across HuggingFace, ModelScope, CivitAI, NGC | ✅ | V2 |
| **Smart Download Engine** | Resumable chunked downloads with mirror fallback and checksums | ✅ | V2 |
| **Health Diagnostics** | Real-time GPU telemetry, disk space, and VRAM monitoring | ✅ | V2 |
| **Compatibility Pre-Check** | Hardware and dependency validation prior to installation | ✅ | V2 |
| **Two-Stage Runtime** | Decoupled runtime preparation (Stage A) & weight fetching (Stage B) | ✅ | V2 |
| **VRAM-Aware Scheduling** | Strict mutual exclusion locking prevents multi-provider GPU OOM | ✅ | v1 |
| **Workspace Filtering** | Model-to-workspace capability gating preventing invalid selection | ✅ | v3.3 |
| **Texture Pipeline** | PBR material synthesis with resolution, roughness, and metalness controls | ✅ | v3.3 |
| **3D Canvas Viewport** | Three.js WebGL viewport with environment lighting and matcap shaders | ✅ | v1 |
| **Component Pruning Guard** | Retention threshold (≥0.5% vertices) protects ears, horns, and tails | ✅ | v5.0.18 |
| **UV Protection Guard** | Non-destructive UV preservation prevents destroying neural textures | ✅ | v5.0.18 |
| **Humanoid Armature Guard** | Aspect-ratio bounding check gates Rigify armature binding | ✅ | v5.0.18 |
| **Multi-Tier LOD Cascade** | Automatic decimation producing LOD0–LOD3 cascade | ✅ | v5.0.18 |
| **Convex Hull Generation** | Watertight simplified collision mesh for physics simulation | ✅ | v5.0.18 |
| **Automated QA Scoring** | Topological scoring rubric (0–100) with pass/warn/fail thresholds | ✅ | v5.0.18 |
| **Structured ZIP Packaging** | Multi-variant zip packaging (`Source/`, `GameReady/`, `LODs/`, `Collision/`, `QA/`) | ✅ | v5.0.18 |
| **Realtime Telemetry** | WebSocket (`/ws`) & SSE (`/system/stream`) hardware monitoring | ✅ | v4.6.0 |
| **In-Memory Caching** | High-performance LRU cache layer (256 entries) with automatic invalidation | ✅ | v4.6.1 |
| **Security Hardening** | Subprocess command allowlists, safe path resolution, rate limiting | ✅ | v4.4.9 |

---

## 🆕 What's New in V2

### 1. Smart Download & Queue System
- **Parallel Chunking**: Multi-part streaming downloads for high-bandwidth model weights.
- **Resumption & Verification**: Byte-level resume with automated SHA256 and MD5 integrity verification.
- **Mirror Fallback**: Seamless fallback between HuggingFace, GitHub Releases, and ModelScope.
- **Queue Controls**: Pause, resume, cancel, and prioritize active downloads.

### 2. Compatibility & Health Monitoring
- **Pre-Installation Matrix**: Validates GPU VRAM, CUDA toolkit, Python version, RAM, and disk space.
- **Self-Healing Workers**: Background health checks detect corrupted environments and offer one-click repairs.
- **Benchmark Suite**: Records per-model inference duration, peak VRAM consumption, and throughput.

### 3. Non-Destructive 3D Pipeline
- **Raw Master Preservation**: Never overwrites raw neural outputs during post-processing.
- **Fail-Safe Fallbacks**: If decimation fails or exceeds budget, the system gracefully falls back to the clean baseline.

---

## 🤖 Supported Model Catalog

| Model | Category | Recommended VRAM | Speed | Key Capabilities |
|---|---|---|---|---|
| **Hunyuan3D-2.1** | 3D Shape & Texture | 16 GB (29 GB full) | ~90s | High-fidelity shape generation, multi-view neural paint diffusion |
| **Hunyuan3D-2 Mini** | Fast 3D Generation | 6 GB | ~45s | Lightweight DiT shape synthesis; separate repo, manifest, and venv |
| **TRELLIS** | Structured 3D | 16 GB (8 GB low-VRAM) | ~60s | High-resolution FlexiCubes meshes with native PBR materials |
| **TripoSG** | Fast Single-Image | 8 GB | ~60s | Rectified-flow shape generation, high-density vertex colors |
| **DetailGen3D** | Post-Processing | 4 GB | ~15s | Geometric refinement, surface micro-detail enhancement |

> **Google Colab Policy**: In testing environments (such as Google Colab), all models are installable regardless of declared VRAM footprint. VRAM numbers in manifests are advisory.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend Framework** | Next.js 16 (App Router), React 19, TypeScript | Reactive modern web application |
| **UI Components** | Tailwind CSS, Radix UI, Lucide Icons | Premium Tripo-style dark interface |
| **State Management** | Zustand | Real-time global client state |
| **3D Rendering** | Three.js, React Three Fiber | WebGL model inspection, lighting, wireframe views |
| **Backend Framework** | FastAPI 0.115, Python 3.12+, Pydantic V2 | High-throughput asynchronous REST API |
| **Task Queue** | Celery 5.4, Redis 7 | Distributed job execution and GPU concurrency control |
| **Database** | PostgreSQL 16 (Native) / SQLite (Colab) | Persistent job logs, settings, and metrics |
| **3D Quality Engine** | Blender 4.x (Headless), PyMeshLab, Trimesh | Retopology, decimation, collision hulls, QA scoring |
| **Package Management** | `uv` (Ultra-fast Python package resolver) | Per-provider virtual environment management |

---

## 📦 Installation & Quick Start

### Prerequisites

- **OS**: Linux (Ubuntu 20.04, 22.04, or 24.04 recommended)
- **GPU**: NVIDIA GPU with CUDA 12.1+ compute capability
- **Package Manager**: `uv` (installed automatically if missing)
- **Disk Space**: 50 GB free disk space
- **System Memory**: 16 GB+ RAM (8 GB minimum for Colab/testing)

### Native Two-Stage Setup

Model installation uses a **two-stage** decoupled pipeline:
- **Stage A — Runtime**: Clones repositories, creates per-model virtual environments, and installs torch and dependencies (no weight downloads).
- **Stage B — Weights**: Downloads model weights for prepared runtimes via the UI or API.

```bash
# 1. Clone repository
git clone https://github.com/Silentzx2/AI_Studio.git
cd AI_Studio

# 2. Make management scripts executable
chmod +x scripts/*.sh manager.sh

# 3. Execute Stage A (Runtime preparation: repos, venvs, dependencies; NO weights)
./scripts/setup.sh

# 4. Start all services (Backend, Frontend, Celery Worker, Redis)
./scripts/start.sh
```

After startup, download model weights via the **Settings → Model Manager** web UI or via the API:
```bash
curl -X POST http://localhost:8000/api/v1/runtime/download-weights \
  -H "Content-Type: application/json" \
  -d '{"providers": ["hunyuan3d-2-mini"]}'
```

### Google Colab 1-Click Launch

Open a Google Colab notebook with a GPU runtime (T4, V100, A100, or L4) and run:

```bash
!git clone https://github.com/Silentzx2/AI_Studio.git /content/AI_Studio
%cd /content/AI_Studio
!bash scripts/colab.sh
```

**What `colab.sh` does automatically:**
1. Detects the Colab environment and attaches GPU hardware.
2. Switches database to zero-config SQLite mode.
3. Installs backend dependencies via `uv` and links PyTorch CUDA.
4. Executes **Stage A** runtime environment preparation.
5. Launches FastAPI backend, Celery task broker, and Next.js frontend.
6. Starts a Cloudflare tunnel and displays a public URL for instant browser access.

### Access Points

| Service | Address | Default Port | Description |
|---|---|---|---|
| **Frontend Workspace** | `http://localhost:3000` | 3000 | Interactive generation and 3D viewport |
| **Backend REST API** | `http://localhost:8000` | 8000 | FastAPI application gateway |
| **Interactive API Docs** | `http://localhost:8000/docs` | 8000 | Swagger UI with test sandbox |
| **ReDoc Documentation** | `http://localhost:8000/redoc` | 8000 | Structured OpenAPI reference |
| **Model Manager** | `http://localhost:3000/settings` | 3000 | Model downloads, venvs, and health |
| **System Diagnostics** | `http://localhost:3000/settings?section=monitoring` | 3000 | Hardware telemetry and worker logs |

### Manual Development Setup

If you prefer running services manually across separate terminals:

```bash
# Terminal 1 - Backend API
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 - Celery Task Worker
cd backend
source .venv/bin/activate
celery -A app.workers.celery_app worker --loglevel=info

# Terminal 3 - Redis Broker
redis-server

# Terminal 4 - Frontend Development Server
npm run dev
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
APP_NAME=AI 3D Studio
APP_VERSION=5.0.18

# ===== DATABASE =====
DATABASE_URL=postgresql+asyncpg://ai_studio:ai_studio_dev@localhost:5432/ai_studio

# ===== REDIS & CELERY =====
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# ===== ACTIVE AI PROVIDER =====
AI_PROVIDER=hunyuan3d-2-mini
# Options: hunyuan3d-2.1, hunyuan3d-2-mini, trellis, triposg, detailgen3d, mock

# ===== HARDWARE & VRAM =====
CUDA_DEVICE=auto
MAX_VRAM_MB=0  # 0 = auto-detect

# ===== STORAGE PATHS =====
STORAGE_LOCAL_PATH=/teamspace/studios/this_studio/AI_Studio/backend/storage
MODELS_PATH=/teamspace/studios/this_studio/AI_Studio/backend/storage/models
DOWNLOAD_CHUNK_SIZE_MB=5
DOWNLOAD_MAX_RETRIES=3

# ===== API SETTINGS =====
API_V1_PREFIX=/api/v1
CORS_ORIGINS=["http://localhost:3000"]
```

---

## 🎮 Application Usage

### Basic Workflow

1. **Navigate to the Studio**: Open `http://localhost:3000` in your browser.
2. **Select Input Mode**: Choose **Image-to-3D** or **Text-to-3D**.
3. **Upload Image or Enter Prompt**: Provide a clean reference image (transparent PNG or clean background works best).
4. **Choose Target Platform Budget**: Select **Mobile** (18k tris), **Low** (28k tris), **Medium** (45k tris), **High** (85k tris), or **Cinematic** (180k tris).
5. **Toggle Pipeline Options**:
   - Enable **Multi-Tier LODs** to generate LOD0–LOD3.
   - Enable **Physics Collision** to build a convex hull collider.
6. **Click Generate**: Real-time progress updates stream through WebSocket/SSE.
7. **Inspect in 3D Viewport**: Orbit, pan, zoom, inspect wireframe mode, and toggle lighting.
8. **Export Production ZIP**: Click **Export** to package master source, game mesh, LODs, collider, and QA reports into a single download.

### Workspace Features

- **Tripo-Style UI**: Modern dark theme with compact typography and dedicated tool panels.
- **Hardware Telemetry**: Real-time status pills displaying GPU temperatures, VRAM allocation, and Celery queue length.
- **Model-to-Workspace Filtering**: The UI automatically filters models compatible with the active workspace tab.
- **Side-by-Side Comparison**: Compare raw source geometry against decimated game-ready variants.

### Supported Workspaces

| Workspace | Purpose | Compatible Models |
|---|---|---|
| **Mesh Generation** | Primary shape generation from text or image | Hunyuan3D-2.1, Hunyuan3D-2 Mini, TRELLIS, TripoSG |
| **Texture Generation** | PBR material synthesis, multi-view paint projection | Hunyuan3D-2.1, TRELLIS |
| **Rigging & Skinning** | Automated bipedal armature generation & skin weight binding | Blender Rigify Integration |
| **Remesh & Optimization** | Retopology, decimation, and manifold cleanup | Mesh Optimizer, DetailGen3D |
| **Post-Processing** | Second-pass geometry refinement and micro-detailing | DetailGen3D |

### Texture Generation Workflow

The dedicated **Texture Tab** (`/workspace/texture`) provides granular material control:
- **Resolution**: 512px (Draft), 1024px (Fast), 2048px (Balanced), 4096px (Ultra).
- **Style Presets**: Photorealistic PBR, Stylized Handpainted, Anime Cel-Shaded, Cyberpunk Neon.
- **PBR Sliders**: Metalness bias, Roughness bias, and Surface weathering controls.

### Model Manager Interface

Accessible via **Settings → AI Models**:
- **Installed Models**: Inspect installed providers, verify venv integrity, run health diagnostics, and uninstall models.
- **Available Models**: Browse remote repositories, check hardware compatibility, and trigger installation.
- **Download Queue**: Monitor download speeds, remaining bytes, and pause/resume active transfers.
- **Benchmarks**: Benchmark inference times and peak memory on your local GPU.

### Admin & Monitoring Dashboard

Located at `/settings?section=monitoring`:
- Real-time GPU telemetry (utilization, VRAM, thermal levels).
- Celery worker task queues and background worker logs.
- Interactive terminal for maintenance commands.

---

## 🔌 API Endpoints Reference

### 3D Generation & Quality Pipeline

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/generation` | Submit image/text-to-3D generation job with platform budgets and LOD flags |
| `GET` | `/api/v1/generation/{job_id}` | Query job progress, output paths, and QA score |
| `POST` | `/api/v1/project/export` | Export structured ZIP archive (`Source/`, `GameReady/`, `LODs/`, `Collision/`, `QA/`) |
| `POST` | `/api/v1/project/convert` | Convert GLB asset to OBJ, FBX, or STL format |

### Model Management & Runtime

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/runtime/prepare-runtime` | **Stage A**: Clone repos, build virtual environments, and install dependencies |
| `POST` | `/api/v1/runtime/download-weights` | **Stage B**: Download neural model weights for prepared runtimes |
| `GET` | `/api/v1/runtime/status` | Current GPU allocation, provider health, and VRAM telemetry |
| `GET` | `/api/v1/models/installed` | List all locally installed models and venv paths |
| `GET` | `/api/v1/models/available` | Browse models available across HuggingFace, ModelScope, CivitAI, and NGC |
| `POST` | `/api/v1/models/{id}/repair` | Trigger automated environment repair for damaged model packages |
| `POST` | `/api/v1/download/start` | Start resumable chunked model weight download |
| `GET` | `/api/v1/download/queue` | View active download queue status and ETA |

### System & Telemetry

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/system/info` | Host hardware specifications, GPU models, and RAM capacity |
| `POST` | `/api/v1/system/compatibility` | Evaluate hardware compatibility for a target model ID |
| `GET` | `/api/v1/system/health` | Comprehensive health check across DB, Redis, Celery, and GPU |
| `WS` | `/api/v1/realtime/ws` | Real-time WebSocket connection for GPU telemetry and job events |
| `GET` | `/api/v1/system/stream` | Server-Sent Events (SSE) system telemetry stream |

---

## 🛠️ Development & Testing

### Running Tests

```bash
# Run backend test suite
pytest backend/runtime/test_warm_cache_retention.py \
       backend/runtime/test_mesh_remesh_optimizer.py \
       backend/runtime/test_validate_env.py -v

# Run full end-to-end 3D quality pipeline and export verification
python3 scripts/test_pipeline_and_export.py

# Verify frontend TypeScript types
npx tsc --noEmit

# Test production frontend build
npm run build
```

---

## 📁 Project Structure

```
AI_Studio/
├── app/                               # Next.js 16 App Router pages
│   ├── layout.tsx                     # Root layout with theme provider
│   ├── page.tsx                       # Landing page / workspace redirect
│   ├── workspace/page.tsx             # Tripo-style generation studio
│   ├── settings/page.tsx              # Settings & Model Manager
│   └── api/                           # Reverse proxy routes to FastAPI
│
├── features/                          # Feature modules & UI panels
│   ├── new-workspace/                 # Modern workspace shell & 3D canvas
│   ├── workspace/new-ui/              # Workspace tabs (Mesh, Texture, Remesh, Rigging)
│   ├── model-manager/                 # Model Manager tabs & download controls
│   └── admin/                         # System monitoring & diagnostics
│
├── components/                        # Shared UI component library
├── hooks/                             # React hooks (WebSocket, SSE, hardware telemetry)
├── stores/                            # Zustand stores (generation, project, UI state)
│
├── backend/                           # FastAPI Python backend
│   ├── app/
│   │   ├── main.py                    # Application entry point
│   │   ├── api/v1/                    # Modular API route controllers
│   │   ├── core/
│   │   │   ├── mesh_optimizer.py      # Decimation, LOD cascade & collision hulls
│   │   │   ├── mesh_processor.py      # Diagnostics & QA scoring engine
│   │   │   └── providers/             # Generative AI provider bridges
│   │   ├── workers/                   # Celery asynchronous task workers
│   │   └── schemas/                   # Pydantic validation schemas
│   ├── runtime/                       # VRAM tracking, GPU scheduler & venv installer
│   └── requirements.txt               # Backend Python dependencies
│
├── PLANS/                             # Architectural plans & specifications
│   ├── 3D_QUALITY_PIPELINE.md         # 8-stage quality pipeline specification
│   ├── GAME_READY_SPEC.md             # Game-ready asset specifications & QA rubric
│   ├── QUALITY_BENCHMARK.md           # Benchmark tests & verification matrix
│   └── ROOT_CAUSE_REPORT.md           # Technical post-mortem & root-cause report
│
├── Docs/                              # Technical documentation
│   ├── architecture.md                # Detailed system architecture guide
│   ├── api-documentation.md           # Full REST API documentation
│   ├── developer-guide.md             # Developer workflow & contributing guidelines
│   └── pipeline-status.md             # Detailed implementation progress tracker
│
├── scripts/                           # System orchestration scripts
│   ├── setup.sh                       # Stage A automated setup script
│   ├── start.sh                       # Multi-service launch script
│   ├── colab.sh                       # 1-click Google Colab bootstrap script
│   └── test_pipeline_and_export.py    # Pipeline verification test script
│
├── README.md                          # Single authoritative project documentation
└── LICENSE                            # MIT License
```

---

## 🔧 Troubleshooting

### 1. GPU Not Detected
```bash
# Verify NVIDIA driver and CUDA installation
nvidia-smi

# Check visible CUDA devices
echo $CUDA_VISIBLE_DEVICES
```

### 2. Port Already in Use (3000 or 8000)
```bash
# Identify and terminate process holding port 3000 or 8000
lsof -i :3000 -t | xargs kill -9
lsof -i :8000 -t | xargs kill -9
```

### 3. Out of Memory (CUDA OOM)
- Switch to a lower VRAM model (e.g. `hunyuan3d-2-mini` or `triposg`).
- Enable single-worker mode: `export WORKER_CONCURRENCY=1`.
- Verify GPU scheduler locks are released: inspect Redis key `gpu_lock`.

### 4. Celery Task Queue Not Processing
```bash
# Verify Redis connection
redis-cli ping  # Should return PONG

# Launch worker in debug mode
celery -A app.workers.celery_app worker --loglevel=debug
```

---

## 📊 Pipeline Status

| Component | Status | Details |
|---|---|---|
| **Neural Providers** | ✅ Operational | Hunyuan3D-2.1, Hunyuan3D-2 Mini, TRELLIS, TripoSG |
| **Two-Stage Runtime** | ✅ Operational | Stage A (venv preparation) & Stage B (weights fetch) |
| **Safe Component Guard** | ✅ Operational | Blender headless post-processing with island vertex guard |
| **UV & Texture Guard** | ✅ Operational | Non-destructive UV preservation across all pipelines |
| **Multi-Tier LODs** | ✅ Operational | Automated LOD0–LOD3 cascade with PyMeshLab/Trimesh |
| **Physics Collision Hulls**| ✅ Operational | Automated convex hull generation |
| **QA Diagnostic Engine** | ✅ Operational | 0–100 topological scoring with machine-readable reports |
| **Production ZIP Export**| ✅ Operational | Hierarchical export packaging with format conversion |

---

## 🔐 Security

- **Safe Subprocess Execution**: Strict command allowlists prevent shell injection.
- **Path Traversal Protection**: Export and storage paths are strictly bounded to asset directories.
- **Resource Limiting**: Redis-backed sliding-window rate limiting protects API endpoints.
- Vulnerability reports should be submitted to the project maintainers via GitHub Issues.

---

## 📚 Documentation Index

- [Architecture & Storage Guide](file:///teamspace/studios/this_studio/AI_Studio/Docs/architecture.md)
- [Complete REST API Documentation](file:///teamspace/studios/this_studio/AI_Studio/Docs/api-documentation.md)
- [Pipeline V2 Status & Changelog](file:///teamspace/studios/this_studio/AI_Studio/Docs/pipeline-status.md)
- [Developer & Testing Guide](file:///teamspace/studios/this_studio/AI_Studio/Docs/developer-guide.md)
- [3D Quality Pipeline Specification](file:///teamspace/studios/this_studio/AI_Studio/PLANS/3D_QUALITY_PIPELINE.md)
- [Game-Ready Asset Specification](file:///teamspace/studios/this_studio/AI_Studio/PLANS/GAME_READY_SPEC.md)
- [Quality Benchmark & Verification](file:///teamspace/studios/this_studio/AI_Studio/PLANS/QUALITY_BENCHMARK.md)
- [Root Cause Diagnostic Report](file:///teamspace/studios/this_studio/AI_Studio/PLANS/ROOT_CAUSE_REPORT.md)

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](file:///teamspace/studios/this_studio/AI_Studio/LICENSE) file for details.
