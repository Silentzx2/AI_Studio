# AI 3D Studio - Setup & Installation Guide

> **Version**: 3.2.0 (uv-Only Package Management)  
> **Difficulty**: Intermediate  
> **Estimated Time**: 30-60 minutes

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Hardware Requirements](#hardware-requirements)
3. [Quick Start (Docker)](#quick-start-docker)
4. [Manual Installation](#manual-installation)
5. [Environment Configuration](#environment-configuration)
6. [GPU Setup](#gpu-setup)
7. [Docker Compose Variants](#docker-compose-variants)
8. [Troubleshooting](#troubleshooting)
9. [Verification](#verification)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Docker** | 24.0+ | Containerization |
| **Docker Compose** | 2.0+ | Multi-container orchestration |
| **Git** | Latest | Clone repository |
| **Node.js** | 18+ (for dev) | Frontend development |
| **Python** | 3.11+ (for dev) | Backend development |
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
| **TripoSR** | 6 GB | Fast preview | ~1 second |
| **Trellis** | 12 GB | High quality | ~60 seconds |
| **TripoSG** | 12 GB | High-detail geometry | ~45 seconds |
| **TripoSF** | 12 GB | High-resolution geometry | ~60 seconds |
| **UniRig** | 8 GB | Rigging / animation | ~30 seconds |
| **HoloPart** | 8 GB | Part completion | ~20 seconds |
| **Hunyuan3D-2.1** | 16 GB | High quality | ~90 seconds |


---

## Quick Start (Docker)

### Method 1: Using Setup Script (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/ai-3d-studio.git
cd ai-3d-studio

# Make scripts executable
chmod +x scripts/*.sh manager.sh

# Run setup and start
./scripts/setup.sh
./scripts/start.sh
```

### Method 2: Manual Docker Commands

```bash
# Clone the repository
git clone https://github.com/your-org/ai-3d-studio.git
cd ai-3d-studio

# Copy environment template
cp .env.example .env

# Edit configuration
nano .env

# Start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f api
```

### Access Points After Startup

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | Web application |
| **Backend API** | http://localhost:8000 | REST API |
| **API Docs** | http://localhost:8000/docs | Swagger UI |
| **Prompt Assistant** | built-in | Optional AI prompt enhancement |

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

# Terminal 2: Celery Worker
cd backend
source .venv/bin/activate
celery -A app.workers.celery_app worker --loglevel=info -Q generation images downloads

# Terminal 3: Celery Beat (Scheduler)
cd backend
source .venv/bin/activate
celery -A app.workers.celery_app beat --loglevel=info

# Terminal 4: Frontend
npm run dev
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
APP_VERSION=3.0.0

# ===== DATABASE =====
DATABASE_URL=postgresql+asyncpg://ai3dstudio:password@localhost:5432/ai3dstudio
SYNC_DATABASE_URL=postgresql://ai3dstudio:password@localhost:5432/ai3dstudio

# ===== REDIS & CELERY =====
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# ===== API SETTINGS =====
API_V1_PREFIX=/api/v1
CORS_ORIGINS=["http://localhost:3000","http://localhost:8000"]
MAX_UPLOAD_SIZE=52428800  # 50MB
```

### AI Provider Settings

```env
# ===== AI PROVIDER =====
AI_PROVIDER=hunyuan3d-2.1
RUNTIME_MODE=local

# Options: mock, hunyuan3d-2.1, hunyuan3d-2, trellis, triposr, triposg, triposf, unirig, holopart

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

> **Per-model layout (v3.2)**: Each model is fully self-contained under `third_party/<RepoName>/` with its own `.venv/` (created by `uv`), `weights/`, `cache/`, `logs/`, and `metadata.json`. The old centralized `third_party/weights/` is deprecated. `.runtime_cache/` holds shared install state. Run `./scripts/update-models.sh --migrate` if upgrading from an earlier version.

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
# Test with Docker
docker run --rm --gpus all nvidia/cuda:12.1-base nvidia-smi

# Test PyTorch CUDA
docker run --rm --gpus all pytorch/pytorch:latest python -c "import torch; print(torch.cuda.is_available())"
```

### Install NVIDIA Container Toolkit

```bash
# Add NVIDIA repository
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Configure Docker runtime
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### Verify GPU in Containers

```bash
# Test GPU access from container
docker run --rm --gpus all ubuntu:22.04 nvidia-smi

# Should show same output as host nvidia-smi
```

---

## Docker Compose Variants

### Full Stack (GPU Mode)

```bash
# Uses docker-compose.yml + docker-compose.gpu.yml
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

Services included:
- `postgres` - Database
- `redis` - Cache/Broker
- `prompt enhancement` - Optional AI prompt assistant
- `api` - FastAPI backend (with GPU access)
- `frontend` - Next.js frontend
- `worker` - Celery worker (with GPU access)

### CPU-Only Mode

```bash
# For development/testing without GPU
docker compose -f docker-compose.yml -f docker-compose.cpu.yml up -d
```

Modifications:
- Uses CPU-only base image
- Sets `AI_PROVIDER=mock`
- Disables GPU passthrough

### Development Mode

```bash
# With hot-reload enabled
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Features:
- Volume mounts for code changes
- Auto-reload on file save
- Debug ports exposed

### Production Mode

```bash
# Optimized for production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Features:
- Multi-worker scaling
- Health checks configured
- Resource limits set
- Restart policies active

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

# In container, check:
docker run --rm --gpus all nvidia/cuda:12.1-base nvidia-smi
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
df -h /app/storage/third_party/

# Check download logs
docker compose logs worker | grep -i error

# Retry failed downloads via API
POST /api/v1/download/process-queue
```

#### 7. Migrating Weights from Old Layout

If you previously installed models with the centralized `third_party/weights/` layout, migrate them:

```bash
# Run the migration script (copy-then-verify strategy)
./scripts/update-models.sh --migrate
```

This copies weights from `third_party/weights/<provider>/` into `third_party/<RepoName>/weights/` and verifies integrity afterwards.

### Log Locations

| Service | Log Command | Location |
|---------|-------------|----------|
| **API Server** | `docker compose logs api` | stdout/stderr |
| **Worker** | `docker compose logs worker` | stdout/stderr |
| **Frontend** | `docker compose logs frontend` | stdout/stderr |
| **PostgreSQL** | `docker compose logs postgres` | /var/lib/postgresql/data/log |
| **Redis** | `docker compose logs redis` | stdout/stderr |

### Debug Mode

Enable verbose logging:

```env
# In .env
DEBUG=true
LOG_LEVEL=DEBUG
```

View real-time logs:

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api worker
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

### End-to-End Test

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

## Next Steps

After successful installation:

1. **Read Architecture Documentation**: `docs/architecture.md`
2. **Read API Documentation**: `docs/api-documentation.md`
3. **Configure AI Providers**: Set up HuggingFace token for model downloads
4. **Download Models**: Use the model manager to install AI models
5. **Customize**: Modify settings to fit your workflow

---

*Need help? Check the troubleshooting section or open an issue on GitHub.*

## Pipelines Setup Notes

- The Settings → Pipelines page reads from `GET /api/v1/pipelines`.
- Runtime status comes from `GET /api/v1/runtime/status` and `GET /api/v1/runtime/health`.
- Runtime options for the UI come from `GET /api/v1/runtime/options`.
- The current model ids exposed by the registry are: `hunyuan3d-2.1`, `triposr`, `trellis`, `triposg`, `triposf`, `unirig`, `holopart`.
- The backend does not expose a bare `GET /api/v1/runtime` route.
