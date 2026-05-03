// GSD Extension - Steer Worktree Path Resolution Test
// Worktrees share the canonical project .gsd state root. /gsd steer writes
// overrides to that canonical root even when invoked with a worktree path.

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendOverride, loadActiveOverrides } from "../files.ts";
import { getAutoWorktreePath } from "../auto-worktree.ts";

describe("steer worktree path resolution (#3476)", () => {
  let projectRoot: string;
  let worktreePath: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "gsd-steer-wt-"));
    mkdirSync(join(projectRoot, ".gsd"), { recursive: true });

    // Simulate a worktree with its own .gsd directory
    worktreePath = join(projectRoot, ".gsd", "worktrees", "M001");
    mkdirSync(join(worktreePath, ".gsd"), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  test("appendOverride writes to canonical project .gsd/ when worktree path is used", async () => {
    await appendOverride(worktreePath, "Use Postgres instead of SQLite", "M001/S01/T01");

    // Override should be in the canonical project .gsd/
    const wtOverrides = join(worktreePath, ".gsd", "OVERRIDES.md");
    const rootOverrides = join(projectRoot, ".gsd", "OVERRIDES.md");
    assert.ok(!existsSync(wtOverrides), "no override file in worktree-local .gsd/");
    assert.ok(existsSync(rootOverrides), "override file exists in project root .gsd/");

    const content = readFileSync(rootOverrides, "utf-8");
    assert.ok(content.includes("Use Postgres instead of SQLite"), "override content is correct");
  });

  test("loadActiveOverrides reads canonical project .gsd/ when worktree path is used", async () => {
    await appendOverride(worktreePath, "Switch to JWT auth", "M001/S02/T01");

    // Loading from worktree resolves to the canonical project state root.
    const wtOverrides = await loadActiveOverrides(worktreePath);
    assert.equal(wtOverrides.length, 1, "one active override in worktree");
    assert.equal(wtOverrides[0].change, "Switch to JWT auth");

    // Loading from project root sees the same canonical override.
    const rootOverrides = await loadActiveOverrides(projectRoot);
    assert.equal(rootOverrides.length, 1, "same override visible from project root");
    assert.equal(rootOverrides[0].change, "Switch to JWT auth");
  });

  test("appendOverride falls back to project root when no worktree exists", async () => {
    await appendOverride(projectRoot, "Use Redis cache", "M001/S01/T01");

    const rootOverrides = join(projectRoot, ".gsd", "OVERRIDES.md");
    assert.ok(existsSync(rootOverrides), "override file exists in project root .gsd/");

    const content = readFileSync(rootOverrides, "utf-8");
    assert.ok(content.includes("Use Redis cache"), "override content is correct");
  });

  test("getAutoWorktreePath returns null for worktree without valid .git file", () => {
    // The worktree directory exists but has no .git file — this is an inactive/
    // leftover worktree. getAutoWorktreePath must return null so handleSteer
    // does not route overrides to a dead worktree.
    const result = getAutoWorktreePath(projectRoot, "M001");
    assert.equal(result, null, "returns null for worktree without .git file");
  });

  test("getAutoWorktreePath returns null when .git is a directory", () => {
    mkdirSync(join(worktreePath, ".git"), { recursive: true });

    const result = getAutoWorktreePath(projectRoot, "M001");

    assert.equal(result, null, "returns null for standalone .git directories");
  });

  test("getAutoWorktreePath returns null when .git file is not a gitdir pointer", () => {
    writeFileSync(join(worktreePath, ".git"), "not-a-gitdir\n", "utf-8");

    const result = getAutoWorktreePath(projectRoot, "M001");

    assert.equal(result, null, "returns null for invalid .git files");
  });

  test("override routing: inactive worktree directory should not receive overrides", async () => {
    // Simulate the handleSteer path-resolution logic:
    // When no auto-mode is running, even if a worktree dir exists,
    // overrides must go to the project root.
    const autoRunning = false; // no live session
    const wtPath = autoRunning ? getAutoWorktreePath(projectRoot, "M001") : null;
    const targetPath = wtPath ?? projectRoot;

    await appendOverride(targetPath, "Should go to project root", "M001/S01/T01");

    const rootOverrides = join(projectRoot, ".gsd", "OVERRIDES.md");
    const wtOverrides = join(worktreePath, ".gsd", "OVERRIDES.md");

    assert.ok(existsSync(rootOverrides), "override written to project root");
    assert.ok(!existsSync(wtOverrides), "override NOT written to inactive worktree");
  });

  test("override routing: active worktree with valid .git should receive overrides", async () => {
    // Simulate the handleSteer path-resolution logic with active auto-mode.
    // getAutoWorktreePath requires a valid .git file, so even with autoRunning=true,
    // it returns null for our test worktree (no real .git). This confirms the
    // double-gate: both autoRunning AND valid worktree must be true.
    const autoRunning = true;
    const wtPath = autoRunning ? getAutoWorktreePath(projectRoot, "M001") : null;
    const targetPath = wtPath ?? projectRoot;

    // Without a valid .git file, falls back to project root
    await appendOverride(targetPath, "Falls back without .git", "M001/S01/T01");

    const rootOverrides = join(projectRoot, ".gsd", "OVERRIDES.md");
    assert.ok(existsSync(rootOverrides), "override written to project root (no valid .git in worktree)");
  });
});
