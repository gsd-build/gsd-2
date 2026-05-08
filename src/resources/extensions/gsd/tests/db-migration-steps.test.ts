// Project/App: GSD-2
// File Purpose: Tests for extracted GSD database migration DDL steps.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { DbAdapter, DbStatement } from "../db-adapter.ts";
import {
  applyMigrationV2Artifacts,
  applyMigrationV3Memories,
  applyMigrationV4DecisionMadeBy,
  applyMigrationV5HierarchyTables,
  applyMigrationV8PlanningFields,
  applyMigrationV11TaskPlanning,
  applyMigrationV13HotPathIndexes,
  applyMigrationV15AuditTables,
  applyMigrationV17TaskEscalation,
  applyMigrationV18MemorySources,
  applyMigrationV19MemoryFts,
  applyMigrationV20MemoryRelations,
  applyMigrationV22QualityGateRepair,
} from "../db-migration-steps.ts";

class FakeStatement implements DbStatement {
  private readonly rows: Record<string, unknown>[];

  constructor(rows: Record<string, unknown>[] = []) {
    this.rows = rows;
  }

  run(): unknown {
    return undefined;
  }

  get(): Record<string, unknown> | undefined {
    return undefined;
  }

  all(): Record<string, unknown>[] {
    return this.rows;
  }
}

class FakeAdapter implements DbAdapter {
  readonly execCalls: string[] = [];
  tableInfoRows: Record<string, unknown>[] = [];

  exec(sql: string): void {
    this.execCalls.push(sql);
  }

  prepare(): DbStatement {
    return new FakeStatement(this.tableInfoRows);
  }

  close(): void {}
}

describe("db-migration-steps", () => {
  test("early migrations create artifact, memory, hierarchy, and active decision structures", () => {
    const db = new FakeAdapter();

    applyMigrationV2Artifacts(db);
    applyMigrationV3Memories(db);
    applyMigrationV4DecisionMadeBy(db);
    applyMigrationV5HierarchyTables(db);

    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS artifacts")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS memories")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE VIEW active_memories")));
    assert.ok(db.execCalls.some((sql) => sql.includes("ALTER TABLE decisions ADD COLUMN made_by")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE VIEW active_decisions")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS milestones")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS tasks")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS verification_evidence")));
  });

  test("planning migration adds planning columns and support tables", () => {
    const db = new FakeAdapter();

    applyMigrationV8PlanningFields(db);

    assert.ok(db.execCalls.some((sql) => sql.includes("ALTER TABLE milestones ADD COLUMN vision")));
    assert.ok(db.execCalls.some((sql) => sql.includes("ALTER TABLE slices ADD COLUMN goal")));
    assert.ok(db.execCalls.some((sql) => sql.includes("ALTER TABLE tasks ADD COLUMN description")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS replan_history")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS assessments")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE INDEX IF NOT EXISTS idx_replan_history_milestone")));
  });

  test("mid migrations add task planning, hot-path indexes, and audit tables", () => {
    const db = new FakeAdapter();
    let dedupeCalls = 0;

    applyMigrationV11TaskPlanning(db);
    applyMigrationV13HotPathIndexes(db, () => {
      dedupeCalls += 1;
    });
    applyMigrationV15AuditTables(db);

    assert.equal(dedupeCalls, 1);
    assert.ok(db.execCalls.some((sql) => sql.includes("ALTER TABLE tasks ADD COLUMN full_plan_md")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_replan_history_unique")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE INDEX IF NOT EXISTS idx_tasks_active")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS gate_runs")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS audit_events")));
  });

  test("late DDL migrations add escalation and memory structures", () => {
    const db = new FakeAdapter();

    applyMigrationV17TaskEscalation(db);
    applyMigrationV18MemorySources(db);
    applyMigrationV20MemoryRelations(db);

    assert.ok(db.execCalls.some((sql) => sql.includes("ALTER TABLE tasks ADD COLUMN escalation_pending")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE INDEX IF NOT EXISTS idx_tasks_escalation_pending")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS memory_sources")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE INDEX IF NOT EXISTS idx_memory_sources_scope")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS memory_relations")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE INDEX IF NOT EXISTS idx_memory_relations_from")));
  });

  test("memory FTS migration delegates data-copy backfill to caller-owned write callback", () => {
    const db = new FakeAdapter();
    let backfillCalls = 0;
    const warnings: string[] = [];

    applyMigrationV19MemoryFts(db, {
      tryCreateMemoriesFts: () => true,
      isMemoriesFtsAvailable: () => true,
      backfillMemoriesFts: () => {
        backfillCalls += 1;
      },
      logWarning: (_scope, message) => warnings.push(message),
    });

    assert.equal(backfillCalls, 1);
    assert.deepEqual(warnings, []);
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS memory_embeddings")));
  });

  test("quality gate repair delegates row copy to caller-owned write callback", () => {
    const db = new FakeAdapter();
    db.tableInfoRows = [{ name: "task_id", notnull: 0 }];
    let copyCalls = 0;

    applyMigrationV22QualityGateRepair(db, {
      copyQualityGateRowsToRepairedTable: () => {
        copyCalls += 1;
      },
    });

    assert.equal(copyCalls, 1);
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE quality_gates_new")));
    assert.ok(db.execCalls.some((sql) => sql.includes("ALTER TABLE quality_gates_new RENAME TO quality_gates")));
    assert.ok(db.execCalls.some((sql) => sql.includes("ALTER TABLE quality_gates ADD COLUMN scope")));
    assert.ok(db.execCalls.some((sql) => sql.includes("ALTER TABLE assessments ADD COLUMN scope")));
  });
});
