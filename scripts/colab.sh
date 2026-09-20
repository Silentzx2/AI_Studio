#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# [ENVIRONMENT: GOOGLE COLAB / CLOUD GPU ONLY]
# ⚠️  THIS SCRIPT IS DEDICATED TO GOOGLE COLAB / JUPYTER GPU RUNTIMES.
# For VPS / Local Linux servers, use: scripts/setup.sh & scripts/start.sh
#
# AI 3D Studio v6.0 — Google Colab Bootstrap + Start
#
# Complete Colab-specific flow in a single script:
#   1. Environment setup (Swap, CUDA 12.4, PostgreSQL, Redis, uv, Bun/Node)
#   2. Project initialization (.env, storage directories)
#   3. Backend Python venv + PyTorch CUDA
#   4. ComfyUI + ComfyUI-3D-Pack Execution Engine installation
#   5. Frontend installation & production build
#   6. Service startup (PostgreSQL → Redis → ComfyUI → FastAPI → Frontend)
#   7. Cloudflare Tunnels (ports 8000 & 3000) & Foreground Supervision
#
# Usage:
#   bash scripts/colab.sh                 # Interactive Colab Manager
#   bash scripts/colab.sh --setup         # Non-interactive bootstrap + start
#   bash scripts/colab.sh --skip-start    # Setup only, don't start services
#   bash scripts/colab.sh --start         # Start existing services
#   bash scripts/colab.sh --stop          # Stop all running services
#   bash scripts/colab.sh --restart       # Restart services
#   bash scripts/colab.sh --status        # Check service status
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
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

# ── SIGINT / Ctrl+C handler ───────────────────────────────────────────────
_colab_on_sigint() {
    echo ""
    warn "Operation interrupted by user (Ctrl+C)."
    if [[ "${IN_COLAB_MENU:-false}" == "true" ]]; then
        return 0 2>/dev/null || true
    fi
    local child_pids
    child_pids=$(jobs -p 2>/dev/null || true)
    if [[ -n "$child_pids" ]]; then
        kill -TERM $child_pids 2>/dev/null || true
    fi
    exit 130
}
trap '_colab_on_sigint' INT

# ── Project Root ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

PID_DIR="${PROJECT_ROOT}/.pids"
LOG_DIR="${PROJECT_ROOT}/logs"
CF_DIR="${PROJECT_ROOT}/.cloudflare_tunnels"
PYTHON_BIN="${PROJECT_ROOT}/backend/.venv/bin/python"
mkdir -p "$PID_DIR" "$LOG_DIR" "$CF_DIR"

SKIP_START=false
ACTION=""

for arg in "$@"; do
    case "$arg" in
        --stop)            ACTION="stop" ;;
        --restart)         ACTION="restart" ;;
        --start)           ACTION="start" ;;
        --setup)           ACTION="setup" ;;
        --status)          ACTION="status" ;;
        --interactive|-i)  ACTION="interactive" ;;
        --skip-start)      SKIP_START=true ;;
        --help|-h)
            echo "Usage: bash scripts/colab.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --interactive, -i Interactive management menu (default in terminal)"
            echo "  --setup           Full bootstrap + start all services (non-interactive friendly)"
            echo "  --start           Start all services and run supervisor"
            echo "  --stop            Stop all running services"
            echo "  --restart         Restart all services"
            echo "  --status          Check service status"
            echo "  --skip-start      Setup only, don't start services"
            echo "  -h, --help        Show this help"
            exit 0
            ;;
    esac
done

if [[ -z "$ACTION" ]]; then
    if [[ -t 0 ]]; then
        ACTION="interactive"
    else
        ACTION="setup"
    fi
fi

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
    # If explicitly passed via environment, honor it
    if [[ -n "${CUDA_VERSION:-}" ]]; then
        echo "$CUDA_VERSION"
        return
    fi
    # Always enforce CUDA 12.4 (cu124) on GPU for modern 3D packages (spconv, ComfyUI-3D-Pack)
    # and driver forward compatibility across Colab T4, L4, V100, A100.
    echo "124"
}

