#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# AI 3D Studio v3.2 — Intelligent Bootstrap
# Auto-detects environment, installs missing deps, configures paths,
# and starts the project without manual intervention.
#
# Supported environments:
#   Google Colab, GitHub Codespaces, Cloud Notebooks, Linux Servers, Local
#
# Usage:
#   bash scripts/bootstrap.sh              # Full auto-setup + start
#   bash scripts/bootstrap.sh --skip-start  # Setup only, don't start services
#   bash scripts/bootstrap.sh --repos-only  # Only clone repos and install deps
#   bash scripts/bootstrap.sh --weights-only # Only download weights
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ── Colors ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${GREEN}[BOOTSTRAP]${NC} $*"; }
info()  { echo -e "${CYAN}[INFO]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}   $*"; }
err()   { echo -e "${RED}[ERROR]${NC}  $*" >&2; }
step()  { echo -e "\n${BOLD}${BLUE}➜ $*${NC}"; }

# ── Environment Detection ──────────────────────────────────────────────

detect_environment() {
    local env_name="local"

    if [[ -n "${CODESPACES:-}" || -n "${GITHUB_CODESPACE_NAME:-}" ]]; then
        env_name="codespaces"
    elif [[ -n "${COLAB_GPU:-}" || -n "${COLAB_TPU_ADDR:-}" || -d "/content" ]]; then
        env_name="colab"
    elif [[ -n "${NB_SESSION_ID:-}" || -n "${JUPYTER_BASE_URL:-}" || -d "/home/jovyan" ]]; then
        env_name="cloud-notebook"
    elif [[ -n "${KUBERNETES_SERVICE_HOST:-}" || -n "${CONTAINER_NAME:-}" ]]; then
        env_name="container"
    fi

    echo "$env_name"
}

detect_gpu() {
    if command -v nvidia-smi &>/dev/null; then
        local gpu_count
        gpu_count=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | wc -l)
        if [[ "$gpu_count" -gt 0 ]]; then
            echo "gpu"
            return
        fi
    fi
    echo "cpu"
}

detect_python() {
    if command -v python3 &>/dev/null; then
        local ver
        ver=$(python3 --version 2>&1 | grep -oP '\d+\.\d+')
        echo "python3(${ver})"
    elif command -v python &>/dev/null; then
        local ver
        ver=$(python --version 2>&1 | grep -oP '\d+\.\d+')
        echo "python(${ver})"
    else
        echo "none"
    fi
}

detect_node() {
    if command -v node &>/dev/null; then
        echo "node($(node --version 2>/dev/null || echo 'unknown'))"
    else
        echo "none"
    fi
}

detect_uv() {
    if command -v uv &>/dev/null; then
        echo "uv($(uv --version 2>/dev/null | head -1 || echo 'unknown'))"
    else
        echo "none"
    fi
}

# ── Environment-Specific Setup ─────────────────────────────────────────

setup_colab() {
    step "Configuring for Google Colab..."

    # Colab already has Python 3 and pip, but we need uv
    if ! command -v uv &>/dev/null; then
        info "Installing uv in Colab..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
        if [[ -f "$HOME/.local/bin/uv" ]] && [[ ! -e /usr/local/bin/uv ]]; then
            ln -sf "$HOME/.local/bin/uv" /usr/local/bin/uv 2>/dev/null || true
        fi
    fi

    # Colab has system Python; ensure we can create venvs
    if ! python3 -c "import venv" 2>/dev/null; then
        warn "venv module missing, installing python3-venv..."
        sudo apt-get update -qq && sudo apt-get install -y python3-venv 2>/dev/null || true
    fi

    # Colab may not have systemd; flag for SQLite fallback
    export USE_SQLITE=1
    warn "Colab detected — using SQLite fallback for database and in-process broker for Celery."
}

setup_codespaces() {
    step "Configuring for GitHub Codespaces..."

    if ! command -v uv &>/dev/null; then
        info "Installing uv in Codespaces..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
        if [[ -f "$HOME/.local/bin/uv" ]] && [[ ! -e /usr/local/bin/uv ]]; then
            ln -sf "$HOME/.local/bin/uv" /usr/local/bin/uv 2>/dev/null || true
        fi
    fi

    # Codespaces may not have systemd
    export USE_SQLITE=1
    warn "Codespaces detected — using SQLite fallback for database and in-process broker for Celery."
}

