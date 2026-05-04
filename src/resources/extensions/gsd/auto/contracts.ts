import type { GSDState } from "../types.js";

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

export interface AutoOrchestrationModule {
  start(sessionContext: AutoSessionContext): Promise<AutoAdvanceResult>;
  advance(): Promise<AutoAdvanceResult>;
  resume(): Promise<AutoAdvanceResult>;
  stop(reason: string): Promise<AutoAdvanceResult>;
  getStatus(): AutoStatus;
}

export interface DispatchAdapter {
  decideNextUnit(): Promise<{
    unitType: string;
    unitId: string;
    reason: string;
    preconditions: string[];
  } | null>;
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
  prepareForUnit(unitType: string, unitId: string): Promise<void>;
  syncAfterUnit(unitType: string, unitId: string): Promise<void>;
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
  dispatch: DispatchAdapter;
  recovery: RecoveryAdapter;
  worktree: WorktreeAdapter;
  health: HealthAdapter;
  runtime: RuntimePersistenceAdapter;
  notifications: NotificationAdapter;
}
