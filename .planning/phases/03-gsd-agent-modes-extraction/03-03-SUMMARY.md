---
phase: 03-gsd-agent-modes-extraction
plan: "03"
subsystem: extraction
tags: [refactor, extraction, main, index, cleanup, modes-08, modes-07]
dependency_graph:
  requires:
    - packages/gsd-agent-modes/src/modes/rpc/ (from 03-02)
    - packages/gsd-agent-modes/src/modes/interactive/ (from 03-02)
    - packages/gsd-agent-modes/src/cli/ (from 03-01)
    - packages/gsd-agent-modes/src/modes/print-mode.ts (from 03-01)
  provides:
    - packages/gsd-agent-modes/src/main.ts (application entry point)
    - packages/gsd-agent-modes/src/index.ts (public API — exactly 7 named exports)
    - packages/pi-coding-agent/src/components/ (UI component extension API, relocated from modes/)
    - packages/pi-coding-agent/src/core/jsonl.ts (JSONL utility, relocated from modes/rpc/)
  affects:
    - packages/pi-coding-agent/src/index.ts (removed modes re-exports, added main.ts exports)
    - packages/pi-coding-agent/src/config.ts (fixed stale getThemesDir path)
    - src/cli.ts (now imports InteractiveMode/runPrintMode/runRpcMode from @gsd/agent-modes)
tech_stack:
  added: []
  patterns:
    - Cross-package imports via @gsd/pi-coding-agent package root (same D-03 strategy)
    - Extension UI components relocated within pi-coding-agent to avoid circular dep
key_files:
  created:
    - packages/gsd-agent-modes/src/main.ts
    - packages/gsd-agent-modes/src/index.ts (final, 7 named exports)
    - packages/pi-coding-agent/src/components/ (40 files relocated from modes/interactive/components/)
    - packages/pi-coding-agent/src/core/jsonl.ts (relocated from modes/rpc/)
    - packages/pi-coding-agent/src/utils/shorten-path.ts (relocated from modes/interactive/utils/)
  modified:
    - packages/gsd-agent-modes/src/cli/args.ts (added GsdArgs type alias)
    - packages/gsd-agent-modes/src/cli/config-selector.ts (fixed ConfigSelectorComponent import)
    - packages/gsd-agent-modes/src/modes/rpc/rpc-mode.ts (added RpcMode type alias)
    - packages/pi-coding-agent/src/index.ts (removed modes exports, added main.ts batch exports)
    - packages/pi-coding-agent/src/config.ts (fixed getThemesDir stale path)
    - src/cli.ts (import InteractiveMode/runPrintMode/runRpcMode from @gsd/agent-modes)
  deleted:
    - packages/pi-coding-agent/src/main.ts
    - packages/pi-coding-agent/src/modes/ (entire directory — all GSD-authored modes files)
    - packages/pi-coding-agent/src/cli/ (entire directory — all GSD-authored CLI files)
    - packages/pi-coding-agent/src/cli.ts (entry point relying on deleted main.ts)
decisions:
  - "Extension UI components (modes/interactive/components/) relocated to pi-coding-agent/src/components/ rather than re-exported from @gsd/agent-modes — avoids circular dependency since pi-coding-agent cannot depend on agent-modes"
  - "jsonl.ts relocated to pi-coding-agent/src/core/jsonl.ts — standalone utility with no modes deps, stays in pi-coding-agent as public API"
  - "ConfigSelectorComponent import in agent-modes config-selector.ts fixed to use relative path (../modes/interactive/components/) — was temporarily exported from pi-coding-agent as TEMPORARY in 03-01 and removed in 03-02"
  - "RpcMode added as type alias (Promise<never>) to satisfy MODES-07 spec — no class named RpcMode existed"
  - "GsdArgs added as type alias for Args in cli/args.ts — satisfies MODES-07 spec (ADR-010 used GsdArgs name)"
  - "runInteractiveMode exported as InteractiveMode alias in index.ts — no standalone runInteractiveMode function existed"
  - "getThemesDir in config.ts fixed to reference core/theme/ (was modes/interactive/theme/ — stale since Plan 01 PREP-B)"
metrics:
  duration_minutes: 45
  completed_date: "2026-04-15"
  tasks_completed: 2
  files_changed: 80
---

# Phase 03 Plan 03: Extract main.ts, write final index.ts, complete MODES-08 cleanup

Extracted main.ts to @gsd/agent-modes with all imports updated to @gsd/pi-coding-agent cross-package refs, wrote the final gsd-agent-modes/src/index.ts with exactly 7 named exports, deleted all GSD-authored modes/ and cli/ source files from pi-coding-agent, and relocated extension UI components to a non-modes directory to preserve the extension API without circular deps.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract main.ts and write index.ts with 7 named exports [MODES-06, MODES-07] | 5e2dd6d8a | main.ts (new), index.ts (final), args.ts, config-selector.ts, rpc-mode.ts, pi-coding-agent/index.ts |
| 2 | Cleanup modes/index.ts, fix TS errors, verify MODES-08 [MODES-08] | 7da503432 | 71 files: deleted modes/ + cli/, relocated components/ and jsonl.ts, fixed src/cli.ts, config.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ConfigSelectorComponent missing from @gsd/pi-coding-agent after Plan 02 removed TEMPORARY re-export**
- **Found during:** Task 1 build gate (agent-modes failed to build)
- **Issue:** `gsd-agent-modes/src/cli/config-selector.ts` imported `ConfigSelectorComponent` from `@gsd/pi-coding-agent`, but Plan 02 removed the TEMPORARY re-export. The component moved to agent-modes' own interactive/components/ in Plan 02.
- **Fix:** Updated import to use relative path `../modes/interactive/components/config-selector.js` within agent-modes. Applied to both worktree and main repo copies.
- **Files modified:** packages/gsd-agent-modes/src/cli/config-selector.ts (worktree + main repo)
- **Commit:** 5e2dd6d8a

