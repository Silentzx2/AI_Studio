#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# AI 3D Studio v3.2 — Google Colab Bootstrap + Start
#
# Complete Colab-specific flow in a single script:
#   1. Environment setup (uv, venv module, SQLite mode)
#   2. Dependency installation (backend venv + deps, model venvs, frontend)
#   3. Project initialization (.env, storage dirs, Redis)
#   4. Service startup (migrations → API → Celery worker → Frontend)
#
# Uses Colab-compatible commands only — no systemd, no apt-key, no root
# assumptions beyond what Colab provides.
#
# Usage:
#   bash scripts/colab.sh                 # Full bootstrap + start
#   bash scripts/colab.sh --skip-start    # Setup only, don't start services
#   bash scripts/colab.sh --repos-only    # Only clone repos and install deps
#   bash scripts/colab.sh --weights-only  # Only download/install model weights
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Animated logging ─────────────────────────────────────────────────────
log()   { echo -e "${GREEN}[COLAB]${NC}  ✔ $*"; }
info()  { echo -e "${CYAN}[INFO]${NC}   ℹ $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}   ⚠ $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    ✓ $*"; }
err()   { echo -e "${RED}[ERR]${NC}    ✗ $*" >&2; }
head_() { echo -e "\n${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n  ${BOLD}${MAGENTA}➜ $*${NC}\n"; }
step()  { echo -e "\n${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n  ${BOLD}${MAGENTA}➜ Step $*${NC}\n"; }
done_() { echo -e "  ${GREEN}${BOLD}✔ Done!${NC}"; }

# ── Progress bar ─────────────────────────────────────────────────────────
_progress_bar() {
    local current=$1
    local total=$2
    local width=30
    local percentage=$((current * 100 / total))
    local filled=$((width * current / total))
    local empty=$((width - filled))
    printf "\r  ${DIM}[${NC}"
    printf '%*s' "$filled" '' | tr ' ' '█'
    printf "${DIM}"
    printf '%*s' "$empty" '' | tr ' ' '░'
    printf "${NC}] ${BOLD}%3d%%${NC}" "$percentage"
}

_spinner() {
    local pid=$1
    local msg="${2:─Waiting}"
    local delay=0.08
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

_run_silent() {
    "$@" &>/dev/null &
    _spinner $! "$1"
}

# ── Project Root ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ── Flags ────────────────────────────────────────────────────────────────
SKIP_START=false
REPOS_ONLY=false
WEIGHTS_ONLY=false
export DISABLE_DISK_CHECK=1

# ── Backend Python version ─────────────────────────────────────────────────
# The backend is NOT a model — it has no YAML manifest. Its Python version is
# a project-wide convention (3.12), not a per-model value. Per-model venvs
# read their Python version from each model's manifest via prepare_runtime().
BACKEND_PYTHON_VERSION="${BACKEND_PYTHON_VERSION:-3.12}"

for arg in "$@"; do
    case "$arg" in
        --stop)          ACTION="stop" ;;
        --restart)       ACTION="restart" ;;
        --start)         ACTION="start" ;;
        --setup)         ACTION="setup" ;;
        --status)        ACTION="status" ;;
        --skip-start)    SKIP_START=true ;;
        --repos-only)    REPOS_ONLY=true ;;
        --weights-only)  WEIGHTS_ONLY=true ;;
        --help|-h)
            echo "Usage: bash scripts/colab.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --setup          Full bootstrap + start all services (non-interactive friendly)"
            echo "  --start          Start all services and run supervisor"
            echo "  --stop           Stop all running services"
            echo "  --restart        Restart all services"
            echo "  --status         Check service status"
            echo "  --skip-start     Setup only, don't start services"
            echo "  --repos-only     Only clone repos and install deps"
            echo "  --weights-only   Only download weights"
            echo "  -h, --help       Show this help"
            exit 0
            ;;
    esac
done

# ── Environment Detection ────────────────────────────────────────────────

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

detect_cuda_version() {
    # Check driver version first (more reliable than nvcc on Colab)
    if command -v nvidia-smi &>/dev/null; then
        local driver_ver
        driver_ver=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1 | awk -F. '{print $1}')
        if [[ "$driver_ver" -ge 550 ]]; then
            echo "124"
        elif [[ "$driver_ver" -ge 535 ]]; then
            echo "121"
        elif [[ "$driver_ver" -ge 525 ]]; then
            echo "118"
        else
            echo "121"
        fi
        return
    fi
    # Fallback: check nvcc if available
    if command -v nvcc &>/dev/null; then
        local cuda_full
        cuda_full=$(nvcc --version 2>/dev/null | grep "release" | sed 's/.*release //' | sed 's/,.*//')
        if [[ -n "$cuda_full" ]]; then
            local ver
            ver=$(echo "$cuda_full" | awk -F. '{print $1$2}')
            # ponytail: don't cap — return actual CUDA version for wheel resolution
            echo "$ver"
            return
        fi
    fi
    echo "121"
}

# ── CUDA 12.4 Toolkit Setup ──────────────────────────────────────────────────
# Ensures CUDA Toolkit 12.4 is installed and active. Idempotent: detects existing
# CUDA, installs 12.4 if missing or wrong version, configures paths, verifies.

## ── Clean up conflicting CUDA APT sources ──────────────────────────────────
_sanitize_apt_cuda_sources() {
  # Remove duplicate/conflicting NVIDIA repository lists that cause APT "Conflicting values set for option Signed-By"
  rm -f /etc/apt/sources.list.d/*cuda*.list \
        /etc/apt/sources.list.d/*nvidia*.list \
        /etc/apt/sources.list.d/*cuda*.sources \
        /etc/apt/sources.list.d/*nvidia*.sources 2>/dev/null || true
  if [[ -f /etc/apt/sources.list ]]; then
    sed -i '/developer\.download\.nvidia\.com/d' /etc/apt/sources.list 2>/dev/null || true
  fi
  for src in /etc/apt/sources.list.d/*.sources; do
    if [[ -f "$src" ]] && grep -q "developer.download.nvidia.com" "$src" 2>/dev/null; then
      sed -i '/developer\.download\.nvidia\.com/d' "$src" 2>/dev/null || true
    fi
  done
  for lst in /etc/apt/sources.list.d/*.list; do
    if [[ -f "$lst" ]] && grep -q "developer.download.nvidia.com" "$lst" 2>/dev/null; then
      sed -i '/developer\.download\.nvidia\.com/d' "$lst" 2>/dev/null || true
    fi
  done
}

# ── Setup Swap Space (Colab RAM Protection) ──────────────────────────────────
# Google Colab standard GPU runtimes have 12.7GB CPU RAM. Deserializing heavy
# PyTorch model weights spikes RAM usage. Having 8GB of swap prevents the
# Linux kernel OOM killer from sending SIGKILL to the Celery worker process.
setup_swap() {
  local current_swap
  current_swap=$(free -m 2>/dev/null | awk '/Swap:/ {print $2}')
  if [[ "${current_swap:-0}" -lt 4000 ]] && command -v swapon &>/dev/null; then
    head_ "Memory Protection — Swap File Configuration"
    info "Configuring 8GB swap to prevent Linux OOM-killer during model loading..."
    if fallocate -l 8G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=8192 2>/dev/null; then
      chmod 600 /swapfile 2>/dev/null || true
      mkswap /swapfile >/dev/null 2>&1 || true
      swapon /swapfile >/dev/null 2>&1 || true
      ok "8GB swapfile active"
    else
      warn "Could not configure swapfile — proceed with caution on 12GB RAM"
    fi
  fi
}

setup_cuda_124() {
  head_ "CUDA Toolkit 12.4 — Detection & Installation"

  # ── Detect NVIDIA driver ──────────────────────────────────────────────────
  local DRIVER_VER=""
  if command -v nvidia-smi &>/dev/null; then
    DRIVER_VER=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1 || true)
    log "NVIDIA driver: ${CYAN}${DRIVER_VER}${NC}"
  else
    warn "nvidia-smi not found — skipping CUDA setup"
    return 0
  fi

  # ── 1. Check if /usr/local/cuda-12.4 is already on disk ──────────────────
  if [[ -d /usr/local/cuda-12.4 ]] && [[ -x /usr/local/cuda-12.4/bin/nvcc ]]; then
    ok "Found CUDA 12.4 at /usr/local/cuda-12.4 — switching symlink"
    rm -f /usr/local/cuda
    ln -sf /usr/local/cuda-12.4 /usr/local/cuda
    _colab_persist_cuda_paths
    _colab_verify_cuda
    return 0
  fi

  # ── 2. Detect installed CUDA Toolkit version ─────────────────────────────
  local CURRENT_CUDA=""
  if command -v nvcc &>/dev/null; then
    CURRENT_CUDA=$(nvcc --version 2>/dev/null | grep "release" | sed 's/.*release //' | sed 's/,.*//')
    log "CUDA toolkit found: ${CYAN}${CURRENT_CUDA}${NC}"
  elif [[ -L /usr/local/cuda ]] && [[ -e /usr/local/cuda/bin/nvcc ]]; then
    CURRENT_CUDA=$(/usr/local/cuda/bin/nvcc --version 2>/dev/null | grep "release" | sed 's/.*release //' | sed 's/,.*//')
    log "CUDA toolkit found: ${CYAN}${CURRENT_CUDA}${NC} via /usr/local/cuda symlink"
  else
    info "No CUDA toolkit found — will install CUDA 12.4"
  fi

  # ── 3. Check if CUDA 12.4 is already active ───────────────────────────────
  if [[ -n "$CURRENT_CUDA" ]]; then
    local CUDA_MINOR
    CUDA_MINOR=$(echo "$CURRENT_CUDA" | awk -F. '{print $1$2}')
    if [[ "$CUDA_MINOR" == "124" ]]; then
      ok "CUDA 12.4 is already installed and active — no changes needed"
      _colab_persist_cuda_paths
      _colab_verify_cuda
      return 0
    else
      warn "CUDA ${CURRENT_CUDA} installed — switching to CUDA 12.4"
    fi
  fi

  # ── 4. Install CUDA Toolkit 12.4 via APT if missing ─────────────────────
  info "Installing CUDA Toolkit 12.4..."

  # Pre-clean conflicting NVIDIA repo lists to prevent APT Signed-By conflict
  _sanitize_apt_cuda_sources

  local ARCH; ARCH=$(dpkg --print-architecture)
  local UBUNTU_VER_NODOT; UBUNTU_VER_NODOT=$(lsb_release -rs | tr -d '.')
  local URL_ARCH="x86_64"

  # NVIDIA published CUDA 12.4 for Ubuntu 20.04 (2004) and 22.04 (2204), but NOT for 24.04 (2404).
  # If running on Ubuntu >= 24.04 (e.g. Colab Noble), use the 2204 repository for CUDA 12.4 packages.
  local CUDA_REPO_VER="${UBUNTU_VER_NODOT}"
  if [[ "${UBUNTU_VER_NODOT}" -ge 2404 ]]; then
    CUDA_REPO_VER="2204"
  fi

  echo "deb [trusted=yes] https://developer.download.nvidia.com/compute/cuda/repos/ubuntu${CUDA_REPO_VER}/${URL_ARCH}/ /" > /etc/apt/sources.list.d/cuda-12-4.list

  apt-get update -qq 2>/dev/null || true

  # Install CUDA 12.4 toolkit / nvcc
  apt-get install -y --no-install-recommends cuda-toolkit-12-4 2>/dev/null || \
  apt-get install -y --no-install-recommends cuda-nvcc-12-4 cuda-cudart-dev-12-4 libcublas-dev-12-4 2>/dev/null || {
    warn "Failed to install CUDA 12.4 packages — falling back to existing CUDA ${CURRENT_CUDA:-unknown}"
  }

  # Clean up temporary 12.4 source list
  rm -f /etc/apt/sources.list.d/cuda-12-4.list 2>/dev/null || true

  # ── Point /usr/local/cuda to CUDA 12.4 ────────────────────────────────────
  if [[ -d /usr/local/cuda-12.4 ]]; then
    if [[ -L /usr/local/cuda ]]; then
      rm -f /usr/local/cuda
    elif [[ -d /usr/local/cuda ]]; then
      mv /usr/local/cuda /usr/local/cuda-old-backup 2>/dev/null || true
    fi
    ln -sf /usr/local/cuda-12.4 /usr/local/cuda
    ok "/usr/local/cuda → /usr/local/cuda-12.4"
  elif [[ -d /usr/local/cuda ]]; then
    ok "CUDA toolkit installed at /usr/local/cuda"
  else
    warn "CUDA toolkit installed but location unknown"
  fi

  _colab_persist_cuda_paths
  _colab_verify_cuda
}

