import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import {
  ensureGitignoreEntry,
  createSessionWorktree,
  removeSessionWorktree,
  listWorktrees,
} from "../src/server/worktree-api";

/* ── helpers ─────────────────────────────────────────────────── */

/** Run a git command in a directory, return stdout */
function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let out = "";
    proc.stdout!.on("data", (c: Buffer) => (out += c.toString()));
    proc.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`git ${args[0]} failed`))
    );
    proc.on("error", reject);
  });
}

/* ── ensureGitignoreEntry ────────────────────────────────────── */

describe("ensureGitignoreEntry", () => {
  const TEST_DIR = join(tmpdir(), `gsd-gitignore-${Date.now()}`);

  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("creates .gitignore if it does not exist", async () => {
    const dir = join(TEST_DIR, "no-gitignore");
    await mkdir(dir, { recursive: true });
    await ensureGitignoreEntry(dir, ".worktrees/");
    const content = await readFile(join(dir, ".gitignore"), "utf-8");
    expect(content).toContain(".worktrees/");
  });

  it("appends entry to existing .gitignore", async () => {
    const dir = join(TEST_DIR, "existing-gitignore");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, ".gitignore"), "node_modules/\n");
    await ensureGitignoreEntry(dir, ".worktrees/");
    const content = await readFile(join(dir, ".gitignore"), "utf-8");
    expect(content).toContain("node_modules/");
    expect(content).toContain(".worktrees/");
  });

  it("is idempotent — does not duplicate entry", async () => {
    const dir = join(TEST_DIR, "idempotent");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, ".gitignore"), ".worktrees/\n");
    await ensureGitignoreEntry(dir, ".worktrees/");
    const content = await readFile(join(dir, ".gitignore"), "utf-8");
    const matches = content.split(".worktrees/").length - 1;
    expect(matches).toBe(1);
  });
});

/* ── worktree CRUD (requires real git) ───────────────────────── */

describe("worktree CRUD", () => {
  const REPO_DIR = join(tmpdir(), `gsd-worktree-${Date.now()}`);
  const SLUG = "test-session";

  beforeAll(async () => {
    await mkdir(REPO_DIR, { recursive: true });
    await git(REPO_DIR, ["init"]);
    await git(REPO_DIR, ["config", "user.email", "test@test.com"]);
    await git(REPO_DIR, ["config", "user.name", "Test"]);
    // Need at least one commit for worktrees to work
    await writeFile(join(REPO_DIR, "README.md"), "init");
    await git(REPO_DIR, ["add", "."]);
    await git(REPO_DIR, ["commit", "-m", "initial"]);
  });

  afterAll(async () => {
    await rm(REPO_DIR, { recursive: true, force: true });
  });

  it("createSessionWorktree creates worktree and returns paths", async () => {
    const result = await createSessionWorktree(REPO_DIR, SLUG);
    expect("worktreePath" in result).toBe(true);
    if ("worktreePath" in result) {
      expect(result.worktreePath).toContain(".worktrees");
      expect(result.worktreePath).toContain(SLUG);
      expect(result.branchName).toBe(`session/${SLUG}`);
      // Path uses forward slashes
      expect(result.worktreePath).not.toContain("\\");
    }
  });

  it("createSessionWorktree ensures .gitignore has .worktrees/", async () => {
    const content = await readFile(join(REPO_DIR, ".gitignore"), "utf-8");
    expect(content).toContain(".worktrees/");
  });

  it("listWorktrees includes the created worktree", async () => {
    const list = await listWorktrees(REPO_DIR);
    expect(Array.isArray(list)).toBe(true);
    // At least the main worktree + our session worktree
    expect(list.length).toBeGreaterThanOrEqual(2);
    const sessionWt = list.find((w) => w.branch.includes(SLUG));
    expect(sessionWt).toBeDefined();
    // Paths use forward slashes
    for (const wt of list) {
      expect(wt.path).not.toContain("\\");
    }
  });

  it("removeSessionWorktree removes the worktree", async () => {
    const worktreePath = join(REPO_DIR, ".worktrees", SLUG).replace(
      /\\/g,
      "/"
    );
    const result = await removeSessionWorktree(REPO_DIR, worktreePath, true);
    expect(result.ok).toBe(true);

    // Worktree should no longer be listed (only main remains)
    const list = await listWorktrees(REPO_DIR);
    const sessionWt = list.find((w) => w.branch.includes(SLUG));
    expect(sessionWt).toBeUndefined();
  });

  it("createSessionWorktree returns error on duplicate branch", async () => {
    // Create first
    await createSessionWorktree(REPO_DIR, "dup-test");
    // Try to create again — should error (branch already exists)
    const result = await createSessionWorktree(REPO_DIR, "dup-test");
    expect("error" in result).toBe(true);
    // Cleanup
    const wtPath = join(REPO_DIR, ".worktrees", "dup-test").replace(
      /\\/g,
      "/"
    );
    await removeSessionWorktree(REPO_DIR, wtPath, true);
  });
});
