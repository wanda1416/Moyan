#!/usr/bin/env bash
# Moyan Python backend build script (macOS / Linux)
# Pack agent-core into a standalone executable via PyInstaller
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_DIR="$ROOT/agent-core"

echo "=== Moyan Backend Build ($(uname -s)) ==="

if [ ! -f "$AGENT_DIR/.venv/bin/python" ]; then
    echo "[ERROR] $AGENT_DIR/.venv not found. Run setup first."
    exit 1
fi

# Activate venv
# shellcheck disable=SC1091
source "$AGENT_DIR/.venv/bin/activate"

# Install PyInstaller if missing
echo "[1/3] Checking pyinstaller..."
if ! python -m pip show pyinstaller >/dev/null 2>&1; then
    echo "    Installing pyinstaller..."
    python -m pip install pyinstaller
fi

# Clean old artifacts
echo "[2/3] Cleaning old build..."
rm -rf "$AGENT_DIR/build" "$AGENT_DIR/dist"

# Pack
echo "[3/3] Running PyInstaller..."
cd "$AGENT_DIR"
pyinstaller moyan-backend.spec --noconfirm

# Deactivate venv (defensive: deactivate is a shell function, may not always exist)
deactivate 2>/dev/null || true

echo
echo "=== Done ==="
echo "Backend built: $AGENT_DIR/dist/moyan-backend"
echo "(onefile mode: a single self-contained binary, ~50 MB)"