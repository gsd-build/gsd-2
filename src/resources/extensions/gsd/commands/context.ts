import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@gsd/pi-coding-agent";

import { checkRemoteAutoSession, isAutoActive, isAutoPaused, stopAutoRemote } from "../auto.js";
import { validateDirectory } from "../validate-directory.js";
import { resolveProjectRoot } from "../worktree.js";
import { showNextAction } from "../../shared/tui.js";
import { handleStatus } from "./handlers/core.js";
import { homedir } from "node:os";

export interface GsdDispatchContext {
  ctx: ExtensionCommandContext;
  pi: ExtensionAPI;
  trimmed: string;
}

/**
 * Typed error for when GSD is run outside a valid project directory.
 * Command handlers catch this to show a friendly message instead of a raw exception.
 */
export class GSDNoProjectError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "GSDNoProjectError";
  }
}

/**
 * Resolve and validate the current project root.
 *
 * When `ctx` is provided, sources the root from `ctx.projectRoot` (the
 * canonical "current project" maintained by the runner). When `ctx` is
 * omitted, falls back to `process.cwd()` resolved via `resolveProjectRoot`.
 *
 * In both cases the result is passed through `validateDirectory`; if the
 * directory is rejected (e.g. inside a node_modules tree, deleted, etc.),
 * a `GSDNoProjectError` is thrown.
 *
 * Prefer the ctx-aware overload from any handler that has an
 * `ExtensionContext` in scope so the resolved root tracks the runner's
 * notion of the current project rather than the process cwd.
 */
export function projectRoot(ctx?: ExtensionContext): string {
  let root: string;
  let cwd: string;
  if (ctx && typeof ctx.projectRoot === "string" && ctx.projectRoot.length > 0) {
    root = ctx.projectRoot;
    cwd = ctx.cwd && ctx.cwd.length > 0 ? ctx.cwd : root;
  } else {
    try {
      cwd = ctx?.cwd ?? process.cwd();
    } catch {
      // cwd directory was deleted (e.g. worktree teardown) — fall back to home (#3598)
      cwd = homedir();
    }
    root = resolveProjectRoot(cwd);
  }

  // Validate the root itself first — a bad root (e.g. project deleted) should
  // never be returned as if it were valid. Then, if cwd diverges from root,
  // also validate cwd so commands like /gsd cleanup that operate on the
  // current directory get a chance to fail with a meaningful reason rather
  // than silently misfiring against an unrelated project root.
  for (const candidate of root === cwd ? [root] : [root, cwd]) {
    const result = validateDirectory(candidate);
    if (result.severity === "blocked") {
      throw new GSDNoProjectError(result.reason ?? "GSD must be run inside a project directory.");
    }
  }
  return root;
}

export function currentDirectoryRoot(): string {
  let cwd: string;
  try {
    cwd = process.cwd();
  } catch {
    cwd = process.env.HOME ?? "/";
  }
  const result = validateDirectory(cwd);
  if (result.severity === "blocked") {
    throw new GSDNoProjectError(result.reason ?? "GSD must be run inside a project directory.");
  }
  return cwd;
}

export async function guardRemoteSession(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<boolean> {
  if (isAutoActive() || isAutoPaused()) return true;

  const remote = checkRemoteAutoSession(projectRoot(ctx));
  if (!remote.running || !remote.pid) return true;

  const unitLabel = remote.unitType && remote.unitId
    ? `${remote.unitType} (${remote.unitId})`
    : "unknown unit";

  // In RPC/web bridge mode, interactive TUI prompts (showNextAction) block
  // forever because there is no terminal to answer them. Notify and bail.
  if (process.env.GSD_WEB_BRIDGE_TUI === "1") {
    ctx.ui.notify(
      `Another auto-mode session (PID ${remote.pid}) is running on this project (${unitLabel}). ` +
      `Stop it first with /gsd stop, or use /gsd steer to redirect it.`,
      "warning",
    );
    return false;
  }

  const choice = await showNextAction(ctx, {
    title: `Auto-mode is running in another terminal (PID ${remote.pid})`,
    summary: [
      `Currently executing: ${unitLabel}`,
      ...(remote.startedAt ? [`Started: ${remote.startedAt}`] : []),
    ],
    actions: [
      {
        id: "status",
        label: "View status",
        description: "Show the current GSD progress dashboard.",
        recommended: true,
      },
      {
        id: "steer",
        label: "Steer the session",
        description: "Use /gsd steer <instruction> to redirect the running session.",
      },
      {
        id: "stop",
        label: "Stop remote session",
        description: `Send SIGTERM to PID ${remote.pid} to stop it gracefully.`,
      },
      {
        id: "force",
        label: "Force start (steal lock)",
        description: "Start a new session, terminating the existing one.",
      },
    ],
    notYetMessage: "Run /gsd when ready.",
  });

  if (choice === "status") {
    await handleStatus(ctx);
    return false;
  }
  if (choice === "steer") {
    ctx.ui.notify(
      "Use /gsd steer <instruction> to redirect the running auto-mode session.\n" +
      "Example: /gsd steer Use Postgres instead of SQLite",
      "info",
    );
    return false;
  }
  if (choice === "stop") {
    const result = stopAutoRemote(projectRoot(ctx));
    if (result.found) {
      ctx.ui.notify(`Sent stop signal to auto-mode session (PID ${result.pid}). It will shut down gracefully.`, "info");
    } else if (result.error) {
      ctx.ui.notify(`Failed to stop remote auto-mode: ${result.error}`, "error");
    } else {
      ctx.ui.notify("Remote session is no longer running.", "info");
    }
    return false;
  }

  return choice === "force";
}
