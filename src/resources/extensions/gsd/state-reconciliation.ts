// Project/App: GSD-2
// File Purpose: ADR-017 State Reconciliation Module — public entry point.
// Re-exports the drift-driven implementation from the state-reconciliation/
// folder so existing import paths (./state-reconciliation.js) keep working.

export {
  reconcileBeforeDispatch,
  ReconciliationFailedError,
  DRIFT_REGISTRY,
} from "./state-reconciliation/index.js";

export type {
  DriftContext,
  DriftHandler,
  DriftRecord,
  ReconciliationDeps,
  ReconciliationFailureDetail,
  ReconciliationResult,
} from "./state-reconciliation/index.js";

export { reconcileBeforeSpawn } from "./state-reconciliation/spawn-gate.js";
export type {
  SpawnGateDeps,
  SpawnGateResult,
} from "./state-reconciliation/spawn-gate.js";
