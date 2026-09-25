#!/bin/bash

# Multi-Worker Deployment Script for 3D Generative Models Backend
# This script starts both the scheduler service and multiple FastAPI workers
#
# Usage:
#   ./scripts/run_multiworker.sh [OPTIONS]
#
# Options:
#   --user-auth-enabled     Enable user authentication (default: false)
#   --debug                 Enable debug mode (default: false)
#   --help                  Show this help message

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
cd "$BACKEND_DIR"

# Auto-copy .env from .env.example if missing and load it
if [[ ! -f "$PROJECT_ROOT/.env" && -f "$PROJECT_ROOT/.env.example" ]]; then
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
fi
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/.env"
    set +a
    # Unset empty or whitespace-only tokens so torch.hub and huggingface_hub don't fail with HTTP 401 Unauthorized
    [[ -z "${GITHUB_TOKEN:-}" || -z "${GITHUB_TOKEN// /}" ]] && unset GITHUB_TOKEN
    [[ -z "${GH_TOKEN:-}" || -z "${GH_TOKEN// /}" ]] && unset GH_TOKEN
    [[ -z "${HF_TOKEN:-}" || -z "${HF_TOKEN// /}" ]] && unset HF_TOKEN
    [[ -z "${HUGGINGFACE_TOKEN:-}" || -z "${HUGGINGFACE_TOKEN// /}" ]] && unset HUGGINGFACE_TOKEN
fi

# Parse command line arguments
USER_AUTH_ENABLED="false"
DEBUG_MODE="false"

while [[ $# -gt 0 ]]; do
    case $1 in
        --user-auth-enabled)
            USER_AUTH_ENABLED="true"
            shift
            ;;
        --debug)
            DEBUG_MODE="true"
            shift
            ;;
        --workers)
            CLI_WORKERS="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --workers N             Number of API workers (VPS: 4, Colab: 1)"
            echo "  --user-auth-enabled     Enable user authentication (default: false)"
            echo "  --debug                 Enable debug mode (default: false)"
            echo "  --help                  Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  P3D_REDIS_URL          Redis connection URL (default: redis://localhost:6379)"
            echo "  P3D_HOST               API host address (default: 0.0.0.0)"
            echo "  P3D_PORT               API port (default: 7842)"
            echo "  P3D_WORKERS            Number of API workers (default: 4)"
            echo "  P3D_LOG_LEVEL          Logging level (default: info)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo "🚀 Starting 3D Generative Models Backend (Multi-Worker Mode)..."
echo ""

# Check if configuration files exist
if [ ! -f "config/system.yaml" ]; then
    echo "❌ Configuration file config/system.yaml not found"
    echo "Please run ./scripts/setup.sh to create configuration files"
    exit 1
fi

if [ ! -f "config/models.yaml" ]; then
    echo "❌ Configuration file config/models.yaml not found"
    echo "Please run ./scripts/setup.sh to create configuration files"
    exit 1
fi

# Set environment variables
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Essential configuration parameters
export P3D_USER_AUTH_ENABLED="$USER_AUTH_ENABLED"
export P3D_DEBUG="$DEBUG_MODE"

# Configuration
REDIS_URL=${P3D_REDIS_URL:-"redis://localhost:6379"}
API_HOST=${P3D_HOST:-"0.0.0.0"}
API_PORT=${P3D_PORT:-7842}

# Worker configuration:
# On Colab (limited 12GB RAM), 1 worker prevents CUDA OOM.
# On VPS / Linux Server (16GB+ RAM), 4 workers handle concurrent API throughput cleanly.
is_colab() {
    [[ -n "${COLAB_GPU:-}" ]] || \
    [[ -n "${COLAB_RELEASE_TAG:-}" ]] || \
    [[ -n "${COLAB_BACKEND_VERSION:-}" ]] || \
    [[ -d "/content" && ! -d "/teamspace" ]] || \
    grep -q -i "colab" /etc/hosts 2>/dev/null || \
    (command -v hostname >/dev/null 2>&1 && hostname 2>/dev/null | grep -q -i "colab")
}

