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

cmd_service() {
    banner
    echo -e "${CYAN}Individual Service Management${NC}"
    echo ""
    echo "Select a service to manage:"
    echo "  1) Backend API"
    echo "  2) Celery Worker"
    echo "  3) Frontend"
    echo "  4) PostgreSQL"
    echo "  5) Redis"
    echo "  b) Back to main menu"
    echo ""
    read -rp "Service choice: " svc_choice
    echo ""

    case "$svc_choice" in
        1) _service_submenu "api" "Backend API" "uvicorn app.main:app" "cd backend && source .venv/bin/activate && setsid python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info > ../logs/api.log 2>&1 &" "$PID_DIR/api.pid" ;;
        2) _service_submenu "worker" "Celery Worker" "celery -A app.workers.celery_app worker" "cd backend && source .venv/bin/activate && setsid python -m celery -A app.workers.celery_app worker --loglevel=info --concurrency=1 -B -Q generation,images > ../logs/worker.log 2>&1 &" "$PID_DIR/worker.pid" ;;
        3) _service_submenu "frontend" "Frontend" "next" "NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev > logs/frontend.log 2>&1 &" "$PID_DIR/frontend.pid" ;;
        4) _systemd_service_submenu "postgresql" "PostgreSQL" ;;
        5) _systemd_service_submenu "redis-server" "Redis" ;;
        b|B) return ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
    echo ""
    read -rp "Press Enter to continue..."
}

_service_submenu() {
    local svc_name=$1
    local svc_label=$2
    local svc_pattern=$3
    local svc_start_cmd=$4
    local svc_pid_file=$5

    while true; do
        banner
        echo -e "${CYAN}Manage: ${svc_label}${NC}"
        echo ""
        _check_service "$svc_label" "$svc_pid_file"
        echo ""
        echo "Actions:"
        echo "  1) Start"
        echo "  2) Stop"
        echo "  3) Restart"
        echo "  4) Status"
        echo "  5) View Logs (tail -f)"
        echo "  b) Back"
        echo ""
        read -rp "Action: " action
        echo ""

        case "$action" in
            1)  # Start
                if [[ -f "$svc_pid_file" ]] && kill -0 "$(cat "$svc_pid_file" 2>/dev/null)" 2>/dev/null; then
                    echo -e "${YELLOW}${svc_label} is already running (PID: $(cat "$svc_pid_file"))${NC}"
                else
                    echo -e "${CYAN}Starting ${svc_label}...${NC}"
                    eval "$svc_start_cmd"
                    local pid=$!
                    echo "$pid" > "$svc_pid_file"
                    sleep 2
                    if kill -0 "$pid" 2>/dev/null; then
                        echo -e "${GREEN}${svc_label} started (PID: $pid)${NC}"
                    else
                        echo -e "${RED}Failed to start ${svc_label}${NC}"
                        rm -f "$svc_pid_file"
                    fi
                fi
                ;;
            2)  # Stop
                if [[ -f "$svc_pid_file" ]]; then
                    local pid=$(cat "$svc_pid_file" 2>/dev/null || echo "")
                    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
                        echo -e "${CYAN}Stopping ${svc_label} (PID: $pid)...${NC}"
                        kill "$pid" 2>/dev/null
                        local count=0
                        while kill -0 "$pid" 2>/dev/null && [[ $count -lt 10 ]]; do
                            sleep 1
                            count=$((count + 1))
                        done
                        if kill -0 "$pid" 2>/dev/null; then
                            kill -KILL "$pid" 2>/dev/null
                            echo -e "${YELLOW}Force killed ${svc_label}${NC}"
                        else
                            echo -e "${GREEN}${svc_label} stopped gracefully${NC}"
                        fi
                    else
                        echo -e "${YELLOW}${svc_label} not running (stale PID file)${NC}"
                    fi
                    rm -f "$svc_pid_file"
                else
                    echo -e "${YELLOW}${svc_label} not running (no PID file)${NC}"
                fi
                ;;
            3)  # Restart
                # Stop first
                if [[ -f "$svc_pid_file" ]]; then
                    local pid=$(cat "$svc_pid_file" 2>/dev/null || echo "")
                    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
                        echo -e "${CYAN}Stopping ${svc_label} (PID: $pid)...${NC}"
                        kill "$pid" 2>/dev/null
                        local count=0
                        while kill -0 "$pid" 2>/dev/null && [[ $count -lt 10 ]]; do
                            sleep 1
                            count=$((count + 1))
                        done
                        if kill -0 "$pid" 2>/dev/null; then
                            kill -KILL "$pid" 2>/dev/null
                        fi
                    fi
                    rm -f "$svc_pid_file"
                fi
                sleep 1
                # Start
                echo -e "${CYAN}Starting ${svc_label}...${NC}"
                eval "$svc_start_cmd"
                local new_pid=$!
                echo "$new_pid" > "$svc_pid_file"
                sleep 2
                if kill -0 "$new_pid" 2>/dev/null; then
                    echo -e "${GREEN}${svc_label} restarted (PID: $new_pid)${NC}"
                else
                    echo -e "${RED}Failed to restart ${svc_label}${NC}"
                    rm -f "$svc_pid_file"
                fi
                ;;
            4)  # Status
                _check_service "$svc_label" "$svc_pid_file"
                ;;
            5)  # View Logs
                local log_file="logs/${svc_name}.log"
                if [[ -f "$log_file" ]]; then
                    echo -e "${CYAN}Tailing ${log_file} (Ctrl+C to exit)${NC}"
                    tail -f "$log_file"
                else
                    echo -e "${YELLOW}Log file not found: ${log_file}${NC}"
                fi
                ;;
            b|B) return ;;
            *) echo -e "${RED}Invalid action${NC}" ;;
        esac
        echo ""
        read -rp "Press Enter to continue..."
    done
}

