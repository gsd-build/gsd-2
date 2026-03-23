// gsd-recover.test.ts — Tests for the `gsd recover` recovery logic.
// Verifies: populate DB → clear hierarchy → recover from markdown → state matches.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  openDatabase,
  closeDatabase,
  transaction,
  getAllMilestones,
  getMilestoneSlices,
  getSliceTasks,
  _getAdapter,
  insertMilestone,
  insertSlice,
  insertTask,
} from '../gsd-db.ts';
import { migrateHierarchyToDb } from '../md-importer.ts';
import { deriveStateFromDb, invalidateStateCache } from '../state.ts';
import { createTestContext } from './test-helpers.ts';

const { assertEq, assertTrue, report } = createTestContext();

// ─── Fixture Helpers ───────────────────────────────────────────────────────

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-recover-'));
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true });
  return base;
}

function writeFile(base: string, relativePath: string, content: string): void {
  const full = join(base, '.gsd', relativePath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

// ─── Fixture Content ──────────────────────────────────────────────────────

const ROADMAP_M001 = `# M001: Recovery Test

**Vision:** Test recovery round-trip.

## Slices

- [x] **S01: Setup** \`risk:low\` \`depends:[]\`
  > After this: Setup complete.

- [ ] **S02: Core** \`risk:medium\` \`depends:[S01]\`
  > After this: Core done.
`;

const PLAN_S01_COMPLETE = `---
estimated_steps: 2
estimated_files: 1
skills_used: []
---

# S01: Setup

**Goal:** Setup fixtures.
**Demo:** Tasks done.

## Tasks

- [x] **T01: Init** \`est:15m\`
  Initialize things.

- [x] **T02: Config** \`est:10m\`
  Configure things.
`;

const PLAN_S02_PARTIAL = `---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# S02: Core

**Goal:** Build core.
**Demo:** Core works.

## Tasks

- [x] **T01: Build** \`est:30m\`
  Build it.

- [ ] **T02: Test** \`est:20m\`
  Test it.

- [ ] **T03: Polish** \`est:15m\`
  Polish it.
`;

const SUMMARY_S01 = `---
id: S01
parent: M001
milestone: M001
---

# S01: Setup — Summary

Setup is complete.
`;

// ─── Recovery helpers (mirrors gsd recover handler logic) ─────────────────

function clearHierarchyTables(): void {
  const db = _getAdapter()!;
  transaction(() => {
    db.exec("DELETE FROM tasks");
    db.exec("DELETE FROM slices");
    db.exec("DELETE FROM milestones");
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────

async function main() {
  // ─── Test (a): Full recovery round-trip ─────────────────────────────────
  console.log('\n=== recover: full round-trip (populate → clear → recover → verify) ===');
  {
    const base = createFixtureBase();
    try {
      // Set up markdown fixtures
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_M001);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_S01_COMPLETE);
      writeFile(base, 'milestones/M001/slices/S01/S01-SUMMARY.md', SUMMARY_S01);
      writeFile(base, 'milestones/M001/slices/S02/S02-PLAN.md', PLAN_S02_PARTIAL);

      // Step 1: Open DB and populate from markdown
      openDatabase(':memory:');
      const counts1 = migrateHierarchyToDb(base);
      assertEq(counts1.milestones, 1, 'round-trip: initial migration — 1 milestone');
      assertEq(counts1.slices, 2, 'round-trip: initial migration — 2 slices');
      assertTrue(counts1.tasks >= 5, 'round-trip: initial migration — at least 5 tasks');

      // Step 2: Capture state from DB before clearing
      invalidateStateCache();
      const stateBefore = await deriveStateFromDb(base);
      assertTrue(stateBefore.activeMilestone !== null, 'round-trip: state before has active milestone');
      const milestonesBefore = getAllMilestones();
      const slicesBefore = getMilestoneSlices('M001');
      const s01TasksBefore = getSliceTasks('M001', 'S01');
      const s02TasksBefore = getSliceTasks('M001', 'S02');

      // Step 3: Clear hierarchy tables
      clearHierarchyTables();
      const milestonesAfterClear = getAllMilestones();
      assertEq(milestonesAfterClear.length, 0, 'round-trip: milestones cleared');

      // Step 4: Recover from markdown
      const counts2 = migrateHierarchyToDb(base);
      assertEq(counts2.milestones, counts1.milestones, 'round-trip: recovery milestone count matches');
      assertEq(counts2.slices, counts1.slices, 'round-trip: recovery slice count matches');
      assertEq(counts2.tasks, counts1.tasks, 'round-trip: recovery task count matches');

      // Step 5: Verify state matches
      invalidateStateCache();
      const stateAfter = await deriveStateFromDb(base);

      assertEq(stateAfter.phase, stateBefore.phase, 'round-trip: phase matches');
      assertEq(
        stateAfter.activeMilestone?.id,
        stateBefore.activeMilestone?.id,
        'round-trip: active milestone ID matches',
      );
      assertEq(
        stateAfter.activeSlice?.id,
        stateBefore.activeSlice?.id,
        'round-trip: active slice ID matches',
      );
      assertEq(
        stateAfter.activeTask?.id,
        stateBefore.activeTask?.id,
        'round-trip: active task ID matches',
      );

      // Verify row-level data matches
      const milestonesAfter = getAllMilestones();
      assertEq(milestonesAfter.length, milestonesBefore.length, 'round-trip: milestone row count');
      assertEq(milestonesAfter[0]?.id, milestonesBefore[0]?.id, 'round-trip: milestone ID');
      assertEq(milestonesAfter[0]?.title, milestonesBefore[0]?.title, 'round-trip: milestone title');

      const slicesAfter = getMilestoneSlices('M001');
      assertEq(slicesAfter.length, slicesBefore.length, 'round-trip: slice row count');
      assertEq(slicesAfter[0]?.id, slicesBefore[0]?.id, 'round-trip: S01 ID');
      assertEq(slicesAfter[0]?.status, slicesBefore[0]?.status, 'round-trip: S01 status');
      assertEq(slicesAfter[1]?.id, slicesBefore[1]?.id, 'round-trip: S02 ID');

      const s01TasksAfter = getSliceTasks('M001', 'S01');
      assertEq(s01TasksAfter.length, s01TasksBefore.length, 'round-trip: S01 task count');

      const s02TasksAfter = getSliceTasks('M001', 'S02');
      assertEq(s02TasksAfter.length, s02TasksBefore.length, 'round-trip: S02 task count');

      closeDatabase();
    } finally {
      closeDatabase();
      cleanup(base);
    }
  }

  // ─── Test (b): Idempotent recovery — double recover ────────────────────
  console.log('\n=== recover: idempotent — double recovery produces same state ===');
  {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_M001);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_S01_COMPLETE);
      writeFile(base, 'milestones/M001/slices/S01/S01-SUMMARY.md', SUMMARY_S01);
      writeFile(base, 'milestones/M001/slices/S02/S02-PLAN.md', PLAN_S02_PARTIAL);

      openDatabase(':memory:');

      // First recovery
      migrateHierarchyToDb(base);
      invalidateStateCache();
      const state1 = await deriveStateFromDb(base);

      // Clear and recover again
      clearHierarchyTables();
      migrateHierarchyToDb(base);
      invalidateStateCache();
      const state2 = await deriveStateFromDb(base);

      assertEq(state2.phase, state1.phase, 'idempotent: phase matches');
      assertEq(
        state2.activeMilestone?.id,
        state1.activeMilestone?.id,
        'idempotent: active milestone matches',
      );
      assertEq(
        state2.activeSlice?.id,
        state1.activeSlice?.id,
        'idempotent: active slice matches',
      );
      assertEq(
        state2.activeTask?.id,
        state1.activeTask?.id,
        'idempotent: active task matches',
      );

      closeDatabase();
    } finally {
      closeDatabase();
      cleanup(base);
    }
  }

  // ─── Test (c): Recovery preserves non-hierarchy data ───────────────────
  console.log('\n=== recover: preserves decisions/requirements ===');
  {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_M001);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_S01_COMPLETE);

      openDatabase(':memory:');
      migrateHierarchyToDb(base);

      // Insert a decision and requirement manually
      const db = _getAdapter()!;
      db.prepare(
        `INSERT INTO decisions (id, when_context, scope, decision, choice, rationale, revisable)
         VALUES (:id, :when, :scope, :decision, :choice, :rationale, :revisable)`,
      ).run({
        ':id': 'D001',
        ':when': 'T03',
        ':scope': 'architecture',
        ':decision': 'Use shared WAL',
        ':choice': 'Single DB',
        ':rationale': 'Simpler',
        ':revisable': 'Yes',
      });

      db.prepare(
        `INSERT INTO requirements (id, class, status, description)
         VALUES (:id, :class, :status, :desc)`,
      ).run({
        ':id': 'R001',
        ':class': 'functional',
        ':status': 'active',
        ':desc': 'Recovery works',
      });

      // Clear hierarchy only
      clearHierarchyTables();

      // Verify decisions and requirements survived
      const decisions = db.prepare('SELECT * FROM decisions').all();
      assertEq(decisions.length, 1, 'preserve: decision survives clear');
      assertEq((decisions[0] as any).id, 'D001', 'preserve: decision ID intact');

      const requirements = db.prepare('SELECT * FROM requirements').all();
      assertEq(requirements.length, 1, 'preserve: requirement survives clear');
      assertEq((requirements[0] as any).id, 'R001', 'preserve: requirement ID intact');

      // Recover hierarchy
      migrateHierarchyToDb(base);
      const milestones = getAllMilestones();
      assertTrue(milestones.length > 0, 'preserve: milestones recovered after clear');

      // Verify non-hierarchy data still intact after recovery
      const decisionsAfter = db.prepare('SELECT * FROM decisions').all();
      assertEq(decisionsAfter.length, 1, 'preserve: decision still present after recovery');

      closeDatabase();
    } finally {
      closeDatabase();
      cleanup(base);
    }
  }

  // ─── Test (d): Recovery from empty markdown dir ────────────────────────
  console.log('\n=== recover: empty milestones dir ===');
  {
    const base = createFixtureBase();
    try {
      // No milestones written — just the empty dir
      openDatabase(':memory:');

      // Pre-populate to simulate existing state
      insertMilestone({ id: 'M001', title: 'Ghost', status: 'active' });

      // Clear and recover from empty
      clearHierarchyTables();
      const counts = migrateHierarchyToDb(base);
      assertEq(counts.milestones, 0, 'empty: zero milestones recovered');
      assertEq(counts.slices, 0, 'empty: zero slices recovered');
      assertEq(counts.tasks, 0, 'empty: zero tasks recovered');

      const all = getAllMilestones();
      assertEq(all.length, 0, 'empty: no milestones in DB after recovery');

      closeDatabase();
    } finally {
      closeDatabase();
      cleanup(base);
    }
  }

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
