#!/usr/bin/env bash
# Moyan artifact collector (macOS / Linux)
# Copies the final build outputs from tauri target dirs to <root>/dist/
# so the installer / portable binary is easy to find after a build.
#
# Detected artifact types (only those that exist are copied):
#   Windows: nsis/*-setup.exe, msi/*.msi, raw novel-agent.exe
#   macOS:   dmg/*.dmg, macos/*.app
#   Linux:   deb/*.deb, rpm/*.rpm, appimage/*.AppImage
#
# Usage: collect-artifacts.sh
#   Optional env override: MOYAN_VERSION=x.y.z ./collect-artifacts.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUNDLE_DIR="$ROOT/tauri-app/src-tauri/target/release/bundle"
RELEASE_DIR="$ROOT/tauri-app/src-tauri/target/release"
DIST_DIR="$ROOT/dist"
CONF="$ROOT/tauri-app/src-tauri/tauri.conf.json"

# Auto-detect version from tauri.conf.json (env var wins)
if [ -z "$MOYAN_VERSION" ]; then
    if command -v python3 >/dev/null 2>&1; then
        MOYAN_VERSION=$(python3 -c "import json; print(json.load(open('$CONF'))['version'])" 2>/dev/null || echo "unknown")
    elif command -v jq >/dev/null 2>&1; then
        MOYAN_VERSION=$(jq -r '.version' "$CONF" 2>/dev/null || echo "unknown")
    else
        MOYAN_VERSION="unknown"
    fi
fi

echo "=== Moyan Artifact Collect ==="
echo "Version: $MOYAN_VERSION"
echo

# Clean and recreate dist/ to ensure freshness
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

COUNT=0

copy() {
    if [ -e "$1" ]; then
        cp -r "$1" "$DIST_DIR/"
        echo "  [OK] $(basename "$1")"
        COUNT=$((COUNT + 1))
    fi
}

# Windows
echo "Windows bundles:"
[ -d "$BUNDLE_DIR/nsis" ] && for f in "$BUNDLE_DIR/nsis/"*-setup.exe; do copy "$f"; done
[ -d "$BUNDLE_DIR/msi" ]  && for f in "$BUNDLE_DIR/msi/"*.msi;      do copy "$f"; done

# macOS
echo "macOS bundles:"
[ -d "$BUNDLE_DIR/dmg" ]   && for f in "$BUNDLE_DIR/dmg/"*.dmg;     do copy "$f"; done
[ -d "$BUNDLE_DIR/macos" ] && for d in "$BUNDLE_DIR/macos/"*.app;   do copy "$d"; done

# Linux
echo "Linux bundles:"
[ -d "$BUNDLE_DIR/deb" ]      && for f in "$BUNDLE_DIR/deb/"*.deb;           do copy "$f"; done
[ -d "$BUNDLE_DIR/rpm" ]      && for f in "$BUNDLE_DIR/rpm/"*.rpm;           do copy "$f"; done
[ -d "$BUNDLE_DIR/appimage" ] && for f in "$BUNDLE_DIR/appimage/"*.AppImage; do copy "$f"; done

# Raw portable binary (works without installer)
echo "Portable binary:"
[ -f "$RELEASE_DIR/novel-agent.exe" ] && copy "$RELEASE_DIR/novel-agent.exe"
[ -f "$RELEASE_DIR/novel-agent" ]     && copy "$RELEASE_DIR/novel-agent"

# Write build manifest
cat > "$DIST_DIR/MANIFEST.txt" << EOF
# Moyan Build Manifest
version: $MOYAN_VERSION
built_at: $(date '+%Y-%m-%d %H:%M:%S')
artifacts: $COUNT
EOF
COUNT=$((COUNT + 1))

echo
echo "=== Collect Summary ==="
echo "Total entries: $COUNT"
echo "Output:        $DIST_DIR"
echo
ls -la "$DIST_DIR"
