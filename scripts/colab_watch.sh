#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  AI 3D Studio — Colab Service Watchdog (auto-restart)                    ║
# ╚══════════════════════════════════════════════════════════════════════════╝
#
# Colab kills background processes during idle/runtime cleanup, so the API,
# Celery worker, and Frontend can die minutes after colab.sh returns.
#
# This watchdog runs INDEFINITELY in the Colab terminal and auto-restarts
# any service that goes down, so the user never has to manually keep the
# notebook alive or re-run anything.
#
# Usage (run ONCE in the Colab terminal):
#     bash scripts/colab_watch.sh
#
# Stop:
#     bash scripts/colab.sh --stop
#
# The watchdog is a child of the terminal session, so it survives colab.sh
# returning. It writes its PID to .pids/watchdog.pid so --stop can clean up.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_DIR="${PROJECT_ROOT}/.pids"
LOG_DIR="${PROJECT_ROOT}/logs"
PYTHON_BIN="${PROJECT_ROOT}/backend/.venv/bin/python"
CHECK_INTERVAL="${COLAB_WATCH_INTERVAL:-20}"

mkdir -p "$PID_DIR" "$LOG_DIR"

red='\033[0;31m'; green='\033[0;32m'; yellow='\033[0;33m'; nc='\033[0m'
log()  { echo -e "${green}[watchdog]${nc} $*"; }
warn() { echo -e "${yellow}[watchdog]${nc} $*"; }
err()  { echo -e "${red}[watchdog]${nc} ✗ $*"; }

write_pid() { echo "$2" > "$1"; }

# ── Service definitions: name -> (health_url, restart_command) ────────────
# Each restart is run in its own subshell with a timeout so a hung build can't
# block the watchdog loop.
restart_api() {
    (
        cd "${PROJECT_ROOT}/backend"
        set -a; source "${PROJECT_ROOT}/.env" 2>/dev/null || true; set +a
        nohup "$PYTHON_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 \
            > "$LOG_DIR/api.log" 2>&1 &
        write_pid "$PID_DIR/api.pid" $!
    )
}

restart_worker() {
    (
        cd "${PROJECT_ROOT}/backend"
        set -a; source "${PROJECT_ROOT}/.env" 2>/dev/null || true; set +a
        nohup "$PYTHON_BIN" -m celery -A app.workers.celery_app worker \
            --loglevel=info --concurrency=1 -B -Q generation,images \
            > "$LOG_DIR/worker.log" 2>&1 &
        write_pid "$PID_DIR/worker.pid" $!
    )
}

restart_frontend() {
    # next.config.ts uses output: 'standalone', so the server is
    # .next/standalone/server.js — `npm start` does NOT work with that
    # config and exits immediately. Build first if needed, then run the
    # standalone server directly.
    if [[ ! -d "${PROJECT_ROOT}/.next/standalone" ]]; then
        ( cd "$PROJECT_ROOT" && npm run build > "$LOG_DIR/frontend_build.log" 2>&1 ) || true
    fi
    (
        cd "${PROJECT_ROOT}"
        export NEXT_PUBLIC_API_URL=http://localhost:8000
        if [[ -f "${PROJECT_ROOT}/.next/standalone/server.js" ]]; then
            nohup node .next/standalone/server.js > "$LOG_DIR/frontend.log" 2>&1 &
        else
            nohup npm start > "$LOG_DIR/frontend.log" 2>&1 &
        fi
        write_pid "$PID_DIR/frontend.pid" $!
    )
}

is_alive() {
    local port="$1"
    curl -sf "http://127.0.0.1:${port}/" >/dev/null 2>&1
}

# ── Main loop ──────────────────────────────────────────────────────────────
log "Watchdog started — checking services every ${CHECK_INTERVAL}s"
log "Stop with: bash scripts/colab.sh --stop"

# Give services a moment to come up before the first check.
sleep 5

while true; do
    restarted_any=false

    if ! is_alive 8000; then
        warn "API down — restarting..."
        restart_api
        restarted_any=true
    fi
    if ! is_alive 3000; then
        warn "Frontend down — restarting..."
        restart_frontend
        restarted_any=true
    fi
    # Celery has no HTTP endpoint; check the PID file instead.
    if [[ ! -f "$PID_DIR/worker.pid" ]] || ! kill -0 "$(cat "$PID_DIR/worker.pid" 2>/dev/null)" 2>/dev/null; then
        warn "Celery worker down — restarting..."
        restart_worker
        restarted_any=true
    fi

    if [[ "$restarted_any" == "true" ]]; then
        log "Restart complete; continuing to monitor."
    fi

    sleep "$CHECK_INTERVAL"
done