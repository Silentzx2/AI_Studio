#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# AI 3D Studio v3.2 — Production Packaging Script
# Captures the CURRENT prepared machine state into a production Docker image
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="ai-studio"
IMAGE_TAG="production"
DOCKERFILE="/tmp/Dockerfile.ai-studio"
ENTRYPOINT="/tmp/docker-entrypoint.sh"
TARBALL="${PROJECT_ROOT}/${IMAGE_NAME}.tar"
TARBALL_GZ="${PROJECT_ROOT}/${IMAGE_NAME}.tar.gz"
DOCKERIGNORE="${PROJECT_ROOT}/.dockerignore"

# ── Helpers ──────────────────────────────────────────────────────────────────
log()   { echo -e "\033[0;32m[PKG]\033[0m  $*"; }
info()  { echo -e "\033[0;36m[INFO]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m $*"; }
err()   { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }

# ── Prerequisites ────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    err "Docker is not installed or not in PATH."
    exit 1
fi

if [[ ! -d "${PROJECT_ROOT}/backend/.venv" ]]; then
    err "Backend virtual environment not found at ${PROJECT_ROOT}/backend/.venv"
    err "The current machine does not appear to be prepared."
    exit 1
fi

if [[ ! -d "${PROJECT_ROOT}/.next" ]]; then
    err "Next.js build output not found at ${PROJECT_ROOT}/.next"
    err "The frontend does not appear to be built."
    exit 1
fi

cd "${PROJECT_ROOT}"

# ════════════════════════════════════════════════════════════════════════════
# STEP 1: Stop running services safely
# ════════════════════════════════════════════════════════════════════════════
log "Step 1/8: Stopping running services..."
if [[ -f "scripts/stop.sh" ]]; then
    bash scripts/stop.sh || warn "Service stop had non-fatal errors"
else
    warn "scripts/stop.sh not found — killing known processes directly"
    pkill -f "uvicorn app.main:app" 2>/dev/null || true
    pkill -f "celery -A app.workers.celery_app worker" 2>/dev/null || true
    pkill -f "next-server|next start" 2>/dev/null || true
    pkill -f "redis-server" 2>/dev/null || true
    pkill -f "postgres" 2>/dev/null || true
    sleep 3
fi
log "Services stopped."

# ════════════════════════════════════════════════════════════════════════════
# STEP 2: Clean only non-essential files
# ════════════════════════════════════════════════════════════════════════════
log "Step 2/8: Cleaning logs, temporary files, caches, and model weights..."

# Logs
rm -rf logs/
mkdir -p logs

# PID files (runtime state)
rm -rf .pids/

# Backend caches
rm -rf backend/.cache/
rm -rf backend/.runtime_cache/

# HuggingFace cache
rm -rf backend/third_party/.hf_cache/

# Model weights — EXCLUDED from production image per user requirement
rm -rf backend/third_party/weights/
for repo in AniGen HoloPart Hunyuan3D-2 TRELLIS TripoSF TripoSG TripoSR UniRig; do
    rm -rf "backend/third_party/${repo}/weights/"
done

# Generated outputs / user data / thumbnails
rm -rf backend/storage/exports/
rm -rf backend/storage/images/
rm -rf backend/storage/uploads/
rm -rf backend/storage/thumbnails/

# Python bytecode caches
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true

# Next.js build cache (turbopack cache)
rm -rf .next/turbopack 2>/dev/null || true

log "Clean complete."

# ════════════════════════════════════════════════════════════════════════════
# STEP 2b: Create .dockerignore to speed up build context transfer
# ════════════════════════════════════════════════════════════════════════════
log "Creating .dockerignore to reduce build context size..."

cat > "${DOCKERIGNORE}" << 'DOCKERIGNORE'
# Git metadata (not needed at runtime, repos work without it)
.git/
.gitignore

# Root development node_modules (standalone build has its own)
node_modules/

# Logs and runtime state (already cleaned above)
logs/
.pids/

# IDE / editor junk
.idea/
.vscode/
*.swp
*.swo
*~

# OS junk
.DS_Store
Thumbs.db

