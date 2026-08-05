#!/usr/bin/env bash
# ============================================================
# AI 3D Studio — Automatic Setup Script (Non-Docker)
# Direct system installation without Docker containers
# Supports Ubuntu 20.04/22.04/24.04 with NVIDIA GPU
# Usage: sudo bash scripts/setup.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${GREEN}[SETUP]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
head_() { echo -e "\n${BOLD}${BLUE}===== $* =====${NC}\n"; }

# ── Google Colab Detection ────────────────────────────────────────────────
# Colab has its own bootstrap+start flow in scripts/colab.sh — redirect
# there instead of running local/Linux install logic.
if [[ -n "${COLAB_GPU:-}" || -n "${COLAB_TPU_ADDR:-}" || -d "/content" ]]; then
    err "Google Colab detected — setup.sh is for local/Linux systems."
    warn "Please run: bash scripts/colab.sh"
    exit 0
fi

# ── Prerequisites ─────────────────────────────────────────────────────────────

check_root() {
  if [[ $EUID -ne 0 ]]; then
    if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet systemd 2>/dev/null; then
      err "This script must be run as root on a systemd host (use: sudo bash scripts/setup.sh)"
      exit 1
    else
      warn "Not root and no systemd — installing in user mode; start.sh will use SQLite/broker fallbacks."
      ROOTLESS=1
    fi
  fi
}

check_os() {
  head_ "Checking OS"
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS=$ID
    log "Detected: $PRETTY_NAME"
  else
    err "Cannot detect OS. Supported: Ubuntu 20.04, 22.04, 24.04"
    exit 1
  fi
  if [[ "$OS" != "ubuntu" ]] && [[ "$OS" != "debian" ]]; then
    warn "Unsupported OS: $OS — proceeding anyway (Ubuntu/Debian recommended)"
  fi
}

detect_gpu() {
  head_ "GPU Detection"
  GPU_AVAILABLE=false
  GPU_NAME=""

  if command -v nvidia-smi &>/dev/null; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || true)
    if [[ -n "$GPU_NAME" ]]; then
      GPU_AVAILABLE=true
      DRIVER_VER=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1 || echo "unknown")
      log "GPU detected : ${CYAN}${GPU_NAME}${NC}"
      log "Driver       : $DRIVER_VER"
    fi
  fi

  if [[ "$GPU_AVAILABLE" == "false" ]]; then
    warn "No NVIDIA GPU detected — AI inference requires CUDA-capable hardware."
    warn "The stack will start, but generation jobs will fail without a GPU."
    if [[ -t 0 ]]; then
      read -rp "Continue without GPU? [y/N] " choice
      if [[ "${choice,,}" != "y" ]]; then
        err "Aborting. Install an NVIDIA GPU + driver and re-run."
        exit 1
      fi
    else
      warn "Non-interactive environment detected — proceeding with CPU fallback."
      warn "Generation jobs will fail without a GPU."
    fi
  fi
}

# ── System packages ────────────────────────────────────────────────────────────

install_system_deps() {
  head_ "Installing System Dependencies"
  apt-get update -qq || {
    err "apt-get update failed — check network / apt sources"
    return 1
  }
  apt-get install -y --no-install-recommends \
    curl wget git unzip tar ca-certificates gnupg lsb-release \
    build-essential software-properties-common \
    libssl-dev libffi-dev zlib1g-dev libpq-dev \
    ffmpeg libsm6 libxext6 libxrender-dev libglib2.0-0 || {
    err "Failed to install system dependencies"
    return 1
  }
  log "System dependencies installed"
}

install_python() {
  head_ "Installing Python 3.12"
  if python3.12 --version &>/dev/null 2>&1; then
    log "Already installed: $(python3.12 --version)"
    return 0
  fi
  add-apt-repository ppa:deadsnakes/ppa -y || {
    err "Failed to add deadsnakes PPA — cannot install Python 3.12"
    return 1
  }
  apt-get update -qq
  apt-get install -y python3.12 python3.12-dev || {
    err "Failed to install Python 3.12"
    return 1
  }
  update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1
  log "Python 3.12 installed"
}

install_uv() {
  head_ "Installing uv (Python Package Manager)"
  if command -v uv &>/dev/null; then
    log "Already installed: $(uv --version)"
    return 0
  fi

  log "Downloading uv installer..."
  curl -LsSf https://astral.sh/uv/install.sh | sh || {
    err "Failed to install uv — this is a critical dependency"
    return 1
  }

  # Add uv to PATH for this session
  export PATH="$HOME/.local/bin:$PATH"

  # Also ensure it's on the default PATH for future sessions
  if [[ -f "$HOME/.local/bin/uv" ]] && [[ ! -f /usr/local/bin/uv ]]; then
    ln -sf "$HOME/.local/bin/uv" /usr/local/bin/uv 2>/dev/null || true
  fi

  # Verify installation
  if command -v uv &>/dev/null; then
    log "uv installed: $(uv --version)"
  else
    err "uv installed but not found on PATH — manual PATH fix may be needed"
    return 1
  fi
}

