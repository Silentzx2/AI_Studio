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
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${GREEN}[COLAB]${NC}  $*"; }
info()  { echo -e "${CYAN}[INFO]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}   $*"; }
err()   { echo -e "${RED}[ERROR]${NC}  $*" >&2; }
step()  { echo -e "\n${BOLD}${BLUE}➜ $*${NC}"; }

# ── Project Root ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ── Flags ────────────────────────────────────────────────────────────────
SKIP_START=false
REPOS_ONLY=false
WEIGHTS_ONLY=false

for arg in "$@"; do
    case "$arg" in
        --skip-start)    SKIP_START=true ;;
        --repos-only)    REPOS_ONLY=true ;;
        --weights-only)  WEIGHTS_ONLY=true ;;
        --help|-h)
            echo "Usage: bash scripts/colab.sh [OPTIONS]"
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
            # Cap at cu124 (latest PyTorch 2.5.1 supports)
            if [[ "$ver" -gt 124 ]]; then
                echo "124"
            else
                echo "$ver"
            fi
            return
        fi
    fi
    echo "121"
}

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

# Colab has no systemd — use SQLite for database
export USE_SQLITE=1
# ponytail: force the Colab preparation policy (low VRAM + low weight) on, so
# model gating does not depend on runtime self-detection misfiring.
export COLAB_PREP_GATE=1
warn "Running in Colab — using SQLite fallback for database and in-process broker for Celery."

GPU_TYPE=$(detect_gpu)
CUDA_VERSION=$(detect_cuda_version)
log "GPU : ${CYAN}${GPU_TYPE}${NC}"
log "CUDA: ${CYAN}cu${CUDA_VERSION}${NC}"

# Build-time frontend config must be set BEFORE `npm run build` (Next.js embeds
# NEXT_PUBLIC_* at build time). Export early so both the build and `npm start`
# inherit the same API URL.
export NEXT_PUBLIC_API_URL="${BACKEND_URL:-http://localhost:8000}"

# ── Step 2: Configure .env ────────────────────────────────────────────────

step "2/6 Configuring project environment"

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

# Load .env, then override for Colab (SQLite + localhost)
set -a
source .env
set +a

export USE_SQLITE=1
export DATABASE_URL="sqlite:///$(pwd)/backend/storage/studio.db"
export DATABASE_SYNC_URL="sqlite:///$(pwd)/backend/storage/studio.db"
export BACKEND_URL="http://localhost:8000"

log "Environment configured (SQLite mode)"

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

log "Project directories created"

# ── Step 4: Backend Python environment ────────────────────────────────────

step "4/6 Setting up backend Python environment"

# Ensure backend venv exists (clear and recreate if corrupted)
if [[ ! -x backend/.venv/bin/python ]]; then
    if [[ -d backend/.venv ]]; then
        info "Existing backend/.venv is corrupted — removing..."
        rm -rf backend/.venv
    fi
    info "Creating backend virtual environment with uv..."
    uv venv --python 3.12 backend/.venv || {
        err "Failed to create backend venv"
        exit 1
    }
    log "Backend venv created"
else
    log "Backend venv already exists at backend/.venv"
fi

# Install PyTorch (GPU or CPU depending on hardware)
if [[ "$GPU_TYPE" == "gpu" ]]; then
    # Normalize CUDA version for PyTorch wheel index
    # PyTorch 2.5.1 supports: cu118, cu121, cu124
    CUDA_INDEX="${CUDA_VERSION:-121}"
    # Map any CUDA 12.x to nearest compatible wheel
    if [[ "$CUDA_INDEX" == "120" || "$CUDA_INDEX" == "121" ]]; then
        CUDA_INDEX="121"
    elif [[ "$CUDA_INDEX" == "125" || "$CUDA_INDEX" == "126" || "$CUDA_INDEX" == "127" || "$CUDA_INDEX" == "128" ]]; then
        CUDA_INDEX="124"
    fi
    info "Installing PyTorch with CUDA ${CUDA_INDEX} via uv..."
    uv pip install --python backend/.venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
        --index-url "https://download.pytorch.org/whl/cu${CUDA_INDEX}" -q 2>/dev/null || {
        warn "PyTorch CUDA install failed, trying CPU fallback..."
        uv pip install --python backend/.venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
            --index-url https://download.pytorch.org/whl/cpu -q 2>/dev/null || true
    }
else
    info "Installing PyTorch CPU-only via uv..."
    uv pip install --python backend/.venv/bin/python torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
        --index-url https://download.pytorch.org/whl/cpu -q 2>/dev/null || true
fi

