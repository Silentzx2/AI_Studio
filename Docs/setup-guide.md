# AI 3D Studio - Setup & Installation Guide

> **Version**: 4.0.0 (ComfyUI Core + ComfyUI-3D-Pack Engine)  
> **Difficulty**: Intermediate  
> **Estimated Time**: 15-30 minutes (runtime only; weights are on-demand; 1-click on Colab)

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

**See also:** [Google Colab Setup Guide](./COLAB_SETUP.md) — For running on Google Colab with 1-click via [`colab.ipynb`](../colab.ipynb) or [`AI_Studio_Colab.ipynb`](../AI_Studio_Colab.ipynb) (automatic 8GB swap and system dependencies)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Git** | Latest | Clone repository |
| **Node.js** | 18+ (for dev) | Frontend development |
| **Python** | 3.12+ (for dev) | Backend development |
| **uv** | Latest (for dev) | Fast package installation inside activated venvs |

> **Note**: Virtual environments are provisioned via standard Python `venv` and explicitly activated and verified (`which python`, `which pip`, `python -c "import sys; print(sys.prefix)"`). `uv` is a **hard dependency** used exclusively for all Python package installations inside activated environments. Install it with `curl -LsSf https://astral.sh/uv/install.sh | sh`.

### Operating System Support

| OS | Status | Notes |
|----|--------|-------|
| **Ubuntu 22.04/24.04** | ✅ Fully Supported | Recommended |
| **Debian 12** | ✅ Supported | May need additional packages |
| **CentOS/RHEL 9** | ⚠️ Partial | SELinux adjustments needed |
| **Windows WSL2** | ✅ Supported | Use Ubuntu distro |
| **macOS** | ❌ Not Supported | No NVIDIA GPU support |

### System Build Dependencies

Before running setup scripts, install these system-level packages (required for C extensions, especially PIL/Pillow):

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config
sudo apt-get install -y libpng-dev libjpeg-dev zlib1g-dev libfreetype6-dev
sudo apt-get install -y libharfbuzz-dev liblcms2-dev libopenjp2-7-dev libtiff-dev libwebp-dev
sudo apt-get install -y ninja-build  # For native extension builds
```

**CentOS/RHEL:**
```bash
sudo yum groupinstall -y "Development Tools"
sudo yum install -y libpng-devel libjpeg-turbo-devel zlib-devel freetype-devel
sudo yum install -y harfbuzz-devel lcms2-devel ninja-build
```

These packages enable:
- **Pillow (PIL)** — Image processing with C extensions
- **imageio / imageio-ffmpeg** — Video/image I/O
- **Native PyTorch extensions** — CUDA/CUDNN bindings
- **Model-specific packages** — flash-attn, xformers, etc.

> **Colab users**: The `scripts/colab.sh` script automatically installs these. No manual action needed.

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
| **Trellis** | 8 GB (12 GB native-build) | High quality | ~60 seconds |
| **TripoSG** | 8 GB | image-to-3D | ~60 seconds |
| **Hunyuan3D-2.1** | 21 GB texture / 29 GB combined | High quality | ~90 seconds |

> VRAM figures are the verified normal-footprint requirements. Hunyuan3D-2.1 (29 GB peak / 10 GB low-VRAM combined) also supports a verified **low-VRAM** mode (CPU offload) for constrained GPUs; Hunyuan3D-2-Mini (6 GB peak) uses the same low-VRAM machinery. TRELLIS, TripoSG, and DetailGen3D do not support low-VRAM mode (they require a native CUDA build or have no verified low-VRAM path).


---

## Quick Start (Native)

### Method 1: Using Setup Script (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/ai-3d-studio.git
cd ai-3d-studio

# Make scripts executable
chmod +x scripts/*.sh manager.sh

# Run automated setup (installs ComfyUI, 3D Pack, and backend dependencies)
./scripts/setup.sh

# Start services (PostgreSQL, Redis, ComfyUI, FastAPI, Next.js)
./scripts/start.sh
```

> **Important**: `setup.sh` installs ComfyUI 0.36.0, ComfyUI-3D-Pack, and all necessary dependencies. Model weights can be placed directly in `ENGINE/ComfyUI/models/checkpoints/` or downloaded via ComfyUI.

### Access Points After Startup

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | Web application |
| **Backend API** | http://localhost:8000 | REST API |
| **ComfyUI Engine** | http://localhost:8188 | Execution engine & node UI |
| **API Docs** | http://localhost:8000/docs | Swagger UI |
| **Static Files** | http://localhost:3000/static/* | Proxied to backend (models, thumbnails) |
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

## ComfyUI Engine & 3D Pack Setup

