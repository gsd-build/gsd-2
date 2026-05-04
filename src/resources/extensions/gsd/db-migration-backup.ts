// Project/App: GSD-2
// File Purpose: Pre-migration backup helper for GSD database schema upgrades.

import type { DbAdapter } from "./db-adapter.js";

export interface MigrationBackupDeps {
  existsSync(path: string): boolean;
  copyFileSync(src: string, dest: string): void;
  logWarning(scope: string, message: string): void;
}

export function backupDatabaseBeforeMigration(
  db: DbAdapter,
  dbPath: string | null,
  currentVersion: number,
  deps: MigrationBackupDeps,
): void {
  if (!dbPath || dbPath === ":memory:" || !deps.existsSync(dbPath)) return;

  try {
    const backupPath = `${dbPath}.backup-v${currentVersion}`;
    if (deps.existsSync(backupPath)) return;

    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      // Checkpoint is best effort; copying the base file is still better than no backup.
    }
    deps.copyFileSync(dbPath, backupPath);
  } catch (backupErr) {
    const message = backupErr instanceof Error ? backupErr.message : String(backupErr);
    deps.logWarning("db", `Pre-migration backup failed: ${message}`);
  }
}
