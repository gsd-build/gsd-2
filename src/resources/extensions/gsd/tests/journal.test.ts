import test, { describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  readFileSync,
  existsSync,
  rmSync,
  chmodSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import {
  emitJournalEvent,
  queryJournal,
  type JournalEntry,
} from "../journal.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-journal-test-${randomUUID()}`);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    /* */
  }
}

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    ts: "2025-03-21T10:00:00.000Z",
    flowId: "flow-aaa",
    seq: 0,
    eventType: "iteration-start",
    ...overrides,
  };
}

// ─── emitJournalEvent ─────────────────────────────────────────────────────────

describe("emitJournalEvent", () => {
  let base: string;

  afterEach(() => {
    cleanup(base);
  });

  test("emitJournalEvent creates journal directory and JSONL file", () => {
    base = makeTmpBase();
    const entry = makeEntry();
    emitJournalEvent(base, entry);

    const filePath = join(base, ".gsd", "journal", "2025-03-21.jsonl");
    assert.ok(existsSync(filePath), "JSONL file should exist");

    const raw = readFileSync(filePath, "utf-8").trim();
    const parsed = JSON.parse(raw);
    assert.equal(parsed.ts, entry.ts);
    assert.equal(parsed.flowId, entry.flowId);
    assert.equal(parsed.seq, entry.seq);
    assert.equal(parsed.eventType, entry.eventType);
  });

  test("emitJournalEvent appends multiple lines to the same file", () => {
    base = makeTmpBase();
    emitJournalEvent(base, makeEntry({ seq: 0 }));
    emitJournalEvent(base, makeEntry({ seq: 1, eventType: "dispatch-match" }));
    emitJournalEvent(base, makeEntry({ seq: 2, eventType: "unit-start" }));

    const filePath = join(base, ".gsd", "journal", "2025-03-21.jsonl");
    const lines = readFileSync(filePath, "utf-8").trim().split("\n");
    assert.equal(lines.length, 3, "Should have 3 lines");

    const parsed = lines.map(l => JSON.parse(l));
    assert.equal(parsed[0].seq, 0);
    assert.equal(parsed[1].seq, 1);
    assert.equal(parsed[2].seq, 2);
    assert.equal(parsed[1].eventType, "dispatch-match");
  });

  test("emitJournalEvent auto-creates nonexistent parent directory", () => {
    base = join(tmpdir(), `gsd-journal-test-${randomUUID()}`);
    // Don't create .gsd/ — emitJournalEvent should handle it via mkdirSync recursive
    emitJournalEvent(base, makeEntry());
    const filePath = join(base, ".gsd", "journal", "2025-03-21.jsonl");
    assert.ok(existsSync(filePath), "File should exist even when parent dirs did not");
  });

  test("emitJournalEvent preserves optional fields (rule, causedBy, data)", () => {
    base = makeTmpBase();
    const entry = makeEntry({
      rule: "my-dispatch-rule",
      causedBy: { flowId: "flow-prior", seq: 3 },
      data: { unitId: "M001/S01/T01", status: "ok" },
    });
    emitJournalEvent(base, entry);

    const filePath = join(base, ".gsd", "journal", "2025-03-21.jsonl");
    const parsed = JSON.parse(readFileSync(filePath, "utf-8").trim());
    assert.equal(parsed.rule, "my-dispatch-rule");
    assert.deepEqual(parsed.causedBy, { flowId: "flow-prior", seq: 3 });
    assert.equal(parsed.data.unitId, "M001/S01/T01");
    assert.equal(parsed.data.status, "ok");
  });

  test("emitJournalEvent silently catches write errors (no throw)", () => {
    base = join(tmpdir(), `gsd-journal-test-${randomUUID()}`); // assign for afterEach cleanup
    // Use a path that can't be created — null bytes in path
    assert.doesNotThrow(() => {
      emitJournalEvent("/dev/null/impossible\0path", makeEntry());
    });
  });

  test("emitJournalEvent silently catches read-only directory errors", () => {
    base = makeTmpBase();
    const journalDir = join(base, ".gsd", "journal");
    mkdirSync(journalDir, { recursive: true });

    // Make the journal directory read-only
    chmodSync(journalDir, 0o444);

    // Should not throw
    assert.doesNotThrow(() => {
      emitJournalEvent(base, makeEntry());
    });

    // Restore permissions so afterEach cleanup can remove the directory
    try {
      chmodSync(journalDir, 0o755);
    } catch {
      /* */
    }
  });
});

