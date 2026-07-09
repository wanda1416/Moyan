#!/usr/bin/env bash
# Moyan dev startup script
# Usage: bash dev.sh  or  chmod +x dev.sh && ./dev.sh
# Python backend is auto-managed by Tauri (PythonBridge)

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Moyan Dev Environment ==="

# Check prerequisites
if [ -f "$SCRIPT_DIR/agent-core/.venv/bin/python" ]; then
    echo "  Python venv found"
else
    echo "  WARNING: agent-core/.venv not found, will use system python"
fi

# Start Tauri desktop app (Python backend auto-starts via PythonBridge)
echo "[1/1] Starting Tauri desktop app..."
echo "  Python backend will be auto-managed."
cd "$SCRIPT_DIR/tauri-app"
npm run tauri dev
