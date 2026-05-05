import type { GSDState } from "../types.js";
import type { ToolsPolicy } from "../unit-context-manifest.js";

export interface AutoSessionContext {
  basePath: string;
  trigger: "guided-flow" | "resume" | "auto-loop" | "manual";
}

export interface AutoStatus {
  phase: "idle" | "running" | "paused" | "stopped" | "error";
  activeUnit?: {
    unitType: string;
    unitId: string;
  };
  lastTransitionAt?: number;
  transitionCount: number;
}

export interface AutoAdvanceResult {
  kind: "advanced" | "blocked" | "paused" | "stopped" | "error";
  reason?: string;
  stateSnapshot?: GSDState;
}

export type RuntimeInvariantFailureKind =
  | "state-reconciliation-blocked"
  | "tool-contract-invalid"
  | "worktree-root-invalid";

export interface RuntimeInvariantFailure {
  kind: RuntimeInvariantFailureKind;
  reason: string;
  unitType?: string;
  unitId?: string;
  remediation?: string;
}

export interface UnitToolContract {
  unitType: string;
  unitId: string;
  requiredWorkflowTools: readonly string[];
  toolsPolicy: ToolsPolicy | null;
  sourceWrites: boolean;
  preconditions: readonly string[];
  warnings: readonly string[];
}

export interface AutoOrchestrationModule {
  start(sessionContext: AutoSessionContext): Promise<AutoAdvanceResult>;
  advance(): Promise<AutoAdvanceResult>;
  resume(): Promise<AutoAdvanceResult>;
  stop(reason: string): Promise<AutoAdvanceResult>;
  getStatus(): AutoStatus;
}

export type StateReconciliationRepairKind =
  | "db-refresh"
  | "stale-sketch-flag"
  | "db-projection-repair";

export type StateReconciliationRepairStatus =
  | "applied"
  | "skipped"
  | "failed";

export interface StateReconciliationRepair {
  kind: StateReconciliationRepairKind;
  status: StateReconciliationRepairStatus;
  reason: string;
  dbAffecting: boolean;
}

export type StateReconciliationBlockerKind =
  | "db-unavailable"
  | "state-derive-failed"
  | "state-derived-blocker";

export interface StateReconciliationBlocker {
  kind: StateReconciliationBlockerKind;
  reason: string;
  fatal: boolean;
}

export interface StateReconciliationResult {
  allow: boolean;
  reason?: string;
  stateSnapshot?: GSDState;
  repairs: readonly StateReconciliationRepair[];
  blockers: readonly StateReconciliationBlocker[];
}

export interface ReconcileBeforeDispatchInput {
  basePath?: string;
  stateBasePath?: string;
  projectionBasePath?: string;
  reason?: "orchestrator-advance" | "legacy-pre-dispatch" | "merge-reconcile";
}

export interface StateReconciliationAdapter {
  reconcileBeforeDispatch(input: ReconcileBeforeDispatchInput): Promise<StateReconciliationResult>;
}

export interface DispatchAdapter {
  decideNextUnit(input: {
    stateSnapshot?: GSDState;
  }): Promise<{
    unitType: string;
    unitId: string;
    reason: string;
    preconditions: string[];
  } | null>;
}

export interface ToolContractAdapter {
  compileUnitToolContract(input: {
    unitType: string;
    unitId: string;
    preconditions: string[];
  }): Promise<{
    allow: boolean;
    reason?: string;
    contract?: UnitToolContract;
  }>;
}

export interface RecoveryAdapter {
  classifyAndRecover(input: {
    error: unknown;
    unitType?: string;
    unitId?: string;
  }): Promise<{
    action: "retry" | "escalate" | "stop";
    reason: string;
  }>;
}

export interface WorktreeAdapter {
  prepareForUnit(unitType: string, unitId: string, contract?: UnitToolContract): Promise<{
    allow: boolean;
    reason?: string;
    warnings?: readonly string[];
  }>;
  cleanupOnStop(reason: string): Promise<void>;
}

export interface HealthAdapter {
  preAdvanceGate(): Promise<{ allow: boolean; reason?: string }>;
  postAdvanceRecord(result: AutoAdvanceResult): Promise<void>;
}

export interface RuntimePersistenceAdapter {
  ensureLockOwnership(): Promise<void>;
  journalTransition(event: {
    name: string;
    reason?: string;
    unitType?: string;
    unitId?: string;
  }): Promise<void>;
}

export interface NotificationAdapter {
  notifyLifecycle(event: {
    name: string;
    detail?: string;
  }): Promise<void>;
}

export interface AutoOrchestratorDeps {
  stateReconciliation: StateReconciliationAdapter;
  dispatch: DispatchAdapter;
  toolContract: ToolContractAdapter;
  recovery: RecoveryAdapter;
  worktree: WorktreeAdapter;
  health: HealthAdapter;
  runtime: RuntimePersistenceAdapter;
  notifications: NotificationAdapter;
}