The AI Studio backend executes 3D generative pipelines directly through **ComfyUI 0.36.0** and **ComfyUI-3D-Pack**.

### Automated Installation (`scripts/install_comfyui.sh`)

1. **Clones Upstream ComfyUI**: Clones `https://github.com/Comfy-Org/ComfyUI.git` into `ENGINE/ComfyUI/`.
2. **Clones ComfyUI-3D-Pack**: Clones `https://github.com/MrForExample/ComfyUI-3D-Pack.git` into `ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/`.
3. **Installs Dependencies**: Uses `uv pip` inside `backend/.venv` to install PyTorch, `torch-scatter`, `gpytoolbox`, `slangtorch`, `pyvista`, `pymeshfix`, `igraph`, and `mmgp`.
4. **Applies Compatibility Patches**: Ensures CPU compatibility guards and mock modules for `torchvision.transforms.functional_tensor`.

**Run standalone:**
```bash
bash scripts/install_comfyui.sh
```

### Available Models & Checkpoints

Checkpoints are placed in `ENGINE/ComfyUI/models/checkpoints/` or resolved dynamically:

| Model ID | Architecture | Primary Capability |
|---|---|---|
| `hunyuan3d-2.1` | Hunyuan3D-2.1 DiT + Paint | Text/Image to 3D & PBR Texture Baking |
| `trellis` | TRELLIS (FlexiCubes) | High-fidelity PBR geometry synthesis |
| `triposr` | TripoSR NeRF / Marching Cubes | Fast single-image 3D reconstruction |
| `triposf` | TripoSF Feedforward | Lightweight geometric reconstruction |
| `sv3d` | Stable Video 3D | Multi-view orbital diffusion |

### Engine Performance Configuration

ComfyUI is launched with performance flags:
- `--enable-compress-response-body`: Compresses all HTTP payloads.
- `--mmap-torch-files`: Memory-maps checkpoint safetensors for rapid loading.
- `--use-split-cross-attention`: Reduces attention memory consumption on CPU.
- `--async-offload 2`: Enables asynchronous CUDA weight offloading streams on GPU.

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
    bun \
    postgresql \
    redis-server \
    nginx

# Install NVIDIA drivers (if using GPU)
sudo apt install -y nvidia-driver-535 nvidia-cuda-toolkit nvidia-cuda-toolkit-gcc
```

### 2. PostgreSQL Setup

> **Note**: As of v4.6.0, PostgreSQL database setup has been fixed. The previous issue where the database initialization failed has been resolved.

```bash
# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database
sudo -u postgres psql <<EOF
CREATE USER ai_studio WITH PASSWORD 'ai_studio_dev';
CREATE DATABASE ai_studio OWNER ai_studio;
GRANT ALL PRIVILEGES ON DATABASE ai_studio TO ai_studio;
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

> **Note**: As of v4.6.0, the backend `.env` file location has been fixed. The `.env` file should be placed in the `backend/` directory (copied from `backend/env.example`).

```bash
# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies (uv manages the environment automatically)
cd backend
python3 -m venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt

# Copy environment file (place in backend/ directory)
cp ../env.example .env

# Configure environment
nano .env

# Run database migrations (the only supported schema-management path)
alembic upgrade head
```

### 5. Frontend Setup

The standard Next.js production workflow is used everywhere — Colab, local
`start.sh`, supervisor restart, and watchdog recovery:

```bash
cd ..

# Install Node.js dependencies
bun install

# Build for production (build once; the supervisor restarts without rebuilding)
bun run build

# Start the production server — the ONLY production entrypoint
bun start

# Or start the development server (hot reload)
bun run dev
```

> The standalone server (`node .next/standalone/server.js`) is **not** the
> normal runtime entrypoint. It is only used by the Docker packaging path
> (`scripts/package-production.sh`), which builds with
> `AI_STUDIO_STANDALONE=1`. Do not start it manually for normal operation.

### 6. Start Services

```bash
# Terminal 1: ComfyUI Execution Engine
./backend/.venv/bin/python ENGINE/ComfyUI/main.py \
  --listen 0.0.0.0 --port 8188 --enable-compress-response-body --mmap-torch-files --cpu --use-split-cross-attention

# Terminal 2: FastAPI Gateway
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 3: Frontend
bun run dev
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
DATABASE_URL=postgresql+asyncpg://ai_studio:ai_studio_dev@localhost:5432/ai_studio
SYNC_DATABASE_URL=postgresql://ai_studio:ai_studio_dev@localhost:5432/ai_studio

# ===== REDIS =====
REDIS_URL=redis://localhost:6379/0

# ===== COMFYUI EXECUTION CORE =====
COMFYUI_HOST=127.0.0.1
COMFYUI_PORT=8188
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_TIMEOUT=300

# ===== API SETTINGS =====
BACKEND_URL=http://localhost:8000   # Used by the Next.js API proxy at request time
API_V1_PREFIX=/api/v1
CORS_ORIGINS=["http://localhost:3000","http://localhost:8000"]
MAX_UPLOAD_SIZE=52428800  # 50MB
```

