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
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Logging helpers ──────────────────────────────────────────────────────────
info()  { echo -e "${CYAN}[INFO]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}   $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
error() { echo -e "${RED}[ERROR]${NC}  $*"; }

# ── Header helper ───────────────────────────────────────────────────────────
head_() {
    echo -e "\n${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${BOLD}${MAGENTA}➜ $*${NC}"
}

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

    # PostgreSQL — check via pg_isready (works without systemctl)
    if command -v pg_isready &>/dev/null; then
        pg_isready -q 2>/dev/null \
            && echo -e "${GREEN}●${NC} PostgreSQL" \
            || echo -e "${RED}●${NC} PostgreSQL"
    elif systemctl is-active --quiet postgresql 2>/dev/null; then
        echo -e "${GREEN}●${NC} PostgreSQL"
    else
        echo -e "${RED}●${NC} PostgreSQL"
    fi

    # Redis — check via redis-cli ping (works without systemctl)
    if command -v redis-cli &>/dev/null; then
        redis-cli ping 2>/dev/null | grep -q PONG \
            && echo -e "${GREEN}●${NC} Redis" \
            || echo -e "${RED}●${NC} Redis"
    elif systemctl is-active --quiet redis-server 2>/dev/null; then
        echo -e "${GREEN}●${NC} Redis"
    else
        echo -e "${RED}●${NC} Redis"
    fi
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
                # shellcheck disable=SC1091
                set -a; source .env 2>/dev/null || true; set +a
                _DB_PASS="${POSTGRES_PASSWORD:-postgres}"
                if [[ -n "${DATABASE_URL:-}" ]]; then
                    _DB_PASS="$(echo "$DATABASE_URL" | sed -n 's|^postgresql[+]*://[^:]*:\([^@]*\)@.*$|\1|p')"
                    [[ -z "$_DB_PASS" ]] && _DB_PASS="postgres"
                fi
                PGPASSWORD="$_DB_PASS" psql -h localhost -U postgres -c "DROP DATABASE IF EXISTS ai_studio;"
                PGPASSWORD="$_DB_PASS" psql -h localhost -U postgres -c "CREATE DATABASE ai_studio;"
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

cmd_clean() {
    banner
    echo -e "${CYAN}Clean Environments & Dependencies${NC}"
    echo ""
    echo "This will remove:"
    echo -e "  ${RED}•${NC} All per-model venvs (backend/third_party/*/.venv)"
    echo -e "  ${RED}•${NC} All cloned model repos (backend/third_party/*)"
    echo -e "  ${RED}•${NC} Backend venv (backend/.venv)"
    echo -e "  ${RED}•${NC} Frontend node_modules"
    echo -e "  ${RED}•${NC} Frontend build (.next)"
    echo -e "  ${RED}•${NC} Runtime cache (.runtime_cache)"
    echo -e "  ${RED}•${NC} PID files (.pids)"
    echo ""
    echo -e "  ${GREEN}•${NC} Preserves: .env, logs/, storage/, manager.sh"
    echo ""
    echo -e "${YELLOW}WARNING: This cannot be undone. You will need to re-run setup.${NC}"
    echo ""
    read -rp "Type 'CLEAN' to confirm: " confirm
    case "$confirm" in
        CLEAN)
            echo ""
            echo -e "${BOLD}Cleaning...${NC}"
            echo ""

            # Stop services first
            echo -e "  ${CYAN}Stopping services...${NC}"
            bash scripts/stop.sh 2>/dev/null || true

            # Remove per-model venvs
            echo -e "  ${CYAN}Removing per-model venvs...${NC}"
            if [[ -d backend/third_party ]]; then
                find backend/third_party -maxdepth 2 -type d -name ".venv" -exec rm -rf {} + 2>/dev/null || true
                echo -e "    ${GREEN}✔${NC} Per-model venvs removed"
            fi

            # Remove cloned model repos
            echo -e "  ${CYAN}Removing model repositories...${NC}"
            if [[ -d backend/third_party ]]; then
                find backend/third_party -maxdepth 1 -mindepth 1 -type d ! -name '.hf_cache' -exec rm -rf {} + 2>/dev/null || true
                echo -e "    ${GREEN}✔${NC} Model repositories removed"
            fi

            # Remove backend venv
            echo -e "  ${CYAN}Removing backend venv...${NC}"
            rm -rf backend/.venv 2>/dev/null || true
            echo -e "    ${GREEN}✔${NC} Backend venv removed"

            # Remove frontend deps & build
            echo -e "  ${CYAN}Removing frontend dependencies...${NC}"
            rm -rf node_modules .next 2>/dev/null || true
            echo -e "    ${GREEN}✔${NC} node_modules & .next removed"

            # Remove runtime cache
            echo -e "  ${CYAN}Removing runtime cache...${NC}"
            rm -rf backend/.runtime_cache 2>/dev/null || true
            echo -e "    ${GREEN}✔${NC} Runtime cache removed"

            # Remove PID files
            echo -e "  ${CYAN}Removing PID files...${NC}"
            rm -rf .pids 2>/dev/null || true
            echo -e "    ${GREEN}✔${NC} PID files removed"

            # Remove install locks
            echo -e "  ${CYAN}Removing install locks...${NC}"
            find backend/third_party -name ".installing.lock" -delete 2>/dev/null || true
            echo -e "    ${GREEN}✔${NC} Install locks removed"

            echo ""
            echo -e "  ${GREEN}${BOLD}✔ Clean complete!${NC}"
            echo ""
            echo -e "  Run ${BOLD}1) First-Time Setup${NC} to rebuild from scratch."
            echo ""
            ;;
        *)
            echo "Cancelled"
            ;;
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
        3) _service_submenu "frontend" "Frontend" "next" "NEXT_PUBLIC_API_URL=http://localhost:8000 npm start > logs/frontend.log 2>&1 &" "$PID_DIR/frontend.pid" ;;
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

