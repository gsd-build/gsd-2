// Project/App: GSD-2
// File Purpose: ADR-017 #5707 caller-closure helper. Parent processes that
// spawn auto-loop workers must reconcile before spawn — otherwise each
// worker independently detects+repairs the same drift, racing on shared
// state. This helper centralises the reconcile+catch flow so the two
// production spawn sites (commands/handlers/parallel.ts and auto/phases.ts
// startSliceParallel) share one contract.

import {
  reconcileBeforeDispatch,
  ReconciliationFailedError,
  type ReconciliationDeps,
} from "./index.js";

export type SpawnGateResult =
  | { ok: true; reason?: string }
  | { ok: false; reason: string };

export interface SpawnGateDeps extends Partial<ReconciliationDeps> {
  reconcile?: typeof reconcileBeforeDispatch;
}

/**
 * Run reconciliation before spawning workers. Returns ok=true when the run
 * completed without throwing (blockers ride along but don't fail the gate —
 * spawn callers can choose how to handle them). On
 * ReconciliationFailedError, returns ok=false with the error message so the
 * caller can surface it to the user without re-throwing.
 *
 * Other unexpected errors propagate; they are not part of the drift
 * taxonomy.
 */
export async function reconcileBeforeSpawn(
  basePath: string,
  deps: SpawnGateDeps = {},
): Promise<SpawnGateResult> {
  const reconcileFn = deps.reconcile ?? reconcileBeforeDispatch;
  try {
    const result = await reconcileFn(basePath, deps as ReconciliationDeps);
    if (result.blockers.length > 0) {
      return {
        ok: false,
        reason: `Reconciliation blocker: ${result.blockers[0]}`,
      };
    }
    const repairedKinds = result.repaired.map((d) => d.kind);
    return {
      ok: true,
      reason:
        repairedKinds.length > 0
          ? `repaired before spawn: ${repairedKinds.join(", ")}`
          : undefined,
    };
  } catch (err) {
    if (err instanceof ReconciliationFailedError) {
      return { ok: false, reason: err.message };
    }
    throw err;
  }
}