setup_cloud_notebook() {
    step "Configuring for cloud notebook environment..."

    if ! command -v uv &>/dev/null; then
        info "Installing uv in cloud notebook..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
        if [[ -f "$HOME/.local/bin/uv" ]] && [[ ! -e /usr/local/bin/uv ]]; then
            ln -sf "$HOME/.local/bin/uv" /usr/local/bin/uv 2>/dev/null || true
        fi
    fi

    export USE_SQLITE=1
    warn "Cloud notebook detected — using SQLite fallback for database and in-process broker for Celery."
}

setup_container() {
    step "Configuring for container environment..."

    if ! command -v uv &>/dev/null; then
        info "Installing uv in container..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
        if [[ -f "$HOME/.local/bin/uv" ]] && [[ ! -e /usr/local/bin/uv ]]; then
            ln -sf "$HOME/.local/bin/uv" /usr/local/bin/uv 2>/dev/null || true
        fi
    fi
}

setup_local() {
    step "Configuring for local environment..."

    # Local environments may need system deps installed
    if [[ "${EUID:-}" -ne 0 ]]; then
        warn "Not running as root — some system installs may fail."
        warn "For full setup, run: sudo bash scripts/setup.sh"
    fi
}

# ── Dependency Checks ──────────────────────────────────────────────────

ensure_uv() {
    if command -v uv &>/dev/null; then
        log "uv already available: $(uv --version 2>/dev/null | head -1 || echo 'unknown')"
        return 0
    fi

    step "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh || {
        err "Failed to install uv. Please install manually: https://docs.astral.sh/uv/getting-started/installation/"
        return 1
    }

    export PATH="$HOME/.local/bin:$PATH"
    if [[ -f "$HOME/.local/bin/uv" ]] && [[ ! -e /usr/local/bin/uv ]]; then
        ln -sf "$HOME/.local/bin/uv" /usr/local/bin/uv 2>/dev/null || true
    fi

    if command -v uv &>/dev/null; then
        log "uv installed: $(uv --version)"
    else
        err "uv installation succeeded but uv not found on PATH."
        return 1
    fi
}

ensure_python() {
    local py_ver
    py_ver=$(detect_python)

    if [[ "$py_ver" == "none" ]]; then
        step "Installing Python 3.12..."
        if [[ "$(detect_environment)" == "colab" ]]; then
            err "Python not found in Colab — this is unexpected. Aborting."
            return 1
        fi

        if command -v apt-get &>/dev/null; then
            sudo apt-get update -qq
            sudo apt-get install -y python3.12 python3.12-dev python3.12-venv || {
                err "Failed to install Python 3.12"
                return 1
            }
        elif command -v yum &>/dev/null; then
            sudo yum install -y python3.12 python3.12-devel || {
                err "Failed to install Python 3.12"
                return 1
            }
        elif command -v apk &>/dev/null; then
            sudo apk add python3.12 || {
                err "Failed to install Python 3.12"
                return 1
            }
        else
            err "No supported package manager found. Please install Python 3.12 manually."
            return 1
        fi
    fi

    log "Python available: $(python3 --version 2>/dev/null || echo 'unknown')"
}

ensure_node() {
    local node_ver
    node_ver=$(detect_node)

    if [[ "$node_ver" == "none" ]]; then
        step "Installing Node.js 20..."
        if command -v curl &>/dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_20.x 2>/dev/null | sudo bash - 2>/dev/null || {
                warn "NodeSource setup failed, trying nvm..."
                (command -v nvm &>/dev/null && nvm install 20) || {
                    warn "Cannot install Node.js automatically. npm is required for the frontend."
                    return 1
                }
            }
        fi

        if command -v apt-get &>/dev/null; then
            sudo apt-get install -y nodejs || {
                warn "Node.js install via apt failed"
                return 1
            }
        elif command -v yum &>/dev/null; then
            sudo yum install -y nodejs || {
                warn "Node.js install via yum failed"
                return 1
            }
        fi
    fi

    log "Node.js available: $(node --version 2>/dev/null || echo 'unknown')"
}

