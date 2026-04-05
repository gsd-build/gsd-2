import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { createBashTool, createEditTool, createReadTool, createWriteTool } from "@gsd/pi-coding-agent";

import { DEFAULT_BASH_TIMEOUT_SECS } from "../constants.js";
import { setLogBasePath, logWarning } from "../workflow-logger.js";

/**
 * Resolve the correct DB path for the current working directory.
 * If `basePath` is inside a `.gsd/worktrees/<MID>/` directory, returns
 * the project root's `.gsd/gsd.db` (shared WAL — R012). Otherwise
 * returns `<basePath>/.gsd/gsd.db`.
 */
export function resolveProjectRootDbPath(basePath: string): string {
  // Detect worktree: look for `.gsd/worktrees/` in the path segments.
  // A worktree path looks like: /project/root/.gsd/worktrees/M001/...
  // We need to resolve back to /project/root/.gsd/gsd.db
  const marker = `${sep}.gsd${sep}worktrees${sep}`;
  const idx = basePath.indexOf(marker);
  if (idx !== -1) {
    const projectRoot = basePath.slice(0, idx);
    return join(projectRoot, ".gsd", "gsd.db");
  }

  // Also handle forward-slash paths on all platforms
  const fwdMarker = "/.gsd/worktrees/";
  const fwdIdx = basePath.indexOf(fwdMarker);
  if (fwdIdx !== -1) {
    const projectRoot = basePath.slice(0, fwdIdx);
    return join(projectRoot, ".gsd", "gsd.db");
  }

  const normalizedPath = basePath.replaceAll("\\", "/");
  const projectsWorktreeMatch = /^(.*?)(\/\.gsd\/projects\/[a-f0-9]+)\/worktrees(?:\/|$)/.exec(normalizedPath);
  if (projectsWorktreeMatch) {
    const projectRootCandidate = basePath.slice(0, projectsWorktreeMatch[1].length);
    const projectStateRoot = basePath.slice(0, projectsWorktreeMatch[1].length + projectsWorktreeMatch[2].length);
    const normalizedProjectRoot = projectRootCandidate.replaceAll("\\", "/").replace(/\/+$/, "");
    const normalizedGsdHome = (process.env.GSD_HOME || join(homedir(), ".gsd"))
      .replaceAll("\\", "/")
      .replace(/\/+$/, "");
    const candidateGsdPath = join(projectRootCandidate, ".gsd")
      .replaceAll("\\", "/")
      .replace(/\/+$/, "");

    const looksLikeUserHome =
      /^\/(?:Users|home)\/[^/]+$/.test(normalizedProjectRoot)
      || /^[A-Za-z]:\/Users\/[^/]+$/.test(normalizedProjectRoot);

    // External-state layout: ~/.gsd/projects/<hash>/worktrees/<MID>/...
    // Resolve to ~/.gsd/projects/<hash>/gsd.db (#2952).
    if (
      candidateGsdPath === normalizedGsdHome
      || candidateGsdPath.startsWith(normalizedGsdHome + "/")
      || looksLikeUserHome
    ) {
      return join(projectStateRoot, "gsd.db");
    }

    // Symlink-resolved project-local layout: <project>/.gsd/projects/<hash>/worktrees/<MID>/...
    // Resolve to <project>/.gsd/gsd.db (#2517).
    return join(projectRootCandidate, ".gsd", "gsd.db");
  }

  return join(basePath, ".gsd", "gsd.db");
}

export async function ensureDbOpen(): Promise<boolean> {
  try {
    const db = await import("../gsd-db.js");
    if (db.isDbAvailable()) return true;

    const basePath = process.cwd();
    const dbPath = resolveProjectRootDbPath(basePath);
    const gsdDir = join(basePath, ".gsd");

    // Derive the project root from the DB path (strip .gsd/gsd.db)
    const projectRoot = join(dbPath, "..", "..");

    // Open existing DB file (may be at project root for worktrees)
    if (existsSync(dbPath)) {
      const opened = db.openDatabase(dbPath);
      if (opened) setLogBasePath(projectRoot);
      return opened;
    }

    // No DB file — create + migrate from Markdown if .gsd/ has content
    if (existsSync(gsdDir)) {
      const hasDecisions = existsSync(join(gsdDir, "DECISIONS.md"));
      const hasRequirements = existsSync(join(gsdDir, "REQUIREMENTS.md"));
      const hasMilestones = existsSync(join(gsdDir, "milestones"));
      if (hasDecisions || hasRequirements || hasMilestones) {
        const opened = db.openDatabase(dbPath);
        if (opened) {
          setLogBasePath(projectRoot);
          try {
            const { migrateFromMarkdown } = await import("../md-importer.js");
            migrateFromMarkdown(basePath);
          } catch (err) {
            logWarning("bootstrap", `ensureDbOpen auto-migration failed: ${(err as Error).message}`);
          }
        }
        return opened;
      }

      // .gsd/ exists but has no Markdown content (fresh project) — create empty DB
      const opened = db.openDatabase(dbPath);
      if (opened) setLogBasePath(projectRoot);
      return opened;
    }

    logWarning("bootstrap", "ensureDbOpen failed — no .gsd directory found");
    return false;
  } catch (err) {
    logWarning("bootstrap", `ensureDbOpen failed: ${(err as Error).message ?? String(err)}`);
    return false;
  }
}

export function registerDynamicTools(pi: ExtensionAPI): void {
  const baseBash = createBashTool(process.cwd(), {
    spawnHook: (ctx) => ({ ...ctx, cwd: process.cwd() }),
  });
  const dynamicBash = {
    ...baseBash,
    execute: async (
      toolCallId: string,
      params: { command: string; timeout?: number },
      signal?: AbortSignal,
      onUpdate?: unknown,
      ctx?: unknown,
    ) => {
      const paramsWithTimeout = {
        ...params,
        timeout: params.timeout ?? DEFAULT_BASH_TIMEOUT_SECS,
      };
      return (baseBash as any).execute(toolCallId, paramsWithTimeout, signal, onUpdate, ctx);
    },
  };
  pi.registerTool(dynamicBash as any);

  const baseWrite = createWriteTool(process.cwd());
  pi.registerTool({
    ...baseWrite,
    execute: async (
      toolCallId: string,
      params: { path: string; content: string },
      signal?: AbortSignal,
      onUpdate?: unknown,
      ctx?: unknown,
    ) => {
      const fresh = createWriteTool(process.cwd());
      return (fresh as any).execute(toolCallId, params, signal, onUpdate, ctx);
    },
  } as any);

  const baseRead = createReadTool(process.cwd());
  pi.registerTool({
    ...baseRead,
    execute: async (
      toolCallId: string,
      params: { path: string; offset?: number; limit?: number },
      signal?: AbortSignal,
      onUpdate?: unknown,
      ctx?: unknown,
    ) => {
      const fresh = createReadTool(process.cwd());
      return (fresh as any).execute(toolCallId, params, signal, onUpdate, ctx);
    },
  } as any);

  const baseEdit = createEditTool(process.cwd());
  pi.registerTool({
    ...baseEdit,
    execute: async (
      toolCallId: string,
      params: { path: string; oldText: string; newText: string },
      signal?: AbortSignal,
      onUpdate?: unknown,
      ctx?: unknown,
    ) => {
      const fresh = createEditTool(process.cwd());
      return (fresh as any).execute(toolCallId, params, signal, onUpdate, ctx);
    },
  } as any);
}