# Large generated files already excluded
backend/third_party/weights/
backend/third_party/*/weights/
backend/storage/exports/
backend/storage/images/
backend/storage/uploads/
backend/storage/thumbnails/

# Python bytecode
**/__pycache__/
**/*.pyc

# Turbopack cache
.next/turbopack/

# Keep .env — it's needed for config defaults
!.env
!.env.example

# Keep all source, venvs, repos, and build artifacts
!backend/
!backend/.venv/
!backend/third_party/*/.venv/
!backend/third_party/*/
!.next/
DOCKERIGNORE

log ".dockerignore created."

# ════════════════════════════════════════════════════════════════════════════
# STEP 3: Generate Dockerfile
# ════════════════════════════════════════════════════════════════════════════
log "Step 3/8: Generating Dockerfile..."

cat > "${DOCKERFILE}" << 'DOCKERFILE'
# ponytail: O(n) venv relink on build; acceptable because venvs are static after packaging
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

LABEL maintainer="ai-studio"
LABEL description="AI 3D Studio v3.2 — production capture of prepared machine state"
LABEL cuda="12.1"

# ── System runtime dependencies ──────────────────────────────────────────────
# Miniconda provides Python 3.12 (matches venv home paths)
# PostgreSQL 14 + Redis (services started in entrypoint)
# Node.js 22 (frontend runtime)
# Shared libraries for compiled Python/C++/CUDA extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql postgresql-client postgresql-contrib postgresql-common \
    redis-server \
    curl ca-certificates git \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
    libgomp1 libopenblas0 libffi8 libssl3 zlib1g \
    libjpeg-turbo8 libpng16-16 libwebp7 libtiff5 libfreetype6 libopenjp2-7 \
    && rm -rf /var/lib/apt/lists/*

# ── Miniconda (Python 3.12 runtime for venvs) ─────────────────────────────────
RUN curl -fsSL https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -o /tmp/miniconda.sh \
    && bash /tmp/miniconda.sh -b -p /opt/miniconda3 \
    && rm -f /tmp/miniconda.sh \
    && /opt/miniconda3/bin/python3.12 --version
ENV PATH="/opt/miniconda3/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# ── Node.js 22.14.0 (matches current machine) ────────────────────────────────
RUN curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz -o /tmp/node.tar.xz \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm -f /tmp/node.tar.xz \
    && node --version && npm --version

# ── Copy prepared application state ─────────────────────────────────────────
# Entire project: source, venvs, compiled extensions, build artifacts, repos
COPY . /app/AI_Studio/

WORKDIR /app/AI_Studio

# ── Relink virtual environments to Miniconda Python ──────────────────────────
# venvs were created with conda Python; repoint to miniconda Python 3.12.
# This is NOT rebuilding — it is correcting symlinks so existing
# compiled .so files and site-packages execute against the container runtime.
RUN set -eux; \
    find /app/AI_Studio -type f -name "pyvenv.cfg" | while read cfg; do \
        sed -i 's|^home = .*|home = /opt/miniconda3/bin|' "$cfg" 2>/dev/null || true; \
    done; \
    for venv in $(find /app/AI_Studio -type d -name ".venv" | sort); do \
        echo "Relinking venv: $venv"; \
        rm -f "$venv/bin/python" "$venv/bin/python3" "$venv/bin/python3.12" 2>/dev/null || true; \
        ln -s /opt/miniconda3/bin/python3.12 "$venv/bin/python"; \
        ln -s /opt/miniconda3/bin/python3.12 "$venv/bin/python3"; \
        ln -s /opt/miniconda3/bin/python3.12 "$venv/bin/python3.12"; \
    done

# ── Runtime environment ──────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

# Database: default to SQLite so container boots without external DB.
# Set DATABASE_URL to PostgreSQL DSN at runtime if you have an external DB.
ENV DATABASE_URL=sqlite:///./backend/storage/studio.db
ENV DATABASE_SYNC_URL=sqlite:///./backend/storage/studio.db
ENV REDIS_URL=redis://localhost:6379/0
ENV CELERY_BROKER_URL=redis://localhost:6379/0
ENV CELERY_RESULT_BACKEND=redis://localhost:6379/1
ENV AI_PROVIDER=triposr
ENV RUNTIME_MODE=local
ENV CUDA_DEVICE=auto
ENV STORAGE_LOCAL_PATH=./backend/storage
ENV BLENDER_EXECUTABLE=blender
ENV BLENDER_ENABLED=true
ENV OFFLINE_MODE=false
ENV MAX_CONCURRENT_JOBS=1
ENV API_V1_PREFIX=/api/v1

# ── Ports ────────────────────────────────────────────────────────────────────
EXPOSE 3000 8000 5432 6379

# ── Entrypoint ───────────────────────────────────────────────────────────────
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["start"]
DOCKERFILE

log "Dockerfile written to ${DOCKERFILE}"

# ════════════════════════════════════════════════════════════════════════════
# STEP 4: Generate entrypoint script
# ════════════════════════════════════════════════════════════════════════════
log "Step 4/8: Generating entrypoint script..."

cat > "${ENTRYPOINT}" << 'ENTRYPOINT'
#!/bin/bash
set -e

WORKDIR="/app/AI_Studio"
cd "$WORKDIR"

case "${1:-start}" in
    start)
        mkdir -p "$WORKDIR/logs" "$WORKDIR/.pids" "$WORKDIR/backend/storage"

        echo "[ENTRYPOINT] Initializing services..."

        # ── PostgreSQL ──────────────────────────────────────────────────────
        PG_VERSION="14"
        PG_DATA_DIR="/var/lib/postgresql/${PG_VERSION}/main"
        PG_CONF_DIR="/etc/postgresql/${PG_VERSION}/main"

        if command -v pg_createcluster >/dev/null 2>&1 && [[ ! -d "${PG_DATA_DIR}" ]]; then
            echo "[ENTRYPOINT] Initializing PostgreSQL cluster..."
            pg_createcluster "${PG_VERSION}" main
            sed -i "s/^#listen_addresses.*/listen_addresses = '*'/" "${PG_CONF_DIR}/postgresql.conf" || true
            echo "host all all 0.0.0.0/0 md5" >> "${PG_CONF_DIR}/pg_hba.conf" || true
            su - postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\"" 2>/dev/null || true
            su - postgres -c "psql -c \"CREATE DATABASE ai3dstudio;\"" 2>/dev/null || true
        fi

        if command -v service >/dev/null 2>&1; then
            service postgresql start 2>/dev/null || true
        else
            pg_ctlcluster "${PG_VERSION}" main start 2>/dev/null || true
        fi
        sleep 2
        pg_isready -q 2>/dev/null || echo "[ENTRYPOINT] PostgreSQL not ready (SQLite fallback active)"

        # ── Redis ───────────────────────────────────────────────────────────
        redis-server --daemonize yes 2>/dev/null || true
        sleep 1
        redis-cli ping >/dev/null 2>&1 || echo "[ENTRYPOINT] Redis not ready (in-process broker fallback active)"

        # ── Migrations ─────────────────────────────────────────────────────
        echo "[ENTRYPOINT] Running database migrations..."
        cd "$WORKDIR/backend"
        "$WORKDIR/backend/.venv/bin/python" -m alembic upgrade head 2>/dev/null || echo "[ENTRYPOINT] Migrations skipped or already applied"
        cd "$WORKDIR"

        # ── Backend API ────────────────────────────────────────────────────
        echo "[ENTRYPOINT] Starting Backend API on :8000..."
        nohup "$WORKDIR/backend/.venv/bin/python" -m uvicorn app.main:app \
            --host 0.0.0.0 \
            --port 8000 \
            --log-level info \
            > logs/api.log 2>&1 &
        echo $! > .pids/api.pid

        echo "[ENTRYPOINT] Waiting for API health (timeout 60s)..."
        for i in $(seq 1 30); do
            if curl -sf http://localhost:8000/api/v1/health >/dev/null 2>&1; then
                echo "[ENTRYPOINT] API healthy."
                break
            fi
            sleep 2
        done
        curl -sf http://localhost:8000/api/v1/health >/dev/null 2>&1 || \
            echo "[ENTRYPOINT] WARNING: API did not become healthy within timeout"

        # ── Celery Worker ──────────────────────────────────────────────────
        echo "[ENTRYPOINT] Starting Celery Worker..."
        cd "$WORKDIR/backend"
        nohup "$WORKDIR/backend/.venv/bin/python" -m celery -A app.workers.celery_app worker \
            --loglevel=info \
            --concurrency=1 \
            -Q generation,images \
            > ../logs/worker.log 2>&1 &
        echo $! > ../.pids/worker.pid
        cd "$WORKDIR"

        # ── Frontend (Next.js standalone) ──────────────────────────────────
        echo "[ENTRYPOINT] Starting Frontend on :3000..."
        cd "$WORKDIR/.next/standalone"
        nohup node server.js > ../logs/frontend.log 2>&1 &
        echo $! > ../.pids/frontend.pid
        cd "$WORKDIR"

        echo "[ENTRYPOINT] ============================================"
        echo "[ENTRYPOINT]  All services started"
        echo "[ENTRYPOINT]  Frontend:  http://localhost:3000"
        echo "[ENTRYPOINT]  Backend:   http://localhost:8000"
        echo "[ENTRYPOINT]  API Docs:  http://localhost:8000/docs"
        echo "[ENTRYPOINT] ============================================"

        # Keep container alive
        tail -f /dev/null
        ;;
    *)
        exec "$@"
        ;;
