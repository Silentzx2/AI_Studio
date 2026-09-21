#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# [ENVIRONMENT: VPS / DEDICATED SERVER / LOCAL MACHINE ONLY]
# ⚠️  DO NOT USE THIS SCRIPT ON GOOGLE COLAB!
# For Google Colab, use: bash scripts/colab_start.sh OR bash scripts/colab.sh --start
#
# AI 3D Studio v4.0 — Startup Script (Non-Docker VPS)
   # Starts all services natively:
   #   Redis → Backend API → Frontend
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── SIGINT / Ctrl+C handler ───────────────────────────────────────────────
_start_on_sigint() {
    echo ""
    echo -e "\n\033[1;33m[!] Startup interrupted by user (Ctrl+C).\033[0m"
    local child_pids
    child_pids=$(jobs -p 2>/dev/null || true)
    if [[ -n "$child_pids" ]]; then
        kill -TERM $child_pids 2>/dev/null || true
    fi
    exit 130
}
trap '_start_on_sigint' INT

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

# ── Helpers ───────────────────────────────────────────────────────────────
log()   { echo -e "${GREEN}[START]${NC}  $*"; }
info()  { echo -e "${CYAN}[INFO]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}   $*"; }
err()   { echo -e "${RED}[ERROR]${NC}  $*" >&2; }
step()  { echo -e "\n${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n  ${BOLD}${MAGENTA}➜ $*${NC}\n"; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }
log_warning() { echo -e "${YELLOW}[⚠]${NC} $*"; }
log_error() { echo -e "${RED}[✗]${NC} $*" >&2; }
log_step() { echo -e "${CYAN}[→]${NC} $*"; }
log_debug() { echo -e "${GRAY}[DEBUG]${NC} $*"; }

# ── Banner ─────────────────────────────────────────────────────────────────
print_banner() {
    echo -e "${CYAN}"
    echo "  ╔════════════════════════════════════════════════════════════╗"
    echo "  ║                                                            ║"
    echo -e "  ║           ${WHITE}${BOLD}AI 3D Studio v3.2${CYAN}                              ║"
    echo -e "  ║        ${DIM}══════════════════════════════════${CYAN}                   ║"
    echo -e "  ║   ${GRAY}Professional AI-Powered 3D Generation${CYAN}                    ║"
    echo "  ║                                                            ║"
    echo "  ╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ── Progress spinner ───────────────────────────────────────────────────────
spinner() {
    local pid=$1
    local msg="${2:-Waiting}"
    local delay=0.1
    local spinstr='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    while kill -0 "$pid" 2>/dev/null; do
        local temp=${spinstr#?}
        printf "\r  ${CYAN}%s${NC}  %s" "${spinstr:0:1}" "$msg"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
    done
    wait "$pid" 2>/dev/null
    printf "\r  ${GREEN}✔${NC}  %s\n" "$msg"
}

# ── Progress bar ───────────────────────────────────────────────────────────
show_progress() {
    local current=$1
    local total=$2
    local width=50
    local percentage=$((current * 100 / total))
    local filled=$((width * current / total))
    local empty=$((width - filled))
    printf "\r  ${CYAN}[${NC}"
    printf "%${filled}s" | tr ' ' '█'
    printf "%${empty}s" | tr ' ' '░'
    printf "${CYAN}]${NC} ${WHITE}%3d%%${NC}" "$percentage"
}

# ── Section header ─────────────────────────────────────────────────────────
print_section() {
    echo ""
    echo -e "${MAGENTA}═══════════════════════════════════════════════${NC}"
    echo -e "${MAGENTA}  $1${NC}"
    echo -e "${MAGENTA}═══════════════════════════════════════════════${NC}"
    echo ""
}

# ── Project Root ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"



detect_gpu() {
    if command -v nvidia-smi &>/dev/null; then
        local count
        count=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | wc -l)
        if [[ "$count" -gt 0 ]]; then
            echo "gpu"
            return
        fi
    fi
    echo "cpu"
}

# ── Helper: run command with bun if available, else npm fallback ──
run_bun_or_npm() {
    local bun_cmd="$1"
    local npm_cmd="$2"
    if command -v bun &>/dev/null; then
        eval "$bun_cmd"
    else
        eval "$npm_cmd"
    fi
}

    # Ensure Node.js/Bun
    if ! command -v bun &>/dev/null; then
        warn "Bun not found — installing bun..."
        if command -v curl &>/dev/null; then
            curl -fsSL https://bun.sh/install | bash 2>/dev/null || {
                err "bun install failed; falling back to nodejs..."
                curl -fsSL https://deb.nodesource.com/setup_20.x 2>/dev/null | sudo bash - 2>/dev/null || true
                sudo apt-get install -y nodejs 2>/dev/null || true
            }
        fi
        if [[ -f "$HOME/.bun/bin/bun" ]] && [[ ! -e /usr/local/bin/bun ]]; then
            sudo ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun 2>/dev/null || ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun 2>/dev/null || true
        fi
    fi
    hash -r 2>/dev/null || true
    export PATH="$HOME/.bun/bin:$PATH"

    # Ensure frontend deps
    if [[ ! -d node_modules ]]; then
        info "Installing frontend dependencies..."
        run_bun_or_npm "bun ci 2>/dev/null" "npm ci 2>/dev/null" || run_bun_or_npm "bun install 2>/dev/null" "npm install 2>/dev/null" || {
            err "Frontend dependency installation failed"
            exit 1
        }
    fi
    if [[ ! -f node_modules/next/package.json ]]; then
        err "Next.js is not available after frontend dependency installation"
        exit 1
    fi

    # Ensure storage directories exist
    mkdir -p backend/storage/uploads backend/storage/models backend/storage/thumbnails
    mkdir -p backend/storage/exports backend/storage/images backend/.hf_cache/hub
    mkdir -p backend/.runtime_cache logs

    log "Auto-bootstrap complete for ${env_type}"
