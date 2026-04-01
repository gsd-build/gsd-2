import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  markToolStart,
  markToolActivity,
  markToolEnd,
  getOldestInFlightToolAgeMs,
  getInFlightToolCount,
  clearInFlightTools,
} from "../resources/extensions/gsd/auto-tool-tracking.js";

describe("auto-tool-tracking", () => {
  beforeEach(() => {
    clearInFlightTools();
  });

  it("tracks tool start and end", () => {
    assert.equal(getInFlightToolCount(), 0);
    markToolStart("tool-1", true);
    assert.equal(getInFlightToolCount(), 1);
    markToolEnd("tool-1");
    assert.equal(getInFlightToolCount(), 0);
  });

  it("skips tracking when not active", () => {
    markToolStart("tool-1", false);
    assert.equal(getInFlightToolCount(), 0);
  });

  it("returns 0 age when no tools in flight", () => {
    assert.equal(getOldestInFlightToolAgeMs(), 0);
  });

  it("returns positive age for in-flight tools", () => {
    markToolStart("tool-1", true);
    // Age should be very small (< 100ms)
    assert.ok(getOldestInFlightToolAgeMs() < 100);
  });

  it("refreshes idle age on tool activity", async () => {
    markToolStart("tool-1", true);
    await new Promise(resolve => setTimeout(resolve, 15));
    const beforeRefresh = getOldestInFlightToolAgeMs();
    markToolActivity("tool-1");
    const afterRefresh = getOldestInFlightToolAgeMs();
    assert.ok(beforeRefresh >= 10, `expected age before refresh to grow, got ${beforeRefresh}`);
    assert.ok(afterRefresh < beforeRefresh, `expected activity refresh to reduce age (${afterRefresh} < ${beforeRefresh})`);
  });

  it("clears all in-flight tools", () => {
    markToolStart("tool-1", true);
    markToolStart("tool-2", true);
    assert.equal(getInFlightToolCount(), 2);
    clearInFlightTools();
    assert.equal(getInFlightToolCount(), 0);
  });
});