ensure_backend_venv() {
    step "Ensuring backend virtual environment..."

    if [[ -x backend/.venv/bin/python ]]; then
        log "Backend venv already exists at backend/.venv"
        return 0
    fi

    info "Creating backend virtual environment with uv..."
    uv venv --python 3.12 backend/.venv || {
        err "Failed to create backend venv"
        return 1
    }
    log "Backend venv created"
}

ensure_backend_deps() {
    step "Installing backend Python dependencies..."

    if [[ ! -f backend/requirements.txt ]]; then
        warn "backend/requirements.txt not found — skipping backend deps"
        return 0
    fi

    if [[ ! -x backend/.venv/bin/python ]]; then
        err "Backend venv not found — run ensure_backend_venv first"
        return 1
    fi

    # Install PyTorch first (GPU or CPU depending on hardware)
    local gpu_available
    gpu_available=$(detect_gpu)

    if [[ "$gpu_available" == "gpu" ]]; then
        info "Installing PyTorch with CUDA 12.1 via uv..."
        uv pip install --python backend/.venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
            --index-url https://download.pytorch.org/whl/cu121 -q 2>/dev/null || {
            warn "PyTorch CUDA install failed, trying CPU fallback..."
            uv pip install --python backend/.venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
                --index-url https://download.pytorch.org/whl/cpu -q 2>/dev/null || true
        }
    else
        info "Installing PyTorch CPU-only via uv..."
        uv pip install --python backend/.venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
            --index-url https://download.pytorch.org/whl/cpu -q 2>/dev/null || true
    fi

    # Install remaining backend deps
    info "Installing remaining backend dependencies..."
    uv pip install --python backend/.venv/bin/python -r backend/requirements.txt -q 2>/dev/null || {
        warn "Some backend dependencies may have failed to install"
    }

    log "Backend dependencies installed"
}

ensure_frontend_deps() {
    step "Ensuring frontend dependencies..."

    if [[ ! -d node_modules ]]; then
        info "Installing npm dependencies..."
        npm ci --prefer-offline --no-audit 2>/dev/null || npm install --no-audit 2>/dev/null || {
            warn "Frontend dependency installation had issues"
        }
    fi

    if [[ ! -d .next ]]; then
        info "Building Next.js..."
        npm run build 2>/dev/null || warn "Next.js build failed — will retry on start"
    fi

    log "Frontend dependencies ready"
}

ensure_system_services() {
    step "Checking system services..."

    # PostgreSQL
    if [[ "${USE_SQLITE:-}" != "1" ]]; then
        if systemctl is-active --quiet postgresql 2>/dev/null; then
            log "PostgreSQL is running"
        else
            info "Attempting to start PostgreSQL..."
            sudo systemctl start postgresql 2>/dev/null || {
                warn "PostgreSQL not available — will use SQLite fallback"
                export USE_SQLITE=1
            }
        fi
    fi

    # Redis
    if systemctl is-active --quiet redis-server 2>/dev/null; then
        log "Redis is running"
    else
        info "Attempting to start Redis..."
        sudo systemctl start redis-server 2>/dev/null || {
            warn "Redis not available — Celery will use degraded mode"
        }
    fi
}

