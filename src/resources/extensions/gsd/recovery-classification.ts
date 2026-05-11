// Project/App: GSD-2
// File Purpose: ADR-015 Recovery Classification module for runtime failure taxonomy.

import { classifyError, isTransient, type ErrorClass } from "./error-classifier.js";
import { ReconciliationFailedError } from "./state-reconciliation.js";

export type RecoveryFailureKind =
  | "tool-schema"
  | "deterministic-policy"
  | "stale-worker"
  | "worktree-invalid"
  | "verification-drift"
  | "reconciliation-drift"
  | "provider"
  | "runtime-unknown";

export type RecoveryAction = "retry" | "escalate" | "stop";

export interface RecoveryClassificationInput {
  error: unknown;
  unitType?: string;
  unitId?: string;
  failureKind?: RecoveryFailureKind;
  retryAfterMs?: number;
}

export interface RecoveryClassification {
  failureKind: RecoveryFailureKind;
  action: RecoveryAction;
  reason: string;
  exitReason: string;
  remediation: string;
  providerClass?: ErrorClass["kind"];
}

export function classifyFailure(input: RecoveryClassificationInput): RecoveryClassification {
  const message = errorMessage(input.error);
  // ADR-017: ReconciliationFailedError is a typed throw from the State
  // Reconciliation Module. Recognize it by class regardless of caller-supplied
  // failureKind so the taxonomy stays consistent.
  const failureKind =
    input.error instanceof ReconciliationFailedError
      ? "reconciliation-drift"
      : input.failureKind ?? inferFailureKind(message);

  switch (failureKind) {
    case "tool-schema":
      return {
        failureKind,
        action: "stop",
        reason: `Tool schema failure${unitSuffix(input)}: ${message}`,
        exitReason: "tool-schema",
        remediation: "Fix the Unit Tool Contract or tool schema before retrying.",
      };
    case "deterministic-policy":
      return {
        failureKind,
        action: "stop",
        reason: `Deterministic policy failure${unitSuffix(input)}: ${message}`,
        exitReason: "deterministic-policy",
        remediation: "Resolve the policy blocker; retrying the same Unit will repeat the failure.",
      };
    case "stale-worker":
      return {
        failureKind,
        action: "stop",
        reason: `Stale worker failure${unitSuffix(input)}: ${message}`,
        exitReason: "stale-worker",
        remediation: "Clear or reconcile the stale worker before dispatching another Unit.",
      };
    case "worktree-invalid":
      return {
        failureKind,
        action: "stop",
        reason: `Worktree invalid${unitSuffix(input)}: ${message}`,
        exitReason: "worktree-invalid",
        remediation: "Repair or recreate the milestone worktree before launching source-writing Units.",
      };
    case "verification-drift":
      return {
        failureKind,
        action: "escalate",
        reason: `Verification drift${unitSuffix(input)}: ${message}`,
        exitReason: "verification-drift",
        remediation: "Inspect the verification artifact and reconcile the state snapshot before resuming.",
      };
    case "reconciliation-drift":
      return {
        failureKind,
        action: "escalate",
        reason: `Reconciliation drift${unitSuffix(input)}: ${message}`,
        exitReason: "reconciliation-drift",
        remediation:
          "Inspect the persistent or repair-failed drift kinds reported by the State Reconciliation Module before resuming.",
      };
    case "provider": {
      const providerClass = classifyError(message, input.retryAfterMs);
      return {
        failureKind,
        action: isTransient(providerClass) ? "retry" : "escalate",
        reason: message,
        exitReason: `provider-${providerClass.kind}`,
        remediation: isTransient(providerClass)
          ? "Retry after the provider/network condition clears."
          : "Inspect provider credentials, model entitlement, or request shape.",
        providerClass: providerClass.kind,
      };
    }
    case "runtime-unknown":
      return {
        failureKind,
        action: "escalate",
        reason: message,
        exitReason: "runtime-unknown",
        remediation: "Inspect the runtime error and add a dedicated classification if it is repeatable.",
      };
  }
}

function inferFailureKind(message: string): RecoveryFailureKind {
  if (/schema|invalid.*tool|tool.*invalid|enum/i.test(message)) return "tool-schema";
  if (/deterministic policy|policy rejection|write gate|blocked by policy/i.test(message)) return "deterministic-policy";
  if (/stale worker|stale lock|worker.*stale/i.test(message)) return "stale-worker";
  if (/worktree|\.git|unit root|git metadata/i.test(message)) return "worktree-invalid";
  if (/verification drift|assessment drift|state drift/i.test(message)) return "verification-drift";

  const providerClass = classifyError(message);
  return providerClass.kind === "unknown" ? "runtime-unknown" : "provider";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "unknown runtime failure");
}

function unitSuffix(input: RecoveryClassificationInput): string {
  if (!input.unitType && !input.unitId) return "";
  return ` for ${input.unitType ?? "unit"} ${input.unitId ?? ""}`.trimEnd();
}
