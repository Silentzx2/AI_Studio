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

    # Ensure backend venv exists (clear and recreate if corrupted)
    if [[ ! -x backend/.venv/bin/python ]]; then
        if [[ -d backend/.venv ]]; then
            warn "Existing backend/.venv is corrupted — removing..."
            rm -rf backend/.venv
        fi
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

# ── Step 1: Verify PostgreSQL ──────────────────────────────────────────────
step "1/6 Checking PostgreSQL..."

# Extract DB credentials from .env if available
_DB_USER="${POSTGRES_USER:-ai_studio}"
_DB_PASS="${POSTGRES_PASSWORD:-ai_studio_dev}"
_DB_HOST="${POSTGRES_HOST:-localhost}"
_DB_PORT="${POSTGRES_PORT:-5432}"
_DB_NAME="${POSTGRES_DB:-ai_studio}"

# Try to parse DATABASE_URL if set
if [[ -n "${DATABASE_URL:-}" ]]; then
  _DB_URL_PARSE="$(python3 -c "
import sys
from urllib.parse import urlparse
u = urlparse(sys.argv[1])
if u.username: print(u.username)
if u.password: print(u.password)
if u.hostname: print(u.hostname)
if u.port: print(u.port)
" "$DATABASE_URL" 2>/dev/null)"
  if [[ -n "$_DB_URL_PARSE" ]]; then
    mapfile -t _DB_PARTS <<< "$_DB_URL_PARSE"
    _DB_USER="${_DB_PARTS[0]:-$_DB_USER}"
    _DB_PASS="${_DB_PARTS[1]:-$_DB_PASS}"
    _DB_HOST="${_DB_PARTS[2]:-$_DB_HOST}"
    _DB_PORT="${_DB_PARTS[3]:-$_DB_PORT}"
  fi
fi

# Start PostgreSQL if not running
if ! pg_isready -h "$_DB_HOST" -p "$_DB_PORT" &>/dev/null; then
  info "Starting PostgreSQL..."
  if command -v systemctl &>/dev/null; then
    sudo systemctl start postgresql 2>/dev/null || true
  fi
  # Try direct start if systemctl failed or unavailable
  if ! pg_isready -h "$_DB_HOST" -p "$_DB_PORT" &>/dev/null; then
    sudo service postgresql start 2>/dev/null || sudo pg_ctlcluster $(ls /etc/postgresql/ 2>/dev/null | head -1) main start 2>/dev/null || true
  fi
  sleep 2
fi

# Ensure ai_studio user exists (connect as postgres first)
if pg_isready -h "$_DB_HOST" -p "$_DB_PORT" &>/dev/null; then
  # Try to create user as postgres (trust auth for local socket)
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$_DB_USER'" 2>/dev/null | grep -q 1 || {
    info "Creating PostgreSQL user '$_DB_USER'..."
    sudo -u postgres psql -c "CREATE USER $_DB_USER WITH PASSWORD '$_DB_PASS';" 2>/dev/null || true
  }
  # Ensure password is correct
  sudo -u postgres psql -c "ALTER USER $_DB_USER WITH PASSWORD '$_DB_PASS';" 2>/dev/null || true
  # Ensure pg_hba.conf allows md5 auth for ai_studio
  _PG_HBA="$(sudo -u postgres psql -t -c "SHOW hba_file;" 2>/dev/null | xargs)"
  if [[ -f "${_PG_HBA:-}" ]]; then
    if ! grep -q "host.*$_DB_USER.*127.0.0.1/32.*md5" "$_PG_HBA" 2>/dev/null; then
      echo "host $_DB_USER $_DB_USER 127.0.0.1/32 md5" | sudo tee -a "$_PG_HBA" > /dev/null 2>&1 || true
      echo "host $_DB_USER $_DB_USER ::1/128 md5" | sudo tee -a "$_PG_HBA" > /dev/null 2>&1 || true
      sudo service postgresql reload 2>/dev/null || true
    fi
  fi
fi

_PG_READY=false
if pg_isready -h "$_DB_HOST" -p "$_DB_PORT" &>/dev/null; then
  if PGPASSWORD="$_DB_PASS" psql -h "$_DB_HOST" -p "$_DB_PORT" -U "$_DB_USER" -d postgres -c "SELECT 1;" &>/dev/null; then
    _PG_READY=true
    log "PostgreSQL authentication successful (user=$_DB_USER, host=$_DB_HOST)"
  else
    warn "PostgreSQL is running but authentication failed for user '$_DB_USER'@$_DB_HOST"
  fi
else
  warn "PostgreSQL not responding at $_DB_HOST:$_DB_PORT"
fi

