// Project/App: GSD-2
// File Purpose: ADR-017 typed reconciliation failure for Recovery Classification.

import type { DriftRecord } from "./types.js";

export interface ReconciliationFailureDetail {
  drift: DriftRecord;
  cause: unknown;
}

export interface ReconciliationDetectionFailureDetail {
  handlerKind: string;
  phase: "detect";
  basePath: string;
  statePhase?: string;
  activeMilestoneId?: string;
  cause: unknown;
}

export interface ReconciliationFailedErrorOptions {
  failures?: ReadonlyArray<ReconciliationFailureDetail>;
  detectionFailures?: ReadonlyArray<ReconciliationDetectionFailureDetail>;
  persistentDrift?: ReadonlyArray<DriftRecord>;
  pass?: number;
}

/**
 * Thrown by reconcileBeforeDispatch when:
 *   - one or more repair functions throw within a pass (`failures` populated), or
 *   - drift persists after the cap=2 lifecycle (`persistentDrift` populated).
 *
 * Recovery Classification recognizes this error via instanceof and maps it to
 * failureKind "reconciliation-drift" with action "escalate".
 */
export class ReconciliationFailedError extends Error {
  readonly failures: ReadonlyArray<ReconciliationFailureDetail>;
  readonly detectionFailures: ReadonlyArray<ReconciliationDetectionFailureDetail>;
  readonly persistentDrift: ReadonlyArray<DriftRecord>;
  readonly pass?: number;

  constructor(opts: ReconciliationFailedErrorOptions) {
    super(formatMessage(opts));
    this.name = "ReconciliationFailedError";
    this.failures = opts.failures ?? [];
    this.detectionFailures = opts.detectionFailures ?? [];
    this.persistentDrift = opts.persistentDrift ?? [];
    this.pass = opts.pass;
  }
}

function formatMessage(opts: ReconciliationFailedErrorOptions): string {
  if (opts.detectionFailures && opts.detectionFailures.length > 0) {
    const kinds = opts.detectionFailures.map((f) => f.handlerKind).join(", ");
    const passSuffix = opts.pass !== undefined ? ` in pass ${opts.pass}` : "";
    return `Reconciliation detect failed${passSuffix} for handlers: ${kinds}`;
  }
  if (opts.failures && opts.failures.length > 0) {
    const kinds = opts.failures.map((f) => f.drift.kind).join(", ");
    const passSuffix = opts.pass !== undefined ? ` in pass ${opts.pass}` : "";
    return `Reconciliation repair failed${passSuffix} for drift kinds: ${kinds}`;
  }
  if (opts.persistentDrift && opts.persistentDrift.length > 0) {
    const kinds = opts.persistentDrift.map((d) => d.kind).join(", ");
    return `Reconciliation drift persisted after cap=2 passes: ${kinds}`;
  }
  return "Reconciliation failed";
}
