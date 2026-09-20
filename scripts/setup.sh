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
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log()   { echo -e "${GREEN}[SETUP]${NC}  ✔ $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}   ⚠ $*"; }
err()   { echo -e "${RED}[ERROR]${NC}  ✖ $*" >&2; }
head_() { echo -e "\n${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n  ${BOLD}${MAGENTA}➜ $*${NC}\n"; }
info()  { echo -e "${CYAN}[INFO]${NC}   ℹ $*"; }
done_() { echo -e "  ${GREEN}${BOLD}✔ Done!${NC}"; }

# ── SIGINT / Ctrl+C handler ───────────────────────────────────────────
_setup_on_sigint() {
    echo ""
    warn "Setup interrupted by user (Ctrl+C)."
    local child_pids
    child_pids=$(jobs -p 2>/dev/null || true)
    if [[ -n "$child_pids" ]]; then
        kill -TERM $child_pids 2>/dev/null || true
    fi
    exit 130
}
trap '_setup_on_sigint' INT

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
  CUDA_VERSION=""

  # Testing mode: simulate CUDA presence
  if [[ "${CUDA_FORCE_PRESENT:-}" == "1" ]]; then
    GPU_NAME="Simulated GPU (TEST_MODE)"
    GPU_AVAILABLE=true
    CUDA_VERSION="${CUDA_FORCE_VERSION:-124}"
    log "GPU detected : ${CYAN}${GPU_NAME}${NC}"
    log "CUDA (test) : cu${CUDA_VERSION}"
    return 0
  fi

  if command -v nvidia-smi &>/dev/null; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || true)
    if [[ -n "$GPU_NAME" ]]; then
      GPU_AVAILABLE=true
      DRIVER_VER=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1 || echo "unknown")
      log "GPU detected : ${CYAN}${GPU_NAME}${NC}"
      log "Driver       : $DRIVER_VER"
    fi
  fi

  # Detect CUDA version: driver first (more reliable), nvcc fallback
  # ponytail: driver version determines max supported CUDA toolkit version.
  # Newer drivers support newer CUDA — don't cap, pass through to PyTorch.
  if command -v nvidia-smi &>/dev/null; then
    DRIVER_MAJOR=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1 | awk -F. '{print $1}')
    if [[ -n "$DRIVER_MAJOR" ]]; then
      if [[ "$DRIVER_MAJOR" -ge 570 ]]; then
        CUDA_VERSION="128"
      elif [[ "$DRIVER_MAJOR" -ge 560 ]]; then
        CUDA_VERSION="126"
      elif [[ "$DRIVER_MAJOR" -ge 550 ]]; then
        CUDA_VERSION="124"
      elif [[ "$DRIVER_MAJOR" -ge 535 ]]; then
        CUDA_VERSION="121"
      elif [[ "$DRIVER_MAJOR" -ge 525 ]]; then
        CUDA_VERSION="118"
      else
        CUDA_VERSION="121"
      fi
      log "CUDA (from driver): ${CYAN}cu${CUDA_VERSION}${NC}"
    fi
  fi

  # Fallback: check nvcc if driver detection failed
  if [[ -z "$CUDA_VERSION" ]] && command -v nvcc &>/dev/null; then
    CUDA_FULL=$(nvcc --version 2>/dev/null | grep "release" | sed 's/.*release //' | sed 's/,.*//')
    if [[ -n "$CUDA_FULL" ]]; then
      CUDA_VERSION=$(echo "$CUDA_FULL" | awk -F. '{print $1$2}')
      log "CUDA toolkit : ${CYAN}${CUDA_FULL}${NC}"
    fi
  fi

  if [[ "$GPU_AVAILABLE" == "false" ]]; then
    warn "No NVIDIA GPU detected — AI inference requires CUDA-capable hardware."
    warn "The stack will start, but generation jobs will fail without a GPU."
    if [[ "${REQUIRE_GPU:-}" == "1" ]]; then
      err "REQUIRE_GPU=1 is set — aborting without GPU."
      exit 1
    fi
    if [[ -t 0 ]] && [[ "${CI:-}" != "true" ]] && [[ "${NONINTERACTIVE:-}" != "1" ]]; then
      read -rp "  Continue without GPU? [y/N] " choice
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
  local pkgs=(curl wget git unzip tar ca-certificates gnupg lsb-release build-essential software-properties-common libssl-dev libffi-dev zlib1g-dev libpq-dev ffmpeg libsm6 libxext6 libglib2.0-0 libgl1 libglu1-mesa libopengl0 libx11-6 libxcb1 libxkbcommon-x11-0 libxrender1 libxi6 libxtst6 libdbus-1-3 libfontconfig1 libfreetype6 python3-yaml xvfb)
  local total=${#pkgs[@]}
  local i=0
  # shellcheck disable=SC2068
  apt-get install -y --no-install-recommends ${pkgs[@]} || {
    err "Failed to install system dependencies"
    return 1
  }
  log "System dependencies installed (${total} packages)"
}