ensure_model_venvs() {
    step "Checking per-model virtual environments..."

    local uv_path
    uv_path=$(command -v uv)

    for repo_dir in backend/third_party/*/; do
        [[ -d "$repo_dir" ]] || continue
        local repo_name
        repo_name=$(basename "$repo_dir")
        local venv_dir="${repo_dir}.venv"

        # Skip if .venv already exists (even as symlink)
        if [[ -e "$venv_dir" ]]; then
            log "Model $repo_name: venv exists ✓"
            continue
        fi

        # Skip if no requirements.txt and no pyproject.toml
        if [[ ! -f "${repo_dir}requirements.txt" ]] && [[ ! -f "${repo_dir}pyproject.toml" ]] && [[ ! -f "${repo_dir}setup.py" ]]; then
            info "Model $repo_name: no requirements.txt/pyproject.toml/setup.py — skipping venv creation"
            continue
        fi

        info "Model $repo_name: creating isolated venv..."
        "$uv_path" venv --python 3.12 "$venv_dir" 2>/dev/null || {
            warn "Failed to create venv for $repo_name"
            continue
        }

        if [[ -f "${repo_dir}requirements.txt" ]]; then
            info "Model $repo_name: installing deps via uv..."
            "$uv_path" pip install --python "$venv_dir/bin/python" -r "${repo_dir}requirements.txt" -q 2>/dev/null || {
                warn "Some deps failed for $repo_name"
            }
        fi

        log "Model $repo_name: venv created and deps installed ✓"
    done
}

configure_paths() {
    step "Configuring environment paths..."

    # Ensure .env exists
    if [[ ! -f .env ]]; then
        if [[ -f .env.example ]]; then
            cp .env.example .env
            log "Created .env from .env.example"
        else
            warn "No .env.example found — creating minimal .env"
            cat > .env << 'ENVEOF'
DATABASE_URL=sqlite:///backend/storage/studio.db
DATABASE_SYNC_URL=sqlite:///backend/storage/studio.db
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
BACKEND_URL=http://localhost:8000
CUDA_DEVICE=auto
DEBUG=false
ENVIRONMENT=development
USE_SQLITE=1
ENVEOF
            log "Created minimal .env with SQLite fallback"
        fi
    fi

    # Load .env for subsequent steps
    set -a
    source .env
    set +a

    # Ensure storage directories exist
    mkdir -p backend/storage/uploads
    mkdir -p backend/storage/models
    mkdir -p backend/storage/thumbnails
    mkdir -p backend/storage/exports
    mkdir -p backend/storage/images
    mkdir -p backend/third_party/.hf_cache/hub
    mkdir -p backend/.runtime_cache
    mkdir -p logs
    mkdir -p .pids

    log "Environment paths configured"
}

# ── Main ────────────────────────────────────────────────────────────────

SKIP_START=false
REPOS_ONLY=false
WEIGHTS_ONLY=false

for arg in "$@"; do
    case "$arg" in
        --skip-start)   SKIP_START=true ;;
        --repos-only)   REPOS_ONLY=true ;;
        --weights-only) WEIGHTS_ONLY=true ;;
        --help|-h)
            echo "Usage: bash scripts/bootstrap.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-start     Setup only, don't start services"
            echo "  --repos-only     Only clone repos and install deps"
            echo "  --weights-only   Only download weights"
            echo "  -h, --help       Show this help"
            exit 0
            ;;
    esac
done

echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  AI 3D Studio v3.2 — Intelligent Bootstrap${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"
echo ""

# Detect environment
ENV_TYPE=$(detect_environment)
GPU_TYPE=$(detect_gpu)
PY_VER=$(detect_python)
NODE_VER=$(detect_node)
UV_VER=$(detect_uv)

log "Environment : ${CYAN}${ENV_TYPE}${NC}"
log "GPU         : ${CYAN}${GPU_TYPE}${NC}"
log "Python      : ${CYAN}${PY_VER}${NC}"
log "Node.js     : ${CYAN}${NODE_VER}${NC}"
log "uv          : ${CYAN}${UV_VER}${NC}"
echo ""

# Environment-specific setup
case "$ENV_TYPE" in
    colab)         setup_colab ;;
    codespaces)    setup_codespaces ;;
    cloud-notebook) setup_cloud_notebook ;;
    container)     setup_container ;;
    local)         setup_local ;;
esac

# Core dependency checks
ensure_uv || exit 1
ensure_python || exit 1
ensure_node || exit 1

# Project setup
configure_paths
ensure_backend_venv

if [[ "$REPOS_ONLY" == "true" ]]; then
    ensure_backend_deps
    ensure_model_venvs
    log "Repos-only setup complete. Run 'bash scripts/start.sh' to start services."
    exit 0
fi

if [[ "$WEIGHTS_ONLY" == "true" ]]; then
    ensure_backend_deps
    log "Weights-only setup complete. Run 'bash scripts/start.sh' to start services."
    exit 0
fi

ensure_backend_deps
ensure_frontend_deps
ensure_system_services
ensure_model_venvs

# Start services (unless skipped)
if [[ "$SKIP_START" != "true" ]]; then
    echo ""
    step "Starting AI 3D Studio services..."
    bash scripts/start.sh
else
    log "Bootstrap complete. Start services manually with: bash scripts/start.sh"
fi