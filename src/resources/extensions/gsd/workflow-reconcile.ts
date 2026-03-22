// GSD Extension — Event-Log Reconciliation
// Replaces INSERT OR REPLACE worktree merge with event-based reconciliation.
// Uses findForkPoint() to detect divergence, replays non-conflicting events,
// writes CONFLICTS.md and blocks merge on entity-level conflicts.
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { readEvents, findForkPoint } from "./workflow-events.js";
import type { WorkflowEvent } from "./workflow-events.js";
import { getEngine } from "./workflow-engine.js";
import { writeManifest } from "./workflow-manifest.js";
import { atomicWriteSync } from "./atomic-write.js";

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ConflictEntry {
  entityType: string;
  entityId: string;
  mainSideEvents: WorkflowEvent[];
  worktreeSideEvents: WorkflowEvent[];
}

export interface ReconcileResult {
  autoMerged: number;
  conflicts: ConflictEntry[];
}

// ─── extractEntityKey ─────────────────────────────────────────────────────────

/**
 * Map a WorkflowEvent command to its affected entity type and ID.
 * Returns null for commands that don't touch a named entity
 * (e.g. unknown or future cmds).
 */
export function extractEntityKey(
  event: WorkflowEvent,
): { type: string; id: string } | null {
  const p = event.params;

  switch (event.cmd) {
    case "complete_task":
    case "start_task":
    case "report_blocker":
    case "record_verification":
      return typeof p["taskId"] === "string"
        ? { type: "task", id: p["taskId"] }
        : null;

    case "complete_slice":
      return typeof p["sliceId"] === "string"
        ? { type: "slice", id: p["sliceId"] }
        : null;

    case "plan_slice":
      return typeof p["sliceId"] === "string"
        ? { type: "slice_plan", id: p["sliceId"] }
        : null;

    case "save_decision":
      if (typeof p["scope"] === "string" && typeof p["decision"] === "string") {
        return { type: "decision", id: `${p["scope"]}:${p["decision"]}` };
      }
      return null;

    default:
      return null;
  }
}

// ─── detectConflicts ──────────────────────────────────────────────────────────

/**
 * Compare two sets of diverged events. Returns conflict entries for any
 * entity touched by both sides.
 *
 * Entity-level granularity: if both sides touched task T01 (with any cmd),
 * that is one conflict regardless of field-level differences.
 */
export function detectConflicts(
  mainDiverged: WorkflowEvent[],
  wtDiverged: WorkflowEvent[],
): ConflictEntry[] {
  // Group each side's events by entity key
  const mainByEntity = new Map<string, WorkflowEvent[]>();
  for (const event of mainDiverged) {
    const key = extractEntityKey(event);
    if (!key) continue;
    const bucket = mainByEntity.get(`${key.type}:${key.id}`) ?? [];
    bucket.push(event);
    mainByEntity.set(`${key.type}:${key.id}`, bucket);
  }

  const wtByEntity = new Map<string, WorkflowEvent[]>();
  for (const event of wtDiverged) {
    const key = extractEntityKey(event);
    if (!key) continue;
    const bucket = wtByEntity.get(`${key.type}:${key.id}`) ?? [];
    bucket.push(event);
    wtByEntity.set(`${key.type}:${key.id}`, bucket);
  }

  // Find entities touched by both sides
  const conflicts: ConflictEntry[] = [];
  for (const [entityKey, mainEvents] of mainByEntity) {
    const wtEvents = wtByEntity.get(entityKey);
    if (!wtEvents) continue;

    const colonIdx = entityKey.indexOf(":");
    const entityType = entityKey.slice(0, colonIdx);
    const entityId = entityKey.slice(colonIdx + 1);

    conflicts.push({
      entityType,
      entityId,
      mainSideEvents: mainEvents,
      worktreeSideEvents: wtEvents,
    });
  }

  return conflicts;
}

// ─── writeConflictsFile ───────────────────────────────────────────────────────

/**
 * Write a human-readable CONFLICTS.md to basePath/.gsd/CONFLICTS.md.
 * Lists each conflict with both sides' event payloads and resolution instructions.
 */
