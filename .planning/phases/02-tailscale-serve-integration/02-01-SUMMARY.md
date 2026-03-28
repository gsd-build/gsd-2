---
phase: 02-tailscale-serve-integration
plan: 01
subsystem: web/tailscale
tags: [tailscale, cli-wrapper, unit-tests, error-types, child-process]
dependency_graph:
  requires: []
  provides: [TailscaleInfo, TailscaleStatusResult, TailscaleServeError, parseTailscaleStatus, buildServeCommand, buildServeResetCommand, getInstallCommand, isTailscaleInstalled, getTailscaleStatus, startTailscaleServe, stopTailscaleServe, stopTailscaleServeSync]
  affects: [src/web-mode.ts (Phase 02 Plan 02 consumer)]
tech_stack:
  added: []
  patterns: [discriminated-union-result, injectable-deps-for-testing, strict-lenient-error-modes, spawnSync-preflight, execFile-async-lifecycle]
key_files:
  created:
    - src/web/tailscale.ts
    - src/web/__tests__/tailscale.test.ts
  modified: []
decisions:
  - "_deps object pattern used for testability: Node.js strip-only mode cannot mock named exports from node:child_process; injectable _deps object lets tests replace spawnSync/execFile without mock.method"
  - "TailscaleServeError uses explicit property assignments (not TypeScript parameter properties) — parameter properties are not supported in Node.js --experimental-strip-types mode"
  - "stopTailscaleServe split into strict (startup reset, throws) and lenient (shutdown cleanup, swallows) modes — covers both use cases without duplicating code"
metrics:
  duration: 4 minutes
  completed: 2026-03-28T19:41:15Z
  tasks_completed: 1
  files_created: 2
  files_modified: 0
---

# Phase 02 Plan 01: Tailscale CLI Wrapper Summary

**One-liner:** Tailscale CLI wrapper with discriminated-union status result, structured TailscaleServeError (exitCode + stderr), strict/lenient stop modes, and sync exit-handler variant.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create tailscale.ts with structured error types, pure functions, and I/O wrappers | 5cd14477 | src/web/tailscale.ts, src/web/__tests__/tailscale.test.ts |

## What Was Built

### src/web/tailscale.ts

Pure-function Tailscale CLI wrapper with structured error types:

**Types:**
- `TailscaleInfo` — parsed hostname, tailnet, fqdn, and HTTPS URL
- `TailscaleStatusResult` — discriminated union: `{ ok: true, info }` or `{ ok: false, reason: 'not-connected' | 'invalid-status' | 'cli-error', stderr? }`
- `TailscaleServeError` — Error subclass preserving `exitCode: number | null` and `stderr: string`

**Pure functions (unit-testable without real Tailscale):**
- `parseTailscaleStatus(json)` — validates Self.DNSName + MagicDNSSuffix, strips trailing dot, returns null on missing fields
- `buildServeCommand(port)` — returns `["serve", "--bg", "--https", "443", "https+insecure://127.0.0.1:<port>"]`
- `buildServeResetCommand()` — returns `["serve", "reset"]`
- `getInstallCommand(platform)` — brew/winget/curl per platform

**I/O functions:**
- `isTailscaleInstalled()` — sync spawnSync, returns boolean
- `getTailscaleStatus()` — sync spawnSync, returns TailscaleStatusResult with all failure modes preserved
- `startTailscaleServe(port)` — async execFile, throws TailscaleServeError on failure
- `stopTailscaleServe(options?)` — async execFile, strict mode throws / lenient swallows
- `stopTailscaleServeSync()` — spawnSync, never throws (for process exit handlers)

### src/web/__tests__/tailscale.test.ts

30 unit tests covering all pure functions and all I/O function paths via `_deps` injection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript parameter properties unsupported in strip-only mode**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** `TailscaleServeError` used `public readonly` parameter properties which are TypeScript-specific syntax not supported by `--experimental-strip-types`
- **Fix:** Changed to explicit property declarations with manual assignment in constructor
- **Files modified:** src/web/tailscale.ts
- **Commit:** 5cd14477

**2. [Rule 1 - Bug] `t.mock.method` cannot redefine non-configurable `node:child_process` exports**
- **Found during:** Task 1 (GREEN phase, first test run)
- **Issue:** `TypeError: Cannot redefine property: spawnSync` — named exports from `node:child_process` are non-configurable and cannot be patched with `t.mock.method`
- **Fix:** Added `_deps` injectable object to `tailscale.ts` holding references to `spawnSync` and `execFile`. Tests use `withDeps`/`withDepsAsync` helpers to replace deps within test scope and restore afterward
- **Files modified:** src/web/tailscale.ts, src/web/__tests__/tailscale.test.ts
- **Commit:** 5cd14477

## Verification

```
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/web/__tests__/tailscale.test.ts
```

Result: 30 pass, 0 fail

## Self-Check: PASSED

- [x] src/web/tailscale.ts exists
- [x] src/web/__tests__/tailscale.test.ts exists
- [x] Commit 5cd14477 exists
- [x] All 12 required exports present (interface TailscaleInfo, type TailscaleStatusResult, class TailscaleServeError, 9 functions)
- [x] 30 tests pass (≥12 required)
- [x] TAIL-02, TAIL-03, TAIL-04, TAIL-06 requirements addressed
