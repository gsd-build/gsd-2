/**
 * Auto-mode Supervisor — SIGTERM handling, working-tree activity detection,
 * and diagnostic signal collection for stuck-vs-active classification.
 *
 * Pure functions — no module-level globals or AutoContext dependency.
 */

import { clearLock } from "./crash-recovery.js";
import { nativeHasChanges, nativeWorkingTreeStatus } from "./native-git-bridge.js";
import { getDeepDiagnostic } from "./session-forensics.js";
import type { AutoUnitRuntimeRecord } from "./unit-runtime.js";

// ─── Diagnostic Types ─────────────────────────────────────────────────────────

/** Severity levels for individual diagnostic findings. */
export type DiagnosticSeverity = "info" | "warning" | "error" | "crash";

/** A category tag for what kind of signal a finding relates to. */
export type DiagnosticCategory =
  | "bg-shell"
  | "trace"
  | "git"
  | "temporal"
  | "tool-activity";

/** A single observation from signal collection or classification. */
export interface DiagnosticFinding {
  category: DiagnosticCategory;
  message: string;
  severity: DiagnosticSeverity;
}

/** Health entry for a single bg-shell process. */
export interface BgShellHealthEntry {
  id: string;
  name: string;
  status: "crashed" | "errored" | "healthy";
  exitCode?: number | null;
  signal?: string | null;
  recentErrors?: string[];
}

/** Raw signals gathered from all available sources. */
export interface DiagnosticSignals {
  /** Formatted activity trace summary from session-forensics, or null if unavailable. */
  traceSummary: string | null;
  /** bg-shell process health entries (crashed/errored only), or null if unavailable. */
  bgShellHealth: BgShellHealthEntry[] | null;
  /** Git working-tree porcelain status, or null if unavailable. */
  gitStatus: string | null;
  /** Milliseconds since last progress signal, or null if runtime unavailable. */
  msSinceLastProgress: number | null;
  /** Total progress signals recorded, or null if runtime unavailable. */
  progressCount: number | null;
  /** Kind of the last progress signal (e.g. "tool-call", "dispatch"), or null. */
  lastProgressKind: string | null;
  /** Number of recovery attempts so far, or null if runtime unavailable. */
  recoveryAttempts: number | null;
  /** Number of in-flight (pending) tool calls. */
  inFlightToolCount: number;
  /** Age in ms of the oldest in-flight tool call, or null if none pending. */
  oldestInFlightToolAgeMs: number | null;
}

/** Classification of whether the unit is stuck and why. */
export type StuckClassificationLabel =
  | "active"
  | "stuck/crash"
  | "stuck/read-loop"
  | "stuck/error-loop"
  | "stuck/no-progress"
  | "ambiguous";

/** Result of classifying signals into a stuck-vs-active verdict. */
export interface StuckClassification {
  classification: StuckClassificationLabel;
  findings: DiagnosticFinding[];
  confidence: number;
}

/** Full diagnostic report produced on escalation to pause. */
export interface DiagnosticReport {
  signals: DiagnosticSignals;
  classification: StuckClassification;
  unitType: string;
  unitId: string;
  timestamp: number;
}

// ─── Fatal Signals (mirrors verification-gate.ts) ─────────────────────────────

const FATAL_SIGNALS = new Set(["SIGABRT", "SIGSEGV", "SIGBUS"]);

// ─── Signal Collection Options (injectable for testing) ───────────────────────

export interface CollectDiagnosticSignalsOptions {
  /** Override bg-shell process source for testing. */
  getProcesses?: () => Map<string, unknown>;
  /** Override deep diagnostic source for testing. */
  getDeepDiagnosticFn?: (basePath: string) => string | null;
  /** Override git status source for testing. */
  getGitStatusFn?: (basePath: string) => string;
}

// ─── Signal Collection ────────────────────────────────────────────────────────

/**
 * Gather diagnostic signals from all available sources.
 *
 * Pure function — all external state is provided via parameters or read
 * through existing exported functions. Each signal source is individually
 * wrapped in try/catch so a failure in one does not affect others.
 */