export function writeConflictsFile(
  basePath: string,
  conflicts: ConflictEntry[],
  worktreePath: string,
): void {
  const timestamp = new Date().toISOString();
  const lines: string[] = [
    `# Merge Conflicts — ${timestamp}`,
    "",
    `Conflicts detected merging worktree \`${worktreePath}\` into \`${basePath}\`.`,
    `Run \`gsd resolve-conflict\` to resolve each conflict.`,
    "",
  ];

  conflicts.forEach((conflict, idx) => {
    lines.push(`## Conflict ${idx + 1}: ${conflict.entityType} ${conflict.entityId}`);
    lines.push("");
    lines.push("**Main side events:**");
    for (const event of conflict.mainSideEvents) {
      lines.push(`- ${event.cmd} at ${event.ts} (hash: ${event.hash})`);
      lines.push(`  params: ${JSON.stringify(event.params)}`);
    }
    lines.push("");
    lines.push("**Worktree side events:**");
    for (const event of conflict.worktreeSideEvents) {
      lines.push(`- ${event.cmd} at ${event.ts} (hash: ${event.hash})`);
      lines.push(`  params: ${JSON.stringify(event.params)}`);
    }
    lines.push("");
    lines.push(`**Resolve with:** \`gsd resolve-conflict --entity ${conflict.entityType}:${conflict.entityId} --pick [main|worktree]\``);
    lines.push("");
  });

  const content = lines.join("\n");
  const dir = join(basePath, ".gsd");
  mkdirSync(dir, { recursive: true });
  atomicWriteSync(join(dir, "CONFLICTS.md"), content);
}

// ─── reconcileWorktreeLogs ────────────────────────────────────────────────────

/**
 * Event-log-based reconciliation algorithm:
 *
 * 1. Read both event logs
 * 2. Find fork point (last common event by hash)
 * 3. Slice diverged sets from each side
 * 4. If no divergence on either side → return autoMerged: 0, conflicts: []
 * 5. detectConflicts() — if any, writeConflictsFile + return early (D-04 all-or-nothing)
 * 6. If clean: sort merged = mainDiverged + wtDiverged by timestamp, replayAll
 * 7. Write merged event log (base + merged in timestamp order)
 * 8. writeManifest
 * 9. Return { autoMerged: merged.length, conflicts: [] }
 */
export function reconcileWorktreeLogs(
  mainBasePath: string,
  worktreeBasePath: string,
): ReconcileResult {
  // Step 1: Read both logs
  const mainLogPath = join(mainBasePath, ".gsd", "event-log.jsonl");
  const wtLogPath = join(worktreeBasePath, ".gsd", "event-log.jsonl");

  const mainEvents = readEvents(mainLogPath);
  const wtEvents = readEvents(wtLogPath);

  // Step 2: Find fork point
  const forkPoint = findForkPoint(mainEvents, wtEvents);

  // Step 3: Slice diverged sets
  const mainDiverged = mainEvents.slice(forkPoint + 1);
  const wtDiverged = wtEvents.slice(forkPoint + 1);

  // Step 4: No divergence on either side
  if (mainDiverged.length === 0 && wtDiverged.length === 0) {
    return { autoMerged: 0, conflicts: [] };
  }

  // Step 5: Detect conflicts (entity-level)
  const conflicts = detectConflicts(mainDiverged, wtDiverged);
  if (conflicts.length > 0) {
    // D-04: atomic all-or-nothing — block entire merge
    writeConflictsFile(mainBasePath, conflicts, worktreeBasePath);
    process.stderr.write(
      `[gsd] reconcile: ${conflicts.length} conflict(s) detected — see ${join(mainBasePath, ".gsd", "CONFLICTS.md")}\n`,
    );
    return { autoMerged: 0, conflicts };
  }

  // Step 6: Clean merge — sort by timestamp and replay
  const merged = [...mainDiverged, ...wtDiverged].sort((a, b) =>
    a.ts.localeCompare(b.ts),
  );

  const engine = getEngine(mainBasePath);
  engine.replayAll(merged);

  // Step 7: Write merged event log (base + merged in timestamp order)
  // CRITICAL (Pitfall #2): After replayAll, explicitly write the merged event log.
  const baseEvents = mainEvents.slice(0, forkPoint + 1);
  const mergedLog = baseEvents.concat(merged);
  const logContent = mergedLog.map((e) => JSON.stringify(e)).join("\n") + (mergedLog.length > 0 ? "\n" : "");
  mkdirSync(join(mainBasePath, ".gsd"), { recursive: true });
  atomicWriteSync(join(mainBasePath, ".gsd", "event-log.jsonl"), logContent);

  // Step 8: Write manifest
  try {
    // Access the db via the engine's internal property (cast as needed)
    const engineAny = engine as unknown as { db: Parameters<typeof writeManifest>[1] };
    writeManifest(mainBasePath, engineAny.db);
  } catch (err) {
    process.stderr.write(
      `[gsd] reconcile: manifest write failed (non-fatal): ${(err as Error).message}\n`,
    );
  }

  // Step 9: Return result
  return { autoMerged: merged.length, conflicts: [] };
}
