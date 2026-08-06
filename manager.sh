#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# AI 3D Studio v3.2 — Service Manager (Non-Docker)
# Interactive management console for native services
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail
cd "$(dirname "$0")"

# ── Colors ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ── PID directory ─────────────────────────────────────────────────────────
PID_DIR=".pids"
mkdir -p "$PID_DIR"

# ── Service status check ──────────────────────────────────────────────────
_check_service() {
    local name=$1
    local pid_file=$2
    
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            echo -e "${GREEN}●${NC} $name (PID: $pid)"
            return 0
        else
            echo -e "${RED}●${NC} $name (dead PID file)"
            rm -f "$pid_file"
            return 1
        fi
    else
        echo -e "${RED}●${NC} $name (not running)"
        return 1
    fi
}

# ── Status function ──────────────────────────────────────────────────────
_status() {
    echo -e "${CYAN}Service Status:${NC}"

    [[ -f "$PID_DIR/api.pid" ]] && kill -0 "$(cat "$PID_DIR/api.pid")" 2>/dev/null \
        && echo -e "${GREEN}●${NC} Backend API" \
        || echo -e "${RED}●${NC} Backend API"

    [[ -f "$PID_DIR/worker.pid" ]] && kill -0 "$(cat "$PID_DIR/worker.pid")" 2>/dev/null \
        && echo -e "${GREEN}●${NC} Celery Worker" \
        || echo -e "${RED}●${NC} Celery Worker"

    [[ -f "$PID_DIR/frontend.pid" ]] && kill -0 "$(cat "$PID_DIR/frontend.pid")" 2>/dev/null \
        && echo -e "${GREEN}●${NC} Frontend" \
        || echo -e "${RED}●${NC} Frontend"

    systemctl is-active --quiet postgresql 2>/dev/null \
        && echo -e "${GREEN}●${NC} PostgreSQL" \
        || echo -e "${RED}●${NC} PostgreSQL"

    systemctl is-active --quiet redis-server 2>/dev/null \
        && echo -e "${GREEN}●${NC} Redis" \
        || echo -e "${RED}●${NC} Redis"
    echo
}


# ── Command functions ─────────────────────────────────────────────────────

cmd_start() {
    banner
    bash scripts/start.sh
}

cmd_stop() {
    banner
    echo -e "${CYAN}Stopping all services...${NC}"
    echo ""
    bash scripts/stop.sh
}

cmd_restart() {
    banner
    echo -e "${CYAN}Restarting all services...${NC}"
    echo ""
    bash scripts/restart.sh
}

cmd_status() {
    _status
    read -rp "Press Enter to continue..."
}

