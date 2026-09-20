#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# [ENVIRONMENT: VPS / DEDICATED SERVER / LOCAL MACHINE ONLY]
# ⚠️  DO NOT USE THIS SCRIPT ON GOOGLE COLAB!
# For Google Colab, use: bash scripts/colab_stop.sh OR bash scripts/colab.sh --stop
#
# AI 3D Studio v3.2 — Stop Services (Non-Docker VPS)
# Gracefully stops all running services using process signatures
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── SIGINT / Ctrl+C handler ───────────────────────────────────────────────
_stop_on_sigint() {
    echo ""
    echo -e "\n\033[1;33m[!] Stop operation interrupted by user (Ctrl+C).\033[0m"
    exit 130
}
trap '_stop_on_sigint' INT

# ── Colors ────────────────────────────────────────────────────────
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

# ── Helpers ───────────────────────────────────────────────────────
log()   { echo -e "${GREEN}[STOP]${NC}   $*"; }
info()  { echo -e "${CYAN}[INFO]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}   $*"; }
err()   { echo -e "${RED}[ERROR]${NC}  $*" >&2; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }
log_warning() { echo -e "${YELLOW}[⚠]${NC} $*"; }
log_error() { echo -e "${RED}[✗]${NC} $*" >&2; }
log_step() { echo -e "${CYAN}[→]${NC} $*"; }

# ── Banner ─────────────────────────────────────────────────────────────────
print_banner() {
    echo -e "${RED}"
    echo "  ╔════════════════════════════════════════════════════════════╗"
    echo "  ║                                                            ║"
    echo -e "  ║           ${WHITE}${BOLD}AI 3D Studio v3.2${RED}                              ║"
    echo -e "  ║        ${DIM}══════════════════════════════════${RED}                   ║"
    echo -e "  ║   ${GRAY}Professional AI-Powered 3D Generation${RED}                    ║"
    echo "  ║                                                            ║"
    echo "  ╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ── Section header ─────────────────────────────────────────────────────────
print_section() {
    echo ""
    echo -e "${MAGENTA}═══════════════════════════════════════════════${NC}"
    echo -e "${MAGENTA}  $1${NC}"
    echo -e "${MAGENTA}═══════════════════════════════════════════════${NC}"
    echo ""
}

# ── Project Root ──────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ── Helper: Kill by process signature ──────────────────────────────
kill_by_signature() {
    local name=$1
    local pattern=$2
    if pgrep -f "$pattern" >/dev/null 2>&1; then
        info "Stopping $name by process signature..."
        pkill -TERM -f "$pattern" 2>/dev/null || true
        local count=0
        while pgrep -f "$pattern" >/dev/null 2>&1 && [[ $count -lt 10 ]]; do
            sleep 1
            count=$((count + 1))
        done
        if pgrep -f "$pattern" >/dev/null 2>&1; then
            pkill -KILL -f "$pattern" 2>/dev/null || true
        fi
        if pgrep -f "$pattern" >/dev/null 2>&1; then
            warn "$name still running and owned by another user — re-run as root: sudo bash scripts/stop.sh"
        else
            log "$name stopped"
        fi
    else
        info "$name not running (no matching process found)"
    fi
}

# ── Banner ─────────────────────────────────────────────────────────────────
print_banner

# ── Stop services in reverse order ─────────────────────────────────
print_section "Stopping Services"
kill_by_signature "Frontend"      "next start"
kill_by_signature "Frontend"      "next-server"
kill_by_signature "Backend API"   "uvicorn app.main:app"
kill_by_signature "ComfyUI"       "ENGINE/ComfyUI/main.py"
kill_by_signature "Colab Keep-Alive" "colab_keepalive"

# Ensure ports are released even if parent processes were orphaned
if command -v fuser >/dev/null 2>&1; then
    fuser -k -TERM 3000/tcp 2>/dev/null || true
    fuser -k -TERM 8000/tcp 2>/dev/null || true
    fuser -k -TERM 8188/tcp 2>/dev/null || true
    sleep 0.5
    fuser -k -KILL 3000/tcp 2>/dev/null || true
    fuser -k -KILL 8000/tcp 2>/dev/null || true
    fuser -k -KILL 8188/tcp 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
    lsof -ti :3000 | xargs -r kill -9 2>/dev/null || true
    lsof -ti :8000 | xargs -r kill -9 2>/dev/null || true
    lsof -ti :8188 | xargs -r kill -9 2>/dev/null || true
fi

# ── Stop system services ──────────────────────────────────────────
# Stop Redis
info "Stopping Redis..."
if command -v redis-cli &>/dev/null; then
    redis-cli shutdown nosave 2>/dev/null || true
fi
if command -v service &>/dev/null; then
    sudo service redis-server stop 2>/dev/null || true
fi
if command -v systemctl &>/dev/null && systemctl is-active --quiet redis-server 2>/dev/null; then
    sudo systemctl stop redis-server 2>/dev/null || true
fi
pkill -f "redis-server" 2>/dev/null || true
log "Redis stopped"

# Stop PostgreSQL
info "Stopping PostgreSQL..."
if command -v service &>/dev/null; then
    sudo service postgresql stop 2>/dev/null || true
fi
if command -v pg_ctlcluster &>/dev/null; then
    for v in $(ls /etc/postgresql/ 2>/dev/null); do
        sudo pg_ctlcluster "$v" main stop 2>/dev/null || true
    done
fi
if command -v systemctl &>/dev/null && systemctl is-active --quiet postgresql 2>/dev/null; then
    sudo systemctl stop postgresql 2>/dev/null || true
fi
pkill -u postgres -f "postgres" 2>/dev/null || true
log "PostgreSQL stopped"

# ── Clean up stale PID files ──────────────────────────────────────
rm -f "${PROJECT_ROOT}/.pids"/*.pid 2>/dev/null || true

# ── Clean up Python bytecode caches (__pycache__ / *.pyc) ─────────
info "Cleaning Python bytecode caches..."
find "${PROJECT_ROOT}/backend" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "${PROJECT_ROOT}/backend" -type f -name "*.py[co]" -delete 2>/dev/null || true
log "Bytecode caches cleaned"

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║${NC}  ${RED}🛑 All Services Stopped${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GRAY}Services stopped. Run ${GREEN}bash scripts/start.sh${GRAY} to restart.${NC}"
echo ""