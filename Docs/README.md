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

  <img src="https://img.shields.io/badge/Version-3.2.0-8A2BE2?style=for-the-badge">

  <img src="https://img.shields.io/badge/Pipeline-V2-Complete-success?style=for-the-badge">

  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white">

  <img src="https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi&logoColor=white">

  <img src="https://img.shields.io/badge/Next.js-15.x-Frontend-000000?style=for-the-badge&logo=nextdotjs">

  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white">

  <img src="https://img.shields.io/badge/NVIDIA-CUDA-12.1+-76B900?style=for-the-badge&logo=nvidia&logoColor=white">

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
| **3D Viewer** | In-browser Three.js rendering | ✅ | v1 |
| **Admin Dashboard** | System administration interface | ✅ | v1 |


### Current Model & Runtime Catalog

| Name | Category | VRAM Required | Speed | Key Capabilities |
|------|----------|--------------|-------|------------------|
| **Hunyuan3D 2.1** | 3D generation | ~16 GB | ~90s | text-to-3D, image-to-3D, texture generation |
| **TripoSR** | 3D generation | ~6 GB | ~1s | image-to-3D, optional texture bake |
| **Trellis** | 3D generation | ~12 GB | ~60s | image-to-3D, text-to-3D, texture generation |
| **TripoSG** | 3D generation | ~12 GB | ~45s | image-to-3D, detail enhancement |
| **TripoSF** | 3D generation | ~12 GB | ~60s | image-to-3D, detail enhancement |
| **UniRig** | Rigging | ~8 GB | ~30s | skeletal rigging, animation |
| **HoloPart** | Post-processing | ~8 GB | ~20s | part completion, texture support |
| **Mock** | Testing | 0 GB | Instant | development and CI fallback |

### Settings → Pipelines

The Settings → Pipelines page is the UI source of truth for feature gating and the currently enabled model catalog.

- `GET /api/v1/pipelines` returns the current snapshot of models, features, and input modes.
- `POST /api/v1/pipelines/{model_id}/toggle` enables or disables a pipeline in the local feature gate.
- Runtime health and provider data come from `/api/v1/runtime/status`, `/api/v1/runtime/health`, and `/api/v1/runtime/options`.
- The backend does **not** register a bare `GET /api/v1/runtime` route; use the sub-routes above.


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
│  │ PostgreSQL   │  │ Redis        │  │ Docker + NVIDIA  │  │
│  │ - Models DB  │  │ - Job Queue  │  │ GPU/CUDA         │  │
│  │ - Queues     │  │ - Cache      │  │ PyTorch          │  │
│  │ - Health Log │  │ - Locks      │  │ CUDA 12.1+       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 15, React 19, TypeScript | Web UI |
| **UI Components** | shadcn/ui, Radix UI, Lucide Icons | Design System |
| **State Management** | Zustand | Global State |
| **3D Rendering** | Three.js, Trimesh | Visualization |
| **Backend** | FastAPI, Python 3.11+, SQLAlchemy 2 | REST API |
| **Task Queue** | Celery + Redis | Async Tasks |
| **Database** | PostgreSQL 16 | Persistent Storage |
| **ML/AI** | PyTorch, CUDA 12.1+, Diffusers | AI Models |
| **Download** | aiohttp, asyncio | Async Downloads |
| **Container** | Docker, Docker Compose | Deployment |

---

## 📦 Installation

### Prerequisites

- **NVIDIA GPU** with CUDA support (required for AI generation)
- **Docker** and Docker Compose
- **Git**
- Minimum **50GB** free disk space
- **RAM**: 16GB+ (8GB+ for CPU-only mode)

### Quick Start (Docker)

```bash
# Clone the repository
git clone https://github.com/your-org/ai-3d-studio.git
cd ai-3d-studio

# Copy environment template
cp .env.example /.env

# Start all services (with GPU)
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d

# Check status
docker compose ps

# View logs
docker compose logs -f backend
```

### Access Points

| Service | URL | Port | Description |
|---------|-----|------|-------------|
| **Frontend** | http://localhost:3000 | 3000 | Web application |
| **Backend API** | http://localhost:8000 | 8000 | REST API |
| **API Docs** | http://localhost:8000/docs | 8000 | Swagger UI |
| **ReDoc Docs** | http://localhost:8000/redoc | 8000 | ReDoc UI |
| **Admin Panel** | http://localhost:3000/admin | 3000 | Administration |
| **Model Manager** | http://localhost:3000/models | 3000 | V2 Feature |
| **Workspace** | http://localhost:3000/workspace | 3000 | Generation |

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
APP_VERSION=3.2.0

