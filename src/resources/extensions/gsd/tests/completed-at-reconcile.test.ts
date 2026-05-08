/**
 * Behavioural regression test for DB-authoritative task completion.
 *
 * A task SUMMARY.md on disk is a projection, not a completion command.
 * deriveStateFromDb must not flip a pending DB task to complete or invent a
 * completed_at timestamp from disk evidence.
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { deriveStateFromDb, invalidateStateCache } from '../state.ts';
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  insertSlice,
  insertTask,
  getTask,
} from '../gsd-db.ts';

let basePath: string;

function setupProject(): void {
  basePath = mkdtempSync(join(tmpdir(), 'gsd-completed-at-'));
  // Project structure with active milestone, one slice, one task whose
  // SUMMARY.md is already on disk — but the DB row is still "pending".
  mkdirSync(join(basePath, '.gsd', 'milestones', 'M001', 'slices', 'S01', 'tasks'), { recursive: true });

  // CONTEXT + ROADMAP so deriveState identifies M001 as active and S01 as the active slice.
  writeFileSync(
    join(basePath, '.gsd', 'milestones', 'M001', 'M001-CONTEXT.md'),
    '# M001\nActive milestone.\n',
  );
  writeFileSync(
    join(basePath, '.gsd', 'milestones', 'M001', 'M001-ROADMAP.md'),
    `# M001\n\n## Slices\n\n- [ ] **S01: Slice** \`risk:low\` \`depends:[]\`\n  - After this: works\n`,
  );

  // Plan file for the slice. It is a projection and must not drive DB state.
  writeFileSync(
    join(basePath, '.gsd', 'milestones', 'M001', 'slices', 'S01', 'S01-PLAN.md'),
    `# S01: Slice\n\n## Tasks\n\n- [ ] **T01: Test task** \`est:30m\`\n  - Do: x\n  - Verify: y\n`,
  );

  // The summary file is a projection and must not complete the task.
  writeFileSync(
    join(basePath, '.gsd', 'milestones', 'M001', 'slices', 'S01', 'tasks', 'T01-SUMMARY.md'),
    '---\nid: T01\nparent: S01\nmilestone: M001\nblocker_discovered: false\n---\n# T01\n',
  );
}

describe('completed_at DB-authoritative derivation', () => {
  beforeEach(() => {
    setupProject();
    openDatabase(join(basePath, '.gsd', 'gsd.db'));
    insertMilestone({ id: 'M001', title: 'M001', status: 'active' });
    insertSlice({ id: 'S01', milestoneId: 'M001', title: 'Slice', status: 'active' });
    // Task is "pending" in DB, even though SUMMARY.md exists on disk.
    insertTask({ id: 'T01', sliceId: 'S01', milestoneId: 'M001', title: 'Test task', status: 'pending' });
    invalidateStateCache();
  });

  afterEach(() => {
    closeDatabase();
    try { rmSync(basePath, { recursive: true, force: true }); } catch { /* */ }
  });

  test('deriveStateFromDb does not set completed_at from a disk SUMMARY projection', async () => {
    const before = getTask('M001', 'S01', 'T01');
    assert.strictEqual(before?.status, 'pending', 'task starts pending');
    assert.strictEqual(before?.completed_at, null, 'task starts with completed_at NULL');

    // Derive runtime state. Disk SUMMARY.md must not mutate the DB row.
    await deriveStateFromDb(basePath);

    const after = getTask('M001', 'S01', 'T01');
    assert.strictEqual(after?.status, 'pending', 'task remains pending');
    assert.strictEqual(after?.completed_at, null, 'completed_at remains NULL');
  });
});
