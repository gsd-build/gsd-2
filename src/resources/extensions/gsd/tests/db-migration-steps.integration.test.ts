// gsd-2 (GSD2) + db migration `:memory:` integration tests
//
// Covers the gap left by the FakeAdapter unit tests for the gsd-db split
// (PR #5308): those assert SQL strings, not that DDL actually executes.
// These tests open a real node:sqlite `:memory:` database, run the schema
// helpers, and verify the resulting schema via PRAGMA introspection.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { createDbAdapter, type DbAdapter } from "../db-adapter.ts";
import { createBaseSchemaObjects } from "../db-base-schema.ts";
import { columnExists } from "../db-schema-metadata.ts";
import {
  applyMigrationV2Artifacts,
  applyMigrationV3Memories,
  applyMigrationV4DecisionMadeBy,
  applyMigrationV5HierarchyTables,
  applyMigrationV6SliceSummaries,
  applyMigrationV7Dependencies,
  applyMigrationV8PlanningFields,
  applyMigrationV9Ordering,
  applyMigrationV10ReplanTrigger,
  applyMigrationV11TaskPlanning,
  applyMigrationV12QualityGates,
  applyMigrationV13HotPathIndexes,
  applyMigrationV22QualityGateRepair,
} from "../db-migration-steps.ts";

const _require = createRequire(import.meta.url);

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

function openMemoryAdapter(): { adapter: DbAdapter; close: () => void } {
  const sqlite = _require("node:sqlite") as { DatabaseSync: new (path: string) => unknown };
  const raw = new sqlite.DatabaseSync(":memory:");
  const adapter = createDbAdapter(raw);
  return {
    adapter,
    close: () => adapter.close(),
  };
}

function tableInfo(db: DbAdapter, table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as unknown as ColumnInfo[];
}

function columnNames(db: DbAdapter, table: string): string[] {
  return tableInfo(db, table).map((c) => c.name);
}

function tableExists(db: DbAdapter, table: string): boolean {
  return !!db
    .prepare("SELECT 1 as present FROM sqlite_master WHERE type='table' AND name=?")
    .get(table);
}

function indexExists(db: DbAdapter, name: string): boolean {
  return !!db
    .prepare("SELECT 1 as present FROM sqlite_master WHERE type='index' AND name=?")
    .get(name);
}

function viewExists(db: DbAdapter, name: string): boolean {
  return !!db
    .prepare("SELECT 1 as present FROM sqlite_master WHERE type='view' AND name=?")
    .get(name);
}

describe("db base schema bring-up against :memory: sqlite", () => {
  test("createBaseSchemaObjects executes all DDL without throwing", () => {
    const { adapter, close } = openMemoryAdapter();
    try {
      assert.doesNotThrow(() => {
        createBaseSchemaObjects(adapter, {
          tryCreateMemoriesFts: () => true,
          ensureVerificationEvidenceDedupIndex: () => {},
        });
      });
    } finally {
      close();
    }
  });

  test("base schema produces all expected tables, indexes, and views", () => {
    const { adapter, close } = openMemoryAdapter();
    try {
      createBaseSchemaObjects(adapter, {
        tryCreateMemoriesFts: () => true,
        ensureVerificationEvidenceDedupIndex: () => {},
      });

      const expectedTables = [
        "schema_version",
        "decisions",
        "requirements",
        "artifacts",
        "memories",
        "memory_processed_units",
        "memory_sources",
        "memory_embeddings",
        "memory_relations",
        "milestones",
        "slices",
        "tasks",
        "verification_evidence",
        "replan_history",
        "assessments",
        "quality_gates",
        "slice_dependencies",
        "gate_runs",
        "turn_git_transactions",
        "audit_events",
        "audit_turn_index",
      ];
      for (const t of expectedTables) {
        assert.ok(tableExists(adapter, t), `expected table ${t} to exist`);
      }

      const expectedIndexes = [
        "idx_memories_active",
        "idx_replan_history_milestone",
        "idx_tasks_active",
        "idx_slices_active",
        "idx_milestones_status",
        "idx_quality_gates_pending",
        "idx_verification_evidence_task",
        "idx_slice_deps_target",
        "idx_gate_runs_turn",
        "idx_gate_runs_lookup",
        "idx_turn_git_tx_turn",
        "idx_audit_events_trace",
        "idx_audit_events_turn",
      ];
      for (const i of expectedIndexes) {
        assert.ok(indexExists(adapter, i), `expected index ${i}`);
      }

      for (const v of ["active_decisions", "active_requirements", "active_memories"]) {
        assert.ok(viewExists(adapter, v), `expected view ${v}`);
      }
    } finally {
      close();
    }
  });

  test("base schema decisions table has the documented column shape", () => {
    const { adapter, close } = openMemoryAdapter();
    try {
      createBaseSchemaObjects(adapter, {
        tryCreateMemoriesFts: () => true,
        ensureVerificationEvidenceDedupIndex: () => {},
      });

      const cols = tableInfo(adapter, "decisions");
      const byName = new Map(cols.map((c) => [c.name, c]));

      const seq = byName.get("seq");
      assert.ok(seq, "decisions.seq column missing");
      assert.equal(seq!.type, "INTEGER");
      assert.equal(seq!.pk, 1, "seq should be primary key");

      const id = byName.get("id");
      assert.ok(id);
      assert.equal(id!.type, "TEXT");
      assert.equal(id!.notnull, 1);

      const madeBy = byName.get("made_by");
      assert.ok(madeBy, "decisions.made_by missing (V4 migration column)");
      assert.equal(madeBy!.notnull, 1);

      const source = byName.get("source");
      assert.ok(source, "decisions.source missing (V16 migration column)");
      assert.equal(source!.notnull, 1);
    } finally {
      close();
    }
  });

  test("base schema tasks table promotes composite primary key correctly", () => {
    const { adapter, close } = openMemoryAdapter();
    try {
      createBaseSchemaObjects(adapter, {
        tryCreateMemoriesFts: () => true,
        ensureVerificationEvidenceDedupIndex: () => {},
      });

      const cols = tableInfo(adapter, "tasks");
      const pkCols = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
      assert.deepEqual(pkCols, ["milestone_id", "slice_id", "id"]);
    } finally {
      close();
    }
  });
});

