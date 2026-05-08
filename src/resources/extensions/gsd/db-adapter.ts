// Project/App: GSD-2
// File Purpose: Normalized SQLite adapter wrapper used by the GSD database facade.

export interface DbStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}

export interface DbAdapter {
  exec(sql: string): void;
  prepare(sql: string): DbStatement;
  close(): void;
}

export function normalizeDbRow(row: unknown): Record<string, unknown> | undefined {
  if (row == null) return undefined;
  if (Object.getPrototypeOf(row) === null) {
    return { ...(row as Record<string, unknown>) };
  }
  return row as Record<string, unknown>;
}

export function normalizeDbRows(rows: unknown[]): Record<string, unknown>[] {
  return rows.map((row) => normalizeDbRow(row)!);
}

export function createDbAdapter(rawDb: unknown): DbAdapter {
  const db = rawDb as {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...args: unknown[]): unknown;
      get(...args: unknown[]): unknown;
      all(...args: unknown[]): unknown[];
    };
    close(): void;
  };

  const stmtCache = new Map<string, DbStatement>();

  function wrapStmt(raw: {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  }): DbStatement {
    return {
      run(...params: unknown[]): unknown {
        return raw.run(...params);
      },
      get(...params: unknown[]): Record<string, unknown> | undefined {
        return normalizeDbRow(raw.get(...params));
      },
      all(...params: unknown[]): Record<string, unknown>[] {
        return normalizeDbRows(raw.all(...params));
      },
    };
  }

  return {
    exec(sql: string): void {
      db.exec(sql);
    },
    prepare(sql: string): DbStatement {
      let cached = stmtCache.get(sql);
      if (cached) return cached;
      cached = wrapStmt(db.prepare(sql));
      stmtCache.set(sql, cached);
      return cached;
    },
    close(): void {
      stmtCache.clear();
      db.close();
    },
  };
}
