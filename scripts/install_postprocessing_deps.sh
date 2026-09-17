#!/bin/bash
set -e
echo "=== Verifying post-processing dependencies ==="

# Python deps (already in requirements.txt, just verify)
python -c "import pymeshlab; print('pymeshlab OK')"
python -c "import xatlas; print('xatlas OK')"
python -c "import trimesh; print('trimesh OK')"
python -c "import xxhash; print('xxhash OK')"
python -c "import open3d; print('open3d OK')"

# Node.js + gltf-transform
node --version || { echo 'ERROR: Node.js not found'; exit 1; }
bun --version || { echo 'ERROR: Bun not found'; exit 1; }
if ! command -v gltf-transform &>/dev/null; then
    # Also check NVM path (common on Lightning AI / Kaggle studios)
    NVM_BIN="/system/conda/node/nvm/versions/node/v22.14.0/bin"
    if [ -x "$NVM_BIN/gltf-transform" ]; then
        echo "gltf-transform found at $NVM_BIN (not in PATH but functional)"
    else
        echo 'Installing gltf-transform...'
        if command -v bun &>/dev/null; then
            bun install -g @gltf-transform/cli
        else
            npm install -g @gltf-transform/cli
        fi
    fi
fi
# Verify it actually runs (via PATH or NVM fallback)
GLTF_CMD=$(command -v gltf-transform 2>/dev/null || echo "/system/conda/node/nvm/versions/node/v22.14.0/bin/gltf-transform")
$GLTF_CMD --version || { echo 'ERROR: gltf-transform not working'; exit 1; }

# Blender
blender --version 2>/dev/null | head -1 || { echo 'ERROR: Blender not found'; exit 1; }

echo '=== All post-processing dependencies OK ==='
