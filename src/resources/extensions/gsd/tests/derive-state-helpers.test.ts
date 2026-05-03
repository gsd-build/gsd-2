// GSD Extension — Tests for DB-authoritative deriveStateFromDb behavior
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
//
// Private helper behavior is exercised through deriveStateFromDb integration.
// Markdown files in these tests are projections unless the DB row explicitly
// makes them authoritative.

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { invalidateStateCache, deriveStateFromDb, getActiveMilestoneId } from '../state.ts';
import {
  openDatabase,
  closeDatabase,
  insertAssessment,
  insertMilestone,
  insertRequirement,
  insertSlice,
  insertTask,
  setMilestoneQueueOrder,
  updateTaskStatus,
} from '../gsd-db.ts';

// ─── Fixture Helpers ───────────────────────────────────────────────────────

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-helpers-'));
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

const ROADMAP_CONTENT = `# M001: Test Milestone

**Vision:** Test helpers.

## Slices

- [ ] **S01: First Slice** \`risk:low\` \`depends:[]\`
  > After this: Slice done.

- [ ] **S02: Second Slice** \`risk:low\` \`depends:[S01]\`
  > After this: All done.
`;

const PLAN_CONTENT = `# S01: First Slice

**Goal:** Test executing.
**Demo:** Tests pass.

## Tasks

- [ ] **T01: First Task** \`est:10m\`
  First task description.

- [x] **T02: Done Task** \`est:10m\`
  Already done.
`;

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('derive-state-helpers', () => {

  // ─── handleNoActiveMilestone: all parked ─────────────────────────────
  test('handleNoActiveMilestone: all milestones parked returns pre-planning with unpark hint', async () => {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-CONTEXT.md', '# M001\n\nContext.');
      writeFile(base, 'milestones/M001/M001-PARKED.md', 'Parked.');
      writeFile(base, 'milestones/M002/M002-CONTEXT.md', '# M002\n\nContext.');
      writeFile(base, 'milestones/M002/M002-PARKED.md', 'Also parked.');

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'First', status: 'parked' });
      insertMilestone({ id: 'M002', title: 'Second', status: 'parked' });

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      assert.equal(state.phase, 'pre-planning', 'all-parked: phase is pre-planning');
      assert.equal(state.activeMilestone, null, 'all-parked: no active milestone');
      assert.ok(state.nextAction.includes('parked'), 'all-parked: nextAction mentions parked');
      assert.ok(state.nextAction.includes('unpark'), 'all-parked: nextAction hints unpark');
      assert.equal(state.registry.length, 2, 'all-parked: both in registry');
      assert.ok(state.registry.every(e => e.status === 'parked'), 'all-parked: all registry entries parked');
    } finally {
      closeDatabase();
      cleanup(base);
    }
  });

  // ─── handleNoActiveMilestone: all complete with active requirements ──
  test('handleNoActiveMilestone: all complete with unmapped requirements', async () => {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-SUMMARY.md', '# M001 Summary\n\nDone.');
      writeFile(base, 'REQUIREMENTS.md', `# Requirements\n\n## Active\n\n### R001 — Unmapped\n- Status: active\n- Description: Not mapped.\n`);

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'First', status: 'complete' });
      insertRequirement({
        id: 'R001',
        class: 'functional',
        status: 'active',
        description: 'Unmapped',
        why: 'test',
        source: 'test',
        primary_owner: '',
        supporting_slices: '',
        validation: '',
        notes: '',
        full_content: '',
        superseded_by: null,
      });

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      assert.equal(state.phase, 'complete', 'complete-reqs: phase is complete');
      assert.ok(state.nextAction.includes('1 active requirement'), 'complete-reqs: nextAction notes unmapped reqs');
      assert.equal(state.requirements?.active, 1, 'complete-reqs: requirements.active = 1');
    } finally {
      closeDatabase();
      cleanup(base);
    }
  });

  // ─── resolveSliceDependencies: GSD_SLICE_LOCK with missing slice ────
	  test('resolveSliceDependencies: GSD_SLICE_LOCK pointing to non-existent slice returns blocked', async () => {
	    const base = createFixtureBase();
	    const origLock = process.env.GSD_SLICE_LOCK;
	    const origWorker = process.env.GSD_PARALLEL_WORKER;
	    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/tasks/.gitkeep', '');
      writeFile(base, 'milestones/M001/slices/S01/tasks/T01-PLAN.md', '# T01 Plan');

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Test', status: 'active' });
      insertSlice({ id: 'S01', milestoneId: 'M001', title: 'First', status: 'active', risk: 'low', depends: [] });
      insertTask({ id: 'T01', sliceId: 'S01', milestoneId: 'M001', title: 'First Task', status: 'pending' });

	      process.env.GSD_SLICE_LOCK = 'S99';
	      process.env.GSD_PARALLEL_WORKER = '1';

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      assert.equal(state.phase, 'blocked', 'slice-lock-miss: phase is blocked');
      assert.ok(state.blockers.some(b => b.includes('GSD_SLICE_LOCK=S99')), 'slice-lock-miss: blocker mentions lock');
	    } finally {
	      if (origLock !== undefined) process.env.GSD_SLICE_LOCK = origLock;
	      else delete process.env.GSD_SLICE_LOCK;
	      if (origWorker !== undefined) process.env.GSD_PARALLEL_WORKER = origWorker;
	      else delete process.env.GSD_PARALLEL_WORKER;
	      closeDatabase();
      cleanup(base);
    }
  });

  // ─── resolveSliceDependencies: GSD_SLICE_LOCK with valid slice ──────
	  test('resolveSliceDependencies: GSD_SLICE_LOCK targeting valid slice bypasses deps', async () => {
	    const base = createFixtureBase();
	    const origLock = process.env.GSD_SLICE_LOCK;
	    const origWorker = process.env.GSD_PARALLEL_WORKER;
	    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      // S02 depends on S01 but we lock to S02 directly
      writeFile(base, 'milestones/M001/slices/S02/S02-PLAN.md', `# S02\n\n**Goal:** Test.\n**Demo:** Pass.\n\n## Tasks\n\n- [ ] **T01: Task** \`est:5m\`\n  Do thing.\n`);
      writeFile(base, 'milestones/M001/slices/S02/tasks/.gitkeep', '');
      writeFile(base, 'milestones/M001/slices/S02/tasks/T01-PLAN.md', '# T01 Plan');

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Test', status: 'active' });
      insertSlice({ id: 'S01', milestoneId: 'M001', title: 'First', status: 'pending', risk: 'low', depends: [] });
      insertSlice({ id: 'S02', milestoneId: 'M001', title: 'Second', status: 'pending', risk: 'low', depends: ['S01'] });
      insertTask({ id: 'T01', sliceId: 'S02', milestoneId: 'M001', title: 'Task', status: 'pending' });

	      process.env.GSD_SLICE_LOCK = 'S02';
	      process.env.GSD_PARALLEL_WORKER = '1';

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      assert.equal(state.activeSlice?.id, 'S02', 'slice-lock-valid: activeSlice is S02 (locked)');
      assert.equal(state.phase, 'executing', 'slice-lock-valid: phase is executing');
	    } finally {
	      if (origLock !== undefined) process.env.GSD_SLICE_LOCK = origLock;
	      else delete process.env.GSD_SLICE_LOCK;
	      if (origWorker !== undefined) process.env.GSD_PARALLEL_WORKER = origWorker;
	      else delete process.env.GSD_PARALLEL_WORKER;
	      closeDatabase();
      cleanup(base);
    }
  });

  // ─── DB-authoritative tasks: plan projection does not import tasks ──────
  test('deriveStateFromDb: DB-empty task list does not import PLAN tasks', async () => {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/tasks/.gitkeep', '');
      writeFile(base, 'milestones/M001/slices/S01/tasks/T01-PLAN.md', '# T01 Plan');

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Test', status: 'active' });
      insertSlice({ id: 'S01', milestoneId: 'M001', title: 'First', status: 'active', risk: 'low', depends: [] });
      insertSlice({ id: 'S02', milestoneId: 'M001', title: 'Second', status: 'pending', risk: 'low', depends: ['S01'] });
      // No tasks inserted — PLAN.md is a projection and must not be imported.

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      assert.equal(state.phase, 'planning', 'db-empty-tasks: phase is planning');
      assert.equal(state.activeTask, null, 'db-empty-tasks: no active task');
      assert.equal(state.progress?.tasks?.total, 0, 'db-empty-tasks: no tasks imported');
      assert.equal(state.progress?.tasks?.done, 0, 'db-empty-tasks: no completed tasks imported');
    } finally {
      closeDatabase();
      cleanup(base);
    }
  });

  // ─── DB-authoritative tasks: SUMMARY projection does not complete task ────
  test('deriveStateFromDb: disk SUMMARY does not reconcile pending task', async () => {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/tasks/.gitkeep', '');
      writeFile(base, 'milestones/M001/slices/S01/tasks/T01-PLAN.md', '# T01 Plan');
      // T01 has a summary on disk but DB still says pending
      writeFile(base, 'milestones/M001/slices/S01/tasks/T01-SUMMARY.md', '# T01 Summary\n\nDone on disk.');

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Test', status: 'active' });
      insertSlice({ id: 'S01', milestoneId: 'M001', title: 'First', status: 'active', risk: 'low', depends: [] });
      insertSlice({ id: 'S02', milestoneId: 'M001', title: 'Second', status: 'pending', risk: 'low', depends: ['S01'] });
      insertTask({ id: 'T01', sliceId: 'S01', milestoneId: 'M001', title: 'First Task', status: 'pending' });
      insertTask({ id: 'T02', sliceId: 'S01', milestoneId: 'M001', title: 'Done Task', status: 'complete' });

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      assert.equal(state.phase, 'executing', 'disk-summary-ignored: phase is executing');
      assert.equal(state.activeTask?.id, 'T01', 'disk-summary-ignored: T01 remains active');
      assert.equal(state.progress?.tasks?.done, 1, 'disk-summary-ignored: only DB-complete task is done');
    } finally {
      closeDatabase();
      cleanup(base);
    }
  });

  // ─── detectBlockers: blocker_discovered triggers replanning ──────────
  test('detectBlockers: task with blocker_discovered triggers replanning-slice', async () => {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/tasks/.gitkeep', '');
      writeFile(base, 'milestones/M001/slices/S01/tasks/T01-PLAN.md', '# T01 Plan');
      // T02 completed with blocker discovered. The disk summary is a projection;
      // only the DB blocker flag is authoritative for deriveStateFromDb().
      writeFile(base, 'milestones/M001/slices/S01/tasks/T02-SUMMARY.md',
        '---\nblocker_discovered: true\n---\n\n# T02 Summary\n\nFound a blocker.');

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Test', status: 'active' });
      insertSlice({ id: 'S01', milestoneId: 'M001', title: 'First', status: 'active', risk: 'low', depends: [] });
      insertSlice({ id: 'S02', milestoneId: 'M001', title: 'Second', status: 'pending', risk: 'low', depends: ['S01'] });
      insertTask({ id: 'T01', sliceId: 'S01', milestoneId: 'M001', title: 'First Task', status: 'pending' });
      insertTask({ id: 'T02', sliceId: 'S01', milestoneId: 'M001', title: 'Done Task', status: 'complete', blockerDiscovered: true });

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      assert.equal(state.phase, 'replanning-slice', 'blocker: phase is replanning-slice');
      assert.ok(state.blockers.some(b => b.includes('T02')), 'blocker: blockers mention T02');
    } finally {
      closeDatabase();
      cleanup(base);
    }
  });

  // ─── CONTINUE.md projection is ignored by DB derive ─────────────────
  test('deriveStateFromDb: continue.md projection does not trigger resume nextAction', async () => {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/tasks/.gitkeep', '');
      writeFile(base, 'milestones/M001/slices/S01/tasks/T01-PLAN.md', '# T01 Plan');
      writeFile(base, 'milestones/M001/slices/S01/S01-CONTINUE.md', 'Resume from here.');

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Test', status: 'active' });
      insertSlice({ id: 'S01', milestoneId: 'M001', title: 'First', status: 'active', risk: 'low', depends: [] });
      insertSlice({ id: 'S02', milestoneId: 'M001', title: 'Second', status: 'pending', risk: 'low', depends: ['S01'] });
      insertTask({ id: 'T01', sliceId: 'S01', milestoneId: 'M001', title: 'First Task', status: 'pending' });
      insertTask({ id: 'T02', sliceId: 'S01', milestoneId: 'M001', title: 'Done Task', status: 'complete' });

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      assert.equal(state.phase, 'executing', 'continue: phase is still executing');
      assert.ok(!state.nextAction.includes('Resume interrupted work'), 'continue: nextAction does not mention resume');
      assert.ok(!state.nextAction.includes('continue.md'), 'continue: nextAction does not mention continue.md');
    } finally {
      closeDatabase();
      cleanup(base);
    }
  });

  // ─── buildCompletenessSet: DB status is authoritative ──────────────
  test('buildCompletenessSet: DB status=complete marks milestone complete', async () => {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      writeFile(base, 'milestones/M001/M001-SUMMARY.md', '# M001 Summary\n\nDone.');
      writeFile(base, 'milestones/M002/M002-CONTEXT.md', '# M002\n\nActive.');

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'First', status: 'complete' });
      insertMilestone({ id: 'M002', title: 'Second', status: 'active' });

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      const m1 = state.registry.find(e => e.id === 'M001');
      assert.equal(m1?.status, 'complete', 'DB status=complete → registry entry complete');
      assert.equal(state.activeMilestone?.id, 'M002', 'M002 is the active milestone');
    } finally {
      closeDatabase();
      cleanup(base);
    }
  });

  // ─── Regression #4179: orphan SUMMARY must NOT flip DB-active milestone ───
  // A crashed complete-milestone turn (or stale/manual SUMMARY.md) can leave
  // a milestone SUMMARY on disk while the DB row still reads 'active'. The
  // read-side of state derivation must NOT treat the orphan SUMMARY as a
  // completion signal, or the auto-loop advances and merges work that was
  // never actually finished (same failure class as #4175, read-side twin).
  test('buildCompletenessSet (#4179): orphan SUMMARY on disk does not mark DB-active milestone complete', async () => {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      writeFile(base, 'milestones/M001/M001-SUMMARY.md', '# M001 Orphan Summary\n\nLeft over from crashed turn.');

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'First', status: 'active' });
      // Slice still in-flight — auto should resume, not merge.
      insertSlice({ id: 'S01', milestoneId: 'M001', title: 'First', status: 'active', risk: 'low', depends: [] });
      insertSlice({ id: 'S02', milestoneId: 'M001', title: 'Second', status: 'pending', risk: 'low', depends: ['S01'] });
      insertTask({ id: 'T01', sliceId: 'S01', milestoneId: 'M001', title: 'In-flight', status: 'pending' });

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      const m1 = state.registry.find(e => e.id === 'M001');
      assert.notEqual(m1?.status, 'complete', 'orphan SUMMARY must not mark milestone complete');
      assert.equal(m1?.status, 'active', 'M001 remains active — DB is authoritative');
      assert.equal(state.activeMilestone?.id, 'M001', 'M001 is still the active milestone');
      assert.notEqual(state.phase, 'completing-milestone', 'must not short-circuit into completion');
    } finally {
      closeDatabase();
      cleanup(base);
    }
  });

  // Regression #4179 (companion): DB-active milestone with all slices done +
  // validation terminal + orphan SUMMARY must still flow through completing-milestone
  // (re-runs complete-milestone), not be reported as already-complete.
  test('buildRegistryAndFindActive (#4179): orphan SUMMARY with validation-terminal falls through to completing-milestone', async () => {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);
      writeFile(base, 'milestones/M001/slices/S01/S01-PLAN.md', PLAN_CONTENT);
      writeFile(base, 'milestones/M001/slices/S02/S02-PLAN.md', PLAN_CONTENT);
      writeFile(base, 'milestones/M001/M001-VALIDATION.md', '---\nverdict: passed\n---\n# Validation\nAll good.');
      writeFile(base, 'milestones/M001/M001-SUMMARY.md', '# M001 Orphan Summary\n\nLeft over.');

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'First', status: 'active' });
      insertSlice({ id: 'S01', milestoneId: 'M001', title: 'First', status: 'complete', risk: 'low', depends: [] });
      insertSlice({ id: 'S02', milestoneId: 'M001', title: 'Second', status: 'complete', risk: 'low', depends: ['S01'] });
      insertAssessment({
        path: 'milestones/M001/M001-VALIDATION.md',
        milestoneId: 'M001',
        status: 'pass',
        scope: 'milestone-validation',
        fullContent: 'verdict: passed',
      });

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      const m1 = state.registry.find(e => e.id === 'M001');
      assert.equal(m1?.status, 'active', 'M001 stays active despite orphan SUMMARY + validation-terminal');
      assert.equal(state.activeMilestone?.id, 'M001', 'M001 is still the active milestone');
      assert.equal(state.phase, 'completing-milestone', 'phase flows through completing-milestone (re-run)');
    } finally {
      closeDatabase();
      cleanup(base);
    }
  });

  // ─── DB-authoritative slices: roadmap projection does not insert slices ───
  test('deriveStateFromDb: ROADMAP slices missing from DB are not auto-inserted', async () => {
    const base = createFixtureBase();
    try {
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', ROADMAP_CONTENT);

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Test', status: 'active' });
      // No slices inserted — ROADMAP.md is a projection and must not be imported.

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      assert.equal(state.activeMilestone?.id, 'M001', 'roadmap-projection: M001 is active');
      assert.equal(state.activeSlice, null, 'roadmap-projection: no active slice imported');
      assert.equal(state.phase, 'pre-planning', 'roadmap-projection: no DB slices routes to pre-planning');
      assert.equal(state.progress?.slices, undefined, 'roadmap-projection: no slice progress from projection');
    } finally {
      closeDatabase();
      cleanup(base);
    }
  });

  // ─── Queue order: DB sequence is authoritative ─────────────────────
  test('deriveStateFromDb ignores QUEUE-ORDER.json and uses DB sequence', async () => {
    const base = createFixtureBase();
    try {
      // QUEUE-ORDER.json is a projection and should not drive DB derivation.
      const queueOrder = JSON.stringify({ order: ['M003', 'M001', 'M002'], updatedAt: new Date().toISOString() });
      writeFileSync(join(base, '.gsd', 'QUEUE-ORDER.json'), queueOrder);
      writeFile(base, 'milestones/M001/M001-CONTEXT.md', '# M001\n\nContext.');
      writeFile(base, 'milestones/M002/M002-CONTEXT.md', '# M002\n\nContext.');
      writeFile(base, 'milestones/M003/M003-CONTEXT.md', '# M003\n\nContext.');

      openDatabase(':memory:');
      // Insert in natural order, then store the authoritative DB sequence.
      insertMilestone({ id: 'M001', title: 'First', status: 'active' });
      insertMilestone({ id: 'M002', title: 'Second', status: 'active' });
      insertMilestone({ id: 'M003', title: 'Third', status: 'active' });
      setMilestoneQueueOrder(['M002', 'M001', 'M003']);

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      assert.equal(state.activeMilestone?.id, 'M002', 'queue-order: DB sequence chooses M002');
      assert.equal(state.registry[0]?.id, 'M002', 'queue-order: registry[0] follows DB sequence');
    } finally {
      closeDatabase();
      cleanup(base);
    }
  });

	  test('getActiveMilestoneId: DB lock path ignores PARKED flag projection', async () => {
	    const base = createFixtureBase();
	    const previousLock = process.env.GSD_MILESTONE_LOCK;
	    const previousWorker = process.env.GSD_PARALLEL_WORKER;
	    try {
	      process.env.GSD_MILESTONE_LOCK = 'M001';
	      process.env.GSD_PARALLEL_WORKER = '1';
      writeFile(base, 'milestones/M001/M001-PARKED.md', '# Parked on disk');

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Active in DB', status: 'active' });

      const id = await getActiveMilestoneId(base);
      assert.equal(id, 'M001', 'DB status remains authoritative despite PARKED projection');
	    } finally {
	      if (previousLock === undefined) delete process.env.GSD_MILESTONE_LOCK;
	      else process.env.GSD_MILESTONE_LOCK = previousLock;
	      if (previousWorker === undefined) delete process.env.GSD_PARALLEL_WORKER;
	      else process.env.GSD_PARALLEL_WORKER = previousWorker;
	      closeDatabase();
      cleanup(base);
    }
  });

  // ─── handleAllSlicesDone: needs-remediation + all slices done → blocked (#4506) ──
  test('handleAllSlicesDone: needs-remediation with all slices done returns blocked', async () => {
    const base = createFixtureBase();
    try {
      const doneRoadmap = `# M001: Remediation Test\n\n**Vision:** Test.\n\n## Slices\n\n- [x] **S01: Done** \`risk:low\` \`depends:[]\`\n  > Done.\n`;
      writeFile(base, 'milestones/M001/M001-ROADMAP.md', doneRoadmap);
      writeFile(base, 'milestones/M001/M001-VALIDATION.md',
        '---\nverdict: needs-remediation\nremediation_round: 1\n---\n\n# Validation\nNeeds remediation.');

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Remediation Test', status: 'active' });
      insertSlice({ id: 'S01', milestoneId: 'M001', title: 'Done', status: 'complete', risk: 'low', depends: [] });
      insertAssessment({
        path: 'milestones/M001/M001-VALIDATION.md',
        milestoneId: 'M001',
        status: 'needs-remediation',
        scope: 'milestone-validation',
        fullContent: 'verdict: needs-remediation',
      });

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      assert.equal(state.phase, 'blocked', 'remediation-stuck: phase is blocked (no infinite re-dispatch)');
      assert.equal(state.activeMilestone?.id, 'M001', 'remediation-stuck: activeMilestone is M001');
      assert.ok(
        state.blockers.some(b => b.includes('needs-remediation') && b.includes('M001')),
        'remediation-stuck: blocker message mentions milestone and verdict',
      );
    } finally {
      closeDatabase();
      cleanup(base);
    }
  });

  // ─── Deferred queued shell: shell milestone deferred, real one promoted ──
  test('buildRegistryAndFindActive: queued shell deferred, later real milestone becomes active (#3470)', async () => {
    const base = createFixtureBase();
    try {
      // M001: queued shell — no content, no slices
      mkdirSync(join(base, '.gsd', 'milestones', 'M001'), { recursive: true });
      // M002: real milestone with context
      writeFile(base, 'milestones/M002/M002-CONTEXT.md', '# M002: Real\n\nActive milestone.');

      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Shell', status: 'queued' });
      insertMilestone({ id: 'M002', title: 'Real', status: 'active' });

      invalidateStateCache();
      const state = await deriveStateFromDb(base);

      // M002 should be active (M001 queued shell deferred)
      assert.equal(state.activeMilestone?.id, 'M002', 'deferred-shell: M002 is active (shell deferred)');
    } finally {
      closeDatabase();
      cleanup(base);
    }
  });
});
