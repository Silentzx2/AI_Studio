#!/usr/bin/env bash
# update-models.sh — Clone/update repos and download weights
#
# Usage:
#   ./scripts/update-models.sh                        # Full install (all models)
#   ./scripts/update-models.sh --repos-only           # Only clone repos
#   ./scripts/update-models.sh --weights-only         # Only download weights
#   ./scripts/update-models.sh --verify               # Verify after install
#   ./scripts/update-models.sh --model=triposr        # Specific model
#   ./scripts/update-models.sh --models=triposr,trellis  # Multiple models
#
set -euo pipefail
cd "$(dirname "$0")/.."

BACKEND_DIR="$(pwd)/backend"
REPOS_ONLY=false
WEIGHTS_ONLY=false
VERIFY=false
MODELS=()
HF_TOKEN=""

for arg in "$@"; do
    case "$arg" in
        --repos-only)    REPOS_ONLY=true ;;
        --weights-only)  WEIGHTS_ONLY=true ;;
        --verify)        VERIFY=true ;;
        --model=*)       MODELS+=("${arg#*=}") ;;
        --models=*)      IFS=',' read -ra MODELS <<< "${arg#*=}" ;;
        --hf-token=*)    HF_TOKEN="${arg#*=}" ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --repos-only        Only clone/update repositories"
            echo "  --weights-only      Only download model weights"
            echo "  --verify            Run verification after installation"
            echo "  --model=NAME        Download specific model (repeatable)"
            echo "  --models=A,B,C      Download specific models (comma-separated)"
            echo "  --hf-token=TOKEN    HuggingFace token for gated models"
            echo ""
            echo "Available models: hunyuan3d-2.1, hunyuan3d-2, trellis, triposr"
            exit 0
            ;;
    esac
done

echo "=============================================="
echo "  AI 3D Studio — Model Installer"
echo "=============================================="
echo ""

if [ ${#MODELS[@]} -gt 0 ]; then
    echo "Requested models: ${MODELS[*]}"
else
    echo "Requested models: all"
fi
echo ""

cd "$BACKEND_DIR"

# Create necessary directories
mkdir -p third_party/weights
mkdir -p third_party/.hf_cache/hub

# Set HuggingFace cache environment
export HF_HOME="$BACKEND_DIR/third_party/.hf_cache"
export HUGGINGFACE_HUB_CACHE="$HF_HOME/hub"
export TRANSFORMERS_CACHE="$HF_HOME/transformers"
export TORCH_HOME="$HF_HOME/torch"

echo "Storage configuration:"
echo "  Repos: $BACKEND_DIR/third_party/"
echo "  Weights: $BACKEND_DIR/third_party/weights/"
echo "  HF Cache: $HF_HOME"
echo ""
echo "Using weights directory: $BACKEND_DIR/third_party/weights"
echo ""

# Export env-vars for the embedded Python script
export INSTALL_REPOS_ONLY=$REPOS_ONLY
export INSTALL_WEIGHTS_ONLY=$WEIGHTS_ONLY
export INSTALL_VERIFY=$VERIFY
export INSTALL_MODELS="${MODELS[*]:-}"
export HF_TOKEN="$HF_TOKEN"

python3 << 'PYTHON_SCRIPT'
import sys
import os

repos_only    = os.environ.get('INSTALL_REPOS_ONLY',  'false').lower() == 'true'
weights_only  = os.environ.get('INSTALL_WEIGHTS_ONLY','false').lower() == 'true'
verify        = os.environ.get('INSTALL_VERIFY',      'false').lower() == 'true'
models_str    = os.environ.get('INSTALL_MODELS', '')
models        = [m.strip() for m in models_str.split() if m.strip()]
hf_token      = os.environ.get('HF_TOKEN', '') or None

try:
    from runtime.installer import RuntimeInstaller
    from runtime.storage import get_storage_config

    storage = get_storage_config()

    installer = RuntimeInstaller(
        progress_cb=lambda msg: print(f"  {msg}"),
        hf_token=hf_token,
    )

    # Ensure storage dirs exist
    installer.create_folders()

    if repos_only:
        print("\n--- Cloning Repositories ---")
        installer.clone_repos_for_models(models if models else None)
        installer.install_repo_deps_for_models(models if models else None)
        print("\n[OK] Repositories ready.")

    elif weights_only:
        print("\n--- Downloading Model Weights ---")
        installer.download_weights(models if models else None)
        installer.register_providers()
        print("\n[OK] Weights ready.")

    else:
        print("\n--- Running Full Installation ---")
        installer.full_install(
            skip_weights=False,
            models=models if models else None,
        )

        if verify:
            print("\n--- Verification ---")
            result = installer.verify_installation()
            avail  = result.get('providers_available', 0)
            total  = result.get('providers_total', 0)
            can_gen = result.get('can_generate', False)
            print(f"Providers available: {avail}/{total}")
            print(f"Can generate: {'YES' if can_gen else 'NO'}")

except ImportError as exc:
    print(f"\n[ERROR] Missing dependency: {exc}")
    print("Install requirements: uv pip install -r requirements.txt")
    sys.exit(1)
except Exception as exc:
    print(f"\n[ERROR] Installation failed: {exc}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
PYTHON_SCRIPT

INSTALL_STATUS=$?
echo ""
echo "=============================================="
if [ $INSTALL_STATUS -eq 0 ]; then
    echo "  Installation Complete"
    echo "=============================================="
    echo ""
    echo "Run './scripts/verify-runtime.sh' to confirm everything is ready."
fi
exit $INSTALL_STATUS
