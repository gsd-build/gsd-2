// Project/App: GSD-2
// File Purpose: Runtime key-value SQLite schema helper for the GSD database facade.

import type { DbAdapter } from "./db-adapter.js";

/**
 * Create the v25 runtime_kv table. Idempotent — uses IF NOT EXISTS.
 *
 * STRICT INVARIANT: runtime_kv is NON-CORRECTNESS-CRITICAL. UI cursors,
 * dashboard caches, last-seen-version markers, resume cursors, and other
 * "soft" state are OK. Anything that drives auto-mode control flow gets
 * typed columns in unit_dispatches / workers / milestone_leases — never
 * a bag of JSON in runtime_kv.
 *
 * Scope partitioning: ('global', '', key) for project-wide values;
 * ('worker', worker_id, key) for per-worker state (resume cursors);
 * ('milestone', milestone_id, key) for per-milestone soft state.
 */
export function createRuntimeKvTableV25(db: DbAdapter): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_kv (
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scope, scope_id, key)
    )
  `);
}
