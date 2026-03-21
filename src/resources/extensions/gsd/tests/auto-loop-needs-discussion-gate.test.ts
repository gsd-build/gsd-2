/**
 * auto-loop-needs-discussion-gate.test.ts — Regression test for #1905.
 *
 * During milestone transition (e.g. M002 complete, advancing to M003),
 * the auto-loop calls enterMilestone() which creates a worktree/branch
 * for the next milestone BEFORE checking whether it needs discussion.
 *
 * If the next milestone is in `needs-discussion` phase (has CONTEXT-DRAFT.md
 * but no CONTEXT.md), the auto-loop should stop instead of creating the
 * worktree — otherwise the survivor branch triggers a restart cycle on next
 * boot (even though auto-start.ts handles it, the worktree creation is
 * wasteful and the auto-loop should stop cleanly).
 *
 * This test verifies:
 *   1. phases.ts checks state.phase before calling enterMilestone
 *   2. When the next milestone is needs-discussion, auto-loop stops
 *   3. enterMilestone is NOT called for needs-discussion milestones
 *   4. deriveState still correctly identifies needs-discussion for
 *      multi-milestone projects after transition
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { deriveState } from "../state.ts";
import { invalidateAllCaches } from "../cache.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

// ─── Source code analysis helpers ────────────────────────────────────────────

function readPhasesSource(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);
  return readFileSync(join(thisDir, "..", "auto", "phases.ts"), "utf-8");
}

// ─── Fixture Helpers ─────────────────────────────────────────────────────────

function createBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-loop-discussion-gate-"));
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

function writeSummary(base: string, mid: string, content: string): void {
  const dir = join(base, ".gsd", "milestones", mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-SUMMARY.md`), content);
}

function writeContextDraft(base: string, mid: string, content: string): void {
  const dir = join(base, ".gsd", "milestones", mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-CONTEXT-DRAFT.md`), content);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {

  // ─── 1. phases.ts checks phase before enterMilestone during transition ─────
  console.log("\n=== 1. Milestone transition guards enterMilestone for needs-discussion ===");
  {
    const source = readPhasesSource();

    // Find the milestone transition block where enterMilestone is called
    const transitionBlock = source.match(
      /\/\/ ── Milestone transition[\s\S]*?enterMilestone/,
    );
    assertTrue(!!transitionBlock,
      "found milestone transition block with enterMilestone in phases.ts");

    if (transitionBlock) {
      // The block should contain a needs-discussion check BEFORE enterMilestone
      assertTrue(
        transitionBlock[0].includes("needs-discussion"),
        "milestone transition must check for needs-discussion before enterMilestone",
      );
    }
  }

  // ─── 2. phases.ts stops auto-mode when next milestone needs discussion ─────
  console.log("\n=== 2. Transition stops auto-mode for needs-discussion milestone ===");
  {
    const source = readPhasesSource();

    // After re-derive, before enterMilestone, there should be a
    // needs-discussion check that calls stopAuto
    const afterDerive = source.match(
      /state = await deps\.deriveState\(s\.basePath\);[\s\S]*?enterMilestone/,
    );
    assertTrue(!!afterDerive,
      "found deriveState-to-enterMilestone block in transition");

    if (afterDerive) {
      const block = afterDerive[0];
      assertTrue(
        block.includes("needs-discussion"),
        "block between deriveState and enterMilestone must check needs-discussion",
      );
      assertTrue(
        block.includes("stopAuto"),
        "needs-discussion check must call stopAuto to halt auto-mode",
      );
    }
  }

  // ─── 3. enterMilestone is inside an else/guard that excludes needs-discussion
  console.log("\n=== 3. enterMilestone only called when NOT needs-discussion ===");
  {
    const source = readPhasesSource();

    // The enterMilestone call should be guarded — it should NOT execute when
    // phase is needs-discussion. Look for a pattern where needs-discussion
    // returns/breaks before enterMilestone.
    const transitionSection = source.match(
      /state = await deps\.deriveState\(s\.basePath\);[\s\S]*?deps\.resolver\.enterMilestone/,
    );
    assertTrue(!!transitionSection,
      "found transition section from deriveState to enterMilestone");

    if (transitionSection) {
      const section = transitionSection[0];
      // needs-discussion check must appear and have a break/return/action before enterMilestone
      const ndIdx = section.indexOf("needs-discussion");
      const enterIdx = section.indexOf("enterMilestone");
      assertTrue(
        ndIdx >= 0 && ndIdx < enterIdx,
        "needs-discussion guard must precede enterMilestone call",
      );
    }
  }

  // ─── 4. Multi-milestone: M001 complete, M002 draft → M002 needs-discussion ─
  console.log("\n=== 4. Multi-milestone transition: completed M001 + draft M002 ===");
  {
    const base = createBase();
    try {
      // M001 is complete (has SUMMARY)
      writeSummary(base, "M001", "# M001 Summary\nDone.");

      // M002 has only CONTEXT-DRAFT (needs discussion)
      writeContextDraft(base, "M002", "# Draft\nM002 seed discussion.\n\ndepends_on: [M001]");

      invalidateAllCaches();
      const state = await deriveState(base);

      // M002 should be the active milestone in needs-discussion phase
      assertTrue(!!state.activeMilestone,
        "activeMilestone should be set after M001 complete");
      assertEq(state.activeMilestone?.id, "M002",
        "active milestone should be M002");
      assertEq(state.phase, "needs-discussion",
        "M002 with only CONTEXT-DRAFT should be needs-discussion");
    } finally {
      cleanup(base);
    }
  }

  report();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
