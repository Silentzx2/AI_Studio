#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
cd "$PROJECT_ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BLUE='\033[0;34m'; MAGENTA='\033[0;35m'; WHITE='\033[1;37m'; GRAY='\033[0;90m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

PID_DIR="$PROJECT_ROOT/.pids"
BACKEND_URL="${BACKEND_URL:-http://localhost:7842}"
FRONTEND_URL="http://localhost:3000"

banner(){
  clear 2>/dev/null || true
  printf "${CYAN}"
  cat <<'ART'

             █████╗ ██╗    ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
            ██╔══██╗██║    ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
            ███████║██║    ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
            ██╔══██║██║    ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
            ██║  ██║██║    ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
            ╚═╝  ╚═╝╚═╝    ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝

                               SERVICE MANAGER                               
ART
  printf "${NC}\n"
}

pause(){ printf "\n${DIM}Press Enter to continue...${NC}"; read -r _ || true; }

status_badge(){
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file" 2>/dev/null || true)
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      printf "${GREEN}● RUNNING${NC}"
      return
    fi
  fi
  printf "${GRAY}○ STOPPED${NC}"
}

health(){
  if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 3 "$BACKEND_URL/health" >/dev/null 2>&1; then
    printf "${GREEN}● HEALTHY${NC}"
  else
    printf "${RED}● UNAVAILABLE${NC}"
  fi
}

show_status(){
  banner
  printf "${WHITE}${BOLD}SYSTEM STATUS${NC}\n\n"
  printf "  ${CYAN}Frontend${NC}   %-18s  %s\n" "" "$(status_badge "$PID_DIR/frontend.pid")"
  printf "  ${CYAN}Backend${NC}    %-18s  %s\n" "" "$(status_badge "$PID_DIR/backend.pid")"
  printf "  ${CYAN}API Health${NC} %-18s  %s\n" "" "$(health)"

  if redis-cli -u "${REDIS_URL:-redis://localhost:6379/0}" ping >/dev/null 2>&1; then
    printf "  ${CYAN}Redis${NC}      %-18s  ${GREEN}● READY${NC}\n" ""
  else
    printf "  ${CYAN}Redis${NC}      %-18s  ${GRAY}○ STOPPED${NC}\n" ""
  fi

  printf "\n  ${DIM}Frontend: $FRONTEND_URL${NC}\n"
  printf "  ${DIM}Backend:  $BACKEND_URL${NC}\n"
  printf "  ${DIM}Docs:     $BACKEND_URL/docs${NC}\n"
}

# ── External tool managers ────────────────────────────────────────────────

cmd_cloudflare() {
    clear

    local script="$PROJECT_ROOT/scripts/cloudflare.sh"

    if [[ ! -f "$script" ]]; then
        echo -e "${RED}[✗]${NC} Cloudflare script not found:"
        echo "    $script"
        return 1
    fi

    chmod +x "$script"

    echo -e "${CYAN}Launching Cloudflare Tunnel Manager...${NC}"
    echo

    bash "$script"

    echo
    echo -e "${GREEN}[✓]${NC} Returned from Cloudflare manager."
}

cmd_models() {
    clear

    local script="$PROJECT_ROOT/backend/scripts/download_models.sh"

    if [[ ! -f "$script" ]]; then
        echo -e "${RED}[✗]${NC} Model manager script not found:"
        echo "    $script"
        return 1
    fi

    chmod +x "$script"

    echo -e "${CYAN}Launching 3D Model Manager...${NC}"
    echo

    bash "$script"

    echo
    echo -e "${GREEN}[✓]${NC} Returned from model manager."
}

run_setup(){
  banner
  bash "$PROJECT_ROOT/scripts/setup.sh"
  pause
}

run_start(){
  bash "$PROJECT_ROOT/scripts/start.sh"
  pause
}

run_stop(){
  bash "$PROJECT_ROOT/scripts/stop.sh"
  pause
}

run_restart(){
  bash "$PROJECT_ROOT/scripts/restart.sh"
  pause
}

