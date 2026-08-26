# AI 3D Studio - Setup & Installation Guide

> **Version**: 4.1.2 (Security & Stability Fixes)  
> **Difficulty**: Intermediate  
> **Estimated Time**: 15-30 minutes (runtime only; weights are on-demand)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Hardware Requirements](#hardware-requirements)
3. [Quick Start (Native)](#quick-start-native)
4. [Two-Stage Installation](#two-stage-installation)
5. [Manual Installation](#manual-installation)
6. [Environment Configuration](#environment-configuration)
7. [GPU Setup](#gpu-setup)
8. [Troubleshooting](#troubleshooting)
9. [Verification](#verification)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Git** | Latest | Clone repository |
| **Node.js** | 18+ (for dev) | Frontend development |
| **Python** | 3.12+ (for dev) | Backend development |
| **uv** | Latest (for dev) | Per-model venv creation |

> **Note**: `uv` is a **hard dependency** for this project. It is used for per-model virtual environment creation and all Python package management. Install it with `curl -LsSf https://astral.sh/uv/install.sh | sh`. There is **no fallback** to `pip` or `python -m venv`.

### Operating System Support

| OS | Status | Notes |
|----|--------|-------|
| **Ubuntu 22.04/24.04** | ✅ Fully Supported | Recommended |
| **Debian 12** | ✅ Supported | May need additional packages |
| **CentOS/RHEL 9** | ⚠️ Partial | SELinux adjustments needed |
| **Windows WSL2** | ✅ Supported | Use Ubuntu distro |
| **macOS** | ❌ Not Supported | No NVIDIA GPU support |

---

## Hardware Requirements

### Minimum Specifications (for Mock Provider)

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 4 cores | 8+ cores |
| **RAM** | 8 GB | 16 GB |
| **Storage** | 50 GB SSD | 100 GB NVMe SSD |
| **GPU** | None (CPU mode) | - |

### Recommended Specifications (for AI Generation)

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 8 cores | 16 cores |
| **RAM** | 32 GB | 64 GB |
| **Storage** | 100 GB SSD | 500 GB NVMe SSD |
| **GPU** | RTX 3060 (12GB) | RTX 4090 (24GB) A100 (80GB) |

### GPU VRAM Requirements by Model

| Model | VRAM Required | Quality | Speed |
|-------|---------------|---------|-------|
| **DetailGen3D** | 4 GB | Post-processing | ~15 seconds |
| **Hunyuan3D-2 Mini** | 6 GB | image-to-3D | ~45 seconds |
| **AniGen** | 6.2 GB | Rigging / animation | ~30 seconds |
| **Trellis** | 8 GB (12 GB native-build) | High quality | ~60 seconds |
| **TripoSG** | 8 GB | image-to-3D | ~60 seconds |
| **UniRig** | 8 GB | Rigging / animation | ~30 seconds |
| **Hunyuan3D-2** | 16 GB (24.5 GB normal peak) | High quality | ~75 seconds |
| **Hunyuan3D-2.1** | 21 GB texture / 29 GB combined | High quality | ~90 seconds |

> VRAM figures are the verified normal-footprint requirements. Hunyuan3D-2 (24.5 GB peak / 16 GB low-VRAM combined) and Hunyuan3D-2.1 (29 GB peak / 10 GB low-VRAM combined) also support a verified **low-VRAM** mode (CPU offload) for constrained GPUs; Hunyuan3D-2-Mini (6 GB peak) uses the same low-VRAM machinery. TRELLIS, TripoSG, AniGen, UniRig, and DetailGen3D do not support low-VRAM mode (they require a native CUDA build or have no verified low-VRAM path).


---

## Quick Start (Native)

### Method 1: Using Setup Script (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/ai-3d-studio.git
cd ai-3d-studio

# Make scripts executable
chmod +x scripts/*.sh manager.sh

# Run Stage A setup (runtime only — no weights downloaded)
./scripts/setup.sh

# Start services
./scripts/start.sh
```

> **Important**: `setup.sh` performs **Stage A only** — it clones repos, creates per-model venvs, and installs dependencies. Weights are **not** downloaded during setup. After startup, download weights via the UI or API (see [Two-Stage Installation](#two-stage-installation)).

### Access Points After Startup

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | Web application |
| **Backend API** | http://localhost:8000 | REST API |
| **API Docs** | http://localhost:8000/docs | Swagger UI |
| **Prompt Assistant** | built-in | Optional AI prompt enhancement |

### Project Activity Logging

The whole project — backend requests, frontend API calls, and user clicks — is written to one unified log (`logs/api.log` when started via `scripts/start.sh`).

- **Backend**: every HTTP request is logged at INFO level by the request timing middleware (`GET /api/v1/... → 200 (12.3ms)`).
- **Frontend**: `components/ActivityLogger.tsx` captures all API calls and button/link clicks, writes them to the browser console, and forwards them to `POST /api/v1/system/log` so they land in the same backend log.

**To view**:
1. Start in **Dev Mode**: `bash scripts/start.sh` → choose `1) Dev Mode`
2. Tail the unified log:
   ```bash
   tail -f logs/api.log
   ```
3. Browser console also shows live `[activity]` lines for every click and API call.

---

## Two-Stage Installation

Since v4.1, model installation is split into two independent stages:

### Stage A: Runtime Preparation

Clones repos, creates per-model venvs, installs Python dependencies, and resolves native dependencies via wheel-first logic. This is what `setup.sh` runs.

**Via setup script:**
```bash
./scripts/setup.sh
```

**Via API:**
```bash
curl -X POST http://localhost:8000/api/v1/runtime/prepare-runtime \
  -H "Content-Type: application/json" \
  -d '{"models": ["hunyuan3d-2.1", "trellis", "triposg"]}'
```

### Stage B: Weight Download

Downloads model weights and auxiliary weights. Requires Stage A to be complete for each model.

**Via UI:**
- Navigate to the Model Manager in the web UI
- Click "Download Weights" for each model you want to use

**Via API:**
```bash
curl -X POST http://localhost:8000/api/v1/runtime/download-weights \
  -H "Content-Type: application/json" \
  -d '{"models": ["hunyuan3d-2.1", "trellis", "triposg"]}'
```

### Component-Level State Machine

Each model's installation progress is tracked per component with explicit states:

| Component | States |
|-----------|--------|
| **repo** | `missing` → `ready` / `failed` |
| **venv** | `missing` → `creating` → `ready` / `failed` |
| **deps** | `pending` → `installing` → `ready` / `partial` / `failed` |
| **native** | `not_required` → `checking_wheel` → `wheel_found` → `wheel_installed` / `build_pending` → `build_running` → `ready` / `skipped` / `failed` |
| **weights** | `missing` → `downloading` → `ready` / `incomplete` |
| **preflight** | `pending` → `running` → `passed` / `failed` |

**Check status:**
```bash
curl http://localhost:8000/api/v1/admin/install/status
```

### Dependency Resolver (Wheel-First)

The new `dependency_resolver.py` uses wheel-first logic for native packages:

1. Discovers dependency files (requirements.txt, pyproject.toml, setup.py, manifest)
2. Classifies each dependency (NORMAL, NATIVE, BUILD_ONLY, OPTIONAL)
3. For NATIVE deps: checks `WHEEL_COMPAT_TABLE` for prebuilt wheel availability
4. If wheel exists → install it (no compilation)
5. If no wheel → prompt for source build or skip

This reduces install time and CUDA build failures, especially on Python 3.12.

### Available Models (v4.1)

| Model ID | Repo Entry | Category |
|----------|------------|----------|
| `hunyuan3d-2.1` | `Hunyuan3D-2.1` | 3D Generation |
| `hunyuan3d-2` | `Hunyuan3D-2` | 3D Generation |
| `hunyuan3d-2-mini` | `Hunyuan3D-2mini` | 3D Generation |
| `trellis` | `TRELLIS` | 3D Generation |
| `triposg` | `TripoSG` | 3D Generation |
| `anigen` | `AniGen` | Rigging |
| `unirig` | `UniRig` | Rigging |
| `detailgen3d` | `DetailGen3D` | Post-processing |

> **Note**: `Hunyuan3D-2mini` is a **separate repo entry** from `Hunyuan3D-2`. They share the same GitHub URL (`Tencent-Hunyuan/Hunyuan3D-2.git`) but have independent manifests, weights paths, and venvs. This allows the mini variant to be installed and updated independently.

### Colab Preparation Policy

Models are automatically prepared on Colab only if they pass BOTH criteria:
- VRAM < 15 GB (Colab T4/P100 have ~16 GB)
- Weight download ≤ 10 GB (Colab free-tier disk limit)

| Model | VRAM | Weight | Colab Prep | Reason |
|-------|------|--------|------------|--------|
| DetailGen3D | 4 GB | 2 GB | ✅ Prepared | Passes both gates |
| Hunyuan3D-2mini | 6 GB | 4 GB | ✅ Prepared | Passes both gates |
| TripoSG | 8 GB | 2 GB | ✅ Prepared | Passes both gates |
| AniGen | 6.2 GB | 23 GB | ❌ Skipped | Weight exceeds 10 GB ceiling |
| TRELLIS | 8 GB | 3 GB | ❌ Skipped | Requires native CUDA build (no toolkit on Colab) |
| UniRig | 8 GB | 2 GB | ❌ Skipped | Requires native CUDA build (no toolkit on Colab) |
| Hunyuan3D 2 | 24 GB | 24 GB | ❌ Skipped | VRAM exceeds 15 GB limit |
| Hunyuan3D 2.1 | 29 GB | 14 GB | ❌ Skipped | VRAM exceeds 15 GB limit |

---

## Manual Installation

For development or custom deployments.

### 1. System Dependencies (Ubuntu)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install base dependencies
sudo apt install -y \
    build-essential \
    curl \
    wget \
    git \
    python3.12 \
    python3.12-venv \
    python3-pip \
    nodejs \
    npm \
    postgresql \
    redis-server \
    nginx

# Install NVIDIA drivers (if using GPU)
sudo apt install -y nvidia-driver-535 nvidia-cuda-toolkit nvidia-cuda-toolkit-gcc
```

### 2. PostgreSQL Setup

```bash
# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database
sudo -u postgres psql <<EOF
CREATE USER ai3dstudio WITH PASSWORD 'your_password';
CREATE DATABASE ai3dstudio OWNER ai3dstudio;
GRANT ALL PRIVILEGES ON DATABASE ai3dstudio TO ai3dstudio;
EOF
```

### 3. Redis Setup

```bash
# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify
redis-cli ping
# Should return: PONG
```

### 4. Backend Setup

```bash
# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies (uv manages the environment automatically)
cd backend
uv venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt

# Copy environment file
cp ../env.example .env

# Configure environment
nano .env

# Run database migrations
alembic upgrade head

# Or create tables directly
python -c "from app.models.registry import Base; from app.database import engine; Base.metadata.create_all(engine)"
```

### 5. Frontend Setup

```bash
cd ..

# Install Node.js dependencies
npm install

# Copy environment if needed
cp .env.example .env.local

# Build for production
npm run build

# Or start development server
npm run dev
```

### 6. Start Services

```bash
# Terminal 1: Backend
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Celery Worker (with embedded beat scheduler)
cd backend
source .venv/bin/activate
celery -A app.workers.celery_app worker --loglevel=info -B -Q generation,images

# Terminal 3: Frontend
npm run dev
```

### 7. Download Weights (After Services Start)

```bash
# Download weights for specific models
curl -X POST http://localhost:8000/api/v1/runtime/download-weights \
  -H "Content-Type: application/json" \
  -d '{"models": ["hunyuan3d-2.1"]}'

# Or use the UI: navigate to Model Manager → Download Weights
```

---

## Environment Configuration

### Required Variables

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

### Core Configuration

```env
# ===== APPLICATION =====
ENVIRONMENT=development
DEBUG=true
APP_NAME=AI 3D Studio
APP_VERSION=4.1.0

# ===== DATABASE =====
DATABASE_URL=postgresql+asyncpg://ai3dstudio:password@localhost:5432/ai3dstudio
SYNC_DATABASE_URL=postgresql://ai3dstudio:password@localhost:5432/ai3dstudio

# ===== REDIS & CELERY =====
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# ===== API SETTINGS =====
BACKEND_URL=http://localhost:8000   # Used by the Next.js API proxy at request time
API_V1_PREFIX=/api/v1
CORS_ORIGINS=["http://localhost:3000","http://localhost:8000"]
MAX_UPLOAD_SIZE=52428800  # 50MB
```

> **Database**: The full install uses PostgreSQL (`DATABASE_URL=postgresql+asyncpg://…`). Colab and other container/SQLite environments set `USE_SQLITE=1` and `DATABASE_URL=sqlite:///…/studio.db` instead — no PostgreSQL required.

### AI Provider Settings

```env
# ===== AI PROVIDER =====
AI_PROVIDER=hunyuan3d-2.1
RUNTIME_MODE=local

# Options: mock, hunyuan3d-2.1, hunyuan3d-2, hunyuan3d-2-mini, trellis, triposg, anigen, unirig, detailgen3d
# (aliases: hunyuan3d, hunyuan3d-1.0 -> hunyuan3d-2.1)

# ===== GPU SETTINGS =====
CUDA_DEVICE=auto
MAX_VRAM_MB=0  # 0 = auto-detect
VRAM_SAFETY_MARGIN_MB=1024
AUTO_UNLOAD_AFTER_JOB=true
```

### Storage Paths

```env
# ===== STORAGE =====
STORAGE_BACKEND=local
STORAGE_LOCAL_PATH=/app/storage
WEIGHTS_DIR=/app/storage/models
THIRD_PARTY_DIR=/app/storage/third_party
UPLOAD_DIR=/app/storage/uploads
EXPORT_DIR=/app/storage/exports
THUMBNAIL_DIR=/app/storage/thumbnails
```

> **Per-model layout (v3.2+)**: Each model is fully self-contained under `third_party/<RepoName>/` with its own `.venv/` (created by `uv`), `weights/`, `cache/`, `logs/`, and `metadata.json`. The old centralized `third_party/weights/` is deprecated. `.runtime_cache/` holds shared install state. Run `./scripts/update-models.sh --migrate` if upgrading from an earlier version.

### Optional Features

```env
# ===== OPENAI (Prompt Enhancement) =====
OPENAI_API_KEY=sk-...
PROMPT_ENHANCEMENT_ENABLED=false

# ===== HUGGINGFACE =====
HF_TOKEN=hf_...

# ===== BLENDER (Optional) =====
BLENDER_ENABLED=false
BLENDER_EXECUTABLE=/usr/bin/blender

# ===== PROMPT ASSISTANT =====
PROMPT_ENHANCEMENT_ENABLED=true
```

---

## GPU Setup

### Verify NVIDIA Driver Installation

```bash
# Check driver version
nvidia-smi

# Expected output:
# +-----------------------------------------------------------------------------+
# | NVIDIA-SMI 535.154.05   Driver Version: 535.154.05   CUDA Version: 12.2   |
# |-------------------------------+----------------------+----------------------+
# |  GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
# | Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
# |                               |                      |               MIG M. |
# |===============================+======================+======================|
# |   0  NVIDIA RTX ...     Off  | 00000000:01:00.0 Off |                  N/A |
# | 30°C    P8    17W / 450W      |   0MiB / 24576MiB |      0%      Default |
# +-------------------------------+----------------------+----------------------+
```

### Test CUDA Availability

```bash
# Test with PyTorch CUDA
python -c "import torch; print(torch.cuda.is_available())"
```

### Install NVIDIA Container Toolkit (Optional)

```bash
# Add NVIDIA repository
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
```

### Verify GPU in Containers (if using containers)

```bash
# Test GPU access from container
docker run --rm --gpus all ubuntu:22.04 nvidia-smi

# Should show same output as host nvidia-smi
```

---

## Troubleshooting

### Common Issues

#### 1. Port Already in Use

```bash
Error: listen EADDRINUSE: address already in use :::3000

# Solution: Find and kill process using port
lsof -i :3000
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

#### 2. GPU Not Detected

```bash
# Check if nvidia-smi works
nvidia-smi

# If not found:
# 1. Verify driver installation
# 2. Check kernel module: lsmod | grep nvidia
# 3. Reboot after driver install
```

#### 3. Database Connection Failed

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -h localhost -U ai3dstudio -d ai3dstudio

# Common fixes:
# 1. Ensure user/password correct in .env
# 2. Check pg_hba.conf allows connections
# 3. Verify PostgreSQL is listening on port 5432
```

#### 4. Redis Connection Failed

```bash
# Check Redis is running
sudo systemctl status redis-server

# Test connection
redis-cli ping

# Common fixes:
# 1. Start Redis: sudo systemctl start redis-server
# 2. Check bind address in redis.conf
# 3. Verify port 6379 is accessible
```

#### 5. Out of Memory (OOM)

```bash
# Check available RAM
free -h

# Reduce worker concurrency
WORKER_CONCURRENCY=1

# Use smaller batch sizes
BATCH_SIZE=1

# Monitor GPU memory
watch -n 1 nvidia-smi
```

#### 6. Download Failures

```bash
# Check network connectivity
curl -I https://huggingface.co

# Verify disk space (per-model weights live under third_party/)
df -h ./backend/third_party/

# Retry failed downloads via API
curl -X POST http://localhost:8000/api/v1/runtime/download-weights \
  -H "Content-Type: application/json" \
  -d '{"models": ["hunyuan3d-2.1"]}'
```

#### 7. Migrating Weights from Old Layout

If you previously installed models with the centralized `third_party/weights/` layout, migrate them:

```bash
# Run the migration script (copy-then-verify strategy)
./scripts/update-models.sh --migrate
```

This copies weights from `third_party/weights/<provider>/` into `third_party/<RepoName>/weights/` and verifies integrity afterwards.

#### 8. Provider Import Errors (huggingface_hub version conflicts)

If you see errors like `ImportError: cannot import name 'is_offline_mode'`:

This indicates a version conflict between the backend process's huggingface_hub and the per-model venv's version. The fix (v3.2.1+) calls `_add_model_env()` at the top of local provider files (hunyuan3d_local, trellis_local) to reload packages from the per-model venv context.

To verify the fix is applied:

```bash
# Check provider module for correct import order
grep -n "_add_model_env" backend/app/core/providers/hunyuan3d_local.py

# Should appear BEFORE any other imports (asyncio, logging, etc.)
```

If the issue persists:

```bash
# Ensure you're running v3.2.1+ with the provider fix
git log --oneline | head -5

# Restart the backend to clear cached imports
pkill -f uvicorn  # or ./scripts/manager.sh restart
```

#### 9. Provider Import Errors (torch/torchvision version mismatch)

If generation fails immediately for `trellis` (or `hunyuan3d`) with:

```
RuntimeError: operator torchvision::nms does not exist
```

the per-model venv's `torch`/`torchvision` is newer than the backend's and ABI-incompatible with
the in-process backend `torch`. This happens when the per-model venv was created with unpinned
`torch/torchvision/torchaudio` (resolves to the latest release).

The installer pins each per-model venv's torch stack to the backend's exact build
(`backend/runtime/installer.py` → `_backend_torch_stack()`), so a fresh install no longer hits this.
If an existing venv is affected, reinstall its torch stack to match the backend:

```bash
# Find the backend torch build
backend/.venv/bin/python -c "import torch, torchvision; print(torch.__version__, torchvision.__version__)"

# Reinstall the matching stack into the affected per-model venv
uv pip install --python backend/third_party/TRELLIS/.venv/bin/python \
  --index-url https://download.pytorch.org/whl/cu121 --extra-index-url https://pypi.org/simple \
  torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 setuptools wheel
```

> The `+cuXXX` index is derived automatically from the backend's torch local version tag
> (`2.5.1+cu121` → `cu121`). Use whichever CUDA tag your backend torch reports.

#### 10. TRELLIS FlexiCubes Submodule (separate, pre-existing)

TRELLIS needs its `trellis/representations/mesh/flexicubes` submodule built (it is a CUDA
extension requiring `kaolin`). The installer now clones submodules, but the extension still must be
built in the per-model venv. Until that is done, TRELLIS import fails at
`from .flexicubes.flexicubes import FlexiCubes`. This is independent of the torch mismatch above.

#### 11. TRELLIS / Hunyuan3D-2: `accelerate` import picks backend `.venv` first

If generation fails immediately for `trellis` or `hunyuan3d-2` with:

```
AttributeError: module 'numpy._core' has no attribute 'multiarray'
```

the per-model venv's `transformers` is importing the **backend** `.venv`'s `accelerate` instead of its own. This happens because the backend `.venv` sits earlier on `sys.path` than the per-model venv.

**Fix (v3.2.2+):** `_add_model_env()` in `backend/app/core/providers/base.py` now moves the backend `.venv` to the **end** of `sys.path` after prepending the per-model venv, so fresh imports resolve to the per-model venv first. Packages already loaded from the backend venv stay in `sys.modules` and continue to work.

To verify:

```bash
grep -A4 "Move the backend .venv" backend/app/core/providers/base.py
```

If the issue persists after upgrading, restart the backend to clear stale imports:

```bash
pkill -f uvicorn
bash scripts/start.sh
```

#### 12. TripoSG: `HFValidationError` when loading RMBG-1.4 from local weights

If you see:

```
huggingface_hub.errors.HFValidationError: Repo id must be in the form 'repo_name' or 'namespace/repo_name': '.../weights/RMBG-1.4'
```

this is caused by newer `huggingface_hub` versions validating absolute paths as repo IDs. The TripoSG provider now passes `local_files_only=True` and `trust_remote_code=True` to `BriaRMBG.from_pretrained()` so local weight directories load without hub validation.

To verify on a fresh VPS:

```bash
# Ensure RMBG weights exist
ls backend/third_party/TripoSG/weights/RMBG-1.4

# Run a TripoSG generation; it should load RMBG without the HFValidationError
```

#### 13. 3D Viewer: Uploaded models not appearing across tabs

If uploading a `.glb` in one workspace tab leaves the 3D viewer empty:

- **Cause:** the upload response returns a relative `/static/models/...` URL, which the GLTFLoader cannot resolve when the app runs behind a proxy or nested route.
- **Fix (v3.2.2+):** `services/uploadService.ts` resolves `/static/` URLs to absolute URLs via `window.location.origin` before storing them. All workspace tabs (`TextureGenTab`, `RemeshTab`, `RiggingAnimationTab`) now use `loadModelInViewer()` from the global `useViewerStore`, so the model appears in every mounted viewer immediately.

#### 14. 3D Viewer: Viewport not synced across tabs

Camera position and orbit target are now shared through `useViewerStore.viewport`. Rotating or panning in one tab updates all other tabs' cameras in real time.

#### 15. Fresh VPS: Re-run model install to pick up corrected dependency pins

After updating `backend/runtime/installer.py` (dependency pins for `huggingface_hub` and `accelerate`), a fresh VPS or an existing install must re-run model installation so the new pins take effect in each per-model venv:

```bash
# Reinstall affected models to pick up corrected dependency pins
bash manager.sh
# or via API:
curl -X POST http://localhost:8000/api/v1/runtime/prepare-runtime \
  -H "Content-Type: application/json" \
  -d '{"models": ["trellis","hunyuan3d-2","triposg"]}'
```

This is required because per-model `.venv/` directories are created at install time and are **not** automatically updated when dependency pins change in code. Skipping this step leaves the old (broken) pins in place and the runtime errors persist.

#### 16. Native Dependency Wheel Resolution Failures

If a native dependency fails to install during Stage A:

```bash
# Check which component failed
curl http://localhost:8000/api/v1/admin/install/status

# Look for "native" component state = "failed" or "checking_wheel"
```

The wheel-first resolver checks a static compatibility table (`WHEEL_COMPAT_TABLE`) for prebuilt wheels. If no wheel is available for your Python/CUDA combination, it falls back to source build or skips.

To force a source build for a specific package:

```bash
# Enter the per-model venv
source backend/third_party/<RepoName>/.venv/bin/activate

# Install the native dependency from source
pip install <package> --no-binary :all:
```

Common native packages and their wheel availability:

| Package | Wheel Available | Index |
|---------|-----------------|-------|
| `torch-cluster` | ✅ Yes | `data.pyg.org/whl` |
| `torch-scatter` | ✅ Yes | `data.pyg.org/whl` |
| `torch-sparse` | ✅ Yes | `data.pyg.org/whl` |
| `flash-attn` | ❌ No (source only) | - |
| `pytorch3d` | ✅ Yes | PyTorch index |
| `xformers` | ✅ Yes | PyTorch index |
| `kaolin` | ✅ Yes | NVIDIA S3 |
| `spconv` | ✅ Yes | PyPI |
| `cupy-cuda12x` | ✅ Yes | PyPI |
| `nvdiffrast` | ❌ No (git install) | - |
| `torchmcubes` | ❌ No (source only) | - |
| `diso` | ❌ No (source only) | - |

---



### Log Locations

| Service | Log Command | Location |
|---------|-------------|----------|
| **API Server** | `./scripts/manager.sh` → logs | stdout/stderr |
| **Worker** | `./scripts/manager.sh` → logs | stdout/stderr |
| **Frontend** | `./scripts/manager.sh` → logs | stdout/stderr |
| **PostgreSQL** | `sudo systemctl status postgresql` | /var/log/postgresql/ |
| **Redis** | `redis-cli monitor` | stdout |

### Debug Mode

Enable verbose logging:

```env
# In .env
DEBUG=true
LOG_LEVEL=DEBUG
```

View real-time logs:

```bash
# Using manager.sh
./scripts/manager.sh

# Or check service logs directly
journalctl -u redis-server -f
```

---

## Verification

### Health Check Endpoint

```bash
curl http://localhost:8000/api/v1/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### System Info Endpoint

```bash
curl http://localhost:8000/api/v1/system/info
```

### Frontend Verification

1. Open browser to http://localhost:3000
2. Should see landing page
3. Navigate to `/workspace`
4. Try generating with mock provider

### GPU Verification

```bash
curl http://localhost:8000/api/v1/system/gpu
```

Expected response (if GPU available):
```json
{
  "success": true,
  "data": {
    "available": true,
    "gpus": [
      {
        "name": "NVIDIA RTX 4090",
        "vram_gb": 24,
        "cuda_version": "12.1"
      }
    ]
  }
}
```

### Runtime Status Verification

```bash
# Check runtime preparation status
curl http://localhost:8000/api/v1/runtime/status

# Check component-level install status
curl http://localhost:8000/api/v1/admin/install/status
```

### End-to-End Test

After running setup, downloading weights, and starting services:

```bash
# 1. Start a generation job
curl -X POST http://localhost:8000/api/v1/generation \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A simple cube", "provider": "mock"}'

# 2. Get job ID from response
# 3. Check status
curl http://localhost:8000/api/v1/generation/{job_id}/status

# 4. Wait for completion (mock should be fast)
# 5. Verify output files exist
ls -la /app/storage/exports/
```

---

## 🛠️ Service Manager (`manager.sh`)

AI 3D Studio includes an interactive service manager (`manager.sh`) for controlling individual services without restarting the entire stack. This is useful for development, debugging, or when you only need to restart a specific component.

### Running the Service Manager

```bash
# Make executable (once)
chmod +x manager.sh

# Run interactively
./manager.sh
```

### Menu Options Overview

| Option | Action | Description |
|--------|--------|-------------|
| **1** | First-Time Setup | Runs Stage A (runtime preparation only) |
| **2** | Start All Services | Starts PostgreSQL, Redis, Backend, Celery, Frontend |
| **3** | Stop All Services | Gracefully stops all services (reverse order) |
| **4** | Restart All Services | Stop → wait 3s → Start |
| **5** | Service Status | Shows running/stopped status of each service |
| **6** | View Logs | Tail logs for API, Worker, Frontend, or all |
| **7** | Health Check | Verifies PostgreSQL, Redis, API, Frontend, GPU |
| **8** | Database Management | Run migrations or reset database |
| **9** | View Environment | Shows `.env` variables (secrets filtered) |
| **10** | Reset PID Files | Clears stale PID files without stopping services |
| **11** | Clean Old Logs | Removes log files older than 7 days |
| **12** | Cloudflare | Tunnel management (Colab/remote access) |
| **13** | Update/Install Models | Model installation and verification |
| **14** | Manage Individual Service | Start/Stop/Restart/Status/Logs for a specific service |
| **q** | Quit | Exit the manager |

---

### Managing Individual Services (Built into manager.sh)

**NEW in v3.2+**: Option **14** in the main menu provides an interactive submenu to manage individual services without restarting the entire stack.

```bash
./manager.sh
# Press 14 → Select service (1-5) → Choose action (Start/Stop/Restart/Status/Logs)
```

The submenu supports:

| Service | Type | Capabilities |
|---------|------|--------------|
| **1) Backend API** | Process-managed | Start, Stop, Restart, Status, Tail logs |
| **2) Celery Worker** | Process-managed | Start, Stop, Restart, Status, Tail logs |
| **3) Frontend** | Process-managed | Start, Stop, Restart, Status, Tail logs |
| **4) PostgreSQL** | systemd | Start, Stop, Restart, Status, journalctl logs |
| **5) Redis** | systemd | Start, Stop, Restart, Status, journalctl logs |

Each service submenu provides:
- **Start** — Launches the service with correct environment and logging
- **Stop** — Graceful shutdown (SIGTERM → SIGKILL after 10s)
- **Restart** — Stop + Start with health verification
- **Status** — Shows PID and running state
- **View Logs** — `tail -f` for app services, `journalctl -f` for systemd

#### **Manual CLI Commands (Alternative)**

If you prefer direct commands without the interactive menu:

#### **Restart Frontend Only**
```bash
# Option 1: Using stop/start scripts (recommended)
bash scripts/stop.sh         # Stops everything
# Wait for it to complete
bash scripts/start.sh        # Starts everything (interactive mode selection)

# Option 2: Manual frontend-only restart (advanced)
# 1. Find and kill only the frontend process
pkill -f "next start"        # For production mode
pkill -f "next dev"          # For dev mode
pkill -f "next-server"       # Alternative process name

# 2. Remove frontend PID file
rm -f .pids/frontend.pid

# 3. Restart frontend manually
cd /path/to/AI_Studio
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev > logs/frontend.log 2>&1 &
echo $! > .pids/frontend.pid
```

#### **Restart Backend API Only**
```bash
# Kill only the uvicorn process
pkill -f "uvicorn app.main:app"

# Remove backend PID file
rm -f .pids/api.pid

# Restart backend
cd /path/to/AI_Studio/backend
source .venv/bin/activate
setsid python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info \
  > ../logs/api.log 2>&1 &
echo $! > ../.pids/api.pid
```

#### **Restart Celery Worker Only**
```bash
# Kill only the celery worker
pkill -f "celery -A app.workers.celery_app worker"

# Remove worker PID file
rm -f .pids/worker.pid

# Restart worker (with beat scheduler -B)
cd /path/to/AI_Studio/backend
source .venv/bin/activate
setsid python -m celery -A app.workers.celery_app worker \
  --loglevel=info --concurrency=1 -B -Q generation,images \
  > ../logs/worker.log 2>&1 &
echo $! > ../.pids/worker.pid
```

#### **Restart Database (PostgreSQL) Only**
```bash
# Via systemd (requires sudo)
sudo systemctl restart postgresql

# Or stop/start separately
sudo systemctl stop postgresql
sudo systemctl start postgresql

# Verify
pg_isready -h localhost -U postgres
```

#### **Restart Redis Only**
```bash
# Via systemd (requires sudo)
sudo systemctl restart redis-server

# Or stop/start separately
sudo systemctl stop redis-server
sudo systemctl start redis-server

# Verify
redis-cli ping
```

---

### ⚠️ Critical Safety Rules

| Rule | Why It Matters |
|------|----------------|
| **Never kill PID files manually without stopping the process first** | Orphaned processes continue running and lock ports |
| **Stop services in reverse dependency order** | Frontend → Worker → API → Redis → PostgreSQL |
| **Start services in dependency order** | PostgreSQL → Redis → API → Worker → Frontend |
| **Always wait for health checks** | API must be healthy before starting Worker/Frontend |
| **Use `manager.sh` option 10 (Reset PID Files)** | Clears stale PIDs without touching running processes |

---

### 🔧 Service Dependencies (Start/Stop Order)

```
┌─────────────────────────────────────────────────────────────┐
│                    START ORDER                              │
├─────────────────────────────────────────────────────────────┤
│  1. PostgreSQL  ──┐                                         │
│  2. Redis         ├──▶  3. Backend API  ──┐                 │
│                    │                      ├──▶  4. Celery   │
│                    └──────────────────────┘      Worker      │
│                                                │             │
│                                                ▼             │
│                                          5. Frontend        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    STOP ORDER (REVERSE)                     │
├─────────────────────────────────────────────────────────────┤
│  1. Frontend                                                 │
│  2. Celery Worker                                            │
│  3. Backend API                                              │
│  4. Redis                                                    │
│  5. PostgreSQL                                               │
└─────────────────────────────────────────────────────────────┘
```

---

### 📋 Log Locations for Debugging

| Service | Log File | Tail Command |
|---------|----------|--------------|
| Backend API | `logs/api.log` | `tail -f logs/api.log` |
| Celery Worker | `logs/worker.log` | `tail -f logs/worker.log` |
| Frontend | `logs/frontend.log` | `tail -f logs/frontend.log` |
| PostgreSQL | `/var/log/postgresql/` | `sudo journalctl -u postgresql -f` |
| Redis | stdout | `redis-cli monitor` |

---

### 🎯 Quick Commands Reference

```bash
# Full stack restart (safest)
bash scripts/restart.sh

# Status check (no interaction)
./manager.sh  # then press 5

# Health check (no interaction)
./manager.sh  # then press 7

# View all logs at once
tail -f logs/*.log

# Check what's running on ports
lsof -i :3000   # Frontend
lsof -i :8000   # Backend API
lsof -i :5432   # PostgreSQL
lsof -i :6379   # Redis

# Emergency kill all AI Studio processes
pkill -f "uvicorn app.main:app"
pkill -f "celery -A app.workers.celery_app"
pkill -f "next"
rm -rf .pids
```

---

## Customizing Workspace Appearance

The workspace theme can be customized via **Settings → Appearance → Workspace Colors**.

### Theme Controls

- **Preset Swatches**: Choose from 6 presets (Default Dark, Midnight, Charcoal, Deep Navy, Forest, Warm Dark)
- **Color Pickers**: Customize 14 individual color properties:
  - **Surfaces**: Background, panel, viewport colors
  - **Text & Borders**: Primary text, muted text, border colors
  - **Interactive States**: Active button, hover background, accent color
  - **UI Elements**: Navigation bar, tab bar, dropdown, HUD colors

### How It Works

- Colors apply **live** to the workspace (no page reload)
- Settings persist to `localStorage` automatically
- Use **Reset** to restore the default dark theme
- Default theme: dark background (#0d0e12) with gold accent (#f5c518)

After successful installation:

1. **Download Model Weights**: Use the UI or API to download weights for your desired models
2. **Read Architecture Documentation**: `docs/architecture.md`
3. **Read API Documentation**: `docs/api-documentation.md`
4. **Configure AI Providers**: Set up HuggingFace token for model downloads
5. **Customize**: Modify settings to fit your workflow

## Models Not Ready

If a model shows `BLOCKED` or `PARTIAL`:
- **BLOCKED** (auxiliary weights): Required auxiliary weights (e.g., RMBG-1.4 for TripoSG) are missing. Run repair.
- **NATIVE_BUILD_PENDING**: Native CUDA build is queued. Wait for background build to complete.
- **NOT_IMPLEMENTED**: Preflight/installation checks are not implemented for this provider. Run install again.
- **VRAM_INSUFFICIENT**: GPU does not meet minimum VRAM requirement. Check hardware.

## Troubleshooting Models Not Ready

Since v4.0, models report detailed component-level installation status.
Use `GET /api/v1/admin/install/status` to see the full state.

### TripoSG blocked on auxiliary weights

```text
State: BLOCKED
Reason: Required auxiliary weight(s) missing: RMBG-1.4
```

Fix: Download RMBG-1.4 weights via the repair endpoint:
```bash
curl -X POST /api/v1/repair/triposg
```

### Hunyuan3D 2.1 points to wrong repository

Verify the REPOS table has a separate `Hunyuan3D-2.1` entry pointing to `Tencent-Hunyuan/Hunyuan3D-2.1.git`.

### Hunyuan3D-2mini: separate repo entry

As of v4.1, `Hunyuan3D-2mini` is a **separate repo entry** from `Hunyuan3D-2`. Both point to `Tencent-Hunyuan/Hunyuan3D-2.git` but have independent:
- Manifests (`hunyuan3d_2_mini.yaml` vs `hunyuan3d_2.yaml`)
- Weights paths (`third_party/Hunyuan3D-2mini/weights/` vs `third_party/Hunyuan3D-2/weights/`)
- Virtual environments

This allows the mini variant (6 GB VRAM) to be installed independently from the full model (16+ GB VRAM).

### Model shows BLOCKED with "Preflight not implemented"

The preflight validation has not been written for this provider yet.
This is expected during the v4.0 rollout. The model will become READY once its preflight is implemented and passes.

> **Note**: As of the latest fixes, preflight now runs real `model_load` and `capability_smoke` tests (not stubs). If preflight still fails, check `components.preflight` for the specific test that failed.

### Model shows BLOCKED with AUXILIARY_WEIGHTS_MISSING

A required auxiliary weight (marked `required: true` in the manifest) is missing.

```text
State: BLOCKED
Reason: Required auxiliary weight(s) missing: <weight-id>
```

Fix: Download the missing auxiliary weights via the repair endpoint:
```bash
curl -X POST /api/v1/admin/repair/<provider_name>
```
Or install the weight manually into `third_party/<RepoName>/weights/<weight-id>/`.

### Model shows VRAM_INSUFFICIENT during preflight

The GPU does not meet the manifest's `minimum_vram_mb` requirement. This is now a **hard gate** — the model cannot reach READY.

Fix:
1. Check actual GPU VRAM: `nvidia-smi --query-gpu=memory.total --format=csv,noheader`
2. Compare against the manifest's `hardware.minimum_vram_mb` for the provider
3. Use a GPU with sufficient VRAM, or enable low-VRAM mode if the provider supports it

### texture_pbr capability shows native_build_pending

Some capabilities (e.g., Hunyuan3D 2.1's `texture_pbr`) require a native CUDA build. The capability-level build must complete before that capability becomes available.

Fix: Run install with native builds allowed:
```bash
curl -X POST "/api/v1/admin/install/<provider_name>?allow_native_build=true"
```
Note: Other capabilities (e.g., `shape`) remain usable while `texture_pbr` is building.

### Native build models show NATIVE_BUILD_PENDING

Models requiring CUDA compilation (TRELLIS, AniGen, UniRig) queue a background build task when installed. The build runs asynchronously on the dedicated `installation` Celery queue and does not block the install API response.

- The Admin UI shows `Pending` → `Building` → `Complete` / `Failed` on the model card.
- Native build logs and task ID are visible via `GET /api/v1/admin/install/status`.
- After native build succeeds, preflight runs automatically and the model transitions to `READY` if all checks pass.
- If the Celery broker is unavailable, the model stays in `NATIVE_BUILD_PENDING` until the worker connects.

See `Docs/INSTALLATION_STATES.md` for the full state reference.

---

*Need help? Check the troubleshooting section or open an issue on GitHub.*

## Pipelines Setup Notes

- The workspace model pickers read from `GET /api/v1/pipelines/workspace-models`.
- Runtime status comes from `GET /api/v1/runtime/status` and `GET /api/v1/runtime/health`.
- Runtime options for the UI come from `GET /api/v1/runtime/options`.
- The current model ids exposed by the registry are: `hunyuan3d-2.1`, `hunyuan3d-2`, `hunyuan3d-2-mini`, `trellis`, `triposg`, `anigen`, `unirig`, `detailgen3d` (plus `mock`; aliases `hunyuan3d` / `hunyuan3d-1.0` resolve to `hunyuan3d-2.1`). As of v3.8.7 the registry map is synced with the engine, so `hunyuan3d-2-mini` and `triposg` are also switchable via `/runtime/provider` and resolvable via `get_provider()` (previously these silently fell back to mock).
- The backend does not expose a bare `GET /api/v1/runtime` route.
