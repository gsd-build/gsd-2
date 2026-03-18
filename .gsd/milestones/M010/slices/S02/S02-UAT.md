# S02: Test Green + Session Picker Dispatch + Final Verification — UAT

**Milestone:** M010
**Written:** 2026-03-18

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All verification is via build exit codes, test pass counts, and contract test assertions. No new runtime UI was built — `/gsd sessions` reuses the existing session browser surface proven in M002.

## Preconditions

- Working directory is the M010 worktree with all 223 upstream commits merged
- `npm install` has been run (node_modules present)
- No stale dist/ artifacts (clean after S01)

## Smoke Test

Run `npm run build && npm run test:unit` — both should exit 0 with 1532 passing unit tests.

## Test Cases

### 1. Zero conflict markers in codebase

1. Run `rg "^<<<<<<<|^>>>>>>>|^=======$" src/ web/ packages/ .github/`
2. **Expected:** Exit code 1 (no matches). Zero conflict markers anywhere in the source tree.

### 2. Both builds pass

1. Run `npm run build`
2. **Expected:** Exit 0, all 5 workspace packages compile.
3. Run `npm run build:web-host`
4. **Expected:** Exit 0, Next.js Turbopack build completes. One pre-existing `@gsd/native` warning is acceptable.

### 3. All unit tests pass

1. Run `node --test --test-timeout 30000 src/tests/ src/resources/extensions/gsd/tests/ packages/pi-coding-agent/src/`
2. **Expected:** 1532 passed, 0 failed, 0 cancelled. With `--test-timeout 30000`, the 7 cleanup-hanging files complete instead of cancelling.
3. Without `--test-timeout`: expect 1532 passed, 0 failed, 7 cancelled. The cancellations are cleanup timeouts, not assertion failures.

### 4. Integration tests at documented baseline

1. Run `npm run test:integration`
2. **Expected:** 38 passed, 3 failed, 1 skipped. The 3 failures are:
   - `web-mode-onboarding.test.ts:509` — onboarding gate detach after wizard
   - `web-mode-runtime.test.ts:492` — `/new` success notice in chat-mode
   - `e2e-smoke.test.ts:321` — no-TTY hang detection timing
3. Verify no *new* failures beyond these 3.

### 5. Parity contract reflects 22 builtins including edit-mode

1. Run `node --test src/tests/web-command-parity-contract.test.ts`
2. **Expected:** All assertions pass. EXPECTED_BUILTIN_OUTCOMES has 22 entries.
3. Run `rg "edit-mode" src/tests/web-command-parity-contract.test.ts`
4. **Expected:** Shows `edit-mode` in both `EXPECTED_BUILTIN_OUTCOMES` (as `reject`) and `DEFERRED_BROWSER_REJECTS`.

### 6. /gsd sessions dispatches to session browser

1. Run:
   ```bash
   node --experimental-strip-types --import ./src/tests/resolve-ts.mjs -e \
     'import { dispatchBrowserSlashCommand } from "./web/lib/browser-slash-command-dispatch.ts"; console.log(JSON.stringify(dispatchBrowserSlashCommand("/gsd sessions")))'
   ```
2. **Expected:** Output is `{"kind":"surface","surface":"resume","args":""}` — same surface as `/gsd resume`.

### 7. State surfaces contract tests pass

1. Run `node --test src/tests/web-state-surfaces-contract.test.ts`
2. **Expected:** All assertions pass. The dual-terminal test checks `terminal.tsx` (not `dual-terminal.tsx`) for `activeToolExecution`.

## Edge Cases

### edit-mode classified as reject, not rpc

1. In `src/tests/web-command-parity-contract.test.ts`, verify `edit-mode` maps to `"reject"` in `EXPECTED_BUILTIN_OUTCOMES`.
2. **Expected:** `reject` — because `edit-mode` is a TUI-only interactive input mode toggle with no browser equivalent. If mapped to `rpc`, the browser would silently send it to the backend with no visible outcome.

### /gsd sessions with trailing arguments

1. Evaluate `dispatchBrowserSlashCommand("/gsd sessions --filter active")`
2. **Expected:** Returns `{ kind: "surface", surface: "resume", args: "--filter active" }`. Arguments pass through even if the surface doesn't use them.

### Integration test count stability

1. Run `npm run test:integration` twice in succession.
2. **Expected:** Same 38/3/1 split both times. The 3 failures are deterministic (locator/text mismatches), not flaky. The e2e-smoke timeout may occasionally pass if the system is fast enough, shifting to 39/2/1.

## Failure Signals

- `npm run build` or `npm run build:web-host` exits non-zero → TypeScript or bundling regression
- Unit test count drops below 1532 → test file deleted or broken import
- Unit test failures increase above 0 → regression in source code
- Integration failures increase above 3 → new regression beyond pre-existing baseline
- Parity contract fails with "expected 22 builtins" → upstream added another builtin not yet mapped
- `dispatchBrowserSlashCommand("/gsd sessions")` returns `undefined` or `{ kind: "reject" }` → dispatch mapping removed

## Requirements Proved By This UAT

- **R125** — Test cases 1, 2 prove zero conflict markers and both builds green
- **R126** — Test cases 3, 4 prove unit tests pass and integration baseline documented
- **R128** — Test case 6 proves `/gsd sessions` dispatches to session browser surface

## Not Proven By This UAT

- **Live browser `/gsd sessions` experience** — This UAT uses artifact-driven dispatch verification (function call + return value). A human typing `/gsd sessions` in the browser terminal and seeing the session picker open would be the live-runtime proof. The dispatch wiring is proven; the rendering path reuses the M002-proven session browser surface.
- **Integration test full-green** — 3 pre-existing failures remain. A dedicated chat-mode test migration pass is needed to reach 41/41.

## Notes for Tester

- The `--test-timeout 30000` flag on unit tests suppresses cleanup cancellations. Without it, 7 test files show as "cancelled" but all 1532 individual assertions still pass. Both modes are acceptable.
- The `@gsd/native` warning in `npm run build:web-host` output is a pre-existing optional dependency warning — ignore it.
- The e2e-smoke timeout failure (test case 4, third failure) is environment-sensitive. On a fast machine it may pass, shifting the count to 39/2/1. This is acceptable.
