// Project/App: GSD-2
// File Purpose: Best-effort dispatch ledger write helpers for auto-mode loop adapters.

interface DispatchLedgerWriteDeps {
  logWriteFailure: (err: unknown) => void;
}

interface DispatchLedgerFailDeps extends DispatchLedgerWriteDeps {
  markFailed: (dispatchId: number, details: { errorSummary: string }) => void;
}

interface DispatchLedgerCompleteDeps extends DispatchLedgerWriteDeps {
  markCompleted: (dispatchId: number) => void;
}

export function settleDispatchFailed(
  dispatchId: number | null,
  errorSummary: string,
  deps: DispatchLedgerFailDeps,
): boolean {
  if (dispatchId === null) return false;

  try {
    deps.markFailed(dispatchId, { errorSummary });
    return true;
  } catch (err) {
    deps.logWriteFailure(err);
    return false;
  }
}

export function settleDispatchCompleted(
  dispatchId: number | null,
  deps: DispatchLedgerCompleteDeps,
): boolean {
  if (dispatchId === null) return false;

  try {
    deps.markCompleted(dispatchId);
    return true;
  } catch (err) {
    deps.logWriteFailure(err);
    return false;
  }
}
