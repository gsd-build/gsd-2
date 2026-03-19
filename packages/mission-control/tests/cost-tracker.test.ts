/**
 * Tests for computeCostState pure function (TDD — RED first, then GREEN).
 * 7 test cases covering null budget, no-warning, warning (80%), and critical (95%+) levels.
 */
import { describe, test, expect } from "bun:test";
import { computeCostState } from "../src/hooks/useCostTracker";

describe("computeCostState", () => {
  test("zero cost, no budget ceiling → level none, budgetFraction null, formatted $0.00", () => {
    const result = computeCostState(0, null);
    expect(result).toEqual({
      totalCost: 0,
      budgetFraction: null,
      level: "none",
      formatted: "$0.00",
    });
  });

  test("non-zero cost, no budget ceiling → level none, budgetFraction null", () => {
    const result = computeCostState(0.05, null);
    expect(result).toEqual({
      totalCost: 0.05,
      budgetFraction: null,
      level: "none",
      formatted: "$0.05",
    });
  });

  test("cost at 80% of budget → level warning", () => {
    const result = computeCostState(0.08, 0.10);
    expect(result.level).toBe("warning");
    expect(result.budgetFraction).toBeCloseTo(0.8, 5);
    expect(result.totalCost).toBe(0.08);
    expect(result.formatted).toBe("$0.08");
  });

  test("cost at 95% of budget → level critical", () => {
    const result = computeCostState(0.095, 0.10);
    expect(result.level).toBe("critical");
    expect(result.budgetFraction).toBeCloseTo(0.95, 5);
    // 0.095.toFixed(2) = "0.10" in JavaScript due to floating point representation
    expect(result.formatted).toBe("$0.10");
  });

  test("cost at 100% of budget → level critical", () => {
    const result = computeCostState(0.10, 0.10);
    expect(result.level).toBe("critical");
    expect(result.budgetFraction).toBeCloseTo(1.0, 5);
    expect(result.formatted).toBe("$0.10");
  });

  test("cost at 40% of budget → level none", () => {
    const result = computeCostState(0.04, 0.10);
    expect(result.level).toBe("none");
    expect(result.budgetFraction).toBeCloseTo(0.4, 5);
    expect(result.formatted).toBe("$0.04");
  });

  test("formatted string always has 2 decimal places with $ prefix", () => {
    expect(computeCostState(1, null).formatted).toBe("$1.00");
    expect(computeCostState(0.1, null).formatted).toBe("$0.10");
    expect(computeCostState(0.123, null).formatted).toBe("$0.12");
    expect(computeCostState(10.5, null).formatted).toBe("$10.50");
  });
});
