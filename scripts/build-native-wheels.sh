#!/usr/bin/env bash
# AI 3D Studio - Native CUDA Wheels Builder v2
# Enforces CUDA 12.4 for consistent builds across VPS/Colab/local
# Usage: bash scripts/build-native-wheels.sh [--upload]
# When run on Colab/GPU host: builds CUDA 12.4 wheels
# When run on CPU-only: sets up environment, skips actual CUDA builds gracefully

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_ROOT="$(cd "${PROJECT_ROOT}/../" && pwd)"

cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log() { echo -e "${GREEN}[WHEELS]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}   $*"; }
err() { echo -e "${RED}[ERROR]${NC}  $*" >&2; }
step() { echo -e "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n  ${BOLD}➜ $*${NC}\n"; }

# === Detect Environment ===
detect_env() {
    if [[ -n "${CODESPACES:-}" || -n "${GITHUB_CODESPACE_NAME:-}" ]]; then
        echo "codespaces"
    elif command -v nvidia-smi &>/dev/null; then
        local count
        count=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | wc -l)
        if [[ "$count" -gt 0 ]]; then
            echo "gpu"
        else
            echo "cpu"
        fi
    elif [[ -n "${NB_SESSION_ID:-}" || -n "${JUPYTER_BASE_URL:-}" || -d "/home/jovyan" ]]; then
        echo "colab"
    else
        echo "local"
    fi
}

ENV_TYPE=$(detect_env)
log "Detected environment: $ENV_TYPE"

# === CUDA 12.4 Enforcement ===
ensure_cuda_124() {
    step "Ensuring CUDA 12.4 toolkit is available"

    # Check for nvcc
    if ! command -v nvcc &>/dev/null; then
        log "nvcc not found — attempting CUDA 12.4 installation..."

        # On Colab or GPU hosts, we may need to install CUDA
        if [[ "$ENV_TYPE" == "colab" || "$ENV_TYPE" == "gpu" ]]; then
            # Install CUDA 12.4 toolkit (driver may already be present)
            if ! apt-get install -y -q cuda-toolkit-12-4 2>&1 | tail -1 | grep -q "E:"; then
                log "CUDA 12.4 toolkit installed successfully"
            else
                warn "CUDA 12.4 toolkit installation may have issues — proceeding anyway"
            fi
        else
            warn "No CUDA toolkit found and not a GPU environment — will build with CPU-compatible wheels"
            # On CPU-only, we skip actual CUDA extension builds
            return 1
        fi
    fi

    # Set CUDA environment paths (prefer /usr/local/cuda-12.4)
    if [[ -d /usr/local/cuda-12.4 ]]; then
        # Ensure symlink points to CUDA 12.4
        if [[ -L /usr/local/cuda ]]; then
            rm -f /usr/local/cuda
        fi
        ln -sf /usr/local/cuda-12.4 /usr/local/cuda
        log "/usr/local/cuda → /usr/local/cuda-12.4"
        export CUDA_HOME="/usr/local/cuda-12.4"
        export PATH="/usr/local/cuda-12.4/bin:/usr/local/cuda/bin:${PATH:-}"
        export LD_LIBRARY_PATH="/usr/local/cuda-12.4/lib64:/usr/local/cuda/lib64:${LD_LIBRARY_PATH:-}"
    elif [[ -d /usr/local/cuda ]]; then
        log "/usr/local/cuda exists"
        export CUDA_HOME="/usr/local/cuda"
        export PATH="/usr/local/cuda/bin:${PATH:-}"
        export LD_LIBRARY_PATH="/usr/local/cuda/lib64:${LD_LIBRARY_PATH:-}"
    fi

    # Verify CUDA 12.4 is the active version
    if command -v nvcc &>/dev/null; then
        CUDA_VERSION=$(nvcc --version 2>/dev/null | grep "release" | sed 's/.*release //' | sed 's/,.*//' | head -1)
        if [[ -n "$CUDA_VERSION" ]]; then
            CUDA_MINOR=$(echo "$CUDA_VERSION" | awk -F. '{print $1$2}')
            if [[ "$CUDA_MINOR" != "124" ]]; then
                err "CUDA version ${CUDA_VERSION} detected — CUDA 12.4 is required"
                err "Please ensure CUDA 12.4 is installed: https://developer.nvidia.com/cuda-downloads"
                exit 1
            fi
            log "CUDA 12.4 verified: ${CUDA_VERSION}"
        fi
    else
        warn "nvcc not found after CUDA setup — some CUDA extensions may fail"
        warn "This is OK on CPU-only hosts; on GPU hosts ensure CUDA toolkit is installed"
    fi
}

