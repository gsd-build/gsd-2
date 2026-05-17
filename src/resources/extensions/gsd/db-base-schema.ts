// Project/App: GSD-2
// File Purpose: Base table, index, and view DDL for the GSD database facade.

import type { DbAdapter } from "./db-adapter.js";

export interface BaseSchemaHooks {
  tryCreateMemoriesFts(db: DbAdapter): boolean;
  ensureVerificationEvidenceDedupIndex(db: DbAdapter): void;
}

export function createBaseSchemaObjects(db: DbAdapter, hooks: BaseSchemaHooks): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      when_context TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL DEFAULT '',
      decision TEXT NOT NULL DEFAULT '',
      choice TEXT NOT NULL DEFAULT '',
      rationale TEXT NOT NULL DEFAULT '',
      revisable TEXT NOT NULL DEFAULT '',
      made_by TEXT NOT NULL DEFAULT 'agent',
      source TEXT NOT NULL DEFAULT 'discussion',
      superseded_by TEXT DEFAULT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS requirements (
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      path TEXT PRIMARY KEY,
      artifact_type TEXT NOT NULL DEFAULT '',
      milestone_id TEXT DEFAULT NULL,
      slice_id TEXT DEFAULT NULL,
      task_id TEXT DEFAULT NULL,
      full_content TEXT NOT NULL DEFAULT '',
      imported_at TEXT NOT NULL DEFAULT '',
      content_hash TEXT DEFAULT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.8,
      source_unit_type TEXT,
      source_unit_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      superseded_by TEXT DEFAULT NULL,
      hit_count INTEGER NOT NULL DEFAULT 0,
      scope TEXT NOT NULL DEFAULT 'project',
      tags TEXT NOT NULL DEFAULT '[]',
      structured_fields TEXT DEFAULT NULL,
      last_hit_at TEXT DEFAULT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_processed_units (
      unit_key TEXT PRIMARY KEY,
      activity_file TEXT,
      processed_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_sources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      uri TEXT,
      title TEXT,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL UNIQUE,
      imported_at TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'project',
      tags TEXT NOT NULL DEFAULT '[]'
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_embeddings (
      memory_id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      dim INTEGER NOT NULL,
      vector BLOB NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_relations (
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      rel TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.8,
      created_at TEXT NOT NULL,
      PRIMARY KEY (from_id, to_id, rel)
    )
  `);

  hooks.tryCreateMemoriesFts(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      depends_on TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT DEFAULT NULL,
      vision TEXT NOT NULL DEFAULT '',
      success_criteria TEXT NOT NULL DEFAULT '[]',
      key_risks TEXT NOT NULL DEFAULT '[]',
      proof_strategy TEXT NOT NULL DEFAULT '[]',
      verification_contract TEXT NOT NULL DEFAULT '',
      verification_integration TEXT NOT NULL DEFAULT '',
      verification_operational TEXT NOT NULL DEFAULT '',
      verification_uat TEXT NOT NULL DEFAULT '',
      definition_of_done TEXT NOT NULL DEFAULT '[]',
      requirement_coverage TEXT NOT NULL DEFAULT '',
      boundary_map_markdown TEXT NOT NULL DEFAULT '',
      sequence INTEGER DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS slices (
      milestone_id TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      risk TEXT NOT NULL DEFAULT 'medium',
      depends TEXT NOT NULL DEFAULT '[]',
      demo TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT DEFAULT NULL,
      full_summary_md TEXT NOT NULL DEFAULT '',
      full_uat_md TEXT NOT NULL DEFAULT '',
      goal TEXT NOT NULL DEFAULT '',
      success_criteria TEXT NOT NULL DEFAULT '',
      proof_level TEXT NOT NULL DEFAULT '',
      integration_closure TEXT NOT NULL DEFAULT '',
      observability_impact TEXT NOT NULL DEFAULT '',
      target_repositories TEXT NOT NULL DEFAULT '[]',
      sequence INTEGER DEFAULT 0,
      replan_triggered_at TEXT DEFAULT NULL,
      is_sketch INTEGER NOT NULL DEFAULT 0,
      sketch_scope TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (milestone_id, id),
      FOREIGN KEY (milestone_id) REFERENCES milestones(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      milestone_id TEXT NOT NULL,
      slice_id TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      one_liner TEXT NOT NULL DEFAULT '',
      narrative TEXT NOT NULL DEFAULT '',
      verification_result TEXT NOT NULL DEFAULT '',
      duration TEXT NOT NULL DEFAULT '',
      completed_at TEXT DEFAULT NULL,
      blocker_discovered INTEGER DEFAULT 0,
      blocker_source TEXT NOT NULL DEFAULT '',
      escalation_pending INTEGER NOT NULL DEFAULT 0,
      escalation_awaiting_review INTEGER NOT NULL DEFAULT 0,
      escalation_artifact_path TEXT DEFAULT NULL,
      escalation_override_applied_at TEXT DEFAULT NULL,
      deviations TEXT NOT NULL DEFAULT '',
      known_issues TEXT NOT NULL DEFAULT '',
      key_files TEXT NOT NULL DEFAULT '[]',
      key_decisions TEXT NOT NULL DEFAULT '[]',
      full_summary_md TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      estimate TEXT NOT NULL DEFAULT '',
      files TEXT NOT NULL DEFAULT '[]',
      verify TEXT NOT NULL DEFAULT '',
      inputs TEXT NOT NULL DEFAULT '[]',
      expected_output TEXT NOT NULL DEFAULT '[]',
      observability_impact TEXT NOT NULL DEFAULT '',
      full_plan_md TEXT NOT NULL DEFAULT '',
      target_repositories TEXT NOT NULL DEFAULT '[]',
      sequence INTEGER DEFAULT 0,
      PRIMARY KEY (milestone_id, slice_id, id),
      FOREIGN KEY (milestone_id, slice_id) REFERENCES slices(milestone_id, id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS verification_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL DEFAULT '',
      slice_id TEXT NOT NULL DEFAULT '',
      milestone_id TEXT NOT NULL DEFAULT '',
      command TEXT NOT NULL DEFAULT '',
      exit_code INTEGER DEFAULT 0,
      verdict TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (milestone_id, slice_id, task_id) REFERENCES tasks(milestone_id, slice_id, id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS replan_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      milestone_id TEXT NOT NULL DEFAULT '',
      slice_id TEXT DEFAULT NULL,
      task_id TEXT DEFAULT NULL,
      summary TEXT NOT NULL DEFAULT '',
      previous_artifact_path TEXT DEFAULT NULL,
      replacement_artifact_path TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (milestone_id) REFERENCES milestones(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS assessments (
      path TEXT PRIMARY KEY,
      milestone_id TEXT NOT NULL DEFAULT '',
      slice_id TEXT DEFAULT NULL,
      task_id TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL DEFAULT '',
      full_content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (milestone_id) REFERENCES milestones(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS quality_gates (
      milestone_id TEXT NOT NULL,
      slice_id TEXT NOT NULL,
      gate_id TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'slice',
      task_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      verdict TEXT NOT NULL DEFAULT '',
      rationale TEXT NOT NULL DEFAULT '',
      findings TEXT NOT NULL DEFAULT '',
      evaluated_at TEXT DEFAULT NULL,
      PRIMARY KEY (milestone_id, slice_id, gate_id, task_id),
      FOREIGN KEY (milestone_id, slice_id) REFERENCES slices(milestone_id, id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS slice_dependencies (
      milestone_id TEXT NOT NULL,
      slice_id TEXT NOT NULL,
      depends_on_slice_id TEXT NOT NULL,
      PRIMARY KEY (milestone_id, slice_id, depends_on_slice_id),
      FOREIGN KEY (milestone_id, slice_id) REFERENCES slices(milestone_id, id),
      FOREIGN KEY (milestone_id, depends_on_slice_id) REFERENCES slices(milestone_id, id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS gate_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      gate_id TEXT NOT NULL,
      gate_type TEXT NOT NULL DEFAULT '',
      unit_type TEXT DEFAULT NULL,
      unit_id TEXT DEFAULT NULL,
      milestone_id TEXT DEFAULT NULL,
      slice_id TEXT DEFAULT NULL,
      task_id TEXT DEFAULT NULL,
      outcome TEXT NOT NULL DEFAULT 'pass',
      failure_class TEXT NOT NULL DEFAULT 'none',
      rationale TEXT NOT NULL DEFAULT '',
      findings TEXT NOT NULL DEFAULT '',
      attempt INTEGER NOT NULL DEFAULT 1,
      max_attempts INTEGER NOT NULL DEFAULT 1,
      retryable INTEGER NOT NULL DEFAULT 0,
      evaluated_at TEXT NOT NULL DEFAULT ''
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS turn_git_transactions (
      trace_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      unit_type TEXT DEFAULT NULL,
      unit_id TEXT DEFAULT NULL,
      stage TEXT NOT NULL DEFAULT 'turn-start',
      action TEXT NOT NULL DEFAULT 'status-only',
      push INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ok',
      error TEXT DEFAULT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (trace_id, turn_id, stage)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS milestone_commit_attributions (
      commit_sha TEXT NOT NULL,
      milestone_id TEXT NOT NULL,
      slice_id TEXT DEFAULT NULL,
      task_id TEXT DEFAULT NULL,
      source TEXT NOT NULL DEFAULT 'recorded',
      confidence REAL NOT NULL DEFAULT 1.0,
      files_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (commit_sha, milestone_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      event_id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      turn_id TEXT DEFAULT NULL,
      caused_by TEXT DEFAULT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL,
      ts TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}'
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_turn_index (
      trace_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      first_ts TEXT NOT NULL,
      last_ts TEXT NOT NULL,
      event_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (trace_id, turn_id)
    )
  `);

  db.exec("CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(superseded_by)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_replan_history_milestone ON replan_history(milestone_id, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(milestone_id, slice_id, status)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_slices_active ON slices(milestone_id, status)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_quality_gates_pending ON quality_gates(milestone_id, slice_id, status)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_verification_evidence_task ON verification_evidence(milestone_id, slice_id, task_id)");
  hooks.ensureVerificationEvidenceDedupIndex(db);
  db.exec("CREATE INDEX IF NOT EXISTS idx_slice_deps_target ON slice_dependencies(milestone_id, depends_on_slice_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_gate_runs_turn ON gate_runs(trace_id, turn_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_gate_runs_lookup ON gate_runs(milestone_id, slice_id, task_id, gate_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_turn_git_tx_turn ON turn_git_transactions(trace_id, turn_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_milestone_commit_attr_milestone ON milestone_commit_attributions(milestone_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_audit_events_trace ON audit_events(trace_id, ts)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_audit_events_turn ON audit_events(trace_id, turn_id, ts)");

  db.exec("CREATE VIEW IF NOT EXISTS active_decisions AS SELECT * FROM decisions WHERE superseded_by IS NULL");
  db.exec("CREATE VIEW IF NOT EXISTS active_requirements AS SELECT * FROM requirements WHERE superseded_by IS NULL");
  db.exec("CREATE VIEW IF NOT EXISTS active_memories AS SELECT * FROM memories WHERE superseded_by IS NULL");
}