# ── Persist CUDA environment variables ──────────────────────────────────────────
_colab_persist_cuda_paths() {
  local cuda_dir="/usr/local/cuda"
  if [[ -d /usr/local/cuda-12.4 ]]; then
    cuda_dir="/usr/local/cuda-12.4"
  fi

  cat > /etc/profile.d/cuda.sh << CUDA_ENV
export PATH=${cuda_dir}/bin:/usr/local/cuda/bin:\$PATH
export LD_LIBRARY_PATH=${cuda_dir}/lib64:/usr/local/cuda/lib64:\${LD_LIBRARY_PATH:-}
export CUDA_HOME=${cuda_dir}
CUDA_ENV
  chmod +x /etc/profile.d/cuda.sh

  # Apply for this session
  export PATH="${cuda_dir}/bin:/usr/local/cuda/bin:$PATH"
  export LD_LIBRARY_PATH="${cuda_dir}/lib64:/usr/local/cuda/lib64:${LD_LIBRARY_PATH:-}"
  export CUDA_HOME="${cuda_dir}"

  # Also write to /etc/ld.so.conf.d for persistent library loading
  if [[ -d "${cuda_dir}/lib64" ]]; then
    echo "${cuda_dir}/lib64" > /etc/ld.so.conf.d/cuda.conf
    ldconfig 2>/dev/null || true
  fi

  ok "CUDA environment configured (persisted to /etc/profile.d/cuda.sh)"
}

# ── Verify CUDA is working ─────────────────────────────────────────────────────
_colab_verify_cuda() {
  echo ""
  info "Verifying CUDA installation..."

  # Check nvcc
  local NVCC_BIN=""
  if [[ -x /usr/local/cuda-12.4/bin/nvcc ]]; then
    NVCC_BIN="/usr/local/cuda-12.4/bin/nvcc"
  elif command -v nvcc &>/dev/null; then
    NVCC_BIN=$(command -v nvcc)
  elif [[ -x /usr/local/cuda/bin/nvcc ]]; then
    NVCC_BIN="/usr/local/cuda/bin/nvcc"
  fi

  if [[ -n "$NVCC_BIN" ]]; then
    local VER
    VER=$("$NVCC_BIN" --version 2>/dev/null | grep "release" | sed 's/.*release //' | sed 's/,.*//')
    ok "nvcc: CUDA ${VER}"
  else
    warn "nvcc not found — CUDA toolkit may not be properly installed"
    return 1
  fi

  # Sanity check: CUDA can see the GPU
  if command -v nvidia-smi &>/dev/null; then
    local GPU_COUNT
    GPU_COUNT=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | wc -l)
    if [[ "$GPU_COUNT" -gt 0 ]]; then
      ok "GPU accessible: ${GPU_COUNT} device(s) found"
      nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>/dev/null | head -5 | while IFS= read -r line; do
        echo "    ${CYAN}${line}${NC}"
      done
    else
      warn "No GPUs visible to nvidia-smi"
    fi
  fi

  # Test CUDA runtime: compile and run a tiny program
  if [[ -n "$NVCC_BIN" ]]; then
    local TMP_CUDA; TMP_CUDA=$(mktemp /tmp/cuda_test_XXXXXX.cu)
    cat > "$TMP_CUDA" << 'CUDA_TEST'
#include <stdio.h>
__global__ void kernel() { printf("CUDA works! Thread %d\n", threadIdx.x); }
int main() {
    kernel<<<1, 1>>>();
    cudaError_t err = cudaDeviceSynchronize();
    if (err != cudaSuccess) { printf("CUDA error: %s\n", cudaGetErrorString(err)); return 1; }
    printf("CUDA runtime OK\n");
    return 0;
}
CUDA_TEST
    local TMP_BIN; TMP_BIN="${TMP_CUDA%.cu}"
    if "$NVCC_BIN" -o "$TMP_BIN" "$TMP_CUDA" 2>/dev/null; then
      if "$TMP_BIN" 2>/dev/null; then
        ok "CUDA runtime sanity check passed"
      else
        warn "CUDA program compiled but failed to run — driver issue?"
      fi
    else
      warn "CUDA compilation sanity check failed"
    fi
    rm -f "$TMP_CUDA" "$TMP_BIN"
  fi
}

# ── Helper: Write PID ─────────────────────────────────────────────────────
write_pid() {
    local pid_file=$1
    local pid=$2
    mkdir -p "$(dirname "$pid_file")"
    echo "$pid" > "$pid_file"
}

# ── Helper: Force-kill any process holding a TCP port ──────────────────────
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

# ── Helper: Kill by PID file (graceful TERM -> KILL with process group) ────
kill_by_pid_file() {
    local pid_file=$1
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file" 2>/dev/null || echo "")
        if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
            # Attempt to kill process group first, then direct PID
            kill -TERM -- -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
            for _ in {1..15}; do
                kill -0 "$pid" 2>/dev/null || break
                sleep 0.2
            done
            if kill -0 "$pid" 2>/dev/null; then
                kill -KILL -- -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
            fi
        fi
        rm -f "$pid_file"
    fi
}

# ── Helper: Ensure third_party files are world-rwx (766) ──────────────────
# Colab runs as root but the per-model venvs/weights are often written by a
# different user (or by uv as the invoking user), so generated artifacts can
# end up unreadable by the API/Celery processes that later load them. Force
# rwxrw-r-- (766) on the whole third_party tree so every owner can read and
# write model files. Directories get 775 (rwxrwxr-x) so traversal works.
fix_third_party_permissions() {
    local dir="${PROJECT_ROOT}/backend/third_party"
    if [[ ! -d "$dir" ]]; then
        return 0
    fi
    # Directories: rwxrwxr-x
    find "$dir" -type d -exec chmod 775 {} + 2>/dev/null || true
    # Files: rwxrw-r-- (owner+group rwx, others r)
    find "$dir" -type f -exec chmod 766 {} + 2>/dev/null || true
    log "third_party permissions set to 766 (files) / 775 (dirs)"
}

# ── Helper: Ensure Node.js / Bun is available ────────────────────────────────
# Colab menu/start mode can call colab_start_services() before the full
# bootstrap reaches the frontend setup section. Initialize NVM when present,
# and discover system Node/Bun locations, and install Node 20 only when necessary.
ensure_node_bun() {
    # Prefer an existing NVM installation.
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [[ -s "$NVM_DIR/nvm.sh" ]]; then
        # shellcheck disable=SC1090
        source "$NVM_DIR/nvm.sh"
        if command -v nvm &>/dev/null; then
            if [[ -f "$PROJECT_ROOT/.nvmrc" ]]; then
                nvm use --silent >/dev/null 2>&1 || true
            elif nvm current >/dev/null 2>&1 && [[ "$(nvm current 2>/dev/null)" == "none" ]]; then
                nvm use --silent 20 >/dev/null 2>&1 || true
            fi
        fi
    fi

    # Recover common system locations in non-interactive Colab shells.
    for dir in /usr/local/bin /usr/bin "$HOME/.local/bin"; do
        if [[ -d "$dir" && ":$PATH:" != *":$dir:"* ]]; then
            export PATH="$dir:$PATH"
        fi
    done

    if command -v node &>/dev/null && command -v bun &>/dev/null; then
        log "Node.js available: $(node --version 2>/dev/null || echo unknown), Bun $(bun --version 2>/dev/null || echo unknown)"
        return 0
    fi

    info "Node.js/Bun not found — installing Node.js 20..."
    if command -v curl &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x 2>/dev/null | sudo -E bash - 2>/dev/null || {
            err "Failed to configure NodeSource repository"
            return 1
        }
        sudo apt-get install -y nodejs >/dev/null 2>&1 || {
            err "Failed to install Node.js 20"
            return 1
        }
    else
        err "curl is required to install Node.js/Bun"
        return 1
    fi

    hash -r 2>/dev/null || true
    export PATH="/usr/local/bin:/usr/bin:$PATH"

    if ! command -v node &>/dev/null || ! command -v bun &>/dev/null; then
        err "Node.js/bun installation completed but binaries are still unavailable"
        err "PATH=$PATH"
        return 1
    fi

    log "Node.js ready: $(node --version 2>/dev/null || echo unknown), Bun $(bun --version 2>/dev/null || echo unknown)"
}

# ── Colab Service Management Functions ─────────────────────────────────────
# These functions manage services independently of the bootstrap flow,
# allowing start/stop/restart without re-running the full setup.

# ── Bytecode cache cleanup helper ──────────────────────────────────────────
clean_pycache() {
    info "Cleaning Python bytecode caches (__pycache__ / *.pyc)..."
    find "${PROJECT_ROOT}/backend" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find "${PROJECT_ROOT}/backend" -type f -name "*.py[co]" -delete 2>/dev/null || true
    log "Bytecode caches cleaned"
}

