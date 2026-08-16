#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# AI 3D Studio v3.2 — Startup Script (Non-Docker)
# Starts all services natively:
#   PostgreSQL → Redis → Migrations → Backend API → Celery Worker → Frontend
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
log()   { echo -e "${GREEN}[START]${NC}  $*"; }
info()  { echo -e "${CYAN}[INFO]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}   $*"; }
err()   { echo -e "${RED}[ERROR]${NC}  $*" >&2; }
step()  { echo -e "\n${BOLD}${BLUE}➜ $*${NC}"; }

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

    # Codespaces/cloud notebooks: use SQLite fallback (no systemd)
    if [[ "$env_type" == "codespaces" || "$env_type" == "cloud-notebook" ]]; then
        export USE_SQLITE=1
        warn "${env_type} detected — using SQLite fallback for database and in-process broker for Celery."
    fi

    # Ensure backend venv exists
    if [[ ! -x backend/.venv/bin/python ]]; then
        info "Creating backend virtual environment..."
        uv venv --python 3.12 backend/.venv || {
            err "Failed to create backend venv"
            exit 1
        }
        log "Backend venv created"
    fi

    # Install backend deps if needed
    if [[ -f backend/requirements.txt ]] && [[ -x backend/.venv/bin/python ]]; then
        info "Installing backend dependencies..."
        local gpu_type
        gpu_type=$(detect_gpu)
        if [[ "$gpu_type" == "gpu" ]]; then
            uv pip install --python backend/.venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
                --index-url https://download.pytorch.org/whl/cu121 -q 2>/dev/null || true
        else
            uv pip install --python backend/.venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
                --index-url https://download.pytorch.org/whl/cpu -q 2>/dev/null || true
        fi
        uv pip install --python backend/.venv/bin/python -r backend/requirements.txt -q 2>/dev/null || true
        log "Backend dependencies installed"
    fi

    # Ensure Node.js
    if ! command -v npm &>/dev/null; then
        warn "Node.js/npm not found — attempting to install..."
        if command -v curl &>/dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_20.x 2>/dev/null | sudo bash - 2>/dev/null || true
            sudo apt-get install -y nodejs 2>/dev/null || true
        fi
    fi

    # Ensure frontend deps
    if [[ ! -d node_modules ]]; then
        info "Installing frontend dependencies..."
        npm ci --prefer-offline --no-audit 2>/dev/null || npm install --no-audit 2>/dev/null || true
    fi

    # Ensure storage directories exist
    mkdir -p backend/storage/uploads backend/storage/models backend/storage/thumbnails
    mkdir -p backend/storage/exports backend/storage/images backend/third_party/.hf_cache/hub
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
    warn "Backend virtual environment not found — running first-time setup..."
    if [[ -f scripts/setup.sh ]]; then
        bash scripts/setup.sh || { err "Auto-setup failed. Run: bash scripts/setup.sh"; exit 1; }
    else
        err "Backend venv not found and scripts/setup.sh missing — cannot bootstrap."
        exit 1
    fi
fi

PYTHON_BIN="${PROJECT_ROOT}/backend/.venv/bin/python"
UVICORN_BIN="${PROJECT_ROOT}/backend/.venv/bin/uvicorn"
CELERY_BIN="${PROJECT_ROOT}/backend/.venv/bin/celery"

# ── Ensure Node.js is available ────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
    warn "Node.js/npm not found — attempting to install..."
    if command -v curl &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x 2>/dev/null | sudo bash - 2>/dev/null || true
        sudo apt-get install -y nodejs 2>/dev/null || true
    fi
    if ! command -v npm &>/dev/null; then
        err "Node.js/npm not found and auto-install failed. Run: sudo bash scripts/setup.sh"
        exit 1
    fi
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
WORKER_PID_FILE="$PID_DIR/worker.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
MIGRATE_PID_FILE="$PID_DIR/migrate.pid"

# ── Helper: Kill by PID file ──────────────────────────────────────────────
kill_by_pid_file() {
    local pid_file=$1
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            rm -f "$pid_file"
        fi
    fi
}

