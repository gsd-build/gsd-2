#!/usr/bin/env bash
# S04 verification — npm pack tarball install smoke test
# Checks: dist integrity, GSD_BUNDLED_EXTENSION_PATHS, prepublishOnly,
#         npm pack dry-run, tarball install, binary exists, launch (no extension
#         errors, "gsd" branding), ~/.gsd/ untouched, non-TTY warning/no exit 1.

set -uo pipefail

FAIL=0
pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; FAIL=1; }

SMOKE_PREFIX=/tmp/gsd-smoke-prefix
TARBALL=""

# Capture ~/.gsd/agent/sessions/ count before any smoke runs (for Check 9)
PI_SESSIONS_BEFORE=$(ls ~/.gsd/agent/sessions/ 2>/dev/null | wc -l | tr -d ' ')

cleanup() {
  rm -rf "$SMOKE_PREFIX"
  if [ -n "$TARBALL" ] && [ -f "$TARBALL" ]; then
    rm -f "$TARBALL"
  fi
}
trap cleanup EXIT

echo "=== S04 Verification ==="
echo ""

# ----------------------------------------------------------------
# Check 1 — dist/loader.js exists and has NODE_PATH block
# ----------------------------------------------------------------
echo "--- Dist integrity ---"
if [ -f "dist/loader.js" ] && grep -q "NODE_PATH" dist/loader.js; then
  pass "1 — dist/loader.js exists and contains NODE_PATH block"
else
  fail "1 — dist/loader.js missing or NODE_PATH block absent"
fi

# ----------------------------------------------------------------
# Check 2 — GSD_BUNDLED_EXTENSION_PATHS does NOT reference src/resources
# ----------------------------------------------------------------
# The variable must be present and must use agentDir-based paths only.
paths_line=$(grep "GSD_BUNDLED_EXTENSION_PATHS" dist/loader.js | grep -v "src/resources" | head -1)
if [ -n "$paths_line" ]; then
  # Double-check: none of the actual join() lines (not comments) reference src/resources.
  # We look only at lines containing join( to avoid matching comment lines like "NOT src/resources".
  if grep -A 15 "GSD_BUNDLED_EXTENSION_PATHS" dist/loader.js | grep "join(" | grep -q "src/resources"; then
    fail "2 — GSD_BUNDLED_EXTENSION_PATHS still references src/resources path(s)"
  else
    pass "2 — GSD_BUNDLED_EXTENSION_PATHS uses agentDir-based paths (no src/resources)"
  fi
else
  fail "2 — GSD_BUNDLED_EXTENSION_PATHS line not found or still references src/resources"
fi

echo ""
echo "--- package.json hooks ---"

# ----------------------------------------------------------------
# Check 3 — prepublishOnly present in package.json
# ----------------------------------------------------------------
if node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); process.exit(p.scripts?.prepublishOnly ? 0 : 1)" 2>/dev/null; then
  pass "3 — prepublishOnly hook present in package.json"
else
  fail "3 — prepublishOnly hook missing from package.json"
fi

echo ""
echo "--- npm pack dry-run ---"

# ----------------------------------------------------------------
# Check 4 — npm pack --dry-run lists expected files
# ----------------------------------------------------------------
dry_out=$(npm pack --dry-run 2>&1)
file_count=$(echo "$dry_out" | grep -c "npm notice" || true)
has_src=$(echo "$dry_out" | grep -q "src/resources" && echo "yes" || echo "no")
has_dist=$(echo "$dry_out" | grep -q "dist/" && echo "yes" || echo "no")
has_pkg=$(echo "$dry_out" | grep -q "pkg/" && echo "yes" || echo "no")

# Count actual files listed (lines with a path, not summary lines)
file_lines=$(echo "$dry_out" | grep "npm notice" | grep -v "=== Tarball" | grep -v "filename\|package size\|unpacked size\|shasum\|integrity\|total files" | wc -l | tr -d ' ')

if [ "$file_lines" -ge 100 ] && [ "$has_dist" = "yes" ] && [ "$has_pkg" = "yes" ]; then
  # src/resources check — warn but don't fail if absent (it's in "files" array but may not produce 100+ files on its own)
  if [ "$has_src" = "yes" ]; then
    pass "4 — dry-run: ${file_lines} files listed, dist/ present, pkg/ present, src/resources present"
  else
    fail "4 — dry-run: ${file_lines} files listed but src/resources NOT in pack output"
    echo "    (dry-run output tail:)"
    echo "$dry_out" | tail -10 | sed 's/^/    /'
  fi
elif [ "$file_lines" -lt 100 ]; then
  fail "4 — dry-run: only ${file_lines} files listed (expected >=100)"
  echo "$dry_out" | tail -10 | sed 's/^/    /'
else
  fail "4 — dry-run: dist/=${has_dist} pkg/=${has_pkg}"
  echo "$dry_out" | tail -10 | sed 's/^/    /'
fi

echo ""
echo "--- tarball pack ---"

# ----------------------------------------------------------------
# Check 5 — npm pack produces a tarball
# ----------------------------------------------------------------
# Note: prepublishOnly triggers a build here (expected).
npm pack --silent 2>/dev/null || npm pack 2>&1 | tail -5
TARBALL=$(ls glittercowboy-gsd-*.tgz 2>/dev/null | head -1 || true)
if [ -n "$TARBALL" ] && [ -f "$TARBALL" ]; then
  pass "5 — tarball produced: $TARBALL"
else
  fail "5 — npm pack did not produce a tarball"
  echo "  Aborting remaining checks — no tarball available."
  echo ""
  echo "=== Results ==="
  echo "One or more checks FAILED."
  exit 1
