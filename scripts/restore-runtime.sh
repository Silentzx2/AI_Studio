#!/usr/bin/env bash
# restore-runtime.sh — Restore runtime assets from a backup archive
#
# Usage: ./scripts/restore-runtime.sh /path/to/archive.tar.gz
#
# Auto-detects what the archive contains (third_party, storage, .runtime_cache, .env)
# and restores only those components. Backs up existing directories before overwriting.
#
set -euo pipefail

# Resolve project root (parent of scripts/)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

# ── Arguments ───────────────────────────────────────────
ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ]; then
    echo "Usage: $0 /path/to/archive.tar.gz" >&2
    exit 1
fi
if [ ! -f "$ARCHIVE" ]; then
    echo "ERROR: Archive not found: $ARCHIVE" >&2
    exit 1
fi

TS=$(date +%Y%m%d_%H%M%S)

# ── Detect archive contents ─────────────────────────────
echo "=============================================="
echo "  AI 3D Studio v3.2 — Runtime Restore"
echo "=============================================="
echo ""
echo "  Archive: $ARCHIVE"
echo ""

# List top-level entries in the archive
ARCHIVE_ENTRIES=$(tar -tzf "$ARCHIVE" 2>/dev/null | sed 's|/.*||' | sort -u || true)

if [ -z "$ARCHIVE_ENTRIES" ]; then
    echo "ERROR: Could not read archive contents (corrupt or empty?)." >&2
    exit 1
fi

HAS_THIRD_PARTY=false
HAS_STORAGE=false
HAS_RUNTIME_CACHE=false
HAS_ENV=false

for entry in $ARCHIVE_ENTRIES; do
    case "$entry" in
        backend/third_party)  HAS_THIRD_PARTY=true ;;
        backend/storage)      HAS_STORAGE=true ;;
        backend/.runtime_cache) HAS_RUNTIME_CACHE=true ;;
        .env)                 HAS_ENV=true ;;
    esac
done

echo "  Detected contents:"
$HAS_THIRD_PARTY  && echo "    - backend/third_party/"
$HAS_STORAGE       && echo "    - backend/storage/"
$HAS_RUNTIME_CACHE  && echo "    - backend/.runtime_cache/"
$HAS_ENV           && echo "    - .env"

if [ "$HAS_THIRD_PARTY" = false ] && \
   [ "$HAS_STORAGE" = false ] && \
   [ "$HAS_RUNTIME_CACHE" = false ] && \
   [ "$HAS_ENV" = false ]; then
    echo ""
    echo "ERROR: Archive does not contain any recognizable AI 3D Studio paths." >&2
    echo "  Found: $(echo $ARCHIVE_ENTRIES | tr '\n' ' ')" >&2
    exit 1
fi

echo ""

# ── Pre-restore backups ─────────────────────────────────
backup_if_exists() {
    local src="$1"
    local label="$2"
    if [ -e "$src" ]; then
        local bak="${src}.bak_${TS}"
        echo "  Backing up existing $label → ${bak##*/}"
        mv "$src" "$bak"
    fi
}

if [ "$HAS_THIRD_PARTY" = true ]; then
    backup_if_exists "$BACKEND_DIR/third_party" "backend/third_party/"
fi
if [ "$HAS_STORAGE" = true ]; then
    backup_if_exists "$BACKEND_DIR/storage" "backend/storage/"
fi
if [ "$HAS_RUNTIME_CACHE" = true ]; then
    backup_if_exists "$BACKEND_DIR/.runtime_cache" "backend/.runtime_cache/"
fi
if [ "$HAS_ENV" = true ]; then
    backup_if_exists "$PROJECT_ROOT/.env" ".env"
fi

echo ""

# ── Extract ─────────────────────────────────────────────
echo "  Extracting archive..."
mkdir -p "$BACKEND_DIR"
tar -xzf "$ARCHIVE" -C "$PROJECT_ROOT"
echo "  Extraction complete."
echo ""

# ── Verify restored files ───────────────────────────────
echo "  Verifying restored files:"
VERIFY_ERRORS=0

verify_dir() {
    local dir="$1"
    local label="$2"
    if [ -d "$dir" ]; then
        local count
        count=$(find "$dir" -type f 2>/dev/null | wc -l || echo 0)
        echo "    OK   $label ($count files)"
    else
        echo "    FAIL $label — directory not found after extraction" >&2
        VERIFY_ERRORS=$((VERIFY_ERRORS + 1))
    fi
}

verify_file() {
    local file="$1"
    local label="$2"
    if [ -f "$file" ]; then
        echo "    OK   $label"
    else
        echo "    FAIL $label — file not found after extraction" >&2
        VERIFY_ERRORS=$((VERIFY_ERRORS + 1))
    fi
}

if [ "$HAS_THIRD_PARTY" = true ]; then
    verify_dir "$BACKEND_DIR/third_party" "backend/third_party/"
fi
if [ "$HAS_STORAGE" = true ]; then
    verify_dir "$BACKEND_DIR/storage" "backend/storage/"
fi
if [ "$HAS_RUNTIME_CACHE" = true ]; then
    verify_dir "$BACKEND_DIR/.runtime_cache" "backend/.runtime_cache/"
fi
if [ "$HAS_ENV" = true ]; then
    verify_file "$PROJECT_ROOT/.env" ".env"
fi

echo ""

if [ "$VERIFY_ERRORS" -gt 0 ]; then
    echo "WARNING: $VERIFY_ERRORS component(s) could not be verified after extraction." >&2
    echo "  The archive may be incomplete or corrupted." >&2
    exit 1
fi

echo "  Restore successful. Run './scripts/verify-runtime.sh' to confirm."
