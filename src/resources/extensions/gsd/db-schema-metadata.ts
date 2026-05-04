// Project/App: GSD-2
// File Purpose: SQLite schema metadata helpers for the GSD database facade and migrations.

import type { DbAdapter } from "./db-adapter.js";

export function indexExists(db: DbAdapter, name: string): boolean {
  return !!db.prepare(
    "SELECT 1 as present FROM sqlite_master WHERE type = 'index' AND name = ?",
  ).get(name);
}

export function columnExists(db: DbAdapter, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row["name"] === column);
}

export function ensureColumn(db: DbAdapter, table: string, column: string, ddl: string): void {
  if (!columnExists(db, table, column)) db.exec(ddl);
}
