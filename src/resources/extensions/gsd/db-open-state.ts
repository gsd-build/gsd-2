// Project/App: GSD-2
// File Purpose: Tracks database open attempt and error status for the GSD database facade.

export type DbOpenPhase = "open" | "initSchema" | "vacuum-recovery";

export interface DbOpenStateSnapshot {
  attempted: boolean;
  lastError: Error | null;
  lastPhase: DbOpenPhase | null;
}

export class DbOpenState {
  private attempted = false;
  private lastError: Error | null = null;
  private lastPhase: DbOpenPhase | null = null;

  markAttempted(): void {
    this.attempted = true;
  }

  clearError(): void {
    this.lastError = null;
    this.lastPhase = null;
  }

  recordError(phase: DbOpenPhase, error: unknown): void {
    this.lastPhase = phase;
    this.lastError = error instanceof Error ? error : new Error(String(error));
  }

  reset(): void {
    this.attempted = false;
    this.clearError();
  }

  snapshot(): DbOpenStateSnapshot {
    return {
      attempted: this.attempted,
      lastError: this.lastError,
      lastPhase: this.lastPhase,
    };
  }
}

export function createDbOpenState(): DbOpenState {
  return new DbOpenState();
}
