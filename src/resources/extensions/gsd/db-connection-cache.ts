// Project/App: GSD-2
// File Purpose: Workspace-scoped database connection cache helpers for the GSD database facade.

import type { DbAdapter } from "./db-adapter.js";

export interface DbConnectionCacheEntry {
  dbPath: string;
  db: DbAdapter;
}

export class DbConnectionCache {
  private readonly entries = new Map<string, DbConnectionCacheEntry>();

  get(key: string): DbConnectionCacheEntry | undefined {
    return this.entries.get(key);
  }

  set(key: string, entry: DbConnectionCacheEntry): void {
    this.entries.set(key, entry);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  asReadonlyMap(): ReadonlyMap<string, DbConnectionCacheEntry> {
    return this.entries;
  }

  closeNonActive(activeDb: DbAdapter | null, closeEntry: (entry: DbConnectionCacheEntry) => void): void {
    for (const [key, entry] of this.entries) {
      if (entry.db === activeDb) continue;
      this.entries.delete(key);
      closeEntry(entry);
    }
  }
}

export function createDbConnectionCache(): DbConnectionCache {
  return new DbConnectionCache();
}