colab_start_services() {
    head_ "Starting AI 3D Studio Services (Colab)"

    # ── Variables ─────────────────────────────────────────────────────────
    PYTHON_BIN="${PROJECT_ROOT}/backend/.venv/bin/python"
    PID_DIR="${PROJECT_ROOT}/.pids"
    LOG_DIR="${PROJECT_ROOT}/logs"
    mkdir -p "$PID_DIR" "$LOG_DIR"

    if [[ ! -x "$PYTHON_BIN" ]]; then
        err "Backend venv not found. Run full setup first: bash scripts/colab.sh"
        return 1
    fi

    # Clean bytecode caches so latest python edits compile fresh
    clean_pycache

    # ── Normalize third_party file permissions (766) ───────────────────────
    # Per-model venvs/weights can be written by a different user than the
    # API/Celery processes that load them; force world-rwx so nothing is
    # unreadable at inference time.
    fix_third_party_permissions

    # ── Ensure PostgreSQL is running ─────────────────────────────────────
    # Detect installed PostgreSQL version dynamically
    PG_VERSION="$(ls /etc/postgresql/ 2>/dev/null | sort -V | tail -1)"
    if [[ -z "$PG_VERSION" ]]; then
        PG_VERSION="14"
    fi
    export PG_VERSION
    info "Detected PostgreSQL version: $PG_VERSION"

    if ! pg_isready -q 2>/dev/null; then
        info "Starting PostgreSQL $PG_VERSION..."
        sudo service postgresql start 2>/dev/null \
            || sudo pg_ctlcluster "$PG_VERSION" main start 2>/dev/null \
            || sudo -u postgres pg_ctl -D "/var/lib/postgresql/$PG_VERSION/main" -l /tmp/pg.log start 2>/dev/null \
            || warn "Could not start PostgreSQL"
        sleep 2
    fi
    if pg_isready -q 2>/dev/null; then
        log "PostgreSQL $PG_VERSION is running"
        # Ensure PostgreSQL listens on 127.0.0.1 (fixes socket.gaierror in Colab)
        PG_CONF="/etc/postgresql/$PG_VERSION/main/postgresql.conf"
        if [[ -f "$PG_CONF" ]] && ! grep -q "^listen_addresses.*127.0.0.1" "$PG_CONF" 2>/dev/null; then
            echo "listen_addresses = '127.0.0.1'" | sudo tee -a "$PG_CONF" > /dev/null 2>&1 || true
            sudo service postgresql reload 2>/dev/null || true
            info "Configured PostgreSQL to listen on 127.0.0.1"
        fi
        # Ensure pg_hba.conf allows local connections
        PG_HBA="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"
        if [[ -f "$PG_HBA" ]] && ! grep -q "host.*all.*all.*127.0.0.1/32.*trust" "$PG_HBA" 2>/dev/null; then
            echo "host all all 127.0.0.1/32 trust" | sudo tee -a "$PG_HBA" > /dev/null 2>&1 || true
            echo "host all all ::1/128 trust" | sudo tee -a "$PG_HBA" > /dev/null 2>&1 || true
            sudo service postgresql reload 2>/dev/null || true
            info "Configured pg_hba.conf for local connections"
        fi
        # Ensure database and user exist (fixes missing DB after reinstall)
        if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='ai_studio'" 2>/dev/null | grep -q 1; then
            info "Creating database 'ai_studio'..."
            sudo -u postgres psql -c "CREATE USER ai_studio WITH PASSWORD 'ai_studio_dev';" 2>/dev/null || true
            sudo -u postgres psql -c "CREATE DATABASE ai_studio OWNER ai_studio;" 2>/dev/null || true
            sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ai_studio TO ai_studio;" 2>/dev/null || true
            log "Database 'ai_studio' created"
        fi
        # Test actual TCP connection (not just pg_isready which uses unix socket)
        if PGPASSWORD="ai_studio_dev" psql -h 127.0.0.1 -U ai_studio -d ai_studio -c "SELECT 1" &>/dev/null; then
            log "TCP connection to PostgreSQL verified"
        else
            warn "TCP connection failed — migrations may fail"
        fi
    else
        warn "PostgreSQL not responding — migrations will be skipped"
    fi

    # ── Ensure Redis is available ─────────────────────────────────────────
    if ! command -v redis-server &>/dev/null; then
        info "Installing Redis..."
        sudo apt-get update -qq 2>/dev/null && sudo apt-get install -y redis-server 2>/dev/null || {
            warn "Could not install Redis — using in-memory fallback"
        }
    fi

    REDIS_AVAILABLE=false
    if command -v redis-server &>/dev/null; then
        if ! redis-cli ping &>/dev/null 2>&1; then
            info "Starting Redis (daemonized)..."
            redis-server --daemonize yes 2>/dev/null || warn "Failed to start Redis"
        fi
        if redis-cli ping &>/dev/null 2>&1; then
            log "Redis is running"
            REDIS_AVAILABLE=true
        else
            warn "Redis not responding — using in-memory fallback"
        fi
    else
        warn "Redis not available — using in-memory fallback"
    fi

    if [[ "$REDIS_AVAILABLE" != "true" ]]; then
        export CELERY_TASK_ALWAYS_EAGER=1
        export CELERY_BROKER_URL="memory://"
        export CELERY_RESULT_BACKEND="cache+memory://"
        export REDIS_URL="memory://"
        sed -i 's|^REDIS_URL=.*|REDIS_URL=memory://|' .env 2>/dev/null || true
        sed -i 's|^CELERY_BROKER_URL=.*|CELERY_BROKER_URL=memory://|' .env 2>/dev/null || true
        sed -i 's|^CELERY_RESULT_BACKEND=.*|CELERY_RESULT_BACKEND=cache+memory://|' .env 2>/dev/null || true
        log "Celery fallback active: eager execution + memory broker (no Redis)"
    fi

    # Strip empty KEY= lines from .env so empty strings don't override defaults
    if [[ -f .env ]]; then
        sed -i -E '/^[A-Za-z0-9_]+=[[:space:]]*$/d' .env 2>/dev/null || true
    fi

    # ── Run migrations (only if PostgreSQL is running) ──────────────────
    step "Running database migrations..."
    if pg_isready -h 127.0.0.1 -p 5432 -q 2>/dev/null; then
        # Wait for full readiness (max 15s)
        for i in $(seq 1 15); do
            if PGPASSWORD=ai_studio_dev psql -h 127.0.0.1 -U ai_studio -d ai_studio -c "SELECT 1" &>/dev/null; then
                break
            fi
            sleep 1
        done
        (
            cd backend
            if [[ -f scripts/validate_env.py ]]; then
                "$PYTHON_BIN" scripts/validate_env.py --quiet 2>/dev/null || python3 scripts/validate_env.py --quiet 2>/dev/null || true
            fi
            MIGRATION_OK=false
            for attempt in 1 2 3; do
                if "$PYTHON_BIN" -m alembic upgrade head 2>&1; then
                    MIGRATION_OK=true
                    break
                fi
                warn "Migration attempt $attempt failed — retrying in 3s..."
                sleep 3
            done
            if [[ "$MIGRATION_OK" == "true" ]]; then
                "$PYTHON_BIN" -m alembic current 2>&1 || true
                log "Migrations complete (schema at head)"
            else
                err "Migrations failed after 3 attempts — refusing to start services against an unknown schema."
                exit 1
            fi
        )
    else
        warn "Skipping migrations — PostgreSQL not running"
    fi

    # ── Start Backend API ─────────────────────────────────────────────────
    step "Starting Backend API (http://localhost:8000)..."
    kill_by_pid_file "$PID_DIR/api.pid"
    pkill -TERM -f "uvicorn app.main:app" 2>/dev/null || true
    free_port 8000
    (
        cd backend
        nohup $PYTHON_BIN -m uvicorn app.main:app \
            --host 0.0.0.0 \
            --port 8000 \
            --log-level info \
            > "$LOG_DIR/api.log" 2>&1 &
        write_pid "$PID_DIR/api.pid" $!
    )
    log "Backend API started (PID: $(cat $PID_DIR/api.pid))"

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

    if ! curl -sf http://localhost:8000/api/v1/health &>/dev/null; then
        err "Backend API failed to become healthy. See logs/api.log"
        return 1
    fi

    # ── Colab Keep-Alive (Browser-Level) ───────────────────────────────────
    # Colab kills background processes (nohup/sleep) during idle cleanup, so
    # uvicorn/celery/bun die a few minutes after the cell that started them
    # finishes. The ONLY reliable keep-alive is browser JS that dispatches
    # synthetic events. The script must run in a Colab NOTEBOOK CELL, not
    # from inside !bash (IPython.display only works in the notebook kernel).
    KEEPALIVE_JS_PY="${PROJECT_ROOT}/scripts/colab_keepalive_js.py"
    if [[ -f "$KEEPALIVE_JS_PY" ]]; then
        log "Keep-alive script ready at: $KEEPALIVE_JS_PY"
        log ""
        log "  >>> RUN THIS IN A COLAB CELL TO KEEP SERVICES ALIVE:"
        log "  >>> exec(open('${KEEPALIVE_JS_PY}').read())"
        log ""
        log "  (Colab kills background processes during idle cleanup — without"
        log "   this, the frontend and API turn off after a few minutes.)"
    else
        warn "Keep-alive script missing: $KEEPALIVE_JS_PY"
        warn "Without it, Colab idle cleanup will kill the frontend/API after a few minutes."
    fi

    # ── Start Celery Worker ───────────────────────────────────────────────
    step "Starting Celery Worker..."
    kill_by_pid_file "$PID_DIR/worker.pid"
    pkill -TERM -f "celery -A app.workers.celery_app worker" 2>/dev/null || true
    CELERY_BROKER_ARG=""
    CELERY_BACKEND_ARG=""
    if [[ "$REDIS_AVAILABLE" != "true" ]]; then
        CELERY_BROKER_ARG="--broker memory://"
        CELERY_BACKEND_ARG="--backend cache+memory://"
    fi
    (
        cd backend
        set -a; source ../.env 2>/dev/null || true; set +a
        nohup $PYTHON_BIN -m celery -A app.workers.celery_app worker \
            $CELERY_BROKER_ARG \
            $CELERY_BACKEND_ARG \
            --loglevel=info \
            --pool=solo \
            --concurrency=1 \
            -Q generation,images \
            > "$LOG_DIR/worker.log" 2>&1 &
        write_pid "$PID_DIR/worker.pid" $!
    )
    log "Celery Worker started (PID: $(cat $PID_DIR/worker.pid))"

    # ── Start Frontend ────────────────────────────────────────────────────
    step "Starting Frontend (http://localhost:3000)..."

    cd "$PROJECT_ROOT"
    if ! ensure_node_bun; then
        err "Frontend cannot start because Node.js/Bun is unavailable."
        return 1
    fi

    if [[ ! -d node_modules ]]; then
        info "Installing Bun dependencies..."
        if ! bun ci > "$LOG_DIR/bun_install.log" 2>&1; then
            err "bun install FAILED — see logs/bun_install.log"
            return 1
        fi
    fi

    FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
    kill_by_pid_file "$FRONTEND_PID_FILE"
    pkill -TERM -f "next start" 2>/dev/null || true
    pkill -TERM -f "next-server" 2>/dev/null || true
    free_port 3000

    # Normal Next.js production workflow: `bun run build` then `bun start`.
    # Rebuild if .next is missing or if source files were modified since last build.
    local needs_build=false
    if [[ ! -d .next ]] || [[ ! -f .next/BUILD_ID ]]; then
        needs_build=true
    elif [[ -n $(find app services features components hooks lib -newer .next/BUILD_ID -type f 2>/dev/null | head -1) ]]; then
        needs_build=true
    fi

    if [[ "$needs_build" == "true" ]]; then
        info "Building Next.js for production..."
        if ! bun run build > "$LOG_DIR/frontend_build.log" 2>&1; then
            err "Frontend build FAILED — see logs/frontend_build.log"
            return 1
        fi
    fi

    (
        export HOSTNAME=0.0.0.0
        export PORT=3000
        export BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
        if [[ "$BACKEND_URL" == *"api:8000"* ]]; then
            BACKEND_URL="http://127.0.0.1:8000"
        fi
        export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-}"
        nohup bun start > "$LOG_DIR/frontend.log" 2>&1 &
        write_pid "$FRONTEND_PID_FILE" $!
    )
    log "Frontend started (bun start, PID: $(cat $FRONTEND_PID_FILE))"

    # ── Post-Start Verification ────────────────────────────────────────────
    # Verify every service is actually serving before declaring success. Colab
    # can silently drop background processes; catching it here gives the user
    # a clear action instead of a vague "services turned off" later.
    info "Verifying services are alive..."
    local all_ok=true

    if curl -sf "http://127.0.0.1:8000/api/v1/health" &>/dev/null; then
        log "api OK"
    else
        err "api NOT RESPONDING on port 8000"
        all_ok=false
    fi

    local frontend_ok=false
    for i in {1..30}; do
        if curl -sf "http://127.0.0.1:3000/" &>/dev/null; then
            frontend_ok=true
            break
        fi
        sleep 2
    done

    if [[ "$frontend_ok" == "true" ]]; then
        log "frontend OK"
    else
        err "frontend NOT RESPONDING on port 3000"
        all_ok=false
    fi


    if [[ "$all_ok" == "true" ]]; then
        log "All services verified running"
    else
        err "One or more required services failed to start."
        err "STARTUP FAILED — check logs/api.log and logs/frontend.log"
        return 1
    fi

    # ── Summary ───────────────────────────────────────────────────────────
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}  ${GREEN}✅ All Services Started${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BOLD}Endpoints:${NC}"
    echo -e "    Frontend       ${CYAN}http://localhost:3000${NC}"
    echo -e "    Backend API    ${CYAN}http://localhost:8000${NC}"
    echo -e "    API Docs       ${CYAN}http://localhost:8000/docs${NC}"
    echo ""
    echo -e "  ${BOLD}Management:${NC}"
    echo -e "    Stop           : bash scripts/colab.sh --stop"
    echo -e "    Restart        : bash scripts/colab.sh --restart"
    echo ""
    echo -e "  ${BOLD}Auto-restart (survives Colab idle cleanup):${NC}"
    echo -e "    Watchdog       : bash scripts/colab_watch.sh"
    echo ""
    echo -e "  ${YELLOW}Note:${NC} Colab kills background processes during idle cleanup, so"
    echo -e "  services can turn off after a few minutes. The watchdog auto-restarts"
    echo -e "  them — no manual keep-alive required."
    echo ""

    # ── Auto-restart Watchdog ──────────────────────────────────────────────
    # Colab kills background processes during idle cleanup, so the API,
    # Celery, and Frontend can die minutes after this script returns. The
    # watchdog runs indefinitely in the terminal and auto-restarts any
    # service that goes down — no manual keep-alive required.
    kill_by_pid_file "$PID_DIR/watchdog.pid"
    if [[ "${FOREGROUND_SUPERVISOR:-true}" != "true" ]]; then
        nohup bash scripts/colab_watch.sh > "$LOG_DIR/watchdog.log" 2>&1 &
        write_pid "$PID_DIR/watchdog.pid" $!
        log "Watchdog started (PID: $(cat $PID_DIR/watchdog.pid)) — auto-restarts services if Colab kills them."
    fi
}

