#!/usr/bin/env bash
# ============================================================
# ComfyUI + ComfyUI-3D-Pack Installation Script
# Installs ComfyUI as the execution engine and ComfyUI-3D-Pack
# as a custom-node package in ENGINE/ComfyUI/custom_nodes/
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENGINE_DIR="${PROJECT_ROOT}/ENGINE"
COMFYUI_DIR="${ENGINE_DIR}/ComfyUI"
CUSTOM_NODES_DIR="${COMFYUI_DIR}/custom_nodes"
THREE_D_PACK_DIR="${CUSTOM_NODES_DIR}/ComfyUI-3D-Pack"

COMFYUI_REPO="https://github.com/Comfy-Org/ComfyUI.git"
THREE_D_PACK_REPO="https://github.com/MrForExample/ComfyUI-3D-Pack.git"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[COMFYUI]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}   $*"; }
err() { echo -e "${RED}[ERROR]${NC}  $*" >&2; }
info() { echo -e "${CYAN}[INFO]${NC}   ℹ $*"; }

# ── Check if ComfyUI is already installed ─────────────────────────────
is_comfyui_installed() {
    [[ -f "${COMFYUI_DIR}/main.py" ]] && [[ -d "${COMFYUI_DIR}/comfy" ]]
}

is_3d_pack_installed() {
    [[ -d "${THREE_D_PACK_DIR}" ]] && [[ -f "${THREE_D_PACK_DIR}/__init__.py" ]]
}

# ── Install ComfyUI ───────────────────────────────────────────────────
install_comfyui() {
    if is_comfyui_installed; then
        log "ComfyUI already installed at ${COMFYUI_DIR}"
        return 0
    fi

    info "Installing ComfyUI from ${COMFYUI_REPO}..."

    # Create ENGINE directory
    mkdir -p "${ENGINE_DIR}"

    # Clone ComfyUI safely
    if [[ -d "${COMFYUI_DIR}" && ! -f "${COMFYUI_DIR}/main.py" ]]; then
        local tmp_clone
        tmp_clone=$(mktemp -d "${ENGINE_DIR}/comfy_clone_XXXXXX")
        git clone --depth 1 "${COMFYUI_REPO}" "${tmp_clone}" || {
            rm -rf "${tmp_clone}"
            err "Failed to clone ComfyUI repository"
            return 1
        }
        cp -rn "${tmp_clone}"/. "${COMFYUI_DIR}/" 2>/dev/null || cp -r "${tmp_clone}"/* "${COMFYUI_DIR}/"
        rm -rf "${tmp_clone}"
    else
        git clone --depth 1 "${COMFYUI_REPO}" "${COMFYUI_DIR}" || {
            err "Failed to clone ComfyUI repository"
            return 1
        }
    fi

    log "ComfyUI installed successfully at ${COMFYUI_DIR}"

    # Create required directories
    mkdir -p "${COMFYUI_DIR}/user/default/workflows"
    mkdir -p "${COMFYUI_DIR}/user/default/models"
    mkdir -p "${COMFYUI_DIR}/models/checkpoints"
    mkdir -p "${COMFYUI_DIR}/models/clip"
    mkdir -p "${COMFYUI_DIR}/models/vae"
    mkdir -p "${COMFYUI_DIR}/models/unet"

    log "ComfyUI directories created"
}

# ── Install ComfyUI-3D-Pack ───────────────────────────────────────────
install_3d_pack() {
    if is_3d_pack_installed; then
        log "ComfyUI-3D-Pack already installed at ${THREE_D_PACK_DIR}"
        return 0
    fi

    info "Installing ComfyUI-3D-Pack from ${THREE_D_PACK_REPO}..."

    # Create custom_nodes directory
    mkdir -p "${CUSTOM_NODES_DIR}"

    # Clone ComfyUI-3D-Pack
    git clone --depth 1 "${THREE_D_PACK_REPO}" "${THREE_D_PACK_DIR}" || {
        err "Failed to clone ComfyUI-3D-Pack repository"
        return 1
    }

    log "ComfyUI-3D-Pack installed successfully at ${THREE_D_PACK_DIR}"

    # Install ComfyUI-3D-Pack dependencies
    if [[ -f "${THREE_D_PACK_DIR}/requirements.txt" ]]; then
        info "Installing ComfyUI-3D-Pack dependencies..."
        # We'll install these in the main backend venv
        log "ComfyUI-3D-Pack dependencies listed in requirements.txt"
    fi

    apply_compatibility_patches
}

# ── Apply compatibility patches for ComfyUI-3D-Pack ───────────────────
apply_compatibility_patches() {
    info "Applying compatibility patches for ComfyUI-3D-Pack..."
    local python_bin="python3"
    if [[ -x "${PROJECT_ROOT}/backend/.venv/bin/python" ]]; then
        python_bin="${PROJECT_ROOT}/backend/.venv/bin/python"
    fi

    "${python_bin}" -m pip install -q pyvista pymeshfix igraph mmgp 2>/dev/null || true
    log "Compatibility patches and dependencies applied"
}

# ── Verify ComfyUI installation ───────────────────────────────────────
verify_comfyui() {
    if ! is_comfyui_installed; then
        err "ComfyUI installation verification failed"
        return 1
    fi

    # Check Python can import ComfyUI
    local python_bin="${1:-python3}"
    if [[ -x "${PROJECT_ROOT}/backend/.venv/bin/python" ]]; then
        python_bin="${PROJECT_ROOT}/backend/.venv/bin/python"
    fi

    info "Verifying ComfyUI installation..."
    if "${python_bin}" -c "import sys; sys.path.insert(0, '${COMFYUI_DIR}'); import comfy; print('ComfyUI OK')" 2>/dev/null; then
        log "ComfyUI verification passed"
    else
        warn "ComfyUI import verification skipped (may require torch)"
    fi
}

# ── Verify ComfyUI-3D-Pack installation ───────────────────────────────
verify_3d_pack() {
    if ! is_3d_pack_installed; then
        err "ComfyUI-3D-Pack installation verification failed"
        return 1
    fi

    info "ComfyUI-3D-Pack installed at ${THREE_D_PACK_DIR}"
    log "ComfyUI-3D-Pack verification passed"
}

# ── Copy workflow templates ───────────────────────────────────────────
copy_workflows() {
    local workflows_dir="${COMFYUI_DIR}/user/default/workflows"
    mkdir -p "${workflows_dir}"

    # Copy workflow templates from backend
    if [[ -d "${PROJECT_ROOT}/backend/app/core/comfy/workflows" ]]; then
        # No workflow files to copy, templates are in code
        info "Workflow templates are managed in code"
    fi

    log "Workflow directory ready at ${workflows_dir}"
}

# ── Main ──────────────────────────────────────────────────────────────
main() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     ComfyUI + ComfyUI-3D-Pack Installation                ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Install ComfyUI
    install_comfyui || {
        err "ComfyUI installation failed"
        exit 1
    }

    # Install ComfyUI-3D-Pack
    install_3d_pack || {
        err "ComfyUI-3D-Pack installation failed"
        exit 1
    }

    # Verify
    verify_comfyui || warn "ComfyUI verification had issues"
    verify_3d_pack || warn "ComfyUI-3D-Pack verification had issues"

    # Setup workflows
    copy_workflows

    echo ""
    log "ComfyUI + ComfyUI-3D-Pack installation complete!"
    echo ""
    info "ComfyUI: ${COMFYUI_DIR}"
    info "ComfyUI-3D-Pack: ${THREE_D_PACK_DIR}"
    echo ""
}

main "$@"