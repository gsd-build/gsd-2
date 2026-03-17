import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import type { GitServiceImpl } from "../git-service.js";
import type { CaptureEntry } from "../captures.js";
export type BudgetAlertLevel = 0 | 75 | 80 | 90 | 100;
export interface CompletedUnit { type: string; id: string; startedAt: number; finishedAt: number; }
export interface CurrentUnit { type: string; id: string; startedAt: number; }
export interface UnitRouting { tier: string; modelDowngraded: boolean; }
export interface StartModel { provider: string; id: string; }
export const MAX_UNIT_DISPATCHES = 3;
export const STUB_RECOVERY_THRESHOLD = 2;
export const MAX_LIFETIME_DISPATCHES = 6;
export const MAX_CONSECUTIVE_SKIPS = 3;
export const DISPATCH_GAP_TIMEOUT_MS = 5_000;
export const MAX_SKIP_DEPTH = 20;
export class AutoSession {
  active = false; paused = false; stepMode = false; verbose = false;
  cmdCtx: ExtensionCommandContext | null = null;
  basePath = ""; originalBasePath = "";
  gitService: GitServiceImpl | null = null;
  readonly unitDispatchCount = new Map<string, number>();
  readonly unitLifetimeDispatches = new Map<string, number>();
  readonly unitRecoveryCount = new Map<string, number>();
  readonly unitConsecutiveSkips = new Map<string, number>();
  readonly completedKeySet = new Set<string>();
  unitTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  wrapupWarningHandle: ReturnType<typeof setTimeout> | null = null;
  idleWatchdogHandle: ReturnType<typeof setInterval> | null = null;
  dispatchGapHandle: ReturnType<typeof setTimeout> | null = null;
  currentUnit: CurrentUnit | null = null;
  currentUnitRouting: UnitRouting | null = null;
  completedUnits: CompletedUnit[] = [];
  currentMilestoneId: string | null = null;
  autoModeStartModel: StartModel | null = null;
  originalModelId: string | null = null;
  originalModelProvider: string | null = null;
  lastBudgetAlertLevel: BudgetAlertLevel = 0;
  pendingCrashRecovery: string | null = null;
  pausedSessionFile: string | null = null;
  resourceVersionOnStart: string | null = null;
  handlingAgentEnd = false; dispatching = false; skipDepth = 0;
  readonly inFlightTools = new Map<string, number>();
  autoStartTime = 0;
  lastPromptCharCount: number | undefined;
  lastBaselineCharCount: number | undefined;
  pendingQuickTasks: CaptureEntry[] = [];
  sigtermHandler: (() => void) | null = null;
  clearTimers(): void {
    if (this.unitTimeoutHandle) { clearTimeout(this.unitTimeoutHandle); this.unitTimeoutHandle = null; }
    if (this.wrapupWarningHandle) { clearTimeout(this.wrapupWarningHandle); this.wrapupWarningHandle = null; }
    if (this.idleWatchdogHandle) { clearInterval(this.idleWatchdogHandle); this.idleWatchdogHandle = null; }
    if (this.dispatchGapHandle) { clearTimeout(this.dispatchGapHandle); this.dispatchGapHandle = null; }
    this.inFlightTools.clear();
  }
  resetDispatchCounters(): void { this.unitDispatchCount.clear(); this.unitLifetimeDispatches.clear(); this.unitConsecutiveSkips.clear(); }
  get lockBasePath(): string { return this.originalBasePath || this.basePath; }
  markToolStart(id: string): void { if (this.active) this.inFlightTools.set(id, Date.now()); }
  markToolEnd(id: string): void { this.inFlightTools.delete(id); }
  get oldestInFlightToolAgeMs(): number {
    if (this.inFlightTools.size === 0) return 0;
    const now = Date.now(); let oldest = now;
    for (const ts of this.inFlightTools.values()) { if (ts < oldest) oldest = ts; }
    return now - oldest;
  }
  completeCurrentUnit(): CompletedUnit | null {
    if (!this.currentUnit) return null;
    const done: CompletedUnit = { ...this.currentUnit, finishedAt: Date.now() };
    this.completedUnits.push(done); this.currentUnit = null; return done;
  }
  reset(): void {
    this.clearTimers();
    this.active = false; this.paused = false; this.stepMode = false; this.verbose = false;
    this.cmdCtx = null; this.basePath = ""; this.originalBasePath = ""; this.gitService = null;
    this.unitDispatchCount.clear(); this.unitLifetimeDispatches.clear();
    this.unitRecoveryCount.clear(); this.unitConsecutiveSkips.clear();
    this.currentUnit = null; this.currentUnitRouting = null; this.completedUnits = [];
    this.currentMilestoneId = null; this.autoModeStartModel = null;
    this.originalModelId = null; this.originalModelProvider = null; this.lastBudgetAlertLevel = 0;
    this.pendingCrashRecovery = null; this.pausedSessionFile = null; this.resourceVersionOnStart = null;
    this.handlingAgentEnd = false; this.dispatching = false; this.skipDepth = 0;
    this.inFlightTools.clear(); this.autoStartTime = 0;
    this.lastPromptCharCount = undefined; this.lastBaselineCharCount = undefined;
    this.pendingQuickTasks = []; this.sigtermHandler = null;
  }
  toJSON(): Record<string, unknown> {
    return { active: this.active, paused: this.paused, stepMode: this.stepMode,
      basePath: this.basePath, currentMilestoneId: this.currentMilestoneId,
      currentUnit: this.currentUnit, completedUnits: this.completedUnits.length,
      completedKeySet: this.completedKeySet.size,
      unitDispatchCount: Object.fromEntries(this.unitDispatchCount),
      dispatching: this.dispatching, skipDepth: this.skipDepth };
  }
}