install_cuda() {
  if [[ "$GPU_AVAILABLE" == "false" ]]; then
    warn "Skipping CUDA (no GPU)"
    return 0
  fi
  head_ "Installing CUDA Toolkit"
  if nvcc --version &>/dev/null 2>&1; then
    log "CUDA already installed: $(nvcc --version | head -1)"
    return 0
  fi

  # Detect OS and arch for the correct CUDA keyring URL
  local OS_ID; OS_ID=$(. /etc/os-release && echo "$ID")
  local UBUNTU_VER; UBUNTU_VER=$(lsb_release -rs | tr -d '.')
  local ARCH; ARCH=$(dpkg --print-architecture)
  # Debian uses a different repo path
  if [[ "$OS_ID" == "debian" ]]; then
    local DEBIAN_VER; DEBIAN_VER=$(lsb_release -rs)
    KEYRING_URL="https://developer.download.nvidia.com/compute/cuda/repos/debian${DEBIAN_VER}/${ARCH}/cuda-keyring_1.1-1_all.deb"
  else
    KEYRING_URL="https://developer.download.nvidia.com/compute/cuda/repos/ubuntu${UBUNTU_VER}/${ARCH}/cuda-keyring_1.1-1_all.deb"
  fi
  wget -q "$KEYRING_URL" -O /tmp/cuda-keyring.deb || {
    warn "Failed to download CUDA keyring — skipping CUDA install"
    return 0
  }
  dpkg -i /tmp/cuda-keyring.deb
  rm -f /tmp/cuda-keyring.deb
  apt-get update -qq
  apt-get install -y cuda-toolkit || {
    warn "Failed to install CUDA toolkit — containers may fall back to CPU"
    return 0
  }
  log "CUDA toolkit installed"

  # Persist PATH/LD_LIBRARY_PATH
  cat > /etc/profile.d/cuda.sh << 'CUDA_ENV'
export PATH=/usr/local/cuda/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:${LD_LIBRARY_PATH:-}
CUDA_ENV
  chmod +x /etc/profile.d/cuda.sh
  # Apply for this session too
  export PATH="/usr/local/cuda/bin:$PATH"
  export LD_LIBRARY_PATH="/usr/local/cuda/lib64:${LD_LIBRARY_PATH:-}"
}

install_postgresql() {
  head_ "Installing PostgreSQL 16"
  if command -v psql &>/dev/null; then
    log "PostgreSQL already installed: $(psql --version)"
    return 0
  fi
  
  apt-get update -qq
  apt-get install -y postgresql postgresql-contrib postgresql-16-pgvector || {
    err "Failed to install PostgreSQL"
    return 1
  }
  
  systemctl enable postgresql --now
  log "PostgreSQL installed and started"
}

install_redis() {
  head_ "Installing Redis 7"
  if command -v redis-server &>/dev/null; then
    log "Redis already installed: $(redis-server --version)"
    return 0
  fi
  
  apt-get update -qq
  apt-get install -y redis-server || {
    err "Failed to install Redis"
    return 1
  }
  
  systemctl enable redis-server --now
  log "Redis installed and started"
}

install_node() {
  head_ "Installing Node.js 20"
  if node --version 2>/dev/null | grep -qE 'v2[0-9]'; then
    log "Already installed: $(node --version)"
    return 0
  fi
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - || {
    err "Failed to add NodeSource repository"
    return 1
  }
  apt-get install -y nodejs || {
    err "Failed to install Node.js"
    return 1
  }
  log "Node.js installed: $(node --version)"
}

install_blender() {
  head_ "Installing Blender"
  if command -v blender &>/dev/null; then
    log "Already installed: $(blender --version 2>/dev/null | head -1)"
    return 0
  fi
  apt-get install -y blender 2>/dev/null || {
    warn "Blender not in apt — downloading from blender.org..."
    BLENDER_VER="4.2.3"
    BLENDER_URL="https://download.blender.org/release/Blender4.2/blender-${BLENDER_VER}-linux-x64.tar.xz"
    wget -q "$BLENDER_URL" -O /tmp/blender.tar.xz || {
      warn "Failed to download Blender — post-processing will be unavailable"
      return 0
    }
    tar -xJf /tmp/blender.tar.xz -C /opt/
    ln -sf "/opt/blender-${BLENDER_VER}-linux-x64/blender" /usr/local/bin/blender
    rm -f /tmp/blender.tar.xz
    log "Blender $BLENDER_VER installed to /opt/"
  }
}

# ── Project setup ──────────────────────────────────────────────────────────────

