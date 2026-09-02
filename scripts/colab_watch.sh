#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# AI 3D Studio — Colab Foreground Service Supervisor
#
# Purpose:
#   Keep the application service supervisor attached to the Colab terminal
#   while independently recovering FastAPI, Celery, and Next.js failures.
#
# IMPORTANT:
#   This script does NOT attempt to defeat Colab's platform-level runtime
#   lifetime. Its job is application-process supervision while the runtime is
#   alive.
#
# Usage:
#   bash scripts/colab_watch.sh --foreground
#
# The normal colab.sh launcher execs this script automatically after startup.
# ═══════════════════════════════════════════════════════════════════════════

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_DIR="${PROJECT_ROOT}/.pids"
LOG_DIR="${PROJECT_ROOT}/logs"
PYTHON_BIN="${PROJECT_ROOT}/backend/.venv/bin/python"
CHECK_INTERVAL="${COLAB_WATCH_INTERVAL:-10}"

mkdir -p "$PID_DIR" "$LOG_DIR"

# Load project environment once so restarted services receive the same config.
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${PROJECT_ROOT}/.env"
    set +a
fi

# Colab/local runtime should keep the API bound on all interfaces for the
# existing tunnel/port-forwarding workflow.
API_HOST="${AI_STUDIO_API_HOST:-0.0.0.0}"
FRONTEND_HOST="${AI_STUDIO_FRONTEND_HOST:-0.0.0.0}"

red='\033[0;31m'
green='\033[0;32m'
yellow='\033[0;33m'
cyan='\033[0;36m'
nc='\033[0m'

log()  { echo -e "${green}[SUPERVISOR]${nc} $*"; }
info() { echo -e "${cyan}[SUPERVISOR]${nc} $*"; }
warn() { echo -e "${yellow}[SUPERVISOR]${nc} $*"; }
err()  { echo -e "${red}[SUPERVISOR]${nc} ✗ $*"; }

pid_of() {
    local service="$1"
    cat "${PID_DIR}/${service}.pid" 2>/dev/null || true
}

pid_alive() {
    local pid="${1:-}"
    [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

pid_matches() {
    local pid="${1:-}"
    local expected="$2"
    [[ "$pid" =~ ^[0-9]+$ ]] || return 1
    pid_alive "$pid" || return 1
    ps -p "$pid" -o args= 2>/dev/null | grep -F -- "$expected" >/dev/null 2>&1
}

write_pid() {
    local service="$1"
    local pid="$2"
    printf '%s\n' "$pid" > "${PID_DIR}/${service}.pid"
}

clear_pid() {
    rm -f "${PID_DIR}/$1.pid"
}

stop_pid() {
    local service="$1"
    local pid
    pid="$(pid_of "$service")"
    if pid_alive "$pid"; then
        log "Stopping ${service} (PID ${pid})..."
        kill -TERM "$pid" 2>/dev/null || true
        for _ in {1..20}; do
            pid_alive "$pid" || break
            sleep 0.5
        done
        if pid_alive "$pid"; then
            warn "${service} did not exit gracefully; sending SIGKILL."
            kill -KILL "$pid" 2>/dev/null || true
        fi
    fi
    clear_pid "$service"
}

wait_http() {
    local url="$1"
    local timeout="${2:-60}"
    local started
    started="$(date +%s)"
    while true; do
        if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
            return 0
        fi
        if (( $(date +%s) - started >= timeout )); then
            return 1
        fi
        sleep 2
    done
}

start_api() {
    stop_pid api
    : > "${LOG_DIR}/api.log"
    info "Starting FastAPI..."
    (
        cd "${PROJECT_ROOT}/backend" || exit 1
        set -a
        [[ -f ../.env ]] && source ../.env
        set +a
        exec "$PYTHON_BIN" -m uvicorn app.main:app \
            --host "$API_HOST" \
            --port 8000 \
            --log-level info
    ) >> "${LOG_DIR}/api.log" 2>&1 &
    write_pid api "$!"

    if wait_http "http://127.0.0.1:8000/api/v1/health" 60; then
        log "FastAPI healthy (PID $(pid_of api))"
        return 0
    fi

    err "FastAPI did not become healthy. Check logs/api.log"
    return 1
}

start_worker() {
    stop_pid worker
    : > "${LOG_DIR}/worker.log"
    info "Starting Celery worker..."
    (
        cd "${PROJECT_ROOT}/backend" || exit 1
        set -a
        [[ -f ../.env ]] && source ../.env
        set +a
        exec "$PYTHON_BIN" -m celery -A app.workers.celery_app worker \
            --loglevel=info \
            --concurrency=1 \
            -B \
            -Q generation,images
    ) >> "${LOG_DIR}/worker.log" 2>&1 &
    write_pid worker "$!"

    # Celery has no application HTTP endpoint. Require the expected worker
    # process to remain alive through an initialization window.
    for _ in {1..30}; do
        local pid
        pid="$(pid_of worker)"
        if pid_matches "$pid" "celery -A app.workers.celery_app worker"; then
            log "Celery worker alive (PID ${pid})"
            return 0
        fi
        sleep 1
    done

    err "Celery worker failed to remain alive. Check logs/worker.log"
    return 1
}

start_frontend() {
    stop_pid frontend

    # next.config.ts uses output: "standalone". Never fall back to `npm start`
    # here: the standalone server is the deterministic production entrypoint.
    if [[ ! -f "${PROJECT_ROOT}/.next/standalone/server.js" ]]; then
        info "Frontend standalone server missing; building..."
        if ! (
            cd "${PROJECT_ROOT}" &&
            npm run build > "${LOG_DIR}/frontend_build.log" 2>&1
        ); then
            err "Frontend build failed. Check logs/frontend_build.log"
            return 1
        fi
    fi

    : > "${LOG_DIR}/frontend.log"
    info "Starting Next.js standalone server..."
    (
        cd "${PROJECT_ROOT}" || exit 1
        export HOSTNAME="$FRONTEND_HOST"
        export PORT=3000
        export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8000}"
        exec node .next/standalone/server.js
    ) >> "${LOG_DIR}/frontend.log" 2>&1 &
    write_pid frontend "$!"

    if wait_http "http://127.0.0.1:3000/" 60; then
        log "Frontend healthy (PID $(pid_of frontend))"
        return 0
    fi

    err "Frontend did not become healthy. Check logs/frontend.log"
    return 1
}

api_healthy() {
    wait_http "http://127.0.0.1:8000/api/v1/health" 3
}

frontend_healthy() {
    wait_http "http://127.0.0.1:3000/" 3
}

worker_healthy() {
    local pid
    pid="$(pid_of worker)"
    pid_matches "$pid" "celery -A app.workers.celery_app worker"
}

restart_with_backoff() {
    local service="$1"
    local attempt_file="${PID_DIR}/${service}.restart-count"
    local count=0
    if [[ -f "$attempt_file" ]]; then
        count="$(cat "$attempt_file" 2>/dev/null || echo 0)"
    fi
    count=$((count + 1))
    printf '%s\n' "$count" > "$attempt_file"

    local delay=$(( count > 5 ? 30 : count * 3 ))
    warn "${service} unhealthy — restart attempt ${count}; waiting ${delay}s."
    sleep "$delay"

    case "$service" in
        api) start_api ;;
        worker) start_worker ;;
        frontend) start_frontend ;;
    esac
}