WORKERS_OVERRIDE="${CLI_WORKERS:-${P3D_WORKERS:-${API_WORKERS:-${WORKERS:-}}}}"
if [ -n "$WORKERS_OVERRIDE" ]; then
    API_WORKERS="$WORKERS_OVERRIDE"
elif is_colab; then
    API_WORKERS=1
else
    API_WORKERS=4
fi
export P3D_WORKERS="$API_WORKERS"

LOG_LEVEL=${P3D_LOG_LEVEL:-"info"}

echo "📋 Configuration:"
echo "   Redis URL: $REDIS_URL"
echo "   API Host: $API_HOST"
echo "   API Port: $API_PORT"
echo "   API Workers: $API_WORKERS"
echo "   Log Level: $LOG_LEVEL"
echo "   User Auth: $USER_AUTH_ENABLED"
echo "   Debug Mode: $DEBUG_MODE"
echo ""

# Check if Redis is running
echo "🔍 Checking Redis connection..."
if command -v redis-cli &> /dev/null; then
    if ! redis-cli -u "$REDIS_URL" ping > /dev/null 2>&1; then
        echo "❌ Cannot connect to Redis at $REDIS_URL"
        echo ""
        echo "Please start Redis first:"
        echo "   docker run -d -p 6379:6379 redis:latest"
        echo "   # or"
        echo "   redis-server --daemonize yes"
        exit 1
    fi
    echo "✅ Redis is running"
else
    echo "⚠️  redis-cli not found, skipping Redis check"
fi
echo ""

# Create PID and log directories for tracking processes
PID_DIR="./run"
LOG_DIR="./logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

SCHEDULER_PID_FILE="$PID_DIR/scheduler.pid"
API_PID_FILE="$PID_DIR/api.pid"

# Locate Python binary - strictly prioritize virtual environment (.venv)
PYTHON_BIN=""
for env_path in \
    "$PROJECT_ROOT/.venv/bin/python" \
    "${VIRTUAL_ENV:-}/bin/python" \
    "${CONDA_PREFIX:-}/bin/python" \
    "${CONDA_BASE:-}/envs/3daigc-api/bin/python"; do
    if [ -n "$env_path" ] && [ -x "$env_path" ]; then
        PYTHON_BIN="$env_path"
        break
    fi
done

# If .venv does not exist yet, create it with Python 3.10
if [ -z "$PYTHON_BIN" ]; then
    VENV_DIR="$PROJECT_ROOT/.venv"
    if ! command -v python3.10 >/dev/null 2>&1 && command -v uv >/dev/null 2>&1; then
        echo "🔧 Installing Python 3.10 via uv..."
        uv python install 3.10 || true
    fi
    echo "🔧 Virtual environment not found. Creating at $VENV_DIR with Python 3.10..."
    if command -v uv >/dev/null 2>&1; then
        uv venv "$VENV_DIR" --python 3.10
    elif command -v python3.10 >/dev/null 2>&1; then
        python3.10 -m venv "$VENV_DIR"
    else
        python3 -m venv "$VENV_DIR"
    fi
    if [ -x "$VENV_DIR/bin/python" ]; then
        PYTHON_BIN="$VENV_DIR/bin/python"
    fi
fi

# Fallback to python3 if venv creation/location failed
[ -z "$PYTHON_BIN" ] && PYTHON_BIN="$(command -v python3 || command -v python)"

