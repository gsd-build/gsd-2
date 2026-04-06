// GSD2 — Extension registration: wires all GSD tools, commands, and hooks into pi

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { registerGSDCommand } from "../commands.js";
import { registerExitCommand } from "../exit-command.js";
import { registerWorktreeCommand } from "../worktree-command.js";
import { registerDbTools } from "./db-tools.js";
import { registerDynamicTools } from "./dynamic-tools.js";
import { registerJournalTools } from "./journal-tools.js";
import { registerQueryTools } from "./query-tools.js";
import { registerHooks } from "./register-hooks.js";
import { registerShortcuts } from "./register-shortcuts.js";
import { loadCommunityHooks } from "../lib/hooks/community-loader.js";
import { getOrCreateRegistry } from "../rule-registry.js";

export function handleRecoverableExtensionProcessError(err: Error): boolean {
  if ((err as NodeJS.ErrnoException).code === "EPIPE") {
    process.exit(0);
  }
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    const syscall = (err as NodeJS.ErrnoException).syscall;
    if (syscall?.startsWith("spawn")) {
      process.stderr.write(`[gsd] spawn ENOENT: ${(err as any).path ?? "unknown"} — command not found\n`);
      return true;
    }
    if (syscall === "uv_cwd") {
      process.stderr.write(`[gsd] ENOENT (${syscall}): ${err.message}\n`);
      return true;
    }
  }
  return false;
}

function installEpipeGuard(): void {
  if (!process.listeners("uncaughtException").some((listener) => listener.name === "_gsdEpipeGuard")) {
    const _gsdEpipeGuard = (err: Error): void => {
      if (handleRecoverableExtensionProcessError(err)) {
        return;
      }
      throw err;
    };
    process.on("uncaughtException", _gsdEpipeGuard);
  }
}

export function registerGsdExtension(pi: ExtensionAPI): void {
  registerGSDCommand(pi);
  registerWorktreeCommand(pi);
  registerExitCommand(pi);

  installEpipeGuard();

  // Load community hook packages synchronously at startup so all hooks
  // are registered before any dispatch path can execute. Failures are
  // logged to stderr but never crash extension bootstrap.
  try {
    const store = getOrCreateRegistry().getProgrammaticStore();
    const result = loadCommunityHooks(store, process.cwd());
    if (result.loaded > 0) {
      process.stderr.write(`[gsd] Loaded ${result.hooksRegistered} community hook(s) from ${result.loaded} package(s)\n`);
    }
    if (result.errors.length > 0) {
      process.stderr.write(`[gsd] ${result.errors.length} community hook loading error(s) — check .gsd/workflow.log\n`);
    }
  } catch (e) {
    process.stderr.write(`[gsd] Community hook loading failed: ${(e as Error).message}\n`);
  }

  pi.registerCommand("kill", {
    description: "Exit GSD immediately (no cleanup)",
    handler: async (_args: string, _ctx: ExtensionCommandContext) => {
      process.exit(0);
    },
  });

  registerDynamicTools(pi);
  registerDbTools(pi);
  registerJournalTools(pi);
  registerQueryTools(pi);
  registerShortcuts(pi);
  registerHooks(pi);
}
