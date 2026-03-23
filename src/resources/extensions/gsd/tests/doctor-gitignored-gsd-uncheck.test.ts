/**
 * Regression test for #2202: Doctor destructively unchecks completed tasks
 * when `.gsd/` is gitignored.
 *
 * When `.gsd/` is in `.gitignore` (default for external state projects),
 * task summaries are never committed. After a PR merge and branch cleanup,
 * the untracked files are lost. Doctor sees `task.done && !hasSummary` and
 * destructively unchecks tasks + cascades to unchecking slices, making
 * merged work appear incomplete forever.
 *
 * Expected: When `.gsd/` is gitignored and a slice's roadmap entry is `[x]`,
 * doctor should create stub task summaries instead of unchecking tasks.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runGSDDoctor } from "../doctor.ts";
import { invalidateAllCaches } from "../cache.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

async function main(): Promise<void> {
  // ─── Test 1: .gsd gitignored + slice done + tasks done but no summaries ───
  // Doctor should create stub summaries, NOT uncheck tasks/slices
  console.log("\n=== #2202: gitignored .gsd — doctor must NOT uncheck completed tasks ===");
  {
    const base = mkdtempSync(join(tmpdir(), "gsd-doctor-2202-"));
    const gsd = join(base, ".gsd");
    const mDir = join(gsd, "milestones", "M001");
    const sDir = join(mDir, "slices", "S01");
    const tDir = join(sDir, "tasks");
    mkdirSync(tDir, { recursive: true });

    // .gitignore with .gsd (the default for external state projects)
    writeFileSync(join(base, ".gitignore"), `.gsd
node_modules/
`);

    // Roadmap: slice is [x] done
    writeFileSync(join(mDir, "M001-ROADMAP.md"), `# M001: Test Milestone

## Slices
- [x] **S01: Feature Slice** \`risk:low\` \`depends:[]\`
  > After this: feature works
`);

    // Plan: tasks are [x] done
    writeFileSync(join(sDir, "S01-PLAN.md"), `# S01: Feature Slice

**Goal:** Build feature
**Demo:** Works

## Tasks
- [x] **T01: First task** \`est:10m\`
  Do the first thing.
- [x] **T02: Second task** \`est:10m\`
  Do the second thing.
- [x] **T03: Third task** \`est:10m\`
  Do the third thing.
`);

    // Slice summary EXISTS (merged work evidence)
    writeFileSync(join(sDir, "S01-SUMMARY.md"), `---
id: S01
parent: M001
---
# S01: Feature Slice
Done via auto-mode.
`);

    // Slice UAT exists
    writeFileSync(join(sDir, "S01-UAT.md"), `# S01 UAT
Verified.
`);

    // NO task summaries on disk — simulates post-merge state when .gsd/ was gitignored

    // ── Run doctor with fix ──
    const fixReport = await runGSDDoctor(base, { fix: true });

    // Tasks should REMAIN checked in plan (not destructively unchecked)
    const plan = readFileSync(join(sDir, "S01-PLAN.md"), "utf-8");
    assertTrue(plan.includes("- [x] **T01:"), "T01 remains checked when .gsd is gitignored");
    assertTrue(plan.includes("- [x] **T02:"), "T02 remains checked when .gsd is gitignored");
    assertTrue(plan.includes("- [x] **T03:"), "T03 remains checked when .gsd is gitignored");

    // Slice should REMAIN checked in roadmap (no cascade uncheck)
    const roadmap = readFileSync(join(mDir, "M001-ROADMAP.md"), "utf-8");
    assertTrue(
      roadmap.includes("- [x] **S01:"),
      "slice remains [x] done when .gsd is gitignored (no destructive uncheck)"
    );
    assertTrue(
      !roadmap.includes("- [ ] **S01:"),
      "slice is NOT unchecked when .gsd is gitignored"
    );

    // Stub task summaries should be created
    assertTrue(
      existsSync(join(tDir, "T01-SUMMARY.md")),
      "stub T01-SUMMARY.md created instead of unchecking"
    );
    assertTrue(
      existsSync(join(tDir, "T02-SUMMARY.md")),
      "stub T02-SUMMARY.md created instead of unchecking"
    );
    assertTrue(
      existsSync(join(tDir, "T03-SUMMARY.md")),
      "stub T03-SUMMARY.md created instead of unchecking"
    );

    // Verify stub content is meaningful (only if file exists)
    if (existsSync(join(tDir, "T01-SUMMARY.md"))) {
      const stubContent = readFileSync(join(tDir, "T01-SUMMARY.md"), "utf-8");
      assertTrue(
        stubContent.includes("Doctor-created"),
        "stub summary indicates it was created by doctor"
      );
    }

    // Doctor should NOT report task_done_missing_summary on re-run
    invalidateAllCaches();
    const rerunReport = await runGSDDoctor(base, { fix: false });
    const rerunTaskDone = rerunReport.issues.filter(i => i.code === "task_done_missing_summary");
    assertEq(rerunTaskDone.length, 0, "no task_done_missing_summary on re-run after stub creation");

    try { rmSync(base, { recursive: true, force: true }); } catch { /* Windows EPERM */ }
  }

  // ─── Test 2: .gsd NOT gitignored — existing behavior preserved ───
  // When .gsd is NOT gitignored, the existing uncheck behavior should still work
  console.log("\n=== #2202: .gsd NOT gitignored — existing uncheck behavior preserved ===");
  {
    const base = mkdtempSync(join(tmpdir(), "gsd-doctor-2202-not-ignored-"));
    const gsd = join(base, ".gsd");
    const mDir = join(gsd, "milestones", "M001");
    const sDir = join(mDir, "slices", "S01");
    const tDir = join(sDir, "tasks");
    mkdirSync(tDir, { recursive: true });

    // .gitignore WITHOUT .gsd — .gsd/ is tracked
    writeFileSync(join(base, ".gitignore"), `node_modules/
`);

    // Roadmap: slice is [x] done
    writeFileSync(join(mDir, "M001-ROADMAP.md"), `# M001: Test Milestone

## Slices
- [x] **S01: Feature Slice** \`risk:low\` \`depends:[]\`
  > After this: feature works
`);

    // Plan: tasks are [x] done
    writeFileSync(join(sDir, "S01-PLAN.md"), `# S01: Feature Slice

**Goal:** Build feature
**Demo:** Works

## Tasks
- [x] **T01: First task** \`est:10m\`
  Do the first thing.
- [x] **T02: Second task** \`est:10m\`
  Do the second thing.
`);

    writeFileSync(join(sDir, "S01-SUMMARY.md"), `---
id: S01
parent: M001
---
# S01: Feature Slice
`);

    writeFileSync(join(sDir, "S01-UAT.md"), `# S01 UAT
Done.
`);

    // NO task summaries — but .gsd is NOT gitignored, so this IS a real problem

    const fixReport = await runGSDDoctor(base, { fix: true });

    // Tasks should be UNCHECKED (existing behavior when .gsd is not gitignored)
    const plan = readFileSync(join(sDir, "S01-PLAN.md"), "utf-8");
    assertTrue(plan.includes("- [ ] **T01:"), "T01 is unchecked when .gsd is NOT gitignored");
    assertTrue(plan.includes("- [ ] **T02:"), "T02 is unchecked when .gsd is NOT gitignored");

    // Slice should be unchecked too (cascade)
    const roadmap = readFileSync(join(mDir, "M001-ROADMAP.md"), "utf-8");
    assertTrue(
      roadmap.includes("- [ ] **S01:"),
      "slice is unchecked when .gsd is NOT gitignored (existing behavior)"
    );

    try { rmSync(base, { recursive: true, force: true }); } catch { /* Windows EPERM */ }
  }

  // ─── Test 3: .gsd gitignored but slice is NOT done — still uncheck ───
  // When .gsd is gitignored but the slice is NOT marked done, we should still
  // uncheck tasks (the slice was never completed, so this isn't post-merge loss)
  console.log("\n=== #2202: gitignored .gsd but slice not done — still uncheck ===");
  {
    const base = mkdtempSync(join(tmpdir(), "gsd-doctor-2202-slice-undone-"));
    const gsd = join(base, ".gsd");
    const mDir = join(gsd, "milestones", "M001");
    const sDir = join(mDir, "slices", "S01");
    const tDir = join(sDir, "tasks");
    mkdirSync(tDir, { recursive: true });

    // .gitignore with .gsd
    writeFileSync(join(base, ".gitignore"), `.gsd
`);

    // Roadmap: slice is [ ] NOT done
    writeFileSync(join(mDir, "M001-ROADMAP.md"), `# M001: Test Milestone

## Slices
- [ ] **S01: Feature Slice** \`risk:low\` \`depends:[]\`
  > After this: feature works
`);

    // Plan: tasks are [x] done (inconsistent with un-done slice)
    writeFileSync(join(sDir, "S01-PLAN.md"), `# S01: Feature Slice

**Goal:** Build feature
**Demo:** Works

## Tasks
- [x] **T01: First task** \`est:10m\`
  Do the first thing.
`);

    writeFileSync(join(sDir, "S01-SUMMARY.md"), `---
id: S01
parent: M001
---
# S01: Feature Slice
`);

    // NO task summaries + slice NOT done → this is genuinely broken, uncheck

    const fixReport = await runGSDDoctor(base, { fix: true });

    // Task should be unchecked — slice was never completed
    const plan = readFileSync(join(sDir, "S01-PLAN.md"), "utf-8");
    assertTrue(
      plan.includes("- [ ] **T01:"),
      "T01 is unchecked when slice is not done (even if .gsd is gitignored)"
    );

    try { rmSync(base, { recursive: true, force: true }); } catch { /* Windows EPERM */ }
  }

  report();
}

main();