esac
ENTRYPOINT

chmod +x "${ENTRYPOINT}"
log "Entrypoint written to ${ENTRYPOINT}"

# ════════════════════════════════════════════════════════════════════════════
# STEP 5: Build Docker image
# ════════════════════════════════════════════════════════════════════════════
log "Step 5/8: Building Docker image ${IMAGE_NAME}:${IMAGE_TAG}..."

# Estimate build context size
CONTEXT_SIZE=$(du -sh . | cut -f1)
info "Build context size: ${CONTEXT_SIZE}"

docker build \
    --no-cache \
    -f "${DOCKERFILE}" \
    -t "${IMAGE_NAME}:${IMAGE_TAG}" \
    .

log "Docker image built: ${IMAGE_NAME}:${IMAGE_TAG}"

# ════════════════════════════════════════════════════════════════════════════
# STEP 6: Export image as tar
# ════════════════════════════════════════════════════════════════════════════
log "Step 6/8: Exporting image to ${TARBALL}..."
docker save "${IMAGE_NAME}:${IMAGE_TAG}" -o "${TARBALL}"
log "Exported: ${TARBALL}"

# ════════════════════════════════════════════════════════════════════════════
# STEP 7: Compress and checksum
# ════════════════════════════════════════════════════════════════════════════
log "Step 7/8: Compressing and generating checksums..."

