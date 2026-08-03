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

# ── Load .env ──────────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
    err "No .env found. Run: sudo bash scripts/setup.sh"
    exit 1
fi
set -a
source .env
set +a

# ── Ensure Python venv exists ─────────────────────────────────────────────
if [[ ! -f backend/.venv/bin/python ]]; then
    err "Python venv not found at backend/.venv"
    err "Run: sudo bash scripts/setup.sh"
    exit 1
fi

PYTHON_BIN="backend/.venv/bin/python"
PIP_BIN="backend/.venv/bin/pip"
UVICORN_BIN="backend/.venv/bin/uvicorn"
CELERY_BIN="backend/.venv/bin/celery"

# ── Ensure Node.js is available ────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
    err "Node.js/npm not found. Run: sudo bash scripts/setup.sh"
    exit 1
fi

# ── PID file directory ─────────────────────────────────────────────────────
PID_DIR="${PROJECT_ROOT}/.pids"
mkdir -p "$PID_DIR"

# ── Service PIDs ───────────────────────────────────────────────────────────
API_PID_FILE="$PID_DIR/api.pid"
WORKER_PID_FILE="$PID_DIR/worker.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
MIGRATE_PID_FILE="$PID_DIR/migrate.pid"

# ── Helper: Write PID ──────────────────────────────────────────────────────
write_pid() {
    local pid_file=$1
    local pid=$2
    mkdir -p "$(dirname "$pid_file")"
    echo "$pid" > "$pid_file"
}

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
if ! systemctl is-active --quiet postgresql; then
    info "Starting PostgreSQL..."
    sudo systemctl start postgresql || {
        err "Failed to start PostgreSQL"
        exit 1
    }
fi

if ! pg_isready -h localhost -U postgres &>/dev/null; then
    err "PostgreSQL not responding"
    exit 1
fi

# Create database if it doesn't exist
$PYTHON_BIN << 'PYEOF' 2>/dev/null || true
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
try:
    conn = psycopg2.connect("host=localhost user=postgres password=postgres")
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM pg_database WHERE datname = 'ai3dstudio'")
    if not cursor.fetchone():
        cursor.execute("CREATE DATABASE ai3dstudio")
        print("Created ai3dstudio database")
    else:
        print("Database ai3dstudio already exists")
    cursor.close()
    conn.close()
except Exception as e:
    print(f"Database check: {e}")
PYEOF

log "PostgreSQL ready"
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
    err "Redis not responding"
    exit 1
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
    $UVICORN_BIN app.main:app \
        --host 0.0.0.0 \
        --port 8000 \
        --reload \
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

# ── Step 5: Start Celery Worker ────────────────────────────────────────────
step "5/6 Starting Celery Worker..."
(
    cd backend
    $CELERY_BIN -A app.workers.celery_app worker \
        --loglevel=info \
        --concurrency=1 \
        -Q generation,images \
        > "$PROJECT_ROOT/logs/worker.log" 2>&1 &
    write_pid "$WORKER_PID_FILE" $!
)
log "Celery Worker started (PID: $(cat $WORKER_PID_FILE))"
echo ""

# ── Step 6: Start Frontend ────────────────────────────────────────────────
step "6/6 Starting Frontend (http://localhost:3000)..."

# Install deps if needed
if [[ ! -d node_modules ]]; then
    info "Installing npm dependencies..."
    npm ci --prefer-offline --no-audit 2>&1 | grep -E '(added|up to date)' || true
fi

# Build if needed
if [[ ! -d .next ]]; then
    info "Building Next.js..."
    npm run build 2>&1 | tail -5
fi

# Start frontend
NEXT_PUBLIC_API_URL=http://localhost:8000 npm start \
    > "$PROJECT_ROOT/logs/frontend.log" 2>&1 &
write_pid "$FRONTEND_PID_FILE" $!

log "Frontend started (PID: $(cat $FRONTEND_PID_FILE))"
echo ""

# ── Summary ────────────────────────────────────────────────────────────────
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${GREEN}✅ All Services Started${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Endpoints:${NC}"
echo -e "    Frontend       http://localhost:3000"
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