# === Python Environment Setup ===
ensure_python_env() {
    step "Setting up Python environment"

    # Check for Python version required by manifests (3.10+)
    local py_version=$(python3 -c "import sys; print('.'.join(map(str, sys.version_info[:2])))")
    log "Using Python: $py_version"

    # Ensure uv is available (required for per-model venvs)
    if ! command -v uv &>/dev/null; then
        log "Installing uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
    fi
}

# === Build Wheels ===
build_native_wheels() {
    step "Building native CUDA wheels (CUDA 12.4)"

    WHEELS_DIR="${WORKSPACE_ROOT}/.wheels"
    mkdir -p "$WHEELS_DIR"

    # Use the existing Python wheel builder script
    log "Running scripts/build_native_wheels.py with CUDA 12.4"

    # Determine Python version string
    local py_ver=$(python3 -c "import sys; print('.'.join(map(str, sys.version_info[:2])))")

    # Set environment for CUDA building
    export CUDA_HOME="/usr/local/cuda"
    export PATH="/usr/local/cuda/bin:$PATH"
    export LD_LIBRARY_PATH="/usr/local/cuda/lib64:${LD_LIBRARY_PATH:-}"
    export CXX="${CXX:-g++}"

    # Run the wheel builder, tee output to log file
    log "Starting wheel build for CUDA 12.4..."

    # Run the Python script
    python3 scripts/build_native_wheels.py \
        --output-dir "$WHEELS_DIR" \
        --python "$py_ver" \
        --cuda 12.4 \
        2>&1 | tee "$PROJECT_ROOT/wheel_build.log"

    BUILD_EXIT=${PIPESTATUS[0]}

    if [[ $BUILD_EXIT -ne 0 ]]; then
        err "Wheel build failed (exit code: $BUILD_EXIT)"
        err "Check $PROJECT_ROOT/wheel_build.log for full output"
        exit 1
    fi

    # Verify wheels were built. Release/CI callers can enforce a hard requirement
    # with REQUIRE_WHEELS=1; CPU-only development may intentionally leave this empty.
    WHEEL_COUNT=$(find "$WHEELS_DIR" -name "*.whl" 2>/dev/null | wc -l)
    if [[ $WHEEL_COUNT -gt 0 ]]; then
        log "Successfully built $WHEEL_COUNT wheel(s) for CUDA 12.4"
        echo ""
        echo -e "  ${CYAN}Wheels directory:${NC} ${BOLD}$WHEELS_DIR${NC}"
        find "$WHEELS_DIR" -name "*.whl" -exec echo "    - {}${NC}" \;
    else
        if [[ "${REQUIRE_WHEELS:-0}" == "1" ]]; then
            err "No native wheels were produced but REQUIRE_WHEELS=1"
            exit 1
        fi
        log "No .whl files built; this is allowed only for explicit CPU-only development."
    fi
}

