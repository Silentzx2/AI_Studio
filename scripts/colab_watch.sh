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

free_port() {
    local port=$1
    [[ -n "$port" ]] || return 0
    if command -v fuser >/dev/null 2>&1; then
        fuser -k -TERM "${port}/tcp" 2>/dev/null || true
        for _ in {1..10}; do
            fuser "${port}/tcp" >/dev/null 2>&1 || break
            sleep 0.2
        done
        if fuser "${port}/tcp" >/dev/null 2>&1; then
            fuser -k -KILL "${port}/tcp" 2>/dev/null || true
        fi
    elif command -v lsof >/dev/null 2>&1; then
        local port_pids
        port_pids="$(lsof -ti :"${port}" 2>/dev/null || true)"
        if [[ -n "$port_pids" ]]; then
            echo "$port_pids" | xargs -r kill -9 2>/dev/null || true
        fi
    fi
}

stop_pid() {
    local service="$1"
    local pid
    pid="$(pid_of "$service")"
    if pid_alive "$pid"; then
        log "Stopping ${service} (PID ${pid})..."
        kill -TERM "$pid" 2>/dev/null || true
        for _ in {1..15}; do
            pid_alive "$pid" || break
            sleep 0.2
        done
        if pid_alive "$pid"; then
            warn "${service} did not exit gracefully; sending SIGKILL."
            kill -KILL "$pid" 2>/dev/null || true
        fi
    fi
    clear_pid "$service"

    case "$service" in
        frontend)
            pkill -TERM -f "next start" 2>/dev/null || true
            pkill -TERM -f "next-server" 2>/dev/null || true
            free_port 3000
            ;;
        api)
            pkill -TERM -f "uvicorn app.main:app" 2>/dev/null || true
            free_port 8000
            ;;
        worker)
            pkill -TERM -f "celery.*app.workers.celery_app" 2>/dev/null || true
            ;;
    esac
}

wait_http() {
    local url="$1"
    local timeout="${2:-60}"
    local started
    started="$(date +%s)"
    while true; do
        if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
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
    free_port 8000
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
            --pool=solo \
            --concurrency=1 \
            -Q generation,images
    ) >> "${LOG_DIR}/worker.log" 2>&1 &
    write_pid worker "$!"

    # Celery has no application HTTP endpoint. Require the expected worker
    # process to remain alive through an initialization window.
    for _ in {1..30}; do
        local pid
        pid="$(pid_of worker)"
        if [[ "$pid" =~ ^[0-9]+$ ]] && pid_alive "$pid"; then
            local cmd
            cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
            if [[ "$cmd" == *"celery"* || "$cmd" == *"python"* || "$cmd" == *"[celeryd"* ]]; then
                log "Celery worker alive (PID ${pid})"
                return 0
            fi
        fi
        sleep 1
    done

    err "Celery worker failed to remain alive. Check logs/worker.log"
    return 1
}

start_frontend() {
    stop_pid frontend
    free_port 3000

    # Normal Next.js production workflow: `npm run build` then `npm start`.
    local needs_build=false
    if [[ ! -d "${PROJECT_ROOT}/.next" ]] || [[ ! -f "${PROJECT_ROOT}/.next/BUILD_ID" ]]; then
        needs_build=true
    elif [[ -n $(find "${PROJECT_ROOT}/app" "${PROJECT_ROOT}/services" "${PROJECT_ROOT}/features" "${PROJECT_ROOT}/components" "${PROJECT_ROOT}/hooks" "${PROJECT_ROOT}/lib" -newer "${PROJECT_ROOT}/.next/BUILD_ID" -type f 2>/dev/null | head -1) ]]; then
        needs_build=true
    fi

    if [[ "$needs_build" == "true" ]]; then
        info "Frontend build missing or source changed; building..."
        if ! (
            cd "${PROJECT_ROOT}" &&
            npm run build > "${LOG_DIR}/frontend_build.log" 2>&1
        ); then
            err "Frontend build failed. Check logs/frontend_build.log"
            return 1
        fi
    fi

    : > "${LOG_DIR}/frontend.log"
    info "Starting Next.js production server (npm start)..."
    (
        cd "${PROJECT_ROOT}" || exit 1
        export HOSTNAME="$FRONTEND_HOST"
        export PORT=3000
        # In Colab/native environments, Docker hostname 'api' is not resolvable
        local effective_backend_url="${BACKEND_URL:-http://127.0.0.1:8000}"
        if [[ "$effective_backend_url" == *"api:8000"* ]]; then
            effective_backend_url="http://127.0.0.1:8000"
        fi
        export BACKEND_URL="$effective_backend_url"
        export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-}"
        exec npm start
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
    local pid
    pid="$(pid_of api)"
    [[ "$pid" =~ ^[0-9]+$ ]] && pid_alive "$pid" || return 1
    curl -fsS --max-time 10 "http://127.0.0.1:8000/api/v1/health" >/dev/null 2>&1
}

