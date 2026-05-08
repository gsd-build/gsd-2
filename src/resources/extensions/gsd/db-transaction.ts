// Project/App: GSD-2
// File Purpose: Transaction depth helper for the GSD database facade.

export interface DbTransactionControls {
  begin(): void;
  beginRead(): void;
  commit(): void;
  rollback(): void;
}

export class DbTransactionRunner {
  private depth = 0;

  isInTransaction(): boolean {
    return this.depth > 0;
  }

  transaction<T>(controls: DbTransactionControls, fn: () => T): T {
    if (this.depth > 0) {
      return this.runNested(fn);
    }

    controls.begin();
    this.depth++;
    try {
      const result = fn();
      controls.commit();
      return result;
    } catch (err) {
      controls.rollback();
      throw err;
    } finally {
      this.depth--;
    }
  }

  readTransaction<T>(
    controls: DbTransactionControls,
    fn: () => T,
    logRollbackError: (error: Error) => void,
  ): T {
    if (this.depth > 0) {
      return this.runNested(fn);
    }

    controls.beginRead();
    this.depth++;
    try {
      const result = fn();
      controls.commit();
      return result;
    } catch (err) {
      try {
        controls.rollback();
      } catch (rollbackErr) {
        logRollbackError(rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr)));
      }
      throw err;
    } finally {
      this.depth--;
    }
  }

  private runNested<T>(fn: () => T): T {
    this.depth++;
    try {
      return fn();
    } finally {
      this.depth--;
    }
  }
}

export function createDbTransactionRunner(): DbTransactionRunner {
  return new DbTransactionRunner();
}