# ── Python version resolution ─────────────────────────────────────────────────

install_python() {
  local -a versions=("3.12")
  local -a to_install=()
  for ver in "${versions[@]}"; do
    command -v "python${ver}" &>/dev/null || to_install+=("$ver")
  done

  if [[ ${#to_install[@]} -eq 0 ]]; then
    head_ "Python Already Installed"
    log "All required Python versions present: ${versions[*]}"
    return 0
  fi

  head_ "Installing Python ${to_install[*]}"
  add-apt-repository ppa:deadsnakes/ppa -y || {
    err "Failed to add deadsnakes PPA — cannot install Python"
    return 1
  }
  apt-get update -qq

  local -a install_pkgs=()
  for ver in "${to_install[@]}"; do
    install_pkgs+=("python${ver}" "python${ver}-dev")
  done

  apt-get install -y "${install_pkgs[@]}" || {
    err "Failed to install Python versions"
    return 1
  }

  # Set python3.12 as the default python3 (backend venv uses it)
  if command -v python3.12 &>/dev/null; then
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1
  fi

  log "Python versions installed: ${to_install[*]}"
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

# ── Clean up conflicting CUDA APT sources ──────────────────────────────────
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

  # Check driver supports CUDA 12.4 (requires >= 525.60.13)
  local DRIVER_MAJOR
  DRIVER_MAJOR=$(echo "$DRIVER_VER" | awk -F. '{print $1}')
  if [[ -n "$DRIVER_MAJOR" ]] && [[ "$DRIVER_MAJOR" -lt 525 ]]; then
    err "NVIDIA driver ${DRIVER_VER} is too old for CUDA 12.4 (requires >= 525.60.13)"
    err "Please update your NVIDIA driver: https://www.nvidia.com/drivers"
    return 1
  fi

  # ── 1. Check if /usr/local/cuda-12.4 is already on disk ──────────────────
  if [[ -d /usr/local/cuda-12.4 ]] && [[ -x /usr/local/cuda-12.4/bin/nvcc ]]; then
    ok "Found CUDA 12.4 at /usr/local/cuda-12.4 — switching symlink"
    rm -f /usr/local/cuda
    ln -sf /usr/local/cuda-12.4 /usr/local/cuda
    _persist_cuda_paths
    _verify_cuda
    return 0
  fi

  # ── 2. Detect installed CUDA Toolkit version ─────────────────────────────
  local CURRENT_CUDA=""
  local NVCC_PATH=""
  if command -v nvcc &>/dev/null; then
    NVCC_PATH=$(command -v nvcc)
    CURRENT_CUDA=$(nvcc --version 2>/dev/null | grep "release" | sed 's/.*release //' | sed 's/,.*//')
    log "CUDA toolkit found: ${CYAN}${CURRENT_CUDA}${NC} at ${NVCC_PATH}"
  elif [[ -L /usr/local/cuda ]] && [[ -e /usr/local/cuda/bin/nvcc ]]; then
    NVCC_PATH="/usr/local/cuda/bin/nvcc"
    CURRENT_CUDA=$("$NVCC_PATH" --version 2>/dev/null | grep "release" | sed 's/.*release //' | sed 's/,.*//')
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
      _persist_cuda_paths
      _verify_cuda
      return 0
    else
      warn "CUDA ${CURRENT_CUDA} installed — switching to CUDA 12.4"
    fi
  fi

  # ── 4. Install CUDA Toolkit 12.4 ──────────────────────────────────────────
  info "Installing CUDA Toolkit 12.4..."

  # Pre-clean conflicting NVIDIA repo lists to prevent APT Signed-By conflict
  _sanitize_apt_cuda_sources

  # Check OS support
  local OS_ID; OS_ID=$(. /etc/os-release && echo "$ID")
  local UBUNTU_VER=""
  if [[ "$OS_ID" == "ubuntu" ]]; then
    UBUNTU_VER=$(lsb_release -rs)
    local UBUNTU_MAJOR
    UBUNTU_MAJOR=$(echo "$UBUNTU_VER" | awk -F. '{print $1}')
    if [[ "$UBUNTU_MAJOR" -lt 20 ]]; then
      warn "Ubuntu ${UBUNTU_VER} may not fully support CUDA 12.4 — proceeding anyway"
    fi
  elif [[ "$OS_ID" != "debian" ]]; then
    warn "Unsupported OS: ${OS_ID} — CUDA 12.4 install may fail"
  fi

  # Check architecture
  local ARCH; ARCH=$(dpkg --print-architecture)
  if [[ "$ARCH" != "amd64" && "$ARCH" != "arm64" ]]; then
    err "Unsupported architecture: ${ARCH}"
    return 1
  fi

  local UBUNTU_VER_NODOT; UBUNTU_VER_NODOT=$(lsb_release -rs | tr -d '.')
  local URL_ARCH="x86_64"

  # NVIDIA published CUDA 12.4 for Ubuntu 20.04 (2004) and 22.04 (2204), but NOT for 24.04 (2404).
  # If running on Ubuntu >= 24.04 (e.g. Noble), use the 2204 repository for CUDA 12.4 packages.
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
    # Remove old symlink if it exists (never remove a real directory)
    if [[ -L /usr/local/cuda ]]; then
      rm -f /usr/local/cuda
    elif [[ -d /usr/local/cuda ]]; then
      # Backup existing real directory
      mv /usr/local/cuda /usr/local/cuda-old-backup 2>/dev/null || true
    fi
    ln -sf /usr/local/cuda-12.4 /usr/local/cuda
    ok "/usr/local/cuda → /usr/local/cuda-12.4"
  elif [[ -d /usr/local/cuda ]]; then
    ok "CUDA toolkit installed at /usr/local/cuda"
  else
    warn "CUDA toolkit installed but location unknown — check /usr/local/"
  fi

  # ── Persist PATH and LD_LIBRARY_PATH ───────────────────────────────────────
  _persist_cuda_paths

  # ── Verify installation ───────────────────────────────────────────────────
  _verify_cuda
}

# ── Persist CUDA environment variables ──────────────────────────────────────────
_persist_cuda_paths() {
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
_verify_cuda() {
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

install_postgresql() {
  head_ "Installing PostgreSQL 16"
  if command -v psql &>/dev/null; then
    log "PostgreSQL already installed: $(psql --version)"
    return 0
  fi
  
   apt-get update -qq
   apt-get install -y postgresql postgresql-contrib postgresql-16-pgvector || {
     warn "postgresql-16-pgvector not available — installing pgvector from source may be required"
     apt-get install -y postgresql postgresql-contrib || {
       err "Failed to install PostgreSQL"
       return 1
     }
   }
  
  systemctl enable postgresql --now
  log "PostgreSQL installed and started"

  # Use trust auth for local TCP connections so no password is required
  # (the app connects via localhost; credentials in .env are ignored).
  local hba
  hba="$(sudo -u postgres psql -t -c 'SHOW hba_file;' | xargs)"
  if [[ -f "$hba" ]]; then
    sudo sed -i -E "s|^(host\\s+all\\s+all\\s+(127\\.0\\.0\\.1/32|::1/128)\\s+)(scram-sha-256|md5|peer)$|\\1trust|" "$hba"
    PG_VER=$(ls /etc/postgresql | sort -V | tail -1)
    sudo pg_ctlcluster "$PG_VER" main reload 2>/dev/null \
      || sudo systemctl reload postgresql
    log "Local PostgreSQL auth set to trust (no password needed)"
  fi
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

  if ! command -v bun &>/dev/null; then
    head_ "Installing Bun"
    curl -fsSL https://bun.sh/install | bash || warn "Failed to install Bun via bun.sh"
    export PATH="$HOME/.bun/bin:$PATH"
    if [[ -f "$HOME/.bun/bin/bun" ]] && [[ ! -e /usr/local/bin/bun ]]; then
      ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun 2>/dev/null || true
    fi
    log "Bun installed: $(bun --version 2>/dev/null || echo 'OK')"
  fi
}

install_gltf_transform() {
  head_ "Installing gltf-transform CLI"
  if command -v gltf-transform &>/dev/null; then
    log "Already installed: $(gltf-transform --version 2>/dev/null || echo 'OK')"
    return 0
  fi
  if command -v bun &>/dev/null; then
    bun install -g @gltf-transform/cli 2>/dev/null || {
      warn "Failed to install @gltf-transform/cli globally"
      return 0
    }
    log "gltf-transform installed: $(gltf-transform --version 2>/dev/null || echo 'OK')"
  elif command -v npm &>/dev/null; then
    npm install -g @gltf-transform/cli 2>/dev/null || {
      warn "Failed to install @gltf-transform/cli globally"
      return 0
    }
    log "gltf-transform installed: $(gltf-transform --version 2>/dev/null || echo 'OK')"
  fi
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
    backend/.runtime_cache \
    ENGINE/ComfyUI/models/checkpoints \
    ENGINE/ComfyUI/models/clip \
    ENGINE/ComfyUI/models/vae \
    ENGINE/ComfyUI/models/unet \
    ENGINE/ComfyUI/output \
    logs; do
    mkdir -p "$dir"
  done
  # Runtime-owned dirs: 755 is fine (created and written by one user).
  chmod -R 755 backend/storage backend/.runtime_cache logs 2>/dev/null || true
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
DATABASE_URL=postgresql+asyncpg://ai_studio:ai_studio_dev@127.0.0.1:5432/ai_studio?sslmode=disable
DATABASE_SYNC_URL=postgresql://ai_studio:ai_studio_dev@127.0.0.1:5432/ai_studio

# ── Redis (localhost) ─────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── ComfyUI Execution Engine ──────────────────────────────
COMFYUI_HOST=127.0.0.1
COMFYUI_PORT=8188
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_TIMEOUT=300
AI_PROVIDER=comfyui
RUNTIME_MODE=comfyui

# ── API ───────────────────────────────────────────────────
BACKEND_URL=http://localhost:8000

# ── Storage ────────────────────────────────────────────────
STORAGE_LOCAL_PATH=./backend/storage
RUNTIME_CACHE_DIR=./backend/.runtime_cache

# ── GPU ───────────────────────────────────────────────────
CUDA_VISIBLE_DEVICES=0
CUDA_DEVICE=auto
PLATFORM_MODE=gpu
CPU_FALLBACK=false

# ── Dev ────────────────────────────────────────────────────
DEBUG=false
PYTHONPATH=./backend
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

    # Create venv using normal Python venv method (clear and recreate if corrupted)
    log "Creating virtual environment using Python venv ($py_bin)..."
    if [[ ! -x .venv/bin/python ]]; then
        if [[ -d .venv ]]; then
            log "Existing .venv is corrupted — removing..."
            rm -rf .venv
        fi
        "$py_bin" -m venv .venv || "$py_bin" -c "import venv; venv.create('.venv', with_pip=True)" || uv venv .venv || {
            err "Failed to create backend venv"
            exit 1
        }
    fi

    # Explicitly activate before installing anything
    # shellcheck disable=SC1091
    source .venv/bin/activate

    # Verify activation
    log "Verifying virtual environment activation:"
    log "  which python: $(which python)"
    log "  which pip:    $(which pip)"
    local actual_prefix expected_prefix
    actual_prefix=$(python -c "import sys; print(sys.prefix)")
    log "  sys.prefix:   $actual_prefix"
    expected_prefix="$(pwd)/.venv"
    if [[ "$actual_prefix" != "$expected_prefix" && "$actual_prefix" != "$(cd .venv && pwd)" ]]; then
        err "Virtual environment verification failed: sys.prefix ($actual_prefix) != expected ($expected_prefix)"
        exit 1
    fi

    # Install PyTorch once — GPU or CPU depending on hardware (ONLY uv used inside activated venv)
    if [[ "$GPU_AVAILABLE" == "true" ]]; then
      # Use detected CUDA version for PyTorch wheel index
      CUDA_INDEX="${CUDA_VERSION:-124}"
      # Map CUDA version to supported PyTorch wheel index for PyTorch 2.5.1 (cu118, cu121, cu124)
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
      log "Installing PyTorch ${TORCH_VER} with CUDA ${CUDA_INDEX} via uv..."
      uv pip install --python .venv/bin/python \
        torch==${TORCH_VER} torchvision==${TORCHVISION_VER} torchaudio==${TORCHAUDIO_VER} \
        --index-url "https://download.pytorch.org/whl/cu${CUDA_INDEX}" -q
    else
      log "Installing PyTorch CPU-only via uv..."
      uv pip install --python .venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
        --index-url https://download.pytorch.org/whl/cpu -q
    fi

    uv pip install --python .venv/bin/python pip setuptools wheel ninja PyGithub -q 2>/dev/null || true
    uv pip install --python .venv/bin/python -r requirements.txt -q
  )
  local rc=$?
  if [[ $rc -ne 0 ]]; then
    err "Python dependency installation failed (exit code $rc)"
    return 1
  fi
  if ! backend/.venv/bin/python -c 'import yaml' >/dev/null 2>&1; then
    uv pip install --python backend/.venv/bin/python pyyaml packaging -q || true
  fi
  log "Python dependencies installed"
}

prepare_comfyui_engine() {
  head_ "Installing ComfyUI + ComfyUI-3D-Pack Execution Engine"
  PYTHON_BIN="${PROJECT_ROOT}/backend/.venv/bin/python" bash "${SCRIPT_DIR}/install_comfyui.sh"
}

install_frontend_deps() {
  head_ "Installing Frontend Dependencies"
  if command -v bun &>/dev/null; then
    bun ci 2>/dev/null || bun install || {
      warn "Frontend dependency installation had issues — check Bun output"
      return 0
    }
  else
    npm ci 2>/dev/null || npm install || {
      warn "Frontend dependency installation had issues — check npm output"
      return 0
    }
  fi
  log "Frontend dependencies installed"
}

build_frontend() {
    head_ "Building Frontend"

    # Fix .next permissions if it exists (prevents EACCES errors)
    if [[ -d .next ]]; then
        if command -v sudo &>/dev/null; then
            sudo chmod -R 755 .next 2>/dev/null || true
        else
            chmod -R 755 .next 2>/dev/null || true
        fi
    fi

echo -e "  ${BOLD}Building Next.js (this takes 2-5 minutes)${NC}"
    if command -v bun &>/dev/null; then
        bun run build 2>&1 | while IFS= -r read -n1 char; do
            case "$char" in
                .) printf "${GREEN}█${NC}" ;;
                $'\n') printf "\n" ;;
            esac
        done || {
            err "Frontend build failed"
            return 1
        }
    else
        npm run build 2>&1 | while IFS= -r read -n1 char; do
            case "$char" in
                .) printf "${GREEN}█${NC}" ;;
                $'\n') printf "\n" ;;
            esac
        done || {
            err "Frontend build failed"
            return 1
        }
    fi
    echo ""
    log "Frontend built successfully"
}
# ── Services ───────────────────────────────────────────────────────────────────