// ─── Daily Rotation ───────────────────────────────────────────────────────────

describe("daily rotation", () => {
  let base: string;

  afterEach(() => {
    cleanup(base);
  });

  test("daily rotation: events with different dates go to different files", () => {
    base = makeTmpBase();
    emitJournalEvent(base, makeEntry({ ts: "2025-03-20T23:59:59.000Z" }));
    emitJournalEvent(base, makeEntry({ ts: "2025-03-21T00:00:01.000Z" }));
    emitJournalEvent(base, makeEntry({ ts: "2025-03-22T12:00:00.000Z" }));

    const journalDir = join(base, ".gsd", "journal");
    assert.ok(existsSync(join(journalDir, "2025-03-20.jsonl")));
    assert.ok(existsSync(join(journalDir, "2025-03-21.jsonl")));
    assert.ok(existsSync(join(journalDir, "2025-03-22.jsonl")));

    // Verify each file has exactly one line
    for (const date of ["2025-03-20", "2025-03-21", "2025-03-22"]) {
      const lines = readFileSync(join(journalDir, `${date}.jsonl`), "utf-8")
        .trim()
        .split("\n");
      assert.equal(lines.length, 1, `${date}.jsonl should have 1 line`);
    }
  });
});

// ─── queryJournal ─────────────────────────────────────────────────────────────