ensure_cuda_12_4() {
    if [[ "$(detect_gpu)" != "gpu" ]]; then
        return 0
    fi

    # 1. Check if /usr/local/cuda-12.4 is already on disk
    if [[ -d "/usr/local/cuda-12.4" ]] && [[ -x "/usr/local/cuda-12.4/bin/nvcc" ]]; then
        if [[ -L /usr/local/cuda ]]; then
            sudo rm -f /usr/local/cuda 2>/dev/null || true
        elif [[ -d /usr/local/cuda ]]; then
            sudo mv /usr/local/cuda /usr/local/cuda-backup-$(date +%s) 2>/dev/null || true
        fi
        sudo ln -sf /usr/local/cuda-12.4 /usr/local/cuda 2>/dev/null || true
        setup_cuda_env
        log "CUDA 12.4 is active and set as default (/usr/local/cuda → /usr/local/cuda-12.4)"
        return 0
    fi

    # 2. Detect existing CUDA version
    local current_cuda=""
    if command -v nvcc &>/dev/null; then
        current_cuda=$(nvcc --version 2>/dev/null | grep release | sed 's/.*release //;s/,.*//' || echo "")
    elif [[ -x "/usr/local/cuda/bin/nvcc" ]]; then
        current_cuda=$(/usr/local/cuda/bin/nvcc --version 2>/dev/null | grep release | sed 's/.*release //;s/,.*//' || echo "")
    fi

    if [[ -n "$current_cuda" && "$current_cuda" != *"12.4"* ]]; then
        warn "Current system CUDA is ${current_cuda} — installing CUDA 12.4 toolkit and making it default..."
    else
        info "CUDA 12.4 toolkit not found on disk — installing CUDA 12.4..."
    fi

    # 3. Detect Ubuntu version
    local ubuntu_ver
    ubuntu_ver=$(lsb_release -rs 2>/dev/null | tr -d '.' || echo "2204")
    local repo_ver="$ubuntu_ver"
    if [[ "$ubuntu_ver" -ge 2404 ]]; then
        repo_ver="2204"
    elif [[ "$ubuntu_ver" -lt 2004 ]]; then
        repo_ver="2004"
    fi

    # 4. Add trusted NVIDIA repository for Ubuntu
    _sanitize_apt_cuda_sources
    echo "deb [trusted=yes] https://developer.download.nvidia.com/compute/cuda/repos/ubuntu${repo_ver}/x86_64/ /" | sudo tee /etc/apt/sources.list.d/cuda-12-4.list >/dev/null 2>&1 || true
    sudo apt-get update -qq 2>/dev/null || true

    # 5. Install CUDA 12.4 packages
    info "Installing CUDA 12.4 packages (cuda-toolkit-12-4, nvcc, cusparse)..."
    sudo apt-get install -y --no-install-recommends cuda-toolkit-12-4 2>/dev/null || \
    sudo apt-get install -y --no-install-recommends cuda-nvcc-12-4 cuda-cudart-dev-12-4 libcublas-dev-12-4 libcusparse-dev-12-4 libcusolver-dev-12-4 libcufft-dev-12-4 2>/dev/null || {
        warn "Direct apt-get install of CUDA 12.4 had warnings; continuing with runtime..."
    }
    sudo rm -f /etc/apt/sources.list.d/cuda-12-4.list 2>/dev/null || true

    # 6. Make /usr/local/cuda default symlink to /usr/local/cuda-12.4
    if [[ -d "/usr/local/cuda-12.4" ]]; then
        if [[ -L /usr/local/cuda ]]; then
            sudo rm -f /usr/local/cuda 2>/dev/null || true
        elif [[ -d /usr/local/cuda ]]; then
            sudo mv /usr/local/cuda /usr/local/cuda-backup-$(date +%s) 2>/dev/null || true
        fi
        sudo ln -sf /usr/local/cuda-12.4 /usr/local/cuda 2>/dev/null || true
        log "CUDA 12.4 successfully installed and set as default (/usr/local/cuda → /usr/local/cuda-12.4)"
    fi

    setup_cuda_env
}

setup_cuda_env() {
    local nproc_count
    nproc_count=$(nproc 2>/dev/null || echo 4)
    export MAX_JOBS="$nproc_count"
    export CMAKE_BUILD_PARALLEL_LEVEL="$nproc_count"
    export CMAKE_GENERATOR="Ninja"
    export TORCH_CUDA_ARCH_LIST="${TORCH_CUDA_ARCH_LIST:-7.5;8.0;8.6;8.9;9.0+PTX}"

    if [[ -d "/usr/local/cuda-12.4" ]]; then
        export CUDA_HOME="/usr/local/cuda-12.4"
        export PATH="/usr/local/cuda-12.4/bin:${PATH}"
        export LD_LIBRARY_PATH="/usr/local/cuda-12.4/lib64:${LD_LIBRARY_PATH:-}"
    elif [[ -d "/usr/local/cuda" ]]; then
        export CUDA_HOME="/usr/local/cuda"
        export PATH="/usr/local/cuda/bin:${PATH}"
        export LD_LIBRARY_PATH="/usr/local/cuda/lib64:${LD_LIBRARY_PATH:-}"
    fi

    if [[ -n "${CUDA_HOME:-}" && -d "${CUDA_HOME}/include" ]]; then
        export CPATH="${CUDA_HOME}/include:${CPATH:-}"
    fi
    ensure_cuda_dev_headers
}

ensure_cuda_dev_headers() {
    local cuda_root="${CUDA_HOME:-/usr/local/cuda-12.4}"
    [[ -d "$cuda_root" ]] || cuda_root="/usr/local/cuda"
    if [[ -d "$cuda_root/include" ]]; then
        python3 -c "
import glob, os, shutil
cuda_inc = '${cuda_root}/include'
venv_dirs = ['${PROJECT_ROOT}/backend/.venv', '/content/AI_Studio/backend/.venv', '${HOME}/.venv']
for vd in venv_dirs:
    for inc in glob.glob(os.path.join(vd, 'lib/python*/site-packages/nvidia/*/include')):
        for f in os.listdir(inc):
            s = os.path.join(inc, f)
            d = os.path.join(cuda_inc, f)
            if not os.path.exists(d):
                try:
                    shutil.copy2(s, d) if not os.path.isdir(s) else shutil.copytree(s, d)
                except Exception:
                    pass
" 2>/dev/null || true
    fi
}

