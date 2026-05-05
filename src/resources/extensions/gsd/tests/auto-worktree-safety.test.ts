import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { prepareUnitRoot } from "../auto/worktree-safety.js";

function createGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "auto-worktree-safety-"));
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync("git config user.email test@test.com", { cwd: dir, stdio: "ignore" });
  execSync("git config user.name Test", { cwd: dir, stdio: "ignore" });
  return dir;
}

test("prepareUnitRoot passes a valid git root for source-writing units", async () => {
  const dir = createGitRepo();
  try {
    writeFileSync(join(dir, "package.json"), '{"name":"test"}\n');
    const result = await prepareUnitRoot({
      basePath: dir,
      unitType: "execute-task",
      unitId: "M001/S001/T001",
      contract: {
        unitType: "execute-task",
        unitId: "M001/S001/T001",
        requiredWorkflowTools: ["gsd_task_complete"],
        toolsPolicy: { mode: "all" },
        sourceWrites: true,
        preconditions: [],
        warnings: [],
      },
    });

    assert.equal(result.allow, true);
    assert.deepEqual(result.warnings, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("prepareUnitRoot fails when .git is missing for source-writing units", async () => {
  const dir = mkdtempSync(join(tmpdir(), "auto-worktree-safety-nogit-"));
  try {
    const result = await prepareUnitRoot({
      basePath: dir,
      unitType: "execute-task",
      unitId: "M001/S001/T001",
      contract: {
        unitType: "execute-task",
        unitId: "M001/S001/T001",
        requiredWorkflowTools: ["gsd_task_complete"],
        toolsPolicy: { mode: "all" },
        sourceWrites: true,
        preconditions: [],
        warnings: [],
      },
    });

    assert.equal(result.allow, false);
    assert.match(result.reason ?? "", /has no \.git/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("prepareUnitRoot soft-allows greenfield repos with warning", async () => {
  const dir = createGitRepo();
  try {
    const result = await prepareUnitRoot({
      basePath: dir,
      unitType: "execute-task",
      unitId: "M001/S001/T001",
      contract: {
        unitType: "execute-task",
        unitId: "M001/S001/T001",
        requiredWorkflowTools: ["gsd_task_complete"],
        toolsPolicy: { mode: "all" },
        sourceWrites: true,
        preconditions: [],
        warnings: [],
      },
    });

    assert.equal(result.allow, true);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0] ?? "", /greenfield/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