gzip -c "${TARBALL}" > "${TARBALL_GZ}"
sha256sum "${TARBALL}"     > "${TARBALL}.sha256"
sha256sum "${TARBALL_GZ}"  > "${TARBALL_GZ}.sha256"

log "Compressed: ${TARBALL_GZ}"
log "Checksums generated:"
cat "${TARBALL}.sha256"
cat "${TARBALL_GZ}.sha256"

# ════════════════════════════════════════════════════════════════════════════
# STEP 8: Summary and commands
# ════════════════════════════════════════════════════════════════════════════
log "Step 8/8: Packaging complete."

TAR_SIZE=$(du -sh "${TARBALL}" | cut -f1)
GZ_SIZE=$(du -sh "${TARBALL_GZ}" | cut -f1)

echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo "  Production Package Summary"
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "  Image:         ${IMAGE_NAME}:${IMAGE_TAG}"
echo "  Uncompressed:  ${TARBALL} (${TAR_SIZE})"
echo "  Compressed:    ${TARBALL_GZ} (${GZ_SIZE})"
echo ""
echo "  SHA256 (tar):"
cat "${TARBALL}.sha256"
echo ""
echo "  SHA256 (tar.gz):"
cat "${TARBALL_GZ}.sha256"
echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "To load on the target machine:"
echo ""
echo "  docker load -i ${IMAGE_NAME}.tar.gz"
echo "  # or uncompressed:"
echo "  docker load -i ${IMAGE_NAME}.tar"
echo ""
echo "To run (with GPU):"
echo ""
echo "  docker run --gpus all \\"
echo "    -p 3000:3000 -p 8000:8000 \\"
echo "    -v ai-studio-data:/app/AI_Studio/backend/storage \\"
echo "    ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "To run with external PostgreSQL:"
echo ""
echo "  docker run --gpus all \\"
echo "    -p 3000:3000 -p 8000:8000 \\"
echo "    -e DATABASE_URL=postgresql+asyncpg://user:pass@db-host:5432/ai3dstudio \\"
echo "    -e DATABASE_SYNC_URL=postgresql://user:pass@db-host:5432/ai3dstudio \\"
echo "    -e REDIS_URL=redis://redis-host:6379/0 \\"
echo "    -e CELERY_BROKER_URL=redis://redis-host:6379/0 \\"
echo "    -e CELERY_RESULT_BACKEND=redis://redis-host:6379/1 \\"
echo "    ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "To verify after loading:"
echo ""
echo "  docker images | grep ${IMAGE_NAME}"
echo "  docker inspect ${IMAGE_NAME}:${IMAGE_TAG} | grep -A5 Cmd"
echo ""