export async function collectDiagnosticSignals(
  basePath: string,
  _unitType: string,
  _unitId: string,
  runtime: AutoUnitRuntimeRecord | null,
  inFlightToolCount: number,
  oldestInFlightToolAgeMs: number | null,
  options?: CollectDiagnosticSignalsOptions,
): Promise<DiagnosticSignals> {
  // ── Activity trace ──────────────────────────────────────────────────
  let traceSummary: string | null = null;
  try {
    const fn = options?.getDeepDiagnosticFn ?? getDeepDiagnostic;
    traceSummary = fn(basePath);
  } catch {
    // source unavailable — leave null
  }

  // ── bg-shell process health ─────────────────────────────────────────
  let bgShellHealth: BgShellHealthEntry[] | null = null;
  try {
    let processes: Map<string, unknown>;
    if (options?.getProcesses) {
      processes = options.getProcesses();
    } else {
      const mod = await import("../bg-shell/process-manager.js");
      processes = mod.processes;
    }

    const entries: BgShellHealthEntry[] = [];
    for (const [id, raw] of processes) {
      const proc = raw as {
        id: string;
        label?: string;
        status?: string;
        alive?: boolean;
        exitCode?: number | null;
        signal?: string | null;
        recentErrors?: string[];
      };

      const name = proc.label || proc.id || id;

      // Fatal signal → crashed
      if (proc.signal && FATAL_SIGNALS.has(proc.signal)) {
        entries.push({
          id, name, status: "crashed",
          exitCode: proc.exitCode, signal: proc.signal,
          recentErrors: proc.recentErrors?.slice(0, 3),
        });
        continue;
      }

      // Crashed status
      if (proc.status === "crashed") {
        entries.push({
          id, name, status: "crashed",
          exitCode: proc.exitCode, signal: proc.signal,
          recentErrors: proc.recentErrors?.slice(0, 3),
        });
        continue;
      }

      // Non-zero exit on dead process
      if (
        !proc.alive &&
        proc.exitCode !== 0 &&
        proc.exitCode !== null &&
        proc.exitCode !== undefined
      ) {
        entries.push({
          id, name, status: "crashed",
          exitCode: proc.exitCode, signal: proc.signal,
          recentErrors: proc.recentErrors?.slice(0, 3),
        });
        continue;
      }

      // Alive process with recent errors — non-blocking
      if (proc.alive && proc.recentErrors && proc.recentErrors.length > 0) {
        entries.push({
          id, name, status: "errored",
          recentErrors: proc.recentErrors.slice(0, 3),
        });
      }
    }

    bgShellHealth = entries;
  } catch {
    // bg-shell not available — leave null
  }

  // ── Git working-tree status ─────────────────────────────────────────
  let gitStatus: string | null = null;
  try {
    const fn = options?.getGitStatusFn ?? nativeWorkingTreeStatus;
    const status = fn(basePath);
    gitStatus = status || null;
  } catch {
    // git unavailable — leave null
  }

  // ── Temporal context from runtime record ────────────────────────────
  let msSinceLastProgress: number | null = null;
  let progressCount: number | null = null;
  let lastProgressKind: string | null = null;
  let recoveryAttempts: number | null = null;

  if (runtime) {
    msSinceLastProgress = runtime.lastProgressAt
      ? Date.now() - runtime.lastProgressAt
      : null;
    progressCount = runtime.progressCount ?? null;
    lastProgressKind = runtime.lastProgressKind ?? null;
    recoveryAttempts = runtime.recoveryAttempts ?? null;
  }

  return {
    traceSummary,
    bgShellHealth,
    gitStatus,
    msSinceLastProgress,
    progressCount,
    lastProgressKind,
    recoveryAttempts,
    inFlightToolCount,
    oldestInFlightToolAgeMs,
  };
}

// ─── Stuck vs Active Classification ───────────────────────────────────────────

