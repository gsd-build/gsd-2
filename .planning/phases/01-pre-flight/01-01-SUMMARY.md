---
phase: 01-pre-flight
plan: 01
subsystem: pi-coding-agent
tags: [imports, circular-deps, refactor, typescript]
dependency_graph:
  requires: []
  provides: [theme-re-export, bridge-service-package-imports, madge-baseline]
  affects: [packages/pi-coding-agent/src/index.ts, packages/pi-coding-agent/src/core/agent-session.ts, src/web/bridge-service.ts]
tech_stack:
  added: []
  patterns: [package-path-imports, re-export-singleton]
key_files:
  created: []
  modified:
    - packages/pi-coding-agent/src/index.ts
    - packages/pi-coding-agent/src/core/agent-session.ts
    - src/web/bridge-service.ts
decisions:
  - "theme singleton exported via index.ts re-export; agent-session.ts now imports from @gsd/pi-coding-agent to break cycle (D-01)"
  - "RpcExtensionUIRequest and RpcExtensionUIResponse added to index.ts; bridge-service.ts routes all pi-coding-agent imports through package path (D-02)"
  - "interactive-mode.ts ./theme/theme.js relative import left unchanged — will move in Phase 3 when file migrates to @gsd/agent-modes"
metrics:
  duration: ~15 minutes
  completed: 2026-04-14
  tasks_completed: 3
  files_changed: 3
---

# Phase 01 Plan 01: Pre-flight Branch Setup and Import Path Fixes Summary

**One-liner:** Exported `theme` singleton and 3 RPC types from pi-coding-agent index.ts, routing agent-session.ts and bridge-service.ts through package paths to eliminate raw internal import references (PF-01, PF-02).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create branch and run madge baseline (PF-05 baseline) | — (no commit, diagnostic only) | N/A |
| 2 | Resolve theme circular dependency — PF-01 | 16887099b | packages/pi-coding-agent/src/index.ts, packages/pi-coding-agent/src/core/agent-session.ts |
| 3 | Fix bridge-service.ts internal-path imports — PF-02 | 930e6579e | packages/pi-coding-agent/src/index.ts, src/web/bridge-service.ts |

## Madge Baseline (PF-05 — captured, no commit)

16 circular dependencies found pre-existing in `packages/pi-coding-agent/src/`:

```
1)  ../../../../../../packages/pi-ai/dist/types.d.ts > ../../../../../../packages/pi-ai/dist/utils/event-stream.d.ts
2)  core/tools/index.ts > core/tools/tool-compatibility-registry.ts > core/extensions/types.ts
3)  modes/interactive/theme/theme.ts > modes/interactive/theme/themes.ts
4)  core/agent-session.ts > core/compaction-orchestrator.ts
5)  core/extensions/index.ts > core/extensions/loader.ts > index.ts > core/agent-session.ts > core/compaction-orchestrator.ts
6)  core/extensions/index.ts > core/extensions/loader.ts > index.ts > core/agent-session.ts
7)  core/extensions/loader.ts > index.ts > core/agent-session.ts > core/resource-loader.ts
8)  core/agent-session.ts > core/retry-handler.ts
9)  core/extensions/index.ts > core/extensions/loader.ts > index.ts
10) core/extensions/index.ts > core/extensions/loader.ts > index.ts > core/package-commands.ts > core/lifecycle-hooks.ts
11) core/extensions/index.ts > core/extensions/loader.ts > index.ts > core/sdk.ts
12) main.ts > core/extensions/index.ts > core/extensions/loader.ts > index.ts
13) core/extensions/index.ts > core/extensions/loader.ts > index.ts > modes/index.ts > modes/interactive/interactive-mode.ts
14) core/extensions/index.ts > core/extensions/loader.ts > index.ts > modes/index.ts > modes/interactive/interactive-mode.ts > modes/interactive/controllers/extension-ui-controller.ts
15) core/extensions/index.ts > core/extensions/loader.ts > index.ts > modes/index.ts > modes/print-mode.ts > modes/shared/command-context-actions.ts
16) core/extensions/index.ts > core/extensions/loader.ts > index.ts > modes/index.ts > modes/rpc/rpc-mode.ts
```

This baseline is the reference for the Plan 03 final gate (target: 0 cycles after seam refactor).

## Changes Made

### Task 2: PF-01 — theme circular dependency

**packages/pi-coding-agent/src/index.ts:** Added `theme,` to existing theme export block (between `initTheme` and `Theme`, alphabetical order).

**packages/pi-coding-agent/src/core/agent-session.ts:** Changed line 31 from `import { theme } from "../modes/interactive/theme/theme.js"` to `import { theme } from "@gsd/pi-coding-agent"`.

`packages/pi-coding-agent/src/modes/interactive/interactive-mode.ts` left unchanged — its `./theme/theme.js` relative import is correct for Phase 1.

### Task 3: PF-02 — bridge-service.ts package path routing

**packages/pi-coding-agent/src/index.ts:**
- Added `type SessionStateChangeReason` to agent-session export block
- Added new RPC type export block with `RpcExtensionUIRequest` and `RpcExtensionUIResponse` (the other 3 RPC types — `RpcCommand`, `RpcResponse`, `RpcSessionState` — were already exported via modes/index.js)

**src/web/bridge-service.ts:** Replaced two raw `../../packages/pi-coding-agent/src/` import paths with `@gsd/pi-coding-agent` package imports.

## Deviations from Plan

None — plan executed exactly as written.

The pre-existing tsc errors in `chat-controller.ts`, `interactive-mode.ts`, `sdk.ts`, `extension-input.ts`, `tool-execution.ts`, `assistant-message.ts`, and `cli.ts` (10 errors in 7 files) were confirmed pre-existing before any changes and are out of scope for this plan.

## Known Stubs

None.

## Threat Flags

None — all changes are additive re-exports of existing internal symbols. Type-only imports in bridge-service.ts are erased at compile time and introduce no new runtime surface.

## Self-Check

### Created files:
- `.planning/phases/01-pre-flight/01-01-SUMMARY.md` — this file
