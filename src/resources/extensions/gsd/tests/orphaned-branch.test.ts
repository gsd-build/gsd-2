/**
 * Tests for orphaned completed slice branch detection.
 *
 * Verifies the git operations and detection logic that mergeOrphanedSliceBranches
 * in auto.ts relies on — without importing auto.ts (which requires @gsd/pi-coding-agent).
 * Uses execSync directly and roadmap-slices.ts (no pi-coding-agent dep) to replicate
 * the detection logic.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { execSync, execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { relMilestoneFile } from "../paths.ts";
import { parseRoadmapSlices } from "../roadmap-slices.ts";

// Inline SLICE_BRANCH_RE and parseSliceBranch to avoid importing worktree.ts,
// which transitively imports preferences.ts → @gsd/pi-coding-agent (not available in tests).
const SLICE_BRANCH_RE = /^gsd\/(?:([a-zA-Z0-9_-]+)\/)?(M\d+)\/(S\d+)$/;

function parseSliceBranch(
  branchName: string,
): { worktreeName: string | null; milestoneId: string; sliceId: string } | null {
  const match = branchName.match(SLICE_BRANCH_RE);
  if (!match) return null;
  return { worktreeName: match[1] ?? null, milestoneId: match[2]!, sliceId: match[3]! };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function run(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

function git(base: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: base,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Replicate the core orphan-detection logic from mergeOrphanedSliceBranches
 * in auto.ts — using only paths.ts + roadmap-slices.ts + execSync (no pi-coding-agent deps).
 * Returns a list of orphaned branch descriptors.
 */
function detectOrphanedSliceBranches(base: string): Array<{
  branch: string;
  milestoneId: string;
  sliceId: string;
  sliceTitle: string;
}> {
  const orphans: Array<{
    branch: string;
    milestoneId: string;
    sliceId: string;
    sliceTitle: string;
  }> = [];

  const branchListRaw = git(base, ["branch", "--list", "gsd/*/*", "--format=%(refname:short)"]);
  if (!branchListRaw) return orphans;

  const branches = branchListRaw.split("\n").map(b => b.trim()).filter(Boolean);
  for (const branch of branches) {
    const parsed = parseSliceBranch(branch);
    // Skip worktree-namespaced branches
    if (!parsed || parsed.worktreeName) continue;

    const { milestoneId, sliceId } = parsed;

    // Skip if already merged (no commits ahead of main)
    const aheadCount = git(base, ["rev-list", "--count", `main..${branch}`]);
    if (!aheadCount || aheadCount === "0") continue;

    // Read roadmap from the slice branch
    const roadmapRelPath = relMilestoneFile(base, milestoneId, "ROADMAP");
    const roadmapContent = git(base, ["show", `${branch}:${roadmapRelPath}`]);
    if (!roadmapContent) continue;

    const slices = parseRoadmapSlices(roadmapContent);
    const sliceEntry = slices.find(s => s.id === sliceId);
    if (!sliceEntry?.done) continue;

    orphans.push({
      branch,
      milestoneId,
      sliceId,
      sliceTitle: sliceEntry.title || sliceId,
    });
  }

  return orphans;
}

// ─── Setup helpers ─────────────────────────────────────────────────────────

function initRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "gsd-orphan-test-"));
  run("git init -b main", repo);
  run("git config user.email test@example.com", repo);
  run("git config user.name Test", repo);
  return repo;
}

