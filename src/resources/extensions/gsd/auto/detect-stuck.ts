/**
 * auto/detect-stuck.ts — Sliding-window stuck detection for the auto-loop.
 *
 * Leaf node in the import DAG.
 */

import type { WindowEntry } from "./types.js";
import { summarizeLogs } from "../workflow-logger.js";
import { getLatestForUnit } from "../db/unit-dispatches.js";

/**
 * Pattern matching ENOENT errors with a file path.
 * Matches: "ENOENT: no such file or directory, access '/path/to/file'"
 * and similar Node.js filesystem error messages.
 */
const ENOENT_PATH_RE = /ENOENT[^']*'([^']+)'/;

/**
 * Phase B / codex review MEDIUM B3 — retry coupling.
 *
 * If unit_dispatches has a recent failed dispatch for `unitKey` whose
 * retry budget is not yet exhausted (attempt_n < max_attempts) AND whose
 * scheduled next_run_at is still in the future, the loop is legitimately
 * waiting on its own backoff. Suppress the stuck verdict in that case so
 * the retry budget can fully drain before we declare stuck.
 *
 * Returns true if the dispatch ledger says we should suppress the stuck
 * signal; false (no suppression) when the ledger is unavailable or has
 * no opinion.
 */
function retryBudgetSuppresses(unitKey: string): boolean {
  try {
    const latest = getLatestForUnit(unitKey);
    if (!latest) return false;
    if (latest.attempt_n >= latest.max_attempts) return false;
    if (!latest.next_run_at) return false;
    const nextRun = Date.parse(latest.next_run_at);
    if (!Number.isFinite(nextRun)) return false;
    return nextRun > Date.now();
  } catch {
    return false;
  }
}

/**
 * Analyze a sliding window of recent unit dispatches for stuck patterns.
 * Returns a signal with reason if stuck, null otherwise.
 *
 * Rule 1: Same error string twice in a row → stuck immediately.
 * Rule 2: Same unit key 3+ consecutive times → stuck (preserves prior behavior).
 * Rule 2b: Same unit key appears 3+ times anywhere in the active window → stuck,
 *          UNLESS unit_dispatches says we're inside the retry-backoff window
 *          (codex review MEDIUM B3 — Phase B retry coupling).
 * Rule 3: Oscillation A→B→A→B in last 4 entries → stuck.
 * Rule 4: Same ENOENT path in any 2 entries within the window → stuck (#3575).
 *         Missing files don't self-heal between retries — retrying wastes budget.
 */
export function detectStuck(
  window: readonly WindowEntry[],
  _retryContext?: { pendingRetry?: boolean; retryAttempt?: number },
): { stuck: true; reason: string } | null {
  if (window.length < 2) return null;

  // Peek (not drain) the workflow-logger buffer so stuck reasons can surface
  // the underlying diagnostic context (projection failures, DB degradations,
  // reconcile warnings) that usually explains *why* the loop is stuck. The
  // auto-loop's finalize step owns the buffer lifecycle — this is read-only.
  const loggerSummary = summarizeLogs();
  const suffix = loggerSummary ? ` — ${loggerSummary}` : "";

  const last = window[window.length - 1];
  const prev = window[window.length - 2];

  // Rule 1: Same error repeated consecutively
  if (last.error && prev.error && last.error === prev.error) {
    return {
      stuck: true,
      reason: `Same error repeated: ${last.error.slice(0, 200)}${suffix}`,
    };
  }

  // Rule 2: Same unit 3+ consecutive times — suppressed if unit_dispatches
  // says we're inside the retry-backoff window (codex MEDIUM B3).
  if (window.length >= 3) {
    const lastThree = window.slice(-3);
    if (lastThree.every((u) => u.key === last.key) && !retryBudgetSuppresses(last.key)) {
      return {
        stuck: true,
        reason: `${last.key} derived 3 consecutive times without progress${suffix}`,
      };
    }
  }

  // Rule 2b: Same unit key 3+ times anywhere in the active window — same
  // retry-budget suppression as Rule 2.
  const countInWindow = window.filter((entry) => entry.key === last.key).length;
  if (countInWindow >= 3 && !retryBudgetSuppresses(last.key)) {
    return {
      stuck: true,
      reason: `${last.key} derived ${countInWindow} times in last ${window.length} attempts without progress${suffix}`,
    };
  }

  // Rule 3: Oscillation (A→B→A→B in last 4)
  if (window.length >= 4) {
    const w = window.slice(-4);
    if (
      w[0].key === w[2].key &&
      w[1].key === w[3].key &&
      w[0].key !== w[1].key
    ) {
      return {
        stuck: true,
        reason: `Oscillation detected: ${w[0].key} ↔ ${w[1].key}${suffix}`,
      };
    }
  }

  // Rule 4: Same ENOENT path seen twice in window (#3575)
  // Missing files don't appear between retries — stop immediately.
  const enoentPaths = new Map<string, number>();
  for (const entry of window) {
    if (!entry.error) continue;
    const match = ENOENT_PATH_RE.exec(entry.error);
    if (!match) continue;
    const filePath = match[1];
    const count = (enoentPaths.get(filePath) ?? 0) + 1;
    if (count >= 2) {
      return {
        stuck: true,
        reason: `Missing file referenced twice: ${filePath} (ENOENT)${suffix}`,
      };
    }
    enoentPaths.set(filePath, count);
  }

  return null;
}