# ── Banner ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  🚀 ${BOLD}AI 3D Studio v3.2${NC} — Starting Services (Native)"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Verify PostgreSQL ──────────────────────────────────────────────
step "1/6 Checking PostgreSQL..."
if [[ "${USE_SQLITE:-}" != "1" ]]; then
  if ! systemctl is-active --quiet postgresql; then
    info "Starting PostgreSQL..."
    sudo systemctl start postgresql || {
      err "Failed to start PostgreSQL"
      exit 1
    }
  fi
fi

# Extract DB credentials from .env if available
_DB_USER="${POSTGRES_USER:-postgres}"
_DB_PASS="${POSTGRES_PASSWORD:-postgres}"
_DB_HOST="${POSTGRES_HOST:-localhost}"
_DB_PORT="${POSTGRES_PORT:-5432}"
_DB_NAME="${POSTGRES_DB:-ai3dstudio}"

# Try to parse DATABASE_URL if set
if [[ -n "${DATABASE_URL:-}" ]]; then
  _DB_URL_PARSE="$(echo "$DATABASE_URL" | sed -n 's|^postgresql[+]asyncpg://\([^:]*\):\([^@]*\)@\([^:/]*\):\([0-9]*\)/.*$|\1 \2 \3 \4|p')"
  if [[ -n "$_DB_URL_PARSE" ]]; then
    set -- $_DB_URL_PARSE
    _DB_USER="${1:-$_DB_USER}"
    _DB_PASS="${2:-$_DB_PASS}"
    _DB_HOST="${3:-$_DB_HOST}"
    _DB_PORT="${4:-$_DB_PORT}"
  fi
fi

_PG_READY=false
if [[ "${USE_SQLITE:-}" != "1" ]]; then
  # First check if server is running
  if pg_isready -h "$_DB_HOST" -p "$_DB_PORT" -U "$_DB_USER" &>/dev/null; then
    # Now test actual authentication with the configured password
    if PGPASSWORD="$_DB_PASS" psql -h "$_DB_HOST" -p "$_DB_PORT" -U "$_DB_USER" -d postgres -c "SELECT 1;" &>/dev/null; then
      _PG_READY=true
      log "PostgreSQL authentication successful (user=$_DB_USER, host=$_DB_HOST)"
    else
      warn "PostgreSQL is running but authentication failed for user '$_DB_USER'@$_DB_HOST — falling back to SQLite."
      export USE_SQLITE=1
      export DATABASE_URL="sqlite:///$(pwd)/backend/storage/studio.db"
      export DATABASE_SYNC_URL="sqlite:///$(pwd)/backend/storage/studio.db"
    fi
  else
    warn "PostgreSQL not responding — falling back to local SQLite (backend/storage/studio.db)."
    export USE_SQLITE=1
    export DATABASE_URL="sqlite:///$(pwd)/backend/storage/studio.db"
    export DATABASE_SYNC_URL="sqlite:///$(pwd)/backend/storage/studio.db"
  fi
fi

# Create database if it doesn't exist (only when PostgreSQL is ready)
if [[ "$_PG_READY" == "true" ]]; then
  PGPASSWORD="$_DB_PASS" psql -h "$_DB_HOST" -p "$_DB_PORT" -U "$_DB_USER" -d postgres << 'SQL' 2>/dev/null || true
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'ai3dstudio') THEN
    CREATE DATABASE ai3dstudio;
    RAISE NOTICE 'Created ai3dstudio database';
  ELSE
    RAISE NOTICE 'Database ai3dstudio already exists';
  END IF;
END
$$;
SQL
  log "PostgreSQL ready"
else
  info "Using SQLite for database (no PostgreSQL credentials available)"
  mkdir -p "$(pwd)/backend/storage"
fi
echo ""

# ── Step 2: Verify Redis ───────────────────────────────────────────────────
step "2/6 Checking Redis..."
if ! systemctl is-active --quiet redis-server; then
    info "Starting Redis..."
    sudo systemctl start redis-server || {
        err "Failed to start Redis"
        exit 1
    }