**2. [Rule 2 - Missing exports] RpcMode and runInteractiveMode didn't exist as named exports**
- **Found during:** Task 1 — resolving MODES-07 spec
- **Issue:** Plan specifies `export { runRpcMode, RpcMode }` and `export { runInteractiveMode }` but neither `RpcMode` nor `runInteractiveMode` existed in the codebase. Only `runRpcMode` function and `InteractiveMode` class existed.
- **Fix:** Added `export type RpcMode = Promise<never>` to rpc-mode.ts; used `InteractiveMode as runInteractiveMode` alias in index.ts; added `export type GsdArgs = Args` alias to args.ts
- **Files modified:** packages/gsd-agent-modes/src/modes/rpc/rpc-mode.ts, packages/gsd-agent-modes/src/cli/args.ts, packages/gsd-agent-modes/src/index.ts
- **Commit:** 5e2dd6d8a

**3. [Rule 1 - Bug] Extension UI components (modes/interactive/components/) could not be deleted from pi-coding-agent — used by extension API**
- **Found during:** Task 2 — attempting to delete entire modes/ directory
- **Issue:** pi-coding-agent's index.ts re-exports all UI components from `./modes/interactive/components/index.js` as part of the extension API. Cannot re-export from @gsd/agent-modes (circular dep). Cannot simply delete.
- **Fix:** Relocated entire `modes/interactive/components/` to `pi-coding-agent/src/components/` (40 files). Fixed all import paths (../../../core/ → ../core/). Updated pi-coding-agent/index.ts to reference ./components/index.js. Updated pi-coding-agent/src/cli/ files that imported components. Applied to both worktree and main repo.
- **Files modified:** 40+ component files (import paths), packages/pi-coding-agent/src/index.ts
- **Commit:** 7da503432

**4. [Rule 1 - Bug] modes/rpc/jsonl.ts re-exported from pi-coding-agent could not be deleted — part of public API**
- **Found during:** Task 2 — pi-coding-agent/index.ts exports attachJsonlLineReader/serializeJsonLine from ./modes/rpc/jsonl.js
- **Issue:** Same circular dep constraint — cannot re-export from agent-modes. jsonl.ts is a standalone utility.
- **Fix:** Relocated jsonl.ts to pi-coding-agent/src/core/jsonl.ts. Updated index.ts to reference ./core/jsonl.js.
- **Files modified:** packages/pi-coding-agent/src/core/jsonl.ts (new), packages/pi-coding-agent/src/index.ts
- **Commit:** 7da503432

**5. [Rule 1 - Bug] config.ts getThemesDir() referenced stale path (modes/interactive/theme/ vs core/theme/)**
- **Found during:** Task 2 — MODES-08 grep cleanup
- **Issue:** getThemesDir() still returned `modes/interactive/theme` path but theme was moved to `core/theme` in Plan 01 PREP-B. This was a pre-existing bug introduced in Plan 01 (the copy-assets.cjs was fixed then, but config.ts was missed).
- **Fix:** Updated getThemesDir() to return core/theme/ path. Updated JSDoc comment.
- **Files modified:** packages/pi-coding-agent/src/config.ts (worktree + main repo)
- **Commit:** 7da503432

**6. [Rule 2 - Missing exports] pi-coding-agent/index.ts missing exports needed by main.ts: getModelsPath, resolveCliModel, ScopedModel, printTimings, time, exportFromFile, runMigrations, showDeprecationWarnings**
- **Found during:** Task 1 — updating main.ts imports
- **Issue:** main.ts uses these symbols but none were exported from pi-coding-agent's public index.
- **Fix:** Added all 8 exports (values + types) to pi-coding-agent/src/index.ts in both worktree and main repo.
- **Files modified:** packages/pi-coding-agent/src/index.ts
- **Commit:** 5e2dd6d8a

## Known Stubs

None. All extracted files wire to real implementations.

## Threat Flags

None. No new trust boundaries introduced. This plan moved existing TypeScript source files and cleaned up re-exports. No new network endpoints, auth flows, or data storage.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| packages/gsd-agent-modes/src/main.ts exists | FOUND |
| packages/pi-coding-agent/src/main.ts deleted | CONFIRMED |
| gsd-agent-modes/src/index.ts has 6 export lines | CONFIRMED (6 lines) |
| No export * in index.ts | CONFIRMED |
| packages/pi-coding-agent/src/modes/ deleted | CONFIRMED |
| packages/pi-coding-agent/src/cli/ deleted | CONFIRMED |
| packages/pi-coding-agent/src/components/ created (40 files) | FOUND |
| npm run build:gsd | PASS |
| npm run test:packages | PASS (exit 0) |
| npm run typecheck:extensions | PASS |
| MODES-08 directory checks (6/6) | ALL PASS |
| MODES-07 export line count (6) | CONFIRMED |
| commit 5e2dd6d8a (Task 1) | FOUND |
| commit 7da503432 (Task 2) | FOUND |
