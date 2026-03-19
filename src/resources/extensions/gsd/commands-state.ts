/**
 * GSD State — /gsd state subcommand handler.
 *
 * Provides project-level management of the external GSD state directory
 * (~/.gsd/projects/<hash>/). Covers discovery, git status, snapshot
 * commits, remote setup, and push.
 */

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { externalGsdRoot } from "./repo-identity.js";
import { ensureStateGitRepo } from "./state-git.js";
import { loadEffectiveGSDPreferences } from "./preferences.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15_000,
  }).trim();
}

function hasGitRepo(stateDir: string): boolean {
  return existsSync(join(stateDir, ".git"));
}

function hasRemote(stateDir: string): boolean {
  try {
    const remotes = runGit(["remote"], stateDir);
    return remotes.trim().length > 0;
  } catch {
    return false;
  }
}

function countUntracked(stateDir: string): number {
  try {
    const out = runGit(["status", "--porcelain"], stateDir);
    return out.split("\n").filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handleState(
  args: string,
  ctx: ExtensionCommandContext,
  basePath: string,
): Promise<void> {
  const stateDir = externalGsdRoot(basePath);
  const sub = args.trim();

  // ── path ──────────────────────────────────────────────────────────────────
  if (sub === "" || sub === "path") {
    ensureStateGitRepo(stateDir);
    const isGit = hasGitRepo(stateDir);
    const remote = isGit && hasRemote(stateDir)
      ? (() => { try { return runGit(["remote", "get-url", "origin"], stateDir); } catch { return "(no origin)"; } })()
      : "none";
    const pending = isGit ? countUntracked(stateDir) : 0;

    ctx.ui.notify(
      [
        `GSD state directory for this project:`,
        `  ${stateDir}`,
        ``,
        `Git tracking: ${isGit ? "✓ initialized" : "✗ not a git repo"}`,
        isGit ? `Remote (origin): ${remote}` : `Run /gsd state remote <url> to add a remote`,
        isGit ? `Uncommitted changes: ${pending}` : "",
        ``,
        `Commands:`,
        `  /gsd state status    — git status of state dir`,
        `  /gsd state commit    — snapshot uncommitted changes`,
        `  /gsd state push      — push to remote`,
        `  /gsd state remote <url> — add or show origin remote`,
      ].filter((l) => l !== undefined).join("\n"),
      "info",
    );
    return;
  }

  // ── status ────────────────────────────────────────────────────────────────
  if (sub === "status") {
    ensureStateGitRepo(stateDir);
    if (!hasGitRepo(stateDir)) {
      ctx.ui.notify(`State dir is not a git repo: ${stateDir}`, "warning");
      return;
    }

    try {
      const status = runGit(["status", "--short"], stateDir);
      const log = (() => {
        try { return runGit(["log", "--oneline", "-5"], stateDir); } catch { return "(no commits yet)"; }
      })();
      ctx.ui.notify(
        [
          `State dir: ${stateDir}`,
          ``,
          status ? `Changes:\n${status}` : "Working tree clean.",
          ``,
          `Recent commits:\n${log}`,
        ].join("\n"),
        "info",
      );
    } catch (err) {
      ctx.ui.notify(`git status failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
    return;
  }

  // ── commit ────────────────────────────────────────────────────────────────
  if (sub === "commit" || sub.startsWith("commit ")) {
    ensureStateGitRepo(stateDir);
    if (!hasGitRepo(stateDir)) {
      ctx.ui.notify(`State dir is not a git repo: ${stateDir}`, "warning");
      return;
    }

    const customMsg = sub.replace(/^commit\s*/, "").trim();
    const now = new Date().toISOString().replace("T", " ").slice(0, 16);
    const message = customMsg || `snapshot ${now}`;

    const pending = countUntracked(stateDir);
    if (pending === 0) {
      ctx.ui.notify("Nothing to commit — working tree clean.", "info");
      return;
    }

    try {
      runGit(["add", "--all"], stateDir);
      runGit(["commit", "-m", message], stateDir);
      ctx.ui.notify(`State snapshot committed: "${message}" (${pending} change${pending !== 1 ? "s" : ""})`, "success");
    } catch (err) {
      ctx.ui.notify(`Commit failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
    return;
  }

  // ── push ──────────────────────────────────────────────────────────────────
  if (sub === "push") {
    ensureStateGitRepo(stateDir);
    if (!hasGitRepo(stateDir)) {
      ctx.ui.notify(`State dir is not a git repo: ${stateDir}`, "warning");
      return;
    }

    if (!hasRemote(stateDir)) {
      ctx.ui.notify(
        `No remote configured. Add one first:\n  /gsd state remote <url>`,
        "warning",
      );
      return;
    }

    try {
      // Auto-commit any uncommitted changes before push
      const pending = countUntracked(stateDir);
      if (pending > 0) {
        const now = new Date().toISOString().replace("T", " ").slice(0, 16);
        runGit(["add", "--all"], stateDir);
        runGit(["commit", "-m", `snapshot ${now}`], stateDir);
      }

      // Push (set upstream on first push)
      try {
        runGit(["push"], stateDir);
      } catch {
        // First push — set upstream
        const branch = (() => {
          try { return runGit(["rev-parse", "--abbrev-ref", "HEAD"], stateDir); } catch { return "main"; }
        })();
        runGit(["push", "--set-upstream", "origin", branch], stateDir);
      }

      ctx.ui.notify(
        pending > 0
          ? `Committed ${pending} change${pending !== 1 ? "s" : ""} and pushed state to remote.`
          : "State pushed to remote.",
        "success",
      );
    } catch (err) {
      ctx.ui.notify(`Push failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
    return;
  }

  // ── remote ────────────────────────────────────────────────────────────────
  if (sub === "remote" || sub.startsWith("remote ")) {
    ensureStateGitRepo(stateDir);
    if (!hasGitRepo(stateDir)) {
      ctx.ui.notify(`State dir is not a git repo: ${stateDir}`, "warning");
      return;
    }

    const url = sub.replace(/^remote\s*/, "").trim();

    if (!url) {
      // Show current remote
      if (hasRemote(stateDir)) {
        try {
          const origin = runGit(["remote", "get-url", "origin"], stateDir);
          ctx.ui.notify(`Current origin: ${origin}`, "info");
        } catch {
          const remotes = runGit(["remote", "-v"], stateDir);
          ctx.ui.notify(`Remotes:\n${remotes}`, "info");
        }
      } else {
        ctx.ui.notify(
          `No remote configured.\nUsage: /gsd state remote <url>\nExample: /gsd state remote git@github.com:you/project-gsd-state.git`,
          "info",
        );
      }
      return;
    }

    try {
      if (hasRemote(stateDir)) {
        // Update existing origin
        runGit(["remote", "set-url", "origin", url], stateDir);
        ctx.ui.notify(`Updated origin to: ${url}\nRun /gsd state push to push your state.`, "success");
      } else {
        runGit(["remote", "add", "origin", url], stateDir);
        ctx.ui.notify(`Added origin: ${url}\nRun /gsd state push to push your state.`, "success");
      }
    } catch (err) {
      ctx.ui.notify(`Failed to set remote: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
    return;
  }

  // ── unknown ───────────────────────────────────────────────────────────────
  ctx.ui.notify(
    [
      `Unknown subcommand: ${sub}`,
      ``,
      `Usage: /gsd state <subcommand>`,
      `  path              Show state directory path and git status`,
      `  status            git status of state directory`,
      `  commit [message]  Snapshot uncommitted state changes`,
      `  push              Commit (if needed) and push to remote`,
      `  remote [url]      Show or set the origin remote`,
    ].join("\n"),
    "warning",
  );
}

// ─── Auto-push after milestone complete ───────────────────────────────────────

/**
 * If `git.state_remote` is set in preferences, commit and push the state
 * directory. Called after a milestone merges to main.
 *
 * Non-fatal — errors are logged but never block the main workflow.
 */
export function autoSnapshotStateIfConfigured(basePath: string): void {
  try {
    const prefs = loadEffectiveGSDPreferences()?.preferences;
    const stateRemote = (prefs?.git as any)?.state_remote as string | undefined;
    if (!stateRemote) return;

    const stateDir = externalGsdRoot(basePath);
    ensureStateGitRepo(stateDir);
    if (!hasGitRepo(stateDir)) return;

    // Ensure remote is set
    if (!hasRemote(stateDir)) {
      runGit(["remote", "add", "origin", stateRemote], stateDir);
    }

    const pending = countUntracked(stateDir);
    if (pending > 0) {
      const now = new Date().toISOString().replace("T", " ").slice(0, 16);
      runGit(["add", "--all"], stateDir);
      runGit(["commit", "-m", `snapshot ${now} (milestone complete)`], stateDir);
    }

    try {
      runGit(["push"], stateDir);
    } catch {
      const branch = (() => {
        try { return runGit(["rev-parse", "--abbrev-ref", "HEAD"], stateDir); } catch { return "main"; }
      })();
      runGit(["push", "--set-upstream", "origin", branch], stateDir);
    }
  } catch {
    // Non-fatal — never block the main workflow
  }
}
