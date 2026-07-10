#!/usr/bin/env bash
# Moyan one-click build script (macOS / Linux)
# Steps:
#   1. PyInstaller pack Python backend
#   2. Copy sidecar to Tauri binaries
#   3. tauri build (internally runs beforeBuildCommand = npm run build)
#
# Usage:
#   ./build.sh                          # auto-detect platform triple
#   ./build.sh aarch64-apple-darwin     # specify explicitly

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Auto-detect target triple
if [ -n "$1" ]; then
    TARGET_TRIPLE="$1"
else
    ARCH="$(uname -m)"
    OS="$(uname -s | tr "[:upper:]" "[:lower:]")"
    case "$OS" in
        darwin)
            case "$ARCH" in
                arm64|aarch64) TARGET_TRIPLE="aarch64-apple-darwin" ;;
                x86_64)        TARGET_TRIPLE="x86_64-apple-darwin" ;;
                *) echo "[ERROR] Unsupported macOS arch: $ARCH"; exit 1 ;;
            esac
            ;;
        linux)
            case "$ARCH" in
                x86_64)  TARGET_TRIPLE="x86_64-unknown-linux-gnu" ;;
                aarch64) TARGET_TRIPLE="aarch64-unknown-linux-gnu" ;;
                *) echo "[ERROR] Unsupported Linux arch: $ARCH"; exit 1 ;;
            esac
            ;;
        *)
            echo "[ERROR] Unsupported OS: $OS"
            exit 1
            ;;
    esac
fi

echo "=== Moyan Build ($(uname -s) / $TARGET_TRIPLE) ==="

# 1. Pack Python backend
echo
echo "[1/4] Building Python backend..."
bash "$SCRIPT_DIR/scripts/build-backend.sh"

# 2. Copy sidecar
echo
echo "[2/4] Copying sidecar to Tauri binaries..."
bash "$SCRIPT_DIR/scripts/copy-sidecar.sh" "$TARGET_TRIPLE"

# 3. tauri build
echo
echo "[3/4] Running tauri build..."
cd "$SCRIPT_DIR/tauri-app"
npm run tauri build

# 4. Collect final artifacts into <root>/dist/
echo
echo "[4/4] Collecting artifacts to dist/..."
bash "$SCRIPT_DIR/scripts/collect-artifacts.sh" || echo "[WARN] Artifact collection failed (build itself succeeded)."

echo
echo "=== Moyan Build Complete ==="
echo "Output: $SCRIPT_DIR/dist/"