// gsd-2 + Phase C deletion regression: createAutoWorktree no longer copies .gsd/
//
// Verifies that createAutoWorktree on a project with a real (non-symlinked)
// .gsd/ does NOT populate .gsd/milestones/ inside the worktree. Pre-Phase-C,
// copyPlanningArtifacts would mirror the project-root .gsd/ into the
// worktree-local .gsd/. Phase C deleted that helper because writers in
// auto-mode now route through s.canonicalProjectRoot, so the worktree never
// needs a parallel .gsd/ projection.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { createAutoWorktree, teardownAutoWorktree } from "../auto-worktree.ts";

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

test("createAutoWorktree does NOT copy project-root .gsd/milestones into the worktree", (t) => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-no-copy-")));

  // Initialize a real git repo with a real .gsd/ directory containing some
  // planning artifacts that the deleted copyPlanningArtifacts would have
  // mirrored.
  git(["init", "-b", "main"], base);
  git(["config", "user.name", "Pi Test"], base);
  git(["config", "user.email", "pi@example.com"], base);
  writeFileSync(join(base, "README.md"), "# Test\n", "utf-8");
  git(["add", "README.md"], base);
  git(["commit", "-m", "chore: init"], base);

  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-CONTEXT.md"),
    "# M001 Context\n",
    "utf-8",
  );
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    "# M001 Roadmap\n",
    "utf-8",
  );

  const wtPath = createAutoWorktree(base, "M001");
  t.after(() => {
    try { teardownAutoWorktree(base, "M001"); } catch { /* noop */ }
    try { rmSync(base, { recursive: true, force: true }); } catch { /* noop */ }
  });

  // Phase C invariant: the worktree's .gsd/milestones/M001 must NOT exist
  // (no copyPlanningArtifacts), and the project-root version must still be
  // intact (it was the source, not destination).
  assert.equal(
    existsSync(join(wtPath, ".gsd", "milestones", "M001", "M001-CONTEXT.md")),
    false,
    "worktree should NOT have a copy of M001-CONTEXT.md (copyPlanningArtifacts deleted)",
  );
  assert.equal(
    existsSync(join(wtPath, ".gsd", "milestones", "M001", "M001-ROADMAP.md")),
    false,
    "worktree should NOT have a copy of M001-ROADMAP.md",
  );
  assert.equal(
    existsSync(join(base, ".gsd", "milestones", "M001", "M001-CONTEXT.md")),
    true,
    "project-root .gsd/ retains the canonical CONTEXT.md",
  );
});
