---
id: T03
parent: S02
milestone: M010
provides:
  - /gsd sessions dispatch wired to session browser surface in web UI
  - Parity contract test passing with edit-mode builtin included
key_files:
  - web/lib/browser-slash-command-dispatch.ts
  - src/tests/web-command-parity-contract.test.ts
key_decisions:
  - /gsd sessions maps to existing "resume" surface rather than a new surface type — session browser UI already handles all session operations
patterns_established:
  - GSD subcommands that reuse existing surfaces can map directly to them in GSD_SURFACE_SUBCOMMANDS without creating new BrowserSlashCommandSurface union members
observability_surfaces:
  - Parity contract test assertion names the exact missing/extra command when builtin map drifts
  - /gsd sessions dispatch verifiable via dispatchBrowserSlashCommand() returning { kind: "surface", surface: "resume" }
duration: 5m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T03: Wire /gsd sessions dispatch and update parity test

**Added `/gsd sessions` GSD subcommand dispatch to open session browser and verified parity contract tests pass (140/140) with edit-mode builtin**

## What Happened

Added `["sessions", "resume"]` to `GSD_SURFACE_SUBCOMMANDS` in `browser-slash-command-dispatch.ts`. This routes `/gsd sessions` through the existing surface dispatch path, producing `{ kind: "surface", surface: "resume" }` — the same session browser that `/resume` opens. No new surface type or UI component was needed since the session browser already supports browse/resume/rename/fork from M002.

The `edit-mode` builtin was already added to `EXPECTED_BUILTIN_OUTCOMES` as `"reject"` in T01, which is the correct classification (TUI-only input mode toggle). The plan suggested `"rpc"` but the T01 decision was correct — no change needed.

Built `web-host` successfully and ran all 140 contract tests with zero failures.

## Verification

- Confirmed dispatch routing by evaluating `dispatchBrowserSlashCommand("/gsd sessions")` at runtime — returns `{ kind: "surface", surface: "resume", args: "" }`
- `npm run build:web-host` — exit 0
- 140 contract tests pass (parity + state surfaces), zero failures
- `rg "edit-mode"` confirms entry present in both `EXPECTED_BUILTIN_OUTCOMES` and `DEFERRED_BROWSER_REJECTS`

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run build:web-host` | 0 | ✅ pass | 11.4s |
| 2 | `node --test src/tests/web-command-parity-contract.test.ts src/tests/web-state-surfaces-contract.test.ts` | 0 | ✅ pass (140/140) | 1.3s |
| 3 | `rg "edit-mode" src/tests/web-command-parity-contract.test.ts` | 0 | ✅ pass | <1s |
| 4 | Runtime dispatch verification (`dispatchBrowserSlashCommand("/gsd sessions")`) | 0 | ✅ pass | <1s |

## Diagnostics

- Parity drift: run `npm run test:unit` and look for `web-command-parity-contract` failure naming the missing/extra command
- Dispatch check: `node -e 'import { dispatchBrowserSlashCommand } from "./web/lib/browser-slash-command-dispatch.ts"; console.log(dispatchBrowserSlashCommand("/gsd sessions"))'` (with resolve-ts loader)
- Build diagnostic: `npm run build:web-host` emits TypeScript file:line:col for any type mismatch

## Deviations

- Plan said to add `["edit-mode", "rpc"]` to `EXPECTED_BUILTIN_OUTCOMES` but T01 already added it correctly as `"reject"`. No change needed — `edit-mode` is a TUI-only interactive toggle, not an RPC command.

## Known Issues

- Unit test suite has pre-existing cleanup timeout behavior — `npm run test:unit` hangs after tests complete. Individual test files run fine with `--test-timeout 30000`. This is pre-existing (noted in T01 diagnostics).

## Files Created/Modified

- `web/lib/browser-slash-command-dispatch.ts` — Added `["sessions", "resume"]` to `GSD_SURFACE_SUBCOMMANDS` map
- `.gsd/milestones/M010/slices/S02/tasks/T03-PLAN.md` — Added Observability Impact section