frontend_healthy() {
    local pid
    pid="$(pid_of frontend)"
    [[ "$pid" =~ ^[0-9]+$ ]] && pid_alive "$pid" || return 1
    curl -fsS --max-time 10 "http://127.0.0.1:3000/" >/dev/null 2>&1
}

worker_healthy() {
    local pid
    pid="$(pid_of worker)"
    [[ "$pid" =~ ^[0-9]+$ ]] || return 1
    pid_alive "$pid" || return 1
    local cmd
    cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    [[ "$cmd" == *"celery"* || "$cmd" == *"python"* || "$cmd" == *"[celeryd"* ]]
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
    rm -f "$SUPERVISOR_PID_FILE"
    log "Supervisor stopped (monitored services continue running)."
    exit 0
}

trap cleanup INT TERM

# If a stale foreground supervisor is already running, don't silently create a
# second one. PID file records this supervisor's PID.
SUPERVISOR_PID_FILE="${PID_DIR}/supervisor.pid"
if [[ -f "$SUPERVISOR_PID_FILE" ]]; then
    old_pid="$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null || true)"
    if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null && [[ "$old_pid" != "$$" ]]; then
        if [[ "${1:-}" == "--foreground" ]]; then
            info "Stopping existing supervisor (PID ${old_pid}) to take over in foreground..."
            kill -TERM "$old_pid" 2>/dev/null || true
            for _ in {1..15}; do
                kill -0 "$old_pid" 2>/dev/null || break
                sleep 0.2
            done
            kill -KILL "$old_pid" 2>/dev/null || true
            rm -f "$SUPERVISOR_PID_FILE"
        else
            warn "Supervisor already running (PID ${old_pid})."
            exit 0
        fi
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

# Continuous foreground supervision with consecutive failure cushion.
api_fails=0
worker_fails=0
frontend_fails=0
MAX_CONSECUTIVE_FAILS=36

while true; do
    api_ok=false
    worker_ok=false
    frontend_ok=false

    apid; apid="$(pid_of api)"
    if [[ "$apid" =~ ^[0-9]+$ ]] && ! pid_alive "$apid"; then
        warn "FastAPI process exited unexpectedly (PID ${apid}) — restarting immediately."
        api_fails=0
        restart_with_backoff api || true
    elif api_healthy; then
        api_ok=true
        api_fails=0
        reset_restart_count_when_healthy api
    else
        api_fails=$((api_fails + 1))
        if (( api_fails >= MAX_CONSECUTIVE_FAILS )); then
            warn "FastAPI unresponsive for ${api_fails} consecutive checks — triggering restart."
            api_fails=0
            restart_with_backoff api || true
        else
            warn "FastAPI health check delayed under load (${api_fails}/${MAX_CONSECUTIVE_FAILS}); process alive (PID ${apid:-none})."
        fi
    fi

    wpid; wpid="$(pid_of worker)"
    if [[ "$wpid" =~ ^[0-9]+$ ]] && ! pid_alive "$wpid"; then
        warn "Celery worker process exited unexpectedly (PID ${wpid}) — restarting immediately."
        worker_fails=0
        restart_with_backoff worker || true
    elif worker_healthy; then
        worker_ok=true
        worker_fails=0
        reset_restart_count_when_healthy worker
    else
        worker_fails=$((worker_fails + 1))
        if (( worker_fails >= MAX_CONSECUTIVE_FAILS )); then
            warn "Celery worker unresponsive for ${worker_fails} consecutive checks — triggering restart."
            worker_fails=0
            restart_with_backoff worker || true
        else
            warn "Celery worker check missed under load (${worker_fails}/${MAX_CONSECUTIVE_FAILS}); process alive (PID ${wpid:-none})."
        fi
    fi

    fpid; fpid="$(pid_of frontend)"
    if [[ "$fpid" =~ ^[0-9]+$ ]] && ! pid_alive "$fpid"; then
        warn "Frontend process exited unexpectedly (PID ${fpid}) — restarting immediately."
        frontend_fails=0
        restart_with_backoff frontend || true
    elif frontend_healthy; then
        frontend_ok=true
        frontend_fails=0
        reset_restart_count_when_healthy frontend
    else
        frontend_fails=$((frontend_fails + 1))
        if (( frontend_fails >= MAX_CONSECUTIVE_FAILS )); then
            warn "Frontend unresponsive for ${frontend_fails} consecutive checks — triggering restart."
            frontend_fails=0
            restart_with_backoff frontend || true
        else
            warn "Frontend health check delayed under load (${frontend_fails}/${MAX_CONSECUTIVE_FAILS}); process alive (PID ${fpid:-none})."
        fi
    fi

    if [[ "$api_ok" == "true" && "$worker_ok" == "true" && "$frontend_ok" == "true" ]]; then
        printf '[SUPERVISOR] %s — API:OK  Celery:OK  Frontend:OK\n' "$(date '+%H:%M:%S')"
    fi

    sleep "$CHECK_INTERVAL"
done
