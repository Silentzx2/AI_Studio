#!/usr/bin/env bash
# AI 3D Studio v3.2 — Manager Menu
# Interactive management console for the AI 3D Studio application.
#
# Usage: ./manager.sh

set -euo pipefail
cd "$(dirname "$0")/.."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── GPU auto-detection ──────────────────────────────────────────────────────
detect_gpu() {
    if ! command -v nvidia-smi >/dev/null 2>&1; then echo "cpu"; return; fi
    if ! nvidia-smi >/dev/null 2>&1; then echo "cpu"; return; fi
    if ! docker info 2>/dev/null | grep -q "nvidia"; then echo "cpu"; return; fi
    echo "gpu"
}

GPU_MODE="$(detect_gpu)"
if [ "$GPU_MODE" = "gpu" ]; then
    COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.gpu.yml"
    COMPOSE_FILES="docker-compose.yml docker-compose.gpu.yml"
else
    COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.cpu.yml"
    COMPOSE_FILES="docker-compose.yml docker-compose.cpu.yml"
fi

# ── Helpers ─────────────────────────────────────────────────────────────────
_header() {
    clear
    echo ""
    echo -e "${BOLD}================================================${NC}"
    echo -e "${BOLD}  AI 3D Studio v3.2 — Manager${NC}"
    echo -e "${BOLD}================================================${NC}"
    echo ""
}

_status() {
    echo -e "${CYAN}Container Status:${NC}"
    $COMPOSE_CMD ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || \
        docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || \
        echo "  (docker compose not available)"
    echo ""

    # Show which compose files are being used
    echo -e "${CYAN}Compose Files:${NC}  ${COMPOSE_FILES}"
    echo -e "${CYAN}GPU Mode:${NC}       ${GPU_MODE}"
    echo ""

    # Show storage directory sizes if they exist
    echo -e "${CYAN}Storage Usage:${NC}"
    for dir in \
        "backend/storage" \
        "backend/third_party" \
        "backend/.runtime_cache" \
        "logs"; do
        if [ -d "$dir" ]; then
            size=$(du -sh "$dir" 2>/dev/null | cut -f1)
            echo "  $(printf '%-30s' "$dir") ${size}"
        fi
    done
    echo ""
}

_wait_api() {
    local max=${1:-60}
    local url="http://localhost:8000/api/v1/health"
    echo -n "  Waiting for API"
    for i in $(seq 1 $max); do
        if curl -sf "$url" >/dev/null 2>&1; then
            echo -e " ${GREEN}ready${NC}"
            return 0
        fi
        echo -n "."
        sleep 2
    done
    echo -e " ${RED}timeout${NC}"
    return 1
}

# ── Command functions ──────────────────────────────────────────────────────
cmd_start() {
    _header
    echo -e "${CYAN}Starting all services...${NC}"
    bash scripts/start.sh
}

cmd_cloudflare() {
    bash scripts/cloudflare.sh
}

cmd_stop() {
    _header
    echo -e "${CYAN}Stopping all services...${NC}"
    $COMPOSE_CMD down
    echo -e "${GREEN}All services stopped.${NC}"
}

cmd_restart() {
    _header
    echo -e "${CYAN}Restarting all services...${NC}"
    $COMPOSE_CMD down
    bash scripts/start.sh
}

