#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║   AI 3D Studio v3.2 - Startup Script                           ║
# ║                                                                  ║
# ║   Starts all services in order:                                  ║
# ║     infra (postgres, redis) → api → migrate → worker → frontend ║
# ║                                                                  ║
# ║   GPU auto-detected from nvidia-container-runtime.               ║
# ║   Fails fast only on GPU validation (when GPU detected).         ║
# ║   Non-critical step failures show logs and continue.            ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────
info()  { echo -e "${CYAN}$1${NC}"; }
ok()    { echo -e "${GREEN}  ✔ $1${NC}"; }
warn()  { echo -e "${YELLOW}  ⚠ $1${NC}"; }
err()   { echo -e "${RED}  ✖ $1${NC}"; }
step()  { echo -e "${BLUE}$1${NC}"; }

# ── Project Root ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ── Pre-flight: Docker ────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    err "Docker is not installed or not in PATH."
    echo "  Install: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! docker info &>/dev/null; then
    err "Docker daemon is not running. Start it first."
    exit 1
fi

if [ ! -f docker-compose.yml ]; then
    err "docker-compose.yml not found in ${PROJECT_ROOT}"
    exit 1
fi

# ── GPU Detection ────────────────────────────────────────────────────
GPU_DETECTED=false

if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
    if docker info 2>/dev/null | grep -qi 'runtimes.*nvidia'; then
        GPU_DETECTED=true
    fi
fi

# ── Build Compose Command ────────────────────────────────────────────
COMPOSE_FILES=("-f" "docker-compose.yml")
if [ "$GPU_DETECTED" = true ] && [ -f docker-compose.gpu.yml ]; then
    COMPOSE_FILES+=("-f" "docker-compose.gpu.yml")
fi

# Helper: run compose command
run_compose() {
    docker compose "${COMPOSE_FILES[@]}" "$@"
}

# ── Banner ────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}🚀 AI 3D Studio v3.2 — Starting${NC}"
echo "==========================================="
echo ""
if [ "$GPU_DETECTED" = true ]; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "unknown")
    DRIVER_VER=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1 || echo "unknown")
    ok "GPU: ${GPU_NAME}"
    ok "Driver: ${DRIVER_VER}"
    ok "NVIDIA Container Runtime: available"
else
    info "Mode: CPU-only (no NVIDIA GPU detected)"
    if [ -f docker-compose.gpu.yml ]; then
        warn "docker-compose.gpu.yml exists but GPU runtime not available"
    fi
fi
echo ""

# ── GPU Validation (only when GPU is detected) ───────────────────────
if [ "$GPU_DETECTED" = true ]; then
    info "Validating GPU setup..."
    GPU_ERRORS=0

    # Verify nvidia-smi works
    if ! nvidia-smi &>/dev/null; then
        err "nvidia-smi failed — GPU may not be properly connected"
        GPU_ERRORS=$((GPU_ERRORS + 1))
    fi

    # Verify docker can access GPU
    if ! docker run --rm --gpus all nvidia/cuda:12.1-base nvidia-smi &>/dev/null; then
        warn "Docker GPU test failed — pulling image first time may take a while"
        warn "If this persists, ensure nvidia-container-toolkit is configured"
        warn "  sudo nvidia-ctk runtime configure --runtime=docker"
        warn "  sudo systemctl restart docker"
    fi

    if [ "$GPU_ERRORS" -gt 0 ]; then
        echo ""
        err "GPU validation failed. Fix the issues above or remove docker-compose.gpu.yml for CPU-only mode."
        exit 1
    fi
    ok "GPU validation passed"
    echo ""
fi

# ── Step 0: Check for existing containers ─────────────────────────────
EXISTING=$(run_compose ps --quiet 2>/dev/null || true)
if [ -n "$EXISTING" ]; then
    info "Existing containers detected — cleaning up..."
    run_compose down --remove-orphans 2>/dev/null || true
    ok "Old containers removed"
    echo ""
fi

# ── Step 1/5: Start Infrastructure ───────────────────────────────────
step "[1/5] Starting infrastructure (postgres + redis)..."

run_compose up -d postgres redis 2>&1 || {
    err "Failed to start infrastructure services"
    echo ""
    echo -e "${RED}Infrastructure logs:${NC}"
    run_compose logs postgres redis --tail=20 2>/dev/null || true
    echo ""
    err "Cannot continue without database. Check docker-compose.yml."
    exit 1
}

# Wait for Postgres
info "      Waiting for database..."
DB_READY=false
for i in $(seq 1 30); do
    if run_compose exec -T postgres pg_isready -U postgres &>/dev/null; then
        ok "Database ready"
        DB_READY=true
        break
    fi
    sleep 1