describe("queryJournal", () => {
  let base: string;

  afterEach(() => {
    cleanup(base);
  });

  test("queryJournal returns all entries when no filters provided", () => {
    base = makeTmpBase();
    emitJournalEvent(base, makeEntry({ seq: 0 }));
    emitJournalEvent(base, makeEntry({ seq: 1, eventType: "dispatch-match" }));

    const results = queryJournal(base);
    assert.equal(results.length, 2);
    assert.equal(results[0].seq, 0);
    assert.equal(results[1].seq, 1);
  });

  test("queryJournal filters by flowId", () => {
    base = makeTmpBase();
    emitJournalEvent(base, makeEntry({ flowId: "flow-aaa", seq: 0 }));
    emitJournalEvent(base, makeEntry({ flowId: "flow-bbb", seq: 1 }));
    emitJournalEvent(base, makeEntry({ flowId: "flow-aaa", seq: 2 }));

    const results = queryJournal(base, { flowId: "flow-aaa" });
    assert.equal(results.length, 2);
    assert.ok(results.every(e => e.flowId === "flow-aaa"));
  });

  test("queryJournal filters by eventType", () => {
    base = makeTmpBase();
    emitJournalEvent(base, makeEntry({ eventType: "iteration-start", seq: 0 }));
    emitJournalEvent(base, makeEntry({ eventType: "dispatch-match", seq: 1 }));
    emitJournalEvent(base, makeEntry({ eventType: "unit-start", seq: 2 }));
    emitJournalEvent(base, makeEntry({ eventType: "dispatch-match", seq: 3 }));

    const results = queryJournal(base, { eventType: "dispatch-match" });
    assert.equal(results.length, 2);
    assert.ok(results.every(e => e.eventType === "dispatch-match"));
  });

  test("queryJournal filters by unitId (from data.unitId)", () => {
    base = makeTmpBase();
    emitJournalEvent(
      base,
      makeEntry({ seq: 0, data: { unitId: "M001/S01/T01" } }),
    );
    emitJournalEvent(
      base,
      makeEntry({ seq: 1, data: { unitId: "M001/S01/T02" } }),
    );
    emitJournalEvent(
      base,
      makeEntry({ seq: 2, data: { unitId: "M001/S01/T01" } }),
    );
    emitJournalEvent(base, makeEntry({ seq: 3 })); // no data

    const results = queryJournal(base, { unitId: "M001/S01/T01" });
    assert.equal(results.length, 2);
    assert.ok(
      results.every(
        e => (e.data as Record<string, unknown>)?.unitId === "M001/S01/T01",
      ),
    );
  });

  test("queryJournal filters by time range (after/before)", () => {
    base = makeTmpBase();
    emitJournalEvent(base, makeEntry({ ts: "2025-03-20T08:00:00.000Z", seq: 0 }));
    emitJournalEvent(base, makeEntry({ ts: "2025-03-21T10:00:00.000Z", seq: 1 }));
    emitJournalEvent(base, makeEntry({ ts: "2025-03-21T15:00:00.000Z", seq: 2 }));
    emitJournalEvent(base, makeEntry({ ts: "2025-03-22T20:00:00.000Z", seq: 3 }));

    // After only
    const afterResults = queryJournal(base, { after: "2025-03-21T00:00:00.000Z" });
    assert.equal(afterResults.length, 3, "3 entries on or after 2025-03-21");

    // Before only
    const beforeResults = queryJournal(base, { before: "2025-03-21T12:00:00.000Z" });
    assert.equal(beforeResults.length, 2, "2 entries on or before noon on 03-21");

    // Both after and before
    const rangeResults = queryJournal(base, {
      after: "2025-03-21T00:00:00.000Z",
      before: "2025-03-21T23:59:59.000Z",
    });
    assert.equal(rangeResults.length, 2, "2 entries within 2025-03-21");
  });

  test("queryJournal combines multiple filters", () => {
    base = makeTmpBase();
    emitJournalEvent(
      base,
      makeEntry({ flowId: "flow-aaa", eventType: "unit-start", seq: 0 }),
    );
    emitJournalEvent(
      base,
      makeEntry({ flowId: "flow-aaa", eventType: "dispatch-match", seq: 1 }),
    );
    emitJournalEvent(
      base,
      makeEntry({ flowId: "flow-bbb", eventType: "unit-start", seq: 2 }),
    );

    const results = queryJournal(base, {
      flowId: "flow-aaa",
      eventType: "unit-start",
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].flowId, "flow-aaa");
    assert.equal(results[0].eventType, "unit-start");
  });

  test("queryJournal on nonexistent directory returns empty array", () => {
    base = join(tmpdir(), `gsd-journal-test-${randomUUID()}`);
    // Don't create anything
    const results = queryJournal(base);
    assert.deepEqual(results, []);
  });

  test("queryJournal skips malformed JSON lines gracefully", () => {
    base = makeTmpBase();
    const journalDir = join(base, ".gsd", "journal");
    mkdirSync(journalDir, { recursive: true });

    // Write a file with a mix of valid and invalid lines
    const validEntry = JSON.stringify(makeEntry({ seq: 0 }));
    const content = `${validEntry}\n{not valid json\n${JSON.stringify(makeEntry({ seq: 1 }))}\n`;
    writeFileSync(join(journalDir, "2025-03-21.jsonl"), content);

    const results = queryJournal(base);
    assert.equal(results.length, 2, "Should skip the malformed line");
    assert.equal(results[0].seq, 0);
    assert.equal(results[1].seq, 1);
  });

  test("queryJournal reads across multiple daily files", () => {
    base = makeTmpBase();
    emitJournalEvent(base, makeEntry({ ts: "2025-03-20T12:00:00.000Z", seq: 0 }));
    emitJournalEvent(base, makeEntry({ ts: "2025-03-21T12:00:00.000Z", seq: 1 }));
    emitJournalEvent(base, makeEntry({ ts: "2025-03-22T12:00:00.000Z", seq: 2 }));

    const results = queryJournal(base);
    assert.equal(results.length, 3, "Should read from all 3 files");
    // Files are sorted, so order should be chronological
    assert.equal(results[0].ts, "2025-03-20T12:00:00.000Z");
    assert.equal(results[1].ts, "2025-03-21T12:00:00.000Z");
    assert.equal(results[2].ts, "2025-03-22T12:00:00.000Z");
  });

  test("queryJournal filters by rule", () => {
    base = makeTmpBase();
    emitJournalEvent(
      base,
      makeEntry({ seq: 0, eventType: "dispatch-match", rule: "dispatch-task" }),
    );
    emitJournalEvent(
      base,
      makeEntry({ seq: 1, eventType: "post-unit-hook", rule: "post-unit-hook" }),
    );
    emitJournalEvent(
      base,
      makeEntry({ seq: 2, eventType: "dispatch-match", rule: "dispatch-task" }),
    );

    const results = queryJournal(base, { rule: "dispatch-task" });
    assert.equal(results.length, 2, "Should return only dispatch-task entries");
    assert.ok(
      results.every(e => e.rule === "dispatch-task"),
      "All results should have rule === 'dispatch-task'",
    );
  });
});