cmd_colab() {
    # All Colab logic lives in scripts/colab.sh
    # This is just a thin wrapper that launches the interactive menu
    bash scripts/colab.sh --interactive
}

cmd_cf() {
    banner
    bash scripts/cloudflare.sh
    echo ""
    read -rp "Press Enter to continue..."
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
        1)
            if [[ -f scripts/update-models.sh ]]; then
                bash scripts/update-models.sh
            else
                echo -e "${RED}scripts/update-models.sh not found${NC}"
            fi
            ;;
        2)
            if [[ -f scripts/update-models.sh ]]; then
                bash scripts/update-models.sh --repos-only
            else
                echo -e "${RED}scripts/update-models.sh not found${NC}"
            fi
            ;;
        3)
            if [[ -f scripts/update-models.sh ]]; then
                bash scripts/update-models.sh --weights-only
            else
                echo -e "${RED}scripts/update-models.sh not found${NC}"
            fi
            ;;
        4)
            if [[ -f scripts/update-models.sh ]]; then
                bash scripts/update-models.sh --verify
            else
                echo -e "${RED}scripts/update-models.sh not found${NC}"
            fi
            ;;
        b|B) return ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
    echo ""
    read -rp "Press Enter to continue..."
}

_banner_line() {
  # Prints a box line with proper padding: _banner_line "content" "padding_char"
  local content="$1"
  local pad_char="${2:- }"
  local box_width=58
  local visible_len=${#content}
  local padding=$((box_width - visible_len))
  if ((padding < 1)); then padding=1; fi
  printf "  ║%s%*s║\n" "$content" "$padding" "" | sed "s/ /${pad_char}/g"
}

banner() {
  echo -e "${CYAN}${BOLD}"
  echo -e "  ╔════════════════════════════════════════════════════════════╗"
  echo -e "  ║                                                            ║"
  echo -e "  ║           \033[1;37mAI 3D Studio v3.2\033[1;36m                              ║"
  echo -e "  ║        \033[2m══════════════════════════════════\033[1;36m                   ║"
  echo -e "  ║   \033[0;90mProfessional AI-Powered 3D Generation\033[1;36m                    ║"
  echo -e "  ║                                                            ║"
  echo -e "  ╚════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# ── Progress bar & spinner ─────────────────────────────────────────────────

_progress_bar() {
    local current=$1
    local total=$2
    local width=40
    local percentage=$((current * 100 / total))
    local filled=$((width * current / total))
    local empty=$((width - filled))
    printf "\r  [${GREEN}"
    printf '%*s' "$filled" '' | tr ' ' '█'
    printf "${NC}"
    printf '%*s' "$empty" '' | tr ' ' '░'
    printf "] ${BOLD}%3d%%${NC}" "$percentage"
}

_spinner() {
    local pid=$1
    local msg="${2:─Waiting}"
    local delay=0.1
    local spinstr='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    while kill -0 "$pid" 2>/dev/null; do
        local temp=${spinstr#?}
        printf "\r  ${CYAN}%s${NC}  %s" "${spinstr:0:1}" "$msg"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
    done
    printf "\r  ${GREEN}✔${NC}  %s\n" "$msg"
}

_run_with_progress() {
    local msg=$1
    shift
    echo -e "  ${BOLD}${msg}${NC}"
    "$@" 2>&1 | while IFS= read -r line; do
        echo "    ${line}"
    done
}
_menu_item() {
  # _menu_line "key" "description" — prints a padded menu line with colored key
  local key="$1"
  local desc="$2"
  local box_width=56
  local key_part
  if [[ "$key" == *"["*"]"* ]]; then
    key_part=$(echo -e "${CYAN}${key}${NC}")
  else
    key_part=$(echo -e "${RED}${key}${NC}")
  fi
  local line="  ${key_part}  ${desc}"
  local visible_stripped
  visible_stripped=$(echo -e "$line" | sed 's/\x1b\[[0-9;]*m//g')
  local pad=$((box_width - ${#visible_stripped}))
  if ((pad < 1)); then pad=1; fi
  printf "  ║%s%*s║\n" "$line" "$pad" ""
}

_menu_separator() {
  echo -e "${BOLD}${MAGENTA}  ╠════════════════════════════════════════════════════════╣${NC}"
}

_menu_top() {
  echo -e "${BOLD}${MAGENTA}  ╔════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${MAGENTA}  ║${NC}                  ${BOLD}${WHITE}Main Menu${NC}                         ${MAGENTA}║${NC}"
  _menu_separator
}

_menu_bottom() {
  echo -e "${BOLD}${MAGENTA}  ╚════════════════════════════════════════════════════════╝${NC}"
}

cmd_build_wheels() {
    head_ "Building Native CUDA Wheels"
    echo ""
    echo "  This will build CUDA extension wheels for packages that don't have"
    echo "  prebuilt wheels (diffoctreerast, vox2seq, diff-gaussian-rasterization, diso)."
    echo ""
    echo "  Requirements: CUDA toolkit (nvcc), ninja, PyTorch with CUDA"
    echo "  Output: ./wheels/ directory"
    echo ""

    # ── Auto-setup: install missing prerequisites ──────────────────────────────
    info "Checking build prerequisites..."

    # Check/install CUDA toolkit
    if ! command -v nvcc &>/dev/null; then
        warn "nvcc not found — attempting to install CUDA toolkit..."
        if command -v apt-get &>/dev/null; then
            sudo apt-get update -qq && sudo apt-get install -y -qq nvidia-cuda-toolkit 2>/dev/null || {
                warn "Failed to install CUDA toolkit automatically"
                echo "  Install manually: sudo apt-get install -y nvidia-cuda-toolkit"
                echo "  Or download from: https://developer.nvidia.com/cuda-downloads"
                return 1
            }
        else
            warn "apt-get not found — cannot auto-install CUDA toolkit"
            echo "  Install CUDA toolkit manually: https://developer.nvidia.com/cuda-downloads"
            return 1
        fi
    fi
    ok "CUDA toolkit: $(nvcc --version | grep release | sed 's/.*release //;s/,.*//')"

    # Check/install ninja
    if ! command -v ninja &>/dev/null; then
        warn "ninja not found — installing..."
        pip install ninja 2>/dev/null || { warn "Failed to install ninja"; return 1; }
    fi
    ok "ninja: $(ninja --version)"

    # Check PyTorch CUDA
    if python3 -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
        ok "PyTorch CUDA: $(python3 -c 'import torch; print(torch.__version__, \"CUDA\", torch.version.cuda)')"
    else
        warn "PyTorch CUDA not available — builds may fail"
        echo "  Install PyTorch with CUDA: pip install torch --index-url https://download.pytorch.org/whl/cu124"
    fi

    echo ""

    # Create output directory
    mkdir -p wheels

    # Run the build script
    info "Starting native wheel builds..."
    python scripts/build_native_wheels.py --output-dir ./wheels

    echo ""
    if [ "$(ls -A wheels/*.whl 2>/dev/null)" ]; then
        ok "Wheels built successfully!"
        echo ""
        ls -lh wheels/*.whl | awk '{print "  " $9 " (" $5 ")"}'
        echo ""
        read -rp "  Upload to GitHub Releases? [y/N]: " upload
        if [[ "$upload" =~ ^[Yy]$ ]]; then
            info "Uploading to GitHub Releases..."
            python scripts/build_native_wheels.py --output-dir ./wheels --upload
        else
            info "Upload skipped. Run manually with: python scripts/build_native_wheels.py --output-dir ./wheels --upload"
        fi
    else
        warn "No wheels were built — check errors above"
    fi
}

_main_menu_() {
    while true; do
        banner
        _status
        _menu_top
        _menu_item "[1]" "First-Time Setup"
        _menu_item "[2]" "Start all services"
        _menu_item "[3]" "Stop all services"
        _menu_item "[4]" "Restart all services"
        _menu_item "[5]" "Service status"
        _menu_item "[6]" "View logs"
        _menu_item "[7]" "Health check"
        _menu_item "[8]" "Database management"
        _menu_item "[9]" "View environment"
        _menu_item "[10]" "Reset PID files"
        _menu_item "[11]" "Clean old logs"
        _menu_item "[12]" "Cloudflare"
        _menu_item "[13]" "Update / install models"
        _menu_item "[14]" "Google Colab launcher"
        _menu_item "[15]" "Clean environments"
        _menu_item "[16]" "Manage individual service"
        _menu_item "[17]" "Build native CUDA wheels"
        _menu_separator
        _menu_item "[q]" "Quit"
        _menu_bottom
        echo ""
        echo -e "  ${GRAY}Quick keys: 1-16  ${DIM}│${NC}  ${GRAY}q to quit${NC}"
        echo ""
        read -rp "  Choice: " choice
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
            14) cmd_colab ;;
            15) cmd_clean ;;
            16) cmd_service ;;
            17) cmd_build_wheels ;;
            q|Q) echo ""; echo -e "${GREEN}  ╔════════════════════════════════════════════════════════╗${NC}"; echo -e "${GREEN}  ║${NC}              ${BOLD}Goodbye! 👋${NC}                            ${GREEN}║${NC}"; echo -e "${GREEN}  ╚════════════════════════════════════════════════════════╝${NC}"; echo ""; exit 0 ;;
            *) echo -e "${RED}Invalid choice${NC}"; sleep 1 ;;
        esac
    done
}

_main_menu_