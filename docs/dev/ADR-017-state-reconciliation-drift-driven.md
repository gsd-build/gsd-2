<!-- Project/App: GSD-2 -->
<!-- File Purpose: ADR for drift-driven design of the State Reconciliation Module. -->

# ADR-017: Drift-Driven State Reconciliation

**Status:** Accepted
**Date:** 2026-05-10
**Author:** GSD architecture review
**Related:** ADR-014 (deep Auto Orchestration module), ADR-015 (runtime invariant modules), ADR-016 trio (worktree split + fail-closed)

## Context

ADR-015 named the **State Reconciliation Module** as one of four runtime invariant modules and specified `reconcileBeforeDispatch(basePath)` as its Interface. The module landed at `src/resources/extensions/gsd/state-reconciliation.ts` (57 lines) but its current implementation only invalidates the state cache and calls `deriveState`. The Interface returns `repaired: readonly string[]` but the only value ever returned is `["derive-state-cache-invalidated"]` — the cache invalidation itself, dressed up as a repair.

The repair helpers CONTEXT.md names — sketch-flag healing, merge-state reconciliation, PROJECT.md/ROADMAP.md drift, completion-timestamp drift — exist in scattered places, or do not exist at all:

- `autoHealSketchFlags` (`gsd-db.ts:1156`): exists, **zero callers**.
- `reconcileMergeState` (`auto-recovery.ts:1118`): exists, called only by post-failure recovery paths.
- `repairStaleRenders` (`markdown-renderer.ts:937`): exists.
- Stale-worker, PROJECT.md/ROADMAP.md, completion-timestamp repair: **no implementation**.

The module has one production caller (the Auto Orchestration adapter in `auto.ts:1753`). Without specifying what reconciliation actually does, the module is a hypothetical seam — the discipline ADR-016 chased out for worktree handling.

## Decision

State Reconciliation runs **drift-driven blocker repair** before every Dispatch decision and before every worker spawn. The Module exposes two surfaces:

1. **`blockers: string[]`** (existing) — terminal, human-readable. Indicates conditions reconciliation cannot resolve (DB unavailable, slice lock invalid, dependency cycle).
2. **`DriftRecord[]`** (new) — typed, discriminated union of repairable drift kinds. Each `DriftRecord` carries the identifiers its matching repair needs.

### Drift catalog (initial)

```ts
type DriftRecord =
  | { kind: "stale-sketch-flag"; mid: string; sid: string }
  | { kind: "unmerged-merge-state"; basePath: string }
  | { kind: "stale-worker"; lockPath: string; pid: number }
  | { kind: "unregistered-milestone"; milestoneId: string }
  | { kind: "roadmap-divergence"; milestoneId: string; sliceId?: string }
  | {
      kind: "missing-completion-timestamp";
      entity: "task" | "slice" | "milestone";
      ids: string[];
    };
```

`roadmap-divergence` means the milestone `ROADMAP.md` projection and DB slice
rows no longer agree on slice presence, sequence, or declared `depends` values.
Its repair treats `ROADMAP.md` as the source of truth: the markdown hierarchy is
re-imported into the DB, then each parsed slice's `depends` list is synced into
the `slice_dependencies` junction table. This keeps both the JSON `slices.depends`
column and the relational dependency view aligned before Dispatch decides which
slice or task can run.

### Lifecycle

```ts
async function reconcileBeforeDispatch(
  basePath: string,
  deps: ReconciliationDeps,
): Promise<ReconciliationResult> {
  for (let pass = 0; pass < 2; pass++) {
    const s = await deps.deriveState(basePath);
    const drift = detectAllDrift(s, deps);
    if (drift.length === 0) {
      return { ok: true, stateSnapshot: s, repaired: [], blockers: s.blockers ?? [] };
    }

    const failures: Array<{ drift: DriftRecord; cause: unknown }> = [];
    for (const d of drift) {
      try {
        await applyRepair(d, deps);
      } catch (cause) {
        failures.push({ drift: d, cause });
      }
    }
    if (failures.length > 0) {
      throw new ReconciliationFailedError({ failures, pass });
    }
    // pass succeeded; loop runs again to detect cascading drift
  }

  const finalState = await deps.deriveState(basePath);
  const persistent = detectAllDrift(finalState, deps);
  if (persistent.length > 0) {
    throw new ReconciliationFailedError({ persistentDrift: persistent });
  }
  return {
    ok: true,
    stateSnapshot: finalState,
    repaired: [],
    blockers: finalState.blockers ?? [],
  };
}
```