reset_restart_count_when_healthy() {
    local service="$1"
    local f="${PID_DIR}/${service}.restart-count"
    [[ -f "$f" ]] || return 0
    local count
    count="$(cat "$f" 2>/dev/null || echo 0)"
    # Keep a small diagnostic count but reset after sustained recovery so a
    # transient restart does not cause permanently increasing backoff.
    if [[ "$count" -gt 0 ]]; then
        rm -f "$f"
    fi
}

cleanup() {
    trap - INT TERM EXIT
    log "Supervisor stopping application services..."
    stop_pid frontend
    stop_pid worker
    stop_pid api
    rm -f \
        "${PID_DIR}/api.restart-count" \
        "${PID_DIR}/worker.restart-count" \
        "${PID_DIR}/frontend.restart-count"
    log "Supervisor stopped."
    exit 0
}

trap cleanup INT TERM

# If a stale foreground supervisor is already running, don't silently create a
# second one. PID file records this supervisor's PID.
SUPERVISOR_PID_FILE="${PID_DIR}/supervisor.pid"
if [[ -f "$SUPERVISOR_PID_FILE" ]]; then
    old_pid="$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null || true)"
    if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null && [[ "$old_pid" != "$$" ]]; then
        warn "Supervisor already running (PID ${old_pid})."
        exit 1
    fi
fi
printf '%s\n' "$$" > "$SUPERVISOR_PID_FILE"
trap 'rm -f "$SUPERVISOR_PID_FILE"' EXIT

# Command line mode. Only --foreground is a valid long-running mode; retaining
# a plain invocation keeps backwards compatibility for manual use.
if [[ "${1:-}" != "--foreground" && "${1:-}" != "" ]]; then
    echo "Usage: bash scripts/colab_watch.sh [--foreground]"
    exit 2
fi

log "Foreground Colab supervisor started (PID $$, interval ${CHECK_INTERVAL}s)."
log "The Colab terminal remains attached while the application is running."

# Ensure any pre-existing service processes are usable before entering the loop.
# Only start a service if it is not already healthy; this avoids unnecessary
# restarts during a normal `colab.sh` bootstrap.
if ! api_healthy; then
    start_api || warn "API start failed; supervisor will retry."
else
    log "FastAPI already healthy (PID $(pid_of api))"
fi

if ! worker_healthy; then
    start_worker || warn "Celery start failed; supervisor will retry."
else
    log "Celery worker already healthy (PID $(pid_of worker))"
fi

if ! frontend_healthy; then
    start_frontend || warn "Frontend start failed; supervisor will retry."
else
    log "Frontend already healthy (PID $(pid_of frontend))"
fi

# Continuous foreground supervision. This is the critical Colab fix: the
# launcher does NOT return while these services are expected to run.
while true; do
    api_ok=false
    worker_ok=false
    frontend_ok=false

    if api_healthy; then
        api_ok=true
        reset_restart_count_when_healthy api
    else
        restart_with_backoff api || true
    fi

    if worker_healthy; then
        worker_ok=true
        reset_restart_count_when_healthy worker
    else
        restart_with_backoff worker || true
    fi

    if frontend_healthy; then
        frontend_ok=true
        reset_restart_count_when_healthy frontend
    else
        restart_with_backoff frontend || true
    fi

    if [[ "$api_ok" == "true" && "$worker_ok" == "true" && "$frontend_ok" == "true" ]]; then
        printf '[SUPERVISOR] %s — API:OK  Celery:OK  Frontend:OK\n' "$(date '+%H:%M:%S')"
    fi

    sleep "$CHECK_INTERVAL"
done
