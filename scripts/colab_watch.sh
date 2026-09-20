#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# AI 3D Studio — Colab Foreground Service Supervisor
#
# Purpose:
#   Keep the application service supervisor attached to the Colab terminal
#   while independently recovering ComfyUI, FastAPI, and Next.js failures.
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
        comfyui)
            pkill -TERM -f "ENGINE/ComfyUI/main.py" 2>/dev/null || true
            free_port 8188
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

patch_runtime_compatibility() {
    "$PYTHON_BIN" -c "
import os, sys, glob, typing
# 1. Patch PyTorch infer_schema for Python 3.12 GenericAlias (list[int] -> typing.List[int])
try:
    import torch._library.infer_schema as m
    p = m.__file__
    with open(p, 'r') as f:
        c = f.read()
    if 'GENERIC_ALIAS_WORKAROUND' not in c:
        c = c.replace(
            'annotation_type, _ = unstringify_type(param.annotation)',
            '''annotation_type, _ = unstringify_type(param.annotation)
        # GENERIC_ALIAS_WORKAROUND
        if typing.get_origin(annotation_type) is list:
            _args = typing.get_args(annotation_type)
            if _args:
                annotation_type = typing.List[_args]'''
        )
        with open(p, 'w') as f:
            f.write(c)
except Exception:
    pass

# 2. Patch comfy_kitchen eager ops for typing compatibility
for site in sys.path:
    for f in glob.glob(os.path.join(site, 'comfy_kitchen/backends/eager/*.py')):
        try:
            with open(f, 'r') as fp:
                c = fp.read()
            if ': list[' in c:
                c = c.replace(': list[int]', ': typing.Sequence[int]').replace(': list[bool]', ': typing.Sequence[bool]')
                if 'import typing' not in c:
                    c = 'import typing\n' + c
                with open(f, 'w') as fp:
                    fp.write(c)
        except Exception:
            pass
" 2>/dev/null || true

    # 3. Ensure pytorch3d binary wheel is installed for ComfyUI-3D-Pack
    if ! "$PYTHON_BIN" -c "import pytorch3d" &>/dev/null; then
        echo "[INFO] Installing pre-compiled pytorch3d wheel for Python 3.12..."
        "$PYTHON_BIN" -m pip install -q fvcore iopath || true
        "$PYTHON_BIN" -m pip install -q --no-deps "https://github.com/MiroPsota/torch_packages_builder/releases/download/pytorch3d-0.7.8/pytorch3d-0.7.8%2Bpt2.5.1cu124-cp312-cp312-linux_x86_64.whl" || true
    fi

    # 4. Guard TriplaneGaussian and Unique3D imports in ComfyUI-3D-Pack nodes.py
    for pack_nodes in "${PROJECT_ROOT}/ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/nodes.py" "/content/AI_Studio/ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/nodes.py"; do
        if [[ -f "$pack_nodes" ]]; then
            "$PYTHON_BIN" -c "
p = '${pack_nodes}'
with open(p, 'r') as f:
    c = f.read()
if 'from TriplaneGaussian.triplane_gaussian_transformers import TGS' in c:
    c = c.replace(
        'from TriplaneGaussian.triplane_gaussian_transformers import TGS',
        'try:\n    from TriplaneGaussian.triplane_gaussian_transformers import TGS'
    ).replace(
        'from TriplaneGaussian.utils.misc import todevice, get_device',
        'from TriplaneGaussian.utils.misc import todevice, get_device\nexcept Exception:\n    TGS = None; ExperimentConfigTGS = None; load_config_tgs = None; CustomImageOrbitDataset = None; todevice = None; get_device = None'
    )
if 'from Unique3D.custum_3d_diffusion.custum_pipeline.unifield_pipeline_img2mvimg import StableDiffusionImage2MVCustomPipeline' in c:
    c = c.replace(
        'from Unique3D.custum_3d_diffusion.custum_pipeline.unifield_pipeline_img2mvimg import StableDiffusionImage2MVCustomPipeline',
        'try:\n    from Unique3D.custum_3d_diffusion.custum_pipeline.unifield_pipeline_img2mvimg import StableDiffusionImage2MVCustomPipeline'
    ).replace(
        'from Unique3D.mesh_reconstruction.refine import run_mesh_refine',
        'from Unique3D.mesh_reconstruction.refine import run_mesh_refine\nexcept Exception:\n    StableDiffusionImage2MVCustomPipeline = None'
    )
with open(p, 'w') as f:
    f.write(c)
" 2>/dev/null || true
        fi
    done
}

