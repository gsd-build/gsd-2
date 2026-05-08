/**
 * GSD-2 / guided-flow — regression tests for Gate 1b orphan discrimination
 *
 * Gate 1b in checkAutoStartAfterDiscuss discriminates between two "queued" states:
 *   (a) plan-blocked: discuss completed (CONTEXT.md on disk), but gsd_plan_milestone
 *       was hard-blocked by the depth-verification gate.  DB row stuck at "queued".
 *       → emit recovery hint directing the LLM to retry gsd_plan_milestone.
 *   (b) discuss-incomplete: discuss did not finish, no CONTEXT.md, DB row "queued".
 *       → silent block (no recovery hint).
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  checkAutoStartAfterDiscuss,
  setPendingAutoStart,
  clearPendingAutoStart,
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

/**
 * Create a minimal temp tree with a .gsd/milestones/M001 directory.
 */
function mkBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-gate1b-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  return base;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Gate 1b orphan discrimination in checkAutoStartAfterDiscuss", () => {
  let base: string;
  let cap: MockCapture;

  beforeEach(() => {
    clearPendingAutoStart();
    drainLogs(); // discard noise from prior tests
  });

  afterEach(() => {
    closeDatabase();
    clearPendingAutoStart();
    if (base) {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("plan-blocked: CONTEXT.md present + DB row queued → returns false + recovery hint emitted", () => {
    base = mkBase();
    openDatabase(":memory:");

    // DB row exists with status "queued" (plan_milestone was blocked)
    insertMilestone({ id: "M001", title: "Test Milestone", status: "queued" });

    // CONTEXT.md on disk (discuss phase completed)
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "M001-CONTEXT.md"),
      "# M001: Test Milestone\n\nContext written by discuss phase.\n",
    );

    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPi(cap),
    });

    const result = checkAutoStartAfterDiscuss();

    // Must return false — auto-start should not proceed
    assert.equal(result, false, "checkAutoStartAfterDiscuss must return false (plan still blocked)");

    // Recovery hint must be sent to the LLM
    assert.equal(
      cap.messages.length,
      1,
      "exactly one sendMessage call expected for the recovery hint",
    );
    assert.equal(
      cap.messages[0].payload.customType,
      "gsd-plan-milestone-blocked-recovery",
      "recovery message must have customType gsd-plan-milestone-blocked-recovery",
    );
    assert.equal(
      cap.messages[0].options.triggerTurn,
      true,
      "recovery message must set triggerTurn: true",
    );
    assert.match(
      cap.messages[0].payload.content,
      /gsd_plan_milestone/,
      "recovery message content must mention gsd_plan_milestone",
    );

    // User must be notified via ctx.ui.notify
    assert.ok(
      cap.notifies.some((n) => n.level === "warning" && /queued/.test(n.msg)),
      "user must be notified with a warning about the queued state",
    );

    // logWarning must have recorded the Gate 1b event
    const logs = drainLogs();
    const gate1bLog = logs.find(
      (e) => e.component === "guided" && /Gate 1b/.test(e.message),
    );
    assert.ok(gate1bLog, "Gate 1b warning must be logged via logWarning");
  });

  test("discuss-incomplete: no CONTEXT.md + DB row queued → returns false silently (no recovery hint)", () => {
    base = mkBase();
    openDatabase(":memory:");

    // DB row exists with status "queued", but NO CONTEXT.md on disk
    insertMilestone({ id: "M001", title: "Test Milestone", status: "queued" });

    // No CONTEXT.md written — discuss phase is incomplete
    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPi(cap),
    });

    drainLogs(); // clear any noise before the call

    const result = checkAutoStartAfterDiscuss();

    // Must return false — silent block
    assert.equal(result, false, "checkAutoStartAfterDiscuss must return false when discuss is incomplete");

    // No recovery hint — Gate 1 blocks before Gate 1b is reached
    assert.equal(
      cap.messages.length,
      0,
      "no sendMessage calls expected when CONTEXT.md is absent",
    );
    assert.equal(
      cap.notifies.length,
      0,
      "no user notifications expected for discuss-incomplete case",
    );

    // No Gate 1b log entry
    const logs = drainLogs();
    const gate1bLog = logs.find(
      (e) => e.component === "guided" && /Gate 1b/.test(e.message),
    );
    assert.equal(gate1bLog, undefined, "Gate 1b must not log when CONTEXT.md is absent");
  });
});
