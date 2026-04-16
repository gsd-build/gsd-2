---
phase: 08-breaking-api-migrations
plan: "02"
subsystem: gsd-agent-core, gsd-agent-modes
tags: [model-registry, session-migration, api-migration, rubber-duck]
dependency_graph:
  requires: []
  provides: [session-migration-trace, ModelRegistry-factory-calls, session_directory-removed]
  affects: [packages/gsd-agent-core/src/sdk.ts, packages/gsd-agent-modes/src/main.ts]
tech_stack:
  added: []
  patterns: [ModelRegistry.create() factory, rubber-duck trace doc]
key_files:
  created:
    - .planning/session-migration-trace.md
  modified:
    - packages/gsd-agent-core/src/sdk.ts
    - packages/gsd-agent-modes/src/main.ts
decisions:
  - "Used ModelRegistry.create(authStorage) (not inMemory) for no-path case in sdk.ts — session still has file persistence"
  - "Removed extensions parameter from createSessionManager — it became unused after callSessionDirectoryHook removal"
  - "Also removed callSessionDirectoryHook call in --resume block (line 561) — not mentioned in plan but required by acceptance criteria (zero references)"
metrics:
  duration: ~15 min
  completed: "2026-04-16"
  tasks_completed: 2
  files_modified: 2
  files_created: 1
requirements: [SESS-03, MREG-01]
---

# Phase 08 Plan 02: ModelRegistry Factory + Session Directory Removal Summary

**One-liner:** ModelRegistry constructor calls replaced with `ModelRegistry.create()` factory, `session_directory` handler removed, and rubber-duck session migration trace created per D-07.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create rubber-duck session migration trace document | abe06d717 | `.planning/session-migration-trace.md` |
| 2 | Replace ModelRegistry constructors + remove session_directory block | 716aa156f | `sdk.ts`, `main.ts` |

## What Was Built

**Task 1 — Session migration trace doc** (`.planning/session-migration-trace.md`):
- Section 1: Three reason-value mappings (session_switch "new"→session_start "new", session_switch "resume"→session_start "resume", session_fork→session_start "fork")
- Section 2: Extension author migration note with reason guard example (`if (event.reason !== "new" && event.reason !== "resume") return;`)
- Section 3: Explanation of why `SessionBeforeSwitchEvent` is not used for post-switch teardown (fires before transition, lacks `previousSessionFile`)

**Task 2 — Code changes:**

`packages/gsd-agent-core/src/sdk.ts` line 211:
- BEFORE: `options.modelRegistry ?? new ModelRegistry(authStorage, modelsPath)`
- AFTER: `options.modelRegistry ?? (modelsPath ? ModelRegistry.create(authStorage, modelsPath) : ModelRegistry.create(authStorage))`

`packages/gsd-agent-modes/src/main.ts`:
- Deleted `callSessionDirectoryHook` function (25 lines)
- Replaced `new ModelRegistry(authStorage, getModelsPath())` with `ModelRegistry.create(authStorage, getModelsPath())`
- Changed `let effectiveSessionDir` / if-block to `const effectiveSessionDir = parsed.sessionDir` in `createSessionManager`
- Removed `extensions: LoadExtensionsResult` parameter from `createSessionManager` (unused after removal)
- Updated call site at line 553 to match new signature
- Changed `--resume` block's `callSessionDirectoryHook` call to `const effectiveSessionDir = parsed.sessionDir`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Second callSessionDirectoryHook call site not mentioned in plan**
- **Found during:** Task 2
- **Issue:** Plan mentioned removing `callSessionDirectoryHook` at lines 165-189 and the call at lines 200-204, but did not mention the second call site at line 561 (in the `--resume` block). Acceptance criteria required zero `callSessionDirectoryHook` matches.
- **Fix:** Replaced `parsed.sessionDir || (await callSessionDirectoryHook(extensionsResult, cwd))` with `parsed.sessionDir` at line 561 (now 530 after deletions).
- **Files modified:** `packages/gsd-agent-modes/src/main.ts`
- **Commit:** 716aa156f

**2. [Rule 2 - Missing] Unused extensions parameter in createSessionManager**
- **Found during:** Task 2
- **Issue:** After removing `callSessionDirectoryHook` calls, the `extensions: LoadExtensionsResult` parameter of `createSessionManager` became unused. TypeScript strict mode would flag this.
- **Fix:** Removed `extensions` parameter from function signature and its call site.
- **Files modified:** `packages/gsd-agent-modes/src/main.ts`
- **Commit:** 716aa156f

## Verification Results

```
grep -r "new ModelRegistry" packages/gsd-agent-core/src/ packages/gsd-agent-modes/src/
→ Only JSDoc comment match (not a constructor call) — PASS

grep -r "session_directory" packages/gsd-agent-modes/src/
→ zero matches — PASS

test -f .planning/session-migration-trace.md
→ EXISTS — PASS

grep "callSessionDirectoryHook" packages/gsd-agent-modes/src/main.ts
→ 0 matches — PASS

grep "ModelRegistry.create" packages/gsd-agent-core/src/sdk.ts packages/gsd-agent-modes/src/main.ts
→ 1 match each — PASS

grep "const effectiveSessionDir = parsed.sessionDir" packages/gsd-agent-modes/src/main.ts
→ 2 matches (createSessionManager + resume block) — PASS
```

## Known Stubs

None.

## Threat Flags

None. Changes are scope-contained:
- `ModelRegistry.create()` uses the same default path as the old constructor (`getAgentDir() + "models.json"`)
- `session_directory` removal means extensions silently lose the hook (no crash, no new network surface)

## Self-Check: PASSED

- `.planning/session-migration-trace.md` — EXISTS
- `packages/gsd-agent-core/src/sdk.ts` — MODIFIED (factory call present)
- `packages/gsd-agent-modes/src/main.ts` — MODIFIED (factory call present, session_directory removed)
- Task 1 commit `abe06d717` — present in git log
- Task 2 commit `716aa156f` — present in git log
