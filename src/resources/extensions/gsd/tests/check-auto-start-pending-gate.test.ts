// GSD-2 + Regression tests for checkAutoStartAfterDiscuss Gate 1a (R2)
//
// When a depth-verification gate is still pending (the LLM emitted the
// confirmation question via ask_user_questions or plain chat but the user has
// not answered), checkAutoStartAfterDiscuss must NOT advance — even if
// CONTEXT.md and STATE.md are present on disk. Otherwise the LLM can render
// the question and the "Milestone M001 ready" phrase in the same turn and
// race past the gate.

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
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
import {
  setPendingGate,
  clearPendingGate,
  clearDiscussionFlowState,
} from "../bootstrap/write-gate.ts";

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
  // realpathSync to normalize the macOS /var → /private/var symlink so the
  // basePath we pass to setPendingGate matches what the workspace's
  // realpath-normalized projectRoot will resolve to.
  const base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-gate1a-pending-")));
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  // CONTEXT.md (Gate 1) and STATE.md (Gate 2) both present so the only
  // possible blocker in these tests is the new Gate 1a.
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-CONTEXT.md"),
    "# M001: Pending Gate Test\n\nContext.\n",
  );
  writeFileSync(
    join(base, ".gsd", "STATE.md"),
    "# State\n\nactive: M001\n",
  );
  return base;
}

describe("checkAutoStartAfterDiscuss Gate 1a (pending depth-verification gate)", () => {
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
      try { clearDiscussionFlowState(base); } catch { /* */ }
      try { clearPendingGate(base); } catch { /* */ }
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("returns false while a depth_verification gate is pending for the same milestone", () => {
    base = mkBase();
    openDatabase(":memory:");
    // DB row present + active so Gate 1b is not the blocker
    insertMilestone({ id: "M001", title: "Pending Gate Test", status: "active" });

    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPi(cap),
    });

    // The depth-verification gate for THIS milestone is still pending.
    setPendingGate("depth_verification_M001_confirm", base);

    const result = checkAutoStartAfterDiscuss();
    assert.equal(result, false, "must not advance while the milestone gate is pending");
    // Must not have announced "ready" or kicked auto.
    const readyNotify = cap.notifies.find((n) => /ready\.?$/i.test(n.msg) && n.level === "success");
    assert.equal(readyNotify, undefined, "must not announce 'ready' while gate pending");
  });

  test("returns false while a depth_verification_project_confirm gate is pending (deep setup)", () => {
    base = mkBase();
    openDatabase(":memory:");
    insertMilestone({ id: "M001", title: "Pending Gate Test", status: "active" });

    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPi(cap),
    });

    // A project-level depth-verification gate (no milestone id encoded) is pending —
    // deep-setup interview has not been confirmed yet.
    setPendingGate("depth_verification_project_confirm", base);

    const result = checkAutoStartAfterDiscuss();
    assert.equal(result, false, "must not advance while a project-level gate is pending");
  });

  test("returns false while a depth_verification_requirements_confirm gate is pending", () => {
    base = mkBase();
    openDatabase(":memory:");
    insertMilestone({ id: "M001", title: "Pending Gate Test", status: "active" });

    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPi(cap),
    });

    setPendingGate("depth_verification_requirements_confirm", base);

    const result = checkAutoStartAfterDiscuss();
    assert.equal(result, false, "must not advance while the requirements gate is pending");
  });

  test("Gate 1a does NOT trip when the pending gate is for a DIFFERENT milestone", () => {
    base = mkBase();
    openDatabase(":memory:");
    // status: "queued" so that Gate 1b downstream of Gate 1a fires its
    // recovery notify ("context file exists but milestone is still queued") —
    // observing that notify proves we advanced past Gate 1a. If Gate 1a
    // wrongly tripped on the M999 gate it would `return false` immediately
    // and Gate 1b would never run, so the notify would be absent.
    insertMilestone({ id: "M001", title: "Pending Gate Test", status: "queued" });

    cap = mkCapture();
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: mkCtx(cap),
      pi: mkPi(cap),
    });

    setPendingGate("depth_verification_M999_confirm", base);

    const result = checkAutoStartAfterDiscuss();
    assert.equal(result, false, "Gate 1b returns false (expected) — but only if Gate 1a let us through");

    // Positive proof we passed Gate 1a: Gate 1b emitted its recovery notify
    // about M001 (not M999 — the pending-gate milestone is irrelevant here).
    const gate1bNotify = cap.notifies.find(n =>
      n.level === "warning" && /M001.*context file exists but milestone is still queued/i.test(n.msg)
    );
    assert.ok(
      gate1bNotify,
      `expected Gate 1b warning notify about M001; got: ${JSON.stringify(cap.notifies)}`,
    );

    // Negative proof: no Gate 1a notification path exists in source today, but
    // also assert no notify mentions M999 (the pending-gate milestone) — that
    // would suggest Gate 1a is leaking the wrong milestone into messaging.
    const m999Notify = cap.notifies.find(n => /M999/i.test(n.msg));
    assert.equal(m999Notify, undefined, "no notify should reference M999 (the pending-gate milestone)");
  });
});
