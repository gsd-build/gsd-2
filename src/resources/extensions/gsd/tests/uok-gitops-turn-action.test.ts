import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { handleTurnGitActionError, runTurnGitAction } from "../git-service.ts";

function run(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, stdio: "pipe", encoding: "utf-8" }).trim();
}

function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "gsd-uok-gitops-"));
  return initRepo(repo);
}

function initRepo(repo: string): string {
  run("git init", repo);
  run('git config user.email "test@example.com"', repo);
  run('git config user.name "Test User"', repo);
  writeFileSync(join(repo, "README.md"), "# Test\n", "utf-8");
  run("git add README.md", repo);
  run('git commit -m "chore: init"', repo);
  return repo;
}

test("uok gitops turn action status-only reports working tree dirtiness", () => {
  const repo = makeRepo();
  try {
    const clean = runTurnGitAction({
      basePath: repo,
      action: "status-only",
      unitType: "execute-task",
      unitId: "M001/S01/T01",
    });
    assert.equal(clean.status, "ok");
    assert.equal(clean.dirty, false);
    assert.deepEqual(clean.dirtyRepositories, { project: false });

    writeFileSync(join(repo, "README.md"), "# Dirty\n", "utf-8");
    const dirty = runTurnGitAction({
      basePath: repo,
      action: "status-only",
      unitType: "execute-task",
      unitId: "M001/S01/T01",
    });
    assert.equal(dirty.status, "ok");
    assert.equal(dirty.dirty, true);
    assert.deepEqual(dirty.dirtyRepositories, { project: true });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("uok gitops turn action status-only reports per-repository dirtiness in parent mode", () => {
  const root = mkdtempSync(join(tmpdir(), "gsd-uok-gitops-parent-"));
  try {
    initRepo(root);
    mkdirSync(join(root, ".gsd"), { recursive: true });
    mkdirSync(join(root, "frontend"), { recursive: true });
    mkdirSync(join(root, "backend"), { recursive: true });
    initRepo(join(root, "frontend"));
    initRepo(join(root, "backend"));
    writeFileSync(join(root, ".gitignore"), "frontend/\nbackend/\n", "utf-8");
    run("git add .gitignore", root);
    run('git commit -m "chore: ignore nested repos"', root);
    writeFileSync(join(root, ".gsd", "PREFERENCES.md"), `---
version: 1
workspace:
  mode: parent
  repositories:
    frontend:
      path: frontend
    backend:
      path: backend
---
`, "utf-8");
    run("git add .gsd/PREFERENCES.md", root);
    run('git commit -m "chore: configure parent workspace repos"', root);

    writeFileSync(join(root, "frontend", "README.md"), "# Dirty frontend\n", "utf-8");

    const result = runTurnGitAction({
      basePath: root,
      action: "status-only",
      unitType: "execute-task",
      unitId: "M001/S01/T01",
    });

    assert.equal(result.status, "ok");
    assert.equal(result.dirty, true);
    assert.equal(result.dirtyRepositories?.project, false);
    assert.equal(result.dirtyRepositories?.frontend, true);
    assert.equal(result.dirtyRepositories?.backend, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uok gitops turn action snapshot writes snapshot refs", () => {
  const repo = makeRepo();
  try {
    const result = runTurnGitAction({
      basePath: repo,
      action: "snapshot",
      unitType: "execute-task",
      unitId: "M001/S01/T01",
    });
    assert.equal(result.status, "ok");
    assert.ok(result.snapshotLabel?.includes("execute-task/M001/S01/T01"));
    const refs = run("git for-each-ref refs/gsd/snapshots/ --format='%(refname)'", repo);
    assert.ok(refs.includes("refs/gsd/snapshots/execute-task/M001/S01/T01/"));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("uok gitops turn action commit creates commit with unit trailer", () => {
  const repo = makeRepo();
  try {
    writeFileSync(join(repo, "feature.ts"), "export const x = 1;\n", "utf-8");
    const result = runTurnGitAction({
      basePath: repo,
      action: "commit",
      unitType: "execute-task",
      unitId: "M001/S01/T02",
    });
    assert.equal(result.status, "ok");
    assert.ok(result.commitMessage?.includes("chore: auto-commit after execute-task"));
    const body = run("git log -1 --pretty=%B", repo);
    assert.ok(body.includes("GSD-Unit: M001/S01/T02"));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("uok gitops turn action commit honors per-repo commit_policy skip", () => {
  const root = mkdtempSync(join(tmpdir(), "gsd-uok-gitops-commit-policy-"));
  try {
    initRepo(root);
    mkdirSync(join(root, ".gsd"), { recursive: true });
    mkdirSync(join(root, "frontend"), { recursive: true });
    mkdirSync(join(root, "backend"), { recursive: true });
    initRepo(join(root, "frontend"));
    initRepo(join(root, "backend"));
    writeFileSync(join(root, ".gitignore"), "frontend/\nbackend/\n", "utf-8");
    run("git add .gitignore", root);
    run('git commit -m "chore: ignore nested repos"', root);
    writeFileSync(join(root, ".gsd", "PREFERENCES.md"), `---
version: 1
workspace:
  mode: parent
  repositories:
    frontend:
      path: frontend
      commit_policy: skip
    backend:
      path: backend
---
`, "utf-8");
    run("git add .gsd/PREFERENCES.md", root);
    run('git commit -m "chore: configure commit policies"', root);

    writeFileSync(join(root, "frontend", "README.md"), "# frontend dirty\n", "utf-8");
    writeFileSync(join(root, "backend", "README.md"), "# backend dirty\n", "utf-8");

    const result = runTurnGitAction({
      basePath: root,
      action: "commit",
      unitType: "execute-task",
      unitId: "M001/S01/T03",
      targetRepositories: ["frontend", "backend"],
    });

    assert.equal(result.status, "ok");
    assert.deepEqual(result.skippedRepositories, ["frontend"]);
    assert.equal(typeof result.commitMessages?.backend, "string");
    assert.equal(result.commitMessages?.frontend, undefined);
    assert.equal(run("git status --porcelain", join(root, "frontend")).length > 0, true);
    assert.equal(run("git status --porcelain", join(root, "backend")), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uok gitops turn action rethrows infrastructure failures", () => {
  const err = Object.assign(new Error("ENFILE: file table overflow"), { code: "ENFILE" });

  assert.throws(() => handleTurnGitActionError("commit", err), (thrown) => thrown === err);
});

test("uok gitops turn action keeps non-infrastructure git failures recoverable", () => {
  const result = handleTurnGitActionError("commit", new Error("nothing to commit"));

  assert.equal(result.action, "commit");
  assert.equal(result.status, "failed");
  assert.equal(result.error, "nothing to commit");
});

test("uok gitops turn action prefers stderr details for git failures", () => {
  const err = Object.assign(new Error("Command failed: git commit -F -"), {
    stderr: "fatal: unable to auto-detect email address",
  });

  const result = handleTurnGitActionError("commit", err);
  assert.equal(result.status, "failed");
  assert.equal(result.error, "fatal: unable to auto-detect email address");
});
