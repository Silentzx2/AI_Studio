#!/usr/bin/env bash
# update-models.sh — Clone/update repos and download weights
#
# Usage:
#   ./scripts/update-models.sh                        # Full install (all models)
#   ./scripts/update-models.sh --repos-only           # Only clone repos
#   ./scripts/update-models.sh --weights-only         # Only download weights
#   ./scripts/update-models.sh --verify               # Verify after install
#   ./scripts/update-models.sh --model=trellis        # Specific model
#   ./scripts/update-models.sh --models=hunyuan3d-2,trellis  # Multiple models
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
            echo "Available models: triposr, trellis, hunyuan3d"
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

# Ensure the project venv exists
VENV_PYTHON="$BACKEND_DIR/.venv/bin/python"
if [[ ! -x "$VENV_PYTHON" ]]; then
    echo "[ERROR] Python venv not found at $VENV_PYTHON. Run: sudo bash scripts/setup.sh"
    exit 1
fi

# Create necessary directories
mkdir -p third_party/.hf_cache/hub

# Set HuggingFace cache environment
export HF_HOME="$BACKEND_DIR/third_party/.hf_cache"
export HUGGINGFACE_HUB_CACHE="$HF_HOME/hub"
export TORCH_HOME="$HF_HOME/torch"

echo "Storage configuration:"
echo "  Comfy3D Checkpoints: ENGINE/ComfyUI/custom_nodes/ComfyUI-3D-Pack/Checkpoints/"
echo "  HF Cache:            $HF_HOME"
echo ""

# Export env-vars for the embedded Python script
export INSTALL_REPOS_ONLY=$REPOS_ONLY
export INSTALL_WEIGHTS_ONLY=$WEIGHTS_ONLY
export INSTALL_VERIFY=$VERIFY
export INSTALL_MODELS="${MODELS[*]:-}"
export HF_TOKEN="$HF_TOKEN"

"$VENV_PYTHON" << 'PYTHON_SCRIPT'
import sys
import os
from pathlib import Path

models_str    = os.environ.get('INSTALL_MODELS', '')
raw_models    = [m.strip().lower() for m in models_str.split() if m.strip()]
verify        = os.environ.get('INSTALL_VERIFY',      'false').lower() == 'true'
weights_only  = os.environ.get('INSTALL_WEIGHTS_ONLY','false').lower() == 'true'
hf_token      = os.environ.get('HF_TOKEN', '') or None

# Locate ComfyUI-3D-Pack Checkpoints root
workspace_root = Path(__file__).resolve().parent.parent if "__file__" in locals() else Path(os.getcwd()).parent
ckpt_root = workspace_root / "ENGINE" / "ComfyUI" / "custom_nodes" / "ComfyUI-3D-Pack" / "Checkpoints"
ckpt_root.mkdir(parents=True, exist_ok=True)

MODEL_CONFIGS = {
    "triposr": {
        "repo_id": "stabilityai/TripoSR",
        "filename": "model.ckpt",
        "dest_dir": ckpt_root / "TripoSR",
        "type": "file",
    },
    "trellis": {
        "repo_id": "jetx/TRELLIS-image-large",
        "filename": None,
        "dest_dir": None,
        "type": "snapshot",
    },
    "hunyuan3d": {
        "repo_id": "tencent/Hunyuan3D-2.1",
        "filename": None,
        "dest_dir": None,
        "type": "snapshot",
    },
}

targets = raw_models if (raw_models and "__all__" not in raw_models and "all" not in raw_models) else ["triposr", "trellis", "hunyuan3d"]

try:
    from huggingface_hub import hf_hub_download, snapshot_download

    print(f"Target models: {', '.join(targets)}")
    for target in targets:
        matched_key = None
        for k in MODEL_CONFIGS:
            if k in target or target in k:
                matched_key = k
                break

        if not matched_key:
            print(f"[WARN] Unknown model target: {target}")
            continue

        cfg = MODEL_CONFIGS[matched_key]
        repo = cfg["repo_id"]
        print(f"\n--- {matched_key.upper()} ({repo}) ---")

        if verify:
            if cfg["type"] == "file":
                dest_file = cfg["dest_dir"] / cfg["filename"]
                if dest_file.exists() and dest_file.stat().st_size > 1000:
                    mb = dest_file.stat().st_size // (1024 * 1024)
                    print(f"  [OK] Verified: {dest_file} ({mb} MB)")
                else:
                    print(f"  [MISSING] Not found at: {dest_file}")
            else:
                print(f"  [OK] Model managed via HuggingFace Hub snapshot ({repo})")
            continue

        if cfg["type"] == "file":
            cfg["dest_dir"].mkdir(parents=True, exist_ok=True)
            target_path = cfg["dest_dir"] / cfg["filename"]
            if target_path.exists() and target_path.stat().st_size > 1000:
                mb = target_path.stat().st_size // (1024 * 1024)
                print(f"  [EXISTS] {target_path} ({mb} MB), skipping download.")
            else:
                print(f"  Downloading {cfg['filename']} from {repo}...")
                dl = hf_hub_download(
                    repo_id=repo,
                    filename=cfg["filename"],
                    token=hf_token,
                    local_dir=str(cfg["dest_dir"]),
                )
                print(f"  [OK] Saved to {dl}")
        else:
            print(f"  Downloading snapshot for {repo}...")
            snapshot_download(
                repo_id=repo,
                token=hf_token,
            )
            print(f"  [OK] Snapshot downloaded for {repo}")

    print("\n[OK] Model processing complete.")

except ImportError as exc:
    print(f"\n[ERROR] Missing dependency: {exc}")
    print("Install requirements: uv pip install huggingface_hub")
    sys.exit(1)
except Exception as exc:
    print(f"\n[ERROR] Operation failed: {exc}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
PYTHON_SCRIPT


echo ""
echo "=============================================="
echo "  Installation Complete"
echo "=============================================="
echo ""
