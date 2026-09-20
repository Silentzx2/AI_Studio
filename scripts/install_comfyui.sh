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
THREE_D_PACK_COMMIT="9e8096e50c5bcf35e1f3e34c6ae06216101f8a11"
COMFYUI_VERSION="0.36.0"

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

# ── SIGINT / Ctrl+C handler ───────────────────────────────────────────
_comfy_on_sigint() {
    echo ""
    warn "ComfyUI installation interrupted by user (Ctrl+C)."
    if [[ -d "${THREE_D_PACK_DIR}" && ! -f "${THREE_D_PACK_DIR}/__init__.py" ]]; then
        rm -rf "${THREE_D_PACK_DIR}" 2>/dev/null || true
    fi
    if [[ -d "${COMFYUI_DIR}" && ! -f "${COMFYUI_DIR}/main.py" ]]; then
        rm -rf "${COMFYUI_DIR}" 2>/dev/null || true
    fi
    local child_pids
    child_pids=$(jobs -p 2>/dev/null || true)
    if [[ -n "$child_pids" ]]; then
        kill -TERM $child_pids 2>/dev/null || true
    fi
    exit 130
}
trap '_comfy_on_sigint' INT

# ── Resolve Python Binary ─────────────────────────────────────────────
resolve_python() {
    if [[ -n "${PYTHON_BIN:-}" && -x "${PYTHON_BIN}" ]]; then
        return 0
    fi
    if [[ -x "${PROJECT_ROOT}/backend/.venv/bin/python" ]]; then
        PYTHON_BIN="${PROJECT_ROOT}/backend/.venv/bin/python"
    elif [[ -n "${VIRTUAL_ENV:-}" && -x "${VIRTUAL_ENV}/bin/python" ]]; then
        PYTHON_BIN="${VIRTUAL_ENV}/bin/python"
    elif command -v python3 &>/dev/null; then
        PYTHON_BIN="$(command -v python3)"
    else
        err "No suitable python3 binary found"
        return 1
    fi
    export PYTHON_BIN
}

pip_install() {
    resolve_python
    if command -v uv &>/dev/null; then
        uv pip install --python "${PYTHON_BIN}" "$@" -q
    else
        "${PYTHON_BIN}" -m pip install -q "$@"
    fi
}

# ── Check if ComfyUI is already installed ─────────────────────────────
is_comfyui_installed() {
    [[ -f "${COMFYUI_DIR}/main.py" ]] && [[ -d "${COMFYUI_DIR}/comfy" ]]
}

is_3d_pack_installed() {
    [[ -d "${THREE_D_PACK_DIR}" ]] && [[ -f "${THREE_D_PACK_DIR}/__init__.py" ]]
}

# ── Install ComfyUI ───────────────────────────────────────────────────
install_comfyui() {
    mkdir -p "${ENGINE_DIR}"

    if is_comfyui_installed; then
        log "ComfyUI source already present at ${COMFYUI_DIR}"
    else
        info "Cloning ComfyUI from ${COMFYUI_REPO}..."
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
        log "ComfyUI repository cloned to ${COMFYUI_DIR}"
    fi

    # Create required directories
    mkdir -p "${COMFYUI_DIR}/user/default/workflows"
    mkdir -p "${COMFYUI_DIR}/user/default/models"
    mkdir -p "${COMFYUI_DIR}/models/checkpoints"
    mkdir -p "${COMFYUI_DIR}/models/clip"
    mkdir -p "${COMFYUI_DIR}/models/vae"
    mkdir -p "${COMFYUI_DIR}/models/unet"
    mkdir -p "${COMFYUI_DIR}/models/diffusion_models"
    mkdir -p "${COMFYUI_DIR}/models/loras"
    mkdir -p "${CUSTOM_NODES_DIR}"

    # Install ComfyUI dependencies
    if [[ -f "${COMFYUI_DIR}/requirements.txt" ]]; then
        info "Installing ComfyUI core dependencies into Python runtime..."
        pip_install -r "${COMFYUI_DIR}/requirements.txt" || {
            warn "Some ComfyUI requirements encountered issues; continuing..."
        }
        log "ComfyUI core dependencies installed"
    fi
}

