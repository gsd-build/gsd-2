#!/usr/bin/env bash
# validate-pack.sh — Verify the npm tarball is installable before publishing.
#
# Usage: npm run validate-pack (or bash scripts/validate-pack.sh)
# Exit 0 = safe to publish, Exit 1 = broken package.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

# --- Guard: workspace packages must not have @gsd/* cross-deps ---
echo "==> Checking workspace packages for @gsd/* cross-deps..."
CROSS_FAILED=0
for ws_pkg in native pi-agent-core pi-ai pi-coding-agent pi-tui; do
  RESULT=$(node -e "
    const pkg = require('./packages/${ws_pkg}/package.json');
    const deps = Object.keys(pkg.dependencies || {}).filter(d => d.startsWith('@gsd/'));
    if (deps.length) { console.log(deps.join(', ')); process.exit(1); }
  " 2>&1) || {
    echo "    LEAKED in ${ws_pkg}: $RESULT"
    CROSS_FAILED=1
    true
  }
done
if [ "$CROSS_FAILED" = "1" ]; then
  echo "ERROR: Workspace packages have @gsd/* cross-dependencies."
  echo "    These cause 404s when npm resolves them from the registry."
  exit 1
fi
echo "    No @gsd/* cross-dependencies."

# --- Pack and verify contents ---
echo "==> Packing tarball..."
TARBALL_NAME=$(npm pack --ignore-scripts 2>/dev/null | tail -1)
TARBALL="$ROOT/$TARBALL_NAME"

if [ ! -f "$TARBALL" ]; then
  echo "ERROR: npm pack produced no tarball"
  exit 1
fi

INSTALL_DIR=$(mktemp -d)
trap 'rm -rf "$INSTALL_DIR" "$TARBALL"' EXIT

echo "==> Tarball: $TARBALL_NAME ($(du -h "$TARBALL" | cut -f1) compressed)"

# Verify dist/loader.js is present (sanity check)
if tar tzf "$TARBALL" 2>/dev/null | grep -q "dist/loader.js"; then
  echo "    dist/loader.js present."
else
  echo "ERROR: dist/loader.js missing from tarball."
  echo "    Tarball contents (first 20 files):"
  tar tzf "$TARBALL" | head -20
  exit 1
fi

# --- Install test — the definitive proof ---
echo "==> Testing install in isolated directory..."
cd "$INSTALL_DIR"
npm init -y > /dev/null 2>&1

if npm install "$TARBALL" 2>&1; then
  echo "==> Install succeeded."
else
  echo ""
  echo "ERROR: npm install of tarball failed."
  exit 1
fi

echo ""
echo "Package is installable. Safe to publish."
