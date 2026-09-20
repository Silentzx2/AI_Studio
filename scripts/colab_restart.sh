#!/usr/bin/env bash
# ==============================================================================
# [ENVIRONMENT: GOOGLE COLAB / CLOUD GPU ONLY]
# ⚠️  DO NOT USE ON VPS / LOCAL PC. For VPS, use scripts/restart.sh
#
# AI 3D Studio — Colab Restart Services Script
# Gracefully restarts all services, refreshes Cloudflare tunnels,
# and attaches foreground supervisor.
# ==============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/colab.sh" --restart "$@"
