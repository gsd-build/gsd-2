/**
 * git-action-failure-log.ts — Persist multi-line git-action failures to
 * ~/.gsd/git-action-failures.log (or $GSD_HOME/git-action-failures.log).
 *
 * Auto-mode's inline `ui.notify` is intentionally compact (single line), but
 * the underlying git failure — hook stderr, signer error, etc. — is usually
 * multi-line and load-bearing for the user. We append the full detail here
 * and surface the log path in the UI so users have a stable place to look.
 *
 * Zero cross-dependencies beyond Node built-ins so it stays safe to call from
 * any error path. Never throws.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve the on-disk path of the git-action failure log. */
export function gitActionFailureLogPath(): string {
  const gsdHome = process.env.GSD_HOME ?? join(homedir(), ".gsd");
  return join(gsdHome, "git-action-failures.log");
}

/**
 * Append a git-action failure entry. Returns the log path on success,
 * or `null` if the write failed (caller should still surface the inline
 * one-liner — we never want to silently swallow the failure).
 */
export function appendGitActionFailureLog(entry: {
  action: string;
  unitType?: string;
  unitId?: string;
  basePath?: string;
  error: string;
}): string | null {
  try {
    const logPath = gitActionFailureLogPath();
    mkdirSync(join(logPath, ".."), { recursive: true });
    const lines = [
      `[${new Date().toISOString()}] git ${entry.action} failed`,
      ...(entry.unitType ? [`unit-type: ${entry.unitType}`] : []),
      ...(entry.unitId ? [`unit-id: ${entry.unitId}`] : []),
      ...(entry.basePath ? [`base-path: ${entry.basePath}`] : []),
      "error:",
      entry.error,
      "",
      "",
    ];
    appendFileSync(logPath, lines.join("\n"));
    return logPath;
  } catch {
    return null;
  }
}
