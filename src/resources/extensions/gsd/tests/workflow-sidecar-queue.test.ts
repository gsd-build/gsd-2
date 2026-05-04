// Project/App: GSD-2
// File Purpose: Unit tests for auto-mode sidecar queue scheduling and dequeue adapter.

import assert from "node:assert/strict";
import test from "node:test";

import type { SidecarItem } from "../auto/session.ts";
import {
  dequeueSidecarItem,
  type SidecarDequeuePayload,
} from "../auto/workflow-sidecar-queue.ts";

function makeSidecarItem(kind: SidecarItem["kind"], unitId: string): SidecarItem {
  return {
    kind,
    unitType: `sidecar/${kind}`,
    unitId,
    prompt: `Run ${unitId}`,
  };
}

test("dequeueSidecarItem returns undefined for an empty queue", async () => {
  const queue: SidecarItem[] = [];

  const item = await dequeueSidecarItem({
    queue,
    executionGraphEnabled: true,
    scheduleQueue: async () => assert.fail("scheduleQueue should not be called"),
    warnSchedulingFailure: () => assert.fail("warnSchedulingFailure should not be called"),
    logDequeue: () => assert.fail("logDequeue should not be called"),
    emitDequeue: () => assert.fail("emitDequeue should not be called"),
  });

  assert.equal(item, undefined);
  assert.deepEqual(queue, []);
});

test("dequeueSidecarItem schedules multi-item queues when execution graph is enabled", async () => {
  const first = makeSidecarItem("hook", "first");
  const second = makeSidecarItem("triage", "second");
  const queue = [first, second];
  const payloads: SidecarDequeuePayload[] = [];

  const item = await dequeueSidecarItem({
    queue,
    executionGraphEnabled: true,
    scheduleQueue: async scheduled => [scheduled[1]!, scheduled[0]!],
    warnSchedulingFailure: () => assert.fail("warnSchedulingFailure should not be called"),
    logDequeue: payload => payloads.push(payload),
    emitDequeue: payload => payloads.push(payload),
  });

  assert.equal(item, second);
  assert.deepEqual(queue, [first]);
  assert.deepEqual(payloads, [
    { kind: "triage", unitType: "sidecar/triage", unitId: "second" },
    { kind: "triage", unitType: "sidecar/triage", unitId: "second" },
  ]);
});

test("dequeueSidecarItem skips scheduling for single-item queues", async () => {
  const first = makeSidecarItem("quick-task", "only");
  const queue = [first];

  const item = await dequeueSidecarItem({
    queue,
    executionGraphEnabled: true,
    scheduleQueue: async () => assert.fail("scheduleQueue should not be called"),
    warnSchedulingFailure: () => assert.fail("warnSchedulingFailure should not be called"),
    logDequeue: () => {},
    emitDequeue: () => {},
  });

  assert.equal(item, first);
  assert.deepEqual(queue, []);
});

test("dequeueSidecarItem warns and preserves queue order when scheduling fails", async () => {
  const first = makeSidecarItem("hook", "first");
  const second = makeSidecarItem("triage", "second");
  const queue = [first, second];
  const warnings: string[] = [];

  const item = await dequeueSidecarItem({
    queue,
    executionGraphEnabled: true,
    scheduleQueue: async () => {
      throw new Error("scheduler unavailable");
    },
    warnSchedulingFailure: message => warnings.push(message),
    logDequeue: () => {},
    emitDequeue: () => {},
  });

  assert.equal(item, first);
  assert.deepEqual(queue, [second]);
  assert.deepEqual(warnings, ["scheduler unavailable"]);
});

test("dequeueSidecarItem skips scheduling when execution graph is disabled", async () => {
  const first = makeSidecarItem("hook", "first");
  const second = makeSidecarItem("triage", "second");
  const queue = [first, second];

  const item = await dequeueSidecarItem({
    queue,
    executionGraphEnabled: false,
    scheduleQueue: async () => assert.fail("scheduleQueue should not be called"),
    warnSchedulingFailure: () => assert.fail("warnSchedulingFailure should not be called"),
    logDequeue: () => {},
    emitDequeue: () => {},
  });

  assert.equal(item, first);
  assert.deepEqual(queue, [second]);
});
