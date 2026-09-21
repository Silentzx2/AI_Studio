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


# ── Ensure uv is available (hard dependency for venv + per-model installs) ──
if ! command -v uv &>/dev/null; then
    info "uv not found — installing (required for backend + model venvs)..."
    curl -LsSf https://astral.sh/uv/install.sh | sh || {
        err "Failed to install uv. Install manually: https://docs.astral.sh/uv/"
        exit 1
    }
    export PATH="$HOME/.local/bin:$PATH"
    # Also expose on default PATH for future sessions
    if [[ -f "$HOME/.local/bin/uv" ]] && [[ ! -e /usr/local/bin/uv ]]; then
        ln -sf "$HOME/.local/bin/uv" /usr/local/bin/uv 2>/dev/null || true
    fi
    log "uv installed: $(uv --version)"
fi

# ── Environment Detection ──────────────────────────────────────────

detect_environment() {
    if [[ -n "${CODESPACES:-}" || -n "${GITHUB_CODESPACE_NAME:-}" ]]; then
        echo "codespaces"
    elif [[ -n "${NB_SESSION_ID:-}" || -n "${JUPYTER_BASE_URL:-}" || -d "/home/jovyan" ]]; then
        echo "cloud-notebook"
    elif [[ -n "${KUBERNETES_SERVICE_HOST:-}" || -n "${CONTAINER_NAME:-}" ]]; then
        echo "container"
    else
        echo "local"
    fi
}

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

# ── Auto-bootstrap for cloud environments ──────────────────

auto_bootstrap() {
    local env_type
    env_type=$(detect_environment)

    if [[ "$env_type" == "local" ]]; then
        return 0
    fi

    step "Auto-bootstrap for ${env_type} environment..."

    # Install uv if missing
    if ! command -v uv &>/dev/null; then
        info "Installing uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh || {
            err "Failed to install uv. Install manually: https://docs.astral.sh/uv/"
            exit 1
        }
        export PATH="$HOME/.local/bin:$PATH"
        if [[ -f "$HOME/.local/bin/uv" ]] && [[ ! -e /usr/local/bin/uv ]]; then
            ln -sf "$HOME/.local/bin/uv" /usr/local/bin/uv 2>/dev/null || true
        fi
        log "uv installed: $(uv --version)"
    fi

    # Resolve base Python binary safely without tripping set -o pipefail
    local clean_path py_bin cand cand_path
    clean_path=$(echo "$PATH" | tr ':' '\n' | grep -v '^/commands' | tr '\n' ':' | sed 's/:$//')
    py_bin=""
    for cand in python3.12 python3.11 python3.10 python3 python; do
        cand_path=$(PATH="$clean_path" command -v "$cand" 2>/dev/null || true)
        if [[ -n "$cand_path" && -x "$cand_path" ]]; then
            py_bin="$cand_path"
            break
        fi
    done
    if [[ -z "$py_bin" ]]; then
        for cand in python3.12 python3.11 python3.10 python3 python; do
            cand_path=$(command -v "$cand" 2>/dev/null || true)
            if [[ -n "$cand_path" && -x "$cand_path" ]]; then
                py_bin="$cand_path"
                break
            fi
        done
    fi
    py_bin="${py_bin:-python3}"

    # Ensure backend venv exists using normal Python venv method (clear and recreate if corrupted)
    if [[ ! -x backend/.venv/bin/python ]]; then
        if [[ -d backend/.venv ]]; then
            warn "Existing backend/.venv is corrupted — removing..."
            rm -rf backend/.venv
        fi
        info "Creating backend virtual environment using Python venv ($py_bin)..."
        "$py_bin" -m venv backend/.venv || "$py_bin" -c "import venv; venv.create('backend/.venv', with_pip=True)" || uv venv backend/.venv || {
            err "Failed to create backend venv"
            exit 1
        }
        log "Backend venv created"
    fi

    # Install backend deps if needed
    if [[ -f backend/requirements.txt ]] && [[ -x backend/.venv/bin/python ]]; then
        # Explicitly activate before installing anything
        # shellcheck disable=SC1091
        source backend/.venv/bin/activate

        # Verify activation
        info "Verifying virtual environment activation:"
        info "  which python: $(which python)"
        info "  which pip:    $(which pip)"
        local actual_prefix expected_prefix
        actual_prefix=$(python -c "import sys; print(sys.prefix)")
        info "  sys.prefix:   $actual_prefix"
        expected_prefix="$(cd backend/.venv && pwd)"
        if [[ "$actual_prefix" != "$expected_prefix" ]]; then
            err "Virtual environment verification failed: sys.prefix ($actual_prefix) != expected ($expected_prefix)"
            deactivate 2>/dev/null || true
            exit 1
        fi

        info "Installing backend dependencies..."
        local gpu_type
        gpu_type=$(detect_gpu)
        if [[ "$gpu_type" == "gpu" ]]; then
            uv pip install --python backend/.venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
                --index-url https://download.pytorch.org/whl/cu121 -q 2>/dev/null || {
                err "PyTorch CUDA install failed; refusing to continue with a CPU fallback on a GPU host."
                deactivate 2>/dev/null || true
                exit 1
            }
        else
            uv pip install --python backend/.venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
                --index-url https://download.pytorch.org/whl/cpu -q 2>/dev/null || {
                err "PyTorch CPU install failed"
                deactivate 2>/dev/null || true
                exit 1
            }
        fi

        uv pip install --python backend/.venv/bin/python pyyaml packaging -q 2>/dev/null || true
        uv pip install --python backend/.venv/bin/python -r backend/requirements.txt -q 2>/dev/null || {
            err "Backend dependency installation failed"
            deactivate 2>/dev/null || true
            exit 1
        }
        if ! python -c 'import fastapi, sqlalchemy, asyncpg, trimesh, yaml' >/dev/null 2>&1; then
            err "Core backend imports failed after dependency installation"
            deactivate 2>/dev/null || true
            exit 1
        fi
        log "Backend dependencies verified"
        deactivate 2>/dev/null || true
    fi

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
}

