/**
 * slice-disk-reconcile.test.ts — #2533
 *
 * DB-authoritative state: slices that exist only in ROADMAP.md are projections
 * and must not be imported into the SQLite database by deriveStateFromDb().
 *
 * Scenario: M001 has a ROADMAP with S01-S04. S01 and S02 have SUMMARY files
 * (complete on disk). S03 depends on S01. Only S04 is in the DB (depends on
 * S03). Without slice reconciliation, S01-S03 are invisible and S04 is
 * permanently blocked.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { deriveStateFromDb, invalidateStateCache } from "../state.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  insertSlice,
  getMilestoneSlices,
} from "../gsd-db.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-slice-reconcile-"));
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

function writeFile(base: string, relativePath: string, content: string): void {
  const full = join(base, ".gsd", relativePath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

const CONTEXT_CONTENT = `# M001: Test Milestone

This milestone tests slice reconciliation.

## Must-Haves
- Something important
`;

// Roadmap with 4 slices: S01 (no deps), S02 (no deps), S03 (depends S01), S04 (depends S03)
const ROADMAP_CONTENT = `# M001: Test Milestone

**Vision:** Test slice disk→DB reconciliation.

## Slices

- [x] **S01: Foundation** \`risk:low\` \`depends:[]\`
  > Set up project structure.
- [x] **S02: Core Utils** \`risk:low\` \`depends:[]\`
  > Build utility functions.
- [ ] **S03: Integration** \`risk:medium\` \`depends:[S01]\`
  > Integrate components.
- [ ] **S04: Final Assembly** \`risk:high\` \`depends:[S03]\`
  > Assemble everything.
`;

async function testMissingSlicesCauseBlock(): Promise<void> {
  console.log("\n--- Test: missing DB slices are not imported from ROADMAP.md ---");

  const base = createFixtureBase();
  const dbPath = join(base, ".gsd", "gsd.db");

  try {
    openDatabase(dbPath);

    // M001 in DB
    insertMilestone({ id: "M001", title: "M001: Test Milestone", status: "active", depends_on: [] });

    // Only S04 is in the DB — S01-S03 are missing
    insertSlice({ id: "S04", milestoneId: "M001", title: "S04: Final Assembly", status: "pending", risk: "high", depends: ["S03"] });

    // Write disk files — S01 and S02 have SUMMARY (complete on disk)
    writeFile(base, "milestones/M001/CONTEXT.md", CONTEXT_CONTENT);
    writeFile(base, "milestones/M001/ROADMAP.md", ROADMAP_CONTENT);
    writeFile(base, "milestones/M001/S01/PLAN.md", "# S01 Plan\n");
    writeFile(base, "milestones/M001/S01/SUMMARY.md", "# S01 Summary\nDone.");
    writeFile(base, "milestones/M001/S02/PLAN.md", "# S02 Plan\n");
    writeFile(base, "milestones/M001/S02/SUMMARY.md", "# S02 Summary\nDone.");
    writeFile(base, "milestones/M001/S03/PLAN.md", "# S03 Plan\n");

    invalidateStateCache();
    const state = await deriveStateFromDb(base);

    const dbSlices = getMilestoneSlices("M001");
    assertEq(dbSlices.length, 1, `Only DB slice S04 should remain, got ${dbSlices.length}`);
    assertEq(dbSlices[0]?.id, "S04", "Disk-only slices are not inserted");
    assertEq(state.phase, "blocked", "DB-only S04 remains blocked on missing DB dependency S03");
    assertEq(state.activeSlice, null, "No active slice is inferred from roadmap-only rows");
  } finally {
    closeDatabase();
    cleanup(base);
  }
}

async function testSliceReconciliationIdempotent(): Promise<void> {
  console.log("\n--- Test: disk-only slices remain absent on repeated derives ---");

  const base = createFixtureBase();
  const dbPath = join(base, ".gsd", "gsd.db");

  try {
    openDatabase(dbPath);

    insertMilestone({ id: "M001", title: "M001: Test", status: "active", depends_on: [] });
    // S01 already in DB with correct status
    insertSlice({ id: "S01", milestoneId: "M001", title: "S01: Foundation", status: "complete", depends: [] });

    writeFile(base, "milestones/M001/CONTEXT.md", CONTEXT_CONTENT);
    writeFile(base, "milestones/M001/ROADMAP.md", ROADMAP_CONTENT);
    writeFile(base, "milestones/M001/S01/PLAN.md", "# S01 Plan\n");
    writeFile(base, "milestones/M001/S01/SUMMARY.md", "# S01 Summary\nDone.");
    writeFile(base, "milestones/M001/S02/PLAN.md", "# S02 Plan\n");
    writeFile(base, "milestones/M001/S02/SUMMARY.md", "# S02 Summary\nDone.");

    invalidateStateCache();
    await deriveStateFromDb(base);

    // S01 should still be complete (not overwritten)
    const dbSlices = getMilestoneSlices("M001");
    const s01 = dbSlices.find(s => s.id === "S01");
    assertTrue(s01 !== undefined, "S01 should still exist in DB");
    if (s01) {
      assertEq(s01.status, "complete", "S01 status should remain 'complete' (not overwritten)");
    }

    assertEq(dbSlices.length, 1, `Only existing DB slice should remain, got ${dbSlices.length}`);
  } finally {
    closeDatabase();
    cleanup(base);
  }
}

async function testNoRoadmapSkipsReconciliation(): Promise<void> {
  console.log("\n--- Test: no ROADMAP file skips slice reconciliation ---");

  const base = createFixtureBase();
  const dbPath = join(base, ".gsd", "gsd.db");

  try {
    openDatabase(dbPath);

    insertMilestone({ id: "M001", title: "M001: No Roadmap", status: "active", depends_on: [] });

    // Only a CONTEXT file, no ROADMAP
    writeFile(base, "milestones/M001/CONTEXT.md", CONTEXT_CONTENT);

    invalidateStateCache();
    const state = await deriveStateFromDb(base);

    const dbSlices = getMilestoneSlices("M001");
    assertEq(dbSlices.length, 0, "No slices should be added when no ROADMAP exists");

    // Should be in pre-planning (no roadmap)
    assertEq(state.phase, "pre-planning", "Phase should be pre-planning with no roadmap");
  } finally {
    closeDatabase();
    cleanup(base);
  }
}

async function main(): Promise<void> {
  console.log("\n=== deriveStateFromDb does not reconcile disk slices ===");

  await testMissingSlicesCauseBlock();
  await testSliceReconciliationIdempotent();
  await testNoRoadmapSkipsReconciliation();

  report();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
