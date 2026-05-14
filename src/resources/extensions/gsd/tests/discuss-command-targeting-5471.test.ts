import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { _parseDiscussArgsForTest, handleWorkflowCommand } from "../commands/handlers/workflow.ts";
import { _setAutoActiveForTest } from "../auto.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("discuss command targeting (#5471)", () => {
  test("parses positional milestone and slice targets", () => {
    assert.deepEqual(_parseDiscussArgsForTest("M014"), { target: "M014", error: null });
    assert.deepEqual(_parseDiscussArgsForTest("M014/S03"), { target: "M014/S03", error: null });
  });

  test("parses --milestone and --slice flags", () => {
    assert.deepEqual(_parseDiscussArgsForTest("--milestone M014"), { target: "M014", error: null });
    assert.deepEqual(_parseDiscussArgsForTest("--slice M014/S03"), { target: "M014/S03", error: null });
  });

  test("returns errors for invalid argument shapes", () => {
    const cases = [
      "--milestone",
      "--slice",
      "--unknown M014",
      "--milestone M014/S03",
      "--slice M014",
      "--milestone M014 --slice M014/S03",
    ];
    for (const input of cases) {
      const parsed = _parseDiscussArgsForTest(input);
      assert.equal(parsed.target, null, `expected null target for: ${input}`);
      assert.ok(parsed.error, `expected error for: ${input}`);
    }
  });

  test("handles whitespace and preserves positional parsing behavior", () => {
    assert.deepEqual(_parseDiscussArgsForTest("   M014   "), { target: "M014", error: null });
    assert.deepEqual(_parseDiscussArgsForTest(""), { target: null, error: null });
    assert.deepEqual(_parseDiscussArgsForTest("m014"), { target: "m014", error: null });
    assert.deepEqual(_parseDiscussArgsForTest("M014/S03/extra"), { target: "M014/S03/extra", error: null });
  });
});

describe("discuss dispatch via handleWorkflowCommand (#5471)", () => {
  function makeCtx() {
    const notifications: Array<{ message: string; level?: string }> = [];
    return {
      notifications,
      ui: {
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
      },
    };
  }

  afterEach(() => {
    _setAutoActiveForTest(false);
  });

  test("discuss --milestone with no value warns and returns handled", async () => {
    const ctx = makeCtx();
    const handled = await handleWorkflowCommand("discuss --milestone", ctx as any, {} as any);

    assert.equal(handled, true);
    const warning = ctx.notifications.find((n) => n.level === "warning");
    assert.ok(warning, "expected warning notification");
    assert.match(warning!.message, /--milestone/i);
  });

  test("discuss with unknown flag warns and returns handled", async () => {
    const ctx = makeCtx();
    const handled = await handleWorkflowCommand("discuss --unknown foo", ctx as any, {} as any);

    assert.equal(handled, true);
    const warning = ctx.notifications.find((n) => n.level === "warning");
    assert.ok(warning, "expected warning notification");
  });

  test("discuss target is blocked in auto-mode", async () => {
    _setAutoActiveForTest(true);
    const ctx = makeCtx();
    const handled = await handleWorkflowCommand("discuss M014", ctx as any, {} as any);

    assert.equal(handled, true);
    assert.deepEqual(ctx.notifications, [{
      message: "/gsd discuss cannot run while auto-mode is active.\nStop auto-mode first with /gsd stop, then run /gsd discuss.",
      level: "error",
    }]);
  });

  test("valid discuss target does not emit parse warning", async () => {
    const ctx = makeCtx();
    try {
      await handleWorkflowCommand("discuss M014", ctx as any, {} as any);
    } catch {
      // showDiscuss can throw in tests without a full project context.
    }
    const parseWarning = ctx.notifications.find(
      (n) => n.level === "warning" && /--milestone|--slice|unknown discuss arguments/i.test(n.message),
    );
    assert.equal(parseWarning, undefined);
  });
});

describe("discuss picker future-milestone contract (#5471)", () => {
  test("guided flow source filters out active, complete, and parked milestones", () => {
    const src = readFileSync(join(__dirname, "..", "guided-flow.ts"), "utf-8");
    assert.match(src, /discussableFutureMilestones/);
    assert.match(src, /m\.id\s*!==\s*state\.activeMilestone\?\.id/);
    assert.match(src, /m\.status\s*!==\s*"complete"/);
    assert.match(src, /m\.status\s*!==\s*"parked"/);
  });
});
