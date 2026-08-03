#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║   AI 3D Studio v3.2 - System Status Check                      ║
# ║                                                                  ║
# ║   Shows container status, health, errors, resources, ports,     ║
# ║   and storage bind-mount usage.                                  ║
# ║                                                                  ║
# ║   Uses set -uo pipefail (NOT set -e) because check_service()    ║
# ║   returns non-zero for unhealthy services intentionally.         ║
# ╚══════════════════════════════════════════════════════════════════╝

set -uo pipefail

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

# ── Project Root ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ── GPU Detection ────────────────────────────────────────────────────
GPU_DETECTED=false
DOCKER_OK=false

if command -v docker &>/dev/null && docker info &>/dev/null; then
    DOCKER_OK=true
    if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
        if docker info 2>/dev/null | grep -qi 'runtimes.*nvidia'; then
            GPU_DETECTED=true
        fi
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

# ── Storage Display (callable even without Docker) ───────────────────
show_storage_section() {
    echo -e "${BLUE}📁 Storage (bind mounts):${NC}"
    echo "----------------------------------------"

    show_dir_status() {
        local dir=$1
        local label=$2

        if [ ! -d "$dir" ]; then
            echo -e "  ${RED}✘ ${label}: ${dir} — not found${NC}"
            return
        fi

        local size
        size=$(du -sh "$dir" 2>/dev/null | cut -f1 || echo "unknown")
        local item_count
        item_count=$(find "$dir" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l)

        echo -e "  ${GREEN}✔ ${label}${NC} ${DIM}(${dir})${NC}"
        echo -e "      Size: ${size}  |  Top-level items: ${item_count}"
    }

    show_dir_status "backend/storage" "Uploads & Exports"
    show_dir_status "backend/third_party" "Models & Providers"
    show_dir_status "backend/.runtime_cache" "Runtime Cache"

    echo ""
}

# ── Banner ────────────────────────────────────────────────────────────
echo -e "${CYAN}🔍 AI 3D Studio v3.2 — System Status${NC}"
echo "==========================================="
echo ""

if [ "$DOCKER_OK" = false ]; then
    err "Docker is not running — cannot check container status"
    echo ""
    show_storage_section
    exit 1
fi

if [ "$GPU_DETECTED" = true ]; then
    info "Mode: GPU (NVIDIA CUDA)"
else
    info "Mode: CPU-only"
fi
echo ""

# ── 1. Container Status ──────────────────────────────────────────────
echo -e "${BLUE}📦 Container Status:${NC}"
echo "----------------------------------------"
run_compose ps -a --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo -e "${RED}  ✖ No containers found${NC}"

echo ""

# ── 2. Health Check ──────────────────────────────────────────────────
echo -e "${BLUE}❤️  Health Status:${NC}"
echo "----------------------------------------"

check_service() {
    local service=$1
    local container
    container=$(run_compose ps -q "$service" 2>/dev/null) || true

    if [ -z "$container" ]; then
        echo -e "  ${RED}✘ ${service}: Not running${NC}"
        return 1
    fi

    local health status
    health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")
    status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")

    if [ "$health" = "healthy" ]; then
        echo -e "  ${GREEN}✔ ${service}: Healthy ✨${NC}"
        return 0
    elif [ "$status" = "running" ]; then
        echo -e "  ${YELLOW}⚠ ${service}: Running (health: ${health})${NC}"
        return 1
    else
        echo -e "  ${RED}✘ ${service}: ${status}${NC}"
        return 1
    fi
}

ALL_HEALTHY=true

for service in postgres redis api worker frontend; do
    check_service "$service" || ALL_HEALTHY=false
done

echo ""

# ── 3. Recent Errors (last 5 minutes) ────────────────────────────────
echo -e "${BLUE}🐛 Recent Errors (if any):${NC}"
echo "----------------------------------------"

ERROR_LINES=$(run_compose logs --since=5m 2>/dev/null | grep -iE "(error|failed|traceback|exception)" | tail -5)
ERROR_COUNT=$(echo "$ERROR_LINES" | grep -c . 2>/dev/null || echo 0)

if [ "$ERROR_COUNT" -gt 0 ]; then
    echo "$ERROR_LINES" | while IFS= read -r line; do
        echo -e "  ${RED}${line}${NC}"
    done
else
    echo -e "  ${GREEN}✅ No recent errors!${NC}"
fi

echo ""

# ── 4. Resource Usage ────────────────────────────────────────────────
echo -e "${BLUE}💾 Resource Usage:${NC}"
echo "----------------------------------------"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || echo -e "${YELLOW}  ⚠ No containers running${NC}"

echo ""

# ── 5. Port Availability ─────────────────────────────────────────────
echo -e "${BLUE}🌐 Service Endpoints:${NC}"
echo "----------------------------------------"

check_port() {
    local port=$1
    local name=$2

    if command -v nc &>/dev/null; then
        if nc -z localhost "$port" 2>/dev/null; then
            echo -e "  ${GREEN}✔ http://localhost:${port} (${name})${NC}"
        else
            echo -e "  ${RED}✘ Port ${port} (${name}) — Not responding${NC}"
            ALL_HEALTHY=false
        fi
    elif command -v curl &>/dev/null; then
        if curl -s "http://localhost:${port}" >/dev/null 2>&1; then
            echo -e "  ${GREEN}✔ http://localhost:${port} (${name})${NC}"
        else
            echo -e "  ${YELLOW}⚠ Port ${port} (${name}) — Unknown status${NC}"
        fi
    else
        echo "  ℹ️  Port ${port} (${name}) — Install netcat/curl to check"
    fi
}

check_port 3000 "Frontend"
check_port 8000 "Backend API"
check_port 5432 "PostgreSQL"
check_port 6379 "Redis"

echo ""

# ── 6. Storage Status ────────────────────────────────────────────────
show_storage_section

# ── Summary ──────────────────────────────────────────────────────────
echo "==========================================="

if [ "$ALL_HEALTHY" = true ]; then
    echo -e "${GREEN}✅ All Systems Operational! 🎉${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️ Some services need attention${NC}"
    echo -e "${BLUE}💡 Troubleshooting:${NC}"
    echo -e "  ${DIM}./scripts/rebuild.sh          Rebuild and restart${NC}"
    echo -e "  ${DIM}docker compose logs -f <svc>  Tail logs for a service${NC}"
    exit 1
fi
