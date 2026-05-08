// Project/App: GSD-2
// File Purpose: Unit tests for auto-mode memory-pressure measurement adapter.

import assert from "node:assert/strict";
import test from "node:test";

import { measureMemoryPressure } from "../auto/workflow-memory-pressure.ts";

const mb = 1024 * 1024;

test("measureMemoryPressure reports heap usage against the injected heap limit", () => {
  const snapshot = measureMemoryPressure({
    threshold: 0.85,
    deps: {
      memoryUsage: () => ({ heapUsed: 512 * mb }),
      heapLimitBytes: () => 1024 * mb,
    },
  });

  assert.deepEqual(snapshot, {
    pressured: false,
    heapMB: 512,
    limitMB: 1024,
    pct: 0.5,
  });
});

test("measureMemoryPressure marks pressure only above the threshold", () => {
  const snapshot = measureMemoryPressure({
    threshold: 0.85,
    deps: {
      memoryUsage: () => ({ heapUsed: 900 * mb }),
      heapLimitBytes: () => 1000 * mb,
    },
  });

  assert.equal(snapshot.pressured, true);
  assert.equal(snapshot.pct, 0.9);
});

test("measureMemoryPressure treats exact threshold as not pressured", () => {
  const snapshot = measureMemoryPressure({
    threshold: 0.85,
    deps: {
      memoryUsage: () => ({ heapUsed: 850 * mb }),
      heapLimitBytes: () => 1000 * mb,
    },
  });

  assert.equal(snapshot.pressured, false);
  assert.equal(snapshot.pct, 0.85);
});

test("measureMemoryPressure falls back when heap limit cannot be read", () => {
  const snapshot = measureMemoryPressure({
    fallbackLimitMB: 4096,
    deps: {
      memoryUsage: () => ({ heapUsed: 1024 * mb }),
      heapLimitBytes: () => {
        throw new Error("v8 unavailable");
      },
    },
  });

  assert.deepEqual(snapshot, {
    pressured: false,
    heapMB: 1024,
    limitMB: 4096,
    pct: 0.25,
  });
});
