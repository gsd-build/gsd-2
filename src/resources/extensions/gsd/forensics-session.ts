import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import type { ExtensionContext } from "@gsd/pi-coding-agent";

import { atomicWriteAsync } from "./atomic-write.js";
import { gsdRoot } from "./paths.js";

const ACTIVE_FORENSICS_RUNTIME_FILE = "active-forensics.json";

interface ActiveForensicsRuntime {
  sessionKey: string;
  reportPath: string;
  updatedAt: string;
}

function resolveActiveForensicsRuntimePath(basePath: string): string {
  return join(gsdRoot(basePath), "runtime", ACTIVE_FORENSICS_RUNTIME_FILE);
}

function isInitialForensicsPrompt(prompt: string): boolean {
  return [
    "You are debugging GSD itself.",
    "## Forensic Report",
    "## GSD Source Location",
  ].every((marker) => prompt.includes(marker));
}

export function getForensicsSessionKey(ctx: Pick<ExtensionContext, "sessionManager">): string | null {
  const sessionManager = ctx.sessionManager as
    | { getSessionId?: () => string; getSessionFile?: () => string }
    | undefined;
  return sessionManager?.getSessionId?.() ?? sessionManager?.getSessionFile?.() ?? null;
}

export async function persistActiveForensicsSession(
  basePath: string,
  sessionKey: string,
  reportPath: string,
): Promise<void> {
  const payload: ActiveForensicsRuntime = {
    sessionKey,
    reportPath: relative(basePath, reportPath),
    updatedAt: new Date().toISOString(),
  };
  await atomicWriteAsync(resolveActiveForensicsRuntimePath(basePath), `${JSON.stringify(payload)}\n`);
}

export function loadActiveForensicsContext(
  basePath: string,
  sessionKey: string | null,
  prompt: string,
): string | null {
  if (!sessionKey || isInitialForensicsPrompt(prompt)) return null;

  const runtimePath = resolveActiveForensicsRuntimePath(basePath);
  if (!existsSync(runtimePath)) return null;

  try {
    const raw = readFileSync(runtimePath, "utf-8");
    const marker = JSON.parse(raw) as Partial<ActiveForensicsRuntime>;
    if (marker.sessionKey !== sessionKey || typeof marker.reportPath !== "string" || !marker.reportPath.trim()) {
      return null;
    }

    const reportPath = join(basePath, marker.reportPath);
    if (!existsSync(reportPath)) return null;

    const report = readFileSync(reportPath, "utf-8").trim();
    if (!report) return null;

    return [
      "[Active GSD Forensics Session]",
      "Continue the existing forensic investigation using the saved report below.",
      `Source: \`${marker.reportPath}\``,
      "",
      report,
    ].join("\n");
  } catch {
    return null;
  }
}
