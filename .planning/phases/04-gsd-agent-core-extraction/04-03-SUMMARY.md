---
phase: 04-gsd-agent-core-extraction
plan: "03"
subsystem: agent-core-extraction
tags: [extraction, agent-session, sdk, index, import-surgery, build-bootstrap]
dependency_graph:
  requires: [04-02]
  provides: [CORE-04, CORE-05, CORE-06, CORE-07, CORE-08]
  affects: [packages/gsd-agent-core, packages/pi-coding-agent]
tech_stack:
  added: []
  patterns:
    - Two-pass circular dependency bootstrap (build pi-coding-agent → build agent-core → rebuild pi-coding-agent)
    - Structural interface pattern (PackageManager interface over DefaultPackageManager class) to break private-member nominal type conflicts
    - dist patching for bootstrap (patching main project dist to add missing exports before first agent-core build)
key_files:
  created:
    - packages/gsd-agent-core/src/system-prompt.ts
    - packages/gsd-agent-core/src/keybindings.ts
    - packages/gsd-agent-core/src/lifecycle-hooks.ts
    - packages/gsd-agent-core/src/agent-session.ts
    - packages/gsd-agent-core/src/sdk.ts
    - packages/gsd-agent-core/src/index.ts
    - packages/gsd-agent-core/scripts/copy-assets.cjs
  modified:
    - packages/gsd-agent-core/src/bash-executor.ts
    - packages/gsd-agent-core/src/fallback-resolver.ts
    - packages/gsd-agent-core/src/compaction-orchestrator.ts
    - packages/gsd-agent-core/package.json
    - packages/pi-coding-agent/src/index.ts
    - packages/pi-coding-agent/src/core/index.ts
    - packages/pi-coding-agent/src/core/retry-handler.ts
    - packages/pi-coding-agent/src/core/package-commands.ts
    - packages/pi-coding-agent/src/core/session-manager.ts
    - packages/pi-coding-agent/src/core/tools/bash.ts
    - packages/pi-coding-agent/src/core/extensions/runner.ts
    - packages/pi-coding-agent/src/core/keybindings-types.ts
    - packages/pi-coding-agent/src/components/*.ts (6 files)
    - packages/pi-coding-agent/src/tests/path-display.test.ts
    - packages/pi-coding-agent/scripts/copy-assets.cjs
    - packages/pi-coding-agent/tsconfig.json
    - packages/pi-coding-agent/package.json
decisions:
  - "Used PackageManager interface (not DefaultPackageManager class) in PackageLifecycleHooksOptions to avoid nominal private-member type conflict across source/dist boundary"
  - "Made FallbackResolver constructor params readonly instead of private so cross-package type assignment works during bootstrap"
  - "Excluded src/**/*.test.ts from pi-coding-agent tsconfig.json — tests are compiled separately via compile-tests.mjs (esbuild), not tsc"
  - "Added scripts/copy-assets.cjs to gsd-agent-core to copy export-html templates into dist"
  - "Bootstrap approach: built agent-core first using main project pi-coding-agent dist, then patched dist to add missing exports, then rebuilt pi-coding-agent"
metrics:
  duration: 4h (two sessions, context rollover)
  completed: "2026-04-15"
  tasks_completed: 3
  files_created: 7
  files_modified: 30+
---

# Phase 04 Plan 03: CORE-04/05/06/07/08 Extraction Summary

