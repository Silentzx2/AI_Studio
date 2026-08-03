#!/usr/bin/env bash
set -euo pipefail

# AI 3D Studio v3.2 — fresh reset script
# - Stops and removes project containers/volumes/images
# - Deletes local caches, env files, storage directories, venvs, and generated artifacts
# - Supports selective cleanup via --keep-models and --keep-storage
#
# Usage:
#   ./scripts/reset.sh
#   ./scripts/reset.sh --yes
#   ./scripts/reset.sh --keep-models
#   ./scripts/reset.sh --keep-storage --yes
#   ./scripts/reset.sh --aggressive --yes

# ---------- Resolve project root (parent of scripts/) ----------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

YES=false
AGGRESSIVE=false
KEEP_MODELS=false
KEEP_STORAGE=false

for arg in "${@:-}"; do
  case "$arg" in
    --yes|-y)         YES=true ;;
    --aggressive|-a)  AGGRESSIVE=true ;;
    --keep-models)    KEEP_MODELS=true ;;
    --keep-storage)   KEEP_STORAGE=true ;;
    --help|-h)
      cat <<'EOF'
Usage: scripts/reset.sh [OPTIONS]

Resets the project to a clean state. Stops Docker containers and removes
local caches, virtual environments, generated artifacts, and project data.

Options:
  --yes, -y          Skip the confirmation prompt
  --aggressive, -a   Also prune all unused Docker images, networks, volumes,
                      and builder cache (Docker-wide, not just this project)
  --keep-models      Preserve backend/third_party/ (downloaded model repos,
                      weights, and per-model venvs)
  --keep-storage     Preserve backend/storage/ (user uploads, exports,
                      images, thumbnails)

Combine flags:  scripts/reset.sh --keep-models --keep-storage --yes
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      exit 1
      ;;
  esac
done

# ---------- Helpers ----------
log() {
  printf '\n[\033[1m%s\033[0m] %s\n' "$1" "$2"
}

warn() {
  printf '\n[\033[33mWARN\033[0m] %s\n' "$1" >&2
}

# Safe removal: checks existence, logs, traps permission errors.
safe_remove() {
  local target="$1"
  if [ -e "$target" ] || [ -L "$target" ]; then
    log REMOVE "$target"
    rm -rf -- "$target" 2>/dev/null || {
      warn "Permission denied or error removing: $target — skipping"
    }
  fi
}

# ---------- Confirmation prompt ----------
PRESERVE_MSG=""
if [ "$KEEP_MODELS" = true ] && [ "$KEEP_STORAGE" = true ]; then
  PRESERVE_MSG="\n  Preserving: backend/third_party/ AND backend/storage/"
elif [ "$KEEP_MODELS" = true ]; then
  PRESERVE_MSG="\n  Preserving: backend/third_party/ (model repos, weights, venvs)"
elif [ "$KEEP_STORAGE" = true ]; then
  PRESERVE_MSG="\n  Preserving: backend/storage/ (uploads, exports, images)"
fi

if [ "$YES" != true ]; then
  echo "This will remove Docker containers/volumes for this project and delete local caches.${PRESERVE_MSG}"
  echo "Type RESET to continue:"
  read -r confirm
  if [ "$confirm" != "RESET" ]; then
    echo "Cancelled."
    exit 1
  fi
fi

log INFO "Starting fresh reset in: $ROOT_DIR"
if [ -n "$PRESERVE_MSG" ]; then
  printf '%s\n' "$PRESERVE_MSG"
fi

# ============================================================
# Docker cleanup
# ============================================================
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    log DOCKER "Stopping project containers"

    # Use both compose files (same pattern as setup.sh and build-runtime-image.sh)
    compose_files=()
    [ -f "$ROOT_DIR/docker-compose.yml" ]       && compose_files+=(-f "$ROOT_DIR/docker-compose.yml")
    [ -f "$ROOT_DIR/docker-compose.gpu.yml" ]   && compose_files+=(-f "$ROOT_DIR/docker-compose.gpu.yml")
    [ -f "$ROOT_DIR/docker-compose.dev.yml" ]   && compose_files+=(-f "$ROOT_DIR/docker-compose.dev.yml")

    if [ "${#compose_files[@]}" -gt 0 ]; then
      docker compose "${compose_files[@]}" down --remove-orphans --volumes --rmi local 2>/dev/null || true
    fi

    # Extra safety: remove orphan containers with this project's compose label
    project_name="$(basename "$ROOT_DIR" | tr '[:upper:]' '[:lower:]')"
    docker ps -aq --filter "label=com.docker.compose.project=$project_name" \
      | xargs -r docker rm -f >/dev/null 2>&1 || true

    # Build cache prune: only with --aggressive
    if [ "$AGGRESSIVE" = true ]; then
      log DOCKER "Pruning build cache"
      docker builder prune -f >/dev/null 2>&1 || true

      log DOCKER "Aggressively pruning unused Docker resources"
      docker image prune -af >/dev/null 2>&1 || true
      docker container prune -f >/dev/null 2>&1 || true
      docker network prune -f >/dev/null 2>&1 || true
      docker volume prune -f >/dev/null 2>&1 || true
    fi
  else
    warn "Docker daemon is not running; skipping Docker cleanup"
  fi