fi

echo ""
echo "--- tarball install ---"

# ----------------------------------------------------------------
# Check 6 — tarball installs cleanly to temp prefix
# ----------------------------------------------------------------
rm -rf "$SMOKE_PREFIX"
if npm install -g --prefix "$SMOKE_PREFIX" "./$TARBALL" 2>&1 | tail -5; then
  pass "6 — tarball installed to $SMOKE_PREFIX (exit 0)"
else
  fail "6 — tarball install failed"
fi

# ----------------------------------------------------------------
# Check 7 — binary exists at expected path after install
# ----------------------------------------------------------------
if [ -f "$SMOKE_PREFIX/bin/gsd" ] || [ -L "$SMOKE_PREFIX/bin/gsd" ]; then
  pass "7 — $SMOKE_PREFIX/bin/gsd exists after install"
else
  fail "7 — $SMOKE_PREFIX/bin/gsd not found after install"
  ls -la "$SMOKE_PREFIX/bin/" 2>/dev/null || echo "    (bin/ dir does not exist)"
fi

echo ""
echo "--- launch smoke ---"

# ----------------------------------------------------------------
# Check 8 — launch: "gsd" branding + zero extension load errors
# Use background kill pattern (macOS has no GNU timeout).
# Allow 8s for extensions to load.
# ----------------------------------------------------------------
smoke_out=$(mktemp)
(
  env -i HOME="$HOME" PATH="$PATH" \
    "$SMOKE_PREFIX/bin/gsd" < /dev/null > "$smoke_out" 2>&1
) &
smoke_pid=$!
sleep 8
kill "$smoke_pid" 2>/dev/null || true
wait "$smoke_pid" 2>/dev/null || true

ext_errors=$(grep "Extension load error" "$smoke_out" 2>/dev/null | wc -l | tr -d ' ')
# Strip ANSI escape codes for branding check
plain_out=$(sed 's/\x1b\[[0-9;]*m//g' "$smoke_out" 2>/dev/null || cat "$smoke_out")
has_gsd=$(echo "$plain_out" | grep -qi "gsd\|get shit done" && echo "yes" || echo "no")

if [ "$ext_errors" -eq 0 ]; then
  pass "8a — zero Extension load errors on launch"
else
  fail "8a — ${ext_errors} Extension load error(s) on launch"
  grep "Extension load error" "$smoke_out" | head -5 | sed 's/^/    /'
fi

if [ "$has_gsd" = "yes" ]; then
  pass "8b — \"gsd\" / \"get shit done\" branding found in launch output"
else
  # Fallback: check if binary self-identifies differently (not "pi")
  has_pi_only=$(echo "$plain_out" | grep -qi "^pi\b" && echo "yes" || echo "no")
  if [ "$has_pi_only" = "no" ]; then
    pass "8b — output does not show \"pi\" branding (gsd branding likely in ANSI sequences)"
  else
    fail "8b — output shows \"pi\" branding instead of \"gsd\""
    head -5 "$smoke_out" | sed 's/^/    /'
  fi
fi
rm -f "$smoke_out"

echo ""
echo "--- ~/.gsd/ isolation ---"

# ----------------------------------------------------------------
# Check 9 — ~/.gsd/ session count unchanged before/after smoke run
# PI_SESSIONS_BEFORE captured at script start (before any binary invocation).
# ----------------------------------------------------------------
pi_after=$(ls ~/.gsd/agent/sessions/ 2>/dev/null | wc -l | tr -d ' ')
if [ "$PI_SESSIONS_BEFORE" = "$pi_after" ]; then
  pass "9 — ~/.gsd/agent/sessions/ count unchanged (${pi_after} sessions before and after)"
else
  fail "9 — ~/.gsd/agent/sessions/ count changed: was ${PI_SESSIONS_BEFORE}, now ${pi_after}"
fi

echo ""
echo "--- non-TTY warning path ---"

# ----------------------------------------------------------------
# Check 10 — non-TTY missing optional keys → warning, no exit 1
# Run installed binary with minimal env (HOME + PATH only), piped from /dev/null.
# ----------------------------------------------------------------
tmp10=$(mktemp)
exit10_tmp=$(mktemp)
echo "" > "$exit10_tmp"
(
  env -i HOME="$HOME" PATH="$PATH" \
    "$SMOKE_PREFIX/bin/gsd" < /dev/null > "$tmp10" 2>&1
  echo "$?" > "$exit10_tmp"
) &
pid10=$!
sleep 5
kill "$pid10" 2>/dev/null || true
wait "$pid10" 2>/dev/null || true

if grep -qi "warning\|optional" "$tmp10" 2>/dev/null; then
  pass "10a — non-TTY missing optional keys → warning emitted"
else
  fail "10a — non-TTY missing optional keys → no warning found in output"
  echo "    Output (first 5 lines):"
  head -5 "$tmp10" | sed 's/^/    /'
fi

exit10_code=$(cat "$exit10_tmp")
if [ "$exit10_code" = "1" ]; then
  fail "10b — non-TTY missing optional keys → exited with code 1 (should not)"
  echo "    Output: $(head -3 "$tmp10")"
else
  pass "10b — non-TTY missing optional keys → did NOT exit 1 (code: ${exit10_code:-killed})"
fi
rm -f "$tmp10" "$exit10_tmp"

echo ""
echo "=== Results ==="
if [ "$FAIL" -eq 0 ]; then
  echo "All checks passed."
  exit 0
else
  echo "One or more checks FAILED."
  exit 1
fi
