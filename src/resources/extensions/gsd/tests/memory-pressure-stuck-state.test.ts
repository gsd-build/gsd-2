/**
 * Regression tests for memory pressure monitoring (#3331) and
 * stuck detection persistence (#3704) in auto/loop.ts.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { decideMemoryPressure } from "../auto/workflow-kernel.ts";
import { measureMemoryPressure } from "../auto/workflow-memory-pressure.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loopSource = readFileSync(join(__dirname, "..", "auto", "loop.ts"), "utf-8");

describe("memory pressure monitoring (#3331)", () => {
  test("measureMemoryPressure reports pressure above threshold", () => {
    const snapshot = measureMemoryPressure({
      threshold: 0.5,
      deps: {
        memoryUsage: () => ({ heapUsed: 768 * 1024 * 1024 }),
        heapLimitBytes: () => 1024 * 1024 * 1024,
      },
    });

    assert.equal(snapshot.pressured, true);
    assert.equal(snapshot.heapMB, 768);
    assert.equal(snapshot.limitMB, 1024);
  });

  test("measureMemoryPressure defaults to a sub-100-percent threshold", () => {
    const snapshot = measureMemoryPressure({
      deps: {
        memoryUsage: () => ({ heapUsed: 3584 * 1024 * 1024 }),
        heapLimitBytes: () => 4096 * 1024 * 1024,
      },
    });

    assert.equal(snapshot.pressured, true);
  });

  test("memory check runs every MEMORY_CHECK_INTERVAL iterations", () => {
    assert.match(loopSource, /iteration\s*%\s*MEMORY_CHECK_INTERVAL\s*===\s*0/);
  });

  test("memory pressure triggers graceful stopAuto", () => {
    const decision = decideMemoryPressure({
      pressured: true,
      heapMB: 3900,
      limitMB: 4096,
      pct: 0.95,
      iteration: 10,
    });

    assert.equal(decision.action, "stop");
    assert.match(decision.stopMessage, /Stopping gracefully to prevent OOM/);
  });
});

describe("stuck detection persistence (#3704)", () => {
  test("loadStuckState function exists", () => {
    assert.match(loopSource, /function loadStuckState/);
  });

  test("saveStuckState function exists", () => {
    assert.match(loopSource, /function saveStuckState/);
  });

  // Phase C: API changed from (basePath) to (session) — recentUnits is
  // now reconstructed from unit_dispatches and stuckRecoveryAttempts
  // persists in runtime_kv (worker scope).
  test("loopState initialized from persisted state", () => {
    assert.match(loopSource, /loadStuckState\(s\)/);
  });

  test("stuck state saved after each iteration", () => {
    assert.match(loopSource, /saveStuckState\(s,\s*loopState\)/);
  });

  // Phase C: stuck-state.json file IO deleted; persistence moved to
  // unit_dispatches (recentUnits) + runtime_kv (stuckRecoveryAttempts).
  // The stuck-state-via-db.test.ts suite covers the round-trip.

  test("completeIteration centralizes stuck-state persistence for both loop paths (#4382)", () => {
    assert.match(loopSource, /const completeIteration = \(\): void =>/);
    assert.match(loopSource, /completeWorkflowIteration\(/);
    assert.match(loopSource, /saveStuckState:\s*\(\)\s*=>\s*saveStuckState\(s,\s*loopState\)/);
    assert.match(loopSource, /completeIteration,/);
    assert.match(loopSource, /completeIteration\(\);/);
  });
});
