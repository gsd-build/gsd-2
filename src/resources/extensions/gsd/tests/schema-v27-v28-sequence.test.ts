// gsd-2 / V27 + V28 schema migration regression tests
//
// Same bug class as #4591 (schema-v21-sequence): a migration block can be
// added but the SCHEMA_VERSION constant left unchanged, causing fresh-install
// + upgrade paths to silently skip the column add. This file pins both V27
// (artifacts.content_hash) and V28 (memories.last_hit_at) at the schema and
// write-path level on fresh-install DBs.

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  openDatabase,
  closeDatabase,
  _getAdapter,
  insertArtifact,
  insertMemoryRow,
  incrementMemoryHitCount,
  SCHEMA_VERSION,
} from "../gsd-db.ts";

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gsd-v27v28-"));
}

function cleanup(base: string): void {
  try { closeDatabase(); } catch { /* noop */ }
  try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* noop */ }
}

test("SCHEMA_VERSION constant is at least 28 (V28 migration committed)", () => {
  assert.ok(
    SCHEMA_VERSION >= 28,
    `SCHEMA_VERSION must be ≥ 28 after V28 migration; got ${SCHEMA_VERSION}`,
  );
});

test("fresh-install DB has artifacts.content_hash column (V27)", () => {
  const base = makeTmp();
  const dbPath = path.join(base, "gsd.db");
  try {
    openDatabase(dbPath);
    const db = _getAdapter()!;
    const cols = db.prepare("PRAGMA table_info(artifacts)").all() as Array<Record<string, unknown>>;
    const colNames = new Set(cols.map((c) => c["name"] as string));
    assert.ok(
      colNames.has("content_hash"),
      "V27 must add content_hash column to artifacts on fresh install",
    );
  } finally {
    cleanup(base);
  }
});

test("fresh-install DB has memories.last_hit_at column (V28)", () => {
  const base = makeTmp();
  const dbPath = path.join(base, "gsd.db");
  try {
    openDatabase(dbPath);
    const db = _getAdapter()!;
    const cols = db.prepare("PRAGMA table_info(memories)").all() as Array<Record<string, unknown>>;
    const colNames = new Set(cols.map((c) => c["name"] as string));
    assert.ok(
      colNames.has("last_hit_at"),
      "V28 must add last_hit_at column to memories on fresh install",
    );
  } finally {
    cleanup(base);
  }
});

test("fresh-install DB stamps SCHEMA_VERSION (≥28) in schema_version table", () => {
  const base = makeTmp();
  const dbPath = path.join(base, "gsd.db");
  try {
    openDatabase(dbPath);
    const db = _getAdapter()!;
    const row = db.prepare("SELECT MAX(version) as v FROM schema_version").get() as Record<string, unknown> | undefined;
    const max = (row?.["v"] as number) ?? 0;
    assert.ok(max >= 28, `fresh install must record schema_version ≥ 28; got ${max}`);
  } finally {
    cleanup(base);
  }
});

test("insertArtifact populates content_hash with SHA-256 of full_content (V27 write-path)", () => {
  const base = makeTmp();
  const dbPath = path.join(base, "gsd.db");
  try {
    openDatabase(dbPath);
    insertArtifact({
      path: "M001/PROJECT.md",
      artifact_type: "PROJECT",
      milestone_id: "M001",
      slice_id: null,
      task_id: null,
      full_content: "hello world",
    });

    const db = _getAdapter()!;
    const row = db
      .prepare("SELECT content_hash FROM artifacts WHERE path = :p")
      .get({ ":p": "M001/PROJECT.md" }) as Record<string, unknown> | undefined;
    const hash = row?.["content_hash"] as string | null | undefined;

    // SHA-256 of "hello world" hex-encoded:
    const expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
    assert.equal(hash, expected, "content_hash must be SHA-256 hex of full_content");
  } finally {
    cleanup(base);
  }
});

test("incrementMemoryHitCount sets last_hit_at alongside hit_count (V28 write-path)", () => {
  const base = makeTmp();
  const dbPath = path.join(base, "gsd.db");
  try {
    openDatabase(dbPath);

    const created = "2026-01-01T00:00:00.000Z";
    insertMemoryRow({
      id: "MEM001",
      category: "gotcha",
      content: "test memory",
      confidence: 0.9,
      sourceUnitType: null,
      sourceUnitId: null,
      createdAt: created,
      updatedAt: created,
      scope: "project",
      tags: [],
      structuredFields: null,
    });

    // Before increment: last_hit_at should be NULL
    const db = _getAdapter()!;
    const before = db
      .prepare("SELECT last_hit_at FROM memories WHERE id = :id")
      .get({ ":id": "MEM001" }) as Record<string, unknown>;
    assert.equal(before["last_hit_at"], null, "last_hit_at starts NULL on fresh insert");

    const hitTime = "2026-02-01T00:00:00.000Z";
    incrementMemoryHitCount("MEM001", hitTime);

    const after = db
      .prepare("SELECT hit_count, last_hit_at FROM memories WHERE id = :id")
      .get({ ":id": "MEM001" }) as Record<string, unknown>;
    assert.equal(after["hit_count"], 1, "hit_count increments");
    assert.equal(after["last_hit_at"], hitTime, "last_hit_at set to provided timestamp");
  } finally {
    cleanup(base);
  }
});