cmd_logs() {
    banner
    echo -e "${CYAN}View Logs${NC}"
    echo ""
    echo "Choose a service:"
    echo "  1) API (backend)"
    echo "  2) Worker (Celery)"
    echo "  3) Frontend"
    echo "  4) All logs (follow)"
    echo "  b) Back"
    echo ""
    read -rp "Choice: " choice
    echo ""
    case "$choice" in
        1)
            if [[ -f logs/api.log ]]; then
                tail -f logs/api.log
            else
                echo -e "${YELLOW}API log not found${NC}"
            fi
            ;;
        2)
            if [[ -f logs/worker.log ]]; then
                tail -f logs/worker.log
            else
                echo -e "${YELLOW}Worker log not found${NC}"
            fi
            ;;
        3)
            if [[ -f logs/frontend.log ]]; then
                tail -f logs/frontend.log
            else
                echo -e "${YELLOW}Frontend log not found${NC}"
            fi
            ;;
        4)
            tail -f logs/*.log 2>/dev/null || echo "No logs found"
            ;;
        b|B) return ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
}

cmd_health_check() {
    banner
    echo -e "${CYAN}Health Check${NC}"
    echo ""
    
    echo -e "${BOLD}--- PostgreSQL ---${NC}"
    if pg_isready -h localhost -U postgres &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} PostgreSQL running"
    else
        echo -e "  ${RED}✗${NC} PostgreSQL not responding"
    fi
    
    echo -e "${BOLD}--- Redis ---${NC}"
    if redis-cli ping &>/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Redis running"
    else
        echo -e "  ${RED}✗${NC} Redis not responding"
    fi
    
    echo -e "${BOLD}--- Backend API ---${NC}"
    if curl -sf http://localhost:8000/api/v1/health &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} API reachable"
        HEALTH=$(curl -s http://localhost:8000/api/v1/health 2>/dev/null || echo "{}")
        echo "  Response: $HEALTH"
    else
        echo -e "  ${RED}✗${NC} API not responding"
    fi
    
    echo -e "${BOLD}--- Frontend ---${NC}"
    if curl -sf http://localhost:3000 &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Frontend reachable"
    else
        echo -e "  ${RED}✗${NC} Frontend not responding"
    fi
    
    echo -e "${BOLD}--- GPU ---${NC}"
    if command -v nvidia-smi >/dev/null 2>&1; then
        nvidia-smi --query-gpu=name,driver_version,memory.total,memory.free \
            --format=csv,noheader 2>/dev/null | while IFS=',' read -r name driver total free; do
            echo -e "  ${GREEN}✓${NC} GPU: $name | Driver: $driver | VRAM: $free / $total"
        done
    else
        echo -e "  ${YELLOW}⚠${NC} nvidia-smi not available"
    fi
    
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_reset_pids() {
    banner
    echo -e "${YELLOW}Reset PID Files${NC}"
    echo ""
    echo "This will clear all stale PID files without stopping services."
    read -rp "Continue? [y/N] " confirm
    case "$confirm" in
        y|Y)
            rm -f "$PID_DIR"/*.pid
            echo -e "${GREEN}PID files cleared${NC}"
            ;;
        *) echo "Cancelled" ;;
    esac
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_database() {
    banner
    echo -e "${CYAN}Database Management${NC}"
    echo ""
    echo "Choose an option:"
    echo "  1) Run migrations"
    echo "  2) Reset database"
    echo "  b) Back"
    echo ""
    read -rp "Choice: " choice
    echo ""
    case "$choice" in
        1)
            echo "Running migrations..."
            cd backend
            backend/.venv/bin/python -m alembic upgrade head
            cd ..
            echo -e "${GREEN}Migrations complete${NC}"
            ;;
        2)
            echo -e "${RED}WARNING: This will delete all data!${NC}"
            read -rp "Type 'reset' to confirm: " confirm
            if [[ "$confirm" == "reset" ]]; then
                echo "Dropping and recreating database..."
                PGPASSWORD=postgres psql -h localhost -U postgres -c "DROP DATABASE IF EXISTS ai3dstudio;"
                PGPASSWORD=postgres psql -h localhost -U postgres -c "CREATE DATABASE ai3dstudio;"
                echo "Running migrations..."
                cd backend
                backend/.venv/bin/python -m alembic upgrade head
                cd ..
                echo -e "${GREEN}Database reset complete${NC}"
            else
                echo "Cancelled"
            fi
            ;;
        b|B) return ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_environment() {
    banner
    echo -e "${CYAN}View Environment${NC}"
    echo ""
    if [[ -f .env ]]; then
        cat .env | grep -v "^#" | grep -v "^$"
    else
        echo -e "${YELLOW}No .env file found${NC}"
    fi
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_setup() {
    banner
    echo -e "${CYAN}First-Time Setup${NC}"
    echo ""
    echo "  1) Full setup (system deps + venv + start)"
    echo "  2) Bootstrap only (detect env + configure)"
    echo "  b) Back"
    echo ""
    read -rp "Choice: " choice
    echo ""
    case "$choice" in
        1)
            if [ -f scripts/setup.sh ]; then
                bash scripts/setup.sh --auto-start
            else
                echo -e "${YELLOW}setup.sh not found — running bootstrap.sh${NC}"
                bash scripts/bootstrap.sh
            fi
            ;;
        2)
            if [ -f scripts/bootstrap.sh ]; then
                bash scripts/bootstrap.sh --skip-start
            else
                echo -e "${YELLOW}bootstrap.sh not found — running setup.sh${NC}"
                bash scripts/setup.sh
            fi
            ;;
        b|B) return ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_clean_logs() {
    banner
    echo -e "${CYAN}Clean Old Logs${NC}"
    echo ""
    echo "This will remove log files older than 7 days."
    read -rp "Continue? [y/N] " confirm
    case "$confirm" in
        y|Y)
            find logs -name "*.log" -mtime +7 -delete 2>/dev/null || true
            echo -e "${GREEN}Old logs cleaned${NC}"
            ;;
        *) echo "Cancelled" ;;
    esac
    echo ""
    read -rp "Press Enter to continue..."
}

cmd_cf() {
    echo ""
    bash scripts/cloudflare.sh
}

banner() {
  echo -e "${RED}${BOLD}"
  cat << 'BANNER'

 ██████╗██╗    ██████╗ ██████╗      ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
██╔══██╗██║    ╚════██╗██╔══██╗     ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
███████║██║     █████╔╝██║  ██║     ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
██╔══██║██║    ╚═══██╗ ██║  ██║     ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
██║  ██║██║   ██████╔╝ ██████╔╝     ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
╚═╝  ╚═╝╚═╝   ╚═════╝  ╚═════╝      ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝

BANNER
  echo -e "${NC}  ${BOLD}Automatic Installer v3.2.0${NC}\n"
}

# ── Main menu loop ────────────────────────────────────────────────────────
_main_menu_() {
    while true; do
        banner
        _status
        echo -e "${BOLD}Actions:${NC}"
        echo "  1) First-Time Setup"
        echo "  2)  Start all services"
        echo "  3)  Stop all services"
        echo "  4)  Restart all services"
        echo "  5)  Service status"
        echo "  6)  View logs"
        echo "  7)  Health check"
        echo "  8)  Database management"
        echo "  9)  View environment"
        echo "  10) Reset PID files"
        echo "  11) Clean old logs"
        echo "  12) Cloudflare"
        echo "  q)  Quit"
        echo ""
        read -rp "Choice: " choice
        case "$choice" in
            1)  cmd_setup ;;
            2)  cmd_start ;;
            3)  cmd_stop ;;
            4)  cmd_restart ;;
            5)  cmd_status ;;
            6)  cmd_logs ;;
            7)  cmd_health_check ;;
            8)  cmd_database ;;
            9)  cmd_environment ;;
            10) cmd_reset_pids ;;
            11) cmd_clean_logs ;;
            12) cmd_cf ;;
            q|Q) echo ""; echo -e "${GREEN}Goodbye!${NC}"; echo ""; exit 0 ;;
            *) echo -e "${RED}Invalid choice${NC}"; sleep 1 ;;
        esac
    done
}

_main_menu_