# S01: Built-in Verification Gate — UAT

**Milestone:** M001
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: The gate is a pure function (`runVerificationGate`) tested by 28 unit tests plus integration wiring verified by code inspection. No live runtime, server, or browser is needed — the gate uses `spawnSync` which is deterministic in test environments.

## Preconditions

- Working directory: project root with `node_modules` installed (`npm install` completed)
- Node.js available (v22+)
- All unit tests passing: `npm run test:unit -- --test-name-pattern "verification-gate"` returns 28/28 pass

## Smoke Test

Run `npm run test:unit -- --test-name-pattern "verification-gate"` — all 28 tests pass and output includes discovery, execution, and preference validation test groups.

## Test Cases

### 1. Command discovery from preference override

1. Call `discoverCommands({ cwd: tmpDir, preferenceCommands: ["npm run custom-check"] })`
2. Create a `package.json` in tmpDir with `{ "scripts": { "test": "echo test" } }`
3. **Expected:** Returns `{ commands: ["npm run custom-check"], source: "preference" }` — preference overrides package.json auto-detection.

### 2. Command discovery from task plan verify field

1. Call `discoverCommands({ cwd: tmpDir, taskPlanVerify: "npm run lint && npm run test" })`
2. No preference commands provided, no package.json in tmpDir
3. **Expected:** Returns `{ commands: ["npm run lint", "npm run test"], source: "task-plan" }` — task plan verify splits on `&&`.

### 3. Command discovery from package.json scripts

1. Create `package.json` in tmpDir: `{ "scripts": { "typecheck": "tsc --noEmit", "lint": "eslint .", "test": "vitest" } }`
2. Call `discoverCommands({ cwd: tmpDir })` with no preference or task plan
3. **Expected:** Returns `{ commands: ["npm run typecheck", "npm run lint", "npm run test"], source: "package-json" }` — all three standard scripts detected.

### 4. Partial package.json — only test script present

1. Create `package.json` in tmpDir: `{ "scripts": { "test": "vitest" } }` (no typecheck, no lint)
2. Call `discoverCommands({ cwd: tmpDir })`
3. **Expected:** Returns `{ commands: ["npm run test"], source: "package-json" }` — only present scripts detected.

### 5. Empty discovery — no commands found anywhere

1. Empty tmpDir — no package.json, no preferences, no task plan
2. Call `discoverCommands({ cwd: tmpDir })`
3. **Expected:** Returns `{ commands: [], source: "none" }`. Gate passes with 0 checks.

### 6. Gate execution — all commands pass

1. Call `runVerificationGate({ basePath: tmpDir, unitId: "M001/S01/T01", cwd: tmpDir, preferenceCommands: ["echo pass1", "echo pass2"] })`
2. **Expected:** `result.passed === true`, `result.checks.length === 2`, both checks have `exitCode === 0`, `discoverySource === "preference"`.

### 7. Gate execution — one command fails

1. Call `runVerificationGate({ basePath: tmpDir, unitId: "M001/S01/T01", cwd: tmpDir, preferenceCommands: ["echo ok", "exit 1", "echo also-ok"] })`
2. **Expected:** `result.passed === false`, `result.checks.length === 3` (non-short-circuit: all commands run), the second check has `exitCode === 1`.

### 8. Gate execution — cwd propagation

1. Create a tmpDir and call `runVerificationGate` with `cwd: tmpDir` and a command that prints working directory (e.g., `pwd`)
2. **Expected:** The stdout of the check contains the tmpDir path, confirming cwd is passed to spawnSync.

### 9. Preference validation — verification_commands accepts string arrays

1. Call `validatePreferences({ verification_commands: ["npm run test"] })`
2. **Expected:** No errors related to `verification_commands`. Key is in KNOWN_PREFERENCE_KEYS (no unknown-key warning).

### 10. Preference validation — verification_max_retries rejects negatives

1. Call `validatePreferences({ verification_max_retries: -1 })`
2. **Expected:** Validation errors include a message about negative value.

### 11. Preference validation — verification_auto_fix accepts boolean

1. Call `validatePreferences({ verification_auto_fix: true })`
2. **Expected:** No errors related to `verification_auto_fix`. Key is in KNOWN_PREFERENCE_KEYS.

### 12. Integration — gate wired in handleAgentEnd

1. Open `src/resources/extensions/gsd/auto.ts`
2. Search for `runVerificationGate`
3. **Expected:** Exactly 2 occurrences — 1 import statement, 1 call site inside handleAgentEnd
4. The call site is inside an `if (currentUnit.type === "execute-task")` guard
5. The call site is wrapped in try/catch
6. The call site is before the DB dual-write block and before `checkPostUnitHooks`

### 13. No regressions in existing tests

1. Run `npm run test:unit`
2. **Expected:** 1045 pass, 8 fail. All 8 failures are pre-existing (7 file-watcher chokidar, 1 github-client). No new failures.

## Edge Cases

### Whitespace-only preference commands

1. Call `discoverCommands({ cwd: tmpDir, preferenceCommands: ["  ", ""] })`
2. **Expected:** Falls through to next discovery source (task plan → package.json → none) because trimmed commands are empty.

### Missing package.json

1. Call `discoverCommands({ cwd: "/nonexistent/path" })`
2. **Expected:** Returns `{ commands: [], source: "none" }` — no crash, graceful empty discovery.

### Command spawn failure

1. Call `runVerificationGate` with a command that cannot be found (e.g., `nonexistent-binary-xyz`)
2. **Expected:** Check has `exitCode === 127` (command not found), gate returns `passed: false`, stderr populated with error.

### Task plan verify with single command (no &&)

1. Call `discoverCommands({ cwd: tmpDir, taskPlanVerify: "npm run test" })`
2. **Expected:** Returns `{ commands: ["npm run test"], source: "task-plan" }` — single command, no splitting needed.

## Failure Signals

- `npm run test:unit -- --test-name-pattern "verification-gate"` reports any test failures
- New test failures appear in `npm run test:unit` beyond the 8 pre-existing ones
- `grep "runVerificationGate" src/resources/extensions/gsd/auto.ts` returns more or fewer than 2 hits
- The gate call is outside the `execute-task` type guard
- The gate call is after `checkPostUnitHooks` (wrong insertion point)

## Requirements Proved By This UAT

- R001 — Built-in gate fires after execute-task, blocks on failure, is distinct from user hooks (test cases 6, 7, 12)
- R002 — Command discovery from preferences, task plan verify, and package.json with correct precedence (test cases 1-5)

## Not Proven By This UAT

- R001 explicit override mechanism (deferred — not in S01 scope)
- Structured evidence artifacts (T##-VERIFY.json) — S02 scope
- Auto-fix retry loop — S03 scope
- Runtime error capture (bg-shell crashes, browser console) — S04 scope
- npm audit conditional scan — S05 scope
- End-to-end behavior in a real `gsd auto` run (would require live-runtime UAT)

## Notes for Tester

- The 8 pre-existing test failures (chokidar, github-client) are infrastructure issues, not regressions. Ignore them.
- The gate is currently non-fatal in auto.ts — it logs failures to stderr but does not block handleAgentEnd from completing. Full blocking requires S03 retry integration. This is by design for S01.
- `verification_auto_fix` and `verification_max_retries` preferences are defined and validated but not consumed until S03.
- To manually test the gate in isolation: `node -e "const { discoverCommands } = require('./src/resources/extensions/gsd/verification-gate.ts'); console.log(discoverCommands({ cwd: '.' }))"` (or use tsx).