cmd_update_models() {
    _header
    echo -e "${CYAN}Update Models${NC}"
    echo ""
    echo "Choose an option:"
    echo "  1) Full installation (repos + weights)"
    echo "  2) Repos only"
    echo "  3) Weights only"
    echo "  4) Specific model"
    echo "  b) Back"
    echo ""
    read -rp "Choice: " choice
    case "$choice" in
        1)
            echo ""
            bash scripts/update-models.sh
            ;;
        2)
            echo ""
            bash scripts/update-models.sh --repos-only
            ;;
        3)
            echo ""
            bash scripts/update-models.sh --weights-only
            ;;
        4)
            echo ""
            echo "Available models: hunyuan3d-2.1, hunyuan3d-2, trellis, triposr"
            read -rp "Model name: " model_name
            echo ""
            bash scripts/update-models.sh --model="$model_name"
            ;;
        b|B) return ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_health_check() {
    _header
    echo -e "${CYAN}Health Check${NC}"
    echo ""

    # Quick Docker service health
    echo -e "${BOLD}--- Docker Services ---${NC}"
    $COMPOSE_CMD ps --format 'table {{.Name}}\t{{.Status}}' 2>/dev/null || true
    echo ""

    # Backend API health
    echo -e "${BOLD}--- Backend API ---${NC}"
    if curl -sf http://localhost:8000/api/v1/health >/dev/null 2>&1; then
        HEALTH=$(curl -s http://localhost:8000/api/v1/health 2>/dev/null)
        echo -e "  ${GREEN}OK${NC}  API reachable at http://localhost:8000"
        echo "  Response: $HEALTH"
    else
        echo -e "  ${RED}FAIL${NC} API not reachable at http://localhost:8000"
    fi
    echo ""

    # Runtime verification via API
    echo -e "${BOLD}--- Runtime Verification (via API) ---${NC}"
    VERIFY=$(curl -sf -X POST http://localhost:8000/api/v1/runtime/verify 2>/dev/null || echo '{"error":"unavailable"}')
    echo "  $VERIFY"
    echo ""

    # GPU check
    echo -e "${BOLD}--- GPU ---${NC}"
    if command -v nvidia-smi >/dev/null 2>&1; then
        nvidia-smi --query-gpu=name,driver_version,memory.total,memory.free \
            --format=csv,noheader 2>/dev/null | while IFS=',' read -r name driver total free; do
            echo -e "  ${GREEN}GPU${NC}: $name | Driver: $driver | VRAM: $free / $total"
        done
    else
        echo -e "  ${YELLOW}WARN${NC} nvidia-smi not found"
    fi
    echo ""

    read -rp "Press Enter to continue..."
}

cmd_verify_runtime() {
    _header
    echo -e "${CYAN}Verify Runtime${NC}"
    echo ""
    bash scripts/verify-runtime.sh
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_build_image() {
    _header
    echo -e "${CYAN}Build Runtime Image${NC}"
    echo ""
    echo "Choose a build mode:"
    echo "  1) Normal build (cached) — fast, uses Docker layer cache"
    echo "  2) Clean build (--no-cache) — slow, rebuilds from scratch"
    echo "  b) Back"
    echo ""
    read -rp "Choice: " choice
    case "$choice" in
        1)
            echo ""
            if [ -f scripts/build-runtime-image.sh ]; then
                bash scripts/build-runtime-image.sh
            else
                echo -e "${CYAN}Building Docker images (cached)...${NC}"
                $COMPOSE_CMD build
                echo -e "${GREEN}Build complete.${NC}"
            fi
            ;;
        2)
            echo ""
            if [ -f scripts/build-runtime-image.sh ]; then
                bash scripts/build-runtime-image.sh --no-cache
            else
                echo -e "${CYAN}Building Docker images (no-cache)...${NC}"
                $COMPOSE_CMD build --no-cache
                echo -e "${GREEN}Build complete.${NC}"
            fi
            ;;
        b|B) return ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_logs() {
    _header
    echo -e "${CYAN}View Logs${NC}"
    echo ""
    echo "Choose a service:"
    echo "  1) api"
    echo "  2) worker"
    echo "  3) frontend"
    echo "  4) postgres"
    echo "  5) redis"
    echo "  6) All services"
    echo "  b) Back"
    echo ""
    read -rp "Choice: " choice
    case "$choice" in
        1) $COMPOSE_CMD logs --tail=100 -f api ;;
        2) $COMPOSE_CMD logs --tail=100 -f worker ;;
        3) $COMPOSE_CMD logs --tail=100 -f frontend ;;
        4) $COMPOSE_CMD logs --tail=100 -f postgres ;;
        5) $COMPOSE_CMD logs --tail=100 -f redis ;;
        6) $COMPOSE_CMD logs --tail=100 -f ;;
        b|B) return ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
}