start_comfyui() {
    stop_pid comfyui
    free_port 8188
    : > "${LOG_DIR}/comfyui.log"
    info "Starting ComfyUI Execution Engine..."
    patch_runtime_compatibility
    local COMFY_ARGS="--listen 0.0.0.0 --port 8188 --enable-compress-response-body --mmap-torch-files"
    if ! command -v nvidia-smi &>/dev/null || ! nvidia-smi &>/dev/null; then
        COMFY_ARGS="$COMFY_ARGS --cpu --use-split-cross-attention"
    else
        COMFY_ARGS="$COMFY_ARGS --async-offload 2"
    fi
    (
        cd "${PROJECT_ROOT}" || exit 1
        exec "$PYTHON_BIN" ENGINE/ComfyUI/main.py $COMFY_ARGS
    ) >> "${LOG_DIR}/comfyui.log" 2>&1 &
    write_pid comfyui "$!"

    if wait_http "http://127.0.0.1:8188/system_stats" 60; then
        log "ComfyUI healthy (PID $(pid_of comfyui))"
        return 0
    fi

    err "ComfyUI did not become healthy. Check logs/comfyui.log"
    return 1
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

run_bun_or_npm() {
    local bun_cmd="$1"
    local npm_cmd="$2"
    if command -v bun &>/dev/null; then
        eval "$bun_cmd"
    else
        eval "$npm_cmd"
    fi
}

start_frontend() {
    stop_pid frontend
    free_port 3000

    local needs_build=false
    if [[ ! -d "${PROJECT_ROOT}/.next" ]] || [[ ! -f "${PROJECT_ROOT}/.next/BUILD_ID" ]]; then
        needs_build=true
    fi

    if [[ "$needs_build" == "true" ]]; then
        info "Frontend build missing; building..."
        if ! run_bun_or_npm "bun run build > '${LOG_DIR}/frontend_build.log' 2>&1" "npm run build > '${LOG_DIR}/frontend_build.log' 2>&1"; then
            err "Frontend build failed. Check logs/frontend_build.log"
            return 1
        fi
    fi

    : > "${LOG_DIR}/frontend.log"
    info "Starting Next.js production server..."
    (
        cd "${PROJECT_ROOT}" || exit 1
        export HOSTNAME="$FRONTEND_HOST"
        export PORT=3000
        export BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
        if command -v bun &>/dev/null; then
            exec bun start
        else
            exec npm start
        fi
    ) >> "${LOG_DIR}/frontend.log" 2>&1 &
    write_pid frontend "$!"

    if wait_http "http://127.0.0.1:3000/" 60; then
        log "Frontend healthy (PID $(pid_of frontend))"
        return 0
    fi

    err "Frontend did not become healthy. Check logs/frontend.log"
    return 1
}

comfyui_healthy() {
    local pid
    pid="$(pid_of comfyui)"
    [[ "$pid" =~ ^[0-9]+$ ]] && pid_alive "$pid" || return 1
    curl -fsS --max-time 10 "http://127.0.0.1:8188/system_stats" >/dev/null 2>&1
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
        comfyui) start_comfyui ;;
        api) start_api ;;
        frontend) start_frontend ;;
    esac
}

reset_restart_count_when_healthy() {
    local service="$1"
    local f="${PID_DIR}/${service}.restart-count"
    [[ -f "$f" ]] || return 0
    local count
    count="$(cat "$f" 2>/dev/null || echo 0)"
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

if [[ "${1:-}" != "--foreground" && "${1:-}" != "" ]]; then
    echo "Usage: bash scripts/colab_watch.sh [--foreground]"
    exit 2
fi

log "Foreground Colab supervisor started (PID $$, interval ${CHECK_INTERVAL}s)."
log "The Colab terminal remains attached while the application is running."

# Ensure services are healthy
if ! comfyui_healthy; then
    start_comfyui || warn "ComfyUI start failed; supervisor will retry."
else
    log "ComfyUI already healthy (PID $(pid_of comfyui))"
fi

if ! api_healthy; then
    start_api || warn "API start failed; supervisor will retry."
else
    log "FastAPI already healthy (PID $(pid_of api))"
fi

if ! frontend_healthy; then
    start_frontend || warn "Frontend start failed; supervisor will retry."
else
    log "Frontend already healthy (PID $(pid_of frontend))"
fi

comfyui_fails=0
api_fails=0
frontend_fails=0
MAX_CONSECUTIVE_FAILS=36

while true; do
    comfyui_ok=false
    api_ok=false
    frontend_ok=false

    # Check ComfyUI
    cpid="$(pid_of comfyui)"
    if [[ "$cpid" =~ ^[0-9]+$ ]] && ! pid_alive "$cpid"; then
        warn "ComfyUI process exited unexpectedly (PID ${cpid}) — restarting immediately."
        comfyui_fails=0
        restart_with_backoff comfyui || true
    elif comfyui_healthy; then
        comfyui_ok=true
        comfyui_fails=0
        reset_restart_count_when_healthy comfyui
    else
        comfyui_fails=$((comfyui_fails + 1))
        if (( comfyui_fails >= MAX_CONSECUTIVE_FAILS )); then
            warn "ComfyUI unresponsive for ${comfyui_fails} consecutive checks — triggering restart."
            comfyui_fails=0
            restart_with_backoff comfyui || true
        fi
    fi

    # Check API
    apid="$(pid_of api)"
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
        fi
    fi

    # Check Frontend
    fpid="$(pid_of frontend)"
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
        fi
    fi

    if [[ "$comfyui_ok" == "true" && "$api_ok" == "true" && "$frontend_ok" == "true" ]]; then
        printf '[SUPERVISOR] %s — ComfyUI:OK  API:OK  Frontend:OK\n' "$(date '+%H:%M:%S')"
    fi

    sleep "$CHECK_INTERVAL"
done