# ── Ensure CUDA_VISIBLE_DEVICES is set for GPU runtime ──────────────
if [[ -z "${CUDA_VISIBLE_DEVICES:-}" ]]; then
    export CUDA_VISIBLE_DEVICES=0
fi


# ── PID file directory ─────────────────────────────────────────────────────
PID_DIR="${PROJECT_ROOT}/.pids"
mkdir -p "$PID_DIR"

# ── Logs directory ─────────────────────────────────────────────────────────
mkdir -p "${PROJECT_ROOT}/logs"

# ── Helper: Write PID ──────────────────────────────────────────────────────
write_pid() {
    local pid_file=$1
    local pid=$2
    mkdir -p "$(dirname "$pid_file")"
    echo "$pid" > "$pid_file"
}


# ── Ensure Node.js/Bun is available ──────────────────────────────────
# Prefers bun; falls back to npm if bun is not installed.
# Auto-installs bun if neither bun nor npm is found.
ensure_bun_or_npm() {
    export PATH="$HOME/.bun/bin:$PATH"
    if command -v bun &>/dev/null; then
        if [[ -f "$HOME/.bun/bin/bun" ]] && [[ ! -e /usr/local/bin/bun ]]; then
            sudo ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun 2>/dev/null || ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun 2>/dev/null || true
        fi
        log "Bun found: $(bun --version 2>/dev/null || echo unknown)"
        return 0
    fi
    info "Bun not found — installing bun..."
    if command -v curl &>/dev/null; then
        curl -fsSL https://bun.sh/install | bash 2>/dev/null || {
            err "bun installation failed; attempting npm install..."
            curl -fsSL https://deb.nodesource.com/setup_20.x 2>/dev/null | sudo bash - 2>/dev/null || true
            sudo apt-get install -y nodejs 2>/dev/null || true
        }
    fi
    hash -r 2>/dev/null || true
    export PATH="$HOME/.bun/bin:$PATH"
    if [[ -f "$HOME/.bun/bin/bun" ]] && [[ ! -e /usr/local/bin/bun ]]; then
        sudo ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun 2>/dev/null || ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun 2>/dev/null || true
    fi
    if command -v bun &>/dev/null; then
        log "Bun installed: $(bun --version 2>/dev/null || echo unknown)"
        return 0
    fi
    if command -v npm &>/dev/null; then
        log "npm available as fallback: $(npm --version 2>/dev/null || echo unknown)"
        return 0
    fi
    err "Neither bun nor npm available after install attempt. Run: sudo bash scripts/setup.sh"
    return 1
}

if ! ensure_bun_or_npm; then
    err "Node.js/Bun not found and auto-install failed. Run: sudo bash scripts/setup.sh"
    exit 1
fi
# ── Service PIDs ───────────────────────────────────────────────────────────
   API_PID_FILE="$PID_DIR/api.pid"
   FRONTEND_PID_FILE="$PID_DIR/frontend.pid"

   # ── Helper: Kill by PID file ──────────────────────────────────────────────
   kill_by_pid_file() {
       local pid_file=$1
       if [[ -f "$pid_file" ]]; then
           local pid=$(cat "$pid_file" 2>/dev/null || echo "")
           if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
               kill "$pid" 2>/dev/null || true
               # Wait for process to die (with timeout)
               local count=0
               while kill -0 "$pid" 2>/dev/null && [[ $count -lt 10 ]]; do
                   sleep 1
                   count=$((count + 1))
               done
               # Force kill if still alive
               if kill -0 "$pid" 2>/dev/null; then
                   kill -KILL "$pid" 2>/dev/null || true
                   sleep 1
               fi
               rm -f "$pid_file"
           fi
       fi
   }

   # ── Banner ─────────────────────────────────────────────────────────────────
   print_banner

   # ── Step 1: Verify Redis ───────────────────────────────────────────────────
   step "1/5 Checking Redis..."
   if command -v systemctl &>/dev/null && ! systemctl is-active --quiet redis-server; then
       info "Starting Redis..."
       sudo systemctl start redis-server || {
           warn "Failed to start Redis — will configure in-memory broker fallback"
       }
   fi

   if ! redis-cli ping &>/dev/null; then
       warn "Redis not responding — backend will use in-memory caching"
   else
       log "Redis ready"
   fi
   echo ""


