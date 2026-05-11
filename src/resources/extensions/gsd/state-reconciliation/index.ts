// Project/App: GSD-2
// File Purpose: ADR-017 drift-driven State Reconciliation Module entry point.
// reconcileBeforeDispatch runs before every Dispatch decision and worker spawn.

import {
  deriveState as defaultDeriveState,
  invalidateStateCache as defaultInvalidate,
} from "../state.js";
import type { GSDState } from "../types.js";

import {
  ReconciliationFailedError,
  type ReconciliationFailureDetail,
} from "./errors.js";
import { DRIFT_REGISTRY } from "./registry.js";
import type {
  DriftContext,
  DriftHandler,
  DriftRecord,
  ReconciliationDeps,
  ReconciliationResult,
} from "./types.js";

export type {
  DriftContext,
  DriftHandler,
  DriftRecord,
  ReconciliationDeps,
  ReconciliationResult,
} from "./types.js";
export { ReconciliationFailedError } from "./errors.js";
export type { ReconciliationFailureDetail } from "./errors.js";
export { DRIFT_REGISTRY } from "./registry.js";

const MAX_PASSES = 2;

const defaultDeps: ReconciliationDeps = {
  invalidateStateCache: defaultInvalidate,
  deriveState: defaultDeriveState,
};

/**
 * Drift-driven pre-dispatch reconciliation per ADR-017.
 *
 * Lifecycle: derive → detect drift → apply repairs → re-derive. Capped at
 * MAX_PASSES (=2) cycles. The loop runs only when the prior pass fully
 * succeeded but re-derive surfaces NEW drift (cascading repairs — e.g.
 * fixing milestone registration uncovers a downstream completion-timestamp
 * drift).
 *
 * Returns ok=true with `repaired` and terminal `blockers` populated.
 * Throws ReconciliationFailedError when:
 *   - any repair function throws within a pass, or
 *   - drift persists after the cap.
 */
export async function reconcileBeforeDispatch(
  basePath: string,
  deps: ReconciliationDeps = defaultDeps,
): Promise<ReconciliationResult> {
  const registry = deps.registry ?? DRIFT_REGISTRY;
  const repaired: DriftRecord[] = [];

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    deps.invalidateStateCache();
    const stateSnapshot = await deps.deriveState(basePath, deps.deriveStateOptions);
    const ctx: DriftContext = { basePath, state: stateSnapshot };

    const drift = await detectAllDrift(stateSnapshot, ctx, registry, pass);
    if (drift.length === 0) {
      return {
        ok: true,
        stateSnapshot,
        repaired,
        blockers: stateSnapshot.blockers ?? [],
      };
    }

    const failures: ReconciliationFailureDetail[] = [];
    for (const record of drift) {
      const handler = registry.find((h) => h.kind === record.kind);
      if (!handler) {
        failures.push({
          drift: record,
          cause: new Error(
            `No drift handler registered for kind "${record.kind}"`,
          ),
        });
        continue;
      }
      try {
        await handler.repair(record, ctx);
        repaired.push(record);
      } catch (cause) {
        failures.push({ drift: record, cause });
      }
    }

    if (failures.length > 0) {
      throw new ReconciliationFailedError({ failures, pass });
    }
    // Pass fully succeeded; loop runs again to detect cascading drift.
  }

  // After MAX_PASSES, one more derive+detect to verify nothing persists.
  deps.invalidateStateCache();
  const finalState = await deps.deriveState(basePath, deps.deriveStateOptions);
  const finalCtx: DriftContext = { basePath, state: finalState };
  const persistent = await detectAllDrift(finalState, finalCtx, registry);

  if (persistent.length > 0) {
    throw new ReconciliationFailedError({ persistentDrift: persistent });
  }

  return {
    ok: true,
    stateSnapshot: finalState,
    repaired,
    blockers: finalState.blockers ?? [],
  };
}

async function detectAllDrift(
  state: GSDState,
  ctx: DriftContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registry: ReadonlyArray<DriftHandler<any>>,
  pass?: number,
): Promise<DriftRecord[]> {
  const collected: DriftRecord[] = [];
  for (const handler of registry) {
    try {
      const detected = await handler.detect(state, ctx);
      collected.push(...detected);
    } catch (cause) {
      throw new ReconciliationFailedError({
        failures: [{ drift: { kind: handler.kind } as DriftRecord, cause }],
        pass,
      });
    }
  }
  return collected;
}
