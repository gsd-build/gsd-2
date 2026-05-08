// Project/App: GSD-2
// File Purpose: Memory FTS5 SQLite schema helpers for the GSD database facade.

import type { DbAdapter } from "./db-adapter.js";

export interface MemoryFtsSchemaOptions {
  onUnavailable?: (message: string) => void;
}

function formatFtsUnavailableError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/\bmoduel\s*:\s*/gi, "module: ");
}

/**
 * Create the FTS5 virtual table for memories plus the triggers that keep it
 * in sync with the base table. FTS5 may be unavailable on stripped-down
 * SQLite builds — callers should treat failure as non-fatal and fall back
 * to LIKE-based scans in `memory-store.queryMemoriesRanked`.
 */
export function tryCreateMemoriesFtsSchema(
  db: DbAdapter,
  options: MemoryFtsSchemaOptions = {},
): boolean {
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
      USING fts5(content, content='memories', content_rowid='seq', tokenize='porter unicode61')
    `);
    // Triggers mirror inserts / updates / deletes on the base memories table.
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ai
      AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content) VALUES (new.seq, new.content);
      END
    `);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ad
      AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.seq, old.content);
      END
    `);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_au
      AFTER UPDATE OF content ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.seq, old.content);
        INSERT INTO memories_fts(rowid, content) VALUES (new.seq, new.content);
      END
    `);
    return true;
  } catch (err) {
    options.onUnavailable?.(`FTS5 unavailable — memory queries will use LIKE fallback: ${formatFtsUnavailableError(err)}`);
    return false;
  }
}

export function isMemoriesFtsAvailableSchema(db: DbAdapter): boolean {
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'")
      .get();
    return !!row;
  } catch {
    return false;
  }
}
