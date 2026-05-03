/**
 * worktree-sync-tasks.test.ts
 *
 * DB-authoritative worktree contract: task and milestone markdown under a
 * worktree .gsd directory are legacy projections. syncWorktreeStateBack must
 * not copy them into the canonical project .gsd tree.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { syncWorktreeStateBack } from "../auto-worktree.ts";

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `gsd-sync-test-${prefix}-`));
}

function cleanup(...dirs: string[]): void {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeFile(dir: string, relativePath: string, content: string): void {
  const fullPath = join(dir, relativePath);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
}

test("syncWorktreeStateBack does not copy task markdown projections from worktree", () => {
  const mainBase = makeTempDir("main");
  const wtBase = makeTempDir("wt");

  try {
    writeFile(wtBase, ".gsd/milestones/M001/M001-ROADMAP.md", "# Roadmap\n");
    writeFile(wtBase, ".gsd/milestones/M001/slices/S01/S01-PLAN.md", "# Plan\n");
    writeFile(wtBase, ".gsd/milestones/M001/slices/S01/tasks/T01-SUMMARY.md", "# Task Summary\n");
    mkdirSync(join(mainBase, ".gsd"), { recursive: true });

    const result = syncWorktreeStateBack(mainBase, wtBase, "M000");

    assert.equal(result.synced.some((p) => p.includes("milestones/")), false);
    assert.equal(
      existsSync(join(mainBase, ".gsd/milestones/M001/M001-ROADMAP.md")),
      false,
      "milestone markdown projection must not be copied",
    );
    assert.equal(
      existsSync(join(mainBase, ".gsd/milestones/M001/slices/S01/tasks/T01-SUMMARY.md")),
      false,
      "task summary projection must not be copied",
    );
  } finally {
    cleanup(mainBase, wtBase);
  }
});

test("syncWorktreeStateBack still copies diagnostic root files", () => {
  const mainBase = makeTempDir("main");
  const wtBase = makeTempDir("wt");

  try {
    writeFile(wtBase, ".gsd/completed-units.json", JSON.stringify({ units: ["M001/S01/T01"] }));
    writeFile(wtBase, ".gsd/metrics.json", JSON.stringify({ version: 1, units: [] }));
    mkdirSync(join(mainBase, ".gsd"), { recursive: true });

    const result = syncWorktreeStateBack(mainBase, wtBase, "M001");

    assert.ok(result.synced.includes("completed-units.json"));
    assert.ok(result.synced.includes("metrics.json"));
    assert.ok(existsSync(join(mainBase, ".gsd/completed-units.json")));
    assert.ok(existsSync(join(mainBase, ".gsd/metrics.json")));
  } finally {
    cleanup(mainBase, wtBase);
  }
});
