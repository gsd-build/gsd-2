import test from "node:test";
import assert from "node:assert/strict";
import { computePendingViewport } from "../queue-reorder-ui.ts";

test("queue reorder viewport keeps cursor visible in long lists (#4656)", () => {
  const top = computePendingViewport(0, 30, 12);
  assert.deepEqual(top, { start: 0, end: 12 });

  const middle = computePendingViewport(15, 30, 12);
  assert.equal(middle.start <= 15 && 15 < middle.end, true);
  assert.equal(middle.end - middle.start, 12);

  const bottom = computePendingViewport(29, 30, 12);
  assert.deepEqual(bottom, { start: 18, end: 30 });
});
