/**
 * Regression test for #3624 — cap run-uat dispatch attempts.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DISPATCH_RULES, getUatCount, incrementUatCount } from "../auto-dispatch.ts";

function makeUatProject(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-uat-cap-"));
  const milestone = join(base, ".gsd", "milestones", "M001");
  mkdirSync(join(milestone, "slices", "S01"), { recursive: true });
  mkdirSync(join(milestone, "slices", "S02"), { recursive: true });
  writeFileSync(
    join(milestone, "M001-ROADMAP.md"),
    [
      "# M001: UAT Cap",
      "",
      "## Slices",
      "- [x] **S01: Completed slice** `risk:low`",
      "  Demo: done.",
      "- [ ] **S02: Remaining slice** `risk:low`",
      "  Demo: pending.",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(milestone, "slices", "S01", "S01-UAT.md"),
    "# UAT\n\nRun the checks. No verdict has been written yet.\n",
    "utf-8",
  );
  return base;
}

test("run-uat dispatch skips after three attempts without a verdict", async () => {
  const basePath = makeUatProject();
  const rule = DISPATCH_RULES.find((r) => r.name === "run-uat (post-completion)");
  assert.ok(rule, "run-uat dispatch rule is registered");

  const ctx = {
    state: { phase: "planning", activeSlice: null },
    mid: "M001",
    midTitle: "UAT Cap",
    basePath,
    prefs: { uat_dispatch: true },
  };

  try {
    for (let i = 1; i <= 3; i++) {
      const action = await rule.match(ctx as any);
      assert.equal(action?.action, "dispatch");
      assert.equal(action?.unitType, "run-uat");
      assert.equal(getUatCount(basePath, "M001", "S01"), i);
    }

    const capped = await rule.match(ctx as any);
    assert.equal(capped?.action, "skip");
    assert.equal(getUatCount(basePath, "M001", "S01"), 4);
  } finally {
    rmSync(basePath, { recursive: true, force: true });
  }
});

test("run-uat counter persists across recycled worktree base paths", () => {
  const projectRoot = makeUatProject();
  const worktreeA = join(projectRoot, ".gsd", "worktrees", "M001-a");
  const worktreeB = join(projectRoot, ".gsd", "worktrees", "M001-b");
  const canonicalCounter = join(projectRoot, ".gsd", "runtime", "uat-count-M001-S01.json");

  mkdirSync(worktreeA, { recursive: true });
  mkdirSync(worktreeB, { recursive: true });

  try {
    assert.equal(incrementUatCount(worktreeA, "M001", "S01"), 1);
    assert.equal(incrementUatCount(worktreeB, "M001", "S01"), 2);
    assert.equal(getUatCount(worktreeB, "M001", "S01"), 2);
    assert.ok(existsSync(canonicalCounter), "counter should be stored under project-root .gsd/runtime");
    assert.ok(
      !existsSync(join(worktreeA, ".gsd", "runtime", "uat-count-M001-S01.json")),
      "counter should not be stored under worktree-local .gsd/runtime",
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
