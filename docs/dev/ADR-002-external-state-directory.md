# ADR-002: External State Directory

**Status:** Not Adopted
**Date:** 2026-03-16 (proposed window)
**Closed:** 2026-05-10
**Related:** ADR-001 (branchless worktree, superseded), ADR-016 trio, ADR-017 (drift-driven reconciliation)

## Context

ADR-001 and ADR-003 reference an "external state directory" ADR-002 that was never written as a standalone document. The idea, as carried in those ADRs, was to move `.gsd/` runtime state out of the working tree so that branch checkouts, slice merges, and worktree teardown could not clobber in-flight planning artifacts.

## Decision

**Not adopted.** GSD instead moved to a **DB-authoritative runtime model**: the project-root database is canonical, and `.gsd/**` markdown files are rendered projections of that database. With the database living outside the per-worktree working set and projections regenerated on demand, the cross-branch state-clobbering problem an external state directory was meant to solve no longer presents the same shape.

The worktree-level concerns this ADR would have touched were addressed by:

- **ADR-016 trio** — split worktree handling into Worktree Lifecycle and State Projection modules, with fail-closed safety for source-writing units.
- **ADR-017** — drift-driven State Reconciliation module, which detects and repairs the specific state classes (sketch flags, merge state, roadmap divergence, completion timestamps, stale workers) that an external state directory would have tried to keep out of the working tree entirely.

## Consequences

- Cross-references to "ADR-002" from ADR-001 and ADR-003 should be read as "the work that became ADR-016/017."
- No external state directory exists or is planned. `.gsd/` artifacts remain inside the working tree as projections.