# ── [CONDA-ORIGINAL] Uncomment below to restore original Conda lookup ──────
# for candidate in "$HOME/miniconda3/bin" "/opt/conda/bin" "$HOME/anaconda3/bin" "/root/miniconda3/bin"; do
#     if [ -x "$candidate/conda" ]; then
#         export PATH="$candidate:$PATH"
#         break
#     fi
# done
# 
# if command -v conda >/dev/null 2>&1; then
#     CONDA_BASE="$(conda info --base 2>/dev/null || true)"
#     if [ -n "$CONDA_BASE" ] && [ -f "$CONDA_BASE/etc/profile.d/conda.sh" ]; then
#         # shellcheck disable=SC1090
#         source "$CONDA_BASE/etc/profile.d/conda.sh" 2>/dev/null || true
#     fi
# fi
# 
# for env_path in \
#     "${CONDA_PREFIX:-}/bin/python" \
#     "${CONDA_BASE:-}/envs/3daigc-api/bin/python" \
#     "$HOME/miniconda3/envs/3daigc-api/bin/python" \
#     "/opt/conda/envs/3daigc-api/bin/python" \
#     "/root/miniconda3/envs/3daigc-api/bin/python"; do
#     if [ -n "$env_path" ] && [ -x "$env_path" ]; then
#         PYTHON_BIN="$env_path"
#         break
#     fi
# done
# 
# if [ -z "$PYTHON_BIN" ] && command -v conda >/dev/null 2>&1; then
#     echo "🔧 Conda env '3daigc-api' not found. Creating with Python 3.10..."
#     conda create -n 3daigc-api python=3.10 -y
#     CONDA_BASE="$(conda info --base 2>/dev/null || true)"
#     PYTHON_BIN="$CONDA_BASE/envs/3daigc-api/bin/python"
# fi
# ── [END CONDA-ORIGINAL] ─────────────────────────────────────────────────────

# If dependencies are missing, install them into the Python 3.10 environment
if ! "$PYTHON_BIN" -c "import pydantic_settings, fastapi, uvicorn, yaml, sqlalchemy, email_validator, trimesh, open3d, torch" >/dev/null 2>&1; then
    echo "⚠️  Installing backend dependencies into $PYTHON_BIN..."
    if command -v uv >/dev/null 2>&1; then
        uv pip install --python "$PYTHON_BIN" -r requirements.txt || true
        uv pip install --python "$PYTHON_BIN" "setuptools<70.0.0" || true
    else
        "$PYTHON_BIN" -m pip install -r requirements.txt 2>/dev/null || true
        "$PYTHON_BIN" -m pip install "setuptools<70.0.0" 2>/dev/null || true
    fi
fi



# Function to cleanup processes on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    
    # Stop API workers
    if [ -f "$API_PID_FILE" ]; then
        API_PID=$(cat "$API_PID_FILE")
        if ps -p "$API_PID" > /dev/null 2>&1; then
            echo "   Stopping API workers (PID: $API_PID)..."
            kill "$API_PID" 2>/dev/null || true
            sleep 2
            if ps -p "$API_PID" > /dev/null 2>&1; then
                kill -9 "$API_PID" 2>/dev/null || true
            fi
        fi
        rm -f "$API_PID_FILE"
    fi
    
    # Stop scheduler service
    if [ -f "$SCHEDULER_PID_FILE" ]; then
        SCHEDULER_PID=$(cat "$SCHEDULER_PID_FILE")
        if ps -p "$SCHEDULER_PID" > /dev/null 2>&1; then
            echo "   Stopping scheduler service (PID: $SCHEDULER_PID)..."
            kill "$SCHEDULER_PID" 2>/dev/null || true
            sleep 2
            if ps -p "$SCHEDULER_PID" > /dev/null 2>&1; then
                kill -9 "$SCHEDULER_PID" 2>/dev/null || true
            fi
        fi
        rm -f "$SCHEDULER_PID_FILE"
    fi
    
    echo "✅ Services stopped"
    exit 0
}

# Set up signal handlers: in background daemon mode (started by start.sh / manager.sh),
# ignore SIGINT so terminal interrupts or Ctrl+C in manager do not shut down backend.
if [ ! -t 0 ]; then
    trap cleanup SIGTERM
    trap '' SIGINT
