// gsd-2 + Non-correctness-critical key-value storage (Phase C — file-state migration)
//
// STRICT INVARIANT (re-stated from gsd-db.ts createRuntimeKvTableV25):
// runtime_kv is for SOFT state only. UI cursors, dashboard caches,
// last-seen-version markers, resume cursors, and similar values that
// can be lost without breaking auto-mode correctness.
//
// Anything that drives the auto-loop's control flow MUST get typed
// columns in unit_dispatches / workers / milestone_leases — never a
// bag of JSON in runtime_kv. The reviewer's smell test: if losing the
// row would cause the loop to reorder, double-execute, or stuck-loop,
// it does NOT belong here.
//
// Single-host invariant: SQLite WAL coordination, local disk only.
// See db/auto-workers.ts for the same constraint applied to coordination.

import {
  _getAdapter,
  isDbAvailable,
  transaction,
} from "../gsd-db.js";

export type RuntimeKvScope = "global" | "worker" | "milestone";

export interface RuntimeKvRow {
  scope: RuntimeKvScope;
  scope_id: string;
  key: string;
  value_json: string;
  updated_at: string;
}

/**
 * Set or update a runtime_kv row. The value is JSON-stringified before
 * storage. Best-effort — silently no-ops when the DB is unavailable.
 */
export function setRuntimeKv(
  scope: RuntimeKvScope,
  scopeId: string,
  key: string,
  value: unknown,
): void {
  if (!isDbAvailable()) return;
  const now = new Date().toISOString();
  const db = _getAdapter()!;
  let valueJson: string;
  try {
    valueJson = JSON.stringify(value);
  } catch {
    valueJson = JSON.stringify(String(value));
  }
  if (valueJson === undefined) {
    valueJson = JSON.stringify(null);
  }
  transaction(() => {
    db.prepare(
      `INSERT INTO runtime_kv (scope, scope_id, key, value_json, updated_at)
       VALUES (:scope, :scope_id, :key, :value_json, :updated_at)
       ON CONFLICT (scope, scope_id, key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
    ).run({
      ":scope": scope,
      ":scope_id": scopeId,
      ":key": key,
      ":value_json": valueJson,
      ":updated_at": now,
    });
  });
}

/**
 * Read a runtime_kv value, parsed from JSON. Returns null if the row
 * doesn't exist or the DB is unavailable.
 */
export function getRuntimeKv<T = unknown>(
  scope: RuntimeKvScope,
  scopeId: string,
  key: string,
): T | null {
  if (!isDbAvailable()) return null;
  const db = _getAdapter()!;
  const row = db.prepare(
    `SELECT value_json FROM runtime_kv
     WHERE scope = :scope AND scope_id = :scope_id AND key = :key`,
  ).get({ ":scope": scope, ":scope_id": scopeId, ":key": key }) as { value_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return null;
  }
}

/**
 * Delete a runtime_kv row. Idempotent — silently no-ops when the row
 * doesn't exist or the DB is unavailable.
 */
export function deleteRuntimeKv(
  scope: RuntimeKvScope,
  scopeId: string,
  key: string,
): void {
  if (!isDbAvailable()) return;
  const db = _getAdapter()!;
  db.prepare(
    `DELETE FROM runtime_kv WHERE scope = :scope AND scope_id = :scope_id AND key = :key`,
  ).run({ ":scope": scope, ":scope_id": scopeId, ":key": key });
}

/**
 * List all rows within a (scope, scopeId) bucket. Useful for diagnostics
 * and bulk migrations.
 */
export function listRuntimeKv(
  scope: RuntimeKvScope,
  scopeId: string,
): readonly RuntimeKvRow[] {
  if (!isDbAvailable()) return [];
  const db = _getAdapter()!;
  return db.prepare(
    `SELECT scope, scope_id, key, value_json, updated_at
     FROM runtime_kv
     WHERE scope = :scope AND scope_id = :scope_id
     ORDER BY key`,
  ).all({ ":scope": scope, ":scope_id": scopeId }) as unknown as RuntimeKvRow[];
}
