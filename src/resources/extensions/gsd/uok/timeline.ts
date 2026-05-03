// GSD2 UOK Timeline Reconstruction from Authoritative DB Records

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { _getAdapter, isDbAvailable } from "../gsd-db.js";
import { gsdRoot } from "../paths.js";

export interface TurnTimelineFilter {
  traceId?: string;
  turnId?: string;
}

export interface TurnTimelineEntry {
  source: "audit_events" | "unit_dispatches" | "turn_git_transactions" | "audit_jsonl";
  ts: string;
  traceId?: string;
  turnId?: string | null;
  type: string;
  payload: Record<string, unknown>;
}

export interface TurnTimeline {
  authoritative: "db" | "degraded-fallback";
  degraded: boolean;
  entries: TurnTimelineEntry[];
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || value.trim() === "") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function matchesFilter(entry: Pick<TurnTimelineEntry, "traceId" | "turnId">, filter: TurnTimelineFilter): boolean {
  if (filter.traceId && entry.traceId !== filter.traceId) return false;
  if (filter.turnId && entry.turnId !== filter.turnId) return false;
  return true;
}

function byTimestamp(a: TurnTimelineEntry, b: TurnTimelineEntry): number {
  return a.ts.localeCompare(b.ts);
}

function readDbTimeline(filter: TurnTimelineFilter): TurnTimelineEntry[] {
  const db = _getAdapter();
  if (!db) return [];
  const entries: TurnTimelineEntry[] = [];
  const where: string[] = [];
  const params: Record<string, string> = {};
  if (filter.traceId) {
    where.push("trace_id = :trace_id");
    params[":trace_id"] = filter.traceId;
  }
  if (filter.turnId) {
    where.push("turn_id = :turn_id");
    params[":turn_id"] = filter.turnId;
  }
  const suffix = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";

  const auditRows = db.prepare(
    `SELECT trace_id, turn_id, type, ts, payload_json FROM audit_events${suffix}`,
  ).all(params) as Array<{ trace_id: string; turn_id: string | null; type: string; ts: string; payload_json: string }>;
  for (const row of auditRows) {
    entries.push({
      source: "audit_events",
      ts: row.ts,
      traceId: row.trace_id,
      turnId: row.turn_id,
      type: row.type,
      payload: parseJsonRecord(row.payload_json),
    });
  }

  const dispatchRows = db.prepare(
    `SELECT trace_id, turn_id, unit_type, unit_id, status, started_at, ended_at, exit_reason,
            error_summary, retry_after_ms, attempt_n, max_attempts
     FROM unit_dispatches${suffix}`,
  ).all(params) as Array<Record<string, unknown>>;
  for (const row of dispatchRows) {
    entries.push({
      source: "unit_dispatches",
      ts: String(row.ended_at ?? row.started_at ?? ""),
      traceId: String(row.trace_id ?? ""),
      turnId: typeof row.turn_id === "string" ? row.turn_id : null,
      type: `dispatch-${String(row.status ?? "unknown")}`,
      payload: { ...row },
    });
  }

  const gitRows = db.prepare(
    `SELECT trace_id, turn_id, unit_type, unit_id, stage, action, push, status, error,
            metadata_json, updated_at
     FROM turn_git_transactions${suffix}`,
  ).all(params) as Array<Record<string, unknown>>;
  for (const row of gitRows) {
    entries.push({
      source: "turn_git_transactions",
      ts: String(row.updated_at ?? ""),
      traceId: String(row.trace_id ?? ""),
      turnId: typeof row.turn_id === "string" ? row.turn_id : null,
      type: `gitops-${String(row.stage ?? "unknown")}`,
      payload: {
        ...row,
        metadata: parseJsonRecord(row.metadata_json),
      },
    });
  }

  return entries.filter((entry) => entry.ts !== "").sort(byTimestamp);
}

function readJsonlTimeline(basePath: string, filter: TurnTimelineFilter): TurnTimelineEntry[] {
  const path = join(gsdRoot(basePath), "audit", "events.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line): TurnTimelineEntry | null => {
      const event = parseJsonRecord(line);
      const entry: TurnTimelineEntry = {
        source: "audit_jsonl",
        ts: String(event.ts ?? ""),
        traceId: typeof event.traceId === "string" ? event.traceId : undefined,
        turnId: typeof event.turnId === "string" ? event.turnId : null,
        type: String(event.type ?? "audit"),
        payload: parseJsonRecord(event.payload),
      };
      return entry.ts && matchesFilter(entry, filter) ? entry : null;
    })
    .filter((entry): entry is TurnTimelineEntry => entry !== null)
    .sort(byTimestamp);
}

export function buildTurnTimeline(basePath: string, filter: TurnTimelineFilter = {}): TurnTimeline {
  if (isDbAvailable()) {
    return {
      authoritative: "db",
      degraded: false,
      entries: readDbTimeline(filter),
    };
  }

  return {
    authoritative: "degraded-fallback",
    degraded: true,
    entries: readJsonlTimeline(basePath, filter),
  };
}
