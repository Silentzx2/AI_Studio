#!/bin/bash
set -e
echo "=== Verifying post-processing dependencies ==="

# Python deps (already in requirements.txt, just verify)
python -c "import pymeshlab; print('pymeshlab OK')"
python -c "import xatlas; print('xatlas OK')"
python -c "import trimesh; print('trimesh OK')"
python -c "import open3d; print('open3d OK')"

# Node.js + gltf-transform
node --version || { echo 'ERROR: Node.js not found'; exit 1; }
npm --version || { echo 'ERROR: npm not found'; exit 1; }
if ! command -v gltf-transform &>/dev/null; then
    echo 'Installing gltf-transform...'
    npm install -g @gltf-transform/cli
fi
gltf-transform --version || { echo 'ERROR: gltf-transform not working'; exit 1; }

# Blender
blender --version 2>/dev/null | head -1 || { echo 'ERROR: Blender not found'; exit 1; }

echo '=== All post-processing dependencies OK ==='
