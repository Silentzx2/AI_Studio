#!/usr/bin/env bash
# build-runtime-image.sh — Build a self-contained offline Docker image
#
# This creates a production-ready image with all models AND weights included.
# The resulting image can run on any machine with GPU without downloading models.
#
# CPU-First: By default, builds a CPU-compatible image.
# For GPU support, use --gpu flag.
#
# Usage:
#   ./scripts/build-runtime-image.sh [--no-cache] [--gpu]
#
# Environment:
#   IMAGE_NAME  - Image name (default: ai3dstudio-runtime)
#   IMAGE_TAG   - Image tag (default: latest)
#
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-ai3dstudio-runtime}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
NO_CACHE=false
GPU_MODE=false

for arg in "$@"; do
    case "$arg" in
        --no-cache) NO_CACHE=true ;;
        --gpu) GPU_MODE=true ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Builds a self-contained Docker image with all models."
            echo ""
            echo "Options:"
            echo "  --no-cache    Don't use Docker cache"
            echo "  --gpu         Build with GPU support (requires nvidia-container-toolkit)"
            echo ""
            echo "Environment:"
            echo "  IMAGE_NAME    Image name (default: ai3dstudio-runtime)"
            echo "  IMAGE_TAG     Image tag (default: latest)"
            exit 0
            ;;
    esac
done

cd "$(dirname "$0")/.."
BACKEND_DIR="$(pwd)/backend"

echo "=============================================="
echo "  Building Runtime Image: $IMAGE"
echo "  Mode: $( [ "$GPU_MODE" = true ] && echo "GPU" || echo "CPU-only" )"
echo "=============================================="
echo ""

# ── Check for optional third-party assets ─────────────────────────────────────
THIRD_PARTY_EXISTS=false
if [ -d "$BACKEND_DIR/third_party" ]; then
    THIRD_PARTY_EXISTS=true
    echo "[INFO] Third-party assets found"

    # Count models
    WEIGHTS_DIR="$BACKEND_DIR/third_party/weights"
    if [ -d "$WEIGHTS_DIR" ]; then
        WEIGHT_SIZE=$(du -sh "$WEIGHTS_DIR" 2>/dev/null | cut -f1 || echo "0")
        echo "  Weights: $WEIGHT_SIZE"
    fi

    # Count repos
    REPO_COUNT=$(find "$BACKEND_DIR/third_party" -maxdepth 1 -type d \( -name "Hunyuan*" -o -name "TRELLIS" -o -name "TripoSR" \) 2>/dev/null | wc -l)
    echo "  Repositories: $REPO_COUNT"
else
    echo "[INFO] No third-party assets found - building minimal image"
fi

echo ""

# ── Create temporary Dockerfile ───────────────────────────────────────────────
TEMP_DOCKERFILE="/tmp/Dockerfile.runtime.$(date +%s)"

# Build GPU or CPU version
if [ "$GPU_MODE" = true ]; then
    PYTORCH_INSTALL="RUN uv pip install --python /usr/local/bin/python --no-cache-dir torch --index-url https://download.pytorch.org/whl/cu121"
else
    PYTORCH_INSTALL="# Using CPU-only PyTorch from requirements.txt"
fi

cat > "$TEMP_DOCKERFILE" << DOCKERFILE
# AI 3D Studio Runtime Image - Production Build
# Built with CPU-first design

FROM python:3.13-slim

WORKDIR /app

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Set HuggingFace cache paths
ENV HF_HOME=/app/third_party/.hf_cache \\
    HUGGINGFACE_HUB_CACHE=/app/third_party/.hf_cache/hub \\
    TRANSFORMERS_CACHE=/app/third_party/.hf_cache/transformers \\
    TORCH_HOME=/app/third_party/.hf_cache/torch \\
    PLATFORM_MODE=${GPU_MODE:+gpu}${GPU_MODE:-cpu}

# Install system dependencies + Blender
RUN apt-get update && apt-get install -y --no-install-recommends \\
    build-essential \\
    libpq-dev \\
    curl \\
    git \\
    xz-utils \\
    wget \\
    ca-certificates \\
    blender \\
    libgl1 \\
    libglib2.0-0 \\
    libxrender1 \\
    libsm6 \\
    libxext6 \\
    libx11-6 \\
    libgomp1 \\
    && apt-get clean \\
    && rm -rf /var/lib/apt/lists/*

# Install uv from official image (avoids apt version drift)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy Python requirements and install via uv
COPY requirements.txt .
RUN uv pip install --python /usr/local/bin/python --no-cache-dir -r requirements.txt

# GPU-specific PyTorch (optional)
$PYTORCH_INSTALL

# Copy application source
COPY app/ ./app/
COPY runtime/ ./runtime/
DOCKERFILE

# Add optional file copies
cat >> "$TEMP_DOCKERFILE" << 'DOCKERFILE'

# Copy optional files (may not exist)
COPY config.py ./ 2>/dev/null || true

# NOTE: third_party and storage directories are created at runtime
# by storage.ensure_dirs() — NOT in the Dockerfile (bind-mounts own the data)
RUN mkdir -p /app/third_party/.hf_cache

DOCKERFILE

# Add third-party assets if they exist
if [ "$THIRD_PARTY_EXISTS" = true ]; then
    cat >> "$TEMP_DOCKERFILE" << 'DOCKERFILE'

# Copy third-party repositories and weights (if present)
COPY third_party/ ./third_party/ 2>/dev/null || true
DOCKERFILE
fi

cat >> "$TEMP_DOCKERFILE" << 'DOCKERFILE'

# NOTE: Storage directories are NOT created here.
# They are created at runtime by storage.ensure_dirs() so that
# bind-mounted host directories (the single source of truth) own the data.

EXPOSE 8000

# Health check with longer timeout for startup
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \\
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Create non-root user for security
RUN groupadd -r appgroup && useradd -r -g appgroup -s /bin/false appuser && \\
    chown -R appuser:appgroup /app

USER appuser

# Default command
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
DOCKERFILE

echo "[INFO] Building Docker image..."
echo "  Dockerfile: $TEMP_DOCKERFILE"
echo "  Context: $BACKEND_DIR"
echo ""

# Build the image
BUILD_ARGS=""
[ "$NO_CACHE" = true ] && BUILD_ARGS="--no-cache"

docker build $BUILD_ARGS -f "$TEMP_DOCKERFILE" -t "$IMAGE" "$BACKEND_DIR"

# Cleanup
rm -f "$TEMP_DOCKERFILE"

echo ""
echo "=============================================="
echo "  Image Built Successfully: $IMAGE"
echo "=============================================="
echo ""
if [ "$GPU_MODE" = true ]; then
    echo "To run with GPU support:"
    echo "  docker run --gpus all -p 8000:8000 $IMAGE"
else
    echo "To run (CPU mode):"
    echo "  docker run -p 8000:8000 $IMAGE"
fi
echo ""
echo "Image size:"
docker images "$IMAGE" --format "{{.Repository}}:{{.Tag}} - {{.Size}}"
