import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { verifyExpectedArtifact } from "./auto-recovery.js";
import {
  formatCrashInfo,
  isLockProcessAlive,
  readCrashLock,
  type LockData,
} from "./crash-recovery.js";
import { gsdRoot } from "./paths.js";
import { MILESTONE_ID_RE } from "./milestone-ids.js";
import {
  synthesizeCrashRecovery,
  type RecoveryBriefing,
} from "./session-forensics.js";
import { deriveState } from "./state.js";
import type { GSDState } from "./types.js";
import { getRuntimeKv, deleteRuntimeKv } from "./db/runtime-kv.js";

export type InterruptedSessionClassification =
  | "none"
  | "running"
  | "recoverable"
  | "stale";

export interface PausedSessionMetadata {
  milestoneId?: string;
  worktreePath?: string | null;
  originalBasePath?: string;
  stepMode?: boolean;
  pausedAt?: string;
  sessionFile?: string | null;
  unitType?: string;
  unitId?: string;
  activeEngineId?: string;
  activeRunDir?: string | null;
  autoStartTime?: number;
  milestoneLock?: string | null;
  pauseReason?: string;
}

export interface InterruptedSessionAssessment {
  classification: InterruptedSessionClassification;
  lock: LockData | null;
  pausedSession: PausedSessionMetadata | null;
  state: GSDState | null;
  recovery: RecoveryBriefing | null;
  recoveryPrompt: string | null;
  recoveryToolCallCount: number;
  artifactSatisfied: boolean;
  hasResumableDiskState: boolean;
  isBootstrapCrash: boolean;
}

const LEGACY_DEEP_SETUP_UNITS = new Set([
  "workflow-preferences:WORKFLOW-PREFS",
  "discuss-project:PROJECT",
  "discuss-requirements:REQUIREMENTS",
  "research-decision:RESEARCH-DECISION",
  "research-project:RESEARCH-PROJECT",
]);

function isStalePseudoMilestonePause(meta: PausedSessionMetadata): boolean {
  if (meta.activeEngineId && meta.activeEngineId !== "dev") return false;
  if (
    meta.unitType === "discuss-milestone"
    && typeof meta.unitId === "string"
    && !MILESTONE_ID_RE.test(meta.unitId)
  ) {
    return true;
  }
  if (
    typeof meta.unitType === "string"
    && typeof meta.unitId === "string"
    && LEGACY_DEEP_SETUP_UNITS.has(`${meta.unitType}:${meta.unitId}`)
  ) {
    return true;
  }
  return typeof meta.milestoneId === "string"
    && !MILESTONE_ID_RE.test(meta.milestoneId)
    && typeof meta.unitType === "string"
    && typeof meta.unitId === "string"
    && LEGACY_DEEP_SETUP_UNITS.has(`${meta.unitType}:${meta.unitId}`);
}

/**
 * runtime_kv key (global scope) that stores the most recent paused-session
 * metadata. Phase C pt 2: replaces runtime/paused-session.json. The key is
 * project-wide (not worker-scoped) because the paused state represents the
 * last time auto-mode paused on this project — there is at most one paused
 * session per project at a time.
 */
export const PAUSED_SESSION_KV_KEY = "paused_session";

export function readPausedSessionMetadata(
  basePath: string,
): PausedSessionMetadata | null {
  // basePath is unused now (the DB is workspace-scoped via the connection
  // openDatabase opened on it) but kept in the signature for callers.
  void basePath;
  const meta = getRuntimeKv<PausedSessionMetadata>("global", "", PAUSED_SESSION_KV_KEY);
  if (!meta) return null;
  if (isStalePseudoMilestonePause(meta)) {
    deleteRuntimeKv("global", "", PAUSED_SESSION_KV_KEY);
    return null;
  }
  return meta;
}

export function isBootstrapCrashLock(lock: LockData | null): boolean {
  return !!(
    lock &&
    lock.unitType === "starting" &&
    lock.unitId === "bootstrap"
  );
}

export function hasResumableDerivedState(state: GSDState | null): boolean {
  return !!(state?.activeMilestone && state.phase !== "complete");
}