# Create database if it doesn't exist (only when PostgreSQL is ready)
if [[ "$_PG_READY" == "true" ]]; then
  # Validate database name to prevent SQL injection
  if [[ ! "$_DB_NAME" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    err "Invalid database name '$_DB_NAME' — must match [a-zA-Z_][a-zA-Z0-9_]*"
    exit 1
  fi
  # Create database if it doesn't exist (run as postgres — ai_studio can't create DBs)
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$_DB_NAME'" 2>/dev/null | grep -q 1; then
    info "Creating database '$_DB_NAME'..."
    sudo -u postgres psql -c "CREATE DATABASE $_DB_NAME OWNER $_DB_USER;" 2>/dev/null || true
  fi
  # Grant permissions
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $_DB_NAME TO $_DB_USER;" 2>/dev/null || true
  log "PostgreSQL ready (user=$_DB_USER, db=$_DB_NAME)"
fi
echo ""

# ── Step 2: Verify Redis ───────────────────────────────────────────────────
step "2/6 Checking Redis..."
if command -v systemctl &>/dev/null && ! systemctl is-active --quiet redis-server; then
    info "Starting Redis..."
    sudo systemctl start redis-server || {
        warn "Failed to start Redis — will configure in-memory broker fallback"
    }
fi

if ! redis-cli ping &>/dev/null; then
    warn "Redis not responding — configuring in-memory broker fallback for Celery."
    export CELERY_TASK_ALWAYS_EAGER=1
    export CELERY_BROKER_URL="memory://"
    export CELERY_RESULT_BACKEND="cache+memory://"
    export REDIS_URL="memory://"
    # Update .env file to match (prevents Celery worker from reading stale URLs)
    sed -i 's|^REDIS_URL=.*|REDIS_URL=memory://|' .env 2>/dev/null || true
    sed -i 's|^CELERY_BROKER_URL=.*|CELERY_BROKER_URL=memory://|' .env 2>/dev/null || true
    sed -i 's|^CELERY_RESULT_BACKEND=.*|CELERY_RESULT_BACKEND=cache+memory://|' .env 2>/dev/null || true
    log "Celery fallback active: eager execution + memory broker (no Redis)"
else
    log "Redis ready"
fi
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
: > "$PROJECT_ROOT/logs/api.log"
(
    cd backend
    setsid $PYTHON_BIN -m uvicorn app.main:app \
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
    if curl -sf http://localhost:8000/api/v1/health &>/dev/null; then
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
if ! curl -sf http://localhost:8000/api/v1/health &>/dev/null; then
    err "Backend API failed to become healthy. See logs/api.log"
    if [[ -f "$API_PID_FILE" ]]; then
        kill "$(cat "$API_PID_FILE")" 2>/dev/null || true
        rm -f "$API_PID_FILE"
    fi
    exit 1
fi

# ── Step 5: Start Celery Worker ────────────────────────────────────────────
step "5/6 Starting Celery Worker..."
: > "$PROJECT_ROOT/logs/worker.log"
(
    cd backend
    # Source .env to ensure Celery worker gets correct config
    set -a; source ../.env 2>/dev/null || true; set +a
    setsid $PYTHON_BIN -m celery -A app.workers.celery_app worker \
        --loglevel=info \
        --concurrency=1 \
        -B \
        -Q generation,images,installation \
        >> "$PROJECT_ROOT/logs/worker.log" 2>&1 &
    write_pid "$WORKER_PID_FILE" $!
)
log "Celery Worker started (PID: $(cat $WORKER_PID_FILE))"
echo ""

# ── Step 6: Start Frontend ────────────────────────────────────────────────
step "6/6 Starting Frontend  — http://localhost:3000..."

# Install deps if needed
if [[ ! -d node_modules ]] || [[ ! -d node_modules/next ]]; then
    if [[ -d node_modules ]] && [[ ! -d node_modules/next ]]; then
        warn "node_modules appears corrupted (missing next) — removing and reinstalling"
        rm -rf node_modules
    fi
    info "Installing npm dependencies..."
    npm ci --prefer-offline --no-audit 2>&1 | grep -E '(added|up to date)' || true
fi

# Dev mode: skip build (hot-reload). Prod mode: build first.
info "Building Next.js for production..."
export NEXT_PUBLIC_API_URL=http://localhost:8000
npm run build 2>&1 | tail -5
FRONTEND_RUN_CMD="npm start"

# Start frontend
NEXT_PUBLIC_API_URL=http://localhost:8000 setsid $FRONTEND_RUN_CMD \
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
echo -e "  ${BOLD}Endpoints:${NC}"
echo -e "    ${GRAY}├─${NC} Frontend       ${CYAN}http://localhost:3000${NC}  "
echo -e "    ${GRAY}├─${NC} Backend API    ${CYAN}http://localhost:8000${NC}"
echo -e "    ${GRAY}└─${NC} API Docs       ${CYAN}http://localhost:8000/docs${NC}"
echo ""
echo -e "  ${BOLD}Logs:${NC}"
echo -e "    ${GRAY}├─${NC} API      ${CYAN}logs/api.log${NC}"
echo -e "    ${GRAY}├─${NC} Worker   ${CYAN}logs/worker.log${NC}"
echo -e "    ${GRAY}└─${NC} Frontend ${CYAN}logs/frontend.log${NC}"
echo ""
echo -e "  ${BOLD}Stop services:${NC} ${GREEN}bash scripts/stop.sh${NC}"
echo ""
