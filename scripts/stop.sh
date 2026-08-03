#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# AI 3D Studio v3.2 — Stop Services (Non-Docker)
# Gracefully stops all running services
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────
log()   { echo -e "${GREEN}[STOP]${NC}   $*"; }
info()  { echo -e "${CYAN}[INFO]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}   $*"; }
err()   { echo -e "${RED}[ERROR]${NC}  $*" >&2; }

# ── Project Root ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ── PID file directory ─────────────────────────────────────────────────────
PID_DIR="${PROJECT_ROOT}/.pids"

# ── Service PIDs ───────────────────────────────────────────────────────────
API_PID_FILE="$PID_DIR/api.pid"
WORKER_PID_FILE="$PID_DIR/worker.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"

# ── Helper: Kill by PID file ──────────────────────────────────────────────
kill_service() {
    local name=$1
    local pid_file=$2
    
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file" 2>/dev/null || echo "")
        if [[ -n "$pid" ]]; then
            if kill -0 "$pid" 2>/dev/null; then
                info "Stopping $name (PID: $pid)..."
                kill -TERM "$pid" 2>/dev/null || true
                
                # Wait for graceful shutdown
                local count=0
                while kill -0 "$pid" 2>/dev/null && [[ $count -lt 10 ]]; do
                    sleep 1
                    count=$((count + 1))
                done
                
                # Force kill if still running
                if kill -0 "$pid" 2>/dev/null; then
                    warn "Force killing $name (did not shut down gracefully)"
                    kill -KILL "$pid" 2>/dev/null || true
                fi
                log "$name stopped"
            else
                warn "$name (PID: $pid) not running"
            fi
            rm -f "$pid_file"
        fi
    else
        warn "$name PID file not found ($pid_file)"
    fi
}

# ── Banner ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  🛑 ${BOLD}Stopping AI 3D Studio Services${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Stop services in reverse order ─────────────────────────────────────────
kill_service "Frontend" "$FRONTEND_PID_FILE"
kill_service "Celery Worker" "$WORKER_PID_FILE"
kill_service "Backend API" "$API_PID_FILE"

echo ""
log "All services stopped"
echo ""
