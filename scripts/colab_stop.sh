#!/usr/bin/env bash
# ==============================================================================
# AI 3D Studio — Colab Stop Services Script
# Stops Next.js (3000), FastAPI (8000), ComfyUI (8188), supervisor,
# and Cloudflare tunnels cleanly.
# ==============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/colab.sh" --stop "$@"
