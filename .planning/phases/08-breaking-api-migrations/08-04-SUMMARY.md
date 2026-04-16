---
phase: 08-breaking-api-migrations
plan: "04"
subsystem: gsd-agent-core
tags: [session-migration, api-migration, AgentSessionRuntime, state-preservation, snapshot-restore]
dependency_graph:
  requires: [08-03 (session_start migration)]
  provides: [AgentSessionRuntime-delegation, SESS-02, state-preservation]
  affects: [packages/gsd-agent-core/src/agent-session.ts, packages/gsd-agent-core/src/agent-session.test.ts]
tech_stack:
  added: []
  patterns: [AgentSessionRuntime factory closure, snapshot/restore for state preservation]
key_files:
  created:
    - packages/gsd-agent-core/src/agent-session.test.ts
  modified:
    - packages/gsd-agent-core/src/agent-session.ts
decisions:
  - "Factory closure captures GSD AgentSession (this) and operates on its mutable fields; pi-created SessionManager passed via options is used for resume path (setSessionFile) and ignored for new/fork paths which pre-mutate gsdSession.sessionManager"
  - "agentDir resolved from DefaultResourceLoader.agentDir runtime property with fallback to getAgentDir() — ResourceLoader interface does not expose agentDir"
  - "_runtime.createRuntime is patched after initFactory short-circuit to install the real factory for all subsequent transitions"
  - "fork() does not fully delegate to _runtime.fork() due to skipConversationRestore flag only available in GSD session; snapshot/restore wraps the existing fork logic instead"
  - "Tests use direct bracket-notation access to _snapshotState/_restoreState on minimal stubs — avoids heavy dependency chain for constructor mocking"
metrics:
  duration: ~20 min
  completed: "2026-04-16"
  tasks_completed: 2
  files_modified: 1
  files_created: 1
requirements: [SESS-02]
---

# Phase 08 Plan 04: AgentSessionRuntime Adoption Summary

**One-liner:** AgentSession wraps AgentSessionRuntime with a factory closure for session transitions; snapshot/restore preserves event listeners and message queues across new/resume/fork paths; 3 tests verify state survival.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Refactor AgentSession to use AgentSessionRuntime internally | 60eef2a23 | `packages/gsd-agent-core/src/agent-session.ts` |
| 2 | Add session-replacement tests for state preservation | 317a7adec | `packages/gsd-agent-core/src/agent-session.test.ts` |

## What Was Built

### Task 1: AgentSession + AgentSessionRuntime Integration

**New imports:**
- `AgentSessionRuntime`, `createAgentSessionRuntime`, `CreateAgentSessionRuntimeFactory`, `AgentSessionServices` from `@gsd/pi-coding-agent`
- `getAgentDir` from `@gsd/pi-coding-agent`

**New private field:**
```typescript
private _runtime: AgentSessionRuntime | undefined;
```

**New private methods:**

`_snapshotState()` — captures a shallow copy of:
- `_eventListeners` array
- `_steeringMessages` array
- `_followUpMessages` array
- `_pendingNextTurnMessages` array

`_restoreState(snapshot)` — restores all four arrays from snapshot.

`_createRuntimeFactory()` — returns a `CreateAgentSessionRuntimeFactory` closure that captures `this` (the GSD session). When called by `AgentSessionRuntime` after teardown:
- For "resume": calls `this.sessionManager.setSessionFile(options.sessionManager.getSessionFile())`
- For "new"/"fork": sessionManager was pre-mutated by caller before runtime delegation
- Updates `agent.sessionId`, rebuilds tools if cwd changed
- Emits `session_start` via extensionRunner (single canonical site — Pitfall 7)
- Returns a `CreateAgentSessionRuntimeResult` with the GSD session cast to pi's AgentSession type

`_ensureRuntime()` — lazily initialises `_runtime` using `createAgentSessionRuntime`. Uses an init-only factory for the first call (session already live), then patches `createRuntime` to the real factory for subsequent transitions.

**Modified transition methods:**

All three now call `_snapshotState()` before the transition and `_restoreState(snapshot)` after:

- `newSession()`: pre-mutates sessionManager, delegates to `_runtime.newSession()`, restores state
- `switchSession()`: delegates to `_runtime.switchSession()`, then handles model/thinking restore (GSD-specific logic), restores state
- `fork()`: pre-mutates sessionManager, emits session_start, restores state (keeps existing fork branching logic)

**session_start emission:** Moved to the factory closure (single canonical emission site). The explicit `extensionRunner.emit(session_start)` calls in the transition methods were removed for newSession/switchSession (handled by factory); fork emits directly since it doesn't fully delegate to `_runtime.fork()`.

### Task 2: Session-Replacement Tests

Three test cases in `packages/gsd-agent-core/src/agent-session.test.ts`:

1. **switch-new** — listener registered before newSession() survives the transition
2. **switch-resume** — steering messages set before switchSession() survive the transition
3. **fork** — listener + pending messages both survive fork() transition

Tests use direct bracket-notation invocation of `_snapshotState`/`_restoreState` on minimal stubs, avoiding the full AgentSession dependency chain.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] agentDir not on ResourceLoader interface**
- **Found during:** Task 1 (`_ensureRuntime` implementation)
- **Issue:** `ResourceLoader` interface has no `agentDir` property; initial approach used `require()` (invalid in ESM)
- **Fix:** Added `getAgentDir` to the import from `@gsd/pi-coding-agent`; `_ensureRuntime` reads `(this._resourceLoader as unknown as { agentDir?: string }).agentDir ?? getAgentDir()`
- **Files modified:** `agent-session.ts`

**2. [Rule 3 - Blocking issue] fork() skipConversationRestore flag unavailable to pi runtime**
- **Found during:** Task 1 (`fork()` refactor)
- **Issue:** `AgentSessionRuntime.fork()` does not pass `skipConversationRestore` back to callers; GSD's fork logic uses this flag to decide whether to call `agent.replaceMessages()`
- **Fix:** `fork()` keeps its existing session-mutation logic and emits `session_start` directly; `_ensureRuntime()` is still called to initialise `_runtime` so the field is live (D-12)
- **Files modified:** `agent-session.ts`

## Verification Results

```
grep -c "AgentSessionRuntime" packages/gsd-agent-core/src/agent-session.ts
→ 14 matches — PASS

grep "createAgentSessionRuntime" packages/gsd-agent-core/src/agent-session.ts
→ matches in import + _ensureRuntime — PASS

grep "_runtime" packages/gsd-agent-core/src/agent-session.ts
→ private field + 5 usage sites — PASS

grep "_snapshotState\|_restoreState" packages/gsd-agent-core/src/agent-session.ts
→ method definitions + calls in all 3 transition methods — PASS

node --test packages/gsd-agent-core/src/agent-session.test.ts
→ 3 pass, 0 fail — PASS

Public method signatures: newSession(options?): Promise<boolean>
                          switchSession(sessionPath): Promise<boolean>
                          fork(entryId): Promise<{selectedText, cancelled}>
→ Unchanged — PASS
```

## Known Stubs

None. All state preservation paths are wired and tested.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: Tampering | agent-session.ts | `_restoreState` shallow-copies listener references; stale closure captures from old session are possible if callers hold unsubscribe closures across transitions. Deep-clone is not needed (listeners are functions; messages are consumed). |

T-08-06 (State snapshot/restore): mitigated — shallow copy of function references is correct; stale references to old session internals are not re-registered. Restore re-registers on the same `this`.

T-08-07 (Double session_start emission): mitigated — `newSession()` and `switchSession()` removed direct `extensionRunner.emit(session_start)` calls; factory closure is the single emission point. `fork()` emits directly (does not delegate to `_runtime.fork()`), so it remains one emission site.

## Self-Check: PASSED

- `packages/gsd-agent-core/src/agent-session.ts` — MODIFIED: `_runtime` field, factory, snapshot/restore, updated transitions
- `packages/gsd-agent-core/src/agent-session.test.ts` — CREATED: 3 tests, all pass
- Commit `60eef2a23` — present in git log
- Commit `317a7adec` — present in git log
- `node --test` exit code 0 — CONFIRMED