describe("db migration steps end-to-end against :memory: sqlite", () => {
  // Drive a fresh DB from V1 baseline up to V13 so each high-risk migration
  // sees a realistic schema (not the FakeAdapter no-op surface).
  function runUpToV13(adapter: DbAdapter): void {
    adapter.exec(`
      CREATE TABLE schema_version (
        version INTEGER NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
    adapter.exec(`
      CREATE TABLE decisions (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        when_context TEXT NOT NULL DEFAULT '',
        scope TEXT NOT NULL DEFAULT '',
        decision TEXT NOT NULL DEFAULT '',
        choice TEXT NOT NULL DEFAULT '',
        rationale TEXT NOT NULL DEFAULT '',
        revisable TEXT NOT NULL DEFAULT '',
        superseded_by TEXT DEFAULT NULL
      )
    `);
    adapter.exec(`
      CREATE TABLE requirements (
        id TEXT PRIMARY KEY,
        class TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        why TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        primary_owner TEXT NOT NULL DEFAULT '',
        supporting_slices TEXT NOT NULL DEFAULT '',
        validation TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        full_content TEXT NOT NULL DEFAULT '',
        superseded_by TEXT DEFAULT NULL
      )
    `);
    adapter.exec("CREATE VIEW active_decisions AS SELECT * FROM decisions WHERE superseded_by IS NULL");
    adapter.exec("CREATE VIEW active_requirements AS SELECT * FROM requirements WHERE superseded_by IS NULL");

    applyMigrationV2Artifacts(adapter);
    applyMigrationV3Memories(adapter);
    applyMigrationV4DecisionMadeBy(adapter);
    applyMigrationV5HierarchyTables(adapter);
    applyMigrationV6SliceSummaries(adapter);
    applyMigrationV7Dependencies(adapter);
    applyMigrationV8PlanningFields(adapter);
    applyMigrationV9Ordering(adapter);
    applyMigrationV10ReplanTrigger(adapter);
    applyMigrationV11TaskPlanning(adapter);
    applyMigrationV12QualityGates(adapter);
    applyMigrationV13HotPathIndexes(adapter, () => {});
  }

  test("V8 PlanningFields adds every promised ALTER column without throwing", () => {
    const { adapter, close } = openMemoryAdapter();
    try {
      runUpToV13(adapter);

      assert.ok(columnExists(adapter, "milestones", "vision"));
      assert.ok(columnExists(adapter, "milestones", "verification_uat"));
      assert.ok(columnExists(adapter, "milestones", "definition_of_done"));
      assert.ok(columnExists(adapter, "milestones", "boundary_map_markdown"));

      assert.ok(columnExists(adapter, "slices", "goal"));
      assert.ok(columnExists(adapter, "slices", "proof_level"));
      assert.ok(columnExists(adapter, "slices", "observability_impact"));

      assert.ok(columnExists(adapter, "tasks", "estimate"));
      assert.ok(columnExists(adapter, "tasks", "files"));
      assert.ok(columnExists(adapter, "tasks", "expected_output"));

      assert.ok(tableExists(adapter, "replan_history"));
      assert.ok(tableExists(adapter, "assessments"));
    } finally {
      close();
    }
  });

  test("V13 HotPathIndexes succeeds when prior migrations have run (ordering)", () => {
    const { adapter, close } = openMemoryAdapter();
    try {
      runUpToV13(adapter);

      for (const i of [
        "idx_tasks_active",
        "idx_slices_active",
        "idx_milestones_status",
        "idx_quality_gates_pending",
        "idx_verification_evidence_task",
      ]) {
        assert.ok(indexExists(adapter, i), `expected index ${i} after V13`);
      }
    } finally {
      close();
    }
  });

  test("V13 HotPathIndexes throws if quality_gates table does not yet exist (ordering guard)", () => {
    const { adapter, close } = openMemoryAdapter();
    try {
      adapter.exec("CREATE TABLE schema_version (version INTEGER NOT NULL, applied_at TEXT NOT NULL)");
      assert.throws(
        () => applyMigrationV13HotPathIndexes(adapter, () => {}),
        /no such table/i,
      );
    } finally {
      close();
    }
  });

  test("V22 QualityGateRepair rebuilds quality_gates with task_id NOT NULL and preserves indexes", () => {
    const { adapter, close } = openMemoryAdapter();
    try {
      runUpToV13(adapter);

      adapter.exec("DROP INDEX IF EXISTS idx_quality_gates_pending");
      adapter.exec("DROP TABLE quality_gates");
      adapter.exec(`
        CREATE TABLE quality_gates (
          milestone_id TEXT NOT NULL,
          slice_id TEXT NOT NULL,
          gate_id TEXT NOT NULL,
          task_id TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending',
          verdict TEXT NOT NULL DEFAULT '',
          rationale TEXT NOT NULL DEFAULT '',
          findings TEXT NOT NULL DEFAULT '',
          evaluated_at TEXT DEFAULT NULL,
          PRIMARY KEY (milestone_id, slice_id, gate_id, task_id),
          FOREIGN KEY (milestone_id, slice_id) REFERENCES slices(milestone_id, id)
        )
      `);

      const before = tableInfo(adapter, "quality_gates").find((c) => c.name === "task_id");
      assert.ok(before);
      assert.equal(before!.notnull, 0, "pre-repair fixture should have nullable task_id");

      let copyCalled = 0;
      applyMigrationV22QualityGateRepair(adapter, {
        copyQualityGateRowsToRepairedTable: () => {
          copyCalled += 1;
        },
      });

      assert.equal(copyCalled, 1, "repair branch should invoke the row-copy hook exactly once");

      const after = tableInfo(adapter, "quality_gates").find((c) => c.name === "task_id");
      assert.ok(after);
      assert.equal(after!.notnull, 1, "post-repair task_id must be NOT NULL");

      assert.ok(columnExists(adapter, "quality_gates", "scope"));
      assert.ok(columnExists(adapter, "assessments", "scope"));

      assert.ok(indexExists(adapter, "idx_quality_gates_pending"));

      assert.equal(tableExists(adapter, "quality_gates_new"), false);

      assert.deepEqual(columnNames(adapter, "quality_gates"), [
        "milestone_id",
        "slice_id",
        "gate_id",
        "scope",
        "task_id",
        "status",
        "verdict",
        "rationale",
        "findings",
        "evaluated_at",
      ]);
    } finally {
      close();
    }
  });

  test("V22 is a no-op on already-repaired quality_gates", () => {
    const { adapter, close } = openMemoryAdapter();
    try {
      runUpToV13(adapter);

      let copyCalled = 0;
      applyMigrationV22QualityGateRepair(adapter, {
        copyQualityGateRowsToRepairedTable: () => {
          copyCalled += 1;
        },
      });

      assert.equal(copyCalled, 0, "no-op when task_id is already NOT NULL");
      assert.ok(columnExists(adapter, "quality_gates", "scope"));
    } finally {
      close();
    }
  });
});

describe("db provider happy path against :memory: sqlite", () => {
  test("createDbAdapter wraps node:sqlite and supports exec/prepare/close", () => {
    const sqlite = _require("node:sqlite") as { DatabaseSync: new (path: string) => unknown };
    const raw = new sqlite.DatabaseSync(":memory:");
    const adapter = createDbAdapter(raw);

    assert.doesNotThrow(() => adapter.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)"));

    const insert = adapter.prepare("INSERT INTO t (id, v) VALUES (?, ?)");
    insert.run(1, "alpha");
    insert.run(2, "beta");

    const selectOne = adapter.prepare("SELECT v FROM t WHERE id = ?");
    const row = selectOne.get(1);
    assert.deepEqual(row, { v: "alpha" });

    const selectAll = adapter.prepare("SELECT id, v FROM t ORDER BY id");
    const rows = selectAll.all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0]["v"], "alpha");
    assert.equal(rows[1]["v"], "beta");

    const selectAgain = adapter.prepare("SELECT v FROM t WHERE id = ?");
    assert.deepEqual(selectAgain.get(2), { v: "beta" });

    assert.doesNotThrow(() => adapter.close());
  });
});
