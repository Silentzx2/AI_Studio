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
info "Waiting for services to stop..."
for i in {1..15}; do
    if ! curl -sf http://localhost:8000/api/v1/health &>/dev/null; then
        break
    fi
    sleep 1
done
echo ""

# Start services
bash "$SCRIPT_DIR/start.sh"
