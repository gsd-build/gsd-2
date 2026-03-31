import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  setPendingAutoStart,
  forcePendingAutoStart,
  getDiscussionMilestoneId,
  _clearPendingAutoStartForTest,
} from "../guided-flow.ts";

const stub = (milestoneId: string) => ({
  ctx: {} as any,
  pi: {} as any,
  basePath: "/tmp/test",
  milestoneId,
});

describe("pendingAutoStart", () => {
  beforeEach(() => {
    _clearPendingAutoStartForTest();
  });

  describe("setPendingAutoStart", () => {
    test("sets when null — getDiscussionMilestoneId returns milestoneId", () => {
      setPendingAutoStart(stub("M001"));
      assert.equal(getDiscussionMilestoneId(), "M001");
    });

    test("is a no-op when already set — milestoneId stays as first value", () => {
      setPendingAutoStart(stub("M001"));
      setPendingAutoStart(stub("M002"));
      assert.equal(getDiscussionMilestoneId(), "M001");
    });
  });

  describe("forcePendingAutoStart", () => {
    test("sets when null — getDiscussionMilestoneId returns milestoneId", () => {
      forcePendingAutoStart(stub("M003"));
      assert.equal(getDiscussionMilestoneId(), "M003");
    });

    test("replaces when already set — milestoneId changes to new value", () => {
      forcePendingAutoStart(stub("M003"));
      forcePendingAutoStart(stub("M004"));
      assert.equal(getDiscussionMilestoneId(), "M004");
    });
  });
});
