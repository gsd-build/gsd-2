// Project/App: GSD-2
// File Purpose: Auto Orchestration module implementation and ADR-015 invariant pipeline owner.

import type { AutoAdvanceResult, AutoOrchestrationModule, AutoOrchestratorDeps, AutoSessionContext, AutoStatus } from "./contracts.js";

function now(): number {
  return Date.now();
}

/**
 * Size of the dispatch-decision ring buffer used by the Auto Orchestration
 * module's stuck-loop detector. When the same `${unitType}:${unitId}` key
 * fills the window, advance() blocks with `action: "stop"`.
 *
 * Mirrors the legacy `STUCK_WINDOW_SIZE` in auto/phases.ts so behaviour is
 * preserved across the eventual cutover (issue #5791).
 */
export const STUCK_WINDOW_SIZE = 6;

export class AutoOrchestrator implements AutoOrchestrationModule {
  private status: AutoStatus = {
    phase: "idle",
    transitionCount: 0,
  };
  private readonly deps: AutoOrchestratorDeps;
  private lastAdvanceKey: string | null = null;
  private dispatchKeyWindow: string[] = [];

  public constructor(deps: AutoOrchestratorDeps) {
    this.deps = deps;
  }

  public async start(_sessionContext: AutoSessionContext): Promise<AutoAdvanceResult> {
    this.lastAdvanceKey = null;
    this.dispatchKeyWindow = [];
    this.status.phase = "running";
    this.bumpTransition();
    await this.deps.runtime.journalTransition({ name: "start" });
    await this.deps.notifications.notifyLifecycle({ name: "start" });
    return { kind: "started" };
  }