# ── Run auto-bootstrap then load .env ──────────────────────
auto_bootstrap

# ── Load .env ──────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
    warn "No .env found — running auto-setup..."
    if [[ -f scripts/setup.sh ]]; then
        bash scripts/setup.sh || { err "Auto-setup failed. Run: bash scripts/setup.sh"; exit 1; }
    else
        err "No .env found and scripts/setup.sh missing — cannot bootstrap."
        exit 1
    fi
fi
set -a
source .env
set +a

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

# ── Ensure Python venv exists ─────────────────────────────────────────────
if [[ ! -x backend/.venv/bin/python ]]; then
    if [[ -n "${CONDA_PREFIX:-}" && -x "${CONDA_PREFIX}/bin/python" ]]; then
        ln -sf "${CONDA_PREFIX}" backend/.venv
    elif [[ -x "/home/zeus/miniconda3/envs/cloudspace/bin/python" ]]; then
        ln -sf "/home/zeus/miniconda3/envs/cloudspace" backend/.venv
    else
        warn "Backend virtual environment not found — running first-time setup..."
        if [[ -f scripts/setup.sh ]]; then
            bash scripts/setup.sh || { err "Auto-setup failed. Run: bash scripts/setup.sh"; exit 1; }
        else
            err "Backend venv not found and scripts/setup.sh missing — cannot bootstrap."
            exit 1
        fi
    fi
fi

PYTHON_BIN="${PROJECT_ROOT}/backend/.venv/bin/python"
UVICORN_BIN="${PROJECT_ROOT}/backend/.venv/bin/uvicorn"

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


# ── Clean stale per-model install locks ─────────────────────────────────────
# Remove orphaned .installing.lock files left by interrupted installs (no .git)
# so re-installs aren't blocked by a dead lock.
$PYTHON_BIN 2>/dev/null << 'PYEOF' || true
import os, glob
root = os.environ.get("PROJECT_ROOT", ".")
tp = os.path.join(root, "backend", "third_party")
for lock in glob.glob(os.path.join(tp, "*", ".installing.lock")):
    repo = os.path.dirname(lock)
    if not os.path.exists(os.path.join(repo, ".git")):
        try:
            os.remove(lock)
        except OSError:
            pass
PYEOF
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

   # ── Step 2: Verify Database Schema ───────────────────────────────────────
   step "2/5 Verifying database schema..."
   (
       cd backend
       $PYTHON_BIN -c "
   import asyncio
   from app.database import engine, Base
   import app.models

   async def init():
       async with engine.begin() as conn:
           await conn.run_sync(Base.metadata.create_all)

   asyncio.run(init())
   " 2>/dev/null && log "Database schema ready" || warn "Database verification warning"
   )
   echo ""

# ── Clean up Python bytecode caches (__pycache__ / *.pyc) ─────────
info "Cleaning Python bytecode caches..."
find "${PROJECT_ROOT}/backend" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "${PROJECT_ROOT}/backend" -type f -name "*.py[co]" -delete 2>/dev/null || true
log "Bytecode caches cleaned"

# ── Step 3: Start Backend API ──────────────────────────────────────────────
   step "3/4 Starting Backend API (http://localhost:8000)..."
   : > "$PROJECT_ROOT/logs/api.log"
   (
       cd backend
       setsid $PYTHON_BIN -m uvicorn api.main_singleworker:app \
           --host 0.0.0.0 \
           --port 8000 \
           --log-level info \
           >> "$PROJECT_ROOT/logs/api.log" 2>&1 &
       write_pid "$API_PID_FILE" $!
   )
   log "Backend API started (PID: $(cat $API_PID_FILE))"

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