# ── Clean up Python bytecode caches (__pycache__ / *.pyc) ─────────
info "Cleaning Python bytecode caches..."
find "${PROJECT_ROOT}/backend" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "${PROJECT_ROOT}/backend" -type f -name "*.py[co]" -delete 2>/dev/null || true
log "Bytecode caches cleaned"


    # ── Step 3: Start Multi-Worker Server (run_server.sh) ──────────────────
    if [[ -f backend/scripts/run_server.sh ]]; then
        step "3/4 Starting Multi-Worker Server (run_server.sh)..."
        : > "$PROJECT_ROOT/logs/run_server.log"
        (
            cd backend
            setsid bash scripts/run_server.sh \
                >> "$PROJECT_ROOT/logs/run_server.log" 2>&1 &
            write_pid "$PID_DIR/run_server.pid" $!
        )
        log "Multi-Worker Server started (PID: $(cat $PID_DIR/run_server.pid 2>/dev/null || echo 'pending'))"
    else
        warn "backend/scripts/run_server.sh not found — skipping multi-worker server"
    fi

# Wait for API to be ready
info "Waiting for API to be healthy (timeout: 60s)..."
for i in {1..30}; do
    if curl -sf http://localhost:8000/health &>/dev/null; then
        log "API is healthy"
        break
    fi
    if [[ "$i" -eq 30 ]]; then
        err "Health check timed out after 60s"
    fi
    echo -n "."
    sleep 2
done
echo ""
echo ""

# Fail loudly if the API never came up (don't leave a half-started stack).
if ! curl -sf http://localhost:8000/health &>/dev/null; then
    err "Backend API failed to become healthy. See logs/api.log"
    if [[ -f "$API_PID_FILE" ]]; then
        kill "$(cat "$API_PID_FILE")" 2>/dev/null || true
        rm -f "$API_PID_FILE"
    fi
    exit 1
fi

# Start Xvfb virtual display if no DISPLAY is set, enabling offscreen OpenGL/trimesh rendering
if [[ -z "${DISPLAY:-}" ]] && command -v Xvfb &>/dev/null; then
    pkill -f "Xvfb :99" 2>/dev/null || true
    Xvfb :99 -screen 0 1024x768x24 -nolisten tcp >/dev/null 2>&1 &
    export DISPLAY=:99
    log "Xvfb virtual display active on $DISPLAY"
fi
export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-offscreen}"

# ── Step 4: Start Frontend ────────────────────────────────────────────────
   step "4/4 Starting Frontend  — http://localhost:3000..."

# Install deps if needed
if [[ ! -d node_modules ]] || [[ ! -d node_modules/next ]]; then
    if [[ -d node_modules ]] && [[ ! -d node_modules/next ]]; then
        warn "node_modules appears corrupted (missing next) — removing and reinstalling"
        rm -rf node_modules
    fi
    info "Installing Bun dependencies..."
    run_bun_or_npm "bun ci 2>&1 | grep -E '(added|up to date)'" "npm ci 2>&1 | grep -E '(added|up to date)'" || true
fi

# Dev mode: skip build (hot-reload). Prod mode: build first.
info "Building Next.js for production..."
export NEXT_PUBLIC_API_URL=http://localhost:8000
run_bun_or_npm "bun run build 2>&1 | tail -5" "npm run build 2>&1 | tail -5"
FRONTEND_RUN_CMD=$(command -v bun &>/dev/null && echo "bun start" || echo "npm start")

# Start frontend
BACKEND_URL="${BACKEND_URL:-http://localhost:8000}" NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-}" setsid $FRONTEND_RUN_CMD \
    > "$PROJECT_ROOT/logs/frontend.log" 2>&1 &
write_pid "$FRONTEND_PID_FILE" $!

log "Frontend started (PID: $(cat $FRONTEND_PID_FILE))"
echo ""

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}  ${GREEN}✅ All Services Started${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Endpoints:${NC}
       ${GRAY}├─${NC} Frontend       ${CYAN}http://localhost:3000${NC}
       ${GRAY}├─${NC} Backend API    ${CYAN}http://localhost:8000${NC}
       ${GRAY}└─${NC} API Docs       ${CYAN}http://localhost:8000/docs${NC}"

   echo -e "  ${BOLD}Logs:${NC}
       ${GRAY}├─${NC} API      ${CYAN}logs/api.log${NC}
       ${GRAY}└─${NC} Frontend ${CYAN}logs/frontend.log${NC}"

   echo -e "  ${BOLD}Stop services:${NC} ${GREEN}bash scripts/stop.sh${NC}"
   echo ""