/** Threshold in ms for considering lastProgressAt "recent". */
const PROGRESS_RECENCY_THRESHOLD_MS = 60_000;

/** Pattern for detecting repeated reads in trace summaries (e.g. "read ×3", "read ×5"). */
const READ_LOOP_PATTERN = /read\s*[×x]\s*(\d+)/i;

/** Pattern for detecting repeated errors/failures in trace summaries. */
const ERROR_LOOP_PATTERN =
  /(?:(?:bash|shell|exec)[^\n]*(?:fail|error|exit\s*code\s*[1-9])[^\n]*\n?){2,}|(?:failed|error)\s*[×x]\s*(\d+)/i;

/**
 * Classify diagnostic signals into a stuck-vs-active verdict.
 *
 * Priority ordering (highest-severity first):
 *   1. Crash detection (stuck/crash)
 *   2. Error loop (stuck/error-loop)
 *   3. Read loop (stuck/read-loop)
 *   4. No progress (stuck/no-progress)
 *   5. Active check
 *   6. Ambiguous fallback
 *
 * Multiple findings can be present. Classification is determined by the
 * highest-severity finding.
 */
export function classifyStuckVsActive(
  signals: DiagnosticSignals,
): StuckClassification {
  const findings: DiagnosticFinding[] = [];
  let topClassification: StuckClassificationLabel = "ambiguous";
  let topConfidence = 0;

  // ── 1. Crash detection (highest priority) ───────────────────────────
  if (signals.bgShellHealth && signals.bgShellHealth.length > 0) {
    for (const entry of signals.bgShellHealth) {
      if (entry.status === "crashed") {
        const detail = entry.signal
          ? `Process '${entry.name}' received signal ${entry.signal}`
          : `Process '${entry.name}' crashed with exit code ${entry.exitCode ?? "unknown"}`;
        findings.push({
          category: "bg-shell",
          message: detail,
          severity: "crash",
        });
      }
    }
    if (findings.some((f) => f.severity === "crash")) {
      topClassification = "stuck/crash";
      topConfidence = 0.95;
    }
  }

  // ── 2. Error loop detection ─────────────────────────────────────────
  if (signals.traceSummary && ERROR_LOOP_PATTERN.test(signals.traceSummary)) {
    findings.push({
      category: "trace",
      message: "Last commands failed repeatedly with similar errors",
      severity: "error",
    });
    if (topConfidence < 0.85) {
      topClassification = "stuck/error-loop";
      topConfidence = 0.85;
    }
  }

  // ── 3. Read loop detection ──────────────────────────────────────────
  if (signals.traceSummary) {
    const readMatch = READ_LOOP_PATTERN.exec(signals.traceSummary);
    if (readMatch) {
      const count = parseInt(readMatch[1]!, 10);
      if (count >= 3) {
        findings.push({
          category: "trace",
          message: "Agent appears to be reading the same file(s) repeatedly",
          severity: "warning",
        });
        if (topConfidence < 0.8) {
          topClassification = "stuck/read-loop";
          topConfidence = 0.8;
        }
      }
    }
  }

  // ── 4. No progress detection ────────────────────────────────────────
  const isProgressStale =
    signals.msSinceLastProgress === null ||
    signals.msSinceLastProgress > PROGRESS_RECENCY_THRESHOLD_MS;
  const hasGitChanges = signals.gitStatus !== null && signals.gitStatus.trim().length > 0;
  const hasTrace = signals.traceSummary !== null && signals.traceSummary.trim().length > 0;
  const hasInFlightTools = signals.inFlightToolCount > 0;

  // We need at least one signal source to actually be available (non-null) to
  // confidently declare "no progress". If ALL sources are null, we don't know
  // enough — that's "ambiguous", not "no progress".
  const hasAnySourceAvailable =
    signals.bgShellHealth !== null ||
    signals.traceSummary !== null ||
    signals.gitStatus !== null ||
    signals.msSinceLastProgress !== null;

  if (
    isProgressStale &&
    !hasGitChanges &&
    !hasTrace &&
    !hasInFlightTools &&
    hasAnySourceAvailable &&
    topConfidence < 0.9
  ) {
    findings.push({
      category: "temporal",
      message: "No tool activity or file changes detected",
      severity: "warning",
    });
    topClassification = "stuck/no-progress";
    topConfidence = 0.9;
  }

  // ── 5. Active check ─────────────────────────────────────────────────
  // Active requires RECENT progress (within threshold). Stale progress
  // with git changes is NOT enough — temporal weighting matters.
  if (
    topConfidence < 0.7 &&
    signals.msSinceLastProgress !== null &&
    signals.msSinceLastProgress <= PROGRESS_RECENCY_THRESHOLD_MS &&
    (hasTrace || hasGitChanges)
  ) {
    findings.push({
      category: "tool-activity",
      message: "Agent is actively working (recent progress detected)",
      severity: "info",
    });
    topClassification = "active";
    topConfidence = 0.8;
  }

  // ── 6. Ambiguous fallback ───────────────────────────────────────────
  if (topConfidence < 0.5 || findings.length === 0) {
    // Only add the ambiguous finding if we haven't already classified
    if (findings.length === 0) {
      findings.push({
        category: "temporal",
        message: "Insufficient signals for definitive classification",
        severity: "info",
      });
    }
    topClassification = "ambiguous";
    topConfidence = 0.3;
  }

  return {
    classification: topClassification,
    findings,
    confidence: topConfidence,
  };
}