print_summary() {
  head_ "Setup Complete"
  echo -e "  ${GREEN}${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "  ${GREEN}${BOLD}║  ✅ AI 3D Studio v6.0.0 is ready!                        ║${NC}"
  echo -e "  ${GREEN}${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
  echo
  echo -e "  ${CYAN}Database :${NC}  PostgreSQL on localhost:5432"
  echo -e "  ${CYAN}Cache    :${NC}  Redis on localhost:6379"
  echo -e "  ${CYAN}Engine   :${NC}  ComfyUI + ComfyUI-3D-Pack on localhost:8188"
  echo
  echo -e "  ${CYAN}Setup complete!${NC} Services auto-start by default."
  echo -e "    Re-run with ${GREEN}--no-start${NC} to skip and start manually:"
  echo -e "    ${GREEN}bash scripts/start.sh${NC}"
  echo
  echo -e "  Services will start at:"
  echo -e "    Frontend :  ${CYAN}http://localhost:3000${NC}"
  echo -e "    Backend  :  ${CYAN}http://localhost:8000${NC}"
  echo -e "    ComfyUI  :  ${CYAN}http://localhost:8188${NC}"
  echo -e "    API Docs :  ${CYAN}http://localhost:8000/docs${NC}"
  echo
  if [[ "$GPU_AVAILABLE" == "true" ]]; then
    echo -e "  ${GREEN}GPU Mode:${NC}  ${GPU_NAME}"
  else
    echo -e "  ${YELLOW}GPU Mode:${NC}  None — install NVIDIA GPU for AI inference"
  fi
  echo
  echo -e "  ${CYAN}Storage  :${NC}  backend/storage/"
  echo -e "  ${CYAN}Engine   :${NC}  ENGINE/ComfyUI/"
  echo -e "  ${CYAN}Config   :${NC}  .env"
  echo
  echo -e "  ${BOLD}Command reference:${NC}"
  echo -e "    Start services  : ${GREEN}bash scripts/start.sh${NC}"
  echo -e "    Stop services   : ${GREEN}bash scripts/stop.sh${NC}"
  echo -e "    Restart services: ${GREEN}bash scripts/restart.sh${NC}"
  echo -e "    Manage services : ${GREEN}bash manager.sh${NC}"
  echo -e "    Colab launcher  : ${GREEN}bash scripts/colab.sh${NC}"
  echo
  echo -e "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "  ${MAGENTA}${BOLD}🚀 Happy 3D generating!${NC}\n"
}

