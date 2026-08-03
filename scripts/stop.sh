#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║   AI 3D Studio v3.2 - Shutdown Script                         ║
# ║                                                                  ║
# ║   Gracefully stops all services and removes containers.          ║
# ║   GPU auto-detected to use correct compose files.                ║
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
    exit 1
fi

if ! docker info &>/dev/null; then
    echo -e "${YELLOW}Docker daemon is not running — nothing to stop.${NC}"
    exit 0
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
echo -e "${CYAN}⏹  AI 3D Studio v3.2 — Shutdown${NC}"
echo "==========================================="
echo ""
if [ "$GPU_DETECTED" = true ]; then
    info "Mode: GPU (NVIDIA CUDA)"
else
    info "Mode: CPU-only"
fi
echo ""

# ── Step 1/3: Graceful Stop ──────────────────────────────────────────
step "[1/3] Stopping application services..."
run_compose stop frontend 2>/dev/null || true
run_compose stop api worker 2>/dev/null || true
ok "Application services stopped"
echo ""

# ── Step 2/3: Stop Infrastructure ─────────────────────────────────────
step "[2/3] Stopping infrastructure..."
run_compose stop postgres redis 2>/dev/null || true
ok "Infrastructure stopped"
echo ""

# ── Step 3/3: Remove Containers ──────────────────────────────────────
step "[3/3] Removing containers..."

# Stop and remove all project containers + orphan containers
run_compose down --remove-orphans 2>/dev/null || true

# Clean stale worker container if compose down missed it (no hardcoded name)
run_compose rm -f worker 2>/dev/null || true

ok "All containers removed"
echo ""

# ── Success ───────────────────────────────────────────────────────────
echo "==========================================="
echo -e "${GREEN}✅ AI 3D Studio Stopped${NC}"
echo "==========================================="
echo ""
echo -e "  ${DIM}Project root: ${PROJECT_ROOT}${NC}"
echo -e "  ${DIM}To start again: ./scripts/start.sh${NC}"
echo ""
