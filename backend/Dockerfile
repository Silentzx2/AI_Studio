# AI 3D Studio Backend Dockerfile
#
# GPU-ONLY MODE: This image requires NVIDIA GPU with CUDA support.
# Will fail to START if GPU is not available (validated at runtime).
#
# CUDA 12.1 + PyTorch 2.5.1

# ponytail: Section 5 — enable BuildKit cache mounts for faster rebuilds
# syntax=docker/dockerfile:1
FROM python:3.12-slim

WORKDIR /app

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# System dependencies + Blender
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    git \
    xz-utils \
    wget \
    ca-certificates \
    blender \
    libgl1 \
    libglib2.0-0 \
    libxrender1 \
    libsm6 \
    libxext6 \
    libx11-6 \
    libgomp1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install uv from official image (avoids apt version drift)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set HuggingFace cache environment variables BEFORE uv pip install
ENV HF_HOME=/app/third_party/.hf_cache \
    HUGGINGFACE_HUB_CACHE=/app/third_party/.hf_cache/hub \
    TRANSFORMERS_CACHE=/app/third_party/.hf_cache/transformers \
    TORCH_HOME=/app/third_party/.hf_cache/torch \
    PLATFORM_MODE=gpu \
    CUDA_VISIBLE_DEVICES=all

# Python dependencies (via uv for speed)
# ponytail: Section 5 — use BuildKit cache mount for pip wheels
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    uv pip install --python /usr/local/bin/python torch==2.5.1 --index-url https://download.pytorch.org/whl/cu121 && \
    uv pip install --python /usr/local/bin/python -r requirements.txt && \
    uv pip install --python /usr/local/bin/python xformers==0.0.24 && \
    uv pip install --python /usr/local/bin/python celery redis sqlalchemy trimesh huggingface_hub

# Verify PyTorch was installed with CUDA support (build-time check, not runtime GPU check)
RUN python -c "import torch; cuda_ver = torch.version.cuda; assert cuda_ver is not None, 'PyTorch installed without CUDA support'; print(f'PyTorch {torch.__version__} with CUDA {cuda_ver} installed successfully')"

# Application source
COPY . .

# NOTE: Storage directories are NOT created here.
# They are created at runtime by storage.ensure_dirs() so that
# bind-mounted host directories (the single source of truth) own the data.

# Create an unprivileged user for security
RUN set -eux; \
    if command -v adduser >/dev/null 2>&1; then \
        addgroup --system app || true; \
        adduser --system --ingroup app --home /home/app --shell /bin/sh app || true; \
    else \
        groupadd -r app || true; \
        useradd -r -g app -s /bin/sh app || true; \
    fi; \
    chown -R app:app /app

EXPOSE 8000

# # Health check with extended startup time for model loading
# HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
#     CMD curl -f http://localhost:8000/api/v1/health || exit 1

USER app

# Default command
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
