#!/usr/bin/env bash
# ==============================================================================
# AI 3D Studio — Colab Start Services Script
# Starts PostgreSQL, Redis, ComfyUI (8188), FastAPI (8000), Next.js (3000),
# establishes Cloudflare tunnels, and attaches foreground supervisor.
# ==============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/colab.sh" --start "$@"
