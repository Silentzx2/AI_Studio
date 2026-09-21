# AI 3D Studio — Setup & Installation Guide

> **Version**: 0.1.0
> **Difficulty**: Intermediate
> **Estimated Time**: 15-30 minutes (runtime only; weights are on-demand)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Hardware Requirements](#hardware-requirements)
3. [Quick Start (Native)](#quick-start-native)
4. [Environment Configuration](#environment-configuration)
5. [GPU Setup](#gpu-setup)
6. [Troubleshooting](#troubleshooting)
7. [Verification](#verification)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Git** | Latest | Clone repository |
| **Node.js** | 20+ | Frontend development (Bun package manager) |
| **Python** | 3.12+ | Backend development |
| **Bun** | Latest | Frontend package manager |
| **uv** | Latest | Python package manager |

### Operating System Support

| OS | Status | Notes |
|----|--------|-------|
| **Ubuntu 22.04/24.04** | ✅ Fully Supported | Recommended |
| **Debian 12** | ✅ Supported | May need additional packages |
| **Windows WSL2** | ✅ Supported | Use Ubuntu distro |
| **macOS** | ❌ Not Supported | No NVIDIA GPU support |

---

## Hardware Requirements

### Minimum Specifications

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 4 cores | 8+ cores |
| **RAM** | 8 GB | 16 GB |
| **Storage** | 50 GB SSD | 100 GB NVMe SSD |
| **GPU** | None (CPU mode) | NVIDIA GPU with CUDA |

### GPU VRAM Requirements by Model

| Model | VRAM Required | Quality | Speed |
|-------|---------------|---------|-------|
| **TRELLIS** | 11.5 GB | High quality | ~60 seconds |
| **TRELLIS.2** | 23 GB | Highest quality | ~60 seconds |
| **Hunyuan3D-2.1** | 8 GB (shape) / 16 GB (shape+texture) | High quality | ~90 seconds |
| **PartPacker** | 10 GB | Fast | ~60 seconds |
| **UltraShape** | 26.6 GB | Highest fidelity | ~30 seconds |
| **PartField** | 4 GB | Segmentation | ~15 seconds |
| **P3-SAM** | 60 GB | High-precision segmentation | ~15 seconds |
| **UniRig** | 9 GB | Auto-rigging | ~20 seconds |
| **FastMesh-V1K** | 16 GB | Retopology | ~30 seconds |
| **FastMesh-V4K** | 24.5 GB | High-res retopology | ~30 seconds |
| **VoxHammer** | 40 GB | Mesh editing | ~20 seconds |

> VRAM figures are the verified normal-footprint requirements. Set `MAX_VRAM_MB=0` in `.env` for auto-detection.

---

## Quick Start (Native)

### Method 1: Using Setup Script (Recommended)

```bash
# Clone the repository
git clone https://github.com/Silentzx2/AI_Studio.git
cd AI_Studio

# Make scripts executable
chmod +x scripts/*..sh manager.sh

# Run automated setup
./scripts/setup.sh

# Start all services
./scripts/start.sh
```

The setup script installs:
- System dependencies (CUDA 12.4 toolkit, system libs)
- Python 3.12 + uv + PyTorch (GPU or CPU wheels)
- Backend Python dependencies
- Node.js 20 + Bun
- Optional: Blender, PostgreSQL, Redis

### Method 2: Manual Installation

```bash
# 1. Clone and enter project
git clone https://github.com/Silentzx2/AI_Studio.git
cd AI_Studio

# 2. Install Python dependencies
cd backend
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt

# 3. Install frontend dependencies
cd ..
bun install

# 4. Copy environment file
cp .env.example .env

# 5. Start backend
cd backend
uvicorn api.main_singleworker:app --reload --port 8000

# 6. Start frontend (new terminal)
bun run dev
```

### Access Points After Startup

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | Web application |
| **Backend API** | http://localhost:8000 | REST API |
| **API Docs** | http://localhost:8000/docs | Swagger UI |
| **Health Check** | http://localhost:8000/health | Service health |

---

## Environment Configuration

Copy the example configuration file:

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

### YAML Configuration Files

- **`backend/config/system.yaml`**: Logging, security, environment, user auth.
- **`backend/config/models.yaml`**: Per-feature model definitions with VRAM requirements, supported inputs/outputs, model paths, and worker counts.

---

## GPU Setup

The setup script automatically detects and installs CUDA 12.4. For manual setup:

```bash
# Verify NVIDIA driver and CUDA
nvidia-smi
nvcc --version

# If no GPU, the system falls back to CPU mode
# Set CUDA_DEVICE=cpu in .env for explicit CPU mode
```

### CUDA Toolkit Installation

The setup script handles CUDA 12.4 installation automatically. Key packages:
- `cuda-toolkit-12-4`
- `libcusparse-dev-12-4`
- `libcusolver-dev-12-4`
- `libcufft-dev-12-4`

---

## Post-Installation

### Verify Setup

```bash
# Check health endpoint
curl -s http://localhost:8000/health | jq .

# Check available models
curl -s http://localhost:8000/api/v1/mesh-generation/models | jq .

# Check system info
curl -s http://localhost:8000/api/v1/system/info | jq .
```

### Run Tests

```bash
python3 backend/tests/test_backend_e2e.py
```

---

## Troubleshooting

### 1. GPU / CUDA Detection
```bash
nvidia-smi
# If no GPU is available, the system falls back to CPU mode (slower).
```

### 2. Port Already in Use (3000, 8000)
```bash
bash scripts/stop.sh
# Or force free specific ports:
lsof -ti :3000 | xargs -r kill -9
lsof -ti :8000 | xargs -r kill -9
```

### 3. Out of Memory (CUDA OOM)
- The VRAM-aware scheduler prevents multi-provider GPU OOM via strict mutual exclusion.
- For low-VRAM GPUs (≤8GB), use lighter models (e.g., TRELLIS at 11.5GB).

### 4. Checking Service Logs
```bash
tail -f logs/app.log
```

### 5. Virtual Environment Issues
```bash
# Recreate the venv if corrupted
cd backend
rm -rf .venv
uv venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

---

## Verification Matrix

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
