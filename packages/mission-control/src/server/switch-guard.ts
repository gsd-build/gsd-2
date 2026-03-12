/**
 * Switch guard: prevents concurrent project switches and rejects
 * switches while Claude is processing.
 *
 * Extracted as a testable helper from pipeline.ts.
 */

export interface SwitchGuard {
  /** Acquire the switch lock. Throws if processing or already switching. */
  acquire(): Promise<void>;
  /** Release the switch lock after switch completes. */
  release(): void;
}

/**
 * Create a switch guard with the given isProcessing check.
 * @param isProcessing - callback that returns true if Claude is currently processing
 */
export function createSwitchGuard(
  isProcessing: () => boolean
): SwitchGuard {
  let switching = false;

  return {
    async acquire(): Promise<void> {
      if (isProcessing()) {
        throw new Error("Cannot switch projects while Claude is processing");
      }
      if (switching) {
        throw new Error("Project switch already in progress");
      }
      switching = true;
    },
    release(): void {
      switching = false;
    },
  };
}
