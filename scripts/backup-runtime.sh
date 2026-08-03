#!/usr/bin/env bash
# backup-runtime.sh — Archive runtime assets to a timestamped tar.gz
#
# Usage: ./scripts/backup-runtime.sh [--include-storage] [--include-env]
#
# Flags:
#   --include-storage   Also backup backend/storage/ and backend/.runtime_cache/
#   --include-env       Also backup .env file
#
# Env:
#   BACKUP_DIR  Target directory (default: $HOME/ai3dstudio-backups)
#
set -euo pipefail

# Resolve project root (parent of scripts/)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Parse flags
INCLUDE_STORAGE=false
INCLUDE_ENV=false
for arg in "$@"; do
    case "$arg" in
        --include-storage) INCLUDE_STORAGE=true ;;
        --include-env)     INCLUDE_ENV=true ;;
        -h|--help)
            echo "Usage: $0 [--include-storage] [--include-env]"
            echo ""
            echo "Backs up backend/third_party/ by default."
            echo "  --include-storage   Also backup backend/storage/ and backend/.runtime_cache/"
            echo "  --include-env       Also backup .env file"
            echo "  BACKUP_DIR          Target directory (default: \$HOME/ai3dstudio-backups)"
            exit 0
            ;;
        *)
            echo "Unknown flag: $arg" >&2
            echo "Run: $0 --help" >&2
            exit 1
            ;;
    esac
done

# Validate source directories exist
if [ ! -d "$BACKEND_DIR/third_party" ]; then
    echo "ERROR: $BACKEND_DIR/third_party does not exist — nothing to back up." >&2
    exit 1
fi

if [ "$INCLUDE_STORAGE" = true ]; then
    for d in "$BACKEND_DIR/storage" "$BACKEND_DIR/.runtime_cache"; do
        if [ ! -d "$d" ]; then
            echo "WARNING: $d does not exist — skipping." >&2
        fi
    done
fi

if [ "$INCLUDE_ENV" = true ]; then
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        echo "WARNING: $PROJECT_ROOT/.env does not exist — skipping." >&2
    fi
fi

# Build list of items to archive (paths relative to PROJECT_ROOT)
ITEMS=("backend/third_party")
TOTAL_SIZE=""

if [ "$INCLUDE_STORAGE" = true ]; then
    if [ -d "$BACKEND_DIR/storage" ]; then
        ITEMS+=("backend/storage")
    fi
    if [ -d "$BACKEND_DIR/.runtime_cache" ]; then
        ITEMS+=("backend/.runtime_cache")
    fi
fi

# Determine archive name suffix
SUFFIX="third_party"
if [ "$INCLUDE_STORAGE" = true ]; then
    SUFFIX="third_party+storage"
fi
if [ "$INCLUDE_ENV" = true ]; then
    if [ "$SUFFIX" = "third_party" ]; then
        SUFFIX="third_party+env"
    else
        SUFFIX="${SUFFIX}+env"
    fi
fi

# Setup output directory
BACKUP_DIR="${BACKUP_DIR:-$HOME/ai3dstudio-backups}"
TS=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# Build the item list string for display
ITEM_LIST=""
for item in "${ITEMS[@]}"; do
    ITEM_LIST="$ITEM_LIST  - $PROJECT_ROOT/$item\n"
done
if [ "$INCLUDE_ENV" = true ] && [ -f "$PROJECT_ROOT/.env" ]; then
    ITEM_LIST="$ITEM_LIST  - $PROJECT_ROOT/.env\n"
fi

# Calculate total size
if command -v du &>/dev/null; then
    SIZE_ARGS=()
    for item in "${ITEMS[@]}"; do
        SIZE_ARGS+=("$PROJECT_ROOT/$item")
    done
    if [ "$INCLUDE_ENV" = true ] && [ -f "$PROJECT_ROOT/.env" ]; then
        SIZE_ARGS+=("$PROJECT_ROOT/.env")
    fi
    TOTAL_SIZE=$(du -csh "${SIZE_ARGS[@]}" 2>/dev/null | tail -1 | cut -f1 || echo "(unknown)")
fi

echo "=============================================="
echo "  AI 3D Studio v3.2 — Runtime Backup"
echo "=============================================="
echo ""
echo "  Items to back up:"
printf "$ITEM_LIST"
if [ -n "$TOTAL_SIZE" ]; then
    echo "  Total size: $TOTAL_SIZE"
fi
echo "  Destination: $BACKUP_DIR/"
echo ""

ARCHIVE="$BACKUP_DIR/runtime_${SUFFIX}_$TS.tar.gz"

# Build tar command
TAR_ARGS=("-czf" "$ARCHIVE" -C "$PROJECT_ROOT")
for item in "${ITEMS[@]}"; do
    TAR_ARGS+=("$item")
done
if [ "$INCLUDE_ENV" = true ] && [ -f "$PROJECT_ROOT/.env" ]; then
    TAR_ARGS+=(".env")
fi

echo "Creating archive..."
tar "${TAR_ARGS[@]}"

echo "Done: $ARCHIVE ($(du -sh "$ARCHIVE" | cut -f1))"