cmd_migrations() {
    _header
    echo -e "${CYAN}Run Database Migrations${NC}"
    echo ""
    $COMPOSE_CMD run --rm migrate alembic upgrade head
    echo -e "${GREEN}Migrations complete.${NC}"
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_setup() {
    _header
    echo -e "${CYAN}First-Time Setup${NC}"
    echo ""
    if [ -f scripts/setup.sh ]; then
        bash scripts/setup.sh
    else
        echo -e "${YELLOW}setup.sh not found — running start.sh${NC}"
        bash scripts/start.sh
    fi
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_status() {
    _header
    echo -e "${CYAN}System Status${NC}"
    echo ""
    if [ -f scripts/status.sh ]; then
        bash scripts/status.sh
    else
        echo -e "${RED}scripts/status.sh not found${NC}"
    fi
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_rebuild() {
    _header
    echo -e "${CYAN}Rebuild Services${NC}"
    echo ""
    echo "Choose a build mode:"
    echo "  1) Cached rebuild (fast, preserves Docker layer cache)"
    echo "  2) Clean rebuild (--clean, rebuilds from scratch)"
    echo "  b) Back"
    echo ""
    read -rp "Build mode: " build_mode

    local clean_flag=""
    case "$build_mode" in
        1) clean_flag="" ;;
        2) clean_flag="--clean" ;;
        b|B) return ;;
        *) echo -e "${RED}Invalid choice${NC}"; echo ""; read -rp "Press Enter to continue..."; return ;;
    esac

    echo ""
    echo "Choose services to rebuild:"
    echo "  1) Default services (api, worker, migrate)"
    echo "  2) API"
    echo "  3) Worker"
    echo "  4) Frontend"
    echo "  5) Migrate"
    echo "  6) Custom services"
    echo "  b) Back"
    echo ""
    read -rp "Choice: " choice

    case "$choice" in
        1)
            bash scripts/rebuild.sh $clean_flag
            ;;
        2)
            bash scripts/rebuild.sh $clean_flag api
            ;;
        3)
            bash scripts/rebuild.sh $clean_flag worker
            ;;
        4)
            bash scripts/rebuild.sh $clean_flag frontend
            ;;
        5)
            bash scripts/rebuild.sh $clean_flag migrate
            ;;
        6)
            read -rp "Enter service names (space separated): " services
            bash scripts/rebuild.sh $clean_flag $services
            ;;
        b|B)
            return
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            ;;
    esac

    echo ""
    read -rp "Press Enter to continue..."
}

cmd_docker_cleanup() {
    _header
    echo -e "${RED}${BOLD}Full Docker Cleanup${NC}"
    echo ""

    # Safety: check Docker is actually running
    if ! docker info >/dev/null 2>&1; then
        echo -e "${YELLOW}Docker is not running. Cannot perform cleanup.${NC}"
        echo ""
        read -rp "Press Enter to continue..."
        return
    fi

    echo "This will remove EVERYTHING related to Docker:"
    echo "  • All containers"
    echo "  • All images"
    echo "  • All volumes"
    echo "  • All networks (unused)"
    echo "  • All build cache"
    echo "  • All unused Docker resources"
    echo ""
    echo -e "${YELLOW}⚠ WARNING: This operation cannot be undone!${NC}"
    echo ""

    read -rp "Are you sure? [y/N]: " confirm

    case "$confirm" in
        y|Y|yes|YES|Yes)
            ;;
        n|N|no|NO|No|"")
            echo -e "${GREEN}Cleanup cancelled.${NC}"
            read -rp "Press Enter to continue..."
            return
            ;;
        *)
            echo -e "${RED}Invalid choice. Cleanup cancelled.${NC}"
            read -rp "Press Enter to continue..."
            return
            ;;
    esac

    echo ""
    echo -e "${CYAN}Performing full Docker cleanup...${NC}"

    docker compose down --volumes --remove-orphans 2>/dev/null || true

    # Stop all remaining containers (properly quoted with empty check)
    local containers
    containers="$(docker ps -aq 2>/dev/null)"
    if [ -n "$containers" ]; then
        docker rm -f $containers 2>/dev/null || true
    fi

    # Remove all images (properly quoted with empty check)
    local images
    images="$(docker images -aq 2>/dev/null)"
    if [ -n "$images" ]; then
        docker rmi -f $images 2>/dev/null || true
    fi

    # Remove all volumes (properly quoted with empty check)
    local volumes
    volumes="$(docker volume ls -q 2>/dev/null)"
    if [ -n "$volumes" ]; then
        docker volume rm $volumes 2>/dev/null || true
    fi

    docker network prune -f
    docker builder prune -af
    docker system prune -af --volumes

    echo ""
    echo -e "${GREEN}✅ Docker has been completely cleaned.${NC}"
    echo ""

    read -rp "Press Enter to continue..."
}