done

if [ "$DB_READY" = false ]; then
    err "Database did not become ready in 30s"
    echo ""
    echo -e "${RED}Postgres logs:${NC}"
    run_compose logs postgres --tail=30 2>/dev/null || true
    echo ""
    err "Cannot continue without database."
    exit 1
fi
echo ""

# ── Step 2/5: Start Backend API ─────────────────────────────────────
step "[2/5] Starting backend API..."

run_compose up -d api 2>&1 || {
    err "Failed to start API"
    echo -e "${RED}API logs:${NC}"
    run_compose logs api --tail=30 2>/dev/null || true
}

# Wait for API health endpoint
info "      Waiting for API (timeout: 120s)..."
API_READY=false
for i in $(seq 1 60); do
    if curl -sf http://localhost:8000/api/v1/health &>/dev/null; then
        ok "API is healthy"
        API_READY=true
        break
    fi
    # Check if API container crashed
    API_CONTAINER=$(run_compose ps -q api 2>/dev/null || true)
    if [ -n "$API_CONTAINER" ]; then
        API_STATE=$(docker inspect --format='{{.State.Status}}' "$API_CONTAINER" 2>/dev/null || echo "unknown")
        if [ "$API_STATE" != "running" ]; then
            err "API container exited (status: ${API_STATE})"
            echo -e "${RED}API logs:${NC}"
            run_compose logs api --tail=40 2>/dev/null || true
            break
        fi
    fi
    sleep 2
done

if [ "$API_READY" = false ]; then
    warn "API did not respond within 120s — check: docker compose logs -f api"
fi

echo ""

# ── Step 3/5: Run Migrations ─────────────────────────────────────────
step "[3/5] Running database migrations..."

if ! run_compose run --rm migrate alembic upgrade head 2>&1; then
    warn "Migrations failed or already applied"
    echo -e "${YELLOW}Migration logs:${NC}"
    run_compose logs migrate --tail=20 2>/dev/null || true
    warn "Continuing anyway"
else
    ok "Migrations complete"
fi

echo ""

# ── Step 4/5: Start Worker ───────────────────────────────────────────
step "[4/5] Starting worker..."

# Remove stale worker container if it exists (use compose, not hardcoded name)
run_compose rm -f worker 2>/dev/null || true

if [ "$GPU_DETECTED" = true ]; then
    info "      Starting worker (GPU mode)..."
else
    info "      Starting worker (CPU mode)..."
fi

run_compose up -d --force-recreate worker 2>&1 || {
    err "Failed to start worker"
    echo -e "${RED}Worker logs:${NC}"
    run_compose logs worker --tail=30 2>/dev/null || true
}

echo ""

# ── Step 4b: Start Frontend ─────────────────────────────────────────
if [ -f Dockerfile.frontend ]; then
    step "      Starting frontend..."
    run_compose up -d frontend 2>&1 || {
        warn "Frontend failed to start"
        echo -e "${YELLOW}Frontend logs:${NC}"
        run_compose logs frontend --tail=20 2>/dev/null || true
    }
else
    info "      Frontend skipped (no Dockerfile.frontend)"
fi

echo ""

# ── Step 5/5: Runtime Verification ───────────────────────────────────
step "[5/5] Running runtime verification..."

if run_compose exec -T api python -m runtime verify 2>&1; then
    ok "Runtime verification passed"
else
    warn "Runtime verification failed or skipped — check: docker compose logs api"
fi

echo ""

# ── Summary ───────────────────────────────────────────────────────────
echo "==========================================="
echo -e "${GREEN}✅ AI 3D Studio Started${NC}"
echo "==========================================="
echo ""
echo -e "  Backend API:  ${GREEN}http://localhost:8000${NC}"
echo -e "  API Docs:     ${GREEN}http://localhost:8000/docs${NC}"
if [ -f Dockerfile.frontend ]; then
    echo -e "  Frontend:     ${GREEN}http://localhost:3000${NC}"
fi
echo ""
if [ "$GPU_DETECTED" = true ]; then
    echo -e "  Mode: ${GREEN}GPU (NVIDIA CUDA)${NC}"
else
    echo -e "  Mode: ${YELLOW}CPU-only${NC}"
fi
echo ""
echo -e "${DIM}Project root: ${PROJECT_ROOT}${NC}"
echo -e "${DIM}Logs: docker compose ${COMPOSE_FILES[*]} logs -f <service>${NC}"
echo ""