else
  warn "Docker is not installed; skipping Docker cleanup"
fi

# ============================================================
# Local file cleanup (ordered by priority)
# ============================================================

# --- 1. Env files (preserve .env.example) ---
log CLEAN "Removing env files"
find "$ROOT_DIR" -maxdepth 2 \( \
  -name '.env' -o \
  -name '.env.local' -o \
  -name '.env.development' -o \
  -name '.env.production' -o \
  -name '.env.test' -o \
\) ! -name '.env.example' -type f -print -delete 2>/dev/null || true

# --- 2. Virtual environments ---
log CLEAN "Removing virtual environments"
safe_remove "$ROOT_DIR/.venv"
safe_remove "$ROOT_DIR/venv"
safe_remove "$ROOT_DIR/backend/.venv"

# Per-model venvs inside third_party (each model gets its own .venv/)
if [ "$KEEP_MODELS" = false ] && [ -d "$ROOT_DIR/backend/third_party" ]; then
  find "$ROOT_DIR/backend/third_party" -maxdepth 2 -type d -name '.venv' \
    -print 2>/dev/null | while IFS= read -r venv_dir; do
      safe_remove "$venv_dir"
  done || true
fi

# --- 3. Frontend artifacts ---
log CLEAN "Removing generated frontend artifacts"
safe_remove "$ROOT_DIR/node_modules"
safe_remove "$ROOT_DIR/.next"
safe_remove "$ROOT_DIR/dist"
safe_remove "$ROOT_DIR/build"
safe_remove "$ROOT_DIR/out"
safe_remove "$ROOT_DIR/coverage"
safe_remove "$ROOT_DIR/.turbo"
safe_remove "$ROOT_DIR/.cache"
safe_remove "$ROOT_DIR/tsconfig.tsbuildinfo"

# --- 4. Project data (new v3.2 architecture) ---

# backend/storage/ — uploads, exports, images, thumbnails
if [ "$KEEP_STORAGE" = false ]; then
  log CLEAN "Removing project storage (backend/storage/)"
  safe_remove "$ROOT_DIR/storage"
  safe_remove "$ROOT_DIR/backend/storage"
fi

# backend/third_party/ — repos, weights, per-model venvs, .installing.lock
if [ "$KEEP_MODELS" = false ]; then
  log CLEAN "Removing third-party model repos, weights, and lock files (backend/third_party/)"
  safe_remove "$ROOT_DIR/third_party"
  safe_remove "$ROOT_DIR/backend/third_party"
else
  # Even when keeping models, clean .installing.lock files (stale install locks)
  log CLEAN "Cleaning stale .installing.lock files in third_party/"
  find "$ROOT_DIR/backend/third_party" -maxdepth 2 -name '.installing.lock' \
    -type f -print -delete 2>/dev/null || true
fi

# backend/.runtime_cache/ — runtime cache
log CLEAN "Removing runtime cache (backend/.runtime_cache/)"
safe_remove "$ROOT_DIR/.runtime_cache"
safe_remove "$ROOT_DIR/backend/.runtime_cache"

# --- 5. Python bytecode and logs ---
log CLEAN "Removing Python bytecode and log files"
find "$ROOT_DIR" -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
find "$ROOT_DIR" -type f \( -name '*.pyc' -o -name '*.pyo' -o -name '*.pyd' -o -name '*.log' \) \
  -delete 2>/dev/null || true

# --- 6. Editor and OS junk ---
log CLEAN "Removing editor and OS junk"
find "$ROOT_DIR" -type f \( -name '.DS_Store' -o -name 'Thumbs.db' \) \
  -delete 2>/dev/null || true
safe_remove "$ROOT_DIR/.vscode/.history"

# --- 7. Runtime test caches ---
log CLEAN "Removing test and lint caches"
safe_remove "$ROOT_DIR/.pytest_cache"
safe_remove "$ROOT_DIR/backend/.pytest_cache"
safe_remove "$ROOT_DIR/.mypy_cache"
safe_remove "$ROOT_DIR/backend/.mypy_cache"
safe_remove "$ROOT_DIR/.ruff_cache"
safe_remove "$ROOT_DIR/backend/.ruff_cache"

# ============================================================
# Done
# ============================================================
log INFO "Fresh reset complete."
echo ""
echo "Reinstall flow:"
echo "  1) cp .env.example .env           # create your env config"
echo "  2) uv venv backend/.venv           # create backend venv"
echo "  3) source backend/.venv/bin/activate"
echo "  4) uv pip install -r backend/requirements.txt"
echo "  5) npm install                     # (if running frontend locally)"
echo "  6) docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build"
echo ""
echo "Note: Models will be downloaded on first use by the installer."
echo "      Use --keep-models next time to skip re-downloading."