colab_stop_services() {
    head_ "Stopping AI 3D Studio Services (Colab)"

    PID_DIR="${PROJECT_ROOT}/.pids"

    # ── 1. Stop the Colab foreground supervisor and watchdog FIRST ─────────────
    # If the supervisor remains alive while we terminate services, it will
    # interpret the stop as a failure and immediately restart them.
    SUPERVISOR_PID_FILE="${PID_DIR}/supervisor.pid"
    if [[ -f "$SUPERVISOR_PID_FILE" ]]; then
        local supervisor_pid
        supervisor_pid="$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null || true)"
        if [[ "$supervisor_pid" =~ ^[0-9]+$ ]] && kill -0 "$supervisor_pid" 2>/dev/null; then
            info "Stopping Colab foreground supervisor (PID: $supervisor_pid)..."
            kill -TERM "$supervisor_pid" 2>/dev/null || true
            for _ in {1..15}; do
                kill -0 "$supervisor_pid" 2>/dev/null || break
                sleep 0.2
            done
            if kill -0 "$supervisor_pid" 2>/dev/null; then
                warn "Supervisor did not exit gracefully; force killing it."
                kill -KILL "$supervisor_pid" 2>/dev/null || true
            fi
        fi
        rm -f "$SUPERVISOR_PID_FILE"
    fi

    if [[ -f "$PID_DIR/watchdog.pid" ]]; then
        info "Stopping Watchdog..."
        kill_by_pid_file "$PID_DIR/watchdog.pid"
        log "Watchdog stopped"
    fi
    pkill -KILL -f "colab_watch.sh" 2>/dev/null || true

    # ── 2. Stop Frontend (process group + node children + port 3000) ───────────
    info "Stopping Frontend..."
    kill_by_pid_file "$PID_DIR/frontend.pid"
    pkill -TERM -f "next start" 2>/dev/null || true
    pkill -TERM -f "next-server" 2>/dev/null || true
    free_port 3000
    log "Frontend stopped"

    # ── 3. Stop Celery Worker ──────────────────────────────────────────────────
    info "Stopping Celery Worker..."
    kill_by_pid_file "$PID_DIR/worker.pid"
    pkill -TERM -f "celery.*app.workers.celery_app" 2>/dev/null || true
    log "Celery Worker stopped"

    # ── 4. Stop Backend API ────────────────────────────────────────────────────
    info "Stopping Backend API..."
    kill_by_pid_file "$PID_DIR/api.pid"
    pkill -TERM -f "uvicorn app.main:app" 2>/dev/null || true
    free_port 8000
    log "Backend API stopped"

    # ── 5. Stop Keep-Alive ─────────────────────────────────────────────────────
    if [[ -f "$PID_DIR/colab_keepalive.pid" ]]; then
        info "Stopping Keep-Alive..."
        kill_by_pid_file "$PID_DIR/colab_keepalive.pid"
        pkill -f "colab_keepalive" 2>/dev/null || true
        log "Keep-Alive stopped"
    fi

    # Clean up stale PID and restart counters
    rm -f "${PID_DIR}"/*.pid "${PID_DIR}"/*.restart-count 2>/dev/null || true

    # Stop PostgreSQL (if running)
    if command -v pg_isready &>/dev/null && pg_isready -q 2>/dev/null; then
        info "Stopping PostgreSQL ${PG_VERSION:-$(ls /etc/postgresql/ 2>/dev/null | sort -V | tail -1)}..."
        sudo service postgresql stop 2>/dev/null \
            || sudo pg_ctlcluster "${PG_VERSION:-$(ls /etc/postgresql/ 2>/dev/null | sort -V | tail -1)}" main stop 2>/dev/null \
            || sudo -u postgres pg_ctl -D "/var/lib/postgresql/${PG_VERSION:-$(ls /etc/postgresql/ 2>/dev/null | sort -V | tail -1)}/main" stop 2>/dev/null \
            || true
        sleep 1
        if pg_isready -q 2>/dev/null; then
            warn "PostgreSQL did not stop gracefully — forcing..."
            sudo pg_ctlcluster "${PG_VERSION:-$(ls /etc/postgresql/ 2>/dev/null | sort -V | tail -1)}" main stop -m immediate 2>/dev/null || true
            sleep 1
        fi
        log "PostgreSQL stopped"
    fi

    # Stop Redis (if running)
    if command -v redis-cli &>/dev/null && redis-cli ping 2>/dev/null | grep -q PONG; then
        info "Stopping Redis..."
        redis-cli shutdown nosave 2>/dev/null || sudo service redis-server stop 2>/dev/null || true
        sleep 1
        log "Redis stopped"
    fi

    # Clean up stale bytecode caches
    clean_pycache

    log "All services stopped"
}

colab_restart_services() {
    head_ "Restarting AI 3D Studio Services (Colab)"

    # Stop all services cleanly
    colab_stop_services

    # Clean bytecode caches
    clean_pycache

    # Wait for ports to be released
    info "Ensuring all ports are released..."
    free_port 8000
    free_port 3000
    sleep 2

    # Start all services
    colab_start_services
}

# ── Colab Interactive Launcher ────────────────────────────────────────────
# Interactive menu for managing Colab services.

colab_interactive() {
    while true; do
        echo ""
        echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}${BOLD}║${NC}           ${BOLD}AI 3D Studio — Colab Launcher${NC}                 ${CYAN}${BOLD}║${NC}"
        echo -e "${CYAN}${BOLD}╠════════════════════════════════════════════════════════════╣${NC}"
        echo -e "${CYAN}${BOLD}║${NC}                                                            ${CYAN}${BOLD}║${NC}"
        echo -e "${CYAN}${BOLD}║${NC}  ${GREEN}[1]${NC} ${BOLD}Setup${NC}      — Full bootstrap + start all services     ${CYAN}${BOLD}║${NC}"
        echo -e "${CYAN}${BOLD}║${NC}  ${GREEN}[2]${NC} ${BOLD}Start${NC}      — Start services (skip setup)             ${CYAN}${BOLD}║${NC}"
        echo -e "${CYAN}${BOLD}║${NC}  ${GREEN}[3]${NC} ${BOLD}Stop${NC}       — Stop all running services               ${CYAN}${BOLD}║${NC}"
        echo -e "${CYAN}${BOLD}║${NC}  ${GREEN}[4]${NC} ${BOLD}Restart${NC}    — Stop + Start services                    ${CYAN}${BOLD}║${NC}"
        echo -e "${CYAN}${BOLD}║${NC}  ${GREEN}[5]${NC} ${BOLD}Status${NC}     — Check service status                     ${CYAN}${BOLD}║${NC}"
        echo -e "${CYAN}${BOLD}║${NC}                                                            ${CYAN}${BOLD}║${NC}"
        echo -e "${CYAN}${BOLD}║${NC}  ${RED}[q]${NC} ${BOLD}Quit${NC}                                                 ${CYAN}${BOLD}║${NC}"
        echo -e "${CYAN}${BOLD}║${NC}                                                            ${CYAN}${BOLD}║${NC}"
        echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        if ! read -rp "  Choice: " choice; then
            echo -e "\n  [COLAB] Non-interactive environment detected — proceeding with setup (1)"
            RUN_FULL_SETUP=true
            return 0
        fi
        echo ""
        case "$choice" in
            1)
                # Full setup is handled by the main flow below
                RUN_FULL_SETUP=true
                return 0
                ;;
            2)
                colab_start_services
                # Keep the Colab shell/session alive by making the supervisor
                # the foreground process. Without this, Colab can reap the
                # background service tree when the launcher returns.
                exec bash "${PROJECT_ROOT}/scripts/colab_watch.sh" --foreground
                ;;
            3)
                colab_stop_services
                return 0
                ;;
            4)
                colab_restart_services
                # Continue as a foreground supervisor after restart.
                exec bash "${PROJECT_ROOT}/scripts/colab_watch.sh" --foreground
                ;;
            5)
                _colab_show_status
                ;;
            q|Q)
                echo -e "${GREEN}  Goodbye! 👋${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}  Invalid choice${NC}"
                ;;
        esac
    done
}

_colab_show_status() {
    PID_DIR="${PROJECT_ROOT}/.pids"
    echo -e "${CYAN}Service Status:${NC}"

    # Backend API — verify via HTTP, not just PID liveness (kill -0 gives
    # false negatives on Colab's PID namespaces).
    if curl -sf http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1; then
        echo -e "${GREEN}●${NC} Backend API (port 8000)"
    else
        echo -e "${RED}●${NC} Backend API"
    fi

    # Celery Worker — no HTTP endpoint, check PID liveness.
    if [[ -f "$PID_DIR/worker.pid" ]] && kill -0 "$(cat "$PID_DIR/worker.pid")" 2>/dev/null; then
        echo -e "${GREEN}●${NC} Celery Worker (PID: $(cat "$PID_DIR/worker.pid"))"
    else
        echo -e "${RED}●${NC} Celery Worker"
    fi

    # Frontend — verify via HTTP.
    if curl -sf http://127.0.0.1:3000/ >/dev/null 2>&1; then
        echo -e "${GREEN}●${NC} Frontend (port 3000)"
    else
        echo -e "${RED}●${NC} Frontend"
    fi

    # PostgreSQL
    if command -v pg_isready &>/dev/null; then
        pg_isready -q 2>/dev/null && echo -e "${GREEN}●${NC} PostgreSQL" || echo -e "${RED}●${NC} PostgreSQL"
    else
        echo -e "${RED}●${NC} PostgreSQL"
    fi

    # Redis
    if command -v redis-cli &>/dev/null; then
        redis-cli ping 2>/dev/null | grep -q PONG && echo -e "${GREEN}●${NC} Redis" || echo -e "${RED}●${NC} Redis"
    else
        echo -e "${RED}●${NC} Redis"
    fi

    # Watchdog — report whether the auto-restart loop is running.
    if [[ -f "$PID_DIR/watchdog.pid" ]] && kill -0 "$(cat "$PID_DIR/watchdog.pid")" 2>/dev/null; then
        echo -e "${GREEN}●${NC} Watchdog (auto-restart, PID: $(cat "$PID_DIR/watchdog.pid"))"
    else
        echo -e "${YELLOW}●${NC} Watchdog (not running — services may die on idle cleanup)"
    fi
    echo ""
}

# ── Handle CLI Action Flags ──────────────────────────────────────────────
if [[ -n "${ACTION:-}" ]]; then
    case "$ACTION" in
        stop)
            colab_stop_services
            exit 0
            ;;
        restart)
            colab_restart_services
            exec bash "${PROJECT_ROOT}/scripts/colab_watch.sh" --foreground
            ;;
        start)
            colab_start_services
            exec bash "${PROJECT_ROOT}/scripts/colab_watch.sh" --foreground
            ;;
        setup)
            RUN_FULL_SETUP=true
            ;;
        status)
            _colab_show_status
            exit 0
            ;;
    esac
fi

# ── Interactive Launcher (default when no flags) ─────────────────────────
# If no setup flags were passed, show the interactive menu.

if [[ "${ACTION:-}" != "setup" && "$SKIP_START" != "true" && "$REPOS_ONLY" != "true" && "$WEIGHTS_ONLY" != "true" ]]; then
    colab_interactive
    # If user chose Setup (option 1), continue with full bootstrap
    if [[ "${RUN_FULL_SETUP:-}" != "true" ]]; then
        exit 0
    fi
fi
# ── Step 1: Environment Setup ─────────────────────────────────────────────

step "1/6 Google Colab environment setup"

# Ensure uv is available
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
else
    log "uv already available: $(uv --version | head -1)"
fi

# ponytail: some hosted shells (e.g. Colab) wrap `uv` in an alias/function that
# injects the deprecated `--system` flag, which only `uv venv` complains about
# ("--system has no effect"). Strip any wrapper so we call the real binary and
# avoid the noisy, harmless warning. No-op when no wrapper exists.
unalias uv 2>/dev/null || true
unset -f uv 2>/dev/null || true

# Colab: install and start PostgreSQL + Redis
info "Setting up PostgreSQL..."
if ! command -v psql &>/dev/null; then
    sudo apt-get update -qq 2>/dev/null && sudo apt-get install -y postgresql postgresql-contrib redis-server 2>/dev/null || {
        warn "Could not install PostgreSQL/Redis via apt — attempting manual install..."
        apt-get update -qq && apt-get install -y postgresql postgresql-contrib redis-server || true
    }
fi

# Start PostgreSQL if not running
if ! pg_isready -q 2>/dev/null; then
    sudo service postgresql start 2>/dev/null || sudo pg_ctlcluster $(ls /etc/postgresql/) main start 2>/dev/null || {
        # Manual start if service commands fail
        sudo -u postgres pg_ctl -D /var/lib/postgresql/$(ls /var/lib/postgresql/)/main -l /tmp/pg.log start 2>/dev/null || true
    }
    sleep 2
fi

# Create database and user if they don't exist
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='ai_studio'" 2>/dev/null | grep -q 1; then
    log "Database 'ai_studio' already exists"
else
    sudo -u postgres psql -c "CREATE USER ai_studio WITH PASSWORD 'ai_studio_dev';" 2>/dev/null || true
    sudo -u postgres psql -c "CREATE DATABASE ai_studio OWNER ai_studio;" 2>/dev/null || true
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ai_studio TO ai_studio;" 2>/dev/null || true
    log "Created PostgreSQL database 'ai_studio' with user 'ai_studio'"
fi

# Start Redis if not running
if ! redis-cli ping &>/dev/null 2>&1; then
    sudo service redis-server start 2>/dev/null || redis-server --daemonize yes 2>/dev/null || true
    sleep 1
fi
if redis-cli ping &>/dev/null 2>&1; then
    log "Redis is running"
else
    warn "Redis not responding — Celery will use in-memory fallback"
fi

GPU_TYPE=$(detect_gpu)
CUDA_VERSION=$(detect_cuda_version)
log "GPU : ${CYAN}${GPU_TYPE}${NC}"
log "CUDA: ${CYAN}cu${CUDA_VERSION}${NC}"

# ── Ensure Swap Space is active (prevents OOM kills during PyTorch model load) ─
setup_swap || warn "Swap setup had issues"

# ── Ensure CUDA Toolkit 12.4 is installed and active ──────────────────────────
if [[ "$GPU_TYPE" == "gpu" ]]; then
  setup_cuda_124 || warn "CUDA 12.4 setup had issues — may use existing version"
  # Force CUDA 12.4 for PyTorch wheel index to match the installed toolkit
  CUDA_VERSION=124
fi

# ── Install Blender ──────────────────────────────────────────────────────
install_blender() {
    if command -v blender &>/dev/null; then
        log "Already installed: $(blender --version 2>/dev/null | head -1)"
        return 0
    fi
    info "Installing Blender..."
    sudo apt-get install -y blender 2>/dev/null || {
        warn "Blender not in apt — downloading from blender.org..."
        local BLENDER_VER="4.2.3"
        local BLENDER_URL="https://download.blender.org/release/Blender4.2/blender-${BLENDER_VER}-linux-x64.tar.xz"
        wget -q "$BLENDER_URL" -O /tmp/blender.tar.xz || {
            warn "Failed to download Blender — post-processing will be unavailable"
            return 0
        }
        sudo tar -xJf /tmp/blender.tar.xz -C /opt/
        sudo ln -sf "/opt/blender-${BLENDER_VER}-linux-x64/blender" /usr/local/bin/blender
        rm -f /tmp/blender.tar.xz
        log "Blender $BLENDER_VER installed to /opt/"
    }
}

install_blender || warn "Blender install skipped — post-processing may be unavailable"

export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-}"

# ── Step 2: Configure .env ────────────────────────────────────────────────

step "2/6 Configuring project environment"

if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
        cp .env.example .env
        log "Created .env from .env.example"
    else
        warn "No .env.example found — creating minimal .env"
        cat > .env << 'ENVEOF'
DATABASE_URL=postgresql+asyncpg://ai_studio:ai_studio_dev@127.0.0.1:5432/ai_studio
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
BACKEND_URL=http://localhost:8000
CUDA_DEVICE=auto
DEBUG=false
ENVIRONMENT=development
ENVEOF
        log "Created minimal .env with PostgreSQL"
    fi
fi

# Strip unpopulated KEY= lines from .env so empty strings don't override defaults
if [[ -f .env ]]; then
    sed -i -E '/^[A-Za-z0-9_]+=[[:space:]]*$/d' .env 2>/dev/null || true
fi

# Load .env
set -a
source .env
set +a

export DATABASE_URL="postgresql+asyncpg://ai_studio:ai_studio_dev@127.0.0.1:5432/ai_studio"
export BACKEND_URL="http://localhost:8000"

# Update .env file to match
sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql+asyncpg://ai_studio:ai_studio_dev@127.0.0.1:5432/ai_studio|' .env 2>/dev/null || true

log "Environment configured (PostgreSQL mode)"

# ── GPU / platform parity with setup.sh ────────────────────────────────────
# Mirror setup.sh's GPU block, but keep GPU auto-detection intact so multi-GPU
# Colab VMs (e.g. 2× A100) expose every device to the engine and the UI's
# 2-GPU pills. Do NOT hardcode CUDA_VISIBLE_DEVICES — leave it unset so the
# runtime enumerates all available GPUs.
export CUDA_DEVICE="auto"
export PLATFORM_MODE="gpu"
export CPU_FALLBACK="false"
log "GPU mode: ${CYAN}${GPU_TYPE}${NC} (auto-detect, all devices)"

# ── Step 3: Create storage directories ────────────────────────────────────

step "3/6 Creating project directory structure"

mkdir -p backend/storage/uploads
mkdir -p backend/storage/models
mkdir -p backend/storage/thumbnails
mkdir -p backend/storage/exports
mkdir -p backend/storage/images
mkdir -p backend/third_party/.hf_cache/hub
mkdir -p backend/.runtime_cache
mkdir -p logs
    mkdir -p .pids

    # Ensure third_party files are world-rwx (766) so per-model venvs/weights
    # are readable/writable by every process that loads them.
    fix_third_party_permissions

    log "Project directories created"

# ── Step 3.5: System Dependencies for C Extensions ──────────────────────────
# Install system-level build deps for PIL, imageio, and native extensions
# Required on Colab to prevent "PIL C extension" and compilation failures

step "3.5/6 Installing system dependencies for image processing & C extensions"

# Check if running on Colab
if [[ -n "${COLAB_RELEASE_TAG:-}" ]]; then
    info "Detected Google Colab — installing system build dependencies..."
    _sanitize_apt_cuda_sources
    sudo apt-get update -qq >/dev/null 2>&1 || apt-get update -qq >/dev/null 2>&1 || true
    sudo apt-get install -y -qq \
        build-essential libpng-dev libjpeg-dev zlib1g-dev libharfbuzz-dev \
        libfreetype6-dev liblcms2-dev libopenjp2-7-dev libtiff-dev libwebp-dev \
        ninja-build pkg-config python3-venv python3-pip python3-yaml xvfb \
        libglu1-mesa libgl1 >/dev/null 2>&1 || true
    ok "System build dependencies installed for Colab"
else
    info "Non-Colab environment — assuming system deps available"
fi

# ── Step 4: Backend Python environment ────────────────────────────────────

step "4/6 Setting up backend Python environment"

# Resolve base Python binary safely without tripping set -o pipefail
clean_path=$(echo "$PATH" | tr ':' '\n' | grep -v '^/commands' | tr '\n' ':' | sed 's/:$//')
py_bin=""
for cand in "python${BACKEND_PYTHON_VERSION:-3.12}" python3.12 python3.11 python3.10 python3 python; do
    cand_path=$(PATH="$clean_path" command -v "$cand" 2>/dev/null || true)
    if [[ -n "$cand_path" && -x "$cand_path" ]]; then
        py_bin="$cand_path"
        break
    fi
done
if [[ -z "$py_bin" ]]; then
    for cand in "python${BACKEND_PYTHON_VERSION:-3.12}" python3.12 python3.11 python3.10 python3 python; do
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
        info "Existing backend/.venv is corrupted — removing..."
        rm -rf backend/.venv
    fi
    info "Creating backend virtual environment using Python venv ($py_bin)..."
    "$py_bin" -m venv backend/.venv || "$py_bin" -c "import venv; venv.create('backend/.venv', with_pip=True)" || uv venv backend/.venv || {
        err "Failed to create backend venv"
        exit 1
    }
    log "Backend venv created"
else
    log "Backend venv already exists at backend/.venv"
fi

# Explicitly activate before installing anything
# shellcheck disable=SC1091
source backend/.venv/bin/activate

# Verify activation
info "Verifying virtual environment activation:"
info "  which python: $(which python)"
info "  which pip:    $(which pip)"
ACTUAL_PREFIX=$(python -c "import sys; print(sys.prefix)")
info "  sys.prefix:   $ACTUAL_PREFIX"
EXPECTED_PREFIX="$(cd backend/.venv && pwd)"
if [[ "$ACTUAL_PREFIX" != "$EXPECTED_PREFIX" ]]; then
    err "Virtual environment verification failed: sys.prefix ($ACTUAL_PREFIX) != expected ($EXPECTED_PREFIX)"
    deactivate 2>/dev/null || true
    exit 1
fi

# Install PyTorch (GPU or CPU depending on hardware) - ONLY uv used inside activated venv
VENV_PY="${PROJECT_ROOT}/backend/.venv/bin/python"
if [[ "$GPU_TYPE" == "gpu" ]]; then
    # Normalize CUDA version for PyTorch wheel index
    # All 3D models (Hunyuan3D, TRELLIS, TripoSG) require PyTorch 2.5.1 with CUDA.
    # PyTorch 2.5.1 published stable CUDA wheels for cu118, cu121, cu124.
    # CUDA 12.2 through 12.8+ runtimes are 100% backward compatible with cu124 wheels.
    CUDA_INDEX="${CUDA_VERSION:-124}"
    TORCH_VER="2.5.1"
    TORCHVISION_VER="0.20.1"
    TORCHAUDIO_VER="2.5.1"
    if [[ "$CUDA_INDEX" == "120" || "$CUDA_INDEX" == "121" ]]; then
        CUDA_INDEX="121"
    elif [[ "$CUDA_INDEX" == "118" ]]; then
        CUDA_INDEX="118"
    else
        CUDA_INDEX="124"
    fi
    info "Installing PyTorch ${TORCH_VER} with CUDA ${CUDA_INDEX} via uv..."
    uv pip install --python "$VENV_PY" \
        torch==${TORCH_VER} torchvision==${TORCHVISION_VER} torchaudio==${TORCHAUDIO_VER} \
        --index-url "https://download.pytorch.org/whl/cu${CUDA_INDEX}" -q 2>>"$PROJECT_ROOT/logs/bootstrap.log" || {
        warn "PyTorch CUDA install failed, trying CPU fallback..."
        uv pip install --python "$VENV_PY" torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
            --index-url https://download.pytorch.org/whl/cpu -q 2>>"$PROJECT_ROOT/logs/bootstrap.log" || true
    }
else
    info "Installing PyTorch CPU-only via uv..."
    uv pip install --python "$VENV_PY" torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
        --index-url https://download.pytorch.org/whl/cpu -q 2>>"$PROJECT_ROOT/logs/bootstrap.log" || true
fi

# Ensure core manifest & bootstrap dependencies are present in backend environment
uv pip install --python "$VENV_PY" pyyaml packaging -q 2>>"$PROJECT_ROOT/logs/bootstrap.log" || true

# Install backend deps using uv inside activated venv
if [[ -f backend/requirements.txt ]]; then
    info "Installing backend dependencies..."
    uv pip install --python "$VENV_PY" -r backend/requirements.txt -q 2>>"$PROJECT_ROOT/logs/bootstrap.log" || {
        warn "Some backend dependencies may have failed to install — check logs/bootstrap.log"
    }
    if ! "$VENV_PY" -c "import yaml" &>/dev/null; then
        uv pip install --python "$VENV_PY" pyyaml packaging -q 2>>"$PROJECT_ROOT/logs/bootstrap.log" || true
    fi
    log "Backend dependencies installed"
else
    warn "backend/requirements.txt not found — skipping backend deps"
fi

deactivate 2>/dev/null || true

# ── Step 5: Frontend ──────────────────────────────────────────────────────

step "5/6 Setting up frontend"

# Ensure Node.js / Bun is available before any frontend Bun command.
if ! ensure_node_bun; then
    err "Node.js/Bun setup failed — cannot continue frontend setup."
    exit 1
fi

# Ensure gltf-transform CLI is installed for post-processing optimization
if ! command -v gltf-transform &>/dev/null; then
    info "Installing gltf-transform CLI for mesh compression..."
    bun install -g @gltf-transform/cli >/dev/null 2>&1 || warn "Failed to install @gltf-transform/cli globally"
fi

# Install frontend deps
if [[ ! -d node_modules ]]; then
    info "Installing Bun dependencies..."
    bun ci 2>>"$PROJECT_ROOT/logs/bootstrap.log" | while IFS= read -r line; do
        if [[ "$line" =~ added|up.to.date|packages ]]; then
            echo -e "    ${GREEN}✔${NC} $line"
        fi
    done || bun install 2>>"$PROJECT_ROOT/logs/bootstrap.log" || {
        warn "Frontend dependency installation had issues"
    }
fi

# Build Next.js if needed
if [[ ! -d .next ]]; then
    echo -e "  ${BOLD}Building Next.js...${NC}"
    bun run build 2>>"$PROJECT_ROOT/logs/bootstrap.log" | while IFS= read -r line; do
        if [[ "$line" =~ Compiled|compiled|success|Ready|route ]]; then
            echo -e "    ${CYAN}→${NC} $line"
        fi
    done || warn "Next.js build failed — will retry on start"
fi

log "Frontend dependencies ready"

# ── Per-model virtual environments (clone + isolated venvs) ───────────────
# Reuses backend/runtime/installer.py — the single source of truth used by
# setup.sh. Doing it here (instead of a raw `uv pip install -r`) is required
# so the same Py3.12 pin rewrites, CUDA-less package drop, and
# scikit_build_core pre-install apply on Colab/Kaggle (which may be CPU-only
# or Py3.12, the exact cases that broke setup.sh before).
# ponytail: do NOT re-implement uv pip install here; it would silently
# regress on Py3.12 / no-CUDA hosts.

prepare_model_runtimes() {
    step "Preparing model runtimes (clone + venvs + deps)"
    local PYTHONBIN="${PROJECT_ROOT}/backend/.venv/bin/python"
    [[ -x "$PYTHONBIN" ]] || { err "Backend venv missing — run full bootstrap first"; return 1; }
    if ! "$PYTHONBIN" -c "import yaml" &>/dev/null; then
        info "Installing PyYAML for manifest loading..."
        uv pip install --python "$PYTHONBIN" pyyaml packaging -q 2>>"$PROJECT_ROOT/logs/bootstrap.log" || true
    fi
    (
        cd backend
        PYTHONPATH=. "$PYTHONBIN" - << 'PYEOF'
import datetime
import logging
import os as _os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="  %(levelname)-5s %(name)s: %(message)s")
sys.path.insert(0, str(Path(".").resolve()))

try:
    from runtime.capability import (
        get_model_vram_required,
        is_model_preparable_for_colab,
        get_colab_incompatibility_reason,
    )
    from runtime.installer import prepare_runtime, download_model_weights, get_install_status
    from runtime.manifest_loader import REPOS, PROVIDER_METADATA
    from runtime.storage import get_storage_config
except Exception as exc:
    print(f"  [FAIL] Could not import runtime modules: {exc}")
    sys.exit(1)

storage = get_storage_config()


def _run(cmd, cwd=None):
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    return result.returncode, result.stdout, result.stderr


def validate_repo(repo_name):
    repo_path = storage.get_repo_path(repo_name)
    repo_cfg = REPOS.get(repo_name)

    if not repo_path.exists():
        return False, "missing"
    if not (repo_path / ".git").exists():
        return False, "not_a_git_repo"
    if repo_cfg:
        req = repo_cfg.get("requirements")
        if req and not (repo_path / req).exists():
            if not (repo_path / "pyproject.toml").exists() and not (repo_path / "setup.py").exists():
                return False, "missing_requirements"
    code, _, _ = _run(["git", "status", "--porcelain"], cwd=repo_path)
    if code != 0:
        return False, "git_status_failed"
    return True, "ok"


def validate_venv(repo_name):
    venv_dir = storage.get_model_venv_path(repo_name)
    if platform.system() == "Windows":
        venv_python = venv_dir / "Scripts" / "python.exe"
    else:
        venv_python = venv_dir / "bin" / "python"

    if not venv_dir.exists() or not venv_python.exists():
        return False, "missing"
    code, _, _ = _run([str(venv_python), "--version"], cwd=venv_dir.parent)
    if code != 0:
        return False, "broken"
    code_pref, out_pref, _ = _run([str(venv_python), "-c", "import sys; print(sys.prefix)"], cwd=venv_dir.parent)
    if code_pref != 0 or out_pref.strip() != str(venv_dir.resolve()):
        return False, "prefix_mismatch"
    return True, "ok"


def validate_deps(repo_name):
    venv_dir = storage.get_model_venv_path(repo_name)
    if platform.system() == "Windows":
        venv_python = venv_dir / "Scripts" / "python.exe"
    else:
        venv_python = venv_dir / "bin" / "python"

    if not venv_python.exists():
        return False, ["python_missing"]

    missing = []
    for pkg in ["torch", "torchvision", "huggingface_hub"]:
        code, _, _ = _run(
            [str(venv_python), "-c", f"import {pkg}"],
            cwd=venv_dir.parent,
        )
        if code != 0:
            missing.append(pkg)
    return len(missing) == 0, missing


def repair_repo(repo_name):
    repo_path = storage.get_repo_path(repo_name)
    if repo_path.exists():
        shutil.rmtree(str(repo_path), ignore_errors=True)
    from runtime.installer import clone_repo
    return clone_repo(repo_name)


def repair_venv(repo_name):
    venv_dir = storage.get_model_venv_path(repo_name)
    if venv_dir.exists() or venv_dir.is_symlink():
        shutil.rmtree(str(venv_dir), ignore_errors=True)
        if venv_dir.is_symlink():
            venv_dir.unlink()
    from runtime.installer import prepare_runtime
    providers = REPOS.get(repo_name, {}).get("providers", [])
    if providers:
        return prepare_runtime(providers[0], allow_native_build=False)
    return {"success": False, "error": f"No providers for {repo_name}"}


def queue_native_build_if_needed(repo_name):
    try:
        from runtime.manifest_loader import load_manifest, REPOS, PROVIDER_METADATA
        from runtime.installer import _get_native_build_info, get_persisted_install_status, persist_provider_state
        from app.workers.installation_workers import run_native_build

        repo_entry = REPOS.get(repo_name, {})
        providers = repo_entry.get("providers", [])
        provider_name = providers[0] if providers else repo_name
        meta = PROVIDER_METADATA.get(provider_name, {})
        manifest = load_manifest(provider_name)
        native_req, _ = _get_native_build_info(meta, manifest)
        if not native_req:
            return None

        # Idempotency: if a native build is already queued or running, don't
        # re-queue a duplicate task. Return the existing task ID.
        persisted = get_persisted_install_status()
        existing = persisted.get(provider_name, {})
        existing_state = existing.get("native_build_state", "")
        existing_task_id = existing.get("native_build_task_id")
        if existing_state in ("native_build_pending", "native_build_running") and existing_task_id:
            print(f"  [NATIVE] {repo_name}: native build already {existing_state} (task={existing_task_id})")
            return existing_task_id

        task_id = f"native_build_{provider_name}_{int(datetime.datetime.utcnow().timestamp())}"
        try:
            run_native_build.apply_async(
                args=[provider_name, task_id],
                queue="installation",
                task_id=task_id,
            )
        except Exception as broker_exc:
            # Broker unavailable: persist failed state so the UI can surface it.
            persist_provider_state(provider_name, {
                "native_build_state": "native_build_failed",
                "native_build_task_id": task_id,
                "blocking_reason": f"Celery broker unavailable: {broker_exc}",
            })
            print(f"  [FAIL] {repo_name}: native build failed (Celery broker unavailable)")
            return None

        print(f"  [NATIVE] {repo_name}: native build queued (task={task_id})")
        return task_id
    except Exception as exc:
        print(f"  [WARN] {repo_name}: could not queue native build: {exc}")
    return None


# Use user-selected repos if set via interactive prompt, else fall back to default
import os as _os
_selected = _os.environ.get("COLAB_SELECTED_REPOS", "").strip()
if _selected:
    COLAB_ALLOWED_REPOS = set(_selected.split(","))
else:
    COLAB_ALLOWED_REPOS = {"TripoSG", "TRELLIS", "Hunyuan3D-2mini", "Hunyuan3D-2.1"}

# Map repos to their providers for Colab gating
repos_to_prepare = []
for repo_name in sorted(REPOS.keys()):
    if repo_name not in COLAB_ALLOWED_REPOS:
        print(f"  [COLAB] {repo_name}: skipped (not in allowed list)")
        continue
    repo_cfg = REPOS.get(repo_name, {})
    providers = repo_cfg.get("providers", [])
    colab_skip_reason = None
    if not _selected:
        for prov in providers:
            if not is_model_preparable_for_colab(prov):
                colab_skip_reason = get_colab_incompatibility_reason(prov) or (
                    f"Required VRAM: {get_model_vram_required(prov) / 1024:.1f} GB\n"
                    f"Reason: exceeds Colab runtime policy"
                )
                break
        if colab_skip_reason:
            print(f"  [COLAB] {repo_name}: skipped")
            for line in colab_skip_reason.split("\n"):
                print(f"  {line}")
            continue
    repos_to_prepare.append(repo_name)

if not repos_to_prepare:
    print("  [SKIP] No models to prepare for Colab")
    sys.exit(0)

repaired = 0
skipped = 0
failed = 0
token = _os.environ.get("HUGGINGFACE_TOKEN") or _os.environ.get("HF_TOKEN")

for repo_name in repos_to_prepare:
    repo_ok, repo_reason = validate_repo(repo_name)
    venv_ok, venv_reason = validate_venv(repo_name)
    deps_ok, deps_missing = validate_deps(repo_name)
    providers = REPOS.get(repo_name, {}).get("providers", [repo_name])

    if repo_ok and venv_ok and deps_ok:
        print(f"  [OK  ] {repo_name}: runtime already ready")
        for provider in providers:
            print(f"    [READY] {provider}: runtime environment verified")
        queue_native_build_if_needed(repo_name)
        skipped += 1
        continue

    # Fresh install: repo doesn't exist yet
    if not repo_ok and repo_reason == "missing":
        print(f"  [INSTALL] {repo_name}: fresh install...")
        for provider in providers:
            print(f"    [PREPARE] {provider}: preparing runtime (venv & deps)...")
            r = prepare_runtime(provider, allow_native_build=False)
            state = r.get("state", "unknown")
            if state in ("runtime_ready", "runtime_partial"):
                print(f"      [OK  ] {provider}: venv & dependencies prepared")
            else:
                print(f"      [FAIL] {provider}: {r.get('error', 'unknown error')}")
                failed += 1
        queue_native_build_if_needed(repo_name)
        repaired += 1
        continue

    print(f"  [FIX ] {repo_name}: repairing (repo={repo_reason}, venv={venv_reason}, deps={deps_missing})")

    if not repo_ok:
        print(f"    -> Re-cloning {repo_name}...")
        r = repair_repo(repo_name)
        if not r.get("success"):
            print(f"    [FAIL] clone failed: {r.get('error')}")
            failed += 1
            continue
        print(f"    [OK  ] {repo_name} cloned")

    if not venv_ok:
        print(f"    -> Recreating venv for {repo_name}...")
        r = repair_venv(repo_name)
        if not r.get("success"):
            print(f"    [FAIL] venv creation failed: {r.get('error')}")
            failed += 1
            continue
        print(f"    [OK  ] {repo_name} venv ready")
    elif not deps_ok:
        print(f"    -> Repairing dependencies for {repo_name}...")
        r = repair_venv(repo_name)
        if not r.get("success"):
            print(f"    [FAIL] dependency repair failed: {r.get('error')}")
            failed += 1
            continue
        print(f"    [OK  ] {repo_name} dependencies ready")

    print(f"  [OK  ] {repo_name}: repaired")
    for provider in providers:
        print(f"    [READY] {provider}: dependencies ready")
    queue_native_build_if_needed(repo_name)
    repaired += 1

print(f"\nRuntime preparation complete: {repaired} installed/repaired, {skipped} skipped, {failed} failed")
print("Note: Weights are not downloaded during bootstrap. Download models on-demand via the UI or run with --weights-only.")
PYEOF
    )
}

# ── Disk space precheck (Bypassed in Colab per user specification) ────────
check_disk_space() {
    # Disk check completely bypassed in Colab — no disk check gating
    return 0
}

download_model_weights() {
    step "Downloading model weights (verification & catch-up)"
    local PYTHONBIN="${PROJECT_ROOT}/backend/.venv/bin/python"
    [[ -x "$PYTHONBIN" ]] || { err "Backend venv missing — run full bootstrap first"; return 1; }
    if ! "$PYTHONBIN" -c "import yaml" &>/dev/null; then
        info "Installing PyYAML for manifest loading..."
        uv pip install --python "$PYTHONBIN" pyyaml packaging -q 2>>"$PROJECT_ROOT/logs/bootstrap.log" || true
    fi
    (
        cd backend
        PYTHONPATH=. "$PYTHONBIN" - << 'PYEOF'
import logging
import os
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="  %(levelname)-5s %(name)s: %(message)s")
sys.path.insert(0, str(Path(".").resolve()))
try:
    from runtime.installer import download_model_weights
    from runtime.manifest_loader import HF_MODELS, REPOS
except Exception as exc:
    print(f"  [FAIL] Could not import runtime modules: {exc}")
    sys.exit(1)

token = os.environ.get("HUGGINGFACE_TOKEN") or os.environ.get("HF_TOKEN")
_selected = os.environ.get("COLAB_SELECTED_REPOS", "").strip()
selected_set = {s.lower().strip() for s in _selected.split(",")} if _selected else None

def is_model_selected(key: str) -> bool:
    if not selected_set:
        return True
    k_lower = key.lower()
    if k_lower in selected_set:
        return True
    for r_name, r_cfg in REPOS.items():
        if r_name.lower() in selected_set:
            provs = [p.lower() for p in r_cfg.get("providers", [r_name])]
            if k_lower in provs or r_name.lower() == k_lower:
                return True
    return False

for key in sorted(HF_MODELS.keys()):
    if not is_model_selected(key):
        print(f"  [SKIP] {key}: not selected by user")
        continue
    print(f"  [WEIGHTS] {key}: checking/downloading ~{HF_MODELS[key]['size_estimate_gb']}GB (disk check bypassed)...")
    r = download_model_weights(key, hf_token=token)
    if r.get("success"):
        print(f"    [OK  ] {key}: {r.get('action', 'done')}")
    else:
        print(f"    [WARN] {key}: {r.get('error', 'failed')}")
PYEOF
    )
}

# ── Preflight validation ──────────────────────────────────────────────────
# Validates the prepared Colab models AFTER startup using the same layered
# checks the backend runs (venv, imports, native exts, CUDA, weights, smoke
# test). Invoked via the backend interpreter directly — no native builds
# (Colab has no toolkit) and no re-clone/re-download. Mirrors setup.sh's
# post-prepare quality gate without its native-build queueing.
run_preflight() {
    step "Running preflight validation for prepared models"
    local PYTHONBIN="${PROJECT_ROOT}/backend/.venv/bin/python"
    [[ -x "$PYTHONBIN" ]] || { warn "Backend venv missing — skipping preflight"; return 0; }
    if ! "$PYTHONBIN" -c "import yaml" &>/dev/null; then
        info "Installing PyYAML for manifest loading..."
        uv pip install --python "$PYTHONBIN" pyyaml packaging -q 2>>"$PROJECT_ROOT/logs/bootstrap.log" || true
    fi
    (
        cd backend
        PYTHONPATH=. "$PYTHONBIN" - << 'PYEOF'
import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="  %(levelname)-5s %(name)s: %(message)s")
sys.path.insert(0, str(Path(".").resolve()))
try:
    from runtime.manifest_loader import REPOS, PROVIDER_METADATA
    from runtime.storage import get_storage_config
    from runtime.preflight import run_preflight_for_provider
except Exception as exc:
    print(f"  [FAIL] Could not import runtime modules: {exc}")
    sys.exit(1)

storage = get_storage_config()
# Colab: only preflight models that were prepared
COLAB_ALLOWED_REPOS = {"TripoSG", "TRELLIS", "Hunyuan3D-2mini", "Hunyuan3D-2.1"}
ran = skipped = 0

for repo_name in sorted(REPOS.keys()):
    if repo_name not in COLAB_ALLOWED_REPOS:
        continue
    # Get provider name from REPOS config (not PROVIDER_METADATA)
    repo_cfg = REPOS.get(repo_name, {})
    providers = repo_cfg.get("providers", [repo_name])
    provider = providers[0] if providers else repo_name
    venv_python = storage.get_model_venv_path(repo_name) / "bin" / "python"
    if not venv_python.exists():
        print(f"  [SKIP] {provider}: venv not prepared")
        skipped += 1
        continue
    print(f"  [PREFLIGHT] {provider}: running checks...")
    try:
        # ponytail: skip weights check during runtime prep (Stage A).
        # Weights are downloaded separately via the UI or API (Stage B).
        result = run_preflight_for_provider(provider, skip_weights_check=True)
        passed = bool(getattr(result, "passed", False))
        print(f"    [{'OK  ' if passed else 'FAIL'}] {provider}: {'PASSED' if passed else 'FAILED'}")
        if not passed:
            checks = getattr(result, "checks", {})
            for check_name, check_result in checks.items():
                if isinstance(check_result, dict) and not check_result.get("passed", True):
                    detail = check_result.get("detail", "")
                    print(f"      [FAIL] {check_name}: {detail}")
            error_detail = getattr(result, "error_detail", "")
            if error_detail:
                print(f"      Error: {error_detail}")
    except Exception as exc:
        print(f"    [FAIL] {provider}: {exc}")
        import traceback
        traceback.print_exc()
    ran += 1

print(f"\nPreflight complete: {ran} checked, {skipped} skipped")
PYEOF
    )
}

# ── Flags: --weights-only / --repos-only ──────────────────────────────────

if [[ "$WEIGHTS_ONLY" == "true" ]]; then
    prepare_model_runtimes || warn "Model runtime prep had issues — check output above"
    download_model_weights || warn "Weight download had issues — check output above"
    run_preflight || warn "Preflight validation had issues — check output above"
    log "Weights-only setup complete. Start services with: bash scripts/colab.sh"
    exit 0
fi




# ── Interactive Model Selection ──────────────────────────────────────────
# ponytail: smart prompt that asks user which models to install.
# Shows VRAM, weight size, deps count, disk space, and warnings.
select_models_interactively() {
    local PYTHONBIN="${PROJECT_ROOT}/backend/.venv/bin/python"
    [[ -x "$PYTHONBIN" ]] || { err "Backend venv missing"; return 1; }

    # Ensure PyYAML is available for manifest loading
    if ! "$PYTHONBIN" -c "import yaml" &>/dev/null; then
        info "Installing PyYAML for manifest loading..."
        uv pip install --python "$PYTHONBIN" pyyaml packaging -q 2>>"$PROJECT_ROOT/logs/bootstrap.log" || true
    fi

    # Get detailed model info from Python
    local model_info
    model_info=$(
        cd backend
        PYTHONPATH=. "$PYTHONBIN" - << 'PYEOF'
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(".").resolve()))
try:
    from runtime.capability import get_model_vram_required, is_model_preparable_for_colab, get_colab_incompatibility_reason, get_model_weight_size_gb
    from runtime.manifest_loader import REPOS, PROVIDER_METADATA, load_all_manifests
except Exception as exc:
    print(json.dumps({"error": str(exc)}))
    sys.exit(1)

manifests = load_all_manifests()
models = []
seen_repos = set()
for pid, manifest in sorted(manifests.items()):
    if pid == "mock":
        continue
    meta = PROVIDER_METADATA.get(pid, {})
    repo_name = meta.get("repo", pid)
    if not repo_name or repo_name in seen_repos:
        continue
    seen_repos.add(repo_name)

    vram_mb = meta.get("vram_required_mb", 0)
    weight_gb = get_model_weight_size_gb(pid)
    desc = meta.get("label", pid)
    colab_ok = is_model_preparable_for_colab(pid)
    colab_reason = get_colab_incompatibility_reason(pid) if not colab_ok else ""
    try:
        py_deps = len(manifest.get("dependencies", {}).get("python", []) or [])
        native_deps = len(manifest.get("dependencies", {}).get("native", []) or [])
        extra_deps = len(manifest.get("dependencies", {}).get("extra", []) or [])
        py_version = manifest.get("environment", {}).get("python", "3.10")
    except Exception:
        py_deps = 0
        native_deps = 0
        extra_deps = 0
        py_version = "3.10"
    total_deps = py_deps + native_deps + extra_deps
    disk_gb = (total_deps * 0.05) + weight_gb
    warnings = []
    if vram_mb > 10000:
        warnings.append("High VRAM")
    if weight_gb > 10:
        warnings.append("Large download")
    if native_deps > 0:
        warnings.append("Needs compilation")
    models.append({
        "repo": repo_name,
        "vram_gb": round(vram_mb / 1024, 1) if vram_mb else 0,
        "weight_gb": round(weight_gb, 1),
        "total_deps": total_deps,
        "disk_gb": round(disk_gb, 1),
        "py_version": py_version,
        "colab_ok": colab_ok,
        "warnings": warnings,
    })

print(json.dumps(models))
PYEOF
    ) || { err "Failed to get model info"; return 1; }

    # Display menu
    echo ""
    echo "  +================================================================+"
    echo "  |            AI 3D Studio - Model Selection                     |"
    echo "  |                                                                |"
    echo "  |  Choose which models to install. Each model has its own        |"
    echo "  |  isolated environment with dedicated dependencies.             |"
    echo "  +================================================================+"
    echo ""

    printf "  | %-4s %-15s %6s %6s %7s %6s %8s |\\n" "#" "Model" "Python" "VRAM" "Weight" "Deps" "Disk"
    echo "  +------------------------------------------------------------------------+"

    local repos=()
    local idx=1
    while IFS= read -r line; do
        local repo vram weight total_deps disk colab_ok warnings py_version
        repo=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['repo'])")
        vram=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['vram_gb'])")
        weight=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['weight_gb'])")
        total_deps=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['total_deps'])")
        disk=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['disk_gb'])")
        colab_ok=$(echo "$line" | python3 -c "import sys,json; print('Y' if json.loads(sys.stdin.read())['colab_ok'] else 'N')")
        py_version=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['py_version'])")
        warnings=$(echo "$line" | python3 -c "import sys,json; print(','.join(json.loads(sys.stdin.read()).get('warnings',[])))")
        repos+=("$repo")

        local status="OK"
        [[ "$colab_ok" == "N" ]] && status="NO"
        printf "  | [%d]%s %-14s %5s %5.1fG %6.1fG %5d %7.1fG |\\n" "$idx" "$status" "$repo" "$py_version" "$vram" "$weight" "$total_deps" "$disk"
        [[ -n "$warnings" ]] && printf "  |      ! %s\\n" "$warnings"
        ((idx++))
    done < <(echo "$model_info" | python3 -c "import sys,json; [print(json.dumps(m)) for m in json.loads(sys.stdin.read())]")

    echo "  +------------------------------------------------------------------------+"
    echo "  |  All models installable — VRAM shown for reference only        |"
    echo "  +================================================================+"
    echo ""

    echo "  Options:"
    echo "  [1] Install ALL models (requires ~80GB disk)"
    echo "  [2] Install RECOMMENDED for Colab (3 models, ~12GB)"
    echo "  [3] Choose INDIVIDUALLY (pick specific models)"
    echo "  [4] Skip (install later via UI)"
    echo ""

    if [[ -n "${COLAB_SELECTED_REPOS:-}" ]]; then
        info "Using pre-configured COLAB_SELECTED_REPOS: ${COLAB_SELECTED_REPOS}"
        return 0
    fi

    local choice
    while true; do
        if ! read -rp "  Enter your choice [1-4]: " choice; then
            echo -e "\n  [COLAB] Non-interactive environment detected — installing recommended models (2)"
            choice="2"
            break
        fi
        case "$choice" in
            1|2|3|4) break ;;
            *) echo "  Invalid choice. Please enter 1, 2, 3, or 4." ;;
        esac
    done

    COLAB_SELECTED_REPOS=""
    case "$choice" in
        1)
            COLAB_SELECTED_REPOS=$(echo "$model_info" | python3 -c "import sys,json; print(','.join(m['repo'] for m in json.loads(sys.stdin.read())))")
            echo "  -> Installing ALL models"
            ;;
        2)
            COLAB_SELECTED_REPOS="TripoSG,TRELLIS,Hunyuan3D-2mini"
            echo "  -> Installing RECOMMENDED models (TripoSG, TRELLIS, Hunyuan3D-2mini)"
            ;;
        3)
            echo ""
            echo "  Enter model numbers to install (comma-separated, e.g., 1,2,3)"
            echo "  Or press Enter for recommended models"

            local selection
            read -rp "  Your selection: " selection
            if [[ -z "$selection" ]]; then
                COLAB_SELECTED_REPOS="TripoSG,TRELLIS,Hunyuan3D-2mini"
                echo "  -> Installing RECOMMENDED models"
            else
                COLAB_SELECTED_REPOS=""
                IFS=',' read -ra nums <<< "$selection"
                for num in "${nums[@]}"; do
                    num=$(echo "$num" | tr -d ' ')
                    if [[ "$num" =~ ^[0-9]+$ ]] && (( num >= 1 && num <= ${#repos[@]} )); then
                        COLAB_SELECTED_REPOS="${COLAB_SELECTED_REPOS},${repos[$((num-1))]}"
                    fi
                done
                COLAB_SELECTED_REPOS="${COLAB_SELECTED_REPOS#,}"
                echo "  -> Installing: ${COLAB_SELECTED_REPOS}"
            fi
            ;;
        4)
            COLAB_SELECTED_REPOS=""
            echo "  -> Skipping model installation"
            return 2
            ;;
    esac

    export COLAB_SELECTED_REPOS
    return 0
}

# Run interactive selection
select_models_interactively
model_selection_result=$?

if [[ "$model_selection_result" == "2" ]]; then
    warn "Skipping model installation. Start services and install via UI."
else
    prepare_model_runtimes || warn "Model runtime prep had issues - check output above"
    info "Model runtimes prepared. Weights will be downloaded on-demand from the UI (or run with --weights-only)."
fi


if [[ "$REPOS_ONLY" == "true" ]]; then
    log "Repos-only setup complete. Start services with: bash scripts/colab.sh"
    exit 0
fi


# ── Step 6: Start Services ────────────────────────────────────────────────

if [[ "$SKIP_START" == "true" ]]; then
    log "Bootstrap complete. Start services with: bash scripts/colab.sh"
    exit 0
fi

step "6/6 Starting AI 3D Studio services"

# ── Variables ─────────────────────────────────────────────────────────────
PYTHON_BIN="${PROJECT_ROOT}/backend/.venv/bin/python"
PID_DIR="${PROJECT_ROOT}/.pids"
LOG_DIR="${PROJECT_ROOT}/logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

# ── Clean stale per-model install locks ─────────────────────────────────
"$PYTHON_BIN" 2>/dev/null << 'PYEOF' || true
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

# ── Ensure Redis is available (install if missing, no systemd needed) ───
if ! command -v redis-server &>/dev/null; then
    info "Installing Redis..."
    sudo apt-get update -qq 2>/dev/null && sudo apt-get install -y redis-server 2>/dev/null || {
        warn "Could not install Redis — using in-memory fallback"
    }
fi

REDIS_AVAILABLE=false
if command -v redis-server &>/dev/null; then
    if ! redis-cli ping &>/dev/null 2>&1; then
        info "Starting Redis (daemonized)..."
        redis-server --daemonize yes 2>/dev/null || warn "Failed to start Redis"
    fi
    if redis-cli ping &>/dev/null 2>&1; then
        log "Redis is running"
        REDIS_AVAILABLE=true
    else
        warn "Redis not responding — using in-memory fallback"
    fi
else
    warn "Redis not available — using in-memory fallback"
fi

# ponytail: real fallback for when Redis is unavailable. Without a broker the
# Celery worker cannot boot, so switch to eager execution (tasks run inline in
# the API process) and a memory broker so the worker can still start. Generation
# jobs then execute synchronously instead of queuing — acceptable on Colab where
# a single user drives the runtime.
if [[ "$REDIS_AVAILABLE" != "true" ]]; then
    export CELERY_TASK_ALWAYS_EAGER=1
    export CELERY_BROKER_URL="memory://"
    export CELERY_RESULT_BACKEND="cache+memory://"
    export REDIS_URL="memory://"
    # Update .env so Celery worker reads the correct config
    sed -i 's|^REDIS_URL=.*|REDIS_URL=memory://|' .env 2>/dev/null || true
    sed -i 's|^CELERY_BROKER_URL=.*|CELERY_BROKER_URL=memory://|' .env 2>/dev/null || true
    sed -i 's|^CELERY_RESULT_BACKEND=.*|CELERY_RESULT_BACKEND=cache+memory://|' .env 2>/dev/null || true
    log "Celery fallback active: eager execution + memory broker (no Redis)"
fi

# ── Run migrations ────────────────────────────────────────────────────────
step "Running database migrations..."

# Wait for PostgreSQL to be fully ready (max 30s)
PG_READY=false
for i in $(seq 1 30); do
    if pg_isready -h 127.0.0.1 -p 5432 -q 2>/dev/null; then
        # Test actual connection with the app user
        if PGPASSWORD=ai_studio_dev psql -h 127.0.0.1 -U ai_studio -d ai_studio -c "SELECT 1" &>/dev/null; then
            PG_READY=true
            break
        fi
    fi
    sleep 1
done

if [[ "$PG_READY" == "true" ]]; then
    (
        cd backend
        if [[ -f scripts/validate_env.py ]]; then
            "$PYTHON_BIN" scripts/validate_env.py --quiet 2>/dev/null || python3 scripts/validate_env.py --quiet 2>/dev/null || true
        fi
        # Retry migrations up to 3 times
        MIGRATION_OK=false
        for attempt in 1 2 3; do
            if "$PYTHON_BIN" -m alembic upgrade head 2>&1; then
                MIGRATION_OK=true
                break
            fi
            warn "Migration attempt $attempt failed — retrying in 3s..."
            sleep 3
        done
        if [[ "$MIGRATION_OK" == "true" ]]; then
            "$PYTHON_BIN" -m alembic current 2>&1 || true
            log "Migrations complete (schema at head)"
        else
            err "Migrations failed after 3 attempts — refusing to start services against an unknown schema."
            exit 1
        fi
    )
else
    warn "PostgreSQL not ready after 30s — skipping migrations"
fi

# ── Start Backend API ─────────────────────────────────────────────────────
clean_pycache
step "Starting Backend API (http://localhost:8000)..."
kill_by_pid_file "$PID_DIR/api.pid"
pkill -TERM -f "uvicorn app.main:app" 2>/dev/null || true
free_port 8000
(
    cd backend
    nohup $PYTHON_BIN -m uvicorn app.main:app \
        --host 0.0.0.0 \
        --port 8000 \
        --log-level info \
        > "$LOG_DIR/api.log" 2>&1 &
    write_pid "$PID_DIR/api.pid" $!
)
log "Backend API started (PID: $(cat $PID_DIR/api.pid))"

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

if ! curl -sf http://localhost:8000/api/v1/health &>/dev/null; then
    err "Backend API failed to become healthy. See logs/api.log"
    exit 1
fi

# ── Service lifetime: foreground supervisor ─────────────────────────────────
# IMPORTANT: The Colab runtime is still alive while this script runs. Keep the
# application service supervisor in the foreground rather than relying on
# browser-side synthetic activity. This prevents the shell that launched the
# services from returning while the application is still being tested.
info "Colab service supervisor will remain attached to this terminal."

# Browser keep-alive is intentionally not used as a service-lifetime mechanism.
# The foreground supervisor below owns the application services.

# ── Virtual Display for Headless Rendering ────────────────────────────────
# Start Xvfb if no DISPLAY is set, enabling offscreen OpenGL/trimesh rendering
if [[ -z "${DISPLAY:-}" ]] && command -v Xvfb &>/dev/null; then
    pkill -f "Xvfb :99" 2>/dev/null || true
    Xvfb :99 -screen 0 1024x768x24 -nolisten tcp >/dev/null 2>&1 &
    export DISPLAY=:99
    log "Xvfb virtual display active on $DISPLAY"
fi
export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-offscreen}"

# ── Start Celery Worker ───────────────────────────────────────────────────
step "Starting Celery Worker..."
kill_by_pid_file "$PID_DIR/worker.pid"
pkill -TERM -f "celery -A app.workers.celery_app worker" 2>/dev/null || true
# When Redis is absent the env already points CELERY_BROKER_URL at memory://;
# pass it explicitly too so the worker boots without a Redis connection.
CELERY_BROKER_ARG=""
CELERY_BACKEND_ARG=""
if [[ "$REDIS_AVAILABLE" != "true" ]]; then
    CELERY_BROKER_ARG="--broker memory://"
    CELERY_BACKEND_ARG="--backend cache+memory://"
fi
(
    cd backend
    # Source .env to ensure Celery worker gets correct config
    set -a; source ../.env 2>/dev/null || true; set +a
    nohup $PYTHON_BIN -m celery -A app.workers.celery_app worker \
        $CELERY_BROKER_ARG \
        $CELERY_BACKEND_ARG \
        --loglevel=info \
        --pool=solo \
        --concurrency=1 \
        -Q generation,images \
        > "$LOG_DIR/worker.log" 2>&1 &
    write_pid "$PID_DIR/worker.pid" $!
)
log "Celery Worker started (PID: $(cat $PID_DIR/worker.pid))"

# ── Start Frontend ───────────────────────────────────────────────────────
step "Starting Frontend (http://localhost:3000)..."

if [[ ! -d node_modules ]]; then
    info "Installing Bun dependencies..."
    bun ci 2>&1 | grep -E '(added|up to date)' || true
fi

if [[ ! -d .next ]]; then
    info "Building Next.js for production..."
    if ! bun run build > "$LOG_DIR/frontend_build.log" 2>&1; then
        err "Frontend build FAILED — see logs/frontend_build.log"
        exit 1
    fi
fi

kill_by_pid_file "$PID_DIR/frontend.pid"
pkill -TERM -f "next start" 2>/dev/null || true
pkill -TERM -f "next-server" 2>/dev/null || true
free_port 3000

# Node/Bun was validated before any Bun command; keep this start path simple.
effective_backend_url="${BACKEND_URL:-http://127.0.0.1:8000}"
if [[ "$effective_backend_url" == *"api:8000"* ]]; then
    effective_backend_url="http://127.0.0.1:8000"
fi
nohup env HOSTNAME=0.0.0.0 PORT=3000 BACKEND_URL="$effective_backend_url" NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-}" \
    bun start \
    > "$LOG_DIR/frontend.log" 2>&1 &
write_pid "$PID_DIR/frontend.pid" $!

log "Frontend started (bun start, PID: $(cat $PID_DIR/frontend.pid))"

# Wait for Frontend to be ready. Do not report success until the root page
# actually responds — a PID alone is not readiness (see spec §9).
info "Waiting for Frontend to serve HTTP (timeout: 60s)..."
FRONTEND_READY=false
for i in {1..30}; do
    if curl -fsS --max-time 3 http://127.0.0.1:3000/ >/dev/null 2>&1; then
        FRONTEND_READY=true
        break
    fi
    echo -n "."
    sleep 2
done

if [[ "$FRONTEND_READY" != "true" ]]; then
    err "Frontend did not become healthy. See logs/frontend.log"
    err "STARTUP FAILED"
    exit 1
fi

# Verify Next.js serves static assets correctly (spec §6).
if CSS_PATH=$(curl -s --max-time 3 http://127.0.0.1:3000/ 2>/dev/null \
        | grep -oE 'href="(/_next/static/[^"]+\.css)"' \
        | head -1 | sed 's/href="//;s/"$//'); then
    if curl -fsS --max-time 3 "http://127.0.0.1:3000${CSS_PATH}" >/dev/null 2>&1; then
        log "Frontend static assets OK (${CSS_PATH})"
    else
        warn "Frontend CSS asset returned non-200: ${CSS_PATH}"
    fi
else
    warn "Could not locate a CSS asset link on the rendered page"
fi
log "Frontend ✓ Healthy"


# ── Service Watchdog / Foreground Supervisor ───────────────────────────────
# Do NOT run a second background watchdog. The single foreground supervisor is
# responsible for keeping the Colab session attached and recovering services.

# ── Cloudflare Tunnel ──────────────────────────────────────────────────────
step "Setting up Cloudflare Tunnel for external access..."

CF_DIR="${PROJECT_ROOT}/.cloudflare_tunnels"
mkdir -p "$CF_DIR"

install_cloudflared() {
    if command -v cloudflared > /dev/null 2>&1; then
        log "cloudflared already installed"
        return 0
    fi
    info "Installing cloudflared..."
    local ARCH; ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
    local TMP_DEB="/tmp/cloudflared-$$.deb"
    if ! wget -q "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" -O "$TMP_DEB" 2>/dev/null; then
        warn "Failed to download cloudflared (arch: $ARCH)"
        rm -f "$TMP_DEB"
        return 1
    fi
    sudo dpkg -i "$TMP_DEB" 2>/dev/null || sudo apt-get install -f -y 2>/dev/null || true
    rm -f "$TMP_DEB"
    if command -v cloudflared > /dev/null 2>&1; then
        log "cloudflared installed"
        return 0
    else
        warn "cloudflared installation failed"
        return 1
    fi
}

start_tunnel() {
    local port=$1
    local name=$2
    if ! command -v cloudflared > /dev/null 2>&1; then
        return 1
    fi
    kill_by_pid_file "$CF_DIR/${port}.pid"
    info "Starting tunnel for ${name} (port ${port})..."
    nohup cloudflared tunnel \
        --url "http://localhost:${port}" \
        --no-autoupdate \
        > "$CF_DIR/${port}.log" 2>&1 &
    echo $! > "$CF_DIR/${port}.pid"
    sleep 5
    local url=""
    url=$(grep -o 'https://[-a-zA-Z0-9]*\.trycloudflare\.com' "$CF_DIR/${port}.log" 2>/dev/null | head -1)
    if [[ -n "$url" ]]; then
        echo "$url" > "$CF_DIR/${port}.url"
    fi
    echo "$url"
}

CF_API_URL=""
CF_FRONTEND_URL=""

# Final readiness gate (spec §10): do NOT print "All Services Started" unless
# every required service is actually serving HTTP. A PID alone is not health.
FINAL_API_OK=false
FINAL_FRONTEND_OK=false
curl -fsS --max-time 3 http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1 && FINAL_API_OK=true
curl -fsS --max-time 3 http://127.0.0.1:3000/ >/dev/null 2>&1 && FINAL_FRONTEND_OK=true

if [[ "$FINAL_API_OK" != "true" || "$FINAL_FRONTEND_OK" != "true" ]]; then
    err "Required service(s) unhealthy before summary (API=${FINAL_API_OK} Frontend=${FINAL_FRONTEND_OK})"
    err "STARTUP FAILED — check logs/api.log and logs/frontend.log"
    exit 1
fi

if install_cloudflared; then
    CF_API_URL=$(start_tunnel 8000 "Backend API")
    CF_FRONTEND_URL=$(start_tunnel 3000 "Frontend")
fi
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${GREEN}✅ AI 3D Studio Started in Google Colab${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Services:${NC}"
echo -e "    Frontend       ${CYAN}http://localhost:3000${NC}"
echo -e "    Backend API    ${CYAN}http://localhost:8000${NC}"
echo -e "    API Docs       ${CYAN}http://localhost:8000/docs${NC}"
echo ""

if [[ -n "$CF_FRONTEND_URL" ]]; then
    echo -e "  ${BOLD}Cloudflare Tunnel URLs:${NC}"
    echo -e "    Frontend       ${GREEN}${CF_FRONTEND_URL}${NC}"
fi
if [[ -n "$CF_API_URL" ]]; then
    echo -e "    Backend API    ${GREEN}${CF_API_URL}${NC}"
fi

if [[ -n "$CF_FRONTEND_URL" || -n "$CF_API_URL" ]]; then
    echo -e "  ${YELLOW}Note:${NC} Tunnel URLs are temporary. Regenerate by re-running: ${BOLD}bash scripts/colab.sh${NC}"
    echo ""
fi

echo -e "  ${BOLD}Colab Access:${NC}"
if [[ -z "$CF_FRONTEND_URL" && -z "$CF_API_URL" ]]; then
    echo -e "    ${YELLOW}Cloudflare tunnel unavailable${NC} — using Colab's built-in port forwarding."
    echo -e "    Click the 🔗 icon next to the output cell or visit the localhost URLs above."
    echo ""
fi
echo -e "  ${BOLD}Service Supervisor:${NC} foreground Colab supervisor is active"
echo -e "    The terminal cell stays running while API, Celery, and Frontend are supervised."
echo -e "    Stop cleanly with ${GREEN}Ctrl+C${NC} or run ${GREEN}bash scripts/stop.sh${NC} from another shell."
echo ""

# Keep this process attached to the Colab terminal. The previous implementation
# returned from the launcher while all three services were background jobs; that
# made the service tree vulnerable to Colab shell cleanup. A single foreground
# supervisor removes that lifecycle race and can restart an individual service.
exec bash "${PROJECT_ROOT}/scripts/colab_watch.sh" --foreground