else
    trap cleanup SIGINT SIGTERM
fi

# Start scheduler service
echo "🔧 Starting scheduler service ($PYTHON_BIN)..."
"$PYTHON_BIN" scripts/scheduler_service.py --redis-url "$REDIS_URL" --log-level "$LOG_LEVEL" > logs/scheduler.log 2>&1 &
SCHEDULER_PID=$!
echo $SCHEDULER_PID > "$SCHEDULER_PID_FILE"
echo "   Scheduler service started (PID: $SCHEDULER_PID)"
echo "   Logs: logs/scheduler.log"

# Wait for scheduler to initialize
echo "   Waiting for scheduler to initialize..."
sleep 4

# Check if scheduler is still running
if ! ps -p "$SCHEDULER_PID" > /dev/null 2>&1; then
    echo "❌ Scheduler service failed to start"
    echo "━━━━━━━━━━━━ Scheduler Log ━━━━━━━━━━━━"
    tail -n 30 logs/scheduler.log 2>/dev/null || true
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cleanup
    exit 1
fi
echo "✅ Scheduler service ready"
echo ""

# Start FastAPI with multiple workers
echo "🌐 Starting FastAPI with $API_WORKERS workers ($PYTHON_BIN -m uvicorn)..."
"$PYTHON_BIN" -m uvicorn api.main_multiworker:app \
    --host "$API_HOST" \
    --port "$API_PORT" \
    --workers "$API_WORKERS" \
    --log-level "$LOG_LEVEL" \
    > logs/api.log 2>&1 &
API_PID=$!
echo $API_PID > "$API_PID_FILE"
echo "   API workers started (PID: $API_PID)"
echo "   Logs: logs/api.log"
echo ""

# Wait for API to initialize
echo "   Waiting for API to initialize..."
sleep 3

# Check if API is still running
if ! ps -p "$API_PID" > /dev/null 2>&1; then
    echo "❌ API workers failed to start"
    echo "━━━━━━━━━━━━ API Log ━━━━━━━━━━━━"
    tail -n 30 logs/api.log 2>/dev/null || true
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cleanup
    exit 1
fi

echo "✅ API workers ready"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "✅ Multi-Worker Deployment Started Successfully!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📊 Service Status:"
echo "   Scheduler Service: Running (PID: $SCHEDULER_PID)"
echo "   API Workers:       Running (PID: $API_PID, $API_WORKERS workers)"
echo ""
echo "🔗 Endpoints:"
echo "   API:     http://$API_HOST:$API_PORT"
echo "   Docs:    http://$API_HOST:$API_PORT/docs"
echo "   Health:  http://$API_HOST:$API_PORT/health"
echo ""
echo "📝 Logs:"
echo "   Scheduler: tail -f logs/scheduler.log"
echo "   API:       tail -f logs/api.log"
echo ""
echo "🛑 To stop services: Press Ctrl+C or run: kill $API_PID $SCHEDULER_PID"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Monitor processes and keep script running
echo "📊 Monitoring services... (Press Ctrl+C to stop)"
echo ""

while true; do
    # Check if scheduler is still running
    if ! ps -p "$SCHEDULER_PID" > /dev/null 2>&1; then
        echo "❌ Scheduler service has stopped unexpectedly!"
        echo "━━━━━━━━━━━━ Scheduler Log Tail ━━━━━━━━━━━━"
        tail -n 40 logs/scheduler.log 2>/dev/null || true
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        cleanup
        exit 1
    fi
    
    # Check if API is still running
    if ! ps -p "$API_PID" > /dev/null 2>&1; then
        echo "❌ API workers have stopped unexpectedly!"
        echo "━━━━━━━━━━━━ API Log Tail ━━━━━━━━━━━━"
        tail -n 40 logs/api.log 2>/dev/null || true
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        cleanup
        exit 1
    fi
    
    # Sleep and check again
    sleep 5
done

