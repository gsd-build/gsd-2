# workflow-logger — Standalone PR Limitations

This document describes what the standalone workflow-logger PR covers and what
requires the single-writer PRs (01–04) to be merged before it becomes available.

## What this PR delivers (standalone, no dependencies)

| Integration point | File | Benefit |
|---|---|---|
| Core logger module | `workflow-logger.ts` | Structured accumulator with severity, component, message, context. Buffers up to 100 entries. Forwards to stderr. |
| Stuck detection enrichment | `auto/phases.ts` | Hard-stop message includes accumulated root causes: `Stuck: artifact not written. Root cause: 2 error(s): tool-call loop guard blocked Write` |
| Post-unit log drain | `auto/phases.ts` | After each unit completes, any warnings/errors surface as a UI notification instead of silently going to stderr |
| Tool-call loop guard logging | `bootstrap/register-hooks.ts` | When `checkToolCallLoop` blocks a repeated tool call, the tool name is now logged and buffered |

## What requires single-writer PRs 01–04

The following call sites exist in the stacked PR (`single-writer/05-workflow-logger`)
but **cannot be applied to upstream/main** because the files they modify were
introduced or substantially rewritten in PRs 01–04.

### `bootstrap/workflow-tools.ts` — tool handler errors
**Requires:** PR 02 (write-side state transitions) introduces this file.
**Missing:** 7 tool handler `catch` blocks that replace `process.stderr.write` with
`logError("tool", ...)` for `gsd_complete_task`, `gsd_complete_slice`,
`gsd_plan_slice`, `gsd_start_task`, `gsd_record_verification`,
`gsd_report_blocker`, `gsd_engine_save_decision`.
**Impact:** Tool handler failures still go to stderr only. Not buffered. Not
surfaced in stuck messages.

### `bootstrap/register-hooks.ts` — blocked state file writes
**Requires:** PR 01 (engine foundation) introduces `write-intercept.ts` with
`isBlockedStateFile` / `BLOCKED_WRITE_ERROR`.
**Missing:** `logError("intercept", ...)` for blocked Write and Edit tool calls
to authoritative `.gsd/` state files.
**Impact:** When the agent tries to directly edit `.gsd/STATE.md` or similar
protected files, the block is enforced but not logged. The stuck message will
not mention "blocked write to .gsd/STATE.md" as a root cause.

### `workflow-engine.ts` — afterCommand side effects
**Requires:** PRs 01–03 replace the `workflow-engine.ts` interface with a
concrete `WorkflowEngine` class that wraps SQLite and calls `renderAllProjections`,
`writeManifest`, and `appendEvent` after every command.
**Missing:** `logWarning("projection", ...)`, `logWarning("manifest", ...)`,
`logWarning("event-log", ...)` in the `afterCommand` method; `logWarning` for
replay unknown cmd and replay skip errors.
**Impact:** Projection render failures, manifest write failures, and event append
failures are not buffered. These are among the most useful root causes when the
auto-loop gets stuck after a command succeeds structurally but side effects fail.

### `state.ts` — migration and engine fallback
**Requires:** PRs 01–04 add `validateMigration`, `auto-migration`, and the
`deriveState → engine → markdown fallback` chain in `state.ts`.
**Missing:** `logWarning("migration", ...)` for post-migration discrepancies;
`logError("migration", ...)` for failed auto-migration; `logWarning("state", ...)`
for engine-unavailable fallback to markdown parsing.
**Impact:** Migration and engine-initialization failures are invisible until
they cascade into a stuck loop.

## Summary table

| Component | Standalone PR | With PRs 01–04 |
|---|---|---|
| Logger module + tests | ✅ | ✅ |
| Stuck message enrichment | ✅ | ✅ |
| Post-unit drain + notify | ✅ | ✅ |
| Loop guard logging | ✅ | ✅ |
| Tool handler error logging | ❌ | ✅ |
| Blocked state-file write logging | ❌ | ✅ |
| Projection / manifest / event-log failures | ❌ | ✅ |
| Migration discrepancy logging | ❌ | ✅ |
| Engine fallback logging | ❌ | ✅ |

The standalone PR captures ~40% of the total logging surface — the parts the
auto-loop itself can see. The remaining 60% requires the single-writer
infrastructure that owns the write path.