- **Re-derive cycle is capped at 2.** The loop runs only when the prior pass fully succeeded and re-derive surfaces NEW drift (cascading repairs — e.g., fixing a milestone registration uncovers a downstream completion-timestamp drift). Persistent or failed drift after pass 2 throws.
- **All repairs must be idempotent.** Re-derive can re-trigger detection on transient state; repairs must be safe under retry.
- **Failure throws.** `ReconciliationFailedError` is caught by the caller and routed to `classifyFailure({ error, failureKind: "reconciliation-drift" })`.

### Module home

`state-reconciliation/` folder owns detectors **and** repairs:

```text
state-reconciliation/
  index.ts          → reconcileBeforeDispatch
  errors.ts         → ReconciliationFailedError
  drift/
    sketch-flag.ts  → detect + repair (relocated from gsd-db.ts)
    merge-state.ts  → detect + repair (relocated from auto-recovery.ts)
    stale-worker.ts → detect + repair (new)
    project-md.ts   → detect + repair (new)
    roadmap.ts      → detect + repair (new)
    completion.ts   → detect + repair (new)
  registry.ts       → DriftKind → { detect, repair }
```

Owning modules retain their raw primitives (e.g., `setSliceSketchFlag`, the SELECT query) but the **detection-and-repair composition** lives in the drift folder.

### Caller closure

Strict closure — every pre-dispatch / pre-spawn site calls `reconcileBeforeDispatch`:

- Single-loop auto: already wired via `auto/orchestrator.ts:42` (existing).
- Workers spawned by parallel orchestration: already covered (each spawned worker runs its own auto-loop with reconcile).
- **Parent processes that spawn workers**: need new wiring at the `startParallel` / `startSliceParallel` call sites (`auto.ts`, `auto/phases.ts`, `commands/handlers/parallel.ts`) so workers do not independently race on the same drift.

### Recovery Classification contract change

Add new `RecoveryFailureKind: "reconciliation-drift"` with action `escalate` and remediation pointing at the persistent drift kinds. Update `classifyFailure` in `recovery-classification.ts` to recognise `ReconciliationFailedError`.

## Consequences

- `gsd-db.ts:1156` `autoHealSketchFlags` relocates to `state-reconciliation/drift/sketch-flag.ts`. `gsd-db.ts` keeps `setSliceSketchFlag` and the SELECT primitive.
- `auto-recovery.ts:1118` `reconcileMergeState` and supporting helpers relocate to `state-reconciliation/drift/merge-state.ts`. `auto-recovery.ts` shrinks; remaining post-failure helpers (`verifyExpectedArtifact`, `writeBlockerPlaceholder`) stay.
- Four new repair functions land: stale-worker, PROJECT.md sync, ROADMAP.md sync, completion-timestamp backfill.
- `state.ts` `blockers: string[]` is unchanged; existing call sites that read `s.blockers` are unaffected.
- Detector cost is paid on every `advance()` tick. Cheap detectors (DB queries, `existsSync`) run unconditionally; markdown-parsing detectors must be designed to short-circuit when artifacts are unchanged.
- Every drift kind has a contract test: seeded drift → reconcile → assert repaired. Persistent-drift cases are tested with non-idempotent fixture setups.
- The Module's Interface becomes the test surface for runtime drift handling. Single-drift unit tests can target `drift/<kind>.ts` directly.

## Alternatives considered

- **Idempotent self-healing** (every tick attempts every known repair, no detection layer). Rejected: pays the repair cost on every advance even when state is clean, and provides no signal for telemetry/observability about which drift was actually present.
- **Passive — derive only**. Rejected: dormant repairs (`autoHealSketchFlags` has zero callers today) stay dormant. The seam exists but solves nothing.
- **Predicate-matched repairs over free-text blockers**. Rejected as fragile: this is the same pattern as the dispatch rule registry, which has already shown drift between two parallel rule sources (see `auto-dispatch.ts:1474`). Typed drift records make new repair additions a type-system change instead of a regex audit.
- **Loop until stable (uncapped)**. Rejected for runaway risk. Cap=2 is enough for cascading repairs without unbounded retry.
- **First-failure aborts the pass**. Rejected: loses repair work for unrelated drift. Collecting failures within a pass and throwing at end-of-pass keeps the failure surface complete.
- **Detectors and repairs delegated to owning modules** (each owner exposes its own `detect` + `repair`). Rejected: the canonical zero-caller bug (`autoHealSketchFlags` shipped in `gsd-db.ts` for over a year without wiring) shows that owners do not naturally compose detection-and-repair into a pre-dispatch lifecycle. Locality wins here — one folder reviews the whole catalog.
