// GSD-2 + Gate 1b recovery bound corrections — regression tests for the two bugs
// found in peer review of the H1 fix (commit f0e1d42a2):
//   1. Escalation message must describe /gsd (counter reset) AND /gsd-debug (diagnose).
//   2. planBlockedRecoveryCount must NOT increment when pi.sendMessage throws.

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

/** Returns a pi stub whose sendMessage throws on the first call, succeeds after. */
function mkPiThrowOnce(cap: MockCapture): any {
  let callCount = 0;
  return {
    sendMessage: (payload: any, options: any) => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error("transient network error");
      }
      cap.messages.push({ payload, options });
    },
    setActiveTools: () => undefined,
    getActiveTools: () => [],
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
  const base = mkdtempSync(join(tmpdir(), "gsd-gate1b-corrections-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-CONTEXT.md"),
    "# M001: Corrections Test\n\nContext written by discuss phase.\n",
  );
  return base;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Gate 1b recovery bound corrections", () => {
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

  // ── Fix 1: escalation message ──────────────────────────────────────────

  test("escalation message describes /gsd for reset AND /gsd-debug for diagnosis", () => {
    base = mkBase();
    openDatabase(":memory:");
    insertMilestone({ id: "M001", title: "Corrections Test", status: "queued" });

    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPi(cap),
    });

    // Exhaust the recovery budget (MAX = 3)
    checkAutoStartAfterDiscuss(); // count → 1
    checkAutoStartAfterDiscuss(); // count → 2
    checkAutoStartAfterDiscuss(); // count → 3

    cap.notifies = [];
    drainLogs();

    // This call hits the cap and must escalate
    const result = checkAutoStartAfterDiscuss();
    assert.equal(result, false, "escalation call must return false");

    const errorNotify = cap.notifies.find((n) => n.level === "error");
    assert.ok(errorNotify, "escalation must emit a notify with level 'error'");

    // Must mention /gsd with reset semantics
    assert.match(
      errorNotify.msg,
      /\/gsd\b/,
      "escalation message must reference /gsd (the command that resets the counter)",
    );
    assert.match(
      errorNotify.msg,
      /reset/i,
      "escalation message must use the word 'reset' so users know /gsd resets the counter",
    );

    // Must also mention /gsd-debug
    assert.match(
      errorNotify.msg,
      /\/gsd-debug/i,
      "escalation message must also reference /gsd-debug for diagnosis",
    );

    // Must NOT suggest /gsd-debug alone as the sole remediation
    assert.doesNotMatch(
      errorNotify.msg,
      /^[^/]*\/gsd-debug[^/]*$/,
      "escalation message must not mention /gsd-debug as the only option",
    );
  });

  // ── Fix 2: counter ordering ────────────────────────────────────────────

  test("counter stays at 0 when sendMessage throws on the first call", () => {
    base = mkBase();
    openDatabase(":memory:");
    insertMilestone({ id: "M001", title: "Corrections Test", status: "queued" });

    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPiThrowOnce(cap),
    });

    // First call: sendMessage throws — counter must NOT increment
    const result = checkAutoStartAfterDiscuss();
    assert.equal(result, false, "must return false even when sendMessage throws");

    const entry = _getPendingAutoStart(base);
    assert.ok(entry, "entry must still exist after a failed sendMessage");
    assert.equal(
      entry.planBlockedRecoveryCount,
      0,
      "counter must remain 0 when sendMessage throws — no budget burned by transient failure",
    );
  });

  test("counter increments to 1 on the second call when first sendMessage threw", () => {
    base = mkBase();
    openDatabase(":memory:");
    insertMilestone({ id: "M001", title: "Corrections Test", status: "queued" });

    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPiThrowOnce(cap),
    });

    checkAutoStartAfterDiscuss(); // sendMessage throws → count stays 0

    const entryAfterThrow = _getPendingAutoStart(base);
    assert.equal(entryAfterThrow!.planBlockedRecoveryCount, 0, "count is 0 after throw");

    checkAutoStartAfterDiscuss(); // sendMessage succeeds → count becomes 1
    assert.equal(cap.messages.length, 1, "second call must produce one successful sendMessage");

    const entryAfterSuccess = _getPendingAutoStart(base);
    assert.equal(
      entryAfterSuccess!.planBlockedRecoveryCount,
      1,
      "counter must be 1 after first successful dispatch",
    );
  });

  test("3 successful sendMessage calls exhaust the budget; 4th emits escalation notify", () => {
    base = mkBase();
    openDatabase(":memory:");
    insertMilestone({ id: "M001", title: "Corrections Test", status: "queued" });

    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPi(cap),
    });

    // Three successful recoveries
    checkAutoStartAfterDiscuss(); // count → 1
    checkAutoStartAfterDiscuss(); // count → 2
    checkAutoStartAfterDiscuss(); // count → 3

    const entry = _getPendingAutoStart(base);
    assert.equal(entry!.planBlockedRecoveryCount, 3, "counter must be 3 after three successes");
    assert.equal(cap.messages.length, 3, "three sendMessage calls must have occurred");

    // Fourth call hits the cap
    cap.notifies = [];
    cap.messages = [];
    const resultAtCap = checkAutoStartAfterDiscuss();
    assert.equal(resultAtCap, false, "4th call must return false");
    assert.equal(cap.messages.length, 0, "4th call must NOT call sendMessage");
    const errorNotify = cap.notifies.find((n) => n.level === "error");
    assert.ok(errorNotify, "4th call must emit escalation notify with level 'error'");
  });
});
