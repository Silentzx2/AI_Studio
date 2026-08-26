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
  if command -v nvidia-smi &>/dev/null; then
    DRIVER_MAJOR=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1 | awk -F. '{print $1}')
    if [[ -n "$DRIVER_MAJOR" ]]; then
      if [[ "$DRIVER_MAJOR" -ge 550 ]]; then
        CUDA_VERSION="124"
      elif [[ "$DRIVER_MAJOR" -ge 535 ]]; then
        CUDA_VERSION="121"
      elif [[ "$DRIVER_MAJOR" -ge 525 ]]; then
        CUDA_VERSION="118"
      else
        CUDA_VERSION="121"
      fi
      log "CUDA (from driver): cu${CUDA_VERSION}"
    fi
  fi

  # Fallback: check nvcc if driver detection failed
  if [[ -z "$CUDA_VERSION" ]] && command -v nvcc &>/dev/null; then
    CUDA_FULL=$(nvcc --version 2>/dev/null | grep "release" | sed 's/.*release //' | sed 's/,.*//')
    if [[ -n "$CUDA_FULL" ]]; then
      CUDA_VERSION=$(echo "$CUDA_FULL" | awk -F. '{print $1$2}')
      # Cap at cu124 (latest PyTorch 2.5.1 supports)
      if [[ "$CUDA_VERSION" -gt 124 ]]; then
        CUDA_VERSION="124"
      fi
      log "CUDA toolkit : ${CYAN}${CUDA_FULL}${NC}"
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
    ffmpeg libsm6 libxext6 libxrender-dev libglib2.0-0 \
    libgl1 libopengl0 libx11-6 libxcb1 libxkbcommon-x11-0 \
    libxrender1 libxi6 libxtst6 libdbus-1-3 libfontconfig1 libfreetype6 || {
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

  # Headless Qt rendering for pymeshlab / PyQt apps on servers without a display.
  # This must be set globally so background services launched by start.sh inherit it.
  cat > /etc/profile.d/qt_offscreen.sh << 'QT_ENV'
export QT_QPA_PLATFORM=offscreen
QT_ENV
  chmod +x /etc/profile.d/qt_offscreen.sh
  export QT_QPA_PLATFORM=offscreen
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

  # Use trust auth for local TCP connections so no password is required
  # (the app connects via localhost; credentials in .env are ignored).
  local hba
  hba="$(sudo -u postgres psql -t -c 'SHOW hba_file;' | xargs)"
  if [[ -f "$hba" ]]; then
    sudo sed -i -E "s|^(host\\s+all\\s+all\\s+(127\\.0\\.0\\.1/32|::1/128)\\s+)scram-sha-256$|\\1trust|" "$hba"
    sudo pg_ctlcluster "$(ls /etc/postgresql)" main reload 2>/dev/null \
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
    # Idempotent: clear and recreate if venv is corrupted (missing bin/python).
    log "Creating virtual environment with uv..."
    if [[ ! -x .venv/bin/python ]]; then
        if [[ -d .venv ]]; then
            log "Existing .venv is corrupted — removing..."
            rm -rf .venv
        fi
        uv venv --python 3.12 .venv
    fi

    # Install PyTorch once — GPU or CPU depending on hardware
    if [[ "$GPU_AVAILABLE" == "true" ]]; then
      # Normalize CUDA version for PyTorch wheel index
      CUDA_INDEX="${CUDA_VERSION:-121}"
      # Map any CUDA 12.x to nearest compatible wheel (PyTorch 2.5.1)
      if [[ "$CUDA_INDEX" == "120" || "$CUDA_INDEX" == "121" ]]; then
        CUDA_INDEX="121"
      elif [[ "$CUDA_INDEX" == "125" || "$CUDA_INDEX" == "126" || "$CUDA_INDEX" == "127" || "$CUDA_INDEX" == "128" ]]; then
        CUDA_INDEX="124"
      fi
      log "Installing PyTorch with CUDA ${CUDA_INDEX} via uv..."
      uv pip install --python .venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
        --index-url "https://download.pytorch.org/whl/cu${CUDA_INDEX}" -q
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

prepare_model_runtimes() {
  head_ "Preparing Model Runtimes"
  if [[ ! -x backend/.venv/bin/python ]]; then
    warn "Backend venv not found — skipping runtime preparation"
    return 0
  fi

  (
    cd backend
    PYTHONPATH=. .venv/bin/python - << 'PYEOF'
import logging
import platform
import shutil
import subprocess
import sys
import datetime
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="  %(levelname)-5s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

sys.path.insert(0, str(Path(".").resolve()))

try:
    from runtime.installer import REPOS, prepare_runtime, PROVIDER_METADATA
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
    for pkg in ["torch", "huggingface_hub"]:
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
    from runtime.installer import install_repo_deps
    return install_repo_deps(repo_name)


def queue_native_build_if_needed(repo_name):
    try:
        from runtime.manifest_loader import load_manifest
        from runtime.installer import _get_native_build_info, get_persisted_install_status, persist_provider_state
        from app.workers.installation_workers import run_native_build

        meta = PROVIDER_METADATA.get(repo_name, {})
        provider_name = meta.get("providers", [repo_name])[0]
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


repaired = 0
skipped = 0
failed = 0

# Use user-selected repos if set via interactive prompt
import _os
_selected = _os.environ.get("COLAB_SELECTED_REPOS", "").strip()
if _selected:
    _selected_repos = set(_selected.split(","))
    print(f"  [USER] Installing selected models: {', '.join(sorted(_selected_repos))}")
else:
    _selected_repos = None

for repo_name in sorted(REPOS.keys()):
    # Skip repos not selected by user
    if _selected_repos is not None and repo_name not in _selected_repos:
        print(f"  [SKIP] {repo_name}: not selected by user")
        skipped += 1
        continue
    repo_ok, repo_reason = validate_repo(repo_name)
    venv_ok, venv_reason = validate_venv(repo_name)
    deps_ok, deps_missing = validate_deps(repo_name)

    if repo_ok and venv_ok and deps_ok:
        print(f"  [SKIP] {repo_name}: runtime OK")
        skipped += 1
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
    queue_native_build_if_needed(repo_name)
    repaired += 1

print(f"\nRuntime preparation complete: {repaired} repaired, {skipped} skipped, {failed} failed")
print("\nNOTE: Weights are NOT downloaded during runtime preparation.")
print("      Use the UI 'Download Weights' action or the API /download-weights endpoint.")
PYEOF
  )
}

install_frontend_deps() {
  head_ "Installing Frontend Dependencies"
  npm ci --prefer-offline --no-audit 2>/dev/null || npm install --no-audit || {
    warn "Frontend dependency installation had issues — check npm output"
    return 0
  }
  log "Frontend dependencies installed"
}

build_frontend() {
    head_ "Building Frontend"


    npm run build || {
        err "Frontend build failed"
        return 1
    }

    log "Frontend built successfully"
}
# ── Services ───────────────────────────────────────────────────────────────────

print_summary() {
  head_ "Setup Complete"
  echo -e "${GREEN}${BOLD}AI 3D Studio v3.9.4 is ready!${NC}"
  echo
  echo -e "  ${CYAN}Database :${NC}  PostgreSQL on localhost:5432"
  echo -e "  ${CYAN}Cache    :${NC}  Redis on localhost:6379"
  echo
  echo -e "  ${CYAN}Setup complete!${NC} Services auto-start by default."
  echo -e "    Re-run with ${GREEN}--no-start${NC} to skip and start manually:"
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
  echo -e "${NC}  ${BOLD}Automatic Installer v3.9.4${NC}\n"

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
  # install_cuda           || warn "CUDA install had issues — may use CPU fallback"

  # Project setup
  setup_folders
  setup_env
  install_python_deps    || { err "Python dependency installation failed — aborting"; exit 1; }


# ── Interactive Model Selection ──────────────────────────────────────────
# ponytail: smart prompt that asks user which models to install.
# Shows VRAM, weight size, deps count, disk space, and warnings.
select_models_interactively() {
    local PYTHONBIN="${PROJECT_ROOT}/backend/.venv/bin/python"
    [[ -x "$PYTHONBIN" ]] || { err "Backend venv missing"; return 1; }

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
    from runtime.installer import REPOS, PROVIDER_METADATA, EXTRA_DEPS
    from runtime.manifest_loader import load_manifest
except Exception as exc:
    print(json.dumps({"error": str(exc)}))
    sys.exit(1)

models = []
for pid, meta in sorted(PROVIDER_METADATA.items()):
    if pid == "mock":
        continue
    repo_name = meta.get("repo", pid)
    vram_mb = meta.get("vram_required_mb", 0)
    weight_gb = get_model_weight_size_gb(pid)
    desc = meta.get("label", pid)
    colab_ok = is_model_preparable_for_colab(pid)
    colab_reason = get_colab_incompatibility_reason(pid) if not colab_ok else ""
    try:
        manifest = load_manifest(pid)
        py_deps = len(manifest.get("dependencies", {}).get("python", []) or [])
        native_deps = len(manifest.get("dependencies", {}).get("native", []) or [])
    except:
        py_deps = 0
        native_deps = 0
    extra = EXTRA_DEPS.get(repo_name, [])
    total_deps = py_deps + native_deps + len(extra)
    disk_gb = (total_deps * 0.05) + weight_gb
    warnings = []
    if vram_mb > 10000:
        warnings.append("High VRAM")
    if weight_gb > 10:
        warnings.append("Large download")
    if native_deps > 0:
        warnings.append("Needs compilation")
    if not colab_ok:
        warnings.append("Colab incompatible")
    models.append({
        "repo": repo_name,
        "vram_gb": round(vram_mb / 1024, 1) if vram_mb else 0,
        "weight_gb": round(weight_gb, 1),
        "total_deps": total_deps,
        "disk_gb": round(disk_gb, 1),
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

    printf "  | %-4s %-18s %6s %7s %6s %8s |\\n" "#" "Model" "VRAM" "Weight" "Deps" "Disk"
    echo "  +----------------------------------------------------------------+"

    local repos=()
    local idx=1
    while IFS= read -r line; do
        local repo vram weight total_deps disk colab_ok warnings
        repo=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['repo'])")
        vram=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['vram_gb'])")
        weight=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['weight_gb'])")
        total_deps=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['total_deps'])")
        disk=$(echo "$line" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['disk_gb'])")
        colab_ok=$(echo "$line" | python3 -c "import sys,json; print('Y' if json.loads(sys.stdin.read())['colab_ok'] else 'N')")
        warnings=$(echo "$line" | python3 -c "import sys,json; print(','.join(json.loads(sys.stdin.read()).get('warnings',[])))")
        repos+=("$repo")

        local status="OK"
        [[ "$colab_ok" == "N" ]] && status="NO"
        printf "  | [%d]%s %-17s %5.1fG %6.1fG %5d %7.1fG |\\n" "$idx" "$status" "$repo" "$vram" "$weight" "$total_deps" "$disk"
        [[ -n "$warnings" ]] && printf "  |      ! %s\\n" "$warnings"
        ((idx++))
    done < <(echo "$model_info" | python3 -c "import sys,json; [print(json.dumps(m)) for m in json.loads(sys.stdin.read())]")

    echo "  +----------------------------------------------------------------+"
    echo "  |  OK = Colab compatible   NO = Needs CUDA toolkit              |"
    echo "  +================================================================+"
    echo ""

    echo "  Options:"
    echo "  [1] Install ALL models (requires ~80GB disk)"
    echo "  [2] Install RECOMMENDED for Colab (3 models, ~12GB)"
    echo "  [3] Choose INDIVIDUALLY (pick specific models)"
    echo "  [4] Skip (install later via UI)"
    echo ""

    local choice
    while true; do
        read -rp "  Enter your choice [1-4]: " choice
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
fi

download_model_weights || warn "Weight download had issues - check output above"



  # Non-critical project steps
  install_frontend_deps  || warn "Frontend deps had issues — check npm output above"
  build_frontend || warn "Frontend build had issues — check npm output above"

  # setup.sh runs as root; hand ownership back to the real user so that the
  # non-root `start.sh` can use the venv, read .env, and write logs.
  if [[ -n "${SUDO_USER:-}" ]]; then
    log "Returning project ownership to $SUDO_USER..."
    chown -R "${SUDO_USER}:$(id -gn "$SUDO_USER")" \
      backend/.venv backend/storage backend/third_party backend/.runtime_cache \
      node_modules .env logs .pids 2>/dev/null || true
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
      su - "${SUDO_USER}" -c "cd '${PROJECT_ROOT}' && bash scripts/start.sh"
    else
      bash scripts/start.sh
    fi
  else
    # Summary — user runs scripts/start.sh manually
    print_summary
  fi
}


main "$@"
