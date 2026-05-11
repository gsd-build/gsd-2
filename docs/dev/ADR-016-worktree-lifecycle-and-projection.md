# ADR-016: Split Worktree Handling Into Lifecycle and State Projection Modules

**Status:** Accepted
**Date:** 2026-05-08
**Author:** GSD architecture review
**Related:** ADR-014 (deep Auto Orchestration module), ADR-015 (runtime invariant modules), ADR-001 (branchless worktree architecture)

## Context

Worktree handling currently lives in two places:

- `src/resources/extensions/gsd/worktree-resolver.ts` — a class facade that wraps `s.basePath`/`s.originalBasePath` mutation and the merge-or-teardown lifecycle. Constructor takes a 28-field dependency interface (`WorktreeResolverDeps`).
- `src/resources/extensions/gsd/auto-worktree.ts` — 2,500+ lines of function exports owning worktree create/enter/teardown/merge plus a separate set of state-sync helpers (`syncProjectRootToWorktree`, `syncStateToProjectRoot`, `syncWorktreeStateBack`, etc.).

The boundary between the two is unclear. `WorktreeResolver` is meant to centralise `s.basePath` mutation, but it delegates lifecycle work back to functions in `auto-worktree.ts` via 28 injected callbacks. Parallel orchestration paths (`parallel-orchestrator.ts`, `slice-parallel-orchestrator.ts`, `parallel-merge.ts`, `auto-post-unit.ts`) bypass `WorktreeResolver` entirely and call `auto-worktree.ts` exports directly. The discipline `WorktreeResolver` enforces (lease claim, no-double-chdir, single owner of `s.basePath` writes) is therefore enforced **only on the single-loop auto path**. A seam respected by one of two callers is not a real seam.

ADR-015 names a **Worktree Safety module** for *validation* of worktree state before a source-writing Unit dispatches. Validation is upstream of mutation: it depends on knowing what the current worktree state is, which depends on the mutation/lifecycle module having already produced it. The current code conflates the two concerns.

