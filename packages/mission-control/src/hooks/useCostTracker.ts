import { useState, useCallback } from "react";

export type CostLevel = "none" | "warning" | "critical";

export interface CostState {
  totalCost: number;
  budgetFraction: number | null; // null if no budget ceiling set
  level: CostLevel;
  formatted: string; // e.g. "$0.18"
}

/**
 * Pure function: compute cost display state from accumulated cost and optional budget ceiling.
 * Testable without React rendering.
 */
export function computeCostState(
  totalCost: number,
  budgetCeiling: number | null,
): CostState {
  const formatted = `$${totalCost.toFixed(2)}`;
  if (budgetCeiling === null || budgetCeiling <= 0) {
    return { totalCost, budgetFraction: null, level: "none", formatted };
  }
  // Round to 10 decimal places to avoid floating-point precision issues (e.g. 0.08/0.10 = 0.7999...)
  const fraction = Math.round((totalCost / budgetCeiling) * 1e10) / 1e10;
  const level: CostLevel = fraction >= 0.95 ? "critical" : fraction >= 0.8 ? "warning" : "none";
  return { totalCost, budgetFraction: fraction, level, formatted };
}

/**
 * React hook: accumulates cost from Pi SDK cost_update events.
 * Call addCostEvent(costUsd) whenever a cost_update GSD2StreamEvent arrives.
 * budgetCeiling comes from preferences.md (passed as prop from settings).
 *
 * Note: Pi SDK sends running total (not delta), so we replace totalCost directly.
 */
export function useCostTracker(budgetCeiling: number | null = null) {
  const [totalCost, setTotalCost] = useState(0);

  const addCostEvent = useCallback((costUsd: number) => {
    setTotalCost(costUsd); // Pi SDK sends running total, not delta
  }, []);

  const reset = useCallback(() => setTotalCost(0), []);

  return {
    costState: computeCostState(totalCost, budgetCeiling),
    addCostEvent,
    reset,
  };
}
