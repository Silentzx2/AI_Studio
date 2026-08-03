#!/usr/bin/env bash
# verify-runtime.sh — Comprehensive runtime verification with PASS/FAIL output
#
# Usage: ./scripts/verify-runtime.sh [--json] [--quiet]
#
set -euo pipefail
cd "$(dirname "$0")/.."

# Detect if running inside a Docker container
IS_DOCKER=false
if [ -f /.dockerenv ]; then
    IS_DOCKER=true
fi

# Set backend root based on environment
if [ "$IS_DOCKER" = true ]; then
    BACKEND_DIR="/app"
else
    BACKEND_DIR="$(pwd)/backend"
fi

PASS=0
FAIL=0
WARN=0
QUIET=false
JSON_OUTPUT=false

for arg in "$@"; do
    case "$arg" in
        --quiet|-q) QUIET=true ;;
        --json|-j) JSON_OUTPUT=true ;;
    esac
done

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'

ok()   { ((PASS++)) || true; $QUIET || printf "  ${GREEN}OK${NC}   %s\n" "$1"; }
warn() { ((WARN++)) || true; $QUIET || printf "  ${YELLOW}WARN${NC} %s\n" "$1"; }
fail() { ((FAIL++)) || true; $QUIET || printf "  ${RED}FAIL${NC} %s\n" "$1"; }

$QUIET || echo "=============================================="
$QUIET || echo "  AI 3D Studio v3.2 — Runtime Verification"
$QUIET || echo "=============================================="
$QUIET || echo ""
$QUIET || echo "  Backend root: $BACKEND_DIR"
$QUIET || echo ""

# ── Python ──────────────────────────────────────────────
$QUIET || echo "--- Python ---"
if python3 --version &>/dev/null; then
    ok "Python: $(python3 --version 2>&1)"
else
    fail "Python 3 not found"
fi

# uv (hard dependency since v3.2)
if uv --version &>/dev/null; then
    ok "uv: $(uv --version 2>&1)"
else
    fail "uv not found — install: curl -LsSf https://astral.sh/uv/install.sh | sh"
fi

# ── Git ─────────────────────────────────────────────────
$QUIET || echo ""
$QUIET || echo "--- Git ---"
if git --version &>/dev/null; then
    ok "Git: $(git --version)"
else
    fail "Git not found"
fi

# ── GPU / CUDA ──────────────────────────────────────────
$QUIET || echo ""
$QUIET || echo "--- GPU / CUDA ---"
if nvidia-smi &>/dev/null; then
    GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -1)
    DRIVER=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1)
    ok "NVIDIA Driver: $DRIVER"
    ok "GPU: $GPU_INFO"
    if python3 -c "import torch" 2>/dev/null; then
        CUDA_AVAIL=$(python3 -c "import torch; print(torch.cuda.is_available())" 2>/dev/null)
        if [ "$CUDA_AVAIL" = "True" ]; then
            CUDA_VER=$(python3 -c "import torch; print(torch.version.cuda)" 2>/dev/null)
            ok "PyTorch CUDA: $CUDA_VER"
        else
            warn "PyTorch installed but CUDA not available — check CUDA_VISIBLE_DEVICES / Docker --gpus flag"
        fi
    else
        warn "PyTorch not installed"
    fi
else
    warn "No NVIDIA GPU detected — CPU mode only"
fi

# ── Blender ─────────────────────────────────────────────
$QUIET || echo ""
$QUIET || echo "--- Blender ---"
BLENDER_PATHS=(
    "${BLENDER_EXECUTABLE:-}"
    "blender"
    "/usr/bin/blender"
    "/usr/local/bin/blender"
    "/opt/blender/blender"
    "/snap/bin/blender"
    "$HOME/blender/blender"
    "$HOME/.local/bin/blender"
)
BLENDER_FOUND=false
for path in "${BLENDER_PATHS[@]}"; do
    [ -z "$path" ] && continue
    if command -v "$path" &>/dev/null || [ -x "$path" ]; then
        BLENDER_VER=$("$path" --version 2>/dev/null | head -1 || echo "unknown")
        ok "Blender: $BLENDER_VER (at $path)"
        BLENDER_FOUND=true
        break
    fi
done
if [ "$BLENDER_FOUND" = false ]; then
    warn "Blender not found — rigging/export will be skipped"
fi

# ── Repositories ────────────────────────────────────────
$QUIET || echo ""
$QUIET || echo "--- Repositories ---"
REPOS=("Hunyuan3D-2" "TRELLIS" "TripoSR")
for repo in "${REPOS[@]}"; do
    REPO_PATH="$BACKEND_DIR/third_party/$repo"
    if [ -d "$REPO_PATH" ]; then
        if [ -d "$REPO_PATH/.git" ]; then
            ok "Repo: $repo (git clone)"
        else
            ok "Repo: $repo (directory present)"
        fi
    else
        fail "Repo missing: $repo → run: ./scripts/update-models.sh --repos-only"
    fi
done

# ── Per-Model Virtual Environments ─────────────────────
$QUIET || echo ""
$QUIET || echo "--- Model Virtual Environments (uv) ---"
for repo in "${REPOS[@]}"; do
    VENV_PYTHON="$BACKEND_DIR/third_party/$repo/.venv/bin/python"
    if [ -x "$VENV_PYTHON" ]; then
        VENV_VER=$("$VENV_PYTHON" --version 2>&1 || echo "unknown")
        ok "Venv: $repo/.venv ($VENV_VER)"
    else
        warn "Venv missing: $repo/.venv → run: ./scripts/update-models.sh"
    fi