> **Database**: The full install uses PostgreSQL (`DATABASE_URL=postgresql+asyncpg://…`).

### AI Provider Settings

```env
# ===== AI PROVIDER =====
AI_PROVIDER=hunyuan3d-2.1
RUNTIME_MODE=local

# Options: mock, hunyuan3d-2.1, hunyuan3d-2-mini, trellis, triposg, detailgen3d
# (aliases: hunyuan3d, hunyuan3d-1.0 -> hunyuan3d-2.1)

# ===== GPU SETTINGS =====
CUDA_DEVICE=auto
MAX_VRAM_MB=0  # 0 = auto-detect
VRAM_SAFETY_MARGIN_MB=1024
AUTO_UNLOAD_AFTER_JOB=true
```

### Storage Paths

> **Note**: As of v4.6.0, storage permissions have been fixed. Ensure the storage directory is writable by the backend process.

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
PORT=3001 bun run dev
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
psql -h localhost -U ai_studio -d ai_studio

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

#### Disk Space Requirements (v4.3.0+)

As of v4.3.0, `full_install()` performs a **cumulative** disk check before
starting any downloads. The total estimated size of all selected models is
compared against available space with a **5GB safety margin** plus **20%
headroom** for extraction and cache growth.

If the cumulative size exceeds available space, the install fails fast with
a clear error message listing the models and the required vs available space,
before any downloads start:

```
Insufficient disk space: 27.0GB free, need ~52.4GB for [hunyuan3d-2.1, trellis]
(includes 20% headroom + 5GB safety margin)
```

Previously each model was checked individually, so a multi-model install could
exhaust disk before the last model finished. The cumulative check prevents
this by failing fast with a clear message.

**Advisory behavior**: The `colab.sh` script's `check_disk_space` function
remains advisory (warns but continues) because Colab's ephemeral disk can
fluctuate. The cumulative check in `full_install()` is the authoritative
gate that prevents corrupt downloads.

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

#### 11. TRELLIS / Hunyuan3D-2.1: `accelerate` import picks backend `.venv` first

If generation fails immediately for `trellis` or `hunyuan3d-2.1` with:

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
  -d '{"models": ["trellis","hunyuan3d-2.1","triposg"]}'
```

This is required because per-model `.venv/` directories are created at install time and are **not** automatically updated when dependency pins change in code. Skipping this step leaves the old (broken) pins in place and the runtime errors persist.

#### 16. Native Dependency Wheel Resolution Failures

If a native dependency fails to install during Stage A:

```bash
# Check which component failed
curl http://localhost:8000/api/v1/admin/install/status

# Look for "native" component state = "failed" or "checking_wheel"
```

The wheel-first resolver reads the selected manifest `dependencies.wheels`. It verifies a real compatible wheel target for the current Python/CUDA environment; if none is usable, it follows the manifest fallback/source-build policy.

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

**TripoSR `torchmcubes` source-build requirements (2026-09-17):**
Upstream `torchmcubes` (cloned from `git+https://github.com/tatsy/torchmcubes.git`) builds with
`scikit-build-core` and `pybind11`, and its `CMakeLists.txt` calls
`find_package(Torch CONFIG REQUIRED)`. The per-model manifest `dependencies.build_deps` must
declare `scikit-build-core>=1.0`, `pybind11>=2.10`, plus the retained `ninja` and `setuptools<70`
toolchain pins, and the source-build path must set `Torch_DIR`/`CMAKE_PREFIX_PATH` to the target venv's
`torch/share/cmake/Torch` directory (derived from `torch.__file__` inside the per-model venv).
Without both, `prepare_metadata_for_build_wheel` fails with a CMake "Could not find a package
configuration file provided by 'Torch'" error and TripoSR preparation fails with
`torchmcubes` in the failed list. If a fresh upstream `torchmcubes` changes its build system again,
update `backend/runtime/manifests/triposr.yaml` `dependencies.build_deps` rather than editing the
resolver.

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
| **2** | Start All Services | Starts PostgreSQL, Redis, Backend, ComfyUI Engine, Frontend |
| **3** | Stop All Services | Gracefully stops all services (reverse order) |
| **4** | Restart All Services | Stop → wait 3s → Start |
| **5** | Service Status | Shows running/stopped status of each service |
| **6** | View Logs | Tail logs for API, ComfyUI, Frontend, or all |
| **7** | Health Check | Verifies PostgreSQL, Redis, API, ComfyUI, Frontend, GPU |
| **8** | Database Management | Run migrations or reset database |
| **9** | View Environment | Shows `.env` variables (secrets filtered) |
| **10** | Reset PID Files | Clears stale PID files without stopping services |
| **11** | Clean Old Logs | Removes log files older than 7 days |
| **12** | Cloudflare | Tunnel management (Colab/remote access) |
| **13** | Update/Install Models | Model installation and verification |
| **14** | Manage Individual Service | Start/Stop/Restart/Status/Logs for a specific service |
| **17** | Build Native CUDA Wheels | Build CUDA extension wheels using unified script; output to `.wheels/` directory; enforces CUDA 12.4 |
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
| **2) ComfyUI Engine** | Process-managed | Start, Stop, Restart, Status, Tail logs |
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
pkill -f "next start"        # production mode (bun start)
pkill -f "next-server"       # process name used by `next start`