fi

if ! redis-cli ping &>/dev/null; then
    warn "Redis not responding — Celery will run with degraded in-process broker (single worker)."
fi

log "Redis ready"
echo ""

# ── Step 3: Run Migrations ────────────────────────────────────────────────
step "3/6 Running database migrations..."
(
    cd backend
    if $PYTHON_BIN -m alembic upgrade head 2>&1; then
        log "Migrations complete"
    else
        warn "Migrations skipped or failed (may already be applied)"
    fi
)
echo ""

# ── Step 4: Start Backend API ──────────────────────────────────────────────
step "4/6 Starting Backend API (http://localhost:8000)..."
(
    cd backend
    setsid $PYTHON_BIN -m uvicorn app.main:app \
        --host 0.0.0.0 \
        --port 8000 \
        --log-level info \
        > "$PROJECT_ROOT/logs/api.log" 2>&1 &
    write_pid "$API_PID_FILE" $!
)
log "Backend API started (PID: $(cat $API_PID_FILE))"

# Wait for API to be ready
info "Waiting for API to be healthy (timeout: 60s)..."
for i in {1..30}; do
    if curl -sf http://localhost:8000/api/v1/health &>/dev/null; then
        log "API is healthy"
        break
    fi
    echo -n "."
    sleep 2
done
echo ""
echo ""

# Fail loudly if the API never came up (don't leave a half-started stack).
if ! curl -sf http://localhost:8000/api/v1/health &>/dev/null; then
    err "Backend API failed to become healthy. See logs/api.log"
    exit 1
fi

# ── Step 5: Start Celery Worker ────────────────────────────────────────────
step "5/6 Starting Celery Worker..."
(
    cd backend
    setsid $PYTHON_BIN -m celery -A app.workers.celery_app worker \
        --loglevel=info \
        --concurrency=1 \
        -B \
        -Q generation,images \
        > "$PROJECT_ROOT/logs/worker.log" 2>&1 &
    write_pid "$WORKER_PID_FILE" $!
)
log "Celery Worker started (PID: $(cat $WORKER_PID_FILE))"
echo ""

# ── Step 6: Start Frontend ────────────────────────────────────────────────
step "6/6 Starting Frontend (${FRONTEND_LABEL}) — http://localhost:3000..."

# Install deps if needed
if [[ ! -d node_modules ]]; then
    info "Installing npm dependencies..."
    npm ci --prefer-offline --no-audit 2>&1 | grep -E '(added|up to date)' || true
fi

# Dev mode: skip build (hot-reload). Prod mode: build first.
if [[ "$START_MODE" == "production" ]]; then
    info "Building Next.js for production..."
    npm run build 2>&1 | tail -5
    FRONTEND_RUN_CMD="npm start"
else
    # Dev mode — no build step, use next dev
    FRONTEND_RUN_CMD="npm run dev"
fi

# Start frontend
NEXT_PUBLIC_API_URL=http://localhost:8000 setsid $FRONTEND_RUN_CMD \
    > "$PROJECT_ROOT/logs/frontend.log" 2>&1 &
write_pid "$FRONTEND_PID_FILE" $!

log "Frontend started (PID: $(cat $FRONTEND_PID_FILE))"
echo ""

# ── Summary ────────────────────────────────────────────────────────────────
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${GREEN}✅ All Services Started${NC} — mode"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Endpoints:${NC}"
echo -e "    Frontend       http://localhost:3000  (${FRONTEND_LABEL})"
echo -e "    Backend API    http://localhost:8000"
echo -e "    API Docs       http://localhost:8000/docs"
echo ""
echo -e "  ${BOLD}Logs:${NC}"
echo -e "    API      logs/api.log"
echo -e "    Worker   logs/worker.log"
echo -e "    Frontend logs/frontend.log"
echo ""
echo -e "  ${BOLD}Stop services:${NC} bash scripts/stop.sh"
echo ""