done

# ── Weights (check weights_dir AND common HF cache locations) ──
$QUIET || echo ""
$QUIET || echo "--- Model Weights ---"
WEIGHTS=("hunyuan3d-2.1" "hunyuan3d-2" "trellis" "triposr")
WEIGHTS_DIR="${WEIGHTS_DIR:-$BACKEND_DIR/third_party/weights}"

# Build HF cache roots list including Docker paths
HF_CACHE_ROOTS=(
    "${HF_HOME:-}"
    "${HUGGINGFACE_HUB_CACHE:-}"
    "$HOME/.cache/huggingface"
    "/root/.cache/huggingface"
    "/app/third_party/.hf_cache"
    "/app/third_party/.hf_cache/hub"
    "/teamspace/studios/this_studio/.cache/huggingface"
    "/home/zeus/content/.cache/huggingface"
    "/home/zeus/.cache/huggingface"
)

_weight_exists() {
    local key="$1"
    # 1. Check weights_dir
    local w_path="$WEIGHTS_DIR/$key"
    if [ -d "$w_path" ] && [ "$(ls -A "$w_path" 2>/dev/null)" ]; then
        echo "$w_path"; return 0
    fi
    # 2. Check HF hub cache (models--org--repo/snapshots/*)
    for cache_root in "${HF_CACHE_ROOTS[@]}"; do
        [ -z "$cache_root" ] && continue
        local hub_dir
        for hub_dir in "$cache_root/hub" "$cache_root"; do
            [ -d "$hub_dir" ] || continue
            for models_dir in "$hub_dir"/models--*; do
                [ -d "$models_dir" ] || continue
                local snap_root="$models_dir/snapshots"
                if [ -d "$snap_root" ]; then
                    for snap in "$snap_root"/*; do
                        if [ -d "$snap" ] && [ "$(ls -A "$snap" 2>/dev/null)" ]; then
                            echo "$snap"; return 0
                        fi
                    done
                fi
            done
        done
    done
    return 1
}

for weight in "${WEIGHTS[@]}"; do
    if found_path=$(_weight_exists "$weight" 2>/dev/null); then
        SIZE=$(du -sh "$found_path" 2>/dev/null | cut -f1 || echo "?")
        ok "Weights: $weight ($SIZE at $found_path)"
    else
        fail "Weights missing: $weight → run: ./scripts/update-models.sh --weights-only"
    fi
done

# ── Python Packages ─────────────────────────────────────
$QUIET || echo ""
$QUIET || echo "--- Python Packages ---"
PACKAGES=("fastapi" "uvicorn" "celery" "redis" "sqlalchemy" "PIL" "torch" "trimesh" "huggingface_hub")
for pkg in "${PACKAGES[@]}"; do
    IMPORT="${pkg}"
    [ "$pkg" = "PIL" ] && IMPORT="PIL.Image"
    if python3 -c "import $IMPORT" 2>/dev/null; then
        ok "Package: $pkg"
    else
        warn "Package missing: $pkg"
    fi
done

# ── Storage Directories ─────────────────────────────────
$QUIET || echo ""
$QUIET || echo "--- Storage Directories ---"
STORAGE_DIRS=(
    "$BACKEND_DIR/storage"
    "$BACKEND_DIR/third_party"
    "$BACKEND_DIR/.runtime_cache"
)
STORAGE_LABELS=(
    "backend/storage/"
    "backend/third_party/"
    "backend/.runtime_cache/"
)
for i in "${!STORAGE_DIRS[@]}"; do
    dir="${STORAGE_DIRS[$i]}"
    label="${STORAGE_LABELS[$i]}"
    if [ -d "$dir" ]; then
        if [ -w "$dir" ]; then
            ok "Storage: $label (writable)"
        else
            fail "Storage: $label exists but is NOT writable"
        fi
    else
        fail "Storage: $label does not exist"
    fi
done

# ── Disk Space ──────────────────────────────────────────
$QUIET || echo ""
$QUIET || echo "--- Disk Space ---"
if command -v df &>/dev/null; then
    FREE_GB=$(df -BG . 2>/dev/null | awk 'NR==2 {print $4}' | tr -d 'G')
    if [ "${FREE_GB:-0}" -ge 50 ]; then
        ok "Disk: ${FREE_GB}GB free"
    elif [ "${FREE_GB:-0}" -ge 10 ]; then
        warn "Disk: ${FREE_GB}GB free (models need ~75GB total)"
    else
        fail "Disk: ${FREE_GB}GB free — not enough space (need at least 10GB free)"
    fi
fi

# ── Summary ─────────────────────────────────────────────
$QUIET || echo ""
$QUIET || echo "=============================================="
$QUIET || echo "  Summary: $PASS passed, $WARN warnings, $FAIL failed"
$QUIET || echo "=============================================="
$QUIET || echo ""

if [ "$JSON_OUTPUT" = true ]; then
    echo "{\"passed\": $PASS, \"warnings\": $WARN, \"failed\": $FAIL}"
fi

if [ "$FAIL" -gt 0 ]; then
    $QUIET || echo "Run './scripts/update-models.sh' to install missing components."
    exit 1
fi
exit 0
