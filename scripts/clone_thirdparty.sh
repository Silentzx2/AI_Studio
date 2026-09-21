#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# clone_thirdparty.sh — Clone all third-party model repositories into
#                       thirdparty/ so that backend/scripts/install.sh can
#                       resolve its relative cd paths.
#
# Usage:
#   bash clone_thirdparty.sh            # clones into ./thirdparty
#   THIRDPARTY_DIR=/opt/tp bash clone_thirdparty.sh   # custom target dir
#
# Idempotent: skips repos that already exist.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
THIRD_PARTY_DIR="${THIRD_PARTY_DIR:-${SCRIPT_DIR}/thirdparty}"

declare -A REPOS=(
  ["TRELLIS"]="https://github.com/FishWoWater/TRELLIS"
  ["PartField"]="https://github.com/nv-tlabs/PartField"
  ["PartPacker"]="https://github.com/NVlabs/PartPacker"
  ["Hunyuan3D-2.1"]="https://github.com/FishWoWater/Hunyuan3D-2.1"
  ["UniRig"]="https://github.com/FishWoWater/UniRig"
  ["FastMesh"]="https://github.com/FishWoWater/FastMesh"
  ["PartUV"]="https://github.com/FishWoWater/PartUV"
  ["TRELLIS.2"]="https://github.com/FishWoWater/TRELLIS.2"
  ["Hunyuan3DPart"]="https://github.com/FishWoWater/Hunyuan3D-Part"
  ["UltraShape"]="https://github.com/PKU-YuanGroup/UltraShape-1.0"
  ["VoxHammer"]="https://github.com/FishWoWater/VoxHammer"
)

mkdir -p "$THIRD_PARTY_DIR"

echo ">>> Cloning third-party repos into: $THIRD_PARTY_DIR"
echo ""

for name in "${!REPOS[@]}"; do
  url="${REPOS[$name]}"
  dest="${THIRD_PARTY_DIR}/${name}"

  if [ -d "$dest" ] && [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then
    echo "SKIP  $name  (already exists)"
    continue
  fi

  echo "CLONE $name  <-  $url"
  git clone --depth 1 "$url" "$dest"
done

echo ""
echo ">>> Done. Contents of $THIRD_PARTY_DIR:"
ls -1 "$THIRD_PARTY_DIR"