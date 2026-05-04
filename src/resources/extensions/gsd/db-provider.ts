// Project/App: GSD-2
// File Purpose: SQLite provider loading and fallback helpers for the GSD database facade.

export type DbProviderName = "node:sqlite" | "better-sqlite3";

export const BETTER_SQLITE3_PACKAGE = ["better", "sqlite3"].join("-");

export interface SqliteProviderDeps {
  requireModule(id: string): unknown;
  suppressSqliteWarning(): void;
  nodeVersion: string;
  writeStderr(message: string): void;
}

export interface SqliteFallbackOpen {
  providerName: "better-sqlite3";
  providerModule: unknown;
  rawDb: unknown;
}

type NodeSqliteModule = {
  DatabaseSync?: new (path: string) => unknown;
};

type BetterSqliteModule =
  | (new (path: string) => unknown)
  | { default?: new (path: string) => unknown };

export function suppressSqliteWarning(): void {
  const origEmit = process.emit;
  // Override via loose cast: Node's overloaded emit signature is not directly assignable.
  (process as any).emit = function (event: string, ...args: unknown[]): boolean {
    if (
      event === "warning" &&
      args[0] &&
      typeof args[0] === "object" &&
      "name" in args[0] &&
      (args[0] as { name: string }).name === "ExperimentalWarning" &&
      "message" in args[0] &&
      typeof (args[0] as { message: string }).message === "string" &&
      (args[0] as { message: string }).message.includes("SQLite")
    ) {
      return false;
    }
    return origEmit.apply(process, [event, ...args] as Parameters<typeof process.emit>) as unknown as boolean;
  };
}

export class SqliteProviderLoader {
  private providerName: DbProviderName | null = null;
  private providerModule: unknown = null;
  private loadAttempted = false;
  private readonly deps: SqliteProviderDeps;

  constructor(deps: SqliteProviderDeps) {
    this.deps = deps;
  }

  load(): void {
    if (this.loadAttempted) return;
    this.loadAttempted = true;

    try {
      this.deps.suppressSqliteWarning();
      const mod = this.deps.requireModule("node:sqlite") as NodeSqliteModule;
      if (mod.DatabaseSync) {
        this.providerModule = mod;
        this.providerName = "node:sqlite";
        return;
      }
    } catch {
      // unavailable
    }

    const betterSqlite = this.loadBetterSqliteModule();
    if (betterSqlite) {
      this.providerModule = betterSqlite;
      this.providerName = "better-sqlite3";
      return;
    }

    const nodeMajor = parseInt(this.deps.nodeVersion.split(".")[0], 10);
    const versionHint = nodeMajor < 22
      ? ` GSD requires Node >= 22.0.0 (current: v${this.deps.nodeVersion}). Upgrade Node to fix this.`
      : "";
    this.deps.writeStderr(
      `gsd-db: No SQLite provider available (tried node:sqlite, better-sqlite3).${versionHint}\n`,
    );
  }

  getProviderName(): DbProviderName | null {
    return this.providerName;
  }

  openRaw(path: string): unknown {
    this.load();
    if (!this.providerModule || !this.providerName) return null;

    if (this.providerName === "node:sqlite") {
      const { DatabaseSync } = this.providerModule as {
        DatabaseSync: new (path: string) => unknown;
      };
      return new DatabaseSync(path);
    }

    const Database = this.providerModule as new (path: string) => unknown;
    return new Database(path);
  }

  tryOpenBetterSqliteFallback(path: string): SqliteFallbackOpen | null {
    if (this.providerName !== "node:sqlite") return null;

    const Database = this.loadBetterSqliteModule();
    if (!Database) return null;

    return {
      providerName: "better-sqlite3",
      providerModule: Database,
      rawDb: new Database(path),
    };
  }

  commitFallback(fallback: SqliteFallbackOpen): void {
    this.providerName = fallback.providerName;
    this.providerModule = fallback.providerModule;
  }

  reset(): void {
    this.loadAttempted = false;
    this.providerModule = null;
    this.providerName = null;
  }

  private loadBetterSqliteModule(): (new (path: string) => unknown) | null {
    try {
      const mod = this.deps.requireModule(BETTER_SQLITE3_PACKAGE) as BetterSqliteModule;
      if (typeof mod === "function") return mod;
      if (mod && typeof mod.default === "function") return mod.default;
    } catch {
      // unavailable
    }
    return null;
  }
}

export function createSqliteProviderLoader(deps: SqliteProviderDeps): SqliteProviderLoader {
  return new SqliteProviderLoader(deps);
}
