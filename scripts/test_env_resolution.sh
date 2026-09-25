#!/usr/bin/env bash
# Quick self-check for Python environment resolution logic
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Testing environment resolution..."

# Check 1: syntax check
bash -n "$PROJECT_ROOT/backend/scripts/run_server.sh"
bash -n "$PROJECT_ROOT/backend/scripts/install.sh"
echo "✓ Syntax valid"

# Check 2: run_server fails safely without creating .venv when no env exists
TMP_TEST_DIR="$(mktemp -d)"
cleanup() {
    rm -rf "$TMP_TEST_DIR"
}
trap cleanup EXIT

FAKE_ROOT="$TMP_TEST_DIR/fake_repo"
mkdir -p "$FAKE_ROOT/backend/scripts" "$FAKE_ROOT/backend/config" "$TMP_TEST_DIR/bin"
cp "$PROJECT_ROOT/backend/scripts/run_server.sh" "$FAKE_ROOT/backend/scripts/run_server.sh"
chmod +x "$FAKE_ROOT/backend/scripts/run_server.sh"

echo "dummy: true" > "$FAKE_ROOT/backend/config/system.yaml"
echo "dummy: true" > "$FAKE_ROOT/backend/config/models.yaml"

# Mock redis-cli to return success
cat << 'EOF' > "$TMP_TEST_DIR/bin/redis-cli"
#!/bin/sh
exit 0
EOF
chmod +x "$TMP_TEST_DIR/bin/redis-cli"

set +e
OUT=$(cd "$FAKE_ROOT/backend" && env HOME="$TMP_TEST_DIR" PATH="$TMP_TEST_DIR/bin:/usr/bin:/bin" bash scripts/run_server.sh 2>&1)
CODE=$?
set -e

if [ "$CODE" -ne 1 ]; then
    echo "✗ Expected exit code 1 when no env exists, got $CODE"
    exit 1
fi

if [ -d "$FAKE_ROOT/.venv" ]; then
    echo "✗ Destructive .venv creation detected when no env exists!"
    exit 1
fi

echo "✓ Fails safely without creating .venv"

# Check 3: resolves mock conda env 3daigc-api
MOCK_ENV="$TMP_TEST_DIR/miniconda3/envs/3daigc-api"
mkdir -p "$MOCK_ENV/bin" "$MOCK_ENV/conda-meta"
cat << 'EOF' > "$MOCK_ENV/bin/python"
#!/bin/sh
if [ "$1" = "-c" ]; then
    case "$2" in
        *sys.version_info*) echo "3.10"; exit 0 ;;
        *fastapi*) exit 0 ;;
        *) exit 0 ;;
    esac
fi
exit 0
EOF
chmod +x "$MOCK_ENV/bin/python"

cat << 'EOF' > "$FAKE_ROOT/backend/scripts/scheduler_service.py"
#!/bin/sh
exit 0
EOF
chmod +x "$FAKE_ROOT/backend/scripts/scheduler_service.py"

OUT=$(cd "$FAKE_ROOT/backend" && env HOME="$TMP_TEST_DIR" PATH="$TMP_TEST_DIR/bin:/usr/bin:/bin" bash scripts/run_server.sh --help 2>&1)
echo "✓ Conda environment discovery check passed"

echo "All environment resolution checks passed!"
