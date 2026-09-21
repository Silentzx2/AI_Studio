#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# [ENVIRONMENT: VPS / DEDICATED SERVER / LOCAL MACHINE ONLY]
# ⚠️  DO NOT USE THIS SCRIPT ON GOOGLE COLAB!
# For Google Colab, use: bash scripts/colab_restart.sh OR bash scripts/colab.sh --restart
#
# AI 3D Studio v3.2 — Restart Services (Non-Docker VPS)
# Stops all services and starts them again
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── SIGINT / Ctrl+C handler ───────────────────────────────────────────────
_restart_on_sigint() {
    echo ""
    echo -e "\n\033[1;33m[!] Restart interrupted by user (Ctrl+C).\033[0m"
    local child_pids
    child_pids=$(jobs -p 2>/dev/null || true)
    if [[ -n "$child_pids" ]]; then
        kill -TERM $child_pids 2>/dev/null || true
    fi
    exit 130
}
trap '_restart_on_sigint' INT

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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
log()   { echo -e "${GREEN}[INFO]${NC}    $*"; }
info()  { echo -e "${CYAN}[INFO]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}   $*"; }
err()   { echo -e "${RED}[ERROR]${NC}  $*" >&2; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }
log_warning() { echo -e "${YELLOW}[⚠]${NC} $*"; }
log_step() { echo -e "${CYAN}[→]${NC} $*"; }

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

# ── Progress bar ───────────────────────────────────────────────────────────
show_progress() {
    local current=$1
    local total=$2
    local width=40
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

# ── Banner ─────────────────────────────────────────────────────────────────
print_banner

# ── Stop services ──────────────────────────────────────────────────────────
print_section "Phase 1: Stopping Services"
bash "$SCRIPT_DIR/stop.sh"

# ── Wait for services to stop ──────────────────────────────────────────────
print_section "Phase 2: Waiting for Shutdown"
info "Waiting for services to stop..."
echo ""
for i in {1..15}; do
    if ! curl -sf http://localhost:8000/health &>/dev/null; then
        log_success "All services stopped"
        break
    fi
    show_progress "$i" 15
    sleep 1
done
echo ""
echo ""

# ── Clean up Python bytecode caches (__pycache__ / *.pyc) ─────────
info "Cleaning Python bytecode caches..."
find "${PROJECT_ROOT}/backend" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "${PROJECT_ROOT}/backend" -type f -name "*.py[co]" -delete 2>/dev/null || true
log "Bytecode caches cleaned"

# ── Start services ─────────────────────────────────────────────────────────
print_section "Phase 3: Starting Services"
bash "$SCRIPT_DIR/start.sh"