_systemd_service_submenu() {
    local svc_name=$1
    local svc_label=$2

    while true; do
        banner
        echo -e "${CYAN}Manage: ${svc_label}${NC}"
        echo ""
        if systemctl is-active --quiet "$svc_name" 2>/dev/null; then
            echo -e "${GREEN}●${NC} ${svc_label} (running via systemd)"
        else
            echo -e "${RED}●${NC} ${svc_label} (stopped)"
        fi
        echo ""
        echo "Actions:"
        echo "  1) Start"
        echo "  2) Stop"
        echo "  3) Restart"
        echo "  4) Status"
        echo "  5) View Logs (journalctl -f)"
        echo "  b) Back"
        echo ""
        read -rp "Action: " action
        echo ""

        case "$action" in
            1)
                echo -e "${CYAN}Starting ${svc_label}...${NC}"
                sudo systemctl start "$svc_name" && echo -e "${GREEN}${svc_label} started${NC}" || echo -e "${RED}Failed to start ${svc_label}${NC}"
                ;;
            2)
                echo -e "${CYAN}Stopping ${svc_label}...${NC}"
                sudo systemctl stop "$svc_name" && echo -e "${GREEN}${svc_label} stopped${NC}" || echo -e "${RED}Failed to stop ${svc_label}${NC}"
                ;;
            3)
                echo -e "${CYAN}Restarting ${svc_label}...${NC}"
                sudo systemctl restart "$svc_name" && echo -e "${GREEN}${svc_label} restarted${NC}" || echo -e "${RED}Failed to restart ${svc_label}${NC}"
                ;;
            4)
                systemctl status "$svc_name" --no-pager || true
                ;;
            5)
                echo -e "${CYAN}Following journal for ${svc_label} (Ctrl+C to exit)${NC}"
                sudo journalctl -u "$svc_name" -f
                ;;
            b|B) return ;;
            *) echo -e "${RED}Invalid action${NC}" ;;
        esac
        echo ""
        read -rp "Press Enter to continue..."
    done
}

cmd_cf() {
    echo ""
    bash scripts/cloudflare.sh
}

cmd_update_models() {
    banner
    echo -e "${CYAN}Update / Install Models${NC}"
    echo ""
    echo "Options:"
    echo "  1) Full install (all models: repos + weights)"
    echo "  2) Repos only (clone/update)"
    echo "  3) Weights only (download)"
    echo "  4) Verify installation"
    echo "  b) Back"
    echo ""
    read -rp "Choice: " choice
    echo ""
    case "$choice" in
        1) bash scripts/update-models.sh ;;
        2) bash scripts/update-models.sh --repos-only ;;
        3) bash scripts/update-models.sh --weights-only ;;
        4) bash scripts/update-models.sh --verify ;;
        b|B) return ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
    echo ""
    read -rp "Press Enter to continue..."
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
        echo "  13) Update / install models"
        echo "  14) Manage individual service"
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
            13) cmd_update_models ;;
            14) cmd_service ;;
            q|Q) echo ""; echo -e "${GREEN}Goodbye!${NC}"; echo ""; exit 0 ;;
            *) echo -e "${RED}Invalid choice${NC}"; sleep 1 ;;
        esac
    done
}

_main_menu_