// ─── Diagnostic Steering Content ──────────────────────────────────────────────

/** Maximum characters for steering content. */
const STEERING_MAX_CHARS = 500;

/**
 * Translate a StuckClassification into actionable steering text for the agent.
 * The text is capped to ~500 characters to avoid bloating the context window.
 */
export function buildDiagnosticSteeringContent(
  classification: StuckClassification,
  unitType: string,
  unitId: string,
): string {
  const lines: string[] = [];
  lines.push(`[Diagnostic: ${unitType}/${unitId} classified as ${classification.classification}]`);

  for (const finding of classification.findings) {
    switch (finding.category) {
      case "bg-shell":
        if (finding.severity === "crash") {
          // Extract process name from the message
          const nameMatch = /Process '([^']+)'/.exec(finding.message);
          const name = nameMatch ? nameMatch[1] : "unknown";
          lines.push(
            `Your process '${name}' crashed. Check the error output and restart or fix the underlying issue.`,
          );
        }
        break;
      case "trace":
        if (finding.message.includes("reading the same file")) {
          lines.push(
            "You've been reading the same files repeatedly without making changes. Identify the specific change needed and make it.",
          );
        } else if (finding.message.includes("failed repeatedly")) {
          lines.push(
            "Your recent commands are failing repeatedly. Read the error output carefully and try a different approach.",
          );
        }
        break;
      case "temporal":
        if (finding.message.includes("No tool activity")) {
          lines.push(
            "No tool activity detected. If you're blocked, explain the blocker explicitly.",
          );
        }
        break;
      case "tool-activity":
        // Active — no corrective steering needed
        break;
    }
  }

  let result = lines.join("\n");
  if (result.length > STEERING_MAX_CHARS) {
    result = result.slice(0, STEERING_MAX_CHARS - 3) + "...";
  }
  return result;
}

// ─── Diagnostic Report Formatting ─────────────────────────────────────────────

/**
 * Format a full diagnostic report as markdown for disk persistence.
 * Written to .gsd/runtime/diagnostic-{unitType}-{unitId}.md on escalation to pause.
 */
