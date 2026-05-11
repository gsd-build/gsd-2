// Project/App: GSD-2
// File Purpose: ADR-017 types for drift-driven state reconciliation.

import type { DeriveStateOptions } from "../state.js";
import type { GSDState } from "../types.js";

/**
 * Discriminated union over drift kinds the State Reconciliation Module
 * recognizes. Each variant carries the identifiers its matching repair needs.
 */
export type DriftRecord =
  | { kind: "stale-sketch-flag"; mid: string; sid: string }
  | { kind: "unmerged-merge-state"; basePath: string }
  | { kind: "stale-render"; renderPath: string; reason: string }
  | { kind: "stale-worker"; lockPath: string; pid: number }
  | { kind: "unregistered-milestone"; milestoneId: string }
  | { kind: "roadmap-divergence"; milestoneId: string; sliceId?: string }
  | {
      kind: "missing-completion-timestamp";
      entity: "task" | "slice" | "milestone";
      ids: string[];
    };

/**
 * Context threaded to detector and repair functions. Keeps handlers from
 * re-deriving state for themselves.
 */
export interface DriftContext {
  basePath: string;
  state: GSDState;
}

/**
 * One drift kind's detect+repair composition.
 *
 * Repairs MUST be idempotent: re-running yields the same outcome. This is
 * load-bearing for the cap=2 lifecycle — the second pass may detect drift
 * that the first pass already partially repaired.
 */
export interface DriftHandler<T extends DriftRecord = DriftRecord> {
  kind: T["kind"];
  detect: (state: GSDState, ctx: DriftContext) => T[] | Promise<T[]>;
  repair: (record: T, ctx: DriftContext) => Promise<void> | void;
}

/**
 * Result of a successful reconcileBeforeDispatch call.
 *
 * `blockers` are TERMINAL conditions (DB unavailable, slice lock invalid,
 * dependency cycle) that reconciliation cannot resolve. The caller decides
 * how to handle them; the orchestrator adapter at auto.ts maps non-empty
 * blockers to ok=false for the orchestrator's InvariantAdapterResult.
 *
 * On repair failure or drift persisting past the cap, reconcileBeforeDispatch
 * throws ReconciliationFailedError instead of returning.
 */
export interface ReconciliationResult {
  ok: true;
  stateSnapshot: GSDState;
  repaired: readonly DriftRecord[];
  blockers: readonly string[];
}

/**
 * Dependencies for reconcileBeforeDispatch. Tests inject fakes for the
 * registry and state derivation; production callers use defaults.
 */
export interface ReconciliationDeps {
  invalidateStateCache: () => void;
  deriveState: (
    basePath: string,
    opts?: DeriveStateOptions,
  ) => Promise<GSDState>;
  /**
   * Override of the drift handler catalog. Defaults to DRIFT_REGISTRY. Each
   * handler is parameterized over its own DriftRecord variant; the union of
   * disjoint parameter types in repair forces the array element type to
   * DriftHandler<any> here (see registry.ts comment).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registry?: ReadonlyArray<DriftHandler<any>>;
  deriveStateOptions?: DeriveStateOptions;
}
