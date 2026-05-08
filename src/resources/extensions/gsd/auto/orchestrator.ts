import type { AutoAdvanceResult, AutoOrchestrationModule, AutoOrchestratorDeps, AutoSessionContext, AutoStatus } from "./contracts.js";

function now(): number {
  return Date.now();
}

export class AutoOrchestrator implements AutoOrchestrationModule {
  private status: AutoStatus = {
    phase: "idle",
    transitionCount: 0,
  };
  private readonly deps: AutoOrchestratorDeps;
  private lastAdvanceKey: string | null = null;

  public constructor(deps: AutoOrchestratorDeps) {
    this.deps = deps;
  }

  public async start(_sessionContext: AutoSessionContext): Promise<AutoAdvanceResult> {
    this.lastAdvanceKey = null;
    this.status.phase = "running";
    this.bumpTransition();
    await this.deps.runtime.journalTransition({ name: "start" });
    await this.deps.notifications.notifyLifecycle({ name: "start" });
    return this.advance();
  }

  public async advance(): Promise<AutoAdvanceResult> {
    try {
      await this.deps.runtime.ensureLockOwnership();
      const gate = await this.deps.health.preAdvanceGate();
      if (!gate.allow) {
        const blocked: AutoAdvanceResult = { kind: "blocked", reason: gate.reason ?? "health gate blocked" };
        await this.deps.runtime.journalTransition({ name: "advance-blocked", reason: blocked.reason });
        await this.deps.health.postAdvanceRecord(blocked);
        return blocked;
      }

      const decision = await this.deps.dispatch.decideNextUnit();
      if (!decision) {
        const stopped: AutoAdvanceResult = { kind: "stopped", reason: "no remaining units" };
        this.status.phase = "stopped";
        this.status.activeUnit = undefined;
        this.lastAdvanceKey = null;
        this.bumpTransition();
        await this.deps.runtime.journalTransition({ name: "advance-stopped", reason: stopped.reason });
        await this.deps.health.postAdvanceRecord(stopped);
        return stopped;
      }

      const nextKey = `${decision.unitType}:${decision.unitId}`;
      if (this.lastAdvanceKey === nextKey) {
        const blocked: AutoAdvanceResult = { kind: "blocked", reason: "idempotent advance: unit already active" };
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
      await this.deps.worktree.prepareForUnit(decision.unitType, decision.unitId);
      await this.deps.worktree.syncAfterUnit(decision.unitType, decision.unitId);

      const advanced: AutoAdvanceResult = { kind: "advanced" };
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
    this.status.phase = "running";
    this.bumpTransition();
    await this.deps.runtime.journalTransition({ name: "resume" });
    await this.deps.notifications.notifyLifecycle({ name: "resume" });
    return this.advance();
  }

  public async stop(reason: string): Promise<AutoAdvanceResult> {
    if (this.status.phase === "stopped") {
      return { kind: "stopped", reason };
    }
    await this.deps.worktree.cleanupOnStop(reason);
    this.status.phase = "stopped";
    this.status.activeUnit = undefined;
    this.lastAdvanceKey = null;
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