The state-sync helpers carry load-bearing invariants from past stuck-loop bugs (#1886, #2184, #2478, #2821). Those rules are not pass-through file copies — they encode which side is authoritative for which file class (e.g., project root authoritative for `completed-units.json` after crash recovery; worktree authoritative for in-flight artifacts). Today those rules are scattered across functions whose names ("sync") imply bidirectional convergence rather than the directional projection they actually perform.

## Decision

Deepen worktree handling into two sibling **Modules** behind the Auto Orchestration module:

1. **Worktree Lifecycle module** — owner of create / enter / exit / merge verbs, `s.basePath` mutation, and `process.chdir` discipline. Sole owner of these mutations across single-loop and parallel callers.
2. **Worktree State Projection module** — owner of the direction-and-rules of state file flow between project root and auto-worktree.

Each module exposes a small Interface that callers and tests can use directly. The implementation can keep internal helpers, but no caller — single-loop or parallel — bypasses the Module-level Interface for the verbs the Module owns.

### Lifecycle Interface (verb-per-transition)

```ts
interface WorktreeLifecycle {
  enterMilestone(milestoneId: string, ctx: NotifyCtx): EnterResult;
  exitMilestone(
    milestoneId: string,
    opts: { merge: boolean },
    ctx: NotifyCtx,
  ): ExitResult;
  degradeToBranchMode(milestoneId: string, ctx: NotifyCtx): void;
  restoreToProjectRoot(): void;
  isInMilestone(milestoneId: string): boolean;
  getCurrentMilestoneIfAny(): string | null;
}

type EnterResult =
  | { ok: true; mode: "worktree" | "branch" | "none"; path: string }
  | { ok: false; reason: "isolation-degraded" | "lease-conflict" | "creation-failed" | "invalid-milestone-id"; cause?: unknown };

type ExitResult =
  | { ok: true; merged: boolean; codeFilesChanged: boolean }
  | { ok: false; reason: "merge-conflict" | "teardown-failed"; cause?: unknown };
```

Constructor takes a small dep set (notify, leaseStore, gitServiceFactory, journal, telemetry). The 28-field `WorktreeResolverDeps` is retired.

### State Projection Interface (three direction-typed verbs)

```ts
interface WorktreeStateProjection {
  projectRootToWorktree(scope: MilestoneScope): void;
  projectWorktreeToRoot(scope: MilestoneScope): void;
  finalizeProjectionForMerge(scope: MilestoneScope): { synced: string[] };
}
```

All verbs are `MilestoneScope`-typed only. The legacy path-string variants (`syncProjectRootToWorktree(projectRoot, worktreePath, milestoneId)` and equivalents) and their `*ByScope` aliases are retired together with the helpers they wrap.

Each verb's Implementation owns its direction's bug-hardened rules. `projectRootToWorktree` owns: identity-key safety check, additive milestone copy (#1886), ASSESSMENT verdict force-overwrite (#2821), `completed-units.json` forward-sync, WAL/SHM cleanup (#2478), `.gsd` symlink edge case (#2184). `projectWorktreeToRoot` owns the worktree → root rules (project root authoritative for diagnostics; markdown projections do not flow back; non-fatal sync). `finalizeProjectionForMerge` owns the post-merge final-capture rules and returns `{ synced: string[] }`, where `synced` lists the file classes captured during the final projection.

### Dependency direction

Lifecycle calls Projection. Projection has no Lifecycle dependency. Lifecycle invokes:

- `Projection.projectRootToWorktree(scope)` from `enterMilestone` after a successful create or enter, before any Unit dispatches.
- `Projection.finalizeProjectionForMerge(scope)` from `exitMilestone` after a successful merge, before teardown.

Lifecycle entry/exit paths (`enterMilestone` and `exitMilestone`) construct the `MilestoneScope` from the active `milestoneId` and session root state before invoking `Projection.projectRootToWorktree(scope)` or `Projection.finalizeProjectionForMerge(scope)`; callers do not pass a pre-built `s.scope` into Lifecycle.

`Projection.projectWorktreeToRoot(scope)` is called by callers outside Lifecycle (post-unit pipeline; pre-merge sync paths). Lifecycle does not own that verb's invocation.

## Why this decision

**Deletion test on each Module.** Inlining either Module's verbs would scatter their concerns across the auto loop, post-unit pipeline, parallel orchestrators, and merge paths. Each Module's invariants concentrate into a different shape than the other's: Lifecycle invariants centre on `s.basePath` and `process.chdir` ordering across milestone boundaries; Projection invariants centre on per-file authoritative-direction rules. Two Modules give locality to two distinct change frequencies — Lifecycle changes when worktree shape changes, Projection changes when a new state-drift bug becomes a rule.

**Bypass closure.** The current `WorktreeResolver` is a Seam respected by only one of two caller groups. Promoting Lifecycle and Projection to first-class Modules with explicit Interfaces forces parallel orchestrators and merge paths through the same Modules. One adapter in single-loop + one adapter in parallel = a real Seam.

**Test surface.** Today, `auto-worktree.ts` exports 14 `_*ForTest` helpers because the file is too large to test holistically. With Lifecycle and Projection as the test surface, those helpers become private internals, and tests assert behaviour through the Module Interfaces.

**Sibling to ADR-015's Worktree Safety.** Validation depends on mutation. ADR-015's `prepareUnitRoot()` becomes implementable as: call `Lifecycle.isInMilestone(...)` and `getCurrentMilestoneIfAny()`, validate the result, return a typed Recovery decision on failure. Without this ADR, Worktree Safety would have to re-derive worktree state from disk inputs.

## Invariants

- Single owner of `s.basePath` mutation across the codebase: the Worktree Lifecycle module. No caller writes `s.basePath` directly.
- Single owner of `process.chdir()` for **auto-loop worktree transitions**: the Lifecycle Module. The class must not double-chdir; this constraint moves from a comment in `worktree-resolver.ts` to an enforced internal invariant. See **Scope and carve-outs** below for the auto-loop boundary.
- Lifecycle calls Projection; Projection does not call Lifecycle. The dependency direction is one-way.
- Projection rules per direction are fixed, not parameter-bag-driven. Callers do not pass options that change which files cross the boundary or in what direction.
- `MilestoneScope` is the only input type for Projection verbs. Path-string overloads are not added.
- Expected failures (worktree creation failed, lease conflict, merge conflict, teardown failed) flow through typed result unions; only unexpected failures throw.

### Scope and carve-outs

The single-owner invariants above are scoped to the **auto-loop worktree transitions** that ADR-016 was written to deepen — the path through `auto.ts` → `WorktreeLifecycle` → `enterMilestone` / `exitMilestone` / `restoreToProjectRoot` / `adopt*` / `resumeFromPausedSession`.

The following sites are explicit carve-outs from the single-owner invariants. They are not bypasses; they predate the Lifecycle Module and are out of scope for the auto-loop deepening this ADR drives.

- **`mergeMilestoneToMain` is exported from `auto-worktree.ts`** (the `export` keyword is preserved). Its body contains the squash-merge primitive. ADR-016 phase 2 / A3 (#5619) closed the *invocation* closure: the function is invoked only by `WorktreeLifecycle`, via a `WorktreeLifecycleDeps.mergeMilestoneToMain` field that `auto.ts:buildWorktreeLifecycleDeps()` populates. The export is the construction of that dep seam, not a caller bypass. Tests substitute the merge primitive through the same dep field.
- **User-facing CLI verbs in `worktree-command.ts`** (`gsd worktree create / switch / return / merge`) chdir directly. These are user-driven mutations of the user's shell cwd, not auto-loop transitions. They never run inside an auto loop.
- **Transient cwd-swap-and-restore inside git-merge primitives** (`slice-cadence.ts:mergeSliceToMain` / `resquashMilestoneOnMain`, and `auto-worktree.ts:mergeMilestoneToMain`) chdirs to the merge target's project root to run `git merge`, then restores the previous cwd before returning. This is a transient git-op cwd swap, not a session-level basePath transition. The `s.basePath` field is never mutated by these primitives.

Future architecture reviews should not re-suggest folding these sites into Lifecycle without first revisiting this section. If a strict closure becomes preferable (e.g. because user-CLI verbs grow auto-loop reentry), that change should land alongside an amended invariants section, not as a quiet refactor.

## Consequences

**Migration is end-to-end per verb.** Each verb is migrated across all its current callers in one PR — including parallel orchestrators. Half-migrated verbs would re-create the bypass problem the ADR is meant to fix. The implementation work is broken into seven slices (one per verb per Module, plus a final cleanup slice that retires the deprecated path-based duality and `_*ForTest` exports).

**`WorktreeResolver` retires.** `worktree-resolver.ts` is deleted after the four Lifecycle verbs are live. Its standalone export `resolveProjectRoot(originalBasePath, basePath)` either moves to `worktree-root.ts` if still needed or is deleted with its callers.

**`auto-worktree.ts` shrinks substantially.** Its lifecycle verbs and state-sync helpers move into the two Modules. Remaining standalone helpers (`escapeStaleWorktree`, `cleanStaleRuntimeUnits`, `runWorktreePostCreateHook`, `autoWorktreeBranch`) either stay as helper exports the Modules call internally, or move inside the Module Implementation files, depending on which is cleaner after migration.

**Worktree Safety (ADR-015) is implementable on top of these Modules**, not in parallel with them. Its `prepareUnitRoot()` Interface depends on Lifecycle's query verbs.

**Existing helpers that become pass-through after migration are deleted under the deletion test.** This includes any `WorktreeResolver` getters whose responsibility is fully absorbed by Lifecycle, and any `auto-worktree.ts` exports whose entire body moves inside a Module.

This ADR extends ADR-014 (Auto Orchestration depth) and is a sibling to ADR-015 (validation) for the mutation/projection concerns. It does not supersede either.
