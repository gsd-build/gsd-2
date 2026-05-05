# ADR-015: Make Runtime Invariants First-Class Modules

**Status:** Accepted
**Date:** 2026-05-05
**Author:** GSD architecture review
**Related:** ADR-009 (unified orchestration kernel), ADR-014 (deep Auto Orchestration module), ADR-001 (worktree architecture)

## Context

The 2026-05-05 issue triage found repeated auto-mode failures where the same invariants were checked late, checked only for some Unit types, or repaired by helper code that was not wired into the main path. The recurring classes were DB/disk state drift, invalid worktree roots, generic recovery classification, prompt/tool/schema mismatch, and weak telemetry buckets.

ADR-014 already accepts a deep Auto Orchestration module. The triage evidence shows that the current adapter shape is still too shallow for the invariants that cause the most expensive failures. More local guards would reduce one bug at a time, but the same complexity would keep reappearing across Dispatch decisions, Recovery decisions, worktree handling, and Unit tool setup.

## Decision

Deepen four runtime-invariant modules behind the Auto Orchestration module:

1. **State Reconciliation module**
2. **Worktree Safety module**
3. **Recovery Classification module**
4. **Tool Contract module**

Each module must expose a small Interface that callers and tests can use directly. The implementation can keep internal seams, but Dispatch decisions and Recovery decisions should not know each repair rule, worktree validity check, provider/tool failure pattern, or prompt/schema pairing.

The target Interfaces are:

- `reconcileBeforeDispatch(basePath)` for DB/disk/cached-state repair and blocking inconsistencies
- `prepareUnitRoot(unitType, unitId)` for worktree/root/lease/git validation before source-writing Units
- `classifyFailure(input)` for failure taxonomy, Recovery decision, exit reason, and user-facing remediation
- `compileUnitToolContract(unitType)` for prompt obligations, allowed tools, schema enums, validation rules, and closeout tools

The Auto Orchestration module owns the explicit `advance()` pipeline. Dispatch must not hide the whole pre-dispatch sequence. The intended order is:

1. State Reconciliation
2. Dispatch decision
3. Tool Contract
4. Worktree Safety
5. Runtime persistence/journal

Dispatch receives reconciled state and selects the next Unit. Tool Contract and Worktree Safety validate the selected Unit before the transition is committed or a worker is launched. Failures from any step flow through Recovery Classification with typed reasons.

## Why this decision

This gives the Auto Orchestration module more depth without turning it into another large mixed-concern file. It also gives tests a better surface: each known triage failure family can be tested through one Interface instead of reproducing a full auto-loop session.

The deletion test supports these modules. If any of them were deleted, their complexity would reappear across `state.ts`, dispatch rules, worktree orchestration, recovery handlers, prompts, write gates, and tool registrations. Keeping the behavior local gives maintainers higher leverage and better locality.

## Consequences

- Targeted bug fixes should prefer adding behavior to one of these modules over adding one-off guards at call sites.
- Existing adapter contracts from ADR-014 can stay, but their Interfaces should become invariant-oriented rather than pass-through wrappers around existing helpers.
- Tests should move toward table-driven contract coverage for reconciliation, worktree safety, recovery classification, and tool contract parity.
- Auto Orchestration tests should assert the `advance()` sequencing and short-circuit behavior directly so adapter depth does not regress into hidden Dispatch coupling.
- This extends ADR-014 and does not supersede it. The Auto Orchestration module remains the owner of lifecycle control-flow; these modules own the invariants it depends on.
