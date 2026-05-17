// Project/App: GSD-2
// File Purpose: Auto Orchestration module interfaces and ADR-015 invariant adapter contracts.

import type { GSDState } from "../types.js";
import type { MinimalModelRegistry } from "../context-budget.js";
import type { AutoSession } from "./session.js";

export interface AutoSessionContext {
  basePath: string;
  trigger: "guided-flow" | "resume" | "auto-loop" | "manual";
}

export interface UnitRef {
  unitType: string;
  unitId: string;
}

export interface AutoStatus {
  phase: "idle" | "running" | "paused" | "stopped" | "error";
  activeUnit?: UnitRef;
  lastTransitionAt?: number;
  transitionCount: number;
}

export type AutoAdvanceResult =
  | { kind: "started" }
  | { kind: "resumed" }
  | { kind: "advanced"; unit: UnitRef; stateSnapshot: GSDState }
  | { kind: "blocked"; reason: string; action: "pause" | "stop"; stateSnapshot?: GSDState }
  | { kind: "stopped"; reason: string; stateSnapshot?: GSDState }
  | { kind: "paused"; reason: string }
  | { kind: "error"; reason: string };

export interface AutoOrchestrationModule {
  start(sessionContext: AutoSessionContext): Promise<AutoAdvanceResult>;
  advance(): Promise<AutoAdvanceResult>;
  resume(): Promise<AutoAdvanceResult>;
  stop(reason: string): Promise<AutoAdvanceResult>;
  getStatus(): AutoStatus;
}

export interface DispatchAdapter {
  decideNextUnit(input: {
    stateSnapshot: GSDState;
    /** Optional live session context, forwarded to dispatch rules that need session-derived state. */
    session?: AutoSession;
    /** Mirrors `DispatchContext.structuredQuestionsAvailable` — "true"/"false" string per the dispatch contract. */
    structuredQuestionsAvailable?: "true" | "false";
    /** Session model context window in tokens, forwarded to the budget engine. */
    sessionContextWindow?: number;
    /** Session model provider, used for provider-specific effective context windows. */
    sessionProvider?: string;
    /** Model registry for executor-model lookups inside the budget engine. */
    modelRegistry?: MinimalModelRegistry;
  }): Promise<
    | {
        kind: "blocked";
        reason: string;
        action: "pause" | "stop";
      }
    | {
        unitType: string;
        unitId: string;
        reason: string;
        preconditions: string[];
      }
    | null
  >;
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

export type InvariantAdapterResult =
  | { ok: true; reason?: string; stateSnapshot?: GSDState }
  | { ok: false; reason: string; stateSnapshot?: GSDState };

export interface StateReconciliationAdapter {
  reconcileBeforeDispatch(): Promise<InvariantAdapterResult & { stateSnapshot?: GSDState }>;
}

export interface ToolContractAdapter {
  compileUnitToolContract(unitType: string, unitId: string): Promise<InvariantAdapterResult>;
}

export interface WorktreeAdapter {
  prepareForUnit(unitType: string, unitId: string): Promise<InvariantAdapterResult>;
  syncAfterUnit(unitType: string, unitId: string): Promise<void>;
  cleanupOnStop(reason: string): Promise<void>;
}

export type HealthGateResult =
  | { kind: "pass"; fixesApplied?: readonly string[] }
  | { kind: "fail"; reason: string }
  | { kind: "threw"; error: unknown };

export interface HealthAdapter {
  checkResourcesStale(): string | null;
  preAdvanceGate(): Promise<HealthGateResult>;
  postAdvanceRecord(result: AutoAdvanceResult): Promise<void>;
}

export interface UokGateInput {
  gateId: string;
  gateType: "policy" | "execution";
  outcome: "pass" | "fail" | "manual-attention";
  failureClass: "none" | "policy" | "manual-attention";
  rationale: string;
  findings?: string;
  milestoneId?: string;
}

export interface UokGateAdapter {
  emit(input: UokGateInput): Promise<void>;
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
  uokGate: UokGateAdapter;
}
