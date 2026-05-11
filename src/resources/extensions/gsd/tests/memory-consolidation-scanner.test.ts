// GSD-2 — ADR-013 Phase 6 preflight scanner tests.
//
// Locks in the four states the scanner must distinguish:
//   1. Clean — no gaps, no warning emitted.
//   2. Decisions gap — active decisions without a migrated memory.
//   3. KNOWLEDGE.md gap — rows in the legacy markdown without migration.
//   4. Both gaps — combined summary message.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  openDatabase,
  closeDatabase,
  insertDecision,
} from "../gsd-db.ts";
import { createMemory } from "../memory-store.ts";
import {
  _resetNotificationStore,
  initNotificationStore,
  readNotifications,
} from "../notification-store.ts";
import {
  parseKnowledgeRows,
  reportConsolidationGaps,
  scanConsolidationGaps,
} from "../memory-consolidation-scanner.ts";

function makeTmpBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-consolidation-scan-"));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  openDatabase(join(base, ".gsd", "gsd.db"));
  initNotificationStore(base);
  return base;
}

function cleanup(base: string): void {
  try {
    closeDatabase();
  } catch {
    /* noop */
  }
  _resetNotificationStore();
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

function writeKnowledgeMd(base: string, body: string): void {
  writeFileSync(join(base, ".gsd", "KNOWLEDGE.md"), body, "utf-8");
}

// ─── parseKnowledgeRows ─────────────────────────────────────────────────────

test("parseKnowledgeRows extracts entries from the three legacy tables", () => {
  const content = `# Project Knowledge

Append-only register.

## Rules

| # | Scope | Rule | Why | Added |
|---|-------|------|-----|-------|
| K001 | project | Always pin SQLite version | corruption | 2026-01-01 |
| K002 | M001 | Use UTC | clarity | 2026-01-02 |

## Patterns

| # | Pattern | Where | Notes |
|---|---------|-------|-------|
| P001 | Repository pattern | services/ | guards |

## Lessons Learned

| # | What Happened | Root Cause | Fix | Scope |
|---|--------------|------------|-----|-------|
| L001 | Cache poisoning | reused key | versioned key | project |
`;

  const rows = parseKnowledgeRows(content);
  assert.equal(rows.length, 4, "should extract 2 rules + 1 pattern + 1 lesson");
  assert.deepEqual(
    rows.map((r) => ({ table: r.table, id: r.id })),
    [
      { table: "rules", id: "K001" },
      { table: "rules", id: "K002" },
      { table: "patterns", id: "P001" },
      { table: "lessons", id: "L001" },
    ],
  );
});

test("parseKnowledgeRows skips header/separator rows and unrecognized sections", () => {
  const content = `## Rules

| # | Scope | Rule | Why | Added |
|---|-------|------|-----|-------|

## Other Section

| # | Foo |
|---|-----|
| X999 | bar |
`;

  // Empty Rules table → 0 rows. Unrecognized "Other Section" is ignored.
  assert.equal(parseKnowledgeRows(content).length, 0);
});

test("parseKnowledgeRows returns empty for empty input", () => {
  assert.deepEqual(parseKnowledgeRows(""), []);
  assert.deepEqual(parseKnowledgeRows("   \n\n"), []);
});

// ─── scanConsolidationGaps ─────────────────────────────────────────────────

test("scanConsolidationGaps reports zero gaps when both surfaces are empty", () => {
  const base = makeTmpBase();
  try {
    const report = scanConsolidationGaps(base);
    assert.equal(report.decisions.total, 0);
    assert.equal(report.knowledge.total, 0);
    assert.equal(report.totalGaps, 0);
    assert.match(report.summary, /all decisions and KNOWLEDGE\.md rows are in memories/);
  } finally {
    cleanup(base);
  }
});

test("scanConsolidationGaps detects unmigrated decisions and ignores migrated ones", () => {
  const base = makeTmpBase();
  try {
    insertDecision({
      id: "D001",
      when_context: "2026-01-01",
      scope: "M001",
      decision: "Decision needing migration",
      choice: "A",
      rationale: "because",
      revisable: "yes",
      made_by: "agent",
      superseded_by: null,
    });
    insertDecision({
      id: "D002",
      when_context: "2026-01-02",
      scope: "M001",
      decision: "Already migrated decision",
      choice: "B",
      rationale: "covered",
      revisable: "yes",
      made_by: "agent",
      superseded_by: null,
    });
    // D002 has a corresponding migrated memory; D001 doesn't.
    createMemory({
      category: "architecture",
      content: "Already migrated decision Chose: B. Rationale: covered.",
      scope: "M001",
      structuredFields: { sourceDecisionId: "D002" },
    });

    const report = scanConsolidationGaps(base);
    assert.equal(report.decisions.total, 2);
    assert.equal(report.decisions.migrated, 1);
    assert.equal(report.decisions.unmigrated, 1);
    assert.equal(report.decisions.samples.length, 1);
    assert.equal(report.decisions.samples[0]?.id, "D001");
    assert.equal(report.totalGaps, 1);
    assert.match(report.summary, /1 of 2 active decisions/);
  } finally {
    cleanup(base);
  }
});

test("scanConsolidationGaps skips superseded decisions (historical record only)", () => {
  const base = makeTmpBase();
  try {
    insertDecision({
      id: "D001",
      when_context: "2026-01-01",
      scope: "M001",
      decision: "Superseded — does not need migration",
      choice: "A",
      rationale: "old",
      revisable: "yes",
      made_by: "agent",
      superseded_by: "D002",
    });

    const report = scanConsolidationGaps(base);
    assert.equal(report.decisions.total, 0, "superseded decisions excluded from active count");
    assert.equal(report.totalGaps, 0);
  } finally {
    cleanup(base);
  }
});

test("scanConsolidationGaps detects unmigrated KNOWLEDGE.md rows by table", () => {
  const base = makeTmpBase();
  try {
    writeKnowledgeMd(
      base,
      `## Rules

| # | Scope | Rule | Why | Added |
|---|-------|------|-----|-------|
| K001 | project | Pin SQLite | corruption | 2026-01-01 |
| K002 | M001 | UTC only | clarity | 2026-01-02 |

## Patterns

| # | Pattern | Where | Notes |
|---|---------|-------|-------|
| P001 | Repository | services/ | guards |

## Lessons Learned

| # | What Happened | Root Cause | Fix | Scope |
|---|--------------|------------|-----|-------|
`,
    );

    const report = scanConsolidationGaps(base);
    assert.equal(report.knowledge.total, 3);
    assert.equal(report.knowledge.unmigrated, 3, "no sourceKnowledgeId markers exist yet");
    assert.deepEqual(report.knowledge.byTable, { rules: 2, patterns: 1, lessons: 0 });
    assert.equal(report.knowledge.samples.length, 3);
    assert.equal(report.totalGaps, 3);
    assert.match(report.summary, /3 of 3 KNOWLEDGE\.md rows/);
  } finally {
    cleanup(base);
  }
});

test("scanConsolidationGaps combines decisions and KNOWLEDGE.md gaps in summary", () => {
  const base = makeTmpBase();
  try {
    insertDecision({
      id: "D001",
      when_context: "2026-01-01",
      scope: "M001",
      decision: "Unmigrated decision",
      choice: "A",
      rationale: "x",
      revisable: "yes",
      made_by: "agent",
      superseded_by: null,
    });
    writeKnowledgeMd(
      base,
      `## Rules

| # | Scope | Rule | Why | Added |
|---|-------|------|-----|-------|
| K001 | project | Some rule | reason | 2026-01-01 |
`,
    );

    const report = scanConsolidationGaps(base);
    assert.equal(report.totalGaps, 2);
    assert.match(report.summary, /1 of 1 active decisions/);
    assert.match(report.summary, /1 of 1 KNOWLEDGE\.md rows/);
  } finally {
    cleanup(base);
  }
});

// ─── reportConsolidationGaps ───────────────────────────────────────────────

test("reportConsolidationGaps emits a notification + warning when gaps exist", () => {
  const base = makeTmpBase();
  try {
    insertDecision({
      id: "D001",
      when_context: "2026-01-01",
      scope: "M001",
      decision: "Unmigrated",
      choice: "A",
      rationale: "x",
      revisable: "yes",
      made_by: "agent",
      superseded_by: null,
    });

    const report = reportConsolidationGaps(base);
    assert.ok(report);
    assert.equal(report.totalGaps, 1);

    const notifications = readNotifications(base);
    const gapNotifs = notifications.filter((n) => n.message.includes("Memory consolidation"));
    assert.ok(gapNotifs.length >= 1, "a consolidation notification should be persisted");
    assert.equal(gapNotifs[0]?.severity, "warning");
  } finally {
    cleanup(base);
  }
});

test("reportConsolidationGaps stays silent when there are no gaps", () => {
  const base = makeTmpBase();
  try {
    const report = reportConsolidationGaps(base);
    assert.ok(report);
    assert.equal(report.totalGaps, 0);
    const notifications = readNotifications(base);
    const gapNotifs = notifications.filter((n) => n.message.includes("not yet in memories"));
    assert.equal(gapNotifs.length, 0, "no warning notification when clean");
  } finally {
    cleanup(base);
  }
});
