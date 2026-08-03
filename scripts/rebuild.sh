#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║   AI 3D Studio v3.2 - Smart Rebuild Script                      ║
# ║                                                                  ║
# ║   Usage: ./scripts/rebuild.sh [options] [service1 service2 ...]  ║
# ║                                                                  ║
# ║   Modes:                                                         ║
# ║     (default)  Cached rebuild — fast, uses Docker layer cache    ║
# ║     --clean    Full clean rebuild — prunes cache, no-cache build  ║
# ║     --stop     Stop containers before rebuilding                  ║
# ║     --no-gpu   Force CPU-only (skip docker-compose.gpu.yml)       ║
# ║                                                                  ║
# ║   Examples:                                                       ║
# ║     ./scripts/rebuild.sh                   # Cached rebuild all   ║
# ║     ./scripts/rebuild.sh api                # Cached rebuild API   ║
# ║     ./scripts/rebuild.sh --clean            # Full clean rebuild    ║
# ║     ./scripts/rebuild.sh --stop api worker  # Stop + rebuild       ║
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

# ── Parse Flags ───────────────────────────────────────────────────────
CLEAN=false
STOP_BEFORE=false
FORCE_NO_GPU=false
SERVICES=()

for arg in "$@"; do
    case "$arg" in
        --clean)   CLEAN=true ;;
        --stop)    STOP_BEFORE=true ;;
        --no-gpu)  FORCE_NO_GPU=true ;;
        --help|-h)
            echo -e "${CYAN}AI 3D Studio v3.2 - Smart Rebuild Script${NC}"
            echo ""
            echo "Usage: $0 [options] [service ...]"
            echo ""
            echo "Options:"
            echo "  --clean    Full clean rebuild (prune cache + --no-cache)"
            echo "  --stop     Stop containers before rebuilding"
            echo "  --no-gpu   Force CPU-only mode (skip docker-compose.gpu.yml)"
            echo "  --help     Show this help"
            echo ""
            echo "Services (default: api worker migrate):"
            echo "  api        FastAPI backend server"
            echo "  worker     Celery generation worker"
            echo "  migrate    Database migration runner"
            echo "  frontend   Next.js frontend"
            echo "  All services can be listed space-separated"
            exit 0
            ;;
        -*)
            err "Unknown option: $arg"
            echo "Run '$0 --help' for usage information."
            exit 1
            ;;
        *)
            SERVICES+=("$arg")
            ;;
    esac
done

# ── Project Root ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ── Pre-flight Checks ────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    err "Docker is not installed or not in PATH."
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
COMPOSE_FILES=("-f" "docker-compose.yml")
GPU_DETECTED=false

if [ "$FORCE_NO_GPU" = false ]; then
    if docker info 2>/dev/null | grep -qi 'runtimes.*nvidia'; then
        if [ -f docker-compose.gpu.yml ]; then
            COMPOSE_FILES+=("-f" "docker-compose.gpu.yml")
            GPU_DETECTED=true
        else
            warn "NVIDIA runtime detected but docker-compose.gpu.yml not found"
        fi
    fi
fi

