#!/usr/bin/env bash
# Moyan frontend build script (macOS / Linux)
# Runs npm run build in tauri-app/, output to tauri-app/dist/

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT/tauri-app"

echo "=== Moyan Frontend Build ($(uname -s)) ==="

if [ ! -f "$APP_DIR/package.json" ]; then
    echo "[ERROR] $APP_DIR/package.json not found."
    exit 1
fi

cd "$APP_DIR"
npm run build

echo
echo "=== Done ==="
echo "Frontend built: $APP_DIR/dist/"