import test from "node:test";
import assert from "node:assert/strict";
import {
  annotateBackgroundable,
  type AnnotatableDispatchAction,
} from "../delegation-policy.js";

function dispatchAction(unitType: string): AnnotatableDispatchAction {
  return {
    action: "dispatch",
    unitType,
    unitId: `M001/${unitType}`,
    prompt: "(test prompt)",
  };
}

test("annotateBackgroundable marks plan-slice as backgroundable", () => {
  const annotated = annotateBackgroundable(dispatchAction("plan-slice"));
  assert.equal(annotated.action, "dispatch");
  if (annotated.action !== "dispatch") return;
  assert.equal(annotated.backgroundable, true);
  assert.equal(annotated.unitType, "plan-slice");
});

test("annotateBackgroundable marks validate-milestone and reassess-roadmap as backgroundable", () => {
  for (const unitType of ["validate-milestone", "reassess-roadmap"]) {
    const annotated = annotateBackgroundable(dispatchAction(unitType));
    assert.equal(annotated.action, "dispatch");
    if (annotated.action !== "dispatch") continue;
    assert.equal(annotated.backgroundable, true, `${unitType} should be backgroundable`);
  }
});

test("annotateBackgroundable marks plan-milestone and replan-slice as NOT backgroundable", () => {
  for (const unitType of ["plan-milestone", "replan-slice"]) {
    const annotated = annotateBackgroundable(dispatchAction(unitType));
    assert.equal(annotated.action, "dispatch");
    if (annotated.action !== "dispatch") continue;
    assert.equal(annotated.backgroundable, false, `${unitType} should not be backgroundable`);
  }
});

test("annotateBackgroundable defaults unknown unit types to false (default-deny)", () => {
  const annotated = annotateBackgroundable(dispatchAction("execute-task"));
  assert.equal(annotated.action, "dispatch");
  if (annotated.action !== "dispatch") return;
  assert.equal(annotated.backgroundable, false);
});

test("annotateBackgroundable leaves stop and skip actions untouched", () => {
  const stop: AnnotatableDispatchAction = { action: "stop", reason: "test", level: "info" };
  const skip: AnnotatableDispatchAction = { action: "skip" };
  assert.deepEqual(annotateBackgroundable(stop), stop);
  assert.deepEqual(annotateBackgroundable(skip), skip);
});
