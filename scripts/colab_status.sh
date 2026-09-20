#!/usr/bin/env bash
# ==============================================================================
# [ENVIRONMENT: GOOGLE COLAB / CLOUD GPU ONLY]
# ⚠️  DO NOT USE ON VPS / LOCAL PC. For VPS, use scripts/status.sh
#
# AI 3D Studio — Colab Status Script
# Checks health of ComfyUI, FastAPI, Frontend, DB, Redis, Watchdog,
# and active Cloudflare tunnel URLs.
# ==============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/colab.sh" --status "$@"
