#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; MAGENTA='\033[0;35m'; WHITE='\033[1;37m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'
log(){ printf "${GREEN}[START]${NC} %s\n" "$*"; }
info(){ printf "${CYAN}[INFO]${NC}  %s\n" "$*"; }
warn(){ printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
fail(){ printf "${RED}[ERROR]${NC} %s\n" "$*" >&2; exit 1; }
section(){ printf "\n${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n${WHITE}${BOLD}  %s${NC}\n${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n" "$*"; }

banner(){
  printf "${CYAN}\n"
  cat <<'ART'
  ╔══════════════════════════════════════════════════════════════╗
  ║                     AI 3D STUDIO                           ║
  ║                 starting services...                       ║
  ╚══════════════════════════════════════════════════════════════╝
ART
  printf "${NC}\n"
}

PID_DIR="$PROJECT_ROOT/.pids"
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

BACKEND_URL="${BACKEND_URL:-http://localhost:7842}"
FRONTEND_URL="http://localhost:3000"

write_pid(){ printf '%s\n' "$2" > "$1"; }

is_alive(){ [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }

start_redis(){
  section "1/3 Redis"
  if redis-cli -u "${REDIS_URL:-redis://localhost:6379/0}" ping >/dev/null 2>&1; then
    log "Redis is already running."
    return 0
  fi

  if command -v systemctl >/dev/null 2>&1 && command -v redis-server >/dev/null 2>&1; then
    info "Starting system Redis..."
    sudo systemctl start redis-server >/dev/null 2>&1 || true
  fi

  if redis-cli -u "${REDIS_URL:-redis://localhost:6379/0}" ping >/dev/null 2>&1; then
    log "Redis is ready."
    return 0
  fi

  if command -v redis-server >/dev/null 2>&1; then
    info "Starting local Redis daemon..."
    redis-server --daemonize yes --bind 127.0.0.1 --port 6379 --save '' --appendonly no >/dev/null 2>&1 || true
    sleep 1
  fi

  redis-cli -u "${REDIS_URL:-redis://localhost:6379/0}" ping >/dev/null 2>&1 || fail "Redis is unavailable. Install Redis and rerun setup."
  log "Redis is ready."
}

start_backend() {
  section "2/3 Backend API"

  local script="$PROJECT_ROOT/backend/scripts/run_server.sh"
  [[ -x "$script" ]] || fail "run_server.sh not found or not executable."

  for attempt in 1 2; do
    if [[ -f "$PID_DIR/backend.pid" ]] && is_alive "$(cat "$PID_DIR/backend.pid" 2>/dev/null || true)"; then
      log "Backend already running."
    else
      rm -f "$PID_DIR/backend.pid"

      "$script" >>"$PROJECT_ROOT/logs/backend.log" 2>&1 &
      echo $! > "$PID_DIR/backend.pid"
      sleep 2
    fi

    if curl -fsS --max-time 3 "$BACKEND_URL/health" >/dev/null 2>&1; then
      log "Backend healthy: $BACKEND_URL"
      return 0
    fi

    [[ "$attempt" -eq 1 ]] && {
      warn "Backend did not respond. Retrying..."
      kill "$(cat "$PID_DIR/backend.pid" 2>/dev/null || true)" 2>/dev/null || true
      rm -f "$PID_DIR/backend.pid"
      sleep 2
    }
  done

  fail "Backend failed after 2 attempts. Check logs/backend.log"
}

start_frontend(){
  section "3/3 Frontend"
  export PATH="$HOME/.bun/bin:$PATH"
  [[ -d "$PROJECT_ROOT/node_modules" ]] || fail "Frontend dependencies are missing. Run bash scripts/setup.sh first."

  if [[ -f "$PID_DIR/frontend.pid" ]] && is_alive "$(cat "$PID_DIR/frontend.pid" 2>/dev/null || true)"; then
    log "Frontend process is already running."
    return 0
  fi

  if [[ ! -f "$PROJECT_ROOT/.next/BUILD_ID" ]]; then
    info "Production build not found. Building Next.js..."
    if command -v bun >/dev/null 2>&1; then
      bun run build > "$LOG_DIR/frontend-build.log" 2>&1
    else
      npm run build > "$LOG_DIR/frontend-build.log" 2>&1
    fi
    log "Frontend build completed."
  fi

  local cmd
  if command -v bun >/dev/null 2>&1; then
    cmd=(bun run start)
  else
    cmd=(npm run start)
  fi

  info "Launching frontend on http://localhost:3000"
  setsid env BACKEND_URL="$BACKEND_URL" AI_PROVIDER=3d_aigc_api RUNTIME_MODE=3d_aigc_api \
    "${cmd[@]}" > "$LOG_DIR/frontend.log" 2>&1 &
  write_pid "$PID_DIR/frontend.pid" "$!"
  sleep 2

  if ! is_alive "$(cat "$PID_DIR/frontend.pid" 2>/dev/null || true)"; then
    fail "Frontend failed to start. Inspect logs/frontend.log."
  fi
  log "Frontend started: $FRONTEND_URL"
}

banner
start_redis
start_backend
start_frontend

section "AI 3D Studio is Running"
printf "  ${WHITE}${BOLD}Frontend${NC}  ${CYAN}%s${NC}\n" "$FRONTEND_URL"
printf "  ${WHITE}${BOLD}Backend${NC}   ${CYAN}%s${NC}\n" "$BACKEND_URL"
printf "  ${WHITE}${BOLD}API Docs${NC}  ${CYAN}%s/docs${NC}\n" "$BACKEND_URL"
printf "  ${WHITE}${BOLD}Health${NC}    ${CYAN}%s/health${NC}\n\n" "$BACKEND_URL"
printf "  ${DIM}Stop:${NC}    bash scripts/stop.sh\n"
printf "  ${DIM}Restart:${NC} bash scripts/restart.sh\n"
printf "  ${DIM}Manager:${NC} bash manager.sh\n"
