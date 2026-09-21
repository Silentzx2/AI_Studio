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
_on_sigint() {
    echo ""
    echo -e "\n${YELLOW}[!] Interrupted (Ctrl+C). Returning to menu...${NC}"
    sleep 0.3
}
trap '_on_sigint' INT

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

    [[ -f "$PID_DIR/frontend.pid" ]] && kill -0 "$(cat "$PID_DIR/frontend.pid")" 2>/dev/null \
        && echo -e "${GREEN}●${NC} Frontend" \
        || echo -e "${RED}●${NC} Frontend"

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
    echo "  2) Frontend"
    echo "  3) All logs (follow)"
    echo "  b) Back"
    echo ""
    read -rp "Choice: " choice
    echo ""
    case "$choice" in
        1)
            if [[ -f logs/api.log ]]; then
                echo -e "${GRAY}(Press Ctrl+C to stop following logs and return)${NC}"
                tail -n 50 -f logs/api.log || true
            else
                echo -e "${YELLOW}API log not found${NC}"
            fi
            ;;
        2)
            if [[ -f logs/frontend.log ]]; then
                echo -e "${GRAY}(Press Ctrl+C to stop following logs and return)${NC}"
                tail -n 50 -f logs/frontend.log || true
            else
                echo -e "${YELLOW}Frontend log not found${NC}"
            fi
            ;;
        3)
            echo -e "${GRAY}(Press Ctrl+C to stop following logs and return)${NC}"
            tail -n 50 -f logs/*.log 2>/dev/null || echo "No logs found"
            ;;
        b|B) return ;;
        *) echo -e "${RED}Invalid choice${NC}" ;;
    esac
}

cmd_health_check() {
    banner
    echo -e "${CYAN}Health Check${NC}"
    echo ""

    echo -e "${BOLD}--- Redis ---${NC}"
    if redis-cli ping &>/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Redis running"
    else
        echo -e "  ${RED}✗${NC} Redis not responding"
    fi

    echo -e "${BOLD}--- Backend API ---${NC}"
    if curl -sf http://localhost:8000/health &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} API reachable"
        HEALTH=$(curl -s http://localhost:8000/health 2>/dev/null || echo "{}")
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
    echo -e "  ${YELLOW}PostgreSQL is not used by the current backend architecture.${NC}"
    echo -e "  ${GRAY}Job state is stored in-memory (single-worker) or Redis FileStore (multi-worker).${NC}"
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
    while true; do
        banner
        echo -e "${BOLD}${MAGENTA}  ╔════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BOLD}${MAGENTA}  ║${NC}             ${BOLD}${WHITE}Clean Environments & Data${NC}                  ${MAGENTA}║${NC}"
        echo -e "${BOLD}${MAGENTA}  ╠════════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}${MAGENTA}  ║${NC}  ${CYAN}[1]${NC}  Standard Clean (Caches, Logs, PIDs, .next)      ${BOLD}${MAGENTA}║${NC}"
    echo -e "${BOLD}${MAGENTA}  ║${NC}  ${CYAN}[2]${NC}  Dependencies Clean (.venv + node_modules)       ${BOLD}${MAGENTA}║${NC}"
    echo -e "${BOLD}${MAGENTA}  ║${NC}  ${RED}[3]${NC}  Full Factory Reset (WIPE ALL generated data)   ${BOLD}${MAGENTA}║${NC}"
        echo -e "${BOLD}${MAGENTA}  ╠════════════════════════════════════════════════════════╣${NC}"
        echo -e "${BOLD}${MAGENTA}  ║${NC}  ${GRAY}[b]${NC}  Back to main menu                               ${BOLD}${MAGENTA}║${NC}"
        echo -e "${BOLD}${MAGENTA}  ╚════════════════════════════════════════════════════════╝${NC}"
        echo ""
        read -rp "  Choice: " clean_choice || break
        case "$clean_choice" in
            1)
                head_ "Running Standard Clean..."
                echo -e "  ${CYAN}Stopping services...${NC}"
                bash scripts/stop.sh 2>/dev/null || true
                echo -e "  ${CYAN}Cleaning temporary runtime artifacts...${NC}"
                rm -rf .pids logs/*.log .cloudflare_tunnels .next tsconfig.tsbuildinfo backend/.runtime_cache 2>/dev/null || true
                find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
                find . -type f -name "*.py[co]" -delete 2>/dev/null || true
                find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
                find backend/third_party -name ".installing.lock" -delete 2>/dev/null || true
                echo -e "  ${GREEN}✔${NC} Standard clean completed (Caches, logs, PIDs, and build artifacts removed)"
                echo ""
                read -rp "Press Enter to continue..." || true
                ;;
            2)
                head_ "Removing Virtual Environments & Dependencies..."
                echo -e "  ${CYAN}Stopping services...${NC}"
                bash scripts/stop.sh 2>/dev/null || true
                echo -e "  ${CYAN}Removing backend virtualenv, frontend node_modules, and wheels...${NC}"
                rm -rf backend/.venv node_modules .next tsconfig.tsbuildinfo .wheels 2>/dev/null || true
                find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
                echo -e "  ${GREEN}✔${NC} Dependencies removed (backend/.venv, node_modules, .wheels)"
                echo ""
                read -rp "Press Enter to continue..." || true
                ;;
            3)
                head_ "FULL FACTORY RESET"
                echo -e "${YELLOW}WARNING: This will completely delete ALL installed components:${NC}"
                echo -e "  ${RED}•${NC} Backend virtual environment (backend/.venv)"
                echo -e "  ${RED}•${NC} Frontend dependencies (node_modules) and build (.next)"
                echo -e "  ${RED}•${NC} Prebuilt CUDA wheels (.wheels/)"
                echo -e "  ${RED}•${NC} All logs, PID files, and Cloudflare tunnel credentials"
                echo -e "  ${RED}•${NC} All Python bytecode (__pycache__) and pytest caches"
                echo ""
                echo -e "  ${GREEN}•${NC} Preserved: Git source code, docs, and .env configuration"
                echo ""
                read -rp "Type 'RESET' to confirm full wipe: " confirm_reset
                if [[ "$confirm_reset" == "RESET" ]]; then
                    echo -e "\n  ${CYAN}Stopping all services...${NC}"
                    bash scripts/stop.sh 2>/dev/null || true
                    pkill -f "cloudflared" 2>/dev/null || true
                    echo -e "  ${CYAN}Wiping environments, dependencies, and caches...${NC}"
                    rm -rf backend/.venv \
                           node_modules \
                           .next \
                           .wheels \
                           .pids \
                           logs/*.log \
                           .cloudflare_tunnels \
                           tsconfig.tsbuildinfo \
                           backend/.runtime_cache 2>/dev/null || true
                    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
                    find . -type f -name "*.py[co]" -delete 2>/dev/null || true
                    find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
                    find backend/third_party -name ".installing.lock" -delete 2>/dev/null || true
                    echo ""
                    echo -e "  ${GREEN}${BOLD}✔ Full factory reset complete!${NC}"
                    echo -e "  Run First-Time Setup (VPS: Option 1, Colab: Option 14) to reinstall cleanly."
                else
                    echo -e "  ${YELLOW}Factory reset cancelled.${NC}"
                fi
                echo ""
                read -rp "Press Enter to continue..." || true
                ;;
            b|B)
                return 0
                ;;
            *)
                echo -e "${RED}Invalid choice${NC}"
                sleep 1
                ;;
        esac
    done
}

cmd_service() {
    banner
    echo -e "${CYAN}Individual Service Management${NC}"
    echo ""
    echo "Select a service to manage:"
    echo "  1) Backend API"
    echo "  2) Frontend"
    echo "  3) Redis"
    echo "  b) Back to main menu"
    echo ""
    read -rp "Service choice: " svc_choice
    echo ""

    case "$svc_choice" in
        1) _service_submenu "api" "Backend API" "uvicorn api.main_singleworker:app" "cd backend && source .venv/bin/activate && setsid python -m uvicorn api.main_singleworker:app --host 0.0.0.0 --port 8000 --log-level info > ../logs/api.log 2>&1 &" "$PID_DIR/api.pid" ;;
        2) _service_submenu "frontend" "Frontend" "next" "NEXT_PUBLIC_API_URL=http://localhost:8000 bun start > logs/frontend.log 2>&1 &" "$PID_DIR/frontend.pid" ;;
        3) _systemd_service_submenu "redis-server" "Redis" ;;
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
     echo "  1) Full install (all models)"
     echo "  2) Verify installation"
     echo "  b) Back"
     echo ""
     read -rp "Choice: " choice
     echo ""
     case "$choice" in
         1)
             if [[ -f backend/scripts/download_models.sh ]]; then
                 bash backend/scripts/download_models.sh
             else
                 echo -e "${RED}backend/scripts/download_models.sh not found${NC}"
             fi
             ;;
         2)
             if [[ -f backend/scripts/download_models.sh ]]; then
                 bash backend/scripts/download_models.sh -v
             else
                 echo -e "${RED}backend/scripts/download_models.sh not found${NC}"
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
    echo "  Requirements: CUDA 12.4 toolkit, ninja, PyTorch with CUDA"
    echo "  Output: .wheels/ directory (consistent with GitHub workflow)"
    echo ""

    # ── Enforce CUDA 12.4 ────────────────────────────────────────────────────
    if ! command -v nvcc &>/dev/null; then
        warn "nvcc not found — attempting CUDA 12.4 toolkit installation..."
        if command -v apt-get &>/dev/null; then
            sudo apt-get update -qq && sudo apt-get install -y -qq cuda-toolkit-12-4 2>/dev/null || {
                warn "Failed to install CUDA toolkit 12.4 automatically"
                echo "  Install manually: sudo apt-get install -y cuda-toolkit-12-4"
                echo "  Or download from: https://developer.nvidia.com/cuda-downloads"
                return 1
            }
        else
            warn "apt-get not found — cannot auto-install CUDA toolkit"
            echo "  Install CUDA toolkit 12.4 manually: https://developer.nvidia.com/cuda-downloads"
            return 1
        fi
    fi
    ok "CUDA toolkit: $(nvcc --version | grep release | sed 's/.*release //;s/,.*//')"

    # ── Build wheels using unified script with CUDA 12.4 enforcement ────────
    step "Running unified wheels builder..."
    bash scripts/build-native-wheels.sh --output-dir .wheels --python 3.12 --cuda 12.4

    # ── Report results ───────────────────────────────────────────────────────
    echo ""
    if [ "$(ls -A .wheels/*.whl 2>/dev/null)" ]; then
        ok "Wheels built successfully in .wheels/!"
        echo ""
        ls -lh .wheels/*.whl | awk '{print "  " $9 " (" $5 ")"}'
        echo ""
        read -rp "  Upload to GitHub Releases? [y/N]: " upload
        if [[ "$upload" =~ ^[Yy]$ ]]; then
            info "Uploading to GitHub Releases..."
            bash scripts/build-native-wheels.sh --output-dir .wheels --upload
        else
            info "Upload skipped. Run manually with: bash scripts/build-native-wheels.sh --output-dir .wheels --upload"
        fi
    else
        warn "No wheels were built — check errors above"
        warn "On CPU-only hosts, this is expected; build on GPU host (Colab/VPS) for CUDA support"
        warn "The .wheels/ directory is pre-configured; rebuild on GPU host when available"
    fi
}

_main_menu_() {
    while true; do
        banner
        _status
        _menu_top
        _menu_item "[1]" "First-Time Setup (VPS / Local)"
        _menu_item "[2]" "Start all services (VPS / Local)"
        _menu_item "[3]" "Stop all services (VPS / Local)"
        _menu_item "[4]" "Restart all services (VPS / Local)"
        _menu_item "[5]" "Service status"
        _menu_item "[6]" "View logs"
        _menu_item "[7]" "Health check"
        _menu_item "[8]" "Database management"
        _menu_item "[9]" "View environment"
        _menu_item "[10]" "Reset PID files"
        _menu_item "[11]" "Clean old logs"
        _menu_item "[12]" "Cloudflare"
        _menu_item "[13]" "Update / install models"
        _menu_item "[14]" "Google Colab launcher (Dedicated Colab Menu)"
        _menu_item "[15]" "Clean environments & data (Standard / Full Wipe)"
        _menu_item "[16]" "Manage individual service"
        _menu_item "[17]" "Build native CUDA wheels"
        _menu_separator
        _menu_item "[q]" "Quit"
        _menu_bottom
        echo ""
        echo -e "  ${GRAY}Quick keys: 1-16  ${DIM}│${NC}  ${GRAY}q to quit${NC}"
        echo ""
        read -rp "  Choice: " choice || { echo ""; continue; }
        case "$choice" in
            1)  cmd_setup || true ;;
            2)  cmd_start || true ;;
            3)  cmd_stop || true ;;
            4)  cmd_restart || true ;;
            5)  cmd_status || true ;;
            6)  cmd_logs || true ;;
            7)  cmd_health_check || true ;;
            8)  cmd_database || true ;;
            9)  cmd_environment || true ;;
            10) cmd_reset_pids || true ;;
            11) cmd_clean_logs || true ;;
            12) cmd_cf || true ;;
            13) cmd_update_models || true ;;
            14) cmd_colab || true ;;
            15) cmd_clean || true ;;
            16) cmd_service || true ;;
            17) cmd_build_wheels || true ;;
            q|Q) echo ""; echo -e "${GREEN}  ╔════════════════════════════════════════════════════════╗${NC}"; echo -e "${GREEN}  ║${NC}              ${BOLD}Goodbye! 👋${NC}                            ${GREEN}║${NC}"; echo -e "${GREEN}  ╚════════════════════════════════════════════════════════╝${NC}"; echo ""; exit 0 ;;
            *) echo -e "${RED}Invalid choice${NC}"; sleep 1 ;;
        esac
    done
}

_main_menu_