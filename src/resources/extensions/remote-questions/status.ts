/**
 * Remote Questions — status helpers
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readPromptRecord } from "./store.js";

export interface LatestPromptSummary {
  id: string;
  status: string;
  updatedAt: number;
}

export function getLatestPromptSummary(): LatestPromptSummary | null {
  const runtimeDir = join(homedir(), ".gsd", "runtime", "remote-questions");
  if (!existsSync(runtimeDir)) return null;
  const files = readdirSync(runtimeDir).filter((f) => f.endsWith(".json")).sort().reverse();
  if (files.length === 0) return null;
  const record = readPromptRecord(files[0].replace(/\.json$/, ""));
  return record ? { id: record.id, status: record.status, updatedAt: record.updatedAt } : null;
}