  public async advance(): Promise<AutoAdvanceResult> {
    try {
      await this.deps.runtime.ensureLockOwnership();

      const staleMsg = this.deps.health.checkResourcesStale();
      if (staleMsg) {
        await this.deps.uokGate.emit({
          gateId: "resource-version-guard",
          gateType: "policy",
          outcome: "fail",
          failureClass: "policy",
          rationale: "resource version guard blocked dispatch",
          findings: staleMsg,
        });
        const blocked: AutoAdvanceResult = { kind: "blocked", reason: staleMsg, action: "pause" };
        await this.deps.runtime.journalTransition({ name: "advance-blocked", reason: blocked.reason });
        await this.deps.health.postAdvanceRecord(blocked);
        return blocked;
      }
      await this.deps.uokGate.emit({
        gateId: "resource-version-guard",
        gateType: "policy",
        outcome: "pass",
        failureClass: "none",
        rationale: "resource version guard passed",
      });

      const gate = await this.deps.health.preAdvanceGate();
      if (gate.kind === "fail") {
        await this.deps.uokGate.emit({
          gateId: "pre-dispatch-health-gate",
          gateType: "execution",
          outcome: "manual-attention",
          failureClass: "manual-attention",
          rationale: "pre-dispatch health gate blocked dispatch",
          findings: gate.reason,
        });
        const blocked: AutoAdvanceResult = { kind: "blocked", reason: gate.reason, action: "pause" };
        await this.deps.runtime.journalTransition({ name: "advance-blocked", reason: blocked.reason });
        await this.deps.health.postAdvanceRecord(blocked);
        return blocked;
      }
      if (gate.kind === "threw") {
        await this.deps.uokGate.emit({
          gateId: "pre-dispatch-health-gate",
          gateType: "execution",
          outcome: "manual-attention",
          failureClass: "manual-attention",
          rationale: "pre-dispatch health gate threw unexpectedly",
          findings: String(gate.error),
        });
        // intentional fall-through: matches runPreDispatch behaviour
      } else {
        await this.deps.uokGate.emit({
          gateId: "pre-dispatch-health-gate",
          gateType: "execution",
          outcome: "pass",
          failureClass: "none",
          rationale: "pre-dispatch health gate passed",
          findings: gate.fixesApplied?.join(", ") ?? "",
        });
      }

      const reconciliation = await this.deps.stateReconciliation.reconcileBeforeDispatch();
      if (!reconciliation.ok || !reconciliation.stateSnapshot) {
        const blocked: AutoAdvanceResult = {
          kind: "blocked",
          reason: reconciliation.reason ?? "state reconciliation produced no snapshot",
          action: "pause",
          stateSnapshot: reconciliation.stateSnapshot,
        };
        await this.deps.runtime.journalTransition({ name: "advance-blocked", reason: blocked.reason });
        await this.deps.health.postAdvanceRecord(blocked);
        return blocked;
      }

      const decision = await this.deps.dispatch.decideNextUnit({ stateSnapshot: reconciliation.stateSnapshot });
      if (!decision) {
        const stopped: AutoAdvanceResult = { kind: "stopped", reason: "no remaining units", stateSnapshot: reconciliation.stateSnapshot };
        this.status.phase = "stopped";
        this.status.activeUnit = undefined;
        this.lastAdvanceKey = null;
        this.dispatchKeyWindow = [];
        this.bumpTransition();
        await this.deps.runtime.journalTransition({ name: "advance-stopped", reason: stopped.reason });
        await this.deps.health.postAdvanceRecord(stopped);
        return stopped;
      }
      if (!("unitType" in decision)) {
        const blocked: AutoAdvanceResult = {
          kind: "blocked",
          reason: decision.reason,
          action: decision.action,
          stateSnapshot: reconciliation.stateSnapshot,
        };
        await this.deps.runtime.journalTransition({ name: "advance-blocked", reason: blocked.reason });
        await this.deps.health.postAdvanceRecord(blocked);
        return blocked;
      }

      const nextKey = `${decision.unitType}:${decision.unitId}`;

      // Record every dispatch decision in the ring buffer before pre-flight
      // checks so the stuck-loop detector observes the full decision history
      // (including decisions that idempotency would otherwise short-circuit).
      // The ring is capped at STUCK_WINDOW_SIZE and evicts oldest-first.
      this.dispatchKeyWindow.push(nextKey);
      if (this.dispatchKeyWindow.length > STUCK_WINDOW_SIZE) {
        this.dispatchKeyWindow.shift();
      }

      // Idempotency: same key as immediately previous successful advance.
      // This is the soft, fast-path block kept from #5786. It only fires when
      // the ring is NOT yet saturated for this key — once the ring is full of
      // `nextKey`, the stuck-loop verdict takes precedence (see below). Both
      // checks coexist: idempotency for the common immediate-repeat case,
      // stuck-loop for the saturated-window case.
      const matchingCount = this.dispatchKeyWindow.filter((k) => k === nextKey).length;
      if (this.lastAdvanceKey === nextKey && matchingCount < STUCK_WINDOW_SIZE) {
        const blocked: AutoAdvanceResult = { kind: "blocked", reason: "idempotent advance: unit already active", action: "pause" };
        await this.deps.runtime.journalTransition({
          name: "advance-blocked",
          reason: blocked.reason,
          unitType: decision.unitType,
          unitId: decision.unitId,
        });
        await this.deps.health.postAdvanceRecord(blocked);
        return blocked;
      }

      // Stuck-loop detection: when the ring is saturated with copies of
      // `nextKey` (count >= STUCK_WINDOW_SIZE), the orchestrator has been
      // picking the same unit across the whole window and must hard-stop with
      // a diagnosable reason.
      if (matchingCount >= STUCK_WINDOW_SIZE) {
        const blocked: AutoAdvanceResult = {
          kind: "blocked",
          reason: `stuck-loop: ${nextKey} picked ${matchingCount} times`,
          action: "stop",
        };
        await this.deps.runtime.journalTransition({
          name: "advance-blocked",
          reason: blocked.reason,
          unitType: decision.unitType,
          unitId: decision.unitId,
        });
        await this.deps.health.postAdvanceRecord(blocked);
        return blocked;
      }

      const contract = await this.deps.toolContract.compileUnitToolContract(decision.unitType, decision.unitId);
      if (!contract.ok) {
        const blocked: AutoAdvanceResult = {
          kind: "blocked",
          reason: contract.reason,
          action: "pause",
          stateSnapshot: reconciliation.stateSnapshot,
        };
        await this.deps.runtime.journalTransition({
          name: "advance-blocked",
          reason: blocked.reason,
          unitType: decision.unitType,
          unitId: decision.unitId,
        });
        await this.deps.health.postAdvanceRecord(blocked);
        return blocked;
      }

      const worktree = await this.deps.worktree.prepareForUnit(decision.unitType, decision.unitId);
      if (!worktree.ok) {
        const blocked: AutoAdvanceResult = {
          kind: "blocked",
          reason: worktree.reason,
          action: "pause",
          stateSnapshot: reconciliation.stateSnapshot,
        };
        await this.deps.runtime.journalTransition({
          name: "advance-blocked",
          reason: blocked.reason,
          unitType: decision.unitType,
          unitId: decision.unitId,
        });
        await this.deps.health.postAdvanceRecord(blocked);
        return blocked;
      }

      this.status.activeUnit = { unitType: decision.unitType, unitId: decision.unitId };
      this.status.phase = "running";
      this.lastAdvanceKey = nextKey;
      this.bumpTransition();

      await this.deps.runtime.journalTransition({
        name: "advance",
        reason: decision.reason,
        unitType: decision.unitType,
        unitId: decision.unitId,
      });
      await this.deps.worktree.syncAfterUnit(decision.unitType, decision.unitId);

      const advanced: AutoAdvanceResult = {
        kind: "advanced",
        unit: { unitType: decision.unitType, unitId: decision.unitId },
        stateSnapshot: reconciliation.stateSnapshot,
      };
      await this.deps.health.postAdvanceRecord(advanced);
      return advanced;
    } catch (error) {
      const recovery = await this.deps.recovery.classifyAndRecover({
        error,
        unitType: this.status.activeUnit?.unitType,
        unitId: this.status.activeUnit?.unitId,
      });
      const result: AutoAdvanceResult = recovery.action === "retry"
        ? { kind: "paused", reason: recovery.reason }
        : recovery.action === "escalate"
          ? { kind: "error", reason: recovery.reason }
          : { kind: "stopped", reason: recovery.reason };

      if (result.kind === "paused") {
        this.status.phase = "paused";
      } else if (result.kind === "stopped") {
        this.status.phase = "stopped";
      } else {
        this.status.phase = "error";
      }

      if (result.kind === "stopped") {
        this.lastAdvanceKey = null;
        this.dispatchKeyWindow = [];
        this.status.activeUnit = undefined;
      }
      this.bumpTransition();

      const journalName = result.kind === "paused"
        ? "advance-paused"
        : result.kind === "stopped"
          ? "advance-stopped"
          : "advance-error";
      await this.deps.runtime.journalTransition({ name: journalName, reason: recovery.reason });

      if (result.kind === "paused") {
        await this.deps.notifications.notifyLifecycle({ name: "pause", detail: recovery.reason });
      } else if (result.kind === "stopped") {
        await this.deps.notifications.notifyLifecycle({ name: "stopped", detail: recovery.reason });
      } else if (result.kind === "error") {
        await this.deps.notifications.notifyLifecycle({ name: "error", detail: recovery.reason });
      }
      await this.deps.health.postAdvanceRecord(result);
      return result;
    }
  }