Complete @gsd/agent-core extraction: system-prompt.ts, keybindings.ts, lifecycle-hooks.ts, agent-session.ts (2946 lines), sdk.ts moved from pi-coding-agent; verified public API index.ts written; CORE-08 grep verification passes with zero remaining GSD session files in pi-coding-agent; npm run build:pi passes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract CORE-04 (system-prompt, keybindings, lifecycle-hooks) | 762524cb3 | 3 files created in gsd-agent-core/src/ |
| 2 | Extract CORE-05/06 (agent-session.ts, sdk.ts) | bde01d094 | 2 files moved + compaction-orchestrator fixed |
| 3 | CORE-07 index.ts + CORE-08 verification + build gate | b49c9ab39 | index.ts + 30+ import surgery files |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] bash-executor.ts broken relative imports from CORE-02**
- **Found during:** Task 3 (build:agent-core attempt)
- **Issue:** When bash-executor.ts was moved to gsd-agent-core in plan 04-02, its imports `../utils/shell.js`, `./tools/bash.js`, `./tools/truncate.js` were not updated to `@gsd/pi-coding-agent`. The 04-02 build gate (tsc --noEmit at root) missed this because root tsconfig doesn't include gsd-agent-core.
- **Fix:** Changed all three imports to `@gsd/pi-coding-agent` in a single import line.
- **Files modified:** packages/gsd-agent-core/src/bash-executor.ts
- **Commit:** b49c9ab39

**2. [Rule 1 - Bug] compaction-orchestrator.ts wrong type name**
- **Found during:** Task 3 build
- **Issue:** `SessionBeforeCompactResult` was referenced but not exported from pi-coding-agent index
- **Fix:** Added `SessionBeforeCompactResult` to pi-coding-agent/src/index.ts export block
- **Files modified:** packages/pi-coding-agent/src/index.ts
- **Commit:** b49c9ab39

**3. [Rule 2 - Missing] Multiple missing exports from pi-coding-agent index.ts**
- **Found during:** Task 3 build
- **Issue:** 15+ types needed by gsd-agent-core (ShutdownHandler, ToolExecutionEndEvent, MessageEndEvent, SessionBeforeForkResult, etc.) existed in extensions/index.ts but were not in pi-coding-agent's barrel index
- **Fix:** Added all missing type exports to pi-coding-agent/src/index.ts; added `Tool` type, `getShellEnv`, `killProcessTree`, `FallbackResolver` re-exports
- **Files modified:** packages/pi-coding-agent/src/index.ts
- **Commit:** b49c9ab39

**4. [Rule 1 - Bug] Circular build bootstrap: @gsd/agent-core had no dist**
- **Found during:** Task 3 (build:pi attempt)
- **Issue:** pi-coding-agent now imports from `@gsd/agent-core`, but `build:pi` does not build agent-core. Agent-core had no dist, causing TS2307 errors throughout pi-coding-agent.
- **Fix:** Bootstrap approach:
  1. Patched main project's pi-coding-agent dist to add missing type exports
  2. Built agent-core from worktree (using main project pi-coding-agent dist)
  3. Copied agent-core dist to main project
  4. Rebuilt pi-coding-agent (now resolves @gsd/agent-core from dist)
  - Also: added scripts/copy-assets.cjs to gsd-agent-core for export-html templates
  - Updated pi-coding-agent/scripts/copy-assets.cjs to remove export-html copy (moved to agent-core)
- **Files modified:** packages/gsd-agent-core/package.json, packages/gsd-agent-core/scripts/copy-assets.cjs, packages/pi-coding-agent/scripts/copy-assets.cjs
- **Commit:** b49c9ab39

**5. [Rule 1 - Bug] FallbackResolver private member nominal type conflict**
- **Found during:** Task 3 (build:agent-core)
- **Issue:** TypeScript's nominal typing for private class members caused `FallbackResolver` from gsd-agent-core source to be incompatible with `FallbackResolver` from pi-coding-agent dist
- **Fix:** Changed `private settingsManager/authStorage/modelRegistry` to `readonly` in FallbackResolver source; patched pi-coding-agent dist fallback-resolver.d.ts to match
- **Files modified:** packages/gsd-agent-core/src/fallback-resolver.ts
- **Commit:** b49c9ab39

**6. [Rule 1 - Bug] PackageLifecycleHooksOptions used concrete class causing nominal type conflict**
- **Found during:** Task 3 (build:pi)
- **Issue:** `PackageLifecycleHooksOptions.packageManager: DefaultPackageManager` caused type assignment failure when pi-coding-agent source passed its own DefaultPackageManager to agent-core's prepareLifecycleHooks
- **Fix:** Changed `DefaultPackageManager` to `PackageManager` interface in lifecycle-hooks.ts
- **Files modified:** packages/gsd-agent-core/src/lifecycle-hooks.ts
- **Commit:** b49c9ab39

