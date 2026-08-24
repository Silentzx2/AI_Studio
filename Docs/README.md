<!-- ===================== HERO BANNER ===================== -->

<p align="center">
  <img src="https://i.postimg.cc/2ScFBzgs/file-000000006864720bb59405440766bb68-2.jpg" alt="AI 3D Studio Banner" width="100%">
</p>

<h1 align="center">
    AI 3D Studio
</h1>

<p align="center">
  <strong>Professional AI-Powered 3D Generation Platform</strong><br>
  Install • Generate • Edit • Manage • Render 
</p>

<p align="center">

  <img src="https://img.shields.io/badge/Version-3.8.8-8A2BE2?style=for-the-badge">

  <img src="https://img.shields.io/badge/Pipeline-V2-Complete-success?style=for-the-badge">

  <img src="https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white">

  <img src="https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi&logoColor=white">

  <img src="https://img.shields.io/badge/Next.js-16.x-Frontend-000000?style=for-the-badge&logo=nextdotjs">

  <img src="https://img.shields.io/badge/Linux-Ubuntu-E95420?style=for-the-badge&logo=ubuntu&logoColor=white">

  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge">

</p>

---

<p align="center">
  <strong>⭐ Star this repo if you find it useful!</strong>
</p>

---

## 📖 Table of Contents

