/**
 * Intra-unit tool-call loop guard.
 * Detects when a model is stuck calling the same tool with the same arguments
 * repeatedly within a single unit execution.
 */

import { createHash } from "crypto";

const MAX_CONSECUTIVE_IDENTICAL_CALLS = 5;

let consecutiveCount = 0;
let lastSignature = "";
let unitActive = false;

/** Hash a tool call into a compact signature. */
function hashToolCall(toolName: string, args: Record<string, unknown>): string {
  const h = createHash("sha256");
  h.update(toolName);
  h.update(JSON.stringify(args));
  return h.digest("hex").slice(0, 16);
}

/** Call at the start of each unit dispatch to reset tracking. */
export function resetToolLoopGuard(): void {
  consecutiveCount = 0;
  lastSignature = "";
  unitActive = true;
}

/** Call when auto-mode stops or pauses. */
export function disableToolLoopGuard(): void {
  unitActive = false;
  consecutiveCount = 0;
  lastSignature = "";
}

/**
 * Record a tool call. Returns true if the call is allowed,
 * false if the loop threshold has been exceeded (caller should abort).
 */
export function recordToolCall(
  toolName: string,
  args: Record<string, unknown>,
): { allowed: boolean; count: number } {
  if (!unitActive) return { allowed: true, count: 0 };

  const sig = hashToolCall(toolName, args);

  if (sig === lastSignature) {
    consecutiveCount++;
  } else {
    consecutiveCount = 1;
    lastSignature = sig;
  }

  return {
    allowed: consecutiveCount < MAX_CONSECUTIVE_IDENTICAL_CALLS,
    count: consecutiveCount,
  };
}

/** Get current consecutive count (for diagnostics). */
export function getConsecutiveToolCallCount(): number {
  return consecutiveCount;
}