export function formatDiagnosticReport(
  signals: DiagnosticSignals,
  classification: StuckClassification,
  unitType: string,
  unitId: string,
): string {
  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────
  lines.push(`# Diagnostic Report: ${unitType}/${unitId}`);
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Unit:** ${unitType} ${unitId}`);
  lines.push("");

  // ── Classification ──────────────────────────────────────────────────
  lines.push("## Classification");
  lines.push("");
  lines.push(`- **Result:** ${classification.classification}`);
  lines.push(`- **Confidence:** ${classification.confidence}`);
  lines.push("");

  // ── Findings ────────────────────────────────────────────────────────
  lines.push("## Findings");
  lines.push("");
  if (classification.findings.length === 0) {
    lines.push("_No findings._");
  } else {
    lines.push("| Category | Severity | Message |");
    lines.push("|----------|----------|---------|");
    for (const f of classification.findings) {
      lines.push(`| ${f.category} | ${f.severity} | ${f.message} |`);
    }
  }
  lines.push("");

  // ── Signal Summary ──────────────────────────────────────────────────
  lines.push("## Signal Summary");
  lines.push("");
  lines.push(`- **Trace available:** ${signals.traceSummary !== null ? "yes" : "no"}`);
  if (signals.traceSummary) {
    // Extract brief info from trace (first 200 chars)
    const brief = signals.traceSummary.length > 200
      ? signals.traceSummary.slice(0, 200) + "..."
      : signals.traceSummary;
    lines.push(`- **Trace excerpt:** ${brief}`);
  }
  lines.push(`- **bg-shell processes:** ${signals.bgShellHealth !== null ? `${signals.bgShellHealth.length} unhealthy` : "unavailable"}`);
  if (signals.bgShellHealth && signals.bgShellHealth.length > 0) {
    for (const entry of signals.bgShellHealth) {
      const detail = entry.signal
        ? `signal=${entry.signal}`
        : entry.exitCode !== undefined && entry.exitCode !== null
          ? `exit=${entry.exitCode}`
          : "";
      lines.push(`  - ${entry.name}: ${entry.status}${detail ? ` (${detail})` : ""}`);
    }
  }
  lines.push(`- **Git status:** ${signals.gitStatus !== null ? "changes detected" : "no changes or unavailable"}`);
  lines.push(`- **In-flight tools:** ${signals.inFlightToolCount}${signals.oldestInFlightToolAgeMs !== null ? ` (oldest: ${Math.round(signals.oldestInFlightToolAgeMs / 1000)}s)` : ""}`);
  lines.push(`- **Time since last progress:** ${signals.msSinceLastProgress !== null ? `${Math.round(signals.msSinceLastProgress / 1000)}s` : "unknown"}`);
  lines.push(`- **Progress count:** ${signals.progressCount ?? "unknown"}`);
  lines.push(`- **Last progress kind:** ${signals.lastProgressKind ?? "unknown"}`);
  lines.push(`- **Recovery attempts:** ${signals.recoveryAttempts ?? "unknown"}`);
  lines.push("");

  return lines.join("\n");
}

// ─── SIGTERM Handling ─────────────────────────────────────────────────────────

/**
 * Register a SIGTERM handler that clears the lock file and exits cleanly.
 * Captures the active base path at registration time so the handler
 * always references the correct path even if the module variable changes.
 * Removes any previously registered handler before installing the new one.
 *
 * Returns the new handler so the caller can store and deregister it later.
 */
export function registerSigtermHandler(
  currentBasePath: string,
  previousHandler: (() => void) | null,
): () => void {
  if (previousHandler) process.off("SIGTERM", previousHandler);
  const handler = () => {
    clearLock(currentBasePath);
    process.exit(0);
  };
  process.on("SIGTERM", handler);
  return handler;
}

/** Deregister the SIGTERM handler (called on stop/pause). */
export function deregisterSigtermHandler(handler: (() => void) | null): void {
  if (handler) {
    process.off("SIGTERM", handler);
  }
}

// ─── Working Tree Activity Detection ──────────────────────────────────────────

/**
 * Detect whether the agent is producing work on disk by checking git for
 * any working-tree changes (staged, unstaged, or untracked). Returns true
 * if there are uncommitted changes — meaning the agent is actively working,
 * even though it hasn't signaled progress through runtime records.
 */
export function detectWorkingTreeActivity(cwd: string): boolean {
  try {
    return nativeHasChanges(cwd);
  } catch {
    return false;
  }
}