show_logs(){
  banner
  printf "${WHITE}${BOLD}LOG VIEWER${NC}\n\n"
  printf "  ${CYAN}[1]${NC} Frontend\n"
  printf "  ${CYAN}[2]${NC} Backend supervisor\n"
  printf "  ${CYAN}[3]${NC} Backend scheduler\n"
  printf "  ${CYAN}[4]${NC} Backend API\n"
  printf "  ${CYAN}[b]${NC} Back\n\n"
  printf "  ${BOLD}Select an action:${NC} "
  read -r choice
  case "$choice" in
    1) tail -n 80 -f "$PROJECT_ROOT/logs/frontend.log" 2>/dev/null || true ;;
    2) tail -n 80 -f "$PROJECT_ROOT/logs/backend-supervisor.log" 2>/dev/null || true ;;
    3) tail -n 80 -f "$PROJECT_ROOT/backend/logs/scheduler.log" 2>/dev/null || true ;;
    4) tail -n 80 -f "$PROJECT_ROOT/backend/logs/api.log" 2>/dev/null || true ;;
  esac
}

clean_runtime(){
  banner
  printf "${WHITE}${BOLD}RUNTIME CLEANUP${NC}\n\n"
  printf "  This removes generated runtime artifacts only:\n"
  printf "  ${GRAY}• logs/*.log${NC}\n"
  printf "  ${GRAY}• .pids/*.pid${NC}\n"
  printf "  ${GRAY}• .next build cache${NC}\n"
  printf "  ${GRAY}• Python __pycache__${NC}\n\n"
  read -rp "  Continue? [y/N] " answer
  [[ "${answer,,}" == "y" ]] || return 0
  bash "$PROJECT_ROOT/scripts/stop.sh" >/dev/null 2>&1 || true
  rm -f "$PROJECT_ROOT"/logs/*.log "$PROJECT_ROOT"/.pids/*.pid 2>/dev/null || true
  rm -rf "$PROJECT_ROOT/.next" 2>/dev/null || true
  find "$PROJECT_ROOT/backend" -type d -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true
  find "$PROJECT_ROOT/backend" -type f -name '*.py[co]' -delete 2>/dev/null || true
  printf "\n${GREEN}✓ Runtime cleanup complete.${NC}\n"
  pause
}

main_menu(){
  while true; do
    banner
    printf "\t ${WHITE}${BOLD}CONTROL CENTER${NC}\n\n"
    printf "  ${CYAN}[0]${NC}  Setup / Install\n"
    printf "  ${CYAN}[1]${NC}  Overview / Status\n"
    printf "  ${CYAN}[2]${NC}  Start Studio\n"
    printf "  ${CYAN}[3]${NC}  Stop Studio\n"
    printf "  ${CYAN}[4]${NC}  Restart Studio\n"
    printf "  ${CYAN}[5]${NC}  View Logs\n"
    printf "  ${CYAN}[6]${NC}  Clean Runtime\n"
    printf "  ${CYAN}[7]${NC}  Cloudflare Tunnel\n"
    printf "  ${CYAN}[8]${NC}  3D Model Install\n"
    printf "  ${RED}[q]${NC}   Exit\n"

    printf "${DIM}──────────────────────────────────────────────────────────────${NC}\n"
    printf "  API %s   •   UI %s\n" "$BACKEND_URL" "$FRONTEND_URL"
    printf "${DIM}──────────────────────────────────────────────────────────────${NC}\n\n"
    printf "  ${BOLD}Select an action:${NC} "
    read -r choice
    case "$choice" in
      0) run_setup ;;
      1) show_status; pause ;;
      2) run_start ;;
      3) run_stop ;;
      4) run_restart ;;
      5) show_logs ;;
      6) clean_runtime ;;
      7) cmd_cloudflare ;;
      8) cmd_models ;;
      q|Q) printf "\n${CYAN}AI 3D Studio manager closed.${NC}\n"; exit 0 ;;
      *) printf "\n${RED}Invalid option.${NC}\n"; sleep 1 ;;
    esac
  done
}

main_menu
