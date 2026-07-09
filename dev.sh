#!/usr/bin/env bash
# Moyan dev startup script
# Usage: bash dev.sh  or  chmod +x dev.sh && ./dev.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Moyan Dev Environment ==="

# Cleanup: kill Python backend on exit
cleanup() {
    echo ""
    echo "Shutting down Python backend..."
    [ -n "$PYTHON_PID" ] && kill "$PYTHON_PID" 2>/dev/null
    echo "Done."
}
trap cleanup EXIT INT TERM

# 1. Start Python backend
echo "[1/2] Starting Python backend..."
cd "$SCRIPT_DIR/agent-core"
if [ -f ".venv/bin/python" ]; then
    .venv/bin/python main.py &
else
    echo "  venv not found, falling back to system python"
    python main.py &
fi
PYTHON_PID=$!
cd "$SCRIPT_DIR"

# Wait for backend
echo "  Waiting for backend..."
for i in $(seq 1 10); do
    if curl -sf http://127.0.0.1:8765/health > /dev/null 2>&1; then
        echo "  Python backend ready (http://127.0.0.1:8765)"
        break
    fi
    sleep 1
done

# 2. Start Tauri desktop app
echo "[2/2] Starting Tauri desktop app..."
cd "$SCRIPT_DIR/tauri-app"
npm run tauri dev
