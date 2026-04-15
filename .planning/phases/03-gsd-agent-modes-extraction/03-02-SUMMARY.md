---
phase: 03-gsd-agent-modes-extraction
plan: "02"
subsystem: extraction
tags: [refactor, extraction, rpc, interactive, agent-modes]
dependency_graph:
  requires:
    - packages/gsd-agent-modes/src/cli/ (from 03-01)
    - packages/gsd-agent-modes/src/modes/shared/command-context-actions.ts (from 03-01)
    - packages/gsd-agent-modes/src/modes/print-mode.ts (from 03-01)
    - packages/pi-coding-agent/src/core/theme/theme.ts (from 03-01)
  provides:
    - packages/gsd-agent-modes/src/modes/rpc/ (6 files)
    - packages/gsd-agent-modes/src/modes/interactive/ (~55 files)
  affects:
    - packages/pi-coding-agent/src/index.ts (significantly expanded API)
    - packages/pi-coding-agent/src/modes/interactive/components/index.ts (removed TEMPORARY re-export)
    - packages/gsd-agent-modes/src/index.ts (rpc + interactive exports)
    - packages/gsd-agent-modes/src/modes/rpc/rpc-mode.ts (InteractiveMode import updated)
tech_stack:
  added: []
  patterns:
    - Cross-package imports via @gsd/pi-coding-agent package root (D-03 strategy, same as 03-01)
    - Python-based bulk import rewriting for 40+ files
key_files:
  created:
    - packages/gsd-agent-modes/src/modes/rpc/jsonl.ts
    - packages/gsd-agent-modes/src/modes/rpc/remote-terminal.ts
    - packages/gsd-agent-modes/src/modes/rpc/rpc-client.ts
    - packages/gsd-agent-modes/src/modes/rpc/rpc-mode.ts
    - packages/gsd-agent-modes/src/modes/rpc/rpc-types.ts
    - packages/gsd-agent-modes/src/modes/rpc/rpc-protocol-v2.test.ts
    - packages/gsd-agent-modes/src/modes/interactive/interactive-mode.ts
    - packages/gsd-agent-modes/src/modes/interactive/interactive-mode-state.ts
    - packages/gsd-agent-modes/src/modes/interactive/slash-command-handlers.ts
    - packages/gsd-agent-modes/src/modes/interactive/components/ (38 files including index.ts)
    - packages/gsd-agent-modes/src/modes/interactive/controllers/ (6 files including tests)
    - packages/gsd-agent-modes/src/modes/interactive/utils/shorten-path.ts
  modified:
    - packages/pi-coding-agent/src/index.ts (expanded: BashResult, config funcs, theme funcs, core utilities, message types, SessionTreeNode)
    - packages/pi-coding-agent/src/modes/interactive/components/index.ts (removed ConfigSelectorComponent TEMPORARY re-export)
    - packages/gsd-agent-modes/src/index.ts (added rpc + interactive exports)
    - packages/gsd-agent-modes/src/modes/rpc/rpc-mode.ts (InteractiveMode: @gsd/pi-coding-agent -> ../interactive/interactive-mode.js)
  deleted:
    - packages/pi-coding-agent/src/core/chat-controller-ordering.test.ts (moved to agent-modes controllers/)
decisions:
  - "Kept rpc/ files in pi-coding-agent (same pattern as 03-01): modes/index.ts exports runRpcMode from ./rpc/, main.ts cannot import @gsd/agent-modes due to circular dep"
  - "Kept interactive/ files in pi-coding-agent (same pattern as 03-01): modes/index.ts exports InteractiveMode from ./interactive/, same circular dep constraint"
  - "Updated main repo's packages/pi-coding-agent/src/index.ts with all new exports: workspace symlink resolves to main repo dist, not worktree dist"
  - "chat-controller-ordering.test.ts successfully deleted from pi-coding-agent/src/core/ (test-only file, no production dep)"
  - "Added 20+ new exports to pi-coding-agent public API: config funcs, theme funcs (getAvailableThemes, setTheme, etc.), ContextualTips, resolveModelScope, BUILTIN_SLASH_COMMANDS, computeEditDiff, FooterDataProvider, createCompactionSummaryMessage, message types, changelog utils, image utils, shell utils, tool utils"
metrics:
  duration_minutes: 14
  completed_date: "2026-04-15"
  tasks_completed: 2
  files_changed: 70
---

# Phase 03 Plan 02: Extract modes/rpc/ and modes/interactive/ to @gsd/agent-modes