- [🚀 Features](#-features)
- [🆕 What's New in V2](#-whats-new-in-v2)
- [🏗️ Architecture](#-architecture)
- [📦 Installation](#-installation)
- [⚙️ Configuration](#-configuration)
- [🎮 Usage](#-usage)
- [🔌 Model Manager (V2)](#-model-manager-v2)
- [📚 Documentation](#-documentation)
- [🛠️ Development](#-development)
- [🤝 Contributing](#-contributing)
- [🔧 Troubleshooting](#-troubleshooting)
- [📊 Pipeline Status](#-pipeline-status)
- [📄 License](#-license)

---

## 🚀 Features

### Core Capabilities

| Feature | Description | Status | Version |
|---------|-------------|--------|---------|
| **Text-to-3D** | Generate 3D models from text descriptions | ✅ | v1 |
| **Image-to-3D** | Convert 2D images to 3D models | ✅ | v1 |
| **Model Discovery** | Browse models from 5+ sources | ✅ | V2 |
| **Smart Download** | Resumable, chunked downloads with mirror fallback | ✅ | V2 |
| **Health Monitoring** | Comprehensive system & model diagnostics | ✅ | V2 |
| **Compatibility Checks** | Pre-installation system validation | ✅ | V2 |
| **Model Installation** | Automated dependency resolution & setup | ✅ | V2 |
| **Download Queue** | Pause, resume, cancel, concurrent downloads | ✅ | V2 |
| **Performance Benchmarks** | Model performance metrics & comparisons | ✅ | V2 |
| **GPU Scheduling** | VRAM-aware provider selection | ✅ | v1 |
| **Workspace Compatibility** | Model-to-workspace filtering (prevents invalid selection) | ✅ | v3.3 |
| **Texture Pipeline** | Production-grade PBR texture generation with model selection | ✅ | v3.3 |
| **3D Viewer** | In-browser Three.js rendering | ✅ | v1 |
| **Admin Dashboard** | System administration interface | ✅ | v1 |


### Current Model & Runtime Catalog

| Name | Category | VRAM Required | Speed | Key Capabilities |
|------|----------|--------------|-------|------------------|
| **Hunyuan3D 2.1** | 3D generation | ~16 GB | ~90s | text-to-3D, image-to-3D, texture generation |
| **Hunyuan3D-2mini** | 3D generation | ~6 GB | ~45s | image-to-3D (texture via Hunyuan3D-2 paint weights); separate repo, manifest, weights path, and venv |
| **Trellis** | 3D generation | ~12 GB | ~60s | image-to-3D, text-to-3D, texture generation |
| **TripoSG** | 3D generation | ~8 GB | ~60s | image-to-3D (rectified-flow, no texture) |
| **DetailGen3D** | Post-processing | ~4 GB | ~15s | detail enhancement (mesh refinement, no texture) |
| **UniRig** | Rigging | ~8 GB | ~30s | skeletal rigging, animation |
| **AniGen** | Rigging | ~6.2 GB | ~30s | character skeletal rigging, animation |

> **Note**: `Hunyuan3D-2mini` is a **separate repo entry** from `Hunyuan3D-2`. They share the same GitHub URL but have independent manifests, weights paths, and venvs — allowing the mini variant to be installed and updated independently.

### Pipeline & Workspace APIs

The backend pipelines API drives workspace model pickers and feature gating (the Settings → Pipelines UI page was removed; the AI Models page now hosts the Global AI Capability toggles).

- `GET /api/v1/pipelines` returns the current snapshot of models, features, and input modes.
- `POST /api/v1/pipelines/{model_id}/toggle` enables or disables a pipeline in the local feature gate.
- `GET /api/v1/pipelines/workspace-models?workspace=<type>&installed_only=<bool>` returns models compatible with a specific workspace.
- `GET /api/v1/pipelines/workspace-types` lists all supported workspace/task types with descriptions.
- Runtime health and provider data come from `/api/v1/runtime/status`, `/api/v1/runtime/health`, and `/api/v1/runtime/options`.
- The backend also registers a bare `GET /api/v1/runtime` route (returns the same payload as `/status`).


### Download Sources (Pipeline V2)

- ✅ **HuggingFace Hub** - Largest model repository
- ✅ **GitHub Releases** - Version-controlled releases
- ✅ **CivitAI** - Community-shared models
- ✅ **ModelScope** - Alibaba DAMO-VISL models
- ✅ **NVIDIA NGC** - Proprietary enterprise models
- ✅ **Direct URLs** - Custom model sources
- ✅ **Local Imports** - File system models

---

## 🆕 What's New in V2

### Pipeline V2 - Complete Model Management System

#### 📥 **Smart Download System**
- **Chunked Downloads**: Parallel multi-part downloads for speed
- **Resume Capability**: Download interruption recovery
- **Mirror Fallback**: Automatic source switching on failure
- **Checksum Validation**: Integrity verification (SHA256, MD5)
- **Queue Management**: Pause, resume, cancel operations
- **Progress Tracking**: Real-time download progress with ETAs

#### 🔍 **Model Discovery**
- Browse 1000+ models from 5 sources
- Filter by category, size, popularity
- View model details (size, VRAM, quality, speed)
- One-click installation with compatibility check

#### ⚙️ **Compatibility System**
- **Pre-Installation Checks**:
  - GPU VRAM availability
  - Python version validation
  - CUDA compatibility verification
  - Disk space requirement check
  - System RAM assessment
- **Automatic Warnings**: Notifies of potential issues
- **Graceful Fallbacks**: Works on CPU if GPU unavailable

#### 📦 **Installation Management**
- Automatic dependency resolution
- Virtual environment support
- Batch installation processing
- Failed package recovery
- Automatic cleanup on failure
- Installation rollback capability

#### 🏥 **Health Monitoring**
- Periodic health checks for all models
- File integrity verification
- Missing dependency detection
- Model repair functionality
- Health status dashboard
- Performance baseline tracking

#### 📊 **Performance Benchmarks**
- Inference time measurement
- Memory usage tracking
- GPU utilization monitoring
- Throughput calculation
- Comparative analysis
- Historical trending

#### 🔌 **Dynamic Capability Detection**
- Automatic provider registration
- Runtime capability discovery
- Feature availability checking
- Graceful degradation support
- Plugin system extensibility

---

## 🏗️ Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  6 Tabs: Installed | Available | Benchmarks | Health │   │
│  │          Queue     | Storage                          │   │
│  │  Smart UI: Auto-refresh, Real-time Progress         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕ REST API / WebSocket
┌─────────────────────────────────────────────────────────────┐
│                       BACKEND (FastAPI)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  API Routers:                                        │   │
│  │  ├─ /api/v1/models     - Model CRUD & management    │   │
│  │  ├─ /api/v1/download   - Download queue operations  │   │
│  │  ├─ /api/v1/discover   - Model discovery & search   │   │
│  │  └─ /api/v1/system     - System info & compatibility│   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Managers:                                           │   │
│  │  ├─ DownloadManager    - Queue & resumable DL       │   │
│  │  ├─ HealthManager      - Diagnostics & health       │   │
│  │  └─ EnvironmentManager - System & dependency checks │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Workers (Celery):                                   │   │
│  │  ├─ download_workers    - Async download tasks      │   │
│  │  ├─ installation_workers- Model installation jobs   │   │
│  │  └─ health_workers      - Background health checks  │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Providers (5):                                      │   │
│  │  ├─ HuggingFaceProvider  - Largest hub              │   │
│  │  ├─ GitHubProvider       - Release downloads        │   │
│  │  ├─ ModelScopeProvider   - Alibaba DAMO-VISL        │   │
│  │  ├─ NVIDIANGCProvider    - Enterprise models        │   │
│  │  └─ CivitAIProvider      - Community models         │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Download Pipeline:                                  │   │
│  │  ChunkManager → MirrorFallback → ChecksumValidator   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                     DATA & INFRASTRUCTURE                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ PostgreSQL   │  │ Redis        │  │ NVIDIA GPU/CUDA  │  │
│  │ - Models DB  │  │ - Job Queue  │  │ - PyTorch        │  │
│  │ - Queues     │  │ - Cache      │  │ - CUDA           │  │
│  │ - Health Log │  │ - Locks      │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 16, React 19, TypeScript | Web UI |
| **UI Components** | shadcn/ui, Radix UI, Lucide Icons | Design System |
| **State Management** | Zustand | Global State |
| **3D Rendering** | Three.js, Trimesh | Visualization |
| **Backend** | FastAPI, Python 3.12+, SQLAlchemy 2 | REST API |
| **Task Queue** | Celery + Redis | Async Tasks |
| **Database** | PostgreSQL 16 | Persistent Storage |
| **ML/AI** | PyTorch, CUDA (Diffusers loaded per-model in isolated venvs) | AI Models |
| **Download** | aiohttp, asyncio | Async Downloads |
| **Deployment** | Native (shell scripts) | No Docker |

---

## 📦 Installation

### Prerequisites

- **NVIDIA GPU** with CUDA support (required for AI generation)
- **Git**
- **uv** package manager (hard dependency)
- Minimum **50GB** free disk space
- **RAM**: 16GB+ (8GB+ for CPU-only mode)

### Quick Start (Native)

Model installation uses a **two-stage** pipeline:

- **Stage A — Runtime**: clones repos, creates per-model venvs, installs Python deps and torch stack.
- **Stage B — Weights**: downloads model weights and auxiliary weights for prepared runtimes.

```bash
# Clone the repository
git clone https://github.com/your-org/ai-3d-studio.git
cd ai-3d-studio

# Make scripts executable
chmod +x scripts/*.sh manager.sh

# Run Stage A setup (runtime only — repos, venvs, deps; NO weights)
# uv is a hard dependency and is installed automatically by setup.sh
./scripts/setup.sh

# Start services
./scripts/start.sh

# Download weights via UI (Settings → Model Manager) or API:
# curl -X POST http://localhost:8000/api/v1/runtime/download-weights \
#   -H 'Content-Type: application/json' -d '{"providers":["hunyuan3d-2-mini"]}'
```

> **Note**: `setup.sh` performs **Stage A only** — it does not download weights. After startup, download weights through the UI or the `download-weights` API endpoint.

### Access Points

| Service | URL | Port | Description |
|---------|-----|------|-------------|
| **Frontend** | http://localhost:3000 | 3000 | Web application |
| **Backend API** | http://localhost:8000 | 8000 | REST API |
| **API Docs** | http://localhost:8000/docs | 8000 | Swagger UI |
| **ReDoc Docs** | http://localhost:8000/redoc | 8000 | ReDoc UI |
| **Admin Panel** | http://localhost:3000/settings?section=monitoring | 3000 | Administration (via Settings) |
| **Model Manager** | http://localhost:3000/settings | 3000 | V2 Feature (Settings page) |
| **Workspace** | http://localhost:3000/workspace | 3000 | Dashboard & asset library |
| **3D Generation** | http://localhost:3000/3d | 3000 | Text/Image → 3D generation (3D-SPACE components) |

### Manual Setup (Development)

For development or custom deployments:

```bash
# Backend setup (uv is a hard dependency)
cd backend
uv venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
uv pip install -r requirements.txt

# Start backend
uvicorn app.main:app --reload --port 8000

# In another terminal, start Celery
celery -A app.workers.celery_app worker --loglevel=info

# Frontend setup (in project root)
npm install
npm run dev  # Starts on http://localhost:3000
```

See [Setup Guide](docs/setup-guide.md) for detailed instructions.

### Google Colab Setup

```bash
# In a Colab notebook cell:
!bash scripts/colab.sh
```

Colab mode automatically:
- Detects the Colab environment and available GPU
- Forces SQLite mode (no PostgreSQL/Redis systemd)
- Installs backend venv + PyTorch (CUDA 12.1 if GPU detected)
- Runs **Stage A** (runtime preparation: clone repos, create venvs, install deps)
- Starts API, Celery worker, and frontend via Cloudflare Tunnel
- Stage B (weights) is deferred — download via UI or `download-weights` API after startup

**Colab Preparation Policy**: Models are automatically prepared on Colab only if they pass BOTH criteria:
- VRAM < 15 GB (Colab T4/P100 have ~16 GB)
- Weight download ≤ 10 GB (Colab free-tier disk limit)

Models requiring native CUDA builds (TRELLIS, UniRig) are also skipped on Colab since the CUDA toolkit is unavailable. On VPS/full-GPU hosts, all models are available without these restrictions.

| Model | VRAM Required | Colab Prep |
|-------|--------------|------------|
| Hunyuan3D 2.1 | 16 GB | Skipped |
| Hunyuan3D 2 | 24 GB | Skipped |
| Hunyuan3D-2mini | 6 GB | Prepared |
| TRELLIS | 8 GB | Skipped (native CUDA build) |
| AniGen | 6.2 GB | Skipped (23 GB weight >10 GB ceiling) |
| UniRig | 8 GB | Skipped (native CUDA build) |
| DetailGen3D | 4 GB | Prepared |
| TripoSG | 8 GB | Prepared |

To run a skipped model on Colab, use a VPS or full-GPU environment instead.

---

## ⚙️ Configuration

### Environment Variables

Create `.env` in `Project Root` directory:

```bash
cp .env.example .env
```

### Essential Configuration

```env
# ===== APPLICATION =====
ENVIRONMENT=development
DEBUG=true
APP_NAME=AI 3D Studio
APP_VERSION=3.4.3

# ===== DATABASE =====
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/ai3dstudio

# ===== REDIS & CELERY =====
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# ===== AI PROVIDER =====
AI_PROVIDER=hunyuan3d-2.1
# Options: mock, hunyuan3d-2.1, hunyuan3d-2, hunyuan3d-2-mini, trellis, triposg, anigen, unirig, detailgen3d
# (aliases: hunyuan3d, hunyuan3d-1.0 -> hunyuan3d-2.1)

# ===== GPU SETTINGS =====
CUDA_DEVICE=auto
MAX_VRAM_MB=0  # 0 = auto-detect

# ===== STORAGE PATHS =====
STORAGE_LOCAL_PATH=/app/storage
MODELS_PATH=/app/storage/models
DOWNLOAD_CHUNK_SIZE_MB=5
DOWNLOAD_MAX_RETRIES=3

# ===== PROVIDER CREDENTIALS (OPTIONAL) =====
GITHUB_TOKEN=
NVIDIA_NGC_API_KEY=
CIVITAI_API_KEY=

# ===== API SETTINGS =====
API_V1_PREFIX=/api/v1
CORS_ORIGINS=["http://localhost:3000"]
```

For complete configuration options, see [Setup Guide - Configuration](docs/setup-guide.md#configuration).

---

## 🎮 Usage

### Basic Workflow

1. **Open the app** at http://localhost:3000
2. **Choose generation mode**: Text-to-3D or Image-to-3D
3. **Enter prompt** describing your desired 3D model
4. **Select quality**: Low-poly / Standard / High-poly
5. **(Optional) Upload reference image** for image-to-3D
6. **Click Generate** and wait for completion
7. **View result** in the interactive 3D viewer
8. **Download** in GLB, FBX, OBJ, or STL format

### Workspace Features

- **Global Navbar**: Tripo-style pill header (h-12) with icon+label nav links, active yellow accent, and glow CTA
- **Live Header Monitor**: dedicated backend connectivity pill (separated by a divider from the GPU cluster), two per-GPU status pills (green=active, red=offline, gray=loading/absent), and a realtime VRAM sparkline — all polled from `/api/v1/runtime/status`
- **Left Sidebar**: Tripo-inspired workspace navigation (tripo-gray-3) with icon items and GPU/VRAM diagnostics
- **Center Control Panel**: Tripo-style 248px panel (tripo-gray-4) with compact 12px/10px typography scale
- **Right Asset Panel**: 248px asset library with Tripo-style shadows and rounded corners
- **Center Viewer**: Full-height 3D canvas with Tripo gray background
- **Workspace Compatibility**: Each model declares which workspaces it supports. The UI only shows compatible models in each workspace tab, preventing invalid selections.

### Workspace Types

| Workspace | Purpose | Compatible Models |
|-----------|---------|-------------------|
| **Mesh Generation** | Create 3D meshes from text or images | Hunyuan3D 2.1, Hunyuan3D 2, Hunyuan3D-2mini, TRELLIS, TripoSG |
| **Texture Generation** | Generate PBR textures and materials | Hunyuan3D 2.1, Hunyuan3D 2, TRELLIS |
| **Rigging** | Auto-rig 3D character meshes | AniGen, UniRig |
| **Animation** | Generate skeletal animations | AniGen, UniRig |
| **Remesh** | Retopology and mesh optimization | DetailGen3D |
| **Post-Processing** | Detail enhancement and mesh polishing | Hunyuan3D 2.1, Hunyuan3D 2, DetailGen3D |

### Model Manager Interface (NEW in V2)

Navigate to **Settings** to access the model management system:

#### **Installed Models Tab**
- View all installed models with status badges
- Quick stats: version, size, install date
- Actions: Uninstall, Repair, View Details
- Health status indicator (Healthy/Warning/Error)
- Capability display (Text-to-3D, Image-to-3D, etc.)

#### **Available Models Tab**
- Browse models from 5 sources
- Filter by category (3D Generation, Image-to-3D, etc.)
- Search models by name or description
- View model details (author, downloads, size)
- One-click install with compatibility pre-check

#### **Benchmarks Tab**
- Performance metrics for installed models
- Inference time, memory usage, throughput
- Run custom benchmarks
- Compare multiple models side-by-side
- Export benchmark results

#### **Health Status Tab**
- System health overview
- Individual model health checks
- Dependency validation
- File integrity verification
- Repair suggestions with one-click fixes
- Periodic auto-check status

#### **Queue Tab** (Existing)
- Monitor active downloads
- View download speed and ETA
- Pause/Resume/Cancel operations
- Download history with retry counts

#### **Storage Tab** (Existing)
- Total storage usage overview
- Breakdown by model type
- Clean up options for partial downloads
- Storage optimization suggestions

### Admin Dashboard

Navigate to `/settings?section=monitoring` for:
- System overview with GPU/memory stats
- Job history and queue management
- Download queue monitoring
- Runtime configuration
- Health check reports
- Log viewer with filtering
- Terminal access for advanced operations

### Settings → Pipelines Dashboard

The Pipelines page (`/settings?section=pipelines`) provides:
- **Workspace Filter Bar**: Filter models by compatible workspace type (Mesh Generation, Texture, Rigging, etc.) with counts per type.
- **Compatibility Badges**: Each pipeline card shows its workspace compatibility tags.
- **Feature Matrix**: Live computed feature flags based on installed models.
- **Model Comparison**: Select up to 4 models for side-by-side comparison.
- **Workflow Presets**: Save and reuse generation workflows.

### Texture Generation Workflow

The Texture tab (`/workspace/texture`) now supports:
- **Model Selection**: Choose from texture-compatible models (Hunyuan3D 2.1, Hunyuan3D 2, TRELLIS).
- **Resolution Presets**: 512px (Draft), 1024px (Fast), 2048px (Balanced), 4096px (Ultra).
- **Style Presets**: Photorealistic PBR, Stylized Handpainted, Anime/Cel-Shaded, Cyberpunk Neon, Procedural.
- **PBR Material Controls**: Metalness Bias and Roughness Bias sliders (0–100%).
- **Weathering Control**: Surface wear and aging (0–100%).
- **Model Upload**: Optional GLB/GLTF target for texturing.

---

## 🔌 Model Manager (V2)

### API Endpoints

#### **Models Management**
```
GET    /api/v1/models/installed      - List all installed models
GET    /api/v1/models/available      - List available models from sources
GET    /api/v1/models/{id}           - Get specific model details
DELETE /api/v1/models/{id}           - Uninstall a model
POST   /api/v1/models/{id}/repair    - Repair damaged model
POST   /api/v1/models/{id}/health    - Run health check
```

#### **Download Operations**
```
POST   /api/v1/download/start        - Start new download
GET    /api/v1/download/queue        - Get download queue status
GET    /api/v1/download/{id}         - Get download details
POST   /api/v1/download/{id}/pause   - Pause active download
POST   /api/v1/download/{id}/resume  - Resume paused download
POST   /api/v1/download/{id}/cancel  - Cancel download
```

#### **Model Discovery**
```
GET    /api/v1/discover/models                - Search all sources
GET    /api/v1/discover/models?category=3d   - Filter by category
GET    /api/v1/discover/models/{model_id}    - Get model details
```

#### **System Information**
```
GET    /api/v1/system/info                           - System specs
POST   /api/v1/system/compatibility                  - Check compatibility
GET    /api/v1/system/health                         - Overall health status
GET    /api/v1/system/benchmark/{model_id}          - Get benchmarks
```

#### **Runtime Installation (Two-Stage)**
```
POST   /api/v1/runtime/prepare-runtime               - Stage A: clone repos, create venvs, install deps (no weights)
POST   /api/v1/runtime/download-weights              - Stage B: download model weights for prepared runtimes
POST   /api/v1/runtime/install                       - Stage A + B (backward compat; runs both stages sequentially)
GET    /api/v1/runtime/status                        - Runtime health and provider status
GET    /api/v1/runtime/health                        - Runtime health check
GET    /api/v1/runtime/options                       - Available runtime options
```

#### **Pipelines & Workspace**
```
GET    /api/v1/pipelines                             - Pipeline snapshot + feature matrix
POST   /api/v1/pipelines/{model_id}/toggle           - Enable/disable a pipeline
GET    /api/v1/pipelines/workspace-models            - Models compatible with a workspace
GET    /api/v1/pipelines/workspace-types             - List all workspace types
```

### Download Features

**Smart Download Engine**:
- Parallel chunk downloads (up to 4 concurrent)
- Automatic mirror fallback on timeout
- Resume from last byte on disconnect
- SHA256/MD5 checksum validation
- Automatic retry with exponential backoff
- Progress callbacks with ETA calculation

**Queue Management**:
- Concurrent download support
- Priority-based scheduling
- Persistent queue (survives restarts)
- Download history tracking
- Bandwidth throttling options

### Compatibility Checks

Pre-installation validation includes:
- GPU VRAM requirement vs. available
- Python version compatibility
- CUDA version verification
- System RAM availability
- Disk space sufficiency
- Required dependencies check
- System library availability

---

## 📚 Documentation

| Document | Description | Path |
|----------|-------------|------|
| **API Documentation** | Complete REST API with curl examples | `docs/api-documentation.md` |
| **Architecture Guide** | System design and data flow | `docs/architecture.md` |
| **Setup Guide** | Detailed installation & config | `docs/setup-guide.md` |
| **Developer Guide** | Contributing and development | `docs/developer-guide.md` |
| **Pipeline Status** | Implementation progress | `docs/pipeline-status.md` |
| **Troubleshooting** | Common issues and solutions | `docs/setup-guide.md#troubleshooting` |

### Quick Reference

- **API Docs (Interactive)**: http://localhost:8000/docs
- **ReDoc Docs**: http://localhost:8000/redoc
- **GitHub Discussions**: Ask questions and share ideas
- **GitHub Issues**: Report bugs and request features

---

## 🛠️ Development

### Prerequisites for Development

```bash
# Install Node.js dependencies
npm install

# Setup Python environment (uv is a hard dependency)
cd backend
uv venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
uv pip install -r requirements.txt
uv pip install -r requirements-dev.txt
cd ..
```

### Running in Development Mode

**Terminal 1 - Backend API**:
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 - Celery Worker**:
```bash
cd backend
source .venv/bin/activate
celery -A app.workers.celery_app worker --loglevel=info
```

**Terminal 3 - Redis** (if not running as service):
```bash
redis-server
```

**Terminal 4 - Frontend**:
```bash
npm run dev
```

### Code Quality

```bash
# Lint frontend
npm run lint

# Type check
npx tsc --noEmit
```

### Development Commands

```bash
# Backend
cd backend

# Run tests
pytest

# Database migrations
alembic upgrade head
alembic downgrade -1

# Reset database
python -c "from app.database import Base, engine; Base.metadata.drop_all(engine)"

# Frontend
npm run dev          # Dev server with HMR
npm run build        # Production build
npm run lint         # ESLint
```

See [Developer Guide](docs/developer-guide.md) for detailed contribution guidelines.

---

## 📁 Project Structure

```
ai-3d-studio/
│
├── 📄 package.json                    # Node.js dependencies
├── 📄 tsconfig.json                   # TypeScript config
├── 📄 tailwind.config.ts              # Tailwind CSS config
│
├── app/                               # Frontend (Next.js 16 App Router)
│   ├── layout.tsx                     # Root layout
│   ├── page.tsx                       # Landing page (renders WorkspaceShell)
│   ├── workspace/page.tsx             # Main generation workspace (tabbed shell)
│   ├── settings/page.tsx              # Unified settings (includes former admin tabs)
│   ├── error.tsx / loading.tsx / not-found.tsx
│   ├── static/[...path]/route.ts      # Static asset proxy
│   │
│   └── api/                           # Next.js API proxy routes
│       ├── v1/[...path]/route.ts      # Backend API proxy
│       └── v1/settings/route.ts       # Settings proxy
│
├── features/                          # Feature modules (ROOT level, NOT under app/)
│   ├── workspace/                     # Workspace layout & navigation
│   │   ├── new-ui/                    # Tab-based workspace UI (Tripo-style)
│   │   │   ├── CreativeWorkspaceLayout.tsx  # Main workspace shell with sidebar
│   │   │   ├── WorkspaceTab.tsx             # Dashboard / project files
│   │   │   ├── TextureGenTab.tsx            # PBR texture generation (Tripo-style)
│   │   │   ├── RemeshTab.tsx                # Retopology / mesh optimization
│   │   │   ├── RiggingAnimationTab.tsx      # Auto-rigging & animation
│   │   │   ├── MyAssetsTab.tsx              # Asset library
│   │   │   ├── FavoritesTab.tsx             # Favorited assets
│   │   │   ├── ApiAccessTab.tsx             # API key management
│   │   │   └── WorkspaceSettingsTab.tsx     # Workspace preferences
│   │   ├── WorkspaceNavbar.tsx       # Global Tripo-style top navbar
│   │   └── ThreeDGenWorkspace.tsx    # 3D generation workspace (3D-SPACE)
│   ├── admin/tabs/                    # Admin dashboard tabs
│   │   ├── ConnectionsTab.tsx
│   │   ├── HealthTab.tsx
│   │   ├── JobsTab.tsx
│   │   ├── LogsTab.tsx
│   │   ├── ModelsTab.tsx
│   │   ├── OverviewTab.tsx
│   │   ├── QueueTab.tsx
│   │   ├── RuntimeTab.tsx
│   │   ├── SettingsTab.tsx
│   │   ├── StorageTab.tsx
│   │   └── TerminalTab.tsx
│   ├── settings/sections/             # Settings page sections
│   │   ├── GeneralSection.tsx
│   │   ├── WorkspaceSection.tsx
│   │   ├── AppearanceSection.tsx
│   │   ├── GenerationSection.tsx
│   │   ├── ExportBackupSection.tsx
│   │   └── PreferencesSections/
│   │       ├── NotificationsSection.tsx
│   │       ├── ShortcutsSection.tsx
│   │       ├── NetworkSection.tsx
│   │       └── AdvancedSection.tsx
│   ├── model-manager/tabs/            # Model management tabs (V2)
│   │   ├── BenchmarksTab.tsx
│   │   ├── HealthTab.tsx
│   │   ├── InstalledModelsTab.tsx
│   │   ├── AvailableModelsTab.tsx
│   │   ├── QueueTab.tsx
│   │   └── StorageTab.tsx
│   └── model-manager/components/
│       ├── CompatibilityChecker.tsx
│       ├── DownloadProgress.tsx
│       └── ModelDetailsModal.tsx
│
├── components/                        # Shared UI components
│   ├── ui/                            # shadcn/ui components
│   ├── premium/                       # Styled premium components
│   └── motion/                        # Framer Motion wrappers
│
├── stores/                            # Zustand state stores
│   ├── useGenerationStore.ts
│   ├── useProjectStore.ts
│   ├── useThemeStore.ts
│   └── useUIStore.ts
│
├── services/                          # API client layer
│   ├── adminService.ts
│   ├── apiClient.ts
│   ├── generationService.ts
│   ├── runtimeService.ts
│   └── uploadService.ts
│
├── backend/                           # Python FastAPI Backend
│   ├── app/
│   │   ├── main.py                    # FastAPI entry point
│   │   ├── config.py                  # Configuration
│   │   ├── database.py                # DB setup
│   │   │
│   │   ├── api/v1/                    # API Routers
│   │   │   ├── __init__.py            # Registers all routers below
│   │   │   ├── admin_router.py        # /admin
│   │   │   ├── generation_router.py   # /generation
│   │   │   ├── jobs_router.py         # /jobs
│   │   │   ├── health_router.py       # /health
│   │   │   ├── runtime_router.py      # /runtime
│   │   │   ├── upload_router.py       # /upload
│   │   │   ├── hf_token_router.py     # /hf-token
│   │   │   ├── models_api.py          # /models (no prefix)
│   │   │   ├── discover_router.py     # /discover (no prefix)
│   │   │   ├── download_router.py     # /download (no prefix)
│   │   │   ├── pipelines_router.py    # /pipelines (no prefix)
│   │   │   ├── system_router.py       # /system (no prefix)
│   │   │   ├── settings_router.py     # /settings (no prefix)
│   │   │   ├── project_router.py      # /project (no prefix)
│   │   │   └── rigging_router.py      # /rigging (no prefix)
│   │   │
│   │   ├── core/
│   │   │   ├── providers/             # AI Providers
│   │   │   │   ├── base.py
│   │   │   │   ├── registry.py
│   │   │   │   ├── huggingface_provider.py
│   │   │   │   ├── github_provider.py
│   │   │   │   ├── civitai_provider.py
│   │   │   │   ├── modelscope_provider.py
│   │   │   │   ├── nvidia_ngc_provider.py
│   │   │   │   ├── hunyuan3d.py
│   │   │   │   ├── hunyuan3d_local.py
│   │   │   │   ├── trellis.py
│   │   │   │   ├── trellis_local.py
│   │   │   │   ├── instant_mesh.py
│   │   │   │   ├── detailgen3d.py
│   │   │   │   ├── anigen_provider.py
│   │   │   │   └── mock.py
│   │   │   ├── managers/
│   │   │   │   ├── compatibility_manager.py
│   │   │   │   ├── download_manager.py
│   │   │   │   ├── environment_manager.py
│   │   │   │   ├── health_manager.py
│   │   │   │   └── vram_tracker.py
│   │   │   ├── downloader/
│   │   │   │   ├── mirror_fallback.py
│   │   │   │   └── checksum_validator.py
│   │   │   ├── installer/
│   │   │   │   ├── dependency_resolver.py
│   │   │   │   └── plugin_installer.py
│   │   │   └── registry/
│   │   │       └── model_registry.py
│   │   │
│   │   ├── workers/                   # Celery Async Tasks
│   │   │   ├── celery_app.py
│   │   │   ├── tasks.py
│   │   │   ├── download_workers.py
│   │   │   ├── installation_workers.py
│   │   │   ├── health_workers.py
│   │   │   └── vram_health_worker.py
│   │   │
│   │   ├── models/                    # SQLAlchemy ORM Models
│   │   │   ├── job.py
│   │   │   └── registry.py
│   │   │
│   │   ├── schemas/                   # Pydantic Schemas
│   │   │   ├── generation.py
│   │   │   └── manifest.py
│   │   │
│   │   └── database.py                # SQLAlchemy setup
│   │
│   ├── runtime/                       # GPU/Runtime Utilities
│   │   ├── engine.py
│   │   ├── gpu.py
│   │   ├── health.py
│   │   ├── installer.py               # resolve_install_targets(), clone_repos_for_models(), full_install()
│   │   ├── platform_detection.py
│   │   └── storage.py                 # StorageConfig with per-model paths
│   │
│   ├── migrations/                    # Alembic DB Migrations
│   ├── requirements.txt               # Python dependencies
│   └── .env.example                   # Environment template
│
├── Docs/                              # Documentation
│   ├── README.md
│   ├── api-documentation.md
│   ├── architecture.md
│   ├── setup-guide.md
│   ├── developer-guide.md
│   ├── pipeline-status.md
│   └── CHANGELOG.md
│
├── scripts/                           # Service management scripts
│   ├── bootstrap.sh
│   ├── setup.sh                       # Automatic native setup
│   ├── start.sh                       # Start all services
│   ├── stop.sh
│   ├── restart.sh
│   ├── manager.sh                     # Interactive service manager
│   ├── update-models.sh               # Model update/migration script
│   ├── cloudflare.sh
│   ├── ensure-build-and-start.js
│   └── install_nvidia_toolkit.sh
│
├── .gitignore
└── package.json                       # Node.js dependencies
```

---

## 🔧 Troubleshooting

### Common Issues & Solutions

#### **GPU Not Detected**

```bash
# Verify NVIDIA GPU is present
nvidia-smi

# Check CUDA_VISIBLE_DEVICES
echo $CUDA_VISIBLE_DEVICES
```

#### **Port Already in Use**

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

#### **Database Connection Failed**

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection manually
psql -h localhost -U ai3dstudio -d ai3dstudio
```

#### **Out of Memory Errors**

```bash
# Reduce worker concurrency
export WORKER_CONCURRENCY=1

# Reduce batch size
export BATCH_SIZE=1

# Monitor GPU memory
watch -n 1 nvidia-smi

# Use smaller model
export AI_PROVIDER=trellis  # Uses less VRAM
```

#### **Model Download Fails**

```bash
# Check internet connection
curl -I https://huggingface.co

# Clear download cache
rm -rf /app/storage/downloads/*

# Retry with mirror fallback
# (Automatic in V2 - just retry)

# Check disk space
df -h /app/storage
```

#### **Celery Tasks Not Running**

```bash
# Check Redis connection
redis-cli ping  # Should return PONG

# Check Celery worker
celery -A app.workers.celery_app worker --loglevel=debug

# Check queue
redis-cli

# Flush queue if needed
redis-cli FLUSHALL
```

For more solutions, see [Setup Guide - Troubleshooting](docs/setup-guide.md#troubleshooting).

---

## 📊 Pipeline Status

### V2 Implementation Progress

| Phase | Description | Status | Files | Lines |
|-------|-------------|--------|-------|-------|
| **Phase 1** | Providers & Downloaders | ✅ COMPLETE | 8 | ~1,200 |
| **Phase 2** | Managers | ✅ COMPLETE | 3 | ~900 |
| **Phase 3** | Celery Workers | ✅ COMPLETE | 3 | ~850 |
| **Phase 4** | API Endpoints | ✅ COMPLETE | 4 | ~1,600 |
| **Phase 5** | Frontend Components | ✅ COMPLETE | 7 | ~2,100 |
| **Phase 6** | Integration | ✅ COMPLETE | 5 | ~400 |
| **TOTAL** | | **✅ 100%** | **30** | **~7,050** |

### Feature Completion Matrix

| Feature | Phase | Status | Integration |
|---------|-------|--------|-------------|
| GitHub Provider | 1 | ✅ | Registry updated |
| ModelScope Provider | 1 | ✅ | Registry updated |
| NVIDIA NGC Provider | 1 | ✅ | Registry updated |
| CivitAI Provider | 1 | ✅ | Registry updated |
| Chunk Manager | 1 | ✅ | Download pipeline |
| Mirror Fallback | 1 | ✅ | Download pipeline |
| Checksum Validator | 1 | ✅ | Download pipeline |
| Download Manager | 2 | ✅ | API & Workers |
| Environment Manager | 2 | ✅ | Compatibility checks |
| Health Manager | 2 | ✅ | Health endpoint |
| Download Workers | 3 | ✅ | Celery tasks |
| Installation Workers | 3 | ✅ | Celery tasks |
| Health Workers | 3 | ✅ | Background jobs |
| Models API | 4 | ✅ | `/api/v1/models` |
| Download API | 4 | ✅ | `/api/v1/download` |
| Discover API | 4 | ✅ | `/api/v1/discover` |
| System API | 4 | ✅ | `/api/v1/system` |
| Installed Models Tab | 5 | ✅ | Settings page |
| Available Models Tab | 5 | ✅ | Settings page |
| Benchmarks Tab | 5 | ✅ | Settings page |
| Health Tab | 5 | ✅ | Settings page |
| Download Progress Component | 5 | ✅ | Queue Tab |
| Compatibility Checker | 5 | ✅ | Download flow |
| Model Details Modal | 5 | ✅ | Model cards |

See [Pipeline Status Document](docs/pipeline-status.md) for detailed breakdown.
---

## 🔐 Security

- Report security vulnerabilities responsibly to security@your-org.com
- See [Security Policy](.github/SECURITY.md) for details
- All dependencies are vetted and kept up-to-date
- Regular security audits performed

---

<p align="center">
  <strong>Made with ❤️ by the AI 3D Studio</strong>
  
  <br>

---

<p align="center">
  <sub>Last Updated: August 24, 2026 | Version 4.1.0 | Two-Stage Model Setup</sub>
</p>
