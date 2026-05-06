// GSD Extension — Verification Outcome Model
// Explicitly models pass/fail/no-commands so no-op verification is distinct.

/** Minimal shape required to compute outcome from executed checks. */
export interface VerificationCheckLike {
  exitCode: number;
}

export type VerificationOutcomeKind = "passed" | "failed" | "no-commands";

/** Explicit outcome for a verification gate run. */
export interface VerificationOutcome {
  kind: VerificationOutcomeKind;
  passed: boolean;
  totalChecks: number;
  failedChecks: number;
}

/**
 * Derive a verification outcome from command check results.
 * - No checks => `no-commands` and not passed
 * - Any failed check => `failed`
 * - Otherwise => `passed`
 */
export function deriveVerificationOutcome(
  checks: ReadonlyArray<VerificationCheckLike>,
): VerificationOutcome {
  if (checks.length === 0) {
    return {
      kind: "no-commands",
      passed: false,
      totalChecks: 0,
      failedChecks: 0,
    };
  }

  const failedChecks = checks.filter((check) => check.exitCode !== 0).length;
  if (failedChecks > 0) {
    return {
      kind: "failed",
      passed: false,
      totalChecks: checks.length,
      failedChecks,
    };
  }

  return {
    kind: "passed",
    passed: true,
    totalChecks: checks.length,
    failedChecks: 0,
  };
}