# 2. Remove frontend PID file
rm -f .pids/frontend.pid

# 3. Restart frontend manually (standard production command)
cd /path/to/AI_Studio
NEXT_PUBLIC_API_URL=http://localhost:8000 bun start > logs/frontend.log 2>&1 &
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

#### **Restart ComfyUI Engine Only**
```bash
# Kill ComfyUI process
pkill -f "ENGINE/ComfyUI/main.py"
rm -f .pids/comfyui.pid

# Restart ComfyUI with performance flags
setsid backend/.venv/bin/python ENGINE/ComfyUI/main.py \
  --listen 0.0.0.0 --port 8188 --enable-compress-response-body --mmap-torch-files --cpu --use-split-cross-attention \
  > logs/comfyui.log 2>&1 &
echo $! > .pids/comfyui.pid
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
│  2. Redis         ├──▶  3. ComfyUI Engine ──▶ 4. Backend API│
│                   │                                 │       │
│                   └─────────────────────────────────┴──▶ 5. Frontend
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    STOP ORDER (REVERSE)                     │
├─────────────────────────────────────────────────────────────┤
│  1. Frontend                                                 │
│  2. Backend API                                              │
│  3. ComfyUI Engine                                           │
│  4. Redis                                                    │
│  5. PostgreSQL                                               │
└─────────────────────────────────────────────────────────────┘
```

---

### 📋 Log Locations for Debugging

| Service | Log File | Tail Command |
|---------|----------|--------------|
| Backend API | `logs/api.log` | `tail -f logs/api.log` |
| ComfyUI Engine | `logs/comfyui.log` | `tail -f logs/comfyui.log` |
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
lsof -i :8188   # ComfyUI Engine
lsof -i :5432   # PostgreSQL
lsof -i :6379   # Redis

# Emergency kill all AI Studio processes
pkill -f "uvicorn app.main:app"
pkill -f "ENGINE/ComfyUI/main.py"
pkill -f "next"
rm -rf .pids
```

---

## Workspace Theme

The workspace uses a static dark theme (dark background #0d0e12 with gold accent #f5c518). Theme customization via the Appearance page has been removed.

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

Verify the `hunyuan3d-2.1` YAML manifest has its own source entry pointing to `Tencent-Hunyuan/Hunyuan3D-2.1.git`.

### Hunyuan3D-2mini: separate repo entry

As of v4.4.3, `Hunyuan3D-2mini` is a **separate repo entry** from `Hunyuan3D-2.1`. Both point to `Tencent-Hunyuan/Hunyuan3D-2.git` but have independent:
- Manifests (`hunyuan3d_2_mini.yaml` vs `hunyuan3d_21.yaml`)
- Weights paths (`third_party/Hunyuan3D-2mini/weights/` vs `third_party/Hunyuan3D-2.1/weights/`)
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

Models requiring CUDA compilation (TRELLIS) queue a background build task when installed. The build runs asynchronously on the dedicated `installation` Celery queue and does not block the install API response.

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
- The current model ids exposed by the registry are: `hunyuan3d-2.1`, `hunyuan3d-2-mini`, `trellis`, `triposg`, `detailgen3d` (plus `mock`; aliases `hunyuan3d` / `hunyuan3d-1.0` resolve to `hunyuan3d-2.1`). As of v3.8.7 the registry map is synced with the engine, so `hunyuan3d-2-mini` and `triposg` are also switchable via `/runtime/provider` and resolvable via `get_provider()` (previously these silently fell back to mock).
- The backend does not expose a bare `GET /api/v1/runtime` route.
- Supported workspace types: `mesh-generation`, `texture-generation`, `rigging`, `animation`, `remesh`, `post-processing`.