# ── Entry point ────────────────────────────────────────────────────────────────

main() {
  # Auto-start the project when setup finishes (default on; opt out with --no-start).
  # start.sh backgrounds all services and returns, so this is non-blocking.
  AUTO_START=true
  for arg in "$@"; do
    case "$arg" in
      --auto-start) AUTO_START=true ;;
      --no-start)   AUTO_START=false ;;
    esac
  done

  echo -e "${RED}${BOLD}"
  cat << 'BANNER'

 ██████╗██╗    ██████╗ ██████╗      ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
██╔══██╗██║    ╚════██╗██╔══██╗     ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
███████║██║     █████╔╝██║  ██║     ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
██╔══██║██║    ╚═══██╗ ██║  ██║     ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
██║  ██║██║   ██████╔╝ ██████╔╝     ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
╚═╝  ╚═╝╚═╝   ╚═════╝  ╚═════╝      ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝

BANNER
  echo -e "${NC}  ${BOLD}Automatic Installer v6.0.0${NC}\n"

  # Check for sudo - required for .next permissions and system services
  if ! command -v sudo &>/dev/null; then
    err "sudo is required but not available. Please install sudo and re-run."
    exit 1
  fi
  if ! sudo -n true 2>/dev/null; then
    warn "sudo requires password. You may be prompted during setup."
  fi

  # Testing mode: simulate CUDA presence for testing all models
  if [[ "${TEST_MODE:-}" == "1" ]]; then
    warn "TEST MODE: Simulating CUDA presence (CUDA_FORCE_PRESENT=1)"
    export CUDA_FORCE_PRESENT=1
    export CUDA_FORCE_VERSION="${CUDA_FORCE_VERSION:-124}"
  fi

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
  install_cuda           || warn "CUDA install had issues — may use CPU fallback"
  install_python         || { err "Python installation failed — aborting"; exit 1; }
  install_uv             || { err "uv installation failed — aborting"; exit 1; }
  install_node           || { err "Node.js installation failed — aborting"; exit 1; }
  install_gltf_transform || warn "gltf-transform install skipped — mesh compression will fallback to passthrough"

  # Non-critical steps — warn but continue
  install_blender        || warn "Blender install skipped — post-processing may be unavailable"
  
  # Headless Qt rendering for pymeshlab / PyQt apps on servers without a display.
  cat > /etc/profile.d/qt_offscreen.sh << 'QT_ENV'