  public async resume(): Promise<AutoAdvanceResult> {
    this.lastAdvanceKey = null;
    this.dispatchKeyWindow = [];
    this.status.phase = "running";
    this.bumpTransition();
    await this.deps.runtime.journalTransition({ name: "resume" });
    await this.deps.notifications.notifyLifecycle({ name: "resume" });
    return { kind: "resumed" };
  }

  public async stop(reason: string): Promise<AutoAdvanceResult> {
    if (this.status.phase === "stopped") {
      return { kind: "stopped", reason };
    }
    await this.deps.worktree.cleanupOnStop(reason);
    this.status.phase = "stopped";
    this.status.activeUnit = undefined;
    this.lastAdvanceKey = null;
    this.dispatchKeyWindow = [];
    this.bumpTransition();
    await this.deps.runtime.journalTransition({ name: "stop", reason });
    await this.deps.notifications.notifyLifecycle({ name: "stop", detail: reason });
    return { kind: "stopped", reason };
  }

  public getStatus(): AutoStatus {
    return { ...this.status, activeUnit: this.status.activeUnit ? { ...this.status.activeUnit } : undefined };
  }

  private bumpTransition(): void {
    this.status.transitionCount += 1;
    this.status.lastTransitionAt = now();
  }
}

export function createAutoOrchestrator(deps: AutoOrchestratorDeps): AutoOrchestrationModule {
  return new AutoOrchestrator(deps);
}