# ===== DATABASE =====
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/ai3dstudio

# ===== REDIS & CELERY =====
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# ===== AI PROVIDER =====
AI_PROVIDER=hunyuan3d-2.1
# Options: mock, trellis, triposr, instant_mesh, hunyuan3d-2, hunyuan3d-2.1, sdxl

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

- **Left Panel**: Input controls with model and quality selection
- **Center Area**: Live 3D preview with interactive rotation
- **Right Panel**: Output options and generation metadata
- **Bottom Dock**: Generation history with thumbnail previews

### Model Manager Interface (NEW in V2)

Navigate to `/models` to access the new model management system:

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

Navigate to `/admin` for:
- System overview with GPU/memory stats
- Job history and queue management
- Download queue monitoring
- Runtime configuration
- Health check reports
- Log viewer with filtering
- Terminal access for advanced operations

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

**Terminal 3 - Redis** (if not using Docker):
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

# Format code
npm run format

# Run tests
npm run test
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
npm run preview      # Preview production build
npm run lint         # ESLint
npm run format       # Prettier
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
├── 📄 docker-compose.yml              # Container orchestration
├── 📄 docker-compose.gpu.yml          # GPU variant
│
├── app/                               # Frontend (Next.js 15)
│   ├── layout.tsx                     # Root layout
│   ├── page.tsx                       # Landing page
│   ├── workspace/page.tsx             # Main generation workspace
│   ├── admin/page.tsx                 # Admin dashboard
│   ├── models/page.tsx                # Model manager (NEW V2)
│   │
│   └── features/                      # Feature modules
│       ├── landing/                   # Landing page components
│       ├── workspace/                 # Workspace UI
│       │   ├── components/
│       │   ├── hooks/
│       │   └── utils/
│       ├── admin/                     # Admin UI
│       │   ├── components/
│       │   ├── hooks/
│       │   └── stores/
│       └── model-manager/             # Model management UI (NEW V2)
│           ├── components/
│           │   ├── DownloadProgress.tsx
│           │   ├── CompatibilityChecker.tsx
│           │   └── ModelDetailsModal.tsx
│           └── tabs/
│               ├── InstalledModelsTab.tsx
│               ├── AvailableModelsTab.tsx
│               ├── BenchmarksTab.tsx
│               ├── HealthTab.tsx
│               ├── QueueTab.tsx
│               └── StorageTab.tsx
│
├── backend/                           # Python FastAPI Backend
│   ├── app/
│   │   ├── main.py                    # FastAPI entry point
│   │   │
│   │   ├── api/v1/                    # API Endpoints (12 routers)
│   │   │   ├── admin.py               # Admin operations
│   │   │   ├── generation.py          # Generation endpoints
│   │   │   ├── image_generation.py    # Image gen endpoints
│   │   │   ├── runtime.py             # Runtime configuration
│   │   │   ├── health.py              # Health checks
│   │   │   ├── jobs.py                # Job management
│   │   │   ├── upload.py              # File upload
│   │   │   ├── models.py              # Model CRUD (NEW V2)
│   │   │   ├── download.py            # Download ops (NEW V2)
│   │   │   ├── discover.py            # Model discovery (NEW V2)
│   │   │   ├── system.py              # System info (NEW V2)
│   │   │   └── __init__.py            # Router aggregation
│   │   │
│   │   ├── core/                      # Business Logic
│   │   │   ├── providers/             # AI Providers (12+ models)
│   │   │   │   ├── base.py
│   │   │   │   ├── huggingface_provider.py
│   │   │   │   ├── hunyuan3d.py
│   │   │   │   ├── trellis.py
│   │   │   │   ├── triposr.py
│   │   │   │   ├── instant_mesh.py
│   │   │   │   ├── sdxl.py
│   │   │   │   ├── github_provider.py       # NEW V2
│   │   │   │   ├── modelscope_provider.py   # NEW V2
│   │   │   │   ├── nvidia_ngc_provider.py   # NEW V2
│   │   │   │   ├── civitai_provider.py      # NEW V2
│   │   │   │   └── registry.py
│   │   │   │
│   │   │   ├── managers/              # Business Managers (NEW V2)
│   │   │   │   ├── compatibility_manager.py
│   │   │   │   ├── plugin_manager.py
│   │   │   │   ├── download_manager.py      # NEW V2
│   │   │   │   ├── environment_manager.py   # NEW V2
│   │   │   │   └── health_manager.py        # NEW V2
│   │   │   │
│   │   │   ├── downloader/            # Download Pipeline
│   │   │   │   ├── smart_downloader.py
│   │   │   │   ├── chunk_manager.py        # NEW V2
│   │   │   │   ├── mirror_fallback.py      # NEW V2
│   │   │   │   └── checksum_validator.py   # NEW V2
│   │   │   │
│   │   │   └── installer/             # Model Installation
│   │   │       ├── dependency_resolver.py
│   │   │       └── plugin_installer.py
│   │   │
│   │   ├── workers/                   # Celery Async Tasks
│   │   │   ├── celery_app.py
│   │   │   ├── tasks.py
│   │   │   ├── download_workers.py    # NEW V2
│   │   │   ├── installation_workers.py # NEW V2
│   │   │   ├── health_workers.py      # NEW V2
│   │   │   └── image_tasks.py
│   │   │
│   │   ├── models/                    # SQLAlchemy ORM Models
│   │   │   ├── __init__.py
│   │   │   ├── job.py
│   │   │   ├── download_queue.py      # NEW V2
│   │   │   └── registry.py
│   │   │
│   │   ├── schemas/                   # Pydantic Schemas
│   │   │   ├── __init__.py
│   │   │   ├── generation.py
│   │   │   └── manifest.py            # NEW V2
│   │   │
│   │   ├── database.py                # SQLAlchemy setup
│   │   └── config.py                  # Configuration
│   │
│   ├── runtime/                       # GPU/Runtime Utilities
│   │   ├── gpu.py
│   │   ├── platform_detection.py
│   │   └── memory_manager.py
│   │
│   ├── migrations/                    # Alembic DB Migrations
│   ├── requirements.txt                # Python dependencies
│   ├── requirements-dev.txt            # Dev dependencies
│   ├── .env.example                   # Environment template
│   └── Dockerfile                     # Container image
│
├── components/                         # Shared UI Components
│   ├── ui/                             # shadcn/ui (50+ components)
│   ├── premium/                        # Styled premium components
│   └── motion/                         # Framer Motion wrappers
│
├── stores/                             # Zustand State Stores
│   ├── workspace.ts
│   ├── admin.ts
│   └── models.ts
│
├── services/                           # API Client Layer
│   ├── api.ts
│   ├── generation.ts
│   ├── models.ts                       # NEW V2
│   └── download.ts                     # NEW V2
│
├── Docs/                               # Documentation (NEW)
│   ├── README.md                       # Documentation index
│   ├── api-documentation.md            # REST API reference
│   ├── architecture.md                 # System design
│   ├── setup-guide.md                  # Installation guide
│   ├── developer-guide.md              # Contributing guide
│   └── pipeline-status.md              # V2 progress tracking
│
│
├── .dockerignore                       # Docker build ignore
├── .gitignore                          # Git ignore
├── Dockerfile                          # Frontend container
├── Dockerfile.backend                  # Backend container
├── docker-compose.cpu.yml              # CPU variant
└── docker-compose.gpu.yml              # GPU variant
```

---

## 🔧 Troubleshooting

### Common Issues & Solutions

#### **GPU Not Detected**

```bash
# Verify NVIDIA GPU is present
nvidia-smi

# Check Docker GPU support
docker run --rm --gpus all nvidia/cuda:12.1-base nvidia-smi

# Ensure using GPU compose file
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d

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
docker compose up -e FRONTEND_PORT=3001
```

#### **Database Connection Failed**

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection manually
psql -h localhost -U ai3dstudio -d ai3dstudio

# Reset database
docker compose down -v  # Remove volumes
docker compose up -d db
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
export AI_PROVIDER=triposr  # Uses less VRAM
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
| Installed Models Tab | 5 | ✅ | `/models` page |
| Available Models Tab | 5 | ✅ | `/models` page |
| Benchmarks Tab | 5 | ✅ | `/models` page |
| Health Tab | 5 | ✅ | `/models` page |
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
  <sub>Last Updated: July 2026 | Version 3.2.0 | Pipeline V2 Complete</sub>
</p>