export QT_QPA_PLATFORM=offscreen
QT_ENV
  chmod +x /etc/profile.d/qt_offscreen.sh
  export QT_QPA_PLATFORM=offscreen

  # Project setup
  setup_folders
  setup_env
   install_python_deps    || { err "Python dependency installation failed — aborting"; exit 1; }
   prepare_comfyui_engine || warn "ComfyUI engine setup had issues — check output above"

   # Non-critical project steps
  install_frontend_deps  || warn "Frontend deps had issues — check Bun output above"
  build_frontend || warn "Frontend build had issues — check Bun output above"

  # setup.sh runs as root; hand ownership back to the real user so that the
  # non-root `start.sh` can use the venv, read .env, and write logs.
  if [[ -n "${SUDO_USER:-}" ]]; then
    log "Returning project ownership to $SUDO_USER..."
    chown -R "${SUDO_USER}:$(id -gn "$SUDO_USER")" \
      "${PROJECT_ROOT}" 2>/dev/null || true
  fi


  # Auto-start: launch the project automatically when setup finishes.
  # Run start.sh as the non-root user so the services are owned by that user
  # (killable later by scripts/stop.sh without sudo). Postgres/Redis were
  # already started by the install steps above, so start.sh needs no sudo.
  if [[ "$AUTO_START" == "true" ]]; then
    echo ""
    log "Setup complete — launching services..."
    echo ""
    if [[ -n "${SUDO_USER:-}" ]] && [[ "$(id -un)" == "root" ]]; then
      sudo -u "${SUDO_USER}" bash -c "cd '${PROJECT_ROOT}' && bash scripts/start.sh"
    else
      bash scripts/start.sh
    fi
  else
    # Summary — user runs scripts/start.sh manually
    print_summary
  fi
}


main "$@"
