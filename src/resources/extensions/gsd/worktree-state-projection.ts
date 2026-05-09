// GSD-2 — Worktree State Projection module: directional state-flow rules between project root and auto-worktree.
/**
 * Worktree State Projection module — first-class Module for directional
 * state-file flow between the project root and the auto-worktree.
 *
 * Per ADR-016, this Module owns:
 *   - The direction-and-rules of state file flow (project-root authoritative
 *     for some classes, worktree authoritative for others)
 *   - The bug-hardened invariants encoded in `syncProjectRootToWorktree` /
 *     `syncStateToProjectRoot` (additive milestone copy #1886, ASSESSMENT
 *     verdict overwrite #2821, completed-units forward-sync, WAL/SHM
 *     cleanup #2478, .gsd symlink edge case #2184)
 *
 * Phase 1 of the migration ships only `projectRootToWorktree`. The remaining
 * verbs (`projectWorktreeToRoot`, `finalizeProjectionForMerge`) are added in
 * subsequent slices (#5589, #5590).
 *
 * Issue #5588 ships this as a delegating wrapper around the existing
 * `syncProjectRootToWorktree*` helpers in `auto-worktree.ts`. The full body
 * extraction (with its identity-key check, additive milestone copy, ASSESSMENT
 * verdict force-overwrite, completed-units forward-sync, WAL/SHM cleanup,
 * .gsd symlink edge case) joins the legacy helper retirement in #5590.
 *
 * Lifecycle does not yet hook this Module into `enterMilestone`; that wiring
 * lands when the broader caller migration completes alongside the Projection
 * Module's full Interface.
 */

import { syncProjectRootToWorktreeByScope } from "./auto-worktree.js";
import type { MilestoneScope } from "./workspace.js";

/**
 * Worktree State Projection Module instance.
 *
 * Stateless — methods are pure functions of their `MilestoneScope` input.
 * The class form is retained for testability and to keep the Interface
 * shape consistent with `WorktreeLifecycle`.
 */
export class WorktreeStateProjection {
  /**
   * Project state from the project root onto the auto-worktree for `scope`.
   * Called by Lifecycle's enter path after a successful create/enter, before
   * any Unit dispatches.
   *
   * Owns the rules: identity-key safety check, additive milestone copy
   * preserving worktree-local files (#1886), ASSESSMENT verdict force-
   * overwrite (#2821), forward-sync of `completed-units.json`, WAL/SHM
   * cleanup on legacy worktree-local DB (#2478), and the `.gsd` symlink
   * realpath edge case (#2184).
   *
   * Issue #5588 delegates to `syncProjectRootToWorktreeByScope` to ship the
   * typed `MilestoneScope`-only Interface without re-implementing the bug-
   * hardened rules mid-flight. The body extraction joins #5590.
   */
  projectRootToWorktree(scope: MilestoneScope): void {
    syncProjectRootToWorktreeByScope(scope, scope);
  }
}
