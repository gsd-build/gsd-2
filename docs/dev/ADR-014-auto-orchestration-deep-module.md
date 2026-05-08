# ADR-014: Deepen Auto Orchestration Behind Explicit Seams

**Status:** Accepted
**Date:** 2026-05-03
**Author:** GSD architecture review
**Related:** ADR-009 (orchestration kernel refactor), ADR-010 (clean seam architecture)

## Context

`src/resources/extensions/gsd/auto.ts` currently carries multiple concerns in one place (dispatch, recovery, worktree coordination, health/escalation, locks/journaling, notifications). The module’s interface is broad relative to its implementation details, reducing locality and making failure diagnosis (especially wrong-dispatch and stuck-loop behavior) expensive.

## Decision

Introduce a deep **Auto Orchestration module** with a small interface:

- `start(sessionContext)`
- `advance()`
- `resume()`
- `stop(reason)`
- `getStatus()`

Keep orchestration control-flow in this module, and move concern-specific behavior behind explicit seams with adapters:

1. Dispatch seam
2. Recovery seam
3. Worktree seam
4. Health seam
5. Runtime persistence seam (locks + journal)
6. Notification seam

`auto.ts` becomes wiring/entry glue, not the orchestration implementation.

## Why this decision

- Increases depth: callers drive one orchestration interface instead of coordinating internals.
- Increases locality: transition logic and invariants are concentrated in one place.
- Improves testability: contract tests can target orchestration behavior across adapters.
- Aligns with ADR-010’s seam discipline (package/module structure should enforce, not imply, architecture).

## Invariants

- Exactly one active unit at a time.
- `advance()` is idempotent for the same state snapshot.
- Lock ownership is validated before mutating runtime state.
- Recovery cannot skip required verification transitions.
- Every state transition is journaled.

## Implementation status (2026-05-03)

Phase 1 landed in-tree with no behavior switch of the primary auto loop yet:

- Added orchestration contracts: `src/resources/extensions/gsd/auto/contracts.ts`
- Added orchestration implementation: `src/resources/extensions/gsd/auto/orchestrator.ts`
- Added thin wiring in `auto.ts`: `createWiredAutoOrchestrationModule(...)` and lifecycle integration points (`start`, `resume`, `pause`, `stop` hooks)
- Added runtime observability surfaces:
  - `AutoSession.orchestration`
  - `getAutoRuntimeSnapshot()` fields: `orchestrationPhase`, `orchestrationTransitionCount`, `orchestrationLastTransitionAt`
- Wired initial real adapters behind seams:
  - Dispatch adapter uses `deriveState(...)` + `resolveDispatch(...)`
  - Health adapter uses `preDispatchHealthGate(...)` and records orchestration snapshots via `recordHealthSnapshot(...)`
  - Runtime persistence adapter validates session lock status and journals transitions

Contract and invariants are covered by dedicated tests:

- `src/resources/extensions/gsd/tests/auto-orchestrator.test.ts`
- `src/resources/extensions/gsd/tests/auto-runtime-state.test.ts`
- `src/resources/extensions/gsd/tests/auto-session-encapsulation.test.ts`

## Consequences

- Short-term migration cost (extracting logic and introducing adapter contracts).
- Long-term leverage via clearer failure handling and safer refactors.
- Existing helpers that are now pass-through should be removed after contract tests are green (deletion test).