cmd_reset() {
    _header
    echo -e "${RED}${BOLD}Reset AI 3D Studio${NC}"
    echo ""
    echo "Choose a reset mode:"
    echo "  1) Full reset (removes everything)"
    echo "  2) Reset but keep models (preserves backend/third_party/)"
    echo "  3) Reset but keep storage (preserves backend/storage/)"
    echo "  b) Back"
    echo ""
    read -rp "Choice: " choice
    case "$choice" in
        1)
            echo ""
            bash scripts/reset.sh
            ;;
        2)
            echo ""
            bash scripts/reset.sh --keep-models
            ;;
        3)
            echo ""
            bash scripts/reset.sh --keep-storage
            ;;
        b|B) return ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_docker_images() {
    bash scripts/docker-images.sh
}

cmd_backup() {
    _header
    echo -e "${CYAN}Backup Runtime${NC}"
    echo ""
    if [ ! -f scripts/backup-runtime.sh ]; then
        echo -e "${RED}scripts/backup-runtime.sh not found.${NC}"
        echo ""
        read -rp "Press Enter to continue..."
        return
    fi
    echo "Choose a backup mode:"
    echo "  1) Full backup (models + storage + config)"
    echo "  2) Storage only (uploads, exports, thumbnails)"
    echo "  3) Models only (weights and repos)"
    echo "  b) Back"
    echo ""
    read -rp "Choice: " choice
    case "$choice" in
        1)
            echo ""
            bash scripts/backup-runtime.sh
            ;;
        2)
            echo ""
            bash scripts/backup-runtime.sh --storage-only
            ;;
        3)
            echo ""
            bash scripts/backup-runtime.sh --models-only
            ;;
        b|B) return ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_restore() {
    _header
    echo -e "${CYAN}Restore Runtime${NC}"
    echo ""
    if [ ! -f scripts/restore-runtime.sh ]; then
        echo -e "${RED}scripts/restore-runtime.sh not found.${NC}"
        echo ""
        read -rp "Press Enter to continue..."
        return
    fi
    echo "Available backups:"
    if [ -d "backups" ]; then
        ls -lht backups/*.tar.gz 2>/dev/null || echo "  (no backups found)"
    else
        echo "  (backups/ directory does not exist)"
    fi
    echo ""
    read -rp "Enter path to backup archive (or 'b' to go back): " archive_path
    case "$archive_path" in
        b|B) return ;;
        "")
            echo -e "${RED}No path provided.${NC}"
            ;;
        *)
            echo ""
            bash scripts/restore-runtime.sh "$archive_path"
            ;;
    esac
    echo ""
    read -rp "Press Enter to continue..."
}

# ── Main Menu ──────────────────────────────────────────────────────────────
main_menu() {
    while true; do
        _header
        _status
        echo -e "${BOLD}Actions:${NC}"
        echo "  1)  Start all services"
        echo "  2)  Stop all services"
        echo "  3)  Restart all services"
        echo "  4)  Update Models"
        echo "  5)  Health Check"
        echo "  6)  Verify Runtime"
        echo "  7)  Build Runtime Image"
        echo "  8)  View Logs"
        echo "  9)  Run Migrations"
        echo "  10) Cloudflare"
        echo "  11) System Status"
        echo "  12) Rebuild Services"
        echo "  13) Docker Cleanup"
        echo "  14) Docker Image Library"
        echo "  15) Full Reset"
        echo "  16) Backup Runtime"
        echo "  17) Restore Runtime"
        echo "  0)  First-Time Setup"
        echo "  q)  Quit"
        echo ""
        read -rp "Choice: " choice
        case "$choice" in
            1)  cmd_start ;;
            2)  cmd_stop ;;
            3)  cmd_restart ;;
            4)  cmd_update_models ;;
            5)  cmd_health_check ;;
            6)  cmd_verify_runtime ;;
            7)  cmd_build_image ;;
            8)  cmd_logs ;;
            9)  cmd_migrations ;;
            10) cmd_cloudflare ;;
            11) cmd_status ;;
            12) cmd_rebuild ;;
            13) cmd_docker_cleanup ;;
            14) cmd_docker_images ;;
            15) cmd_reset ;;
            16) cmd_backup ;;
            17) cmd_restore ;;
            0)  cmd_setup ;;
            q|Q) echo ""; echo -e "${GREEN}Goodbye!${NC}"; echo ""; exit 0 ;;
            *) echo -e "${RED}Invalid choice. Please try again.${NC}"; sleep 1 ;;
        esac
    done
}

main_menu
