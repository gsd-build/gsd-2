#!/usr/bin/env bash
# S03 verification — first-run optional tool key wizard

FAIL=0
pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; FAIL=1; }

# Run node with a timeout using background kill (macOS has no GNU timeout)
run_bg() {
  local secs="$1"; shift
  local tmp; tmp=$(mktemp)
  local exit_tmp; exit_tmp=$(mktemp)
  echo "" > "$exit_tmp"
  ( "$@" > "$tmp" 2>&1; echo "$?" > "$exit_tmp" ) &
  local pid=$!
  sleep "$secs"
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  local code; code=$(cat "$exit_tmp")
  cat "$tmp"
  rm -f "$tmp" "$exit_tmp"
  # Return the actual exit code if the process finished, else 0 (still running = ok)
  [ -n "$code" ] && return "$code" || return 0
}

echo "=== S03 Verification ==="
echo ""

# ----------------------------------------------------------------
# Check 1 — Build: dist outputs exist
# ----------------------------------------------------------------
echo "--- Build ---"
if [ -f "dist/onboarding/wizard.js" ] && [ -f "dist/cli/cli.js" ] && [ -f "dist/loader.js" ]; then
  pass "1 — dist/onboarding/wizard.js, dist/cli/cli.js, dist/loader.js exist"
else
  echo "  (building...)"
  npm run build --silent 2>&1
  if [ -f "dist/onboarding/wizard.js" ] && [ -f "dist/cli/cli.js" ] && [ -f "dist/loader.js" ]; then
    pass "1 — build succeeded"
  else
    fail "1 — build failed or dist files missing"
  fi
fi

echo ""
echo "--- Non-TTY optional-key warning path ---"

# ----------------------------------------------------------------
# Check 2 — Non-TTY with all optional keys unset → warning on stderr, no exit 1
# Uses a clean env with only ANTHROPIC_API_KEY set so the TUI can start,
# then kills after 3s. The warning is emitted before the TUI launches.
# ----------------------------------------------------------------
tmp2=$(mktemp)
(
  env -i HOME="$HOME" PATH="$PATH" ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
    node dist/loader.js < /dev/null > "$tmp2" 2>&1
  echo "$?" >> "$tmp2"
) &
pid2=$!
sleep 3
kill "$pid2" 2>/dev/null || true
wait "$pid2" 2>/dev/null || true

if grep -q "Warning.*optional" "$tmp2" 2>/dev/null; then
  pass "2 — Non-TTY missing optional keys → stderr warning emitted"
else
  fail "2 — Non-TTY missing optional keys → stderr warning emitted"
  echo "    Output: $(head -3 "$tmp2")"
fi

# Check it does NOT exit 1 for missing optional keys (last line if process exited)
last_line=$(tail -1 "$tmp2")
if [ "$last_line" = "1" ]; then
  fail "3 — Non-TTY missing optional keys → does NOT exit 1 (got exit 1)"
else
  pass "3 — Non-TTY missing optional keys → does NOT exit 1"
fi
rm -f "$tmp2"

echo ""
echo "--- Wizard skip when all keys present ---"

# ----------------------------------------------------------------
# Check 4 — All optional keys in env → wizard does not fire (no prompt text)
# ----------------------------------------------------------------
tmp4=$(mktemp)
(
  env -i HOME="$HOME" PATH="$PATH" \
    ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
    BRAVE_API_KEY="test-brave" \
    BRAVE_ANSWERS_KEY="test-answers" \
    CONTEXT7_API_KEY="test-ctx7" \
    JINA_API_KEY="test-jina" \
    node dist/loader.js < /dev/null > "$tmp4" 2>&1
) &
pid4=$!
sleep 3
kill "$pid4" 2>/dev/null || true
wait "$pid4" 2>/dev/null || true

if grep -qiE "optional tool|Some optional|Press Enter to skip" "$tmp4" 2>/dev/null; then
  fail "4 — All optional keys in env → wizard does not fire"
  echo "    Output contained wizard text: $(grep -iE 'optional|Press Enter' "$tmp4" | head -2)"
else
  pass "4 — All optional keys in env → wizard does not fire"
fi
rm -f "$tmp4"

echo ""
echo "--- loadStoredEnvKeys hydration ---"

# ----------------------------------------------------------------
# Check 5 — Structural: env var names compiled into dist/onboarding/wizard.js
# ----------------------------------------------------------------
if grep -q "BRAVE_API_KEY" dist/onboarding/wizard.js && grep -q "BRAVE_ANSWERS_KEY" dist/onboarding/wizard.js && grep -q "CONTEXT7_API_KEY" dist/onboarding/wizard.js && grep -q "JINA_API_KEY" dist/onboarding/wizard.js; then
  pass "5 — dist/onboarding/wizard.js contains all four optional key env var names"
else
  fail "5 — dist/onboarding/wizard.js missing one or more optional key env var names"
fi

# ----------------------------------------------------------------
# Check 6 — loadStoredEnvKeys: stored brave key is set into process.env
# Write a test auth.json with a brave key, run loader, confirm no crash
# ----------------------------------------------------------------
tmp_auth=$(mktemp)
cat > "$tmp_auth" <<'EOF'
{"brave":{"type":"api_key","key":"test-brave-stored"}}
EOF

tmp6=$(mktemp)
(
  env -i HOME="$HOME" PATH="$PATH" \
    ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
    GSD_TEST_AUTH_PATH="$tmp_auth" \
    node -e "
      import('./dist/app/app-paths.js').then(async (paths) => {
        // Override authFilePath for test
        const { AuthStorage } = await import('@mariozechner/pi-coding-agent');
        const { loadStoredEnvKeys } = await import('./dist/onboarding/wizard.js');
        const auth = AuthStorage.create('$tmp_auth');
        loadStoredEnvKeys(auth);
        const val = process.env.BRAVE_API_KEY;
        process.stdout.write('BRAVE_API_KEY=' + (val || '') + '\n');
        process.exit(0);
      });
    " > "$tmp6" 2>&1
) || true

if grep -q "BRAVE_API_KEY=test-brave-stored" "$tmp6" 2>/dev/null; then
  pass "6 — loadStoredEnvKeys hydrates BRAVE_API_KEY from auth.json"
else
  fail "6 — loadStoredEnvKeys hydrates BRAVE_API_KEY from auth.json"
  echo "    Output: $(cat "$tmp6")"
fi
rm -f "$tmp_auth" "$tmp6"

echo ""
echo "=== Results ==="
if [ "$FAIL" -eq 0 ]; then
  echo "All checks passed."
  exit 0
else
  echo "One or more checks FAILED."
  exit 1
fi
