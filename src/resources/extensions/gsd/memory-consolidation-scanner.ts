// GSD-2 — ADR-013 Phase 6 preflight scanner.
//
// Read-only detection of rows in the legacy knowledge surfaces (decisions
// table, `.gsd/KNOWLEDGE.md`) that lack a corresponding `memories` row.
// Runs on session start (and on demand via doctor); never mutates state.
//
// The scanner exists so the destructive Phase 6 cutover (#5755) can prove
// the migration is complete before any tables are dropped. Today's
// `backfillDecisionsToMemories` writes a `structured_fields.sourceDecisionId`
// marker on each migrated row; the scanner uses that marker for decisions
// detection. A `sourceKnowledgeId` marker is reserved for the parallel
// KNOWLEDGE.md backfill that Phase 6 will introduce — until that ships,
// every KNOWLEDGE.md row is reported as unmigrated, which is the honest
// state of the consolidation.

import { existsSync, readFileSync } from "node:fs";

import { _getAdapter, isDbAvailable } from "./gsd-db.js";
import { appendNotification } from "./notification-store.js";
import { resolveGsdRootFile } from "./paths.js";
import { logWarning } from "./workflow-logger.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KnowledgeSurfaceReport {
  total: number;
  migrated: number;
  unmigrated: number;
  byTable: { rules: number; patterns: number; lessons: number };
  /** Up to 5 sample row IDs/content for diagnosing what's unmigrated. */
  samples: Array<{ table: "rules" | "patterns" | "lessons"; id: string; row: string }>;
}

export interface DecisionsSurfaceReport {
  total: number;
  migrated: number;
  unmigrated: number;
  /** Up to 5 sample decision IDs with a short content excerpt. */
  samples: Array<{ id: string; decision: string }>;
}

export interface ConsolidationGapReport {
  decisions: DecisionsSurfaceReport;
  knowledge: KnowledgeSurfaceReport;
  /** Sum of unmigrated rows across both surfaces. Zero ⇒ clean preflight. */
  totalGaps: number;
  /** Human-readable single-line summary suitable for notifications + logs. */
  summary: string;
}

// ─── KNOWLEDGE.md parsing ────────────────────────────────────────────────────

const KNOWLEDGE_SECTIONS = [
  { table: "rules" as const, heading: "## Rules", idPrefix: "K" },
  { table: "patterns" as const, heading: "## Patterns", idPrefix: "P" },
  { table: "lessons" as const, heading: "## Lessons Learned", idPrefix: "L" },
];

interface KnowledgeRow {
  table: "rules" | "patterns" | "lessons";
  id: string;
  row: string;
}

/**
 * Parse `.gsd/KNOWLEDGE.md` into rows, one per table entry. Skips the table
 * header and separator lines; ignores rows from unrecognized sections.
 *
 * The format is locked in `files.ts:appendKnowledge` — three `## ` sections
 * (Rules, Patterns, Lessons Learned), each a Markdown table. Row IDs are
 * `K###` / `P###` / `L###`.
 */
export function parseKnowledgeRows(content: string): KnowledgeRow[] {
  const rows: KnowledgeRow[] = [];
  if (!content.trim()) return rows;

  // Slice the content into sections by heading. The leading text before the
  // first ## heading is intro prose — ignored.
  const lines = content.split("\n");
  let activeSection: typeof KNOWLEDGE_SECTIONS[number] | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      activeSection = KNOWLEDGE_SECTIONS.find((s) => s.heading === trimmed);
      continue;
    }
    if (!activeSection) continue;
    if (!trimmed.startsWith("|")) continue;

    // Skip the table header rows: the column-titles line and the |---|---| separator.
    // Real data rows start with `| <prefix>### |`.
    const idMatch = new RegExp(`^\\|\\s*(${activeSection.idPrefix}\\d+)\\s*\\|`).exec(trimmed);
    if (!idMatch) continue;

    rows.push({
      table: activeSection.table,
      id: idMatch[1] ?? "",
      row: trimmed,
    });
  }

  return rows;
}

