/**
 * Persistence layer for the GitHub sync mapping.
 *
 * The mapping lives at `.gsd/github-sync.json` and tracks which GSD
 * entities have been synced to which GitHub entities (issues, PRs,
 * milestones) along with their numbers and sync timestamps.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteSync } from "../gsd/atomic-write.js";
import type { SyncMapping, MilestoneSyncRecord, SliceSyncRecord, SyncEntityRecord } from "./types.js";

const MAPPING_FILENAME = "github-sync.json";

function mappingPath(basePath: string): string {
  return join(basePath, ".gsd", MAPPING_FILENAME);
}

// ─── Load / Save ────────────────────────────────────────────────────────────

export function loadSyncMapping(basePath: string): SyncMapping | null {
  const path = mappingPath(basePath);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) return null;
    return parsed as SyncMapping;
  } catch {
    return null;
  }
}

export function saveSyncMapping(basePath: string, mapping: SyncMapping): void {
  const path = mappingPath(basePath);
  atomicWriteSync(path, JSON.stringify(mapping, null, 2) + "\n");
}

export function createEmptyMapping(repo: string): SyncMapping {
  return {
    version: 1,
    repo,
    milestones: {},
    slices: {},
    tasks: {},
  };
}

// ─── Accessors ──────────────────────────────────────────────────────────────

export function getMilestoneRecord(mapping: SyncMapping, mid: string): MilestoneSyncRecord | null {
  return mapping.milestones[mid] ?? null;
}

export function getSliceRecord(mapping: SyncMapping, mid: string, sid: string): SliceSyncRecord | null {
  return mapping.slices[`${mid}/${sid}`] ?? null;
}

export function getTaskRecord(mapping: SyncMapping, mid: string, sid: string, tid: string): SyncEntityRecord | null {
  return mapping.tasks[`${mid}/${sid}/${tid}`] ?? null;
}

export function getTaskIssueNumber(mapping: SyncMapping, mid: string, sid: string, tid: string): number | null {
  const record = getTaskRecord(mapping, mid, sid, tid);
  return record?.issueNumber ?? null;
}

// ─── Mutators ───────────────────────────────────────────────────────────────

export function setMilestoneRecord(mapping: SyncMapping, mid: string, record: MilestoneSyncRecord): void {
  mapping.milestones[mid] = record;
}

export function setSliceRecord(mapping: SyncMapping, mid: string, sid: string, record: SliceSyncRecord): void {
  mapping.slices[`${mid}/${sid}`] = record;
}

export function setTaskRecord(mapping: SyncMapping, mid: string, sid: string, tid: string, record: SyncEntityRecord): void {
  mapping.tasks[`${mid}/${sid}/${tid}`] = record;
}