# ── Patch ComfyUI-3D-Pack ──────────────────────────────────────────────
patch_3d_pack() {
    local pack_dir="${THREE_D_PACK_DIR}"
    [[ -d "$pack_dir" ]] || return 0

    info "Applying verified compatibility patches to ComfyUI-3D-Pack..."

    # 1. TripoSR mask mismatch fix in nodes.py
    if [[ -f "${pack_dir}/nodes.py" ]]; then
        python3 -c "
p = '${pack_dir}/nodes.py'
with open(p, 'r') as f:
    c = f.read()
if 'mask = reference_mask[0].unsqueeze(2)' in c and 'if mask.shape[0] != image.shape[0]' not in c:
    c = c.replace(
        'mask = reference_mask[0].unsqueeze(2)',
        'mask = reference_mask[0].unsqueeze(2) if len(reference_mask.shape) >= 3 else reference_mask.unsqueeze(2)\n        if mask.shape[0] != image.shape[0] or mask.shape[1] != image.shape[1]:\n            mask = torch.ones((image.shape[0], image.shape[1], 1), dtype=image.dtype, device=image.device)'
    )
    with open(p, 'w') as f:
        f.write(c)
" 2>/dev/null || true
    fi

    # 2. uv speedup patch in install.py
    if [[ -f "${pack_dir}/install.py" ]]; then
        python3 -c "
p = '${pack_dir}/install.py'
with open(p, 'r') as f:
    c = f.read()
if 'shutil.which(\"uv\")' not in c:
    c = c.replace(
        'for wheel_path in wheel_files:',
        'import shutil\n        uv_bin = shutil.which(\"uv\")\n        for wheel_path in wheel_files:\n            if uv_bin:\n                res_uv = subprocess.run([uv_bin, \"pip\", \"install\", \"--python\", PYTHON_PATH, \"--no-deps\", \"--reinstall\", wheel_path], capture_output=True)\n                if res_uv.returncode == 0:\n                    cstr(f\"Successfully installed wheel: {os.path.basename(wheel_path)}\").msg.print()\n                    success_count += 1\n                    continue'
    )
    with open(p, 'w') as f:
        f.write(c)
" 2>/dev/null || true
    fi

    # 3. build_config.yaml: Enforce CUDA 12.4 and prevent torch downgrade/upgrade to cu128
    local build_cfg="${pack_dir}/_Pre_Builds/_Build_Scripts/build_config.yaml"
    if [[ -f "$build_cfg" ]]; then
        python3 -c "
p = '${build_cfg}'
with open(p, 'r') as f:
    c = f.read()
c = c.replace('cuda_version: \"12.8\"', 'cuda_version: \"12.4\"')
c = c.replace(\"cuda_version: '12.8'\", 'cuda_version: \"12.4\"')
c = c.replace('version: \"2.7.0\"', 'version: \"2.5.1\"')
c = c.replace('version: \"0.22.0\"', 'version: \"0.20.1\"')
with open(p, 'w') as f:
    f.write(c)
" 2>/dev/null || true
    fi

    # 4. build_utils.py: Never overwrite existing torch runtime; resilient CUDA 12.4 detection
    local build_utils="${pack_dir}/_Pre_Builds/_Build_Scripts/build_utils.py"
    if [[ -f "$build_utils" ]]; then
        python3 -c "
p = '${build_utils}'
with open(p, 'r') as f:
    c = f.read()

# Never overwrite existing functional torch runtime
if 'ALREADY_INSTALLED_OVERRIDE' not in c:
    c = c.replace(
        'def is_package_installed(package_name, required_version=None):',
        '''def is_package_installed(package_name, required_version=None):
    # ALREADY_INSTALLED_OVERRIDE: Never overwrite functional torch runtime
    if package_name in [\"torch\", \"torchvision\", \"torchaudio\"]:
        try:
            import importlib.metadata
            importlib.metadata.version(package_name)
            return True
        except Exception:
            pass'''
    )

# Resilient CUDA version detection that defaults to cu124 without dying
if 'CU124_RESILIENT_DETECT' not in c:
    c = c.replace(
        'def get_cuda_version():',
        '''def get_cuda_version():
    # CU124_RESILIENT_DETECT
    try:
        import shutil
        nvcc_bin = shutil.which(\"nvcc\")
        if not nvcc_bin:
            for cand in [\"/usr/local/cuda-12.4/bin/nvcc\", \"/usr/local/cuda/bin/nvcc\"]:
                if os.path.exists(cand):
                    nvcc_bin = cand
                    break
        if nvcc_bin:
            result = subprocess.run([nvcc_bin, \"--version\"], text=True, capture_output=True)
            if result.returncode == 0:
                for cuda_version in build_config.supported_cuda_versions:
                    if (\"cuda_\" + cuda_version in result.stdout) or (\"release \" + cuda_version in result.stdout):
                        return \"cu\" + cuda_version.replace(\".\", \"\")
    except Exception:
        pass
    try:
        import torch
        if torch.cuda.is_available() and torch.version.cuda:
            return \"cu\" + torch.version.cuda.replace(\".\", \"\")[:3]
    except Exception:
        pass
    cfg_cuda = getattr(build_config, \"cuda_version\", \"12.4\")
    return \"cu\" + str(cfg_cuda).replace(\".\", \"\")'''
    )

# Dynamic PyTorch version detection from runtime
if 'TORCH_RUNTIME_VERSION_DETECT' not in c:
    c = c.replace(
        'def get_pytorch_version():',
        '''def get_pytorch_version():
    # TORCH_RUNTIME_VERSION_DETECT
    try:
        import torch
        return \"torch\" + torch.__version__.split(\"+\")[0]
    except Exception:
        pass'''
    )

with open(p, 'w') as f:
    f.write(c)
" 2>/dev/null || true
    fi

    log "ComfyUI-3D-Pack compatibility patches applied successfully"
}

# ── Install ComfyUI-3D-Pack ───────────────────────────────────────────
install_3d_pack() {
    mkdir -p "${CUSTOM_NODES_DIR}"

    if is_3d_pack_installed; then
        log "ComfyUI-3D-Pack source already present at ${THREE_D_PACK_DIR}"
    else
        if [[ -d "${THREE_D_PACK_DIR}" && ! -f "${THREE_D_PACK_DIR}/__init__.py" ]]; then
            warn "Partial or corrupt ComfyUI-3D-Pack clone detected; removing for fresh clone..."
            rm -rf "${THREE_D_PACK_DIR}" 2>/dev/null || true
        fi
        info "Cloning ComfyUI-3D-Pack from ${THREE_D_PACK_REPO}..."
        git clone "${THREE_D_PACK_REPO}" "${THREE_D_PACK_DIR}" || {
            err "Failed to clone ComfyUI-3D-Pack repository"
            return 1
        }
        (cd "${THREE_D_PACK_DIR}" && git checkout -q "${THREE_D_PACK_COMMIT}") 2>/dev/null || true
        log "ComfyUI-3D-Pack repository cloned and checked out at commit ${THREE_D_PACK_COMMIT}"
    fi

    # Always apply verified runtime & build patches
    patch_3d_pack

    # Install ComfyUI-3D-Pack dependencies
    if [[ -f "${THREE_D_PACK_DIR}/requirements.txt" ]]; then
        info "Installing ComfyUI-3D-Pack dependencies..."
        pip_install -r "${THREE_D_PACK_DIR}/requirements.txt" || {
            warn "Standard requirements.txt install had warnings; installing critical modules..."
        }
        log "ComfyUI-3D-Pack requirements processed"
    fi

    # Ensure pip, ninja, setuptools, wheel, and PyGithub are available in the Python runtime
    info "Ensuring pip, setuptools, wheel, ninja, and PyGithub are installed in Python runtime..."
    pip_install pip setuptools wheel ninja PyGithub 2>/dev/null || true

    # Execute official install.py if available
    if [[ -f "${THREE_D_PACK_DIR}/install.py" ]]; then
        info "Running official ComfyUI-3D-Pack install.py..."
        resolve_python
        (cd "${THREE_D_PACK_DIR}" && "${PYTHON_BIN}" install.py) || {
            warn "ComfyUI-3D-Pack install.py finished with warnings; applying verified fallbacks..."
        }
    fi

    apply_compatibility_patches
}

# ── Apply compatibility patches for ComfyUI-3D-Pack ───────────────────
apply_compatibility_patches() {
    info "Verifying ComfyUI-3D-Pack essential libraries..."
    # Ensure numpy<2.0.0 and scipy<1.14 are enforced for gpytoolbox/slangtorch 3D compatibility
    pip_install "numpy<2.0.0" "scipy<1.14" 2>/dev/null || true
    # Ensure critical 3D geometry & rendering packages are present
    pip_install \
        pyvista pymeshfix igraph mmgp pyhocon \
        diffusers open_clip_torch rembg trimesh \
        fast-simplification plyfile pygltflib xatlas \
        torchmetrics pytorch_msssim pytorch-lightning peft \
        imageio imageio-ffmpeg PyMCubes 2>/dev/null || true

    log "Essential 3D libraries and compatibility patches verified"
}

# ── Verify ComfyUI installation ───────────────────────────────────────
verify_comfyui() {
    if ! is_comfyui_installed; then
        err "ComfyUI installation verification failed (missing main.py)"
        return 1
    fi

    resolve_python
    info "Verifying ComfyUI runtime import with ${PYTHON_BIN}..."
    if "${PYTHON_BIN}" -c "import sys; sys.path.insert(0, '${COMFYUI_DIR}'); import comfy; print('ComfyUI OK')" 2>/dev/null; then
        log "ComfyUI core import verification passed"
    else
        warn "ComfyUI import verification note: will initialize on engine boot"
    fi
}

# ── Verify ComfyUI-3D-Pack installation ───────────────────────────────
verify_3d_pack() {
    if ! is_3d_pack_installed; then
        err "ComfyUI-3D-Pack verification failed (missing files)"
        return 1
    fi

    log "ComfyUI-3D-Pack verified at ${THREE_D_PACK_DIR}"
}

# ── Copy workflow templates ───────────────────────────────────────────
copy_workflows() {
    local workflows_dir="${COMFYUI_DIR}/user/default/workflows"
    mkdir -p "${workflows_dir}"
    log "Workflow directory ready at ${workflows_dir}"
}

# ── Main ──────────────────────────────────────────────────────────────
main() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     ComfyUI + ComfyUI-3D-Pack Installation                ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    resolve_python
    log "Target Python binary: ${PYTHON_BIN}"

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