# ── Default Services ─────────────────────────────────────────────────
if [ ${#SERVICES[@]} -eq 0 ]; then
    SERVICES=("api" "worker" "migrate")
fi

# ── Banner ────────────────────────────────────────────────────────────
echo -e "${CYAN}🔄 AI 3D Studio v3.2 — Smart Rebuild${NC}"
echo "==========================================="
echo ""
if [ "$CLEAN" = true ]; then
    warn "MODE: Full clean rebuild (--clean)"
else
    ok "MODE: Cached rebuild (fast — uses Docker layer cache)"
fi
if [ "$STOP_BEFORE" = true ]; then
    info "Will stop containers before rebuilding"
fi
info "Services: ${SERVICES[*]}"
if [ "$GPU_DETECTED" = true ]; then
    ok "GPU detected — including docker-compose.gpu.yml"
else
    info "GPU not detected or forced off — CPU-only build"
fi
echo ""

# ── Step 1: Stop Containers (if requested) ───────────────────────────
if [ "$STOP_BEFORE" = true ]; then
    step "⏹  Stopping containers..."
    docker compose "${COMPOSE_FILES[@]}" down --remove-orphans 2>/dev/null || true
    ok "Containers stopped"
    echo ""
fi

# ── Step 2: Clean Build Cache (only with --clean) ────────────────────
if [ "$CLEAN" = true ]; then
    step "🧹 Pruning build cache for this project..."
    # Filter prune to this project's images only
    docker builder prune --filter "label=com.docker.compose.project=$(basename "$PROJECT_ROOT")" -f 2>/dev/null || \
        docker builder prune -f 2>/dev/null || true
    ok "Build cache pruned"
    echo ""
fi

# ── Step 3: Build ────────────────────────────────────────────────────
BUILD_ARGS=("${COMPOSE_FILES[@]}")
if [ "$CLEAN" = true ]; then
    BUILD_ARGS+=("--no-cache")
    step "🔨 Building images (--no-cache, clean)..."
else
    step "🔨 Building images (cached — only changed layers)..."
fi

BUILD_FAILED=false
FAILED_SERVICE=""

for service in "${SERVICES[@]}"; do
    info "   → Building ${service}..."
    if ! docker compose "${BUILD_ARGS[@]}" build "$service" 2>&1; then
        FAILED_SERVICE="$service"
        BUILD_FAILED=true
        break
    fi
    ok "${service} built successfully"
done

if [ "$BUILD_FAILED" = true ]; then
    echo ""
    err "Build failed for service: ${FAILED_SERVICE}"
    echo ""
    echo -e "${RED}Build logs for ${FAILED_SERVICE}:${NC}"
    docker compose "${COMPOSE_FILES[@]}" logs "$FAILED_SERVICE" --tail=50 2>/dev/null || true
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "  • Check the error above for missing dependencies or syntax issues"
    echo "  • Run '$0 --clean ${SERVICES[*]}' for a full clean rebuild"
    echo "  • Run 'docker compose logs ${FAILED_SERVICE}' for full logs"
    exit 1
fi

echo ""
ok "All images built successfully"
echo ""

# ── Step 4: Start Services ───────────────────────────────────────────
step "🚀 Starting containers..."
docker compose "${COMPOSE_FILES[@]}" up -d
ok "Containers started"
echo ""

# ── Step 5: Container Status ─────────────────────────────────────────
step "📊 Container Status:"
docker compose "${COMPOSE_FILES[@]}" ps
echo ""

# ── Step 6: Health Check ─────────────────────────────────────────────
# Only check API health if 'api' is among the services we rebuilt
CHECK_HEALTH=false
for svc in "${SERVICES[@]}"; do
    if [ "$svc" = "api" ]; then
        CHECK_HEALTH=true
        break
    fi
done

if [ "$CHECK_HEALTH" = true ]; then
    step "⏳ Waiting for API to become healthy..."

    MAX_WAIT=90
    WAITED=0

    while [ "$WAITED" -lt "$MAX_WAIT" ]; do
        # Check container is still running
        API_CONTAINER=$(docker compose "${COMPOSE_FILES[@]}" ps -q api 2>/dev/null || true)
        if [ -n "$API_CONTAINER" ]; then
            API_STATUS=$(docker inspect --format='{{.State.Status}}' "$API_CONTAINER" 2>/dev/null || echo "unknown")
            if [ "$API_STATUS" != "running" ]; then
                echo ""
                err "API container exited with status: ${API_STATUS}"
                echo ""
                echo -e "${RED}Recent API logs:${NC}"
                docker compose "${COMPOSE_FILES[@]}" logs api --tail=40 2>/dev/null || true
                exit 1
            fi
        fi

        # Try health endpoint
        if curl -sf http://localhost:8000/api/v1/health >/dev/null 2>&1; then
            echo ""
            ok "API is healthy!"
            break
        fi

        echo -n "."
        sleep 3
        WAITED=$((WAITED + 3))
    done

    if [ "$WAITED" -ge "$MAX_WAIT" ]; then
        echo ""
        warn "API did not respond within ${MAX_WAIT}s"
        warn "This can be normal on first run (model loading may take several minutes)"
        echo -e "${DIM}  Check: docker compose logs -f api${NC}"
    fi
    echo ""
fi

# ── Done ─────────────────────────────────────────────────────────────
echo "==========================================="
echo -e "${GREEN}✅ Rebuild Complete!${NC}"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo "  • View logs:       docker compose ${COMPOSE_FILES[*]} logs -f api"
echo "  • Check status:    docker compose ${COMPOSE_FILES[*]} ps"
echo "  • Stop all:        docker compose ${COMPOSE_FILES[*]} down"
echo "  • Restart a svc:   docker compose ${COMPOSE_FILES[*]} restart <service>"
echo "  • Full clean:      $0 --clean ${SERVICES[*]}"
echo "  • Stop + rebuild:  $0 --stop ${SERVICES[*]}"
echo ""
echo -e "${DIM}Project root: ${PROJECT_ROOT}${NC}"
