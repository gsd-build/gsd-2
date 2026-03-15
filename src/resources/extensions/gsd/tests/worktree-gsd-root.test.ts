/**
 * Test: gsdRoot resolves to the main worktree's .gsd/ when running inside a git worktree.
 *
 * Verifies that all worktrees share a single .gsd/ directory (the main repo's)
 * instead of each worktree getting its own isolated .gsd/.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { gsdRoot, resolveMainWorktreeRoot, clearPathCache } from "../paths.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

function run(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

// Create a temporary git repo (realpathSync to normalize macOS /var → /private/var)
const mainRepo = realpathSync(mkdtempSync(join(tmpdir(), "gsd-worktree-root-test-")));
run("git init -b main", mainRepo);
run('git config user.name "GSD Test"', mainRepo);
run('git config user.email "test@example.com"', mainRepo);
mkdirSync(join(mainRepo, ".gsd", "milestones"), { recursive: true });
writeFileSync(join(mainRepo, "README.md"), "test\n", "utf-8");
run("git add .", mainRepo);
run('git commit -m "init"', mainRepo);

// Create a worktree
const wtName = "test-wt";
const wtPath = join(mainRepo, ".gsd", "worktrees", wtName);
mkdirSync(join(mainRepo, ".gsd", "worktrees"), { recursive: true });
run(`git worktree add -b worktree/${wtName} "${wtPath}" main`, mainRepo);

async function main(): Promise<void> {
  // Clear cache to ensure fresh resolution
  clearPathCache();

  console.log("\n=== resolveMainWorktreeRoot from main repo ===");
  const mainRoot = resolveMainWorktreeRoot(mainRepo);
  assertEq(mainRoot, mainRepo, "main repo resolves to itself");

  console.log("\n=== resolveMainWorktreeRoot from worktree ===");
  clearPathCache();
  const wtRoot = resolveMainWorktreeRoot(wtPath);
  assertEq(wtRoot, mainRepo, "worktree resolves to main repo root");

  console.log("\n=== gsdRoot from main repo ===");
  clearPathCache();
  const mainGsd = gsdRoot(mainRepo);
  assertEq(mainGsd, join(mainRepo, ".gsd"), "main repo .gsd/ path is correct");

  console.log("\n=== gsdRoot from worktree ===");
  clearPathCache();
  const wtGsd = gsdRoot(wtPath);
  assertEq(wtGsd, join(mainRepo, ".gsd"), "worktree .gsd/ resolves to main repo's .gsd/");

  console.log("\n=== gsdRoot is same from both locations ===");
  clearPathCache();
  assertTrue(gsdRoot(mainRepo) === gsdRoot(wtPath), "gsdRoot identical from main and worktree");

  console.log("\n=== non-git directory falls back to basePath ===");
  clearPathCache();
  const nonGitDir = mkdtempSync(join(tmpdir(), "gsd-no-git-"));
  const nonGitRoot = resolveMainWorktreeRoot(nonGitDir);
  assertEq(nonGitRoot, nonGitDir, "non-git dir falls back to itself");
  rmSync(nonGitDir, { recursive: true, force: true });

  // Cleanup
  run(`git worktree remove --force "${wtPath}"`, mainRepo);
  rmSync(mainRepo, { recursive: true, force: true });

  report();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