function knowledgeMdContent(basePath: string): string {
  const path = resolveGsdRootFile(basePath, "KNOWLEDGE");
  if (!existsSync(path)) return "";
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

// ─── DB queries ──────────────────────────────────────────────────────────────

interface DecisionRow {
  id: string;
  decision: string;
}

function getActiveDecisions(): DecisionRow[] {
  if (!isDbAvailable()) return [];
  const adapter = _getAdapter();
  if (!adapter) return [];
  try {
    const rows = adapter
      .prepare(
        "SELECT id, decision FROM decisions WHERE superseded_by IS NULL",
      )
      .all() as Array<Record<string, unknown>>;
    return rows
      .map((row): DecisionRow => ({
        id: String(row["id"] ?? ""),
        decision: String(row["decision"] ?? ""),
      }))
      .filter((row) => row.id.length > 0);
  } catch {
    return [];
  }
}

/**
 * True when a memory row has a `structured_fields` JSON payload containing
 * the given `markerKey: "value"` pair. Matches the LIKE pattern used by
 * `backfillDecisionsToMemories` so the scanner is consistent with the
 * backfill's idempotency check.
 */
function memoryHasSourceMarker(markerKey: string, value: string): boolean {
  if (!isDbAvailable()) return false;
  const adapter = _getAdapter();
  if (!adapter) return false;
  try {
    const pattern = `%"${markerKey}":"${value}"%`;
    const row = adapter
      .prepare("SELECT 1 FROM memories WHERE structured_fields LIKE :pattern LIMIT 1")
      .get({ ":pattern": pattern });
    return row !== undefined;
  } catch {
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

const SAMPLE_LIMIT = 5;

/**
 * Scan the legacy knowledge surfaces and return a structured report of what's
 * already in the `memories` table vs what's still unmigrated. Pure detection
 * — no DB writes, no file writes, no notifications.
 */
export function scanConsolidationGaps(basePath: string): ConsolidationGapReport {
  // ── Decisions ────────────────────────────────────────────────────────
  const decisions = getActiveDecisions();
  const decisionSamples: DecisionsSurfaceReport["samples"] = [];
  let decisionMigrated = 0;
  for (const decision of decisions) {
    if (memoryHasSourceMarker("sourceDecisionId", decision.id)) {
      decisionMigrated += 1;
      continue;
    }
    if (decisionSamples.length < SAMPLE_LIMIT) {
      decisionSamples.push({
        id: decision.id,
        decision: decision.decision.length > 80 ? decision.decision.slice(0, 79) + "…" : decision.decision,
      });
    }
  }

  // ── KNOWLEDGE.md ─────────────────────────────────────────────────────
  const knowledgeRows = parseKnowledgeRows(knowledgeMdContent(basePath));
  const knowledgeByTable = { rules: 0, patterns: 0, lessons: 0 };
  const knowledgeSamples: KnowledgeSurfaceReport["samples"] = [];
  let knowledgeMigrated = 0;
  for (const row of knowledgeRows) {
    knowledgeByTable[row.table] += 1;
    // Phase 6 will introduce a `sourceKnowledgeId` marker as part of the
    // KNOWLEDGE.md backfill. Until that path ships, this check returns
    // false for every row, which is the honest state of the consolidation.
    if (memoryHasSourceMarker("sourceKnowledgeId", row.id)) {
      knowledgeMigrated += 1;
      continue;
    }
    if (knowledgeSamples.length < SAMPLE_LIMIT) {
      knowledgeSamples.push({
        table: row.table,
        id: row.id,
        row: row.row.length > 100 ? row.row.slice(0, 99) + "…" : row.row,
      });
    }
  }

  const decisionsReport: DecisionsSurfaceReport = {
    total: decisions.length,
    migrated: decisionMigrated,
    unmigrated: decisions.length - decisionMigrated,
    samples: decisionSamples,
  };
  const knowledgeReport: KnowledgeSurfaceReport = {
    total: knowledgeRows.length,
    migrated: knowledgeMigrated,
    unmigrated: knowledgeRows.length - knowledgeMigrated,
    byTable: knowledgeByTable,
    samples: knowledgeSamples,
  };

  const totalGaps = decisionsReport.unmigrated + knowledgeReport.unmigrated;

  // Summary line is intentionally short so it fits in a single notification
  // (notification-store truncates messages over 500 chars). Detail is
  // accessible via getProviderSwitchStats-style callers, not embedded here.
  const parts: string[] = [];
  if (decisionsReport.unmigrated > 0) {
    parts.push(`${decisionsReport.unmigrated} of ${decisionsReport.total} active decisions`);
  }
  if (knowledgeReport.unmigrated > 0) {
    parts.push(`${knowledgeReport.unmigrated} of ${knowledgeReport.total} KNOWLEDGE.md rows`);
  }
  const summary =
    parts.length === 0
      ? "Memory consolidation: all decisions and KNOWLEDGE.md rows are in memories."
      : `Memory consolidation: ${parts.join(" and ")} not yet in memories table. Run /doctor for details.`;

  return { decisions: decisionsReport, knowledge: knowledgeReport, totalGaps, summary };
}

/**
 * Run the scanner and emit a persistent notification + workflow-logger
 * warning when gaps exist. Best-effort: never throws; a broken scanner
 * cannot block agent startup.
 *
 * Returns the full {@link ConsolidationGapReport} regardless of whether gaps
 * exist (including when `totalGaps === 0`). Returns `null` only when
 * `scanConsolidationGaps` itself throws. `appendNotification` and
 * `logWarning` are called only when `report.totalGaps > 0`.
 *
 * Idempotent at the surface: the notification store applies its own
 * 30-second dedup window keyed on (severity, source, message), so repeated
 * boots with identical gaps produce one notification, not a flood.
 */
export function reportConsolidationGaps(basePath: string): ConsolidationGapReport | null {
  try {
    const report = scanConsolidationGaps(basePath);
    if (report.totalGaps === 0) return report;
    appendNotification(report.summary, "warning", "workflow-logger");
    logWarning("memory-consolidation", report.summary);
    return report;
  } catch (e) {
    logWarning(
      "memory-consolidation",
      `scanner failed: ${(e as Error).message}`,
    );
    return null;
  }
}
