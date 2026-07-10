#!/usr/bin/env bash
# Copy PyInstaller output to Tauri sidecar dir, named by target triple
# Usage: copy-sidecar.sh <target-triple>
# Example:
#   copy-sidecar.sh x86_64-pc-windows-msvc
#   copy-sidecar.sh aarch64-apple-darwin
set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <target-triple>"
    echo "  e.g. x86_64-pc-windows-msvc, aarch64-apple-darwin"
    exit 1
fi

TARGET_TRIPLE="$1"
BIN_NAME="moyan-backend"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST_DIR="$ROOT/tauri-app/src-tauri/binaries"

if [[ "$TARGET_TRIPLE" == *windows* ]]; then
    # PyInstaller onefile mode: single self-contained binary (no _internal/ dir).
    SRC="$ROOT/agent-core/dist/${BIN_NAME}.exe"
    DEST="$DEST_DIR/${BIN_NAME}-${TARGET_TRIPLE}.exe"
else
    SRC="$ROOT/agent-core/dist/${BIN_NAME}"
    DEST="$DEST_DIR/${BIN_NAME}-${TARGET_TRIPLE}"
fi

if [ ! -f "$SRC" ]; then
    echo "[ERROR] Source not found: $SRC"
    echo "        Run scripts/build-backend.sh first."
    exit 1
fi

mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST"

# Non-Windows platforms need executable permission
if [[ "$TARGET_TRIPLE" != *windows* ]]; then
    chmod +x "$DEST"
fi

echo "Sidecar copied to: $DEST"