setup_folders() {
  head_ "Creating Project Directory Structure"
  for dir in \
    backend/storage/uploads \
    backend/storage/models \
    backend/storage/thumbnails \
    backend/storage/exports \
    backend/storage/images \
    backend/third_party/weights \
    backend/third_party/.hf_cache \
    backend/.runtime_cache \
    logs; do
    mkdir -p "$dir"
  done
  chmod -R 755 backend/storage backend/third_party backend/.runtime_cache logs
  log "Project directories created"
}

setup_env() {
  head_ "Setting Up Environment"
  if [[ -f .env ]]; then
    log ".env already exists — skipping"
    return 0
  fi
  if [[ -f .env.example ]]; then
    cp .env.example .env
    log "Created .env from .env.example"
  else
    cat > .env << 'ENVEOF'
# ── Database (localhost) ──────────────────────────────────
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/ai3dstudio
DATABASE_SYNC_URL=postgresql://postgres:postgres@localhost:5432/ai3dstudio

# ── Redis / Celery (localhost) ────────────────────────────
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# ── API ───────────────────────────────────────────────────
BACKEND_URL=http://localhost:8000

# ── Storage ────────────────────────────────────────────────
STORAGE_LOCAL_PATH=./backend/storage
RUNTIME_CACHE_DIR=./backend/.runtime_cache
HF_HOME=./backend/third_party/.hf_cache
HUGGINGFACE_HUB_CACHE=./backend/third_party/.hf_cache/hub
TRANSFORMERS_CACHE=./backend/third_party/.hf_cache/transformers
TORCH_HOME=./backend/third_party/.hf_cache/torch
WEIGHTS_DIR=./backend/third_party/<Repo>/weights/

# ── GPU ───────────────────────────────────────────────────
CUDA_VISIBLE_DEVICES=0
CUDA_DEVICE=auto
PLATFORM_MODE=gpu
CPU_FALLBACK=false

# ── Dev ────────────────────────────────────────────────────
DEBUG=false
PYTHONPATH=/app
ENVEOF
    log "Created default .env"
  fi
}

install_python_deps() {
  head_ "Installing Python Dependencies (uv)"

  # Ensure uv is on PATH before proceeding
  if ! command -v uv &>/dev/null; then
    err "uv not found on PATH — cannot install Python dependencies"
    return 1
  fi

  # Run in subshell to avoid polluting parent environment, but capture exit code
  (
    cd backend

    # Create venv using uv (replaces python3.12-venv entirely).
    # Idempotent: skip if venv already exists so re-runs don't fail.
    log "Creating virtual environment with uv..."
    if [[ ! -x .venv/bin/python ]]; then
        uv venv --python 3.12 .venv
    fi

    # Install PyTorch once — GPU or CPU depending on hardware
    if [[ "$GPU_AVAILABLE" == "true" ]]; then
      log "Installing PyTorch with CUDA 12.1 via uv..."
      uv pip install --python .venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
        --index-url https://download.pytorch.org/whl/cu121 -q
    else
      log "Installing PyTorch CPU-only via uv..."
      uv pip install --python .venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
        --index-url https://download.pytorch.org/whl/cpu -q
    fi

    uv pip install --python .venv/bin/python -r requirements.txt -q
  )
  local rc=$?
  if [[ $rc -ne 0 ]]; then
    err "Python dependency installation failed (exit code $rc)"
    return 1
  fi
  log "Python dependencies installed"
}

clone_anigen() {
  head_ "Setting Up AniGen (Character Rigging)"
  local ANIGEN_DIR="backend/third_party/AniGen"
  if [[ -d "$ANIGEN_DIR" ]]; then
    log "AniGen already cloned at $ANIGEN_DIR"
    return 0
  fi
  mkdir -p "$(dirname "$ANIGEN_DIR")"
  log "Cloning AniGen from VAST-AI-Research..."
  git clone --depth 1 https://github.com/VAST-AI-Research/AniGen.git "$ANIGEN_DIR" 2>/dev/null || {
    warn "Failed to clone AniGen — rigging will use passthrough mode"
    return 0
  }
  # Install AniGen-specific Python deps (non-critical — warn on failure)
  if [[ -f "$ANIGEN_DIR/requirements.txt" ]]; then
    (
      cd backend
      uv pip install --python .venv/bin/python -r "$ANIGEN_DIR/requirements.txt" -q 2>/dev/null || true
    )
    log "AniGen dependencies installed (some may have been skipped)"
  fi
  log "AniGen setup complete"
}

install_frontend_deps() {
  head_ "Installing Frontend Dependencies"
  npm ci --prefer-offline --no-audit 2>/dev/null || npm install --no-audit || {
    warn "Frontend dependency installation had issues — check npm output"
    return 0
  }
  log "Frontend dependencies installed"
}

