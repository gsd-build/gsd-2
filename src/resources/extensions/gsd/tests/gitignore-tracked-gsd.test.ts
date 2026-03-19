/**
 * gitignore-tracked-gsd.test.ts — Regression tests for #1364.
 *
 * Verifies that ensureGitignore() does NOT add ".gsd" to .gitignore
 * when .gsd/ contains git-tracked files, and that migrateToExternalState()
 * aborts migration for tracked .gsd/ directories.
 *
 * Uses real temporary git repos — no mocks.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ensureGitignore, hasGitTrackedGsdFiles } from "../gitignore.ts";
import { migrateToExternalState } from "../migrate-external.ts";

// ─── Helpers ─────────────────────────────────────────────────────────

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, stdio: "pipe", encoding: "utf-8" }).trim();
}

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "gsd-gitignore-test-"));
  git(dir, "init");
  git(dir, "config", "user.email", "test@test.com");
  git(dir, "config", "user.name", "Test");
  writeFileSync(join(dir, "README.md"), "# init\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "init");
  git(dir, "branch", "-M", "main");
  return dir;
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ─── hasGitTrackedGsdFiles ───────────────────────────────────────────

test("hasGitTrackedGsdFiles returns false when .gsd/ does not exist", () => {
  const dir = makeTempRepo();
  try {
    assert.equal(hasGitTrackedGsdFiles(dir), false);
  } finally {
    cleanup(dir);
  }
});

test("hasGitTrackedGsdFiles returns true when .gsd/ has tracked files", () => {
  const dir = makeTempRepo();
  try {
    mkdirSync(join(dir, ".gsd", "milestones"), { recursive: true });
    writeFileSync(join(dir, ".gsd", "PROJECT.md"), "# Test Project\n");
    git(dir, "add", ".gsd/PROJECT.md");
    git(dir, "commit", "-m", "add gsd");
    assert.equal(hasGitTrackedGsdFiles(dir), true);
  } finally {
    cleanup(dir);
  }
});

test("hasGitTrackedGsdFiles returns false when .gsd/ exists but is untracked", () => {
  const dir = makeTempRepo();
  try {
    mkdirSync(join(dir, ".gsd"), { recursive: true });
    writeFileSync(join(dir, ".gsd", "STATE.md"), "state\n");
    // Not git-added — should return false
    assert.equal(hasGitTrackedGsdFiles(dir), false);
  } finally {
    cleanup(dir);
  }
});

// ─── ensureGitignore — tracked .gsd/ protection ─────────────────────

test("ensureGitignore does NOT add .gsd when .gsd/ has tracked files (#1364)", () => {
  const dir = makeTempRepo();
  try {
    // Set up .gsd/ with tracked files
    mkdirSync(join(dir, ".gsd", "milestones"), { recursive: true });
    writeFileSync(join(dir, ".gsd", "PROJECT.md"), "# Test Project\n");
    writeFileSync(join(dir, ".gsd", "DECISIONS.md"), "# Decisions\n");
    git(dir, "add", ".gsd/");
    git(dir, "commit", "-m", "track gsd state");

    // Run ensureGitignore
    ensureGitignore(dir);

    // Verify .gsd is NOT in .gitignore
    const gitignore = readFileSync(join(dir, ".gitignore"), "utf-8");
    const lines = gitignore.split("\n").map((l) => l.trim());
    assert.ok(
      !lines.includes(".gsd"),
      `Expected .gsd NOT to appear in .gitignore, but it does:\n${gitignore}`,
    );

    // Other baseline patterns should still be present
    assert.ok(lines.includes(".DS_Store"), "Expected .DS_Store in .gitignore");
    assert.ok(lines.includes("node_modules/"), "Expected node_modules/ in .gitignore");
  } finally {
    cleanup(dir);
  }
});

test("ensureGitignore adds .gsd when .gsd/ has NO tracked files", () => {
  const dir = makeTempRepo();
  try {
    // Run ensureGitignore (no .gsd/ at all)
    ensureGitignore(dir);

    // Verify .gsd IS in .gitignore
    const gitignore = readFileSync(join(dir, ".gitignore"), "utf-8");
    const lines = gitignore.split("\n").map((l) => l.trim());
    assert.ok(
      lines.includes(".gsd"),
      `Expected .gsd in .gitignore, but it's missing:\n${gitignore}`,
    );
  } finally {
    cleanup(dir);
  }
});

test("ensureGitignore respects manageGitignore: false", () => {
  const dir = makeTempRepo();
  try {
    const result = ensureGitignore(dir, { manageGitignore: false });
    assert.equal(result, false);
    assert.ok(!existsSync(join(dir, ".gitignore")), "Should not create .gitignore");
  } finally {
    cleanup(dir);
  }
});

// ─── ensureGitignore — verify no tracked files become invisible ─────

test("ensureGitignore with tracked .gsd/ does not cause git to see files as deleted", () => {
  const dir = makeTempRepo();
  try {
    // Create tracked .gsd/ files
    mkdirSync(join(dir, ".gsd", "milestones", "M001"), { recursive: true });
    writeFileSync(join(dir, ".gsd", "PROJECT.md"), "# Project\n");
    writeFileSync(
      join(dir, ".gsd", "milestones", "M001", "M001-CONTEXT.md"),
      "# M001\n",
    );
    git(dir, "add", ".gsd/");
    git(dir, "commit", "-m", "track gsd state");

    // Run ensureGitignore
    ensureGitignore(dir);

    // git status should show NO deleted files under .gsd/
    const status = git(dir, "status", "--porcelain", ".gsd/");

    // Filter for deletions (lines starting with " D" or "D ")
    const deletions = status
      .split("\n")
      .filter((l) => l.match(/^\s*D\s/) || l.match(/^D\s/));

    assert.equal(
      deletions.length,
      0,
      `Expected no deleted .gsd/ files, but found:\n${deletions.join("\n")}`,
    );
  } finally {
    cleanup(dir);
  }
});

// ─── migrateToExternalState — tracked .gsd/ protection ──────────────

test("migrateToExternalState aborts when .gsd/ has tracked files (#1364)", () => {
  const dir = makeTempRepo();
  try {
    // Create tracked .gsd/ files
    mkdirSync(join(dir, ".gsd", "milestones"), { recursive: true });
    writeFileSync(join(dir, ".gsd", "PROJECT.md"), "# Project\n");
    git(dir, "add", ".gsd/");
    git(dir, "commit", "-m", "track gsd state");

    // Attempt migration — should abort without moving anything
    const result = migrateToExternalState(dir);

    assert.equal(result.migrated, false, "Should NOT migrate tracked .gsd/");
    assert.equal(result.error, undefined, "Should not report an error — just skip");

    // .gsd/ should still be a real directory, not a symlink
    assert.ok(existsSync(join(dir, ".gsd", "PROJECT.md")), ".gsd/PROJECT.md should still exist");

    // No .gsd.migrating should exist
    assert.ok(
      !existsSync(join(dir, ".gsd.migrating")),
      ".gsd.migrating should not exist",
    );
  } finally {
    cleanup(dir);
  }
});