function writeBaseArtifacts(repo: string): void {
  mkdirSync(join(repo, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), {
    recursive: true,
  });

  writeFileSync(
    join(repo, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    [
      "# M001: Demo",
      "",
      "## Slices",
      "- [ ] **S01: First Slice** `risk:low` `depends:[]`",
      "  > After this: feature works",
      "",
    ].join("\n"),
  );

  writeFileSync(
    join(repo, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md"),
    "# S01: First Slice\n\n**Goal:** Demo\n**Demo:** Demo\n\n## Must-Haves\n- done\n\n## Tasks\n- [x] **T01: Task** `est:5m`\n  do it\n",
  );
  run("git add .", repo);
  run('git commit -m "chore: milestone base"', repo);
}

function writeCompletedArtifactsOnBranch(repo: string): void {
  writeFileSync(
    join(repo, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    [
      "# M001: Demo",
      "",
      "## Slices",
      "- [x] **S01: First Slice** `risk:low` `depends:[]`",
      "  > After this: feature works",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(repo, ".gsd", "milestones", "M001", "slices", "S01", "S01-SUMMARY.md"),
    "# S01: First Slice\n\nDone.\n",
  );
  writeFileSync(
    join(repo, ".gsd", "milestones", "M001", "slices", "S01", "S01-UAT.md"),
    "# UAT\n\nPassed.\n",
  );
  run("git add .", repo);
  run('git commit -m "feat(M001/S01): complete-slice"', repo);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log("\n=== parseSliceBranch: plain branch ===");
{
  const parsed = parseSliceBranch("gsd/M001/S01");
  assert(parsed !== null, "plain branch parsed");
  assertEq(parsed?.milestoneId, "M001", "milestone ID extracted");
  assertEq(parsed?.sliceId, "S01", "slice ID extracted");
  assertEq(parsed?.worktreeName, null, "no worktree name for plain branch");
}

console.log("\n=== parseSliceBranch: worktree-namespaced branch ===");
{
  const parsed = parseSliceBranch("gsd/wt1/M001/S01");
  assert(parsed !== null, "worktree branch parsed");
  assertEq(parsed?.milestoneId, "M001", "milestone ID extracted from worktree branch");
  assertEq(parsed?.sliceId, "S01", "slice ID extracted from worktree branch");
  assertEq(parsed?.worktreeName, "wt1", "worktree name extracted");
}

console.log("\n=== parseSliceBranch: non-slice branch not matched ===");
{
  assert(parseSliceBranch("main") === null, "main branch not matched");
  assert(parseSliceBranch("gsd/M001") === null, "bare milestone branch not matched");
  assert(!SLICE_BRANCH_RE.test("gsd/M001"), "bare milestone branch not matched by regex");
  assert(SLICE_BRANCH_RE.test("gsd/M001/S01"), "standard slice branch matched by regex");
}

console.log("\n=== orphan detection: no slice branches ===");
{
  const repo = initRepo();
  writeBaseArtifacts(repo);

  const orphans = detectOrphanedSliceBranches(repo);
  assertEq(orphans.length, 0, "no orphans when no slice branches exist");

  rmSync(repo, { recursive: true, force: true });
}

console.log("\n=== orphan detection: slice branch not done ===");
{
  const repo = initRepo();
  writeBaseArtifacts(repo);

  run("git checkout -b gsd/M001/S01", repo);
  writeFileSync(
    join(repo, ".gsd", "milestones", "M001", "slices", "S01", "S01-RESEARCH.md"),
    "# Research\n",
  );
  run("git add .", repo);
  run('git commit -m "feat: research"', repo);
  run("git checkout main", repo);

  const orphans = detectOrphanedSliceBranches(repo);
  assertEq(orphans.length, 0, "incomplete slice branch is not reported as orphan");

  rmSync(repo, { recursive: true, force: true });
}

console.log("\n=== orphan detection: completed slice branch (orphaned) ===");
{
  const repo = initRepo();
  writeBaseArtifacts(repo);

  run("git checkout -b gsd/M001/S01", repo);
  writeCompletedArtifactsOnBranch(repo);
  // Return to main without merging — this is the orphaned branch scenario
  run("git checkout main", repo);

  const orphans = detectOrphanedSliceBranches(repo);
  assertEq(orphans.length, 1, "completed but unmerged branch detected as orphan");
  assertEq(orphans[0]?.branch, "gsd/M001/S01", "correct branch name reported");
  assertEq(orphans[0]?.milestoneId, "M001", "correct milestone ID");
  assertEq(orphans[0]?.sliceId, "S01", "correct slice ID");
  assertEq(orphans[0]?.sliceTitle, "First Slice", "correct slice title");

  rmSync(repo, { recursive: true, force: true });
}

console.log("\n=== orphan detection: already merged branch is not orphan ===");
{
  const repo = initRepo();
  writeBaseArtifacts(repo);

  run("git checkout -b gsd/M001/S01", repo);
  writeCompletedArtifactsOnBranch(repo);
  run("git checkout main", repo);
  run("git merge --squash gsd/M001/S01", repo);
  run('git commit -m "feat(M001/S01): merge"', repo);
  run("git branch -D gsd/M001/S01", repo);

  const orphans = detectOrphanedSliceBranches(repo);
  assertEq(orphans.length, 0, "already-merged branch is not detected as orphan");

  rmSync(repo, { recursive: true, force: true });
}

console.log("\n=== orphan detection: worktree-namespaced branch is skipped ===");
{
  const repo = initRepo();
  writeBaseArtifacts(repo);

  // gsd/wt1/M001/S01 — worktree-namespaced branches are managed by the worktree
  // manager and must not be merged by the main-tree orphan check.
  run("git checkout -b gsd/wt1/M001/S01", repo);
  writeCompletedArtifactsOnBranch(repo);
  run("git checkout main", repo);

  const orphans = detectOrphanedSliceBranches(repo);
  assertEq(orphans.length, 0, "worktree-namespaced branch not detected by main-tree orphan check");

  rmSync(repo, { recursive: true, force: true });
}

console.log("\n=== orphan detection: relMilestoneFile resolves roadmap path for git show ===");
{
  const repo = initRepo();
  writeBaseArtifacts(repo);

  run("git checkout -b gsd/M001/S01", repo);
  writeCompletedArtifactsOnBranch(repo);
  run("git checkout main", repo);

  // Simulate what mergeOrphanedSliceBranches does: read roadmap from branch
  const roadmapRelPath = relMilestoneFile(repo, "M001", "ROADMAP");
  const roadmapOnBranch = git(repo, ["show", `gsd/M001/S01:${roadmapRelPath}`]);
  assert(roadmapOnBranch.length > 0, "roadmap readable from orphaned branch via git show");

  const slices = parseRoadmapSlices(roadmapOnBranch);
  const s01 = slices.find(s => s.id === "S01");
  assert(s01?.done === true, "slice marked done on orphaned branch");

  rmSync(repo, { recursive: true, force: true });
}

console.log("\n=== orphan merge: squash-merge resolves orphan, artifacts appear on main ===");
{
  const repo = initRepo();
  writeBaseArtifacts(repo);

  run("git checkout -b gsd/M001/S01", repo);
  writeCompletedArtifactsOnBranch(repo);
  run("git checkout main", repo);

  const orphansBefore = detectOrphanedSliceBranches(repo);
  assertEq(orphansBefore.length, 1, "orphan detected before merge");

  // Perform squash-merge (as mergeOrphanedSliceBranches does via mergeSliceToMain)
  run("git merge --squash gsd/M001/S01", repo);
  run('git commit -m "feat(M001/S01): recover orphaned branch"', repo);
  run("git branch -D gsd/M001/S01", repo);

  // Verify artifacts are now on main
  assert(
    existsSync(
      join(repo, ".gsd", "milestones", "M001", "slices", "S01", "S01-SUMMARY.md"),
    ),
    "SUMMARY merged to main after orphan recovery",
  );
  assert(
    existsSync(join(repo, ".gsd", "milestones", "M001", "slices", "S01", "S01-UAT.md")),
    "UAT merged to main after orphan recovery",
  );

  // Orphan no longer detected after merge + branch delete
  const orphansAfter = detectOrphanedSliceBranches(repo);
  assertEq(orphansAfter.length, 0, "no orphans after merge and branch deletion");

  rmSync(repo, { recursive: true, force: true });
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
