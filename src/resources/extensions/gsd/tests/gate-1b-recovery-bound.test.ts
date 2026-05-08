// GSD-2 + Gate 1b recovery counter bound — regression tests for H1 fix (#5012)
//
// Verifies that checkAutoStartAfterDiscuss stops emitting plan-blocked recovery
// hints (with triggerTurn:true) after MAX_PLAN_BLOCKED_RECOVERIES attempts and
// instead escalates to the user via ctx.ui.notify("error"), breaking the loop.

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  checkAutoStartAfterDiscuss,
  setPendingAutoStart,
  clearPendingAutoStart,
  _getPendingAutoStart,
} from "../guided-flow.ts";
import { drainLogs } from "../workflow-logger.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
} from "../gsd-db.ts";

// ─── Harness ───────────────────────────────────────────────────────────────

interface MockCapture {
  notifies: Array<{ msg: string; level: string }>;
  messages: Array<{ payload: any; options: any }>;
}

function mkCapture(): MockCapture {
  return { notifies: [], messages: [] };
}

function mkCtx(cap: MockCapture): any {
  return {
    ui: {
      notify: (msg: string, level: string) => {
        cap.notifies.push({ msg, level });
      },
    },
  };
}

function mkPi(cap: MockCapture): any {
  return {
    sendMessage: (payload: any, options: any) => {
      cap.messages.push({ payload, options });
    },
    setActiveTools: () => undefined,
    getActiveTools: () => [],
  };
}

function mkBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-gate1b-bound-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-CONTEXT.md"),
    "# M001: Bound Test\n\nContext written by discuss phase.\n",
  );
  return base;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Gate 1b recovery bound (H1)", () => {
  let base: string;
  let cap: MockCapture;

  beforeEach(() => {
    clearPendingAutoStart();
    drainLogs();
  });

  afterEach(() => {
    closeDatabase();
    clearPendingAutoStart();
    if (base) {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("first N-1 invocations increment counter and emit recovery with triggerTurn:true", () => {
    base = mkBase();
    openDatabase(":memory:");
    insertMilestone({ id: "M001", title: "Bound Test", status: "queued" });

    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPi(cap),
    });

    // MAX_PLAN_BLOCKED_RECOVERIES = 3; first two calls should emit recovery
    const resultOne = checkAutoStartAfterDiscuss();
    assert.equal(resultOne, false, "call 1: must return false");
    assert.equal(cap.messages.length, 1, "call 1: exactly one sendMessage");
    assert.equal(cap.messages[0].options.triggerTurn, true, "call 1: triggerTurn must be true");
    assert.equal(cap.messages[0].payload.customType, "gsd-plan-milestone-blocked-recovery");

    const entryAfterOne = _getPendingAutoStart(base);
    assert.ok(entryAfterOne, "entry must still exist after call 1");
    assert.equal(entryAfterOne.planBlockedRecoveryCount, 1, "counter must be 1 after call 1");

    const resultTwo = checkAutoStartAfterDiscuss();
    assert.equal(resultTwo, false, "call 2: must return false");
    assert.equal(cap.messages.length, 2, "call 2: second sendMessage emitted");
    assert.equal(cap.messages[1].options.triggerTurn, true, "call 2: triggerTurn must be true");

    const entryAfterTwo = _getPendingAutoStart(base);
    assert.ok(entryAfterTwo, "entry must still exist after call 2");
    assert.equal(entryAfterTwo.planBlockedRecoveryCount, 2, "counter must be 2 after call 2");
  });

  test("Nth invocation (at MAX_PLAN_BLOCKED_RECOVERIES) escalates via notify(error) without sendMessage(triggerTurn)", () => {
    base = mkBase();
    openDatabase(":memory:");
    insertMilestone({ id: "M001", title: "Bound Test", status: "queued" });

    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPi(cap),
    });

    // Exhaust the recovery budget (MAX = 3): call 3 times to reach the limit
    checkAutoStartAfterDiscuss(); // count → 1
    checkAutoStartAfterDiscuss(); // count → 2
    checkAutoStartAfterDiscuss(); // count → 3

    // At count = 3 the counter equals MAX so the next call must escalate
    cap.messages = [];
    cap.notifies = [];
    drainLogs();

    const resultAtLimit = checkAutoStartAfterDiscuss();
    assert.equal(resultAtLimit, false, "at-limit call: must return false");

    // Must NOT trigger a new LLM turn
    assert.equal(
      cap.messages.length,
      0,
      "at-limit call: sendMessage must NOT be called (loop must stop)",
    );
    const triggerMessages = cap.messages.filter((m) => m.options?.triggerTurn);
    assert.equal(triggerMessages.length, 0, "no triggerTurn message after limit");

    // Must escalate to user via notify("error")
    const errorNotify = cap.notifies.find((n) => n.level === "error");
    assert.ok(errorNotify, "at-limit call: ctx.ui.notify('error') must be called");
    assert.match(
      errorNotify.msg,
      /gsd-debug/i,
      "error notification must direct user to run /gsd-debug",
    );
    assert.match(
      errorNotify.msg,
      /M001/,
      "error notification must include the milestone ID",
    );

    // Confirm the log records the escalation
    const logs = drainLogs();
    const escalationLog = logs.find(
      (e) => e.component === "guided" && /Gate 1b/.test(e.message) && /escalat/.test(e.message),
    );
    assert.ok(escalationLog, "escalation must be logged via logWarning");
  });

  test("after clearPendingAutoStart + setPendingAutoStart the counter is reset to 0", () => {
    base = mkBase();
    openDatabase(":memory:");
    insertMilestone({ id: "M001", title: "Bound Test", status: "queued" });

    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPi(cap),
    });

    // Advance counter to 2
    checkAutoStartAfterDiscuss();
    checkAutoStartAfterDiscuss();

    const entryBefore = _getPendingAutoStart(base);
    assert.ok(entryBefore, "entry must exist");
    assert.equal(entryBefore.planBlockedRecoveryCount, 2, "counter must be 2 before reset");

    // Simulate user retry: clear then re-set
    clearPendingAutoStart(base);
    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPi(cap),
    });

    const entryAfter = _getPendingAutoStart(base);
    assert.ok(entryAfter, "entry must exist after re-set");
    assert.equal(entryAfter.planBlockedRecoveryCount, 0, "counter must be 0 after re-set (fresh entry)");

    // Verify first call after reset emits recovery, not escalation
    const result = checkAutoStartAfterDiscuss();
    assert.equal(result, false, "first call after reset must return false");
    assert.equal(cap.messages.length, 1, "recovery hint must be emitted after reset");
    assert.equal(cap.messages[0].options.triggerTurn, true, "triggerTurn must be true after reset");
  });
});