# Install backend deps
if [[ -f backend/requirements.txt ]]; then
    info "Installing backend dependencies..."
    uv pip install --python backend/.venv/bin/python -r backend/requirements.txt -q 2>/dev/null || {
        warn "Some backend dependencies may have failed to install"
    }
    log "Backend dependencies installed"
else
    warn "backend/requirements.txt not found — skipping backend deps"
fi

# ── Step 5: Frontend ──────────────────────────────────────────────────────

step "5/6 Setting up frontend"

# Ensure Node.js / npm is available (Colab may not have it)
if ! command -v npm &>/dev/null; then
    warn "Node.js/npm not found — attempting to install..."
    if command -v curl &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x 2>/dev/null | sudo bash - 2>/dev/null || true
        sudo apt-get install -y nodejs 2>/dev/null || true
    fi
fi

if ! command -v npm &>/dev/null; then
    err "Node.js/npm not found and auto-install failed. Install manually: https://nodejs.org/"
    exit 1
fi

log "Node.js available: $(node --version 2>/dev/null || echo 'unknown')"

# Install frontend deps
if [[ ! -d node_modules ]]; then
    info "Installing npm dependencies..."
    npm ci --prefer-offline --no-audit 2>/dev/null || npm install --no-audit 2>/dev/null || {
        warn "Frontend dependency installation had issues"
    }
fi

# Build Next.js if needed
if [[ ! -d .next ]]; then
    info "Building Next.js..."
    npm run build 2>/dev/null || warn "Next.js build failed — will retry on start"
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
    (
        cd backend
        PYTHONPATH=. "$PYTHONBIN" - << 'PYEOF'
import logging
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
    from runtime.installer import REPOS, prepare_runtime, get_install_status
except Exception as exc:
    print(f"  [FAIL] Could not import runtime modules: {exc}")
    sys.exit(1)

# Use user-selected repos if set via interactive prompt, else fall back to default
import os as _os
_selected = _os.environ.get("COLAB_SELECTED_REPOS", "").strip()
if _selected:
    COLAB_ALLOWED_REPOS = set(_selected.split(","))
else:
    COLAB_ALLOWED_REPOS = {"TripoSG", "TRELLIS", "Hunyuan3D-2mini"}

# Map repos to their providers for Colab gating
repos_to_prepare = []
for repo_name in sorted(REPOS.keys()):
    if repo_name not in COLAB_ALLOWED_REPOS:
        print(f"  [COLAB] {repo_name}: skipped (not in allowed list)")
        continue
    repo_cfg = REPOS.get(repo_name, {})
    providers = repo_cfg.get("providers", [])
    colab_skip_reason = None
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

# Use new Stage A: prepare_runtime (clone + venv + deps, NO weights)
for repo_name in repos_to_prepare:
    providers = REPOS.get(repo_name, {}).get("providers", [])
    for provider in providers:
        print(f"  [PREPARE] {provider}: preparing runtime...")
        r = prepare_runtime(provider)
        state = r.get("state", "unknown")
        if state == "runtime_ready":
            print(f"    [OK  ] {provider}: runtime ready")
        elif state == "runtime_partial":
            print(f"    [WARN] {provider}: runtime partial (some deps may be missing)")
        else:
            print(f"    [FAIL] {provider}: {r.get('error', 'unknown error')}")

print("\nRuntime preparation complete.")
print("NOTE: Weights are NOT downloaded during runtime preparation.")
print("      Use the UI 'Download Weights' action or the API /download-weights endpoint.")
PYEOF
    )
}

# ── Disk space precheck (Colab free-tier disk is limited) ──────────────────
# ponytail: abort loud-and-early if there isn't enough room for the largest
# model we might pull, instead of failing mid-download and leaving a half
# written weights dir. Single call site before any weight download.
check_disk_space() {
    local needed_gb=${1:-40}
    local avail_gb
    avail_gb=$(df -P --block-size=1G "$PROJECT_ROOT" 2>/dev/null | awk 'NR==2 {print $4}')
    avail_gb=${avail_gb:-0}
    if [[ "$avail_gb" -lt "$needed_gb" ]]; then
        warn "Only ${avail_gb} GB free on disk; at least ${needed_gb} GB recommended before downloading weights."
        warn "Weight download may fail or fill the disk. Free space or run with --repos-only."
        return 1
    fi
    log "Disk space OK: ${avail_gb} GB free (need ~${needed_gb} GB)"
    return 0
}

