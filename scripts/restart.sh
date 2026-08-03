#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# AI 3D Studio v3.2 — Restart Services
# Stops all services and starts them again
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Stop services
bash "$SCRIPT_DIR/stop.sh"

echo ""
echo "Waiting 3 seconds before restart..."
sleep 3
echo ""

# Start services
bash "$SCRIPT_DIR/start.sh"