# === Upload to GitHub ===
upload_wheels_to_github() {
    step "Uploading wheels to GitHub Releases"

    # Check if we're in a git repository
    if [[ ! -d ".git" ]]; then
        warn "Not in a git repository — skipping upload"
        return 0
    fi

    # Get the latest tag or generate one
    LATEST_TAG=$(git tag -l --sort=-v:refname | head -1 2>/dev/null || echo "")
    if [[ -z "$LATEST_TAG" ]]; then
        LATEST_TAG="wheels-12.4-$(python3 -c "import sys; print('.'.join(map(str, sys.version_info[:2])))")"
    fi

    # Create a release tag for wheels
    WHEEL_TAG="${LATEST_TAG}-wheels"

    log "Upload tag: $WHEEL_TAG"

    # Check if release already exists
    if git rev-parse "$WHEEL_TAG" &>/dev/null 2>&1; then
        warn "Release $WHEEL_TAG already exists"
        read -rp "Overwrite? [y/N] " OVERWRITE
        if [[ "${OVERWRITE,,}" != "y" ]]; then
            warn "Skipping upload"
            return 0
        fi
    fi

    # Create the tag
    git tag -a "$WHEEL_TAG" -m "Release native CUDA wheels for CUDA 12.4"
    git push origin "$WHEEL_TAG" 2>/dev/null || {
        warn "Could not push tag to origin (may be offline or no remote set up)"
    }

    # Try to upload using gh CLI if available
    if command -v gh &>/dev/null; then
        log "Uploading wheels using GitHub CLI..."

        # Get the actual wheel files
        WHEEL_FILES=("$WHEELS_DIR"/*.whl)
        if [[ ${#WHEEL_FILES[@]} -eq 0 ]]; then
            warn "No wheel files found for upload"
        else
            for WHEEL in "${WHEEL_FILES[@]}"; do
                log "Uploading $(basename "$WHEEL")..."
                gh release upload "$WHEEL_TAG" "$WHEEL" --clobber 2>/dev/null || {
                    err "Failed to upload $(basename "$WHEEL")"
                }
            done
        fi
    else
        warn "GitHub CLI (gh) not installed — wheels not uploaded automatically"
        warn "Install with: curl -fsSL https://cli.github.com/install.sh | sh"
        warn "Then run: gh auth login"
        warn "Manual upload: gh release upload $WHEEL_TAG \"$(ls $WHEELS_DIR/*.whl | tr '\n' ' ')\""
    fi
}

# === Main ===
main() {
    step "Starting Native Wheels Build (CUDA 12.4 enforced)"

    # Detect environment
    log "Environment: $ENV_TYPE"

    # Ensure CUDA 12.4 is set up (may fail on CPU-only, which is OK)
    ensure_cuda_124 || {
        warn "CUDA 12.4 setup had issues — proceeding with available environment"
        # On CPU, we'll still attempt the build but expect limited success
    }

    # Set up Python environment
    ensure_python_env

    # Build the wheels (will work on GPU hosts, gracefully handle CPU-only)
    build_native_wheels

    # Upload to GitHub if requested and wheels exist
    if [[ "${UPLOAD:-}" == "1" ]] && [[ $(find "$WORKSPACE_ROOT/.wheels" -name "*.whl" 2>/dev/null | wc -l) -gt 0 ]]; then
        upload_wheels_to_github
    elif [[ "${UPLOAD:-}" == "1" ]]; then
        warn "No wheels found to upload — skipping GitHub upload"
        warn "Run without --upload flag or build wheels on a GPU host first"
    fi

    step "Wheels build process completed"
    echo ""
    echo -e "  ${GREEN}Next steps:${NC}"
    echo "    - On GPU host (Colab/VPS): wheels built above can be installed into per-model venvs"
    echo "    - Update manifest 'wheels' sections with built wheel URLs from .wheels/ directory"
    echo "    - Re-run installer to pick up prebuilt wheels"
    echo "    - On CPU-only: wheels directory is pre-configured; build on GPU host for actual CUDA support"
    echo ""
    echo -e "  ${CYAN}Wheels directory:${NC} ${BOLD}$WORKSPACE_ROOT/.wheels${NC}"
    find "$WORKSPACE_ROOT/.wheels" -name "*.whl" 2>/dev/null | head -5 | while read w; do
        echo "    - $(basename "$w")"
    done
}

# Run main function
main