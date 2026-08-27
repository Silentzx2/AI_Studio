#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# AI 3D Studio v3.2 — Restart Services
# Stops all services and starts them again
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Helper functions
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

log() { echo -e "${GREEN}[INFO]${NC}    $*"; }
info() { echo -e "${CYAN}[INFO]${NC}   $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}   $*"; }
err() { echo -e "${RED}[ERROR]${NC}  $*"; }

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
