#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# AI 3D Studio v3.2 — Stop Services (Non-Docker)
# Gracefully stops all running services using process signatures
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────
log()   { echo -e "${GREEN}[STOP]${NC}   $*"; }
info()  { echo -e "${CYAN}[INFO]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}   $*"; }
err()   { echo -e "${RED}[ERROR]${NC}  $*" >&2; }

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

# ── Banner ─────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  🛑 ${BOLD}Stopping AI 3D Studio Services${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Stop services in reverse order ─────────────────────────────────
kill_by_signature "Frontend"      "next start"
kill_by_signature "Frontend"      "next-server"
kill_by_signature "Celery Worker" "celery -A app.workers.celery_app worker"
kill_by_signature "Backend API"   "uvicorn app.main:app"
kill_by_signature "Colab Keep-Alive" "colab_keepalive"

# ── Stop system services ──────────────────────────────────────────
if command -v systemctl &>/dev/null; then
    if systemctl is-active --quiet postgresql 2>/dev/null; then
        info "Stopping PostgreSQL..."
        sudo systemctl stop postgresql 2>/dev/null || true
        log "PostgreSQL stopped"
    else
        info "PostgreSQL not running"
    fi
    if systemctl is-active --quiet redis-server 2>/dev/null; then
        info "Stopping Redis..."
        sudo systemctl stop redis-server 2>/dev/null || true
        log "Redis stopped"
    else
        info "Redis not running"
    fi
else
    warn "systemctl not available — cannot stop PostgreSQL/Redis via systemd"
fi

# ── Clean up stale PID files ──────────────────────────────────────
rm -f "${PROJECT_ROOT}/.pids"/*.pid 2>/dev/null || true

echo ""
log "All services stopped"
echo ""