# AI 3D Studio - Architecture Documentation

> **Version**: 3.4.9 (Workspace UI Cleanup)  
> **Last Updated**: August 9, 2026

---

## Table of Contents

1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Frontend Architecture](#frontend-architecture)
6. [Backend Architecture](#backend-architecture)
7. [Data Layer](#data-layer)
8. [Background Workers](#background-workers)
9. [AI Provider System](#ai-provider-system)
10. [Workspace Compatibility System](#workspace-compatibility-system)
11. [Texture Generation Pipeline](#texture-generation-pipeline)
12. [Download Pipeline](#download-pipeline)
13. [Health Check System](#health-check-system)
14. [Data Flow Diagrams](#data-flow-diagrams)
15. [Design Decisions](#design-decisions)
16. [Security Considerations](#security-considerations)
17. [Per-Model Storage Architecture](#per-model-storage-architecture)

---

## System Overview

**AI 3D Studio** is a full-stack web application for AI-powered 3D model generation and management. It enables users to:

- Generate 3D models from text prompts or reference images
- Download, install, and manage AI models from multiple sources
- Monitor system health and performance
- Render and preview 3D content in-browser

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Text-to-3D** | Generate 3D models from text descriptions |
| **Image-to-3D** | Convert 2D images to 3D models |
| **Model Management** | Install/uninstall AI models with dependency tracking |
| **Download Queue** | Resumable downloads with mirror fallback |
| **Health Monitoring** | Comprehensive system and model diagnostics |
| **GPU Scheduling** | VRAM-aware provider selection |
| **Multi-Provider** | Support for Hunyuan3D, TRELLIS, etc. |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   Next.js    │  │   Three.js  │  │  Framer      │                  │
│  │   Frontend   │  │   3D Viewer  │  │  Motion      │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘                  │
│         │                 │                                           │
└─────────┼─────────────────┼───────────────────────────────────────────┘
          │                 │ HTTP/SSE
          ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          API GATEWAY                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    FastAPI Backend (Port 8000)                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │  │
│  │  │Generation│ │ Models   │ │Download  │ │ System   │           │  │
│  │  │   API    │ │   API    │ │   API    │ │   API    │           │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘           │  │
│  │       └────────────┴────────────┴────────────┘                   │  │
│  │                         │                                        │  │
│  │  ┌─────────────────────▼─────────────────────┐                │  │
│  │  │            Core Business Logic             │                │  │
│  │  │  Managers │ Providers │ Workers │ Utils    │                │  │
│  │  └───────────────────────────────────────────┘                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
          │                 │
          ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        DATA & QUEUE LAYER                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │ PostgreSQL │  │   Redis    │  │   Celery   │  │  File      │       │
│  │ Database   │  │ Cache/Broker│  │  Workers   │  │ Storage    │       │
│  │  (Port 5432)│  │(Port 6379) │  │            │  │ /app/storage│     │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        GPU / HARDWARE LAYER                               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              NVIDIA GPU + CUDA Runtime                            │  │
│  │  PyTorch │ Diffusers │ Transformers │ Blender (Optional)        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.x | React framework with App Router |
| **React** | 19.x | UI library |
| **TypeScript** | 5.x | Type safety |
| **Tailwind CSS** | 4.x | Utility-first styling |
| **shadcn/ui** | Latest | UI component library |
| **Radix UI** | Latest | Accessible primitives |
| **Framer Motion** | 12.x | Animations |
| **Zustand** | Latest | State management |
| **Lucide React** | Latest | Icons |
| **Three.js** | - | 3D rendering |

### Backend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Python** | 3.12+ | Runtime environment |
| **FastAPI** | 0.115.x | Web framework |
| **SQLAlchemy** | 2.0.x | ORM |
| **Alembic** | 1.14.x | Database migrations |
| **Celery** | 5.4.x | Task queue |
| **Redis** | 7.x | Cache/message broker |
| **PyTorch** | 2.5.x | ML framework (CUDA) |
| **Diffusers** | 0.30+ | Diffusion models |
| **uvicorn** | 0.32.x | ASGI server |

### Infrastructure

| Component | Version | Purpose |
|----------|---------|---------|
| **PostgreSQL** | 16 | Primary database |
| **Redis** | 5.2 | Caching & broker |
| **NVIDIA CUDA** | 12.x | GPU compute |
| **Blender** | 4.x | 3D post-processing (optional) |

---

## Project Structure

```
ai-3d-studio/
│
├── app/                              # Next.js Application (App Router)
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Landing/workspace page (renders WorkspaceShell directly)
│   ├── workspace/page.tsx            # Main generation workspace
│   ├── generate/page.tsx             # Quick generate page
│   ├── render/page.tsx               # Render view
│   ├── texture/page.tsx              # Texture tools
│   ├── settings/page.tsx             # Unified settings (imports admin tabs)
│   ├── admin/page.tsx                # DEPRECATED — redirects to /settings?section=monitoring
│   │
│   └── api/v1/[...path]/route.ts     # API proxy route
│
├── features/                         # Feature modules (ROOT level, NOT under app/)
│   ├── landing/                      # Landing page feature
│   ├── admin/tabs/                   # Admin dashboard tabs
│   ├── render/                       # Render shell
│   ├── settings/sections/            # Settings sections
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
│   ├── texture/                      # Texture shell
│   ├── workspace/                    # Workspace feature
│   └── model-manager/                # Model management feature
│       ├── tabs/
│       │   ├── InstalledModelsTab.tsx
│       │   ├── AvailableModelsTab.tsx
│       │   ├── BenchmarksTab.tsx
│       │   ├── HealthTab.tsx
│       │   ├── QueueTab.tsx
│       │   └── StorageTab.tsx
│       └── components/
│           ├── CompatibilityChecker.tsx
│           ├── DownloadProgress.tsx
│           └── ModelDetailsModal.tsx
│
├── components/                       # Shared UI components
│   ├── ui/                           # shadcn/ui components (50+)
│   ├── premium/                      # Premium styled components
│   ├── motion/                       # Animation components
│   ├── landing/                      # Landing-specific
│   ├── pages/                        # Page components
│   └── image-gen/                    # Image generation UI
│
├── stores/                           # Zustand state stores
│   ├── useGenerationStore.ts
│   ├── useProjectStore.ts
│   ├── useThemeStore.ts
│   └── useUIStore.ts
│
├── services/                         # API service layer
│   ├── apiClient.ts                  # HTTP client
│   ├── generationService.ts
│   ├── runtimeService.ts
│   ├── uploadService.ts
│   └── adminService.ts
│
├── types/                            # TypeScript types
│   ├── index.ts
│   └── new-ui.ts
│
├── hooks/                            # Custom React hooks
│   ├── useToast.ts
│   ├── useGeneration.ts
│   └── useImageGeneration.ts
│
├── backend/                          # Python Backend
│   ├── app/
│   │   ├── main.py                   # FastAPI entry point
│   │   ├── config.py                 # Configuration
│   │   ├── database.py               # DB setup
│   │   │
│   │   ├── api/v1/                   # API endpoints
│   │   │   ├── __init__.py           # Router aggregation
│   │   │   ├── admin_router.py       # /admin
│   │   │   ├── generation_router.py  # /generation
│   │   │   ├── jobs_router.py        # /jobs
│   │   │   ├── health_router.py      # /health
│   │   │   ├── runtime_router.py     # /runtime
│   │   │   ├── upload_router.py      # /upload
│   │   │   ├── hf_token_router.py    # /hf-token
│   │   │   ├── models_api.py         # /models (no prefix)
│   │   │   ├── discover_router.py    # /discover (no prefix)
│   │   │   ├── download_router.py    # /download (no prefix)
│   │   │   ├── pipelines_router.py   # /pipelines (no prefix)
│   │   │   ├── system_router.py      # /system (no prefix)
│   │   │   ├── settings_router.py    # /settings (no prefix)
│   │   │   ├── project_router.py     # /project (no prefix)
│   │   │   └── rigging_router.py     # /rigging (no prefix)
│   │   │
│   │   ├── core/                     # Core business logic
│   │   │   ├── providers/            # AI model providers
│   │   │   │   ├── base.py           # Base classes
│   │   │   │   ├── registry.py       # Provider registry
│   │   │   │   ├── hunyuan3d*.py     # Hunyuan3D providers
│   │   │   │   ├── trellis*.py       # TRELLIS providers
│   │   │   │   ├── hunyuan3d*.py       # Hunyuan3D providers
│   │   │   │   ├── instant_mesh.py   # Instant Mesh
│   │   │   │   ├── detailgen3d.py    # DetailGen3D
│   │   │   │   ├── anigen_provider.py # AniGen provider
│   │   │   │   ├── huggingface_provider.py
│   │   │   │   ├── github_provider.py
│   │   │   │   ├── civitai_provider.py
│   │   │   │   ├── modelscope_provider.py
│   │   │   │   ├── nvidia_ngc_provider.py
│   │   │   │   └── mock.py           # Mock/testing
│   │   │   │
│   │   │   ├── managers/             # Business managers
│   │   │   │   ├── compatibility_manager.py
│   │   │   │   ├── download_manager.py
│   │   │   │   ├── environment_manager.py
│   │   │   │   ├── health_manager.py
│   │   │   │   └── vram_tracker.py
│   │   │   │
│   │   │   ├── downloader/          # Download system
│   │   │   │   ├── mirror_fallback.py
│   │   │   │   └── checksum_validator.py
│   │   │   │
│   │   │   ├── installer/           # Plugin installer
│   │   │   │   ├── plugin_installer.py
│   │   │   │   └── dependency_resolver.py
│   │   │   │
│   │   │   └── registry/             # Model registry
│   │   │       └── model_registry.py
│   │   │
│   │   ├── workers/                 # Celery tasks
│   │   │   ├── celery_app.py        # Celery config
│   │   │   ├── tasks.py             # 3D generation
│   │   │   ├── download_workers.py  # Download tasks
│   │   │   ├── installation_workers.py # Install tasks
│   │   │   ├── health_workers.py    # Health tasks
│   │   │   └── vram_health_worker.py
│   │   │
│   │   ├── models/                   # SQLAlchemy models
│   │   │   ├── job.py               # Generation job
│   │   │   └── registry.py          # Model registry
│   │   │
│   │   ├── schemas/                  # Pydantic schemas
│   │   │   ├── generation.py
│   │   │   └── manifest.py
│   │   │
│   │   └── utils/                    # Utilities
│   │       └── storage.py
│   │
│   └── runtime/                      # Runtime utilities
│       ├── engine.py                 # Runtime engine
│       ├── gpu.py                    # GPU detection
│       ├── health.py                 # Health checks
│       ├── installer.py              # Installer logic (resolve_install_targets, full_install)
│       ├── storage.py                # StorageConfig with per-model paths
│       └── platform_detection.py     # Platform detection
│
├── Docs/                             # Documentation
│   ├── api-documentation.md
│   ├── architecture.md
│   ├── setup-guide.md
│   ├── developer-guide.md
│   ├── pipeline-status.md
│   └── CHANGELOG.md
│
├── scripts/                          # Service management scripts
│   ├── bootstrap.sh
│   ├── setup.sh
│   ├── start.sh
│   ├── stop.sh
│   ├── restart.sh
│   ├── manager.sh
│   ├── update-models.sh
│   └── ...
│
├── .env.example                      # Environment template
└── package.json                      # Node.js dependencies
```

---

## Frontend Architecture

### Routing Structure

The application uses Next.js App Router. `app/page.tsx` renders `WorkspaceShell` directly.

### Component Hierarchy

```
App Layout
├── Landing Page
│   ├── LandingNavbar
│   ├── HeroSection
│   ├── FeaturesSection
│   ├── HowItWorksSection
│   ├── CTASection
│   └── LandingFooter
│
├── Workspace Shell
│   ├── WorkspaceNavbar
│   ├── LeftSidebar
│   │   ├── PromptInput
│   │   ├── ModelSelector
│   │   ├── QualitySelector
│   │   ├── ToggleOptions
│   │   └── ImageUpload
│   ├── CenterWorkspace
│   │   └── ThreeDViewer
│   │       ├── ViewerScene
│   │       ├── ViewerToolbar
│   │       └── DownloadArea
│   ├── RightSidebar
│   └── BottomDock
│       └── History Queue
│
├── Admin Shell
│   ├── AdminSidebar
│   └── Tabs (11 total)
│       ├── OverviewTab
│       ├── ConnectionsTab
│       ├── ModelsTab
│       ├── RuntimeTab
│       ├── JobsTab
│       ├── QueueTab
│       ├── HealthTab
│       ├── LogsTab
│       ├── StorageTab
│       ├── TerminalTab
│       └── SettingsTab
│
└── Model Manager
    ├── AvailableModelsTab
    ├── InstalledModelsTab
    ├── QueueTab
    ├── StorageTab
    ├── BenchmarksTab (NEW)
    └── HealthTab (NEW)
```

### State Management (Zustand)

#### Actual Stores

| Store File | Purpose |
|------------|---------|
| `useAppStore.ts` | Single source of truth (generation config, tasks, downloads, UI, project). Persists a subset to `localStorage`. |
| `useGenerationStore.ts` | Proxy over `useAppStore` — getters delegate to app store; a `useAppStore.subscribe` mirror block copies app state into its own state so `subscribeWithSelector` subscribers re-render. |
| `useProjectStore.ts` | Proxy over `useAppStore` — mirrors app state (same pattern as above). |
| `useThemeStore.ts` | Theme/appearance preferences (independent store). |
| `useUIStore.ts` | Proxy over `useAppStore` — mirrors UI state (same pattern as above). |

**Proxy store pattern (FE-001)**: A plain getter-only proxy (`get mode() { return useAppStore.getState().mode }`) never notifies `subscribeWithSelector` subscribers, so components froze. Each proxy store now ends with `useAppStore.subscribe((state) => { …ProxyStore.setState({…mirrored fields}) })` to actually push updates.

**Persistence (FE-023/024/026)**: `useAppStore` persists only JSON-safe, non-transient fields. `uploadedImage` (holds a `File` — unserializable) and `currentJob` (contains `Date` objects + stale result URLs) are deliberately excluded; `jobHistory` is re-fetched from the backend via `loadHistory()`. `recentPrompts` is capped at 10 entries.

#### Generation Store (`useGenerationStore`)
```typescript
interface GenerationState {
  // Mode Configuration
  mode: 'text-to-3d' | 'image-to-3d';
  quality: 'low-poly' | 'standard' | 'high-poly';
  generateTexture: boolean;
  
  // Input
  prompt: string;
  negativePrompt?: string;
  referenceImage?: string;
  
  // Job Management
  currentJob: GenerationJob | null;
  jobHistory: GenerationJob[];
  
  // Actions
  setPrompt: (prompt: string) => void;
  setQuality: (quality: QualityPreset) => void;
  startGeneration: () => Promise<void>;
  cancelJob: () => void;
}
```

#### UI Store (`useUIStore`)
```typescript
interface UIState {
  sidebarCollapsed: boolean;
  isFullscreen: boolean;
  creativeMode: boolean;
  activeWorkspaceTab: string;
  toggleSidebar: () => void;
  setFullscreen: (fs: boolean) => void;
}
```

### Service Layer Pattern

All API calls go through `apiClient.ts` which provides:

- Automatic retry with exponential backoff
- SSE streaming support
- File upload handling
- Error normalization
- Request/response logging

#### Actual Service Files

| File | Purpose |
|------|---------|
| `services/apiClient.ts` | Core HTTP client with retry, SSE, error handling |
| `services/generationService.ts` | Generation API operations |
| `services/runtimeService.ts` | Runtime status, options, HuggingFace token |
| `services/adminService.ts` | Admin/health/log operations |
| `services/uploadService.ts` | File upload handling |

```typescript
// Example usage
import { apiClient } from '@/services/apiClient';

const response = await apiClient.post('/generation', { prompt: '...' });
const data = response.data;
```

---

## Backend Architecture

### FastAPI Application Lifecycle

```
Startup Sequence:
1. Normalize CUDA_VISIBLE_DEVICES env var
2. Load configuration (Settings)
3. Setup logging
4. Initialize log broadcasting (admin panel)
5. Platform detection (GPU/CPU)
6. Create storage directories
7. Initialize RuntimeEngine (per-model venvs created on demand via `uv venv`)
8. Test database connection
9. Test Redis connection
10. Ready to serve requests
```

### Router Organization

```python
# backend/app/api/v1/__init__.py

from app.api.v1.admin import router as admin_router
from app.api.v1.discover import router as discover_router
from app.api.v1.download import router as download_router
from app.api.v1.generation import router as generation_router
from app.api.v1.health import router as health_router
from app.api.v1.hf_token import router as hf_token_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.models_api import router as models_router
from app.api.v1.pipelines import router as pipelines_router
from app.api.v1.runtime import router as runtime_router
from app.api.v1.system import router as system_router
from app.api.v1.settings import router as settings_router
from app.api.v1.upload import router as upload_router
from app.api.v1.rigging import router as rigging_router
from app.api.v1.project import router as project_router

# Routers with prefixes
router.include_router(generation_router, prefix="/generation")
router.include_router(jobs_router, prefix="/jobs")
router.include_router(health_router, prefix="/health")
router.include_router(runtime_router, prefix="/runtime")
router.include_router(upload_router, prefix="/upload")
router.include_router(rigging_router, prefix="/rigging")
router.include_router(project_router, prefix="/project")
router.include_router(admin_router, prefix="/admin")
router.include_router(hf_token_router, prefix="/hf-token")
router.include_router(pipelines_router)

# Routers with no prefix (own prefixes inside)
router.include_router(models_router)         # /models/*
router.include_router(discover_router)       # /discover/*
router.include_router(download_router)       # /download/*
router.include_router(system_router)         # /system/*
router.include_router(settings_router)       # /settings/*
```

> Note: `plugin_manager_router` was removed (BE-003) — it previously shadowed the richer `/admin/models` implementation that ModelsTab needs. The dead `plugin_manager.py` router registration is gone from the aggregator.

### Middleware Stack

1. **CORS Middleware** - Cross-origin request handling
2. **Global Exception Handler** - Unified error responses
3. **Static Files Mount** - `/static` for uploads/storage
4. **Request Timing Middleware** - logs every HTTP request (method, path, status, duration) to the backend log

#### Activity Logging (unified project log)

Every API call — frontend or backend — is written to the same backend log output (`logs/api.log` when started via `scripts/start.sh`):

- **Backend**: `request_timing_middleware` in `app/main.py` logs every HTTP request at INFO level (`GET /api/v1/... → 200 (12.3ms)`).
- **Frontend**: `components/ActivityLogger.tsx` (mounted once in `app/layout.tsx`) wraps `window.fetch` to capture all API calls (method, path, status, duration) and listens for button/link clicks. Each event is written to the browser console and fire-and-forget POSTed to `POST /api/v1/system/log`, which forwards it into the same backend log.
- **Result**: one unified log (`logs/api.log`) showing the whole project — backend requests, frontend API calls, and user clicks.

### API Proxy & Connectivity (FE-031)

The application uses a robust API proxy pattern to handle communication between the Next.js frontend and the FastAPI backend:

1.  **Direct Proxy**: Requests to `/api/v1/*` are intercepted by the Next.js API route at `app/api/v1/[...path]/route.ts`.
2.  **Runtime Resolution**: The proxy resolves the `BACKEND_URL` at **request time**. This enables the app to work seamlessly in Docker (targeting `http://api:8000`) or local dev (targeting `http://localhost:8000`) without rebuilds.
3.  **Environment Sync**: `NEXT_PUBLIC_API_URL` is kept empty by default. `services/apiClient.ts` uses relative paths, ensuring all traffic flows through the proxy, capturing logs and handling CORS server-side.

### Robust History Management (FE-032)

To prevent UI flickering and duplicated items, the workspace uses a multi-layered history sync:

1.  **Zustand Persisted Store**: `jobHistory` is managed in `useAppStore` and persisted in `localStorage`.
2.  **Server-Side Revalidation**: On mount, the `CreativeWorkspaceLayout` triggers `loadHistory()`, which fetches the latest 50 jobs from the backend.
3.  **Data Normalization**: The store normalizes varied backend job structures (e.g., flat `prompt` vs. nested `config`) into a stable frontend format.
4.  **Asset Context**: History items now carry their `modelUrl` and `thumbnailUrl` from the backend, allowing them to be loaded as live 3D projects rather than geometric placeholders.

---

## Data Layer

### Database Schema (PostgreSQL)

#### Generation Jobs Table

```sql
CREATE TABLE generation_jobs (
    id VARCHAR PRIMARY KEY,
    status VARCHAR DEFAULT 'pending',
    prompt TEXT NOT NULL,
    mode VARCHAR DEFAULT 'text-to-3d',
    quality VARCHAR DEFAULT 'standard',
    provider VARCHAR,
    
    -- Progress tracking
    progress INTEGER DEFAULT 0,
    stage VARCHAR,
    message TEXT,
    
    -- Output
    output_files JSONB,
    thumbnail_url VARCHAR,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Metadata
    metadata JSONB
);
```

### Redis Usage

| Purpose | Key Pattern | Type |
|---------|-------------|------|
| Job Progress | `job_progress:{job_id}` | Pub/Sub Channel |
| Cache | `cache:{key}` | String/Hash |
| Rate Limiting | `ratelimit:{user}:{endpoint}` | Counter |
| Worker Heartbeat | `worker:{id}:heartbeat` | Hash |
| Session Store | `session:{token}` | Hash |

---

## Background Workers

### Celery Configuration

```python
# backend/app/workers/celery_app.py

celery_app = Celery("ai3dstudio", broker=redis_url, backend=redis_result)

# Task routing
task_routes = {
    'app.workers.tasks.*': {'queue': 'generation'},
    'app.workers.image_tasks.*': {'queue': 'images'},
    'app.workers.download_workers.*': {'queue': 'downloads'},
}
```

### Task Definitions

#### 3D Generation Task (`tasks.generate_3d_model`)
```
Input: job_id (str)
Output: dict with result or raises Exception

Pipeline:
1. Fetch job from DB
2. Initialize RuntimeEngine
3. Resolve reference image
4. Enhance prompt (optional, via OpenAI)
5. Select/load AI provider (VRAM-aware)
6. Run inference with progress callbacks
7. Unload provider (free VRAM)
8. Optional: Blender post-process
9. Generate thumbnail
10. Build download URLs
11. Update job status in DB
12. Publish completion event
```

#### Download Task (`download_workers.execute_download`)
```
Input: download_id (str)
Output: success/failure with retry

Features:
- Chunked downloads with resume
- Mirror URL fallback on failure
- SHA256 checksum validation
- Auto-retry up to 3 times
- Progress callbacks via DB update
```

### Scheduled Tasks (Celery Beat)

```python
celery_app.conf.beat_schedule = {
    'process-downloads': {
        'task': 'app.workers.download_workers.start_queued_downloads',
        'schedule': crontab(minute='*/5'),  # Every 5 minutes
    },
    'health-checks': {
        'task': 'app.workers.health_workers.run_all_health_checks',
        'schedule': crontab(hour=0),  # Daily at midnight
    },
    'cleanup-downloads': {
        'task': 'app.workers.download_workers.cleanup_completed_downloads',
        'schedule': crontab(hour=3),  # Daily at 3 AM
    },
}
```

---

## AI Provider System

### Provider Architecture

```
BaseProvider (ABC)
├── Hunyuan3DProvider (hunyuan3d_local.py) - calls _add_model_env() at import time
│   ├── Hunyuan3D_2_1 (16GB VRAM)
│   └── Hunyuan3D_2 (24GB VRAM)
├── TRELLISProvider (trellis_local.py) - calls _add_model_env() at import time
│   └── ~8GB VRAM required
├── InstantMeshProvider (instant_mesh.py)
├── SDXLProvider (sdxl.py) - For 2D images
└── MockProvider (mock.py) - Testing without GPU
```

**Key Implementation Detail**: Local providers (hunyuan3d_local, trellis_local) must call `_add_model_env()` at the very top of the module (before any other imports) to ensure the per-model venv's site-packages take precedence over the backend process's shared dependencies (e.g., huggingface_hub version conflicts).

**torch/torchvision ABI lock**: All providers run in-process, so they share the backend's single `torch`. The installer pins each per-model venv's `torch`/`torchvision`/`torchaudio` to the backend's exact build via `_backend_torch_stack()` (in `runtime/installer.py`). Installing unpinned latest torch into a per-model venv causes an ABI mismatch — TRELLIS then crashes at import with `RuntimeError: operator torchvision::nms does not exist` because its `torchvision 0.28` registers operators against the backend's older `torch 2.5`. Keep the per-model torch stack identical to the backend's `+cuXXX` build.

### Provider Selection Algorithm

```python
def get_best_provider_name(requested=None):
    """
    VRAM-aware provider selection:
    1. If specific provider requested, check VRAM
    2. Try providers in priority order
    3. Skip if insufficient VRAM
    4. Fall back to mock if no GPU fits
    """
    
    PRIORITY = ["hunyuan3d-2.1", "trellis", "hunyuan3d-2", "mock"]
    VRAM_REQUIREMENTS = {
        "hunyuan3d-2.1": 16000,
        "trellis": 8000,
        "hunyuan3d-2": 24000,
        "mock": 0
    }
    
    available_vram = get_gpu_info().gpus[0].free_memory_mb
    
    for provider in PRIORITY:
        if available_vram >= VRAM_REQUIREMENTS[provider]:
            return provider
    
    return "mock"  # Fallback
```

### Download Providers

For downloading model weights from various sources:

```
DownloadProvider (ABC)
├── HuggingFaceProvider
├── GitHubProvider
├── CivitAIProvider
├── ModelScopeProvider
└── NVIDIA NGC Provider
```

Each implements:
- `list_models()` - Browse available models
- `get_model(id)` - Get model details
- `resolve_download_urls(id)` - Get download URLs
- `get_mirrors(url)` - Mirror URLs for fallback

---

## Workspace Compatibility System

### Overview

The workspace compatibility system prevents users from selecting incompatible models for specific tasks. Each model declares which workspace types it supports, and the frontend filters model lists accordingly.

### Workspace Types

| Workspace | Description | Compatible Models |
|-----------|-------------|-------------------|
| `mesh-generation` | Generate 3D meshes from text or images | hunyuan3d-2.1, hunyuan3d-2, trellis |
| `texture-generation` | Generate PBR textures and materials | hunyuan3d-2.1, hunyuan3d-2, trellis |
| `rigging` | Auto-rig 3D character meshes | anigen, unirig |
| `animation` | Generate skeletal animations | anigen, unirig |
| `remesh` | Retopology and mesh optimization | detailgen3d |
| `post-processing` | Detail enhancement and mesh polishing | hunyuan3d-2.1, hunyuan3d-2, detailgen3d |

### Backend Implementation

**Capability Matrix** (`backend/app/core/capability_matrix.py`):
- `WORKSPACE_TYPES`: Tuple of all supported workspace types.
- `_workspace_compatibility(model)`: Reads `workspace_compatibility` from model metadata or derives from capability flags.
- `is_compatible_with_workspace(model, workspace)`: Returns True if model supports the given workspace.
- `filter_by_workspace(models, workspace)`: Filters a list of models to compatible ones.
- `build_pipeline_snapshot()`: Now includes `workspace_compatibility` array per model in the snapshot.

**Model Registry** (`backend/app/core/registry/model_registry.py`):
- Each model manifest includes `workspace_compatibility: string[]`.
- Registry only surfaces models with a real provider class in `engine._PROVIDER_MAP`.

**Pipelines API** (`backend/app/api/v1/pipelines.py`):
- `GET /api/v1/pipelines/workspace-models?workspace=<type>&installed_only=<bool>`: Returns workspace-filtered models.
- `GET /api/v1/pipelines/workspace-types`: Returns all workspace types with descriptions.

### Frontend Implementation

**Hook** (`hooks/useBackendData.ts`):
- `useWorkspaceModels(workspace)`: Fetches models compatible with a specific workspace from `/api/v1/pipelines/workspace-models`.

**Workspace Tabs**:
- `ThreeDGenerationTab.tsx` → `useWorkspaceModels('mesh-generation')`
- `RiggingAnimationTab.tsx` → `useWorkspaceModels('rigging')`
- `RemeshTab.tsx` → `useWorkspaceModels('remesh')`
- `TextureGenTab.tsx` → `useWorkspaceModels('texture-generation')`

**Pipelines API** (`backend/app/api/v1/pipelines.py`):
- Workspace filter bar with counts per workspace type.
- Filtered model list with "Showing X of Y" caption.
- Workspace compatibility badges rendered on each pipeline card.

---

## Texture Generation Pipeline

### Overview

The texture generation workflow has been enhanced to support production-grade PBR material painting with model selection, resolution control, and material bias parameters.

### Supported Texture Models

| Model | Resolution Support | Style Presets | Best For |
|-------|-------------------|---------------|----------|
| **Hunyuan3D 2.1** | 512–4096px | Photorealistic, Stylized, Anime, Cyberpunk, Procedural | Complete asset texturing |
| **Hunyuan3D 2** | 512–4096px | Photorealistic, Stylized, Anime, Cyberpunk, Procedural | High-quality texturing |
| **TRELLIS** | 512–4096px | Photorealistic, Stylized, Anime, Cyberpunk, Procedural | Textured mesh generation |

### Texture Generation Flow

```
User selects texture model
         │
         ▼
Configure parameters:
- Resolution (512/1024/2048/4096)
- Style preset (Photorealistic, Stylized, Anime, Cyberpunk, Procedural)
- Weathering (0–100%)
- Metalness bias (0–100%)
- Roughness bias (0–100%)
         │
         ▼
POST /api/v1/generation
  mode: 'texture-generation'
  provider: <selected model>
  workspace: 'texture-generation'
  quality: <resolution-mapped>
  style_preset: <theme>
  generate_texture: true
  processing_metadata: { weathering, metalness_bias, roughness_bias }
         │
         ▼
Backend validates workspace compatibility
         │
         ▼
Provider runs texture generation (e.g., Hunyuan3DPaintPipeline)
         │
         ▼
Result returned with texture maps:
- Albedo (RGB)
- Roughness
- Metalness
- Normal (optional)
         │
         ▼
Frontend displays PBR Channel Diagnostics
```

### Frontend Controls (TextureGenTab)

- **Texture Model Selector**: Dropdown populated from `useWorkspaceModels('texture-generation')`.
- **Resolution Presets**: 512px (Draft), 1024px (Fast), 2048px (Balanced), 4096px (Ultra).
- **Style Presets**: Photorealistic PBR, Stylized Handpainted, Anime/Cel-Shaded, Cyberpunk Neon, Procedural.
- **PBR Bias Sliders**: Metalness Bias and Roughness Bias (0–100%).
- **Weathering Slider**: Surface wear and aging (0–100%).
- **Model Upload**: Optional GLB/GLTF target for texturing.

### Backend Integration

The generation API (`backend/app/api/v1/generation.py`) accepts:
- `provider`: Texture model ID (validated against workspace compatibility).
- `workspace`: `texture-generation` (soft validation against provider metadata).
- `processing_metadata`: Contains `weathering`, `metalness_bias`, `roughness_bias`.

---

## Download Pipeline

### Download Flow Diagram

```
User clicks "Download"
        │
        ▼
POST /api/v1/download/start
        │
        ▼
DownloadManager.start_download()
        │
        ├─→ Validate input
        ├─→ Check for duplicates
        ├─→ Create DownloadQueue record
        └─→ Return download_id
        │
        ▼
Celery: execute_download.delay(download_id)
        │
        ▼
DownloadManager.execute_download()
        │
        ├─→ Update status: DOWNLOADING
        ├─→ Find working URL (MirrorFallback)
        │       ├─→ Try primary URL
        │       ├─→ Try mirrors
        │       └─→ Fail if none work
        │
        ├─→ Chunked Download (ChunkManager)
        │       ├─→ Split into chunks (1MB each)
        │       ├─→ Download with resume support
        │       └─→ Report progress via callback
        │
        ├─→ Validate Integrity (ChecksumValidator)
        │       ├─→ Calculate SHA256
        │       └─→ Compare with expected
        │
        ├─→ On Success:
        │       ├─→ Update status: COMPLETED
        │       ├─→ Record file path
        │       └─→ Trigger install task
        │
        └─→ On Failure:
                ├─→ Increment retry_count
                ├─→ If retries < max: PENDING (will retry)
                └─→ Else: FAILED with error message
```

### Resume Capability

Downloads support resumption by:
1. Tracking `downloaded_size` in database
2. Using HTTP Range headers for partial content
3. Verifying existing file size before continuing
4. Only downloading remaining bytes

---

## Health Check System

### Check Categories

```
HealthManager.run_model_health_check(model_id)
        │
        ├─→ File Check (_check_files)
        │       ├─→ Model directory exists?
        │       ├─→ All required files present?
        │       └─→ File sizes reasonable?
        │
        ├─→ Dependency Check (_check_dependencies)
        │       ├─→ Python packages installed?
        │       ├─→ Versions compatible?
        │       └─→ List missing packages
        │
        ├─→ Manifest Check (_check_manifest)
        │       ├─→ Required fields present?
        │       ├─→ Version format valid?
        │       └─→ Return validation issues
        │
        ├─→ Disk Space Check (_check_disk_space)
        │       ├─→ Free space sufficient?
        │       └─→ Current model size
        │
        ├─→ GPU Compatibility (_check_gpu_compatibility)
        │       ├─→ CUDA available?
        │       ├─→ CUDA version meets requirement?
        │       └─→ VRAM sufficient?
        │
        └─→ Inference Test (optional)
                ├─→ Can model load?
                └─→ Does inference work?
```

### Health Status Values

| Status | Meaning | Action Required |
|--------|---------|-----------------|
| `healthy` | All checks pass | None |
| `warning` | Non-critical issues | Review recommended |
| `unhealthy` | Critical issues | Repair needed |
| `error` | Check failed | Investigation needed |

---

## Data Flow Diagrams

### 3D Generation Data Flow

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  User   │───▶│  Zustand │───▶│ Service  │───▶│  FastAPI │───▶│  Celery  │
│  Input  │    │  Store   │    │  Layer   │    │  API     │    │  Worker  │
└─────────┘    └──────────┘    └──────────┘    └──────────┘    └────┬─────┘
                                                                   │
                              ┌──────────────────────────────────────┘
                              │
                              ▼
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Three   │◀───│  SSE/    │◀───│  Redis   │◀───│  PyTorch │◀───│  GPU     │
│  .js     │    │  Poll    │    │  Pub/Sub │    │  Inference│    │  Hardware│
│  Viewer  │    │          │    │          │    │          │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### Download Data Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  User    │───▶│  Frontend│───▶│  POST    │───▶│ Download │───▶│  Celery  │
│  Clicks  │    │  UI      │    │  /start  │    │  Manager │    │  Task    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └────┬─────┘
                                                                  │
                              ┌──────────────────────────────────────┘
                              │
                              ▼
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  File    │◀───│  DB      │◀───│  Chunked │◀───│  Mirror  │◀───│  HTTP    │
│  Stored  │    │  Update  │    │  Download│    │  Fallback │    │  Request │
│          │    │          │    │          │    │          │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

---

## Design Decisions

### Why FastAPI over Django/Fastify?

| Factor | Decision |
|--------|----------|
| **Performance** | Async-native, faster than Django |
| **Type Safety** | Full Pydantic integration |
| **Auto-docs** | OpenAPI/Swagger out of box |
| **ML Ecosystem** | Better PyTorch integration |
| **Simplicity** | Less boilerplate than Django |

### Why Celery over ARQ/Dramatiq?

| Factor | Decision |
|--------|----------|
| **Maturity** | Battle-tested, widely adopted |
| **Monitoring** | Flower integration available |
| **Persistence** | Redis backend for reliability |
| **Scheduling** | Built-in Beat scheduler |
| **Scalability** | Horizontal scaling support |

### Why Zustand over Redux?

| Factor | Decision |
|--------|----------|
| **Simplicity** | Less boilerplate code |
| **Bundle Size** | Smaller footprint |
| **TypeScript** | First-class TS support |
| **DevTools** | Redux DevTools compatible |
| **Learning Curve** | Easier for team adoption |

### Why shadcn/ui over MUI/Ant Design?

| Factor | Decision |
|--------|----------|
| **Customization** | Copy-paste, full control |
| **Tree-shake** | Only import what you use |
| **Accessibility** | Radix primitives built-in |
| **Styling** | Tailwind CSS native |
| **Modern** | Active development |

---

## Security Considerations

### Implemented Measures

1. **CORS Configuration**
   - Configurable origins via env var
   - Credentials support for cookies

2. **File Upload Security**
   - File type validation (MIME + extension)
   - Size limits configurable
   - Path traversal prevention

3. **SQL Injection Prevention**
   - SQLAlchemy ORM parameterized queries
   - No raw SQL in user-facing code

4. **Environment Variables**
   - Secrets not in source code
   - `.env.example` for documentation
   - `.gitignore` excludes `.env`

### Recommendations for Production

1. Add authentication (JWT/API keys)
2. Implement rate limiting middleware
3. Set up HTTPS/TLS termination
4. Configure Content-Security-Policy headers
5. Enable audit logging
6. Regular security dependency scanning

---

## Per-Model Storage Architecture

Each model now lives in an isolated directory under `third_party/<RepoName>/` with its own virtual environment and weights subdirectory.

### Directory Layout

```
backend/
└── third_party/
    ├── AniGen/
    │   ├── .venv/                    # Per-model virtual environment (uv)
    │   │   ├── bin/python
    │   │   └── lib/python3.x/site-packages/
    │   ├── weights/                  # Model weights for this model
    │   │   └── *.safetensors
    │   ├── .installing.lock          # Concurrency lock (created during install)
    │   └── ...                       # Model source code
    ├── TRELLIS/
    │   ├── .venv/
    │   ├── weights/
    │   └── ...
    └── ...
```

### StorageConfig Methods

`StorageConfig` provides these methods for per-model paths:

| Method | Returns | Description |
|--------|---------|-------------|
| `get_model_venv_path(repo_name)` | `third_party/<repo>/.venv` | Per-model virtual environment path |
| `get_model_venv_python(repo_name)` | `third_party/<repo>/.venv/bin/python` | Python binary inside per-model venv |
| `get_model_weights_dir(repo_name)` | `third_party/<repo>/weights/` | Weights directory for a specific model |

### Weight Resolution Order

`get_weight_path()` resolves weights in this order:
1. **Per-model location**: `third_party/<repo_name>/weights/<filename>` (new, preferred)
2. **Legacy fallback**: `weights_dir/<provider_name>/<filename>` (old centralized location)

### Install Flow

1. `resolve_install_targets()` in `installer.py` validates the explicit model list (required — no "install everything" mode).
2. A file-based lock (`third_party/<repo_name>/.installing.lock`) prevents concurrent installs.
3. Disk space is checked before downloading weights.
4. `install_repo_deps()` creates a per-model venv using `uv venv` (uv is a hard dependency — no fallback).
5. Dependencies are uv-installed into the per-model venv.
6. `download_weights()` saves to `third_party/<repo_name>/weights/`.

### Native Deployment Storage

The project uses native service management via shell scripts. Model data directories (`storage`, `third_party`) are bind-mounted to the project directory by the host system. No Docker volumes are used.

```bash
# Storage paths (native setup)
./backend/storage/           # Generated outputs
./backend/third_party/       # Model repos, venvs, weights
```

A `.gitignore` excludes `backend/third_party/*`, `third_party/*/.venv/`, `third_party/*/weights/`, `.runtime_cache/`, and `storage/` from version control. Application directories are created at runtime by `storage.ensure_dirs()`.

---

*This document provides an overview of the AI 3D Studio architecture. For implementation details, see the Developer Guide.*

## Pipelines & Capability Architecture

The backend pipelines flow drives workspace model pickers and feature gating (the Settings → Pipelines UI page was removed; the AI Models page now hosts the Global AI Capability toggles):

1. `ModelRegistry` returns the current installed + available catalog.
2. `capability_matrix.py` converts manifests into UI feature flags.
3. `backend/app/api/v1/pipelines.py` stores the enabled map in the runtime cache and serves the snapshot / workspace-models.
4. `services/runtimeService.ts` reads runtime status and options for GPU / provider UI.

### Current model catalog

- Hunyuan3D 2.1 — text/image-to-3D, texture generation
- Trellis — image-to-3D, text-to-3D, texture generation
- UniRig — rigging and animation

### Feature gating summary

- `texture_generation` is enabled when at least one texture-capable model is active.
- `rigging_animation` is enabled when UniRig is active.
- `detail_enhancement` is enabled when DetailGen3D is active.
- `text_to_3d` is enabled when Hunyuan3D 2.1 or Trellis is active.
- `image_to_3d` is enabled when the catalog includes a compatible generation model.