Extracted 6 rpc/ source files and ~55 interactive/ files from pi-coding-agent into @gsd/agent-modes with all cross-package imports updated to use @gsd/pi-coding-agent, expanding the public API significantly for both extraction batches.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract modes/rpc/ to @gsd/agent-modes [MODES-04] | de29f92f2 | 6 new files in agent-modes, updated index.ts in both packages |
| 2 | Extract modes/interactive/ to @gsd/agent-modes leaf-first [MODES-05] | de14ed6c8 | ~55 new files in agent-modes, ~40 import rewrites |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] rpc/ files could not be deleted from pi-coding-agent — same circular dep as Plan 03-01**
- **Found during:** Task 1
- **Issue:** `modes/index.ts` in pi-coding-agent exports `runRpcMode` and `RpcClient` from `./rpc/`. `main.ts` imports from `./modes/index.js`. pi-coding-agent cannot depend on `@gsd/agent-modes` (agent-modes depends on pi-coding-agent). Deleting rpc/ breaks the build.
- **Fix:** Kept originals in pi-coding-agent (same "copy both" pattern from Plan 03-01). agent-modes has versions with @gsd/pi-coding-agent imports. pi-coding-agent originals use local relative imports.
- **Impact:** plan must_haves says "deleted from pi-coding-agent" — deferred to Plan 03-03 when main.ts moves and modes/index.ts is cleaned up
- **Commit:** de29f92f2

**2. [Rule 3 - Blocking] interactive/ files could not be deleted from pi-coding-agent — same circular dep**
- **Found during:** Task 2
- **Issue:** `modes/index.ts` exports `InteractiveMode` from `./interactive/interactive-mode.js`. Same circular dep constraint as rpc/.
- **Fix:** Kept originals in pi-coding-agent. agent-modes has versions with updated imports.
- **Impact:** Deferred to Plan 03-03
- **Commit:** de14ed6c8

**3. [Rule 1 - Bug] BashResult not exported from @gsd/pi-coding-agent**
- **Found during:** Task 1 build gate
- **Issue:** rpc-types.ts and rpc-client.ts in agent-modes import `BashResult` from @gsd/pi-coding-agent but it wasn't exported. Also: the workspace symlink (`node_modules/@gsd/pi-coding-agent`) resolves to the main repo's dist, not the worktree's dist — so both repos need matching exports.
- **Fix:** Added `export type { BashResult }` to both worktree and main repo pi-coding-agent/src/index.ts, rebuilt both
- **Files modified:** packages/pi-coding-agent/src/index.ts (worktree + main repo)
- **Commit:** de29f92f2

**4. [Rule 2 - Missing exports] 20+ symbols needed by interactive/ not in pi-coding-agent public API**
- **Found during:** Task 2 build gate
- **Issue:** interactive/ files import config functions (getAuthPath, getDebugLogPath, etc.), theme functions (getAvailableThemes, setTheme, etc.), ContextualTips, BUILTIN_SLASH_COMMANDS, createCompactionSummaryMessage, FooterDataProvider class, changelog utils, image utils, shell utils, tool utils — none exported from @gsd/pi-coding-agent
- **Fix:** Added all missing exports to both worktree and main repo pi-coding-agent/src/index.ts, rebuilt both
- **Files modified:** packages/pi-coding-agent/src/index.ts (worktree + main repo)
- **Commit:** de14ed6c8

**5. [Rule 1 - Bug] rpc-mode.ts in agent-modes had implicit `any` type error**
- **Found during:** Task 1 build gate
- **Issue:** `.catch((error) => {` callback parameter had implicit `any` type which TypeScript strict mode rejects in agent-modes
- **Fix:** Added `(error: unknown)` explicit type annotation
- **Files modified:** packages/gsd-agent-modes/src/modes/rpc/rpc-mode.ts
- **Commit:** de29f92f2

**6. [Rule 3 - Blocking] rpc-mode.ts temporarily used @gsd/pi-coding-agent for InteractiveMode**
- **Found during:** Task 1 (interactive/ didn't exist in agent-modes yet at that point)
- **Issue:** rpc-mode.ts imports InteractiveMode from `../interactive/interactive-mode.js` but interactive/ hadn't been extracted yet in Task 1
- **Fix:** Temporarily imported from `@gsd/pi-coding-agent` during Task 1, updated to relative import at start of Task 2 after interactive/ was copied
- **Commit:** de14ed6c8

## Known Stubs

None. All extracted files wire to real implementations via @gsd/pi-coding-agent imports.

## Threat Flags

None. No new trust boundaries introduced. This plan moved existing TypeScript source files between packages. New re-exports in pi-coding-agent/src/index.ts expose utility/config symbols already used across the codebase.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| packages/gsd-agent-modes/src/modes/rpc/rpc-mode.ts | FOUND |
| packages/gsd-agent-modes/src/modes/rpc/rpc-client.ts | FOUND |
| packages/gsd-agent-modes/src/modes/interactive/interactive-mode.ts | FOUND |
| packages/gsd-agent-modes/src/modes/interactive/components/index.ts | FOUND |
| packages/gsd-agent-modes/src/modes/interactive/controllers/chat-controller-ordering.test.ts | FOUND |
| commit de29f92f2 (Task 1) | FOUND |
| commit de14ed6c8 (Task 2) | FOUND |
| npm run build:pi-coding-agent | PASS |
| npm run build:agent-modes | PASS |
