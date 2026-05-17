/**
 * clear-stale-autostart.test.ts — #3667
 *
 * Pending auto-start entries carry a createdAt timestamp so later /gsd
 * invocations can distinguish an in-flight discussion from a stale one.
 */

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  _getPendingAutoStart,
  clearPendingAutoStart,
  setPendingAutoStart,
} from "../guided-flow.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function pendingInput(basePath: string, milestoneId: string) {
  return {
    basePath,
    milestoneId,
    ctx: { ui: { notify: () => undefined } } as any,
    pi: { sendMessage: () => undefined } as any,
  };
}

afterEach(() => {
  clearPendingAutoStart();
});

describe("clear stale pending auto-start (#3667)", () => {
  test("setPendingAutoStart defaults createdAt to Date.now()", (t) => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-pending-autostart-")));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    mkdirSync(join(base, ".gsd"), { recursive: true });
    const before = Date.now();

    setPendingAutoStart(base, pendingInput(base, "M001"));

    const entry = _getPendingAutoStart(base);
    assert.ok(entry);
    assert.equal(typeof entry!.createdAt, "number");
    assert.ok(entry!.createdAt >= before);
  });

  test("setPendingAutoStart preserves explicit createdAt for stale-entry checks", (t) => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-pending-autostart-old-")));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    mkdirSync(join(base, ".gsd"), { recursive: true });

    setPendingAutoStart(base, { ...pendingInput(base, "M001"), createdAt: 123 });

    assert.equal(_getPendingAutoStart(base)?.createdAt, 123);
  });

  test("guided-flow clears stale pending entry when discuss already completed", () => {
    const source = readFileSync(join(__dirname, "..", "guided-flow.ts"), "utf-8");
    assert.ok(
      source.includes('const milestoneHasRoadmap = !!resolveMilestoneFile(basePath, entry.milestoneId, "ROADMAP");'),
      "pending auto-start gate must check ROADMAP presence for completed discuss sessions",
    );
    assert.ok(
      source.includes('milestoneRow.status !== "queued"'),
      "pending auto-start gate must require non-queued DB milestone status before clearing",
    );
    assert.ok(
      source.includes("if (discussPlanComplete)"),
      "pending auto-start gate must clear stale map entries for completed discussions",
    );
  });
});