export async function assessInterruptedSession(
  basePath: string,
): Promise<InterruptedSessionAssessment> {
  const pausedSession = readPausedSessionMetadata(basePath);
  const worktreeExists = pausedSession?.worktreePath
    ? existsSync(pausedSession.worktreePath)
    : false;
  const assessmentBasePath = worktreeExists ? pausedSession!.worktreePath! : basePath;
  const rawLock = readCrashLock(basePath);
  const lock = rawLock && rawLock.pid !== process.pid ? rawLock : null;

  if (!lock && !pausedSession) {
    return {
      classification: "none",
      lock: null,
      pausedSession: null,
      state: null,
      recovery: null,
      recoveryPrompt: null,
      recoveryToolCallCount: 0,
      artifactSatisfied: false,
      hasResumableDiskState: false,
      isBootstrapCrash: false,
    };
  }

  if (lock && isLockProcessAlive(lock)) {
    return {
      classification: "running",
      lock,
      pausedSession,
      state: null,
      recovery: null,
      recoveryPrompt: null,
      recoveryToolCallCount: 0,
      artifactSatisfied: false,
      hasResumableDiskState: false,
      isBootstrapCrash: false,
    };
  }

  const isBootstrapCrash = isBootstrapCrashLock(lock);
  const state = await deriveState(assessmentBasePath);
  const hasResumableDiskState = hasResumableDerivedState(state);
  const artifactSatisfied = !!(
    lock &&
    !isBootstrapCrash &&
    verifyExpectedArtifact(lock.unitType, lock.unitId, assessmentBasePath)
  );

  let recovery: RecoveryBriefing | null = null;
  if (lock && !isBootstrapCrash && !artifactSatisfied) {
    recovery = synthesizeCrashRecovery(
      assessmentBasePath,
      lock.unitType,
      lock.unitId,
      lock.sessionFile,
      join(gsdRoot(assessmentBasePath), "activity"),
    );
  }

  const recoveryToolCallCount = recovery?.trace.toolCallCount ?? 0;
  const recoveryPrompt = recoveryToolCallCount > 0 ? recovery!.prompt : null;

  if (isBootstrapCrash) {
    return {
      classification: pausedSession ? "recoverable" : "stale",
      lock,
      pausedSession,
      state,
      recovery,
      recoveryPrompt,
      recoveryToolCallCount,
      artifactSatisfied,
      hasResumableDiskState,
      isBootstrapCrash: true,
    };
  }

  if (!hasResumableDiskState && pausedSession && !lock && recoveryToolCallCount === 0) {
    return {
      classification: "stale",
      lock,
      pausedSession,
      state,
      recovery,
      recoveryPrompt,
      recoveryToolCallCount,
      artifactSatisfied,
      hasResumableDiskState,
      isBootstrapCrash: false,
    };
  }

  if (lock && artifactSatisfied && !hasResumableDiskState && recoveryToolCallCount === 0) {
    return {
      classification: "stale",
      lock,
      pausedSession,
      state,
      recovery,
      recoveryPrompt,
      recoveryToolCallCount,
      artifactSatisfied,
      hasResumableDiskState,
      isBootstrapCrash: false,
    };
  }

  const hasStrongRecoverySignal =
    hasResumableDiskState || recoveryToolCallCount > 0;

  return {
    classification: hasStrongRecoverySignal ? "recoverable" : "stale",
    lock,
    pausedSession,
    state,
    recovery,
    recoveryPrompt,
    recoveryToolCallCount,
    artifactSatisfied,
    hasResumableDiskState,
    isBootstrapCrash: false,
  };
}

export function formatInterruptedSessionSummary(
  assessment: InterruptedSessionAssessment,
): string[] {
  if (assessment.lock) return [formatCrashInfo(assessment.lock)];

  if (assessment.pausedSession?.milestoneId) {
    return [
      `Paused auto-mode session detected for ${assessment.pausedSession.milestoneId}.`,
    ];
  }

  return ["Paused auto-mode session detected."];
}

export function formatInterruptedSessionRunningMessage(
  assessment: InterruptedSessionAssessment,
): string {
  const pid = assessment.lock?.pid;
  return pid
    ? `Another auto-mode session (PID ${pid}) appears to be running.\nStop it with \`kill ${pid}\` before starting a new session.`
    : "Another auto-mode session appears to be running.";
}
