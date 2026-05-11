// ADR-013 Phase 6 cutover (Stage 1) — queryDecisionsFromMemories parity test.
//
// Verifies that reading active decisions from the `memories` table returns
// the same Decision[] shape and content as the legacy `queryDecisions` read
// from the `decisions` table, once Phase 5 dual-write has populated both
// surfaces. Lock-in regression for the prompt-inline read path which was
// switched to the memories source in auto-prompts.ts:inlineDecisionsFromDb.
//
// Scope of parity: ACTIVE decisions only. Superseded rows are intentionally
// skipped by the existing backfill, so this test does not assert parity for
// the supersedes-chain — that gap is acknowledged in
// queryDecisionsFromMemories' contract and tracked for Stage 2/3.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  closeDatabase,
  openDatabase,
} from "../gsd-db.ts";
import { saveDecisionToDb } from "../db-writer.ts";
import {
  queryDecisions,
  queryDecisionsFromMemories,
} from "../context-store.ts";

function makeTmpBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-decisions-memories-"));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  openDatabase(join(base, ".gsd", "gsd.db"));
  return base;
}

function cleanup(base: string): void {
  try {
    closeDatabase();
  } catch {
    /* noop */
  }
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

async function seedDecision(
  base: string,
  fields: {
    when_context: string;
    scope: string;
    decision: string;
    choice: string;
    rationale: string;
    revisable?: string;
    made_by?: "human" | "agent" | "collaborative";
  },
): Promise<string> {
  // saveDecisionToDb dual-writes to both `decisions` and `memories` per ADR-013
  // Phase 5 — exactly the steady state this parity test depends on.
  const result = await saveDecisionToDb(
    {
      when_context: fields.when_context,
      scope: fields.scope,
      decision: fields.decision,
      choice: fields.choice,
      rationale: fields.rationale,
      revisable: fields.revisable ?? "Yes",
      made_by: fields.made_by ?? "agent",
    },
    base,
  );
  return result.id;
}

test("queryDecisionsFromMemories returns empty when no decisions exist", () => {
  const base = makeTmpBase();
  try {
    assert.deepEqual(queryDecisionsFromMemories(), []);
    assert.deepEqual(queryDecisionsFromMemories({ milestoneId: "M001" }), []);
  } finally {
    cleanup(base);
  }
});

test("queryDecisionsFromMemories matches queryDecisions for a single active decision", async () => {
  const base = makeTmpBase();
  try {
    await seedDecision(base, {
      when_context: "M001 discuss phase",
      scope: "M001",
      decision: "Adopt SQLite for persistence",
      choice: "better-sqlite3",
      rationale: "Native, synchronous, well-supported",
    });

    const fromDecisions = queryDecisions();
    const fromMemories = queryDecisionsFromMemories();

    assert.equal(fromDecisions.length, 1);
    assert.equal(fromMemories.length, 1);

    // Compare the user-visible Decision fields. seq differs across tables
    // (memories.seq vs decisions.seq) so it's intentionally excluded.
    const { seq: _seq1, ...d1 } = fromDecisions[0]!;
    const { seq: _seq2, ...d2 } = fromMemories[0]!;
    assert.deepEqual(d1, d2);
  } finally {
    cleanup(base);
  }
});

test("queryDecisionsFromMemories preserves decision order across multiple writes", async () => {
  const base = makeTmpBase();
  try {
    const id1 = await seedDecision(base, {
      when_context: "M001 discuss",
      scope: "M001",
      decision: "First decision",
      choice: "A",
      rationale: "first",
    });
    const id2 = await seedDecision(base, {
      when_context: "M001 plan",
      scope: "M001",
      decision: "Second decision",
      choice: "B",
      rationale: "second",
    });
    const id3 = await seedDecision(base, {
      when_context: "M002 discuss",
      scope: "M002",
      decision: "Third decision",
      choice: "C",
      rationale: "third",
    });

    const fromMemories = queryDecisionsFromMemories();
    assert.equal(fromMemories.length, 3);
    assert.deepEqual(
      fromMemories.map((d) => d.id),
      [id1, id2, id3],
    );
  } finally {
    cleanup(base);
  }
});

test("queryDecisionsFromMemories filters by milestoneId (substring match on when_context)", async () => {
  const base = makeTmpBase();
  try {
    await seedDecision(base, {
      when_context: "M001 discuss",
      scope: "M001",
      decision: "M001 decision",
      choice: "A",
      rationale: "x",
    });
    await seedDecision(base, {
      when_context: "M002 plan",
      scope: "M002",
      decision: "M002 decision",
      choice: "B",
      rationale: "y",
    });
    await seedDecision(base, {
      when_context: "M001 execute",
      scope: "M001-S01",
      decision: "M001 follow-up",
      choice: "C",
      rationale: "z",
    });
    await seedDecision(base, {
      when_context: "M003 plan",
      scope: "M003",
      decision: "Use M001 as precedent",
      choice: "D",
      rationale: "Mentions M001 outside when_context",
    });

    const m001 = queryDecisionsFromMemories({ milestoneId: "M001" });
    assert.equal(m001.length, 2, "two decisions reference M001 in when_context");
    assert.ok(m001.every((d) => d.when_context.includes("M001")));

    const m002 = queryDecisionsFromMemories({ milestoneId: "M002" });
    assert.equal(m002.length, 1);
    assert.equal(m002[0]?.decision, "M002 decision");
  } finally {
    cleanup(base);
  }
});

test("queryDecisionsFromMemories filters by scope (exact match, no prefix collisions)", async () => {
  const base = makeTmpBase();
  try {
    await seedDecision(base, {
      when_context: "M001 discuss",
      scope: "M001",
      decision: "Milestone-level",
      choice: "A",
      rationale: "x",
    });
    await seedDecision(base, {
      when_context: "M001 plan",
      scope: "M001-S01",
      decision: "Slice-level",
      choice: "B",
      rationale: "y",
    });
    await seedDecision(base, {
      when_context: "M001 plan",
      scope: "M001-S02",
      decision: "Different slice",
      choice: "C",
      rationale: "z",
    });

    // Exact-scope filter must not match prefix-similar values.
    const milestoneScope = queryDecisionsFromMemories({ scope: "M001" });
    assert.equal(milestoneScope.length, 1, "scope=M001 must not match M001-S01 / M001-S02");
    assert.equal(milestoneScope[0]?.scope, "M001");

    const sliceScope = queryDecisionsFromMemories({ scope: "M001-S01" });
    assert.equal(sliceScope.length, 1);
    assert.equal(sliceScope[0]?.scope, "M001-S01");
  } finally {
    cleanup(base);
  }
});

test("queryDecisionsFromMemories matches queryDecisions for combined milestoneId + scope filters", async () => {
  const base = makeTmpBase();
  try {
    await seedDecision(base, {
      when_context: "M001 discuss",
      scope: "M001",
      decision: "A",
      choice: "1",
      rationale: "x",
    });
    await seedDecision(base, {
      when_context: "M001 plan",
      scope: "M001-S01",
      decision: "B",
      choice: "2",
      rationale: "y",
    });
    await seedDecision(base, {
      when_context: "M002 discuss",
      scope: "M002",
      decision: "C",
      choice: "3",
      rationale: "z",
    });

    const opts = { milestoneId: "M001", scope: "M001-S01" };
    const fromDecisions = queryDecisions(opts);
    const fromMemories = queryDecisionsFromMemories(opts);

    assert.equal(fromDecisions.length, fromMemories.length);
    assert.equal(fromMemories.length, 1);
    assert.equal(fromMemories[0]?.id, fromDecisions[0]?.id);
    assert.equal(fromMemories[0]?.scope, "M001-S01");
  } finally {
    cleanup(base);
  }
});

test("queryDecisionsFromMemories ignores memories without a sourceDecisionId marker", async () => {
  const base = makeTmpBase();
  try {
    // Insert a user-authored memory (no sourceDecisionId) — must not appear in
    // the decisions-from-memories projection.
    const { createMemory } = await import("../memory-store.ts");
    createMemory({
      category: "architecture",
      content: "User-authored architecture note, not derived from a decision",
      scope: "project",
    });

    await seedDecision(base, {
      when_context: "M001 discuss",
      scope: "M001",
      decision: "Real decision",
      choice: "A",
      rationale: "x",
    });

    const fromMemories = queryDecisionsFromMemories();
    assert.equal(fromMemories.length, 1, "user-authored memory must not appear as a decision");
    assert.equal(fromMemories[0]?.decision, "Real decision");
  } finally {
    cleanup(base);
  }
});