download_model_weights() {
    step "Downloading model weights"
    local PYTHONBIN="${PROJECT_ROOT}/backend/.venv/bin/python"
    [[ -x "$PYTHONBIN" ]] || { err "Backend venv missing — run full bootstrap first"; return 1; }
    # ponytail: gate on disk before pulling multi-GB weights.
    check_disk_space 40 || warn "Proceeding despite low disk space — download may fail."
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
    from runtime.capability import (
        get_model_vram_required,
        get_model_weight_size_gb,
        is_model_preparable_for_colab,
        get_colab_incompatibility_reason,
    )
    from runtime.installer import HF_MODELS, download_model_weights
except Exception as exc:
    print(f"  [FAIL] Could not import runtime modules: {exc}")
    sys.exit(1)

token = os.environ.get("HUGGINGFACE_TOKEN") or os.environ.get("HF_TOKEN")
# Colab: only download weights for models that pass the prep policy
COLAB_ALLOWED_PROVIDERS = ("triposg", "trellis", "hunyuan3d-2-mini")
for key in sorted(HF_MODELS.keys()):
        # Only download allowed models
        if key not in COLAB_ALLOWED_PROVIDERS:
            print(f"  [COLAB] {key}: skipped (not in allowed list)")
            continue
        if not is_model_preparable_for_colab(key):
            reason = get_colab_incompatibility_reason(key) or (
                f"Required VRAM: {get_model_vram_required(key) / 1024:.1f} GB"
            )
            print(f"  [COLAB] {key}: skipped")
            for line in reason.split("\n"):
                print(f"  {line}")
            continue
        print(f"  [WEIGHTS] {key}: downloading ~{HF_MODELS[key]['size_estimate_gb']}GB ...")
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
    (
        cd backend
        PYTHONPATH=. "$PYTHONBIN" - << 'PYEOF'
import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="  %(levelname)-5s %(name)s: %(message)s")
sys.path.insert(0, str(Path(".").resolve()))
try:
    from runtime.installer import REPOS, PROVIDER_METADATA
    from runtime.storage import get_storage_config
    from runtime.preflight import run_preflight_for_provider
except Exception as exc:
    print(f"  [FAIL] Could not import runtime modules: {exc}")
    sys.exit(1)

storage = get_storage_config()
# Colab: only preflight models that were prepared
COLAB_ALLOWED_REPOS = {"TripoSG", "TRELLIS", "Hunyuan3D-2mini"}
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
        result = run_preflight_for_provider(provider)
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
download_model_weights || warn "Weight download had issues - check output above"



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
else
    # Redis is available, use localhost URLs
    export REDIS_URL="redis://localhost:6379/0"
    export CELERY_BROKER_URL="redis://localhost:6379/0"
    export CELERY_RESULT_BACKEND="redis://localhost:6379/1"
fi

# ── Run migrations ────────────────────────────────────────────────────────
step "Running database migrations..."
(
    cd backend
    if "$PYTHON_BIN" -m alembic upgrade head 2>&1; then
        log "Migrations complete"
    else
        warn "Migrations skipped or failed (may already be applied)"
    fi
)

# ── Helper: Write PID ─────────────────────────────────────────────────────
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

# ── Start Backend API ─────────────────────────────────────────────────────
step "Starting Backend API (http://localhost:8000)..."
kill_by_pid_file "$PID_DIR/api.pid"
(
    cd backend
    $PYTHON_BIN -m uvicorn app.main:app \
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

# ── Colab Keep-Alive ────────────────────────────────────────────────────────
# Prevents idle disconnections in Google Colab during long-running tasks
# (model downloads, generation) by keeping a lightweight background loop
# that periodically pings the API health endpoint. Consumes negligible
# resources: a single curl every 45s, all output to /dev/null.
KEEPALIVE_PID_FILE="$PID_DIR/colab_keepalive.pid"
if [[ -f "$KEEPALIVE_PID_FILE" ]]; then
    kill_by_pid_file "$KEEPALIVE_PID_FILE"
fi
nohup bash -c 'trap "exit 0" TERM; while true; do curl -sf http://localhost:8000/api/v1/health >/dev/null 2>&1 || true; sleep 45; done' \
    > "$LOG_DIR/keepalive.log" 2>&1 &
echo $! > "$KEEPALIVE_PID_FILE"
log "Colab keep-alive started (PID: $(cat "$KEEPALIVE_PID_FILE"))"

# ── Browser-Level Keep-Alive (JavaScript injection) ─────────────────────────
# The network ping above keeps the VM active, but Colab's browser-level idle
# detection (Chrome throttles inactive tabs) can still disconnect. The script
# below generates a Python file the user runs in a Colab cell to inject JS
# that simulates periodic mouse clicks and keyboard activity.
KEEPALIVE_JS_PY="${PROJECT_ROOT}/scripts/colab_keepalive_js.py"
cat > "$KEEPALIVE_JS_PY" << 'JSKEEP'
#!/usr/bin/env python3
"""
Colab browser-level keep-alive.

Run this in a Colab cell AFTER the API is up:
    exec(open('scripts/colab_keepalive_js.py').read())

Injects JavaScript that simulates periodic mouse clicks and keyboard
activity to prevent Colab's browser idle-detection from disconnecting
the runtime. Complements the network-level keep-alive curl loop.
"""
from IPython.display import Javascript, display

JS_CODE = """
(function() {
    var clicks = 0;

    function simulateActivity() {
        // Simulate a mouse click on the page body
        try {
            var evt = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            document.body.dispatchEvent(evt);
        } catch (e) {}

        // Simulate a harmless keypress (Space) to trigger keyboard activity
        try {
            var ke = new KeyboardEvent('keydown', {
                key: ' ',
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(ke);
        } catch (e) {}

        // Try to click the "Connect" button (selectors vary by Colab version)
        try {
            var btn = document.querySelector('colab-connect-button') ||
                      document.querySelector('[aria-label*="Connect"]') ||
                      document.querySelector('[aria-label*="connect"]');
            if (btn) btn.click();
        } catch (e) {}

        clicks++;
        if (clicks % 10 === 0) {
            console.log('[keepalive] simulated activity: ' + clicks + ' cycles');
        }
    }

    // Run immediately, then every 60 seconds
    simulateActivity();
    setInterval(simulateActivity, 60000);
})();
"""

display(Javascript(JS_CODE))
print("[keep-alive] Browser-level keep-alive injected. Simulating mouse+keyboard activity every 60s.")
print("[keep-alive] Keep this cell's output visible. If the runtime disconnects, re-run this cell.")
JSKEEP
    log "Browser keep-alive script generated: scripts/colab_keepalive_js.py"

# ── Start Celery Worker ───────────────────────────────────────────────────
step "Starting Celery Worker..."
kill_by_pid_file "$PID_DIR/worker.pid"
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
    $PYTHON_BIN -m celery -A app.workers.celery_app worker \
        $CELERY_BROKER_ARG \
        $CELERY_BACKEND_ARG \
        --loglevel=info \
        --concurrency=1 \
        -B \
        -Q generation,images \
        > "$LOG_DIR/worker.log" 2>&1 &
    write_pid "$PID_DIR/worker.pid" $!
)
log "Celery Worker started (PID: $(cat $PID_DIR/worker.pid))"

# ── Start Frontend ───────────────────────────────────────────────────────
step "Starting Frontend (http://localhost:3000)..."

if [[ ! -d node_modules ]]; then
    info "Installing npm dependencies..."
    npm ci --prefer-offline --no-audit 2>&1 | grep -E '(added|up to date)' || true
fi

if [[ ! -d .next ]]; then
    info "Building Next.js..."
    npm run build 2>&1 | tail -5
fi

kill_by_pid_file "$PID_DIR/frontend.pid"
NEXT_PUBLIC_API_URL=http://localhost:8000 npm start \
    > "$LOG_DIR/frontend.log" 2>&1 &
write_pid "$PID_DIR/frontend.pid" $!

log "Frontend started (PID: $(cat $PID_DIR/frontend.pid))"

# Wait for Frontend to be ready
info "Waiting for Frontend (timeout: 30s)..."
for i in {1..15}; do
    if curl -sf http://localhost:3000 &>/dev/null; then
        log "Frontend is ready"
        break
    fi
    echo -n "."
    sleep 2
done


# ── Post-startup preflight validation (Colab-safe) ─────────────────────────
run_preflight || warn "Preflight validation had issues — see output above"

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
echo -e "  ${BOLD}Colab Keep-Alive:${NC}"
echo -e "    Network loop   : running in background (PID: $(cat "$KEEPALIVE_PID_FILE" 2>/dev/null || echo '?'))"
echo -e "    Browser JS     : run in a cell → ${BOLD}exec(open('scripts/colab_keepalive_js.py').read())${NC}"
echo ""
echo -e "  ${BOLD}Logs:${NC}"
echo -e "    API      ${CYAN}logs/api.log${NC}"
echo -e "    Worker   ${CYAN}logs/worker.log${NC}"
echo -e "    Frontend ${CYAN}logs/frontend.log${NC}"
echo -e "    Keep-Alive ${CYAN}logs/keepalive.log${NC}"
echo ""
echo -e "  ${BOLD}Management:${NC}"
echo -e "    Stop services  : bash scripts/stop.sh"
echo -e "    View status    : bash manager.sh"
echo ""
echo -e "  ${YELLOW}Note:${NC} A two-layer keep-alive is active to prevent idle disconnections:
    network pings every 45s + browser JS simulating mouse/keyboard activity every 60s.
    If the Colab runtime disconnects, re-run: ${GREEN}bash scripts/colab.sh${NC}"
echo ""