# ── Services ───────────────────────────────────────────────────────────────────

print_summary() {
  head_ "Setup Complete"
  echo -e "${GREEN}${BOLD}AI 3D Studio v3.2.0 is ready!${NC}"
  echo
  echo -e "  ${CYAN}Database :${NC}  PostgreSQL on localhost:5432"
  echo -e "  ${CYAN}Cache    :${NC}  Redis on localhost:6379"
  echo
  echo -e "  ${CYAN}Setup complete!${NC} Now run:"
  echo -e "    ${GREEN}bash scripts/start.sh${NC}"
  echo
  echo -e "  Services will start at:"
  echo -e "    Frontend :  http://localhost:3000"
  echo -e "    Backend  :  http://localhost:8000"
  echo -e "    API Docs :  http://localhost:8000/docs"
  echo
  if [[ "$GPU_AVAILABLE" == "true" ]]; then
    echo -e "  ${GREEN}GPU Mode:${NC}  ${GPU_NAME}"
  else
    echo -e "  ${YELLOW}GPU Mode:${NC}  None — install NVIDIA GPU for AI inference"
  fi
  echo
  echo -e "  ${CYAN}Storage  :${NC}  backend/storage/"
  echo -e "  ${CYAN}3rd-party:${NC}  backend/third_party/"
  echo -e "  ${CYAN}Config   :${NC}  .env"
  echo
  echo -e "  ${CYAN}Command reference:${NC}"
  echo -e "    Start services  : bash scripts/start.sh"
  echo -e "    Stop services   : bash scripts/stop.sh"
  echo -e "    Restart services: bash scripts/restart.sh"
  echo -e "    Manage services : bash manager.sh"
  echo
}

# ── Entry point ────────────────────────────────────────────────────────────────

main() {
  echo -e "${RED}${BOLD}"
  cat << 'BANNER'

 ██████╗██╗    ██████╗ ██████╗      ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
██╔══██╗██║    ╚════██╗██╔══██╗     ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
███████║██║     █████╔╝██║  ██║     ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
██╔══██║██║    ╚═══██╗ ██║  ██║     ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
██║  ██║██║   ██████╔╝ ██████╔╝     ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
╚═╝  ╚═╝╚═╝   ╚═════╝  ╚═════╝      ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝

BANNER
  echo -e "${NC}  ${BOLD}Automatic Installer v3.2.0${NC}\n"

  # Critical steps — failure aborts setup
  check_root
  check_os
  detect_gpu
  install_system_deps    || { err "System dependency installation failed — aborting"; exit 1; }
  if [[ "${ROOTLESS:-}" != "1" ]]; then
    install_postgresql     || { err "PostgreSQL installation failed — aborting"; exit 1; }
    install_redis          || { err "Redis installation failed — aborting"; exit 1; }
  else
    warn "Skipping PostgreSQL/Redis system install (user mode) — start.sh will use SQLite/broker fallbacks."
  fi
  install_python         || { err "Python installation failed — aborting"; exit 1; }
  install_uv             || { err "uv installation failed — aborting"; exit 1; }
  install_node           || { err "Node.js installation failed — aborting"; exit 1; }

  # Non-critical steps — warn but continue
  install_blender        || warn "Blender install skipped — post-processing may be unavailable"
  install_cuda           || warn "CUDA install had issues — may use CPU fallback"

  # Project setup
  setup_folders
  setup_env
  install_python_deps    || { err "Python dependency installation failed — aborting"; exit 1; }

  # Non-critical project steps
  clone_anigen
  install_frontend_deps  || warn "Frontend deps had issues — check npm output above"

  # setup.sh runs as root; hand ownership back to the real user so that the
  # non-root `start.sh` can use the venv, read .env, and write logs.
  if [[ -n "${SUDO_USER:-}" ]]; then
    log "Returning project ownership to $SUDO_USER..."
    chown -R "${SUDO_USER}:$(id -gn "$SUDO_USER")" \
      backend/.venv backend/storage backend/third_party backend/.runtime_cache \
      node_modules .env logs .pids 2>/dev/null || true
  fi

  # Auto-start: run start.sh in the foreground after setup completes
  if [[ "$AUTO_START" == "true" ]]; then
    echo ""
    log "Setup complete — launching services..."
    echo ""
    bash scripts/start.sh
  else
    # Summary — user runs scripts/start.sh manually
    print_summary
  fi
}

# ── Parse flags ────────────────────────────────────────────────────────

AUTO_START=false

for arg in "$@"; do
    case "$arg" in
        --auto-start) AUTO_START=true ;;
        --help|-h)
            echo "Usage: sudo bash scripts/setup.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --auto-start    Run setup then automatically start services"
            echo "  -h, --help      Show this help"
            exit 0
            ;;
    esac
done

main "$@"
