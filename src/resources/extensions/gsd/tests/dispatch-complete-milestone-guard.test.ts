/**
 * dispatch-complete-milestone-guard.test.ts — #4324
 *
 * Verify that the completing-milestone dispatch rule has a defense-in-depth
 * DB status guard. When the DB marks a milestone as closed, the rule must
 * return skip instead of dispatching a redundant complete-milestone unit.
 * This prevents silent data loss when the legacy filesystem state-derivation
 * path produces a stale completing-milestone phase.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceFile = join(__dirname, "..", "auto-dispatch.ts");

describe("completing-milestone dispatch guard (#4324)", () => {
  const source = readFileSync(sourceFile, "utf-8");

  test("imports isClosedStatus from status-guards", () => {
    assert.match(source, /import\s*\{[^}]*isClosedStatus[^}]*\}\s*from\s*["']\.\/status-guards/);
  });

  test("checks DB milestone status before dispatching complete-milestone", () => {
    assert.match(source, /isClosedStatus\(milestone\.status\)/);
  });

  test("isClosedStatus guard appears in the completing-milestone rule", () => {
    // The completing-milestone phase check and the isClosedStatus guard
    // must both appear in the same rule, with the guard before dispatch.
    const phaseCheck = source.indexOf('phase !== "completing-milestone"');
    assert.ok(phaseCheck > -1, "completing-milestone phase check should exist");

    // Find the isClosedStatus guard after the phase check
    const guardIdx = source.indexOf("isClosedStatus(milestone.status)", phaseCheck);
    assert.ok(guardIdx > -1, "isClosedStatus guard should appear after the phase check");

    // Find the skip return after the guard
    const skipIdx = source.indexOf('action: "skip"', guardIdx);
    assert.ok(skipIdx > -1, "skip action should follow the isClosedStatus guard");

    // The skip should come before the dispatch in this rule
    const dispatchIdx = source.indexOf('unitType: "complete-milestone"', skipIdx);
    assert.ok(dispatchIdx > -1, "complete-milestone dispatch should exist after the skip guard");
  });

  test("does not reconcile DB from SUMMARY.md projection (#4658 superseded)", () => {
    const phaseCheck = source.indexOf('phase !== "completing-milestone"');
    assert.ok(phaseCheck > -1, "completing-milestone phase check should exist");
    const ruleTail = source.slice(phaseCheck, source.indexOf('name:', phaseCheck + 1));
    assert.doesNotMatch(ruleTail, /resolveMilestoneFile\(basePath,\s*mid,\s*"SUMMARY"\)/);
    assert.doesNotMatch(ruleTail, /classifyMilestoneSummaryContent/);
    assert.doesNotMatch(ruleTail, /updateMilestoneStatus\(mid,\s*"complete"/);
  });
});