# ── Clean up conflicting CUDA APT sources ──────────────────────────────────
_sanitize_apt_cuda_sources() {
  rm -f /etc/apt/sources.list.d/*cuda*.list \
        /etc/apt/sources.list.d/*nvidia*.list \
        /etc/apt/sources.list.d/*cuda*.sources \
        /etc/apt/sources.list.d/*nvidia*.sources 2>/dev/null || true
  if [[ -f /etc/apt/sources.list ]]; then
    sed -i '/developer\.download\.nvidia\.com/d' /etc/apt/sources.list 2>/dev/null || true
  fi
}

# ── Setup Swap Space (Colab RAM Protection) ──────────────────────────────────
setup_swap() {
  local current_swap
  current_swap=$(free -m | awk '/^Swap:/ {print $2}')
  if [[ "${current_swap:-0}" -ge 4096 ]]; then
    log "Swap space already adequate: ${current_swap} MB"
    return 0
  fi
  info "Configuring 8GB swap space for Colab memory headroom..."
  local swapfile="/swapfile"
  if [[ ! -f "$swapfile" ]]; then
    sudo fallocate -l 8G "$swapfile" 2>/dev/null || sudo dd if=/dev/zero of="$swapfile" bs=1M count=8192 2>/dev/null || {
      warn "Failed to create swapfile — continuing with available RAM"
      return 0
    }
    sudo chmod 600 "$swapfile"
    sudo mkswap "$swapfile" 2>/dev/null || true
  fi
  sudo swapon "$swapfile" 2>/dev/null || true
  log "Swap enabled: $(free -m | awk '/^Swap:/ {print $2}') MB"
}

# ── Process Management Helpers ──────────────────────────────────────────────
write_pid() {
    local pid_file=$1
    local pid=$2
    printf '%s\n' "$pid" > "$pid_file"
}

free_port() {
    local port=$1
    [[ -n "$port" ]] || return 0
    if command -v fuser >/dev/null 2>&1; then
        fuser -k -TERM "${port}/tcp" 2>/dev/null || true
        sleep 0.5
        fuser -k -KILL "${port}/tcp" 2>/dev/null || true
    elif command -v lsof >/dev/null 2>&1; then
        local port_pids
        port_pids="$(lsof -ti :"${port}" 2>/dev/null || true)"
        if [[ -n "$port_pids" ]]; then
            echo "$port_pids" | xargs -r kill -9 2>/dev/null || true
        fi
    fi
}

kill_by_pid_file() {
    local pid_file=$1
    if [[ -f "$pid_file" ]]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            for _ in {1..10}; do
                kill -0 "$pid" 2>/dev/null || break
                sleep 0.2
            done
            if kill -0 "$pid" 2>/dev/null; then
                kill -KILL "$pid" 2>/dev/null || true
            fi
        fi
        rm -f "$pid_file"
    fi
}

# ── Node / Bun Detection ─────────────────────────────────────────────────────
ensure_node_bun() {
    if command -v bun &>/dev/null; then
        return 0
    fi
    if command -v npm &>/dev/null && command -v node &>/dev/null; then
        return 0
    fi
    info "Installing Bun package manager..."
    curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 || true
    export PATH="$HOME/.bun/bin:$PATH"
    if command -v bun &>/dev/null; then
        log "Bun installed: $(bun --version)"
        return 0
    fi
    info "Installing Node.js via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null 2>&1 || true
    sudo apt-get install -y nodejs >/dev/null 2>&1 || true
    return 0
}

run_bun_or_npm() {
    local bun_cmd="$1"
    local npm_cmd="$2"
    if command -v bun &>/dev/null; then
        eval "$bun_cmd"
    else
        eval "$npm_cmd"
    fi
}

# ── Cloudflare Tunnels ───────────────────────────────────────────────────────
install_cloudflared() {
    if command -v cloudflared > /dev/null 2>&1; then
        log "cloudflared already installed"
        return 0
    fi
    info "Installing cloudflared for external Colab tunnels..."
    local ARCH; ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
    local TMP_DEB="/tmp/cloudflared-$$.deb"
    if ! wget -q "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" -O "$TMP_DEB" 2>/dev/null; then
        warn "Failed to download cloudflared"
        rm -f "$TMP_DEB"
        return 1
    fi
    sudo dpkg -i "$TMP_DEB" 2>/dev/null || sudo apt-get install -f -y 2>/dev/null || true
    rm -f "$TMP_DEB"
    return 0
}

start_tunnel() {
    local port=$1
    local name=$2
    if ! command -v cloudflared > /dev/null 2>&1; then
        return 1
    fi
    kill_by_pid_file "$CF_DIR/${port}.pid"
    info "Starting Cloudflare tunnel for ${name} (port ${port})..."
    nohup cloudflared tunnel \
        --url "http://127.0.0.1:${port}" \
        --http-host-header "127.0.0.1:${port}" \
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

# ── Service Start / Stop Functions ──────────────────────────────────────────
colab_stop_services() {
    head_ "Stopping All Services"
    info "Stopping Foreground Supervisor..."
    kill_by_pid_file "$PID_DIR/supervisor.pid"
    pkill -KILL -f "colab_watch.sh" 2>/dev/null || true

    info "Stopping Cloudflare Tunnels..."
    pkill -f "cloudflared tunnel" 2>/dev/null || true
    rm -f "${CF_DIR}"/*.pid 2>/dev/null || true
    log "Cloudflare tunnels stopped"

    info "Stopping Frontend..."
    kill_by_pid_file "$PID_DIR/frontend.pid"
    pkill -TERM -f "next start" 2>/dev/null || true
    pkill -TERM -f "next-server" 2>/dev/null || true
    free_port 3000
    log "Frontend stopped"

    info "Stopping Backend API..."
    kill_by_pid_file "$PID_DIR/api.pid"
    pkill -TERM -f "uvicorn app.main:app" 2>/dev/null || true
    free_port 8000
    log "Backend API stopped"

    info "Stopping ComfyUI Execution Engine..."
    kill_by_pid_file "$PID_DIR/comfyui.pid"
    pkill -TERM -f "ENGINE/ComfyUI/main.py" 2>/dev/null || true
    free_port 8188
    log "ComfyUI stopped"

    # Stop Redis
    info "Stopping Redis..."
    if command -v redis-cli &>/dev/null; then
        redis-cli shutdown nosave 2>/dev/null || true
    fi
    if command -v service &>/dev/null; then
        sudo service redis-server stop 2>/dev/null || true
    fi
    if command -v systemctl &>/dev/null; then
        sudo systemctl stop redis-server 2>/dev/null || true
    fi
    pkill -f "redis-server" 2>/dev/null || true
    free_port 6379
    log "Redis stopped"

    # Stop PostgreSQL
    info "Stopping PostgreSQL..."
    if command -v service &>/dev/null; then
        sudo service postgresql stop 2>/dev/null || true
    fi
    if command -v pg_ctlcluster &>/dev/null; then
        for v in $(ls /etc/postgresql/ 2>/dev/null); do
            sudo pg_ctlcluster "$v" main stop 2>/dev/null || true
        done
    fi
    if command -v systemctl &>/dev/null; then
        sudo systemctl stop postgresql 2>/dev/null || true
    fi
    pkill -f "postgres" 2>/dev/null || true
    free_port 5432
    log "PostgreSQL stopped"

    rm -f "${PID_DIR}"/*.pid "${PID_DIR}"/*.restart-count 2>/dev/null || true
    log "All services stopped cleanly"
}

_colab_show_status() {
    echo ""
    echo -e "${CYAN}Service Status:${NC}"
    curl -sf http://127.0.0.1:8188/system_stats >/dev/null 2>&1 && echo -e "  ${GREEN}●${NC} ComfyUI Engine       (port 8188)" || echo -e "  ${RED}●${NC} ComfyUI Engine       (port 8188)"
    curl -sf http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1 && echo -e "  ${GREEN}●${NC} Backend API          (port 8000)" || echo -e "  ${RED}●${NC} Backend API          (port 8000)"
    curl -sf http://127.0.0.1:3000/ >/dev/null 2>&1 && echo -e "  ${GREEN}●${NC} Frontend             (port 3000)" || echo -e "  ${RED}●${NC} Frontend             (port 3000)"
    if command -v pg_isready &>/dev/null && pg_isready -q 2>/dev/null; then
        echo -e "  ${GREEN}●${NC} PostgreSQL           (port 5432)"
    else
        echo -e "  ${RED}●${NC} PostgreSQL"
    fi
    if command -v redis-cli &>/dev/null && redis-cli ping &>/dev/null; then
        echo -e "  ${GREEN}●${NC} Redis                (port 6379)"
    else
        echo -e "  ${RED}●${NC} Redis"
    fi
    if [[ -f "$PID_DIR/supervisor.pid" ]] && kill -0 "$(cat "$PID_DIR/supervisor.pid" 2>/dev/null)" 2>/dev/null; then
        echo -e "  ${GREEN}●${NC} Supervisor/Watchdog  (PID: $(cat "$PID_DIR/supervisor.pid"))"
    else
        echo -e "  ${YELLOW}●${NC} Supervisor/Watchdog  (inactive)"
    fi
    echo ""
    if [[ -f "$CF_DIR/3000.url" ]]; then
        echo -e "  ${CYAN}Public Frontend:${NC} $(cat "$CF_DIR/3000.url")"
    fi
    if [[ -f "$CF_DIR/8000.url" ]]; then
        echo -e "  ${CYAN}Public API Docs:${NC} $(cat "$CF_DIR/8000.url")/docs"
    fi
    echo ""
}

patch_runtime_compatibility() {
    "$PYTHON_BIN" -c "
import os, sys, glob, typing
# 1. Patch PyTorch infer_schema for Python 3.12 GenericAlias (list[int] -> typing.List[int])
try:
    import torch._library.infer_schema as m
    p = m.__file__
    with open(p, 'r') as f:
        c = f.read()
    if 'GENERIC_ALIAS_WORKAROUND' not in c:
        c = c.replace(
            'annotation_type, _ = unstringify_type(param.annotation)',
            '''annotation_type, _ = unstringify_type(param.annotation)
        # GENERIC_ALIAS_WORKAROUND
        if typing.get_origin(annotation_type) is list:
            _args = typing.get_args(annotation_type)
            if _args:
                annotation_type = typing.List[_args]'''
        )
        with open(p, 'w') as f:
            f.write(c)
except Exception:
    pass

# 2. Patch comfy_kitchen eager ops for typing compatibility
for site in sys.path:
    for f in glob.glob(os.path.join(site, 'comfy_kitchen/backends/eager/*.py')):
        try:
            with open(f, 'r') as fp:
                c = fp.read()
            if ': list[' in c:
                c = c.replace(': list[int]', ': typing.Sequence[int]').replace(': list[bool]', ': typing.Sequence[bool]')
                if 'import typing' not in c:
                    c = 'import typing\n' + c
                with open(f, 'w') as fp:
                    fp.write(c)
        except Exception:
            pass
" 2>/dev/null || true

    # 3. Ensure pytorch3d binary wheel is installed for ComfyUI-3D-Pack
    if ! "$PYTHON_BIN" -c "import pytorch3d" &>/dev/null; then
        echo "[INFO] Installing pre-compiled pytorch3d wheel for Python 3.12..."
        "$PYTHON_BIN" -m pip install -q fvcore iopath || true
        "$PYTHON_BIN" -m pip install -q --no-deps "https://github.com/MiroPsota/torch_packages_builder/releases/download/pytorch3d-0.7.8/pytorch3d-0.7.8%2Bpt2.5.1cu124-cp312-cp312-linux_x86_64.whl" || true
    fi

    # 4. Guard TriplaneGaussian and Unique3D imports in ComfyUI-3D-Pack nodes.py
    for pack_nodes in "${PROJECT_ROOT}/ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/nodes.py" "/content/AI_Studio/ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/nodes.py"; do
        if [[ -f "$pack_nodes" ]]; then
            "$PYTHON_BIN" -c "
import os, subprocess, re
p = '${pack_nodes}'
pack_dir = os.path.dirname(p)
try:
    subprocess.run(['git', 'checkout', 'nodes.py'], cwd=pack_dir, capture_output=True, check=False)
except Exception:
    pass

with open(p, 'r') as f:
    c = f.read()

if '# TRIPLANE_GAUSSIAN_GUARD_PATCHED' not in c:
    tgs_block_regex = r'(?:[ \t]*try:\s*\n)*(?:[ \t]*from TriplaneGaussian\.triplane_gaussian_transformers import TGS[\s\S]*?from TriplaneGaussian\.utils\.misc import todevice, get_device(?:\s*\n[ \t]*except Exception:[\s\S]*?get_device = None)?)'
    tgs_replacement = '''# TRIPLANE_GAUSSIAN_GUARD_PATCHED
try:
    from TriplaneGaussian.triplane_gaussian_transformers import TGS
    from TriplaneGaussian.utils.config import ExperimentConfig as ExperimentConfigTGS, load_config as load_config_tgs
    from TriplaneGaussian.data import CustomImageOrbitDataset
    from TriplaneGaussian.utils.misc import todevice, get_device
except Exception:
    TGS = None; ExperimentConfigTGS = None; load_config_tgs = None; CustomImageOrbitDataset = None; todevice = None; get_device = None'''
    c = re.sub(tgs_block_regex, tgs_replacement, c, count=1)

if '# UNIQUE3D_GUARD_PATCHED' not in c:
    u3d_block_regex = r'(?:[ \t]*try:\s*\n)*(?:[ \t]*from Unique3D\.custum_3d_diffusion\.custum_pipeline\.unifield_pipeline_img2mvimg import StableDiffusionImage2MVCustomPipeline[\s\S]*?from Unique3D\.mesh_reconstruction\.refine import run_mesh_refine(?:\s*\n[ \t]*except Exception:[\s\S]*?StableDiffusionImage2MVCustomPipeline = None)?)'
    u3d_replacement = '''# UNIQUE3D_GUARD_PATCHED
try:
    from Unique3D.custum_3d_diffusion.custum_pipeline.unifield_pipeline_img2mvimg import StableDiffusionImage2MVCustomPipeline
    from Unique3D.mesh_reconstruction.refine import run_mesh_refine
except Exception:
    StableDiffusionImage2MVCustomPipeline = None
    run_mesh_refine = None'''
    c = re.sub(u3d_block_regex, u3d_replacement, c, count=1)

with open(p, 'w') as f:
    f.write(c)
" 2>/dev/null || true
        fi
    done
}

colab_start_services() {
    head_ "Starting AI 3D Studio Services"

    # Start PostgreSQL if not running
    if command -v pg_isready &>/dev/null && ! pg_isready -q 2>/dev/null; then
        info "Starting PostgreSQL..."
        sudo service postgresql start 2>/dev/null || true
        sleep 2
    fi

    # Start Redis if not running
    if command -v redis-cli &>/dev/null && ! redis-cli ping &>/dev/null; then
        info "Starting Redis..."
        sudo service redis-server start 2>/dev/null || true
    fi

    # Database Schema
    step "Running database migrations / schema verification..."
    (
        cd backend
        "$PYTHON_BIN" -c "
import asyncio
from app.database import engine, Base
import app.models
async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
asyncio.run(init())
" 2>/dev/null || true
    )
    log "Database schema initialized"

    # Start ComfyUI Engine
    step "Starting ComfyUI Execution Engine (http://localhost:8188)..."
    kill_by_pid_file "$PID_DIR/comfyui.pid"
    free_port 8188
    patch_runtime_compatibility
    local COMFY_ARGS="--listen 0.0.0.0 --port 8188 --enable-cors-header * --enable-compress-response-body --mmap-torch-files"
    if [[ "$(detect_gpu)" == "cpu" ]]; then
        COMFY_ARGS="$COMFY_ARGS --cpu --use-split-cross-attention"
    else
        COMFY_ARGS="$COMFY_ARGS --async-offload 2"
    fi
    (
        cd "$PROJECT_ROOT"
        nohup "$PYTHON_BIN" ENGINE/ComfyUI/main.py $COMFY_ARGS > "$LOG_DIR/comfyui.log" 2>&1 &
        write_pid "$PID_DIR/comfyui.pid" $!
    )
    log "ComfyUI started (PID: $(cat "$PID_DIR/comfyui.pid"))"

    # Wait for ComfyUI port 8188 to be responsive so FastAPI startup health check connects cleanly
    info "Waiting for ComfyUI to be ready on port 8188..."
    for i in {1..20}; do
        if curl -sf http://127.0.0.1:8188/system_stats &>/dev/null; then
            log "ComfyUI engine is ready and accepting requests"
            break
        fi
        sleep 1
    done

    # Start FastAPI
    step "Starting Backend API (http://localhost:8000)..."
    kill_by_pid_file "$PID_DIR/api.pid"
    free_port 8000
    (
        cd backend
        set -a; [[ -f ../.env ]] && source ../.env; set +a
        nohup "$PYTHON_BIN" -m uvicorn app.main:app \
            --host 0.0.0.0 \
            --port 8000 \
            --log-level info \
            > "$LOG_DIR/api.log" 2>&1 &
        write_pid "$PID_DIR/api.pid" $!
    )
    log "Backend API started (PID: $(cat "$PID_DIR/api.pid"))"

    # Start Frontend
    step "Starting Frontend (http://localhost:3000)..."
    kill_by_pid_file "$PID_DIR/frontend.pid"
    free_port 3000
    (
        cd "$PROJECT_ROOT"
        export HOSTNAME=0.0.0.0
        export PORT=3000
        export BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
        if command -v bun &>/dev/null; then
            nohup bun start > "$LOG_DIR/frontend.log" 2>&1 &
        else
            nohup npm start > "$LOG_DIR/frontend.log" 2>&1 &
        fi
        write_pid "$PID_DIR/frontend.pid" $!
    )
    log "Frontend started (PID: $(cat "$PID_DIR/frontend.pid"))"

    # Verification loop
    info "Verifying service health..."
    for i in {1..30}; do
        if curl -sf http://127.0.0.1:8000/api/v1/health &>/dev/null && \
           curl -sf http://127.0.0.1:8188/system_stats &>/dev/null && \
           curl -sf http://127.0.0.1:3000/ &>/dev/null; then
            log "All core services healthy and serving traffic!"
            break
        fi
        sleep 2
    done

    # ── Cloudflare Tunnels ───────────────────────────────────────────────────
    head_ "Setting up Cloudflare Tunnels for External Access"
    local cf_api_url=""
    local cf_frontend_url=""
    local cf_comfy_url=""
    if install_cloudflared; then
        cf_api_url=$(start_tunnel 8000 "Backend API")
        cf_frontend_url=$(start_tunnel 3000 "Frontend")
        cf_comfy_url=$(start_tunnel 8188 "ComfyUI Engine")
    fi

    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}✅ AI 3D Studio Services Active${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BOLD}Local Services:${NC}"
    echo -e "    Frontend       ${CYAN}http://localhost:3000${NC}"
    echo -e "    Backend API    ${CYAN}http://localhost:8000${NC}"
    echo -e "    ComfyUI Engine ${CYAN}http://localhost:8188${NC}"
    echo -e "    API Docs       ${CYAN}http://localhost:8000/docs${NC}"
    echo ""

    if [[ -n "$cf_frontend_url" ]]; then
        echo -e "  ${BOLD}Cloudflare Public URLs:${NC}"
        echo -e "    Frontend       ${GREEN}${cf_frontend_url}${NC}"
    fi
    if [[ -n "$cf_comfy_url" ]]; then
        echo -e "    ComfyUI Engine ${GREEN}${cf_comfy_url}${NC}"
    fi
    if [[ -n "$cf_api_url" ]]; then
        echo -e "    Backend API    ${GREEN}${cf_api_url}${NC}"
        echo -e "    API Docs       ${GREEN}${cf_api_url}/docs${NC}"
    fi
    echo ""
}

colab_restart_services() {
    colab_stop_services
    colab_start_services
}

colab_view_logs() {
    while true; do
        echo ""
        echo -e "${BOLD}${CYAN}Choose service log to inspect:${NC}"
        echo "  1) ComfyUI Engine (logs/comfyui.log)"
        echo "  2) FastAPI Backend (logs/api.log)"
        echo "  3) Next.js Frontend (logs/frontend.log)"
        echo "  4) Cloudflare Tunnels (logs/cloudflare_*.log)"
        echo "  b) Back"
        echo ""
        read -rp "  Choice: " lchoice || return 0
        echo ""
        case "$lchoice" in
            1)
                if [[ -f "$LOG_DIR/comfyui.log" ]]; then
                    echo -e "${GRAY}(Press Ctrl+C to stop following logs and return)${NC}"
                    tail -n 50 -f "$LOG_DIR/comfyui.log" || true
                else
                    warn "Log file not found: $LOG_DIR/comfyui.log"
                fi
                ;;
            2)
                if [[ -f "$LOG_DIR/api.log" ]]; then
                    echo -e "${GRAY}(Press Ctrl+C to stop following logs and return)${NC}"
                    tail -n 50 -f "$LOG_DIR/api.log" || true
                else
                    warn "Log file not found: $LOG_DIR/api.log"
                fi
                ;;
            3)
                if [[ -f "$LOG_DIR/frontend.log" ]]; then
                    echo -e "${GRAY}(Press Ctrl+C to stop following logs and return)${NC}"
                    tail -n 50 -f "$LOG_DIR/frontend.log" || true
                else
                    warn "Log file not found: $LOG_DIR/frontend.log"
                fi
                ;;
            4)
                echo -e "${GRAY}(Press Ctrl+C to stop following logs and return)${NC}"
                tail -n 50 -f "$LOG_DIR"/cloudflare_*.log 2>/dev/null || warn "No tunnel logs found"
                ;;
            b|B)
                return 0
                ;;
            *)
                echo -e "${RED}Invalid choice${NC}"
                ;;
        esac
    done
}

colab_menu() {
    IN_COLAB_MENU=true
    while true; do
        echo -e "\n${BOLD}${MAGENTA}  ╔════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BOLD}${MAGENTA}  ║${NC}         ${BOLD}${WHITE}Google Colab Service Manager${NC}                   ${MAGENTA}║${NC}"
        echo -e "${BOLD}${MAGENTA}  ╠════════════════════════════════════════════════════════╣${NC}"
        echo -e "${BOLD}${MAGENTA}  ║${NC}  ${CYAN}[1]${NC}  Start all services (ComfyUI + API + Web + CF)   ${BOLD}${MAGENTA}║${NC}"
        echo -e "${BOLD}${MAGENTA}  ║${NC}  ${CYAN}[2]${NC}  Stop all services & tunnels                     ${BOLD}${MAGENTA}║${NC}"
        echo -e "${BOLD}${MAGENTA}  ║${NC}  ${CYAN}[3]${NC}  Restart all services                            ${BOLD}${MAGENTA}║${NC}"
        echo -e "${BOLD}${MAGENTA}  ║${NC}  ${CYAN}[4]${NC}  Service status & Cloudflare URLs                ${BOLD}${MAGENTA}║${NC}"
        echo -e "${BOLD}${MAGENTA}  ║${NC}  ${CYAN}[5]${NC}  View live service logs                          ${BOLD}${MAGENTA}║${NC}"
        echo -e "${BOLD}${MAGENTA}  ║${NC}  ${CYAN}[6]${NC}  Run full 1-click bootstrap & start              ${BOLD}${MAGENTA}║${NC}"
        echo -e "${BOLD}${MAGENTA}  ║${NC}  ${CYAN}[7]${NC}  Run setup only (skip starting services)         ${BOLD}${MAGENTA}║${NC}"
        echo -e "${BOLD}${MAGENTA}  ╠════════════════════════════════════════════════════════╣${NC}"
        echo -e "${BOLD}${MAGENTA}  ║${NC}  ${GRAY}[b]${NC}  Back / Return                                   ${BOLD}${MAGENTA}║${NC}"
        echo -e "${BOLD}${MAGENTA}  ║${NC}  ${GRAY}[q]${NC}  Quit                                            ${BOLD}${MAGENTA}║${NC}"
        echo -e "${BOLD}${MAGENTA}  ╚════════════════════════════════════════════════════════╝${NC}"
        echo ""
        read -rp "  Choice: " colab_choice || { echo ""; break; }
        case "$colab_choice" in
            1)
                colab_start_services || true
                echo ""
                read -rp "Attach live supervisor monitor? [y/N]: " attach_choice || true
                if [[ "$attach_choice" =~ ^[yY] ]]; then
                    bash "${PROJECT_ROOT}/scripts/colab_watch.sh" --foreground || true
                fi
                echo ""
                read -rp "Press Enter to continue..." || true
                ;;
            2)
                colab_stop_services || true
                echo ""
                read -rp "Press Enter to continue..." || true
                ;;
            3)
                colab_restart_services || true
                echo ""
                read -rp "Press Enter to continue..." || true
                ;;
            4)
                _colab_show_status || true
                echo ""
                read -rp "Press Enter to continue..." || true
                ;;
            5)
                colab_view_logs || true
                ;;
            6)
                SKIP_START=false
                run_full_bootstrap || true
                echo ""
                read -rp "Press Enter to continue..." || true
                ;;
            7)
                SKIP_START=true
                run_full_bootstrap || true
                echo ""
                read -rp "Press Enter to continue..." || true
                ;;
            b|B)
                return 0
                ;;
            q|Q)
                echo -e "\n${GREEN}Goodbye! 👋${NC}\n"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid choice${NC}"
                sleep 1
                ;;
        esac
    done
}

# ═════════════════════════════════════════════════════════════════════════
# Full Bootstrap Execution Flow
# ═════════════════════════════════════════════════════════════════════════

run_full_bootstrap() {
step "1/6 Colab Environment Setup"
_sanitize_apt_cuda_sources
setup_swap
ensure_cuda_12_4

# Ensure uv is available
if ! command -v uv &>/dev/null; then
    info "Installing uv (fast Python package installer)..."
    curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null 2>&1 || true
    export PATH="$HOME/.local/bin:$PATH"
    if [[ -f "$HOME/.local/bin/uv" && ! -e /usr/local/bin/uv ]]; then
        sudo ln -sf "$HOME/.local/bin/uv" /usr/local/bin/uv 2>/dev/null || true
    fi
fi
log "uv ready: $(command -v uv || echo 'system-fallback')"

# Ensure Bun / Node
ensure_node_bun
log "Node/Bun runtime ready"

# Setup PostgreSQL and Redis
info "Ensuring PostgreSQL & Redis are installed..."
if ! command -v psql &>/dev/null || ! command -v redis-server &>/dev/null; then
    sudo apt-get update -qq && sudo apt-get install -y postgresql postgresql-contrib redis-server ffmpeg libgl1 ninja-build build-essential >/dev/null 2>&1 || true
fi
sudo service postgresql start 2>/dev/null || true
sudo service redis-server start 2>/dev/null || true

# Configure PostgreSQL user
if command -v psql &>/dev/null; then
    sudo -u postgres psql -c "CREATE USER ai_studio WITH PASSWORD 'ai_studio_dev';" 2>/dev/null || true
    sudo -u postgres psql -c "CREATE DATABASE ai_studio OWNER ai_studio;" 2>/dev/null || true
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ai_studio TO ai_studio;" 2>/dev/null || true
fi
log "Database and Redis services active"

# ── Step 2: Project Environment ──────────────────────────────────────────
step "2/6 Configuring Project Environment & Directories"
if [[ ! -f .env ]]; then
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
STORAGE_LOCAL_PATH=backend/storage
RUNTIME_CACHE_DIR=backend/.runtime_cache

# ── GPU ───────────────────────────────────────────────────
CUDA_VISIBLE_DEVICES=0
CUDA_DEVICE=auto
PLATFORM_MODE=gpu
CPU_FALLBACK=false

# ── Dev ────────────────────────────────────────────────────
DEBUG=false
PYTHONPATH=./backend
ENVEOF
    log "Created .env configuration"
else
    log ".env configuration already present"
fi

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
    logs \
    .pids; do
    mkdir -p "$dir"
done
log "Storage & Engine directories created"

# ── Step 3: Backend Python Environment ───────────────────────────────────
step "3/6 Setting Up Python Virtual Environment & PyTorch (CUDA 12.4)"
if [[ ! -d "backend/.venv" || ! -x "$PYTHON_BIN" ]]; then
    info "Creating Python 3.12 virtual environment..."
    uv venv backend/.venv --python 3.12 --seed 2>/dev/null || uv venv backend/.venv --python 3.12 2>/dev/null || python3 -m venv backend/.venv
fi

# Ensure pip, wheel, setuptools, and ninja build tools are present inside the venv
info "Ensuring pip, setuptools, wheel, ninja, and PyGithub are available in Python venv..."
uv pip install --python "$PYTHON_BIN" pip setuptools wheel ninja PyGithub || true

# Install PyTorch matching GPU / CUDA — always target CUDA 12.4 (cu124) on GPU
if [[ "$(detect_gpu)" == "gpu" ]]; then
    ensure_cuda_12_4
    setup_cuda_env
    has_cu124=$("$PYTHON_BIN" -c "import torch; print(torch.cuda.is_available() and '12.4' in str(torch.version.cuda or ''))" 2>/dev/null || echo "False")
    if [[ "$has_cu124" == "True" ]]; then
        log "PyTorch CUDA 12.4 already active: $($PYTHON_BIN -c 'import torch; print(torch.__version__)')"
    else
        info "Installing PyTorch 2.5.1 with CUDA 12.4 (cu124) via uv..."
        uv pip install --python "$PYTHON_BIN" \
            torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
            --index-url "https://download.pytorch.org/whl/cu124" || {
            warn "Direct cu124 pinned install had warnings, trying unpinned cu124..."
            uv pip install --python "$PYTHON_BIN" torch torchvision torchaudio \
                --index-url https://download.pytorch.org/whl/cu124
        }
    fi
else
    info "Installing PyTorch CPU..."
    uv pip install --python "$PYTHON_BIN" torch torchvision torchaudio \
        --index-url https://download.pytorch.org/whl/cpu
fi
TORCH_INFO=$("$PYTHON_BIN" -c "import torch; print(f'{torch.__version__} (CUDA: {torch.cuda.is_available()})')" 2>/dev/null || echo "installed")
log "PyTorch runtime ready: ${TORCH_INFO}"

# ── Step 4: Backend Dependencies ─────────────────────────────────────────
step "4/6 Installing Backend API Dependencies"
uv pip install --python "$PYTHON_BIN" -r backend/requirements.txt
log "FastAPI backend dependencies installed"

# ── Step 5: ComfyUI + ComfyUI-3D-Pack Engine ─────────────────────────────
step "5/6 Installing ComfyUI + ComfyUI-3D-Pack Execution Engine"
PYTHON_BIN="$PYTHON_BIN" bash scripts/install_comfyui.sh
log "ComfyUI and 3D Pack installation verified"

# ── Step 6: Frontend Build ───────────────────────────────────────────────
step "6/6 Installing Frontend Dependencies & Building"
if [[ ! -d node_modules ]]; then
    info "Installing frontend packages..."
    run_bun_or_npm "bun install" "npm install" > "$LOG_DIR/frontend_install.log" 2>&1 || true
fi

if [[ ! -d .next || ! -f .next/BUILD_ID ]]; then
    info "Building Next.js production bundle..."
    run_bun_or_npm "bun run build" "npm run build" > "$LOG_DIR/frontend_build.log" 2>&1 || {
        warn "Next.js production build had warnings — check logs/frontend_build.log"
    }
fi
log "Frontend ready"

    if [[ "$SKIP_START" == "true" ]]; then
        ok "Colab bootstrap complete (--skip-start specified). Exiting."
        return 0
    fi

    # ── Start Services & Hand off to Foreground Supervisor ─────────────────────
    colab_start_services
    exec bash "${PROJECT_ROOT}/scripts/colab_watch.sh" --foreground
}

# ── Action Dispatch ──────────────────────────────────────────────────────
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
    status)
        _colab_show_status
        exit 0
        ;;
    interactive)
        colab_menu
        exit 0
        ;;
    setup)
        run_full_bootstrap
        exit 0
        ;;
    *)
        colab_menu
        exit 0
        ;;
esac