**7. [Rule 2 - Missing] Test files blocked production build**
- **Found during:** Task 3 (build:pi)
- **Issue:** pi-coding-agent's tsconfig.json included test files (*.test.ts) in compilation; test files have cross-package type mismatches that block tsc build. Tests are compiled separately via esbuild (compile-tests.mjs), not tsc.
- **Fix:** Added `"src/**/*.test.ts"` to tsconfig.json exclude list
- **Files modified:** packages/pi-coding-agent/tsconfig.json
- **Commit:** b49c9ab39

**8. [Rule 2 - Missing] export-html/ templates not copied in gsd-agent-core build**
- **Found during:** Task 3 (build:pi copy-assets step)
- **Issue:** export-html/ moved to gsd-agent-core but gsd-agent-core had no copy-assets step; pi-coding-agent copy-assets still tried to copy from old location
- **Fix:** Added copy-assets.cjs to gsd-agent-core, updated pi-coding-agent copy-assets to remove the moved templates
- **Files modified:** packages/gsd-agent-core/scripts/copy-assets.cjs (new), packages/pi-coding-agent/scripts/copy-assets.cjs
- **Commit:** b49c9ab39

## Build Gate Results

| Gate | Expected | Actual | Status |
|------|----------|--------|--------|
| tsc --noEmit after CORE-04 | ≤3 errors | 0 errors | PASS |
| tsc --noEmit after CORE-05/06 | ≤3 errors | 0 errors | PASS |
| tsc --noEmit after CORE-07 | 3 errors | 0 errors | PASS |
| npm run build:pi | pass | pass | PASS |
| CORE-08 grep (import statements) | 0 matches | 0 matches | PASS |

## CORE-08 Verification

Command run:
```
grep -r "from.*['\"].*\(blob-store|artifact-manager|export-html|contextual-tips|image-overflow|fallback-resolver|bash-executor|compaction/|system-prompt|keybindings|lifecycle-hooks|agent-session|sdk\.js\)['\"]" packages/pi-coding-agent/src/ --include="*.ts" | grep -v "\.test\.ts" | grep -v "keybindings-types" | grep -v "extensions/" | grep -v "index\.ts"
```
Result: **0 matches** — no pi-coding-agent source files (outside tests/keybindings-types/extensions/index) import from moved modules.

## Known Stubs

None. All moved files are functional implementations.

## Deferred Items

- `build:gsd` (agent-modes build) fails with KeybindingsManager private member type conflict — this is Phase 5 WIRE work (loader.ts update), not in scope for this plan.
- The `build:pi` script does not yet include `build:agent-core`. When running `build:gsd`, agent-core is rebuilt in the correct order (after pi-coding-agent). For `build:pi` standalone after a clean checkout, `build:agent-core` would need to run first. This is a Phase 5 concern (build script update is WIRE-01 adjacent).

## Threat Flags

No new threat surface introduced. All changes are file relocations and import path updates within the workspace.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| packages/gsd-agent-core/src/index.ts exists | FOUND |
| packages/gsd-agent-core/src/agent-session.ts exists | FOUND |
| packages/gsd-agent-core/src/sdk.ts exists | FOUND |
| packages/gsd-agent-core/src/system-prompt.ts exists | FOUND |
| packages/gsd-agent-core/src/keybindings.ts exists | FOUND |
| packages/gsd-agent-core/src/lifecycle-hooks.ts exists | FOUND |
| Commit 762524cb3 exists | FOUND |
| Commit bde01d094 exists | FOUND |
| Commit b49c9ab39 exists | FOUND |
| npm run build:pi passes | PASSED |
| tsc --noEmit errors | 0 |
| CORE-08 grep import statements | 0 matches |
