/**
 * Shallow diff engine for PlanningState objects.
 * Compares each top-level key using JSON.stringify.
 * Returns null if no changes, or a StateDiff with only changed keys.
 */
import type { PlanningState, StateDiff } from "./types";

const TOP_LEVEL_KEYS: (keyof PlanningState)[] = [
  "roadmap",
  "state",
  "config",
  "phases",
  "requirements",
];

/**
 * Computes a shallow diff between two PlanningState objects.
 * Compares each top-level key via JSON.stringify.
 *
 * Returns null if states are identical.
 * Returns StateDiff with only changed keys in `changes`.
 * Caller is responsible for setting the sequence number.
 */
export function computeDiff(
  oldState: PlanningState,
  newState: PlanningState
): StateDiff | null {
  const changes: Partial<PlanningState> = {};
  let hasChanges = false;

  for (const key of TOP_LEVEL_KEYS) {
    if (JSON.stringify(oldState[key]) !== JSON.stringify(newState[key])) {
      // Cast needed because TypeScript can't narrow the union properly
      (changes as any)[key] = newState[key];
      hasChanges = true;
    }
  }

  if (!hasChanges) return null;

  return {
    type: "diff",
    changes,
    timestamp: Date.now(),
    sequence: 0, // Caller sets sequence
  };
}
