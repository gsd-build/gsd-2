/**
 * Regression test for #6137 — needs-attention verdict must produce phase:'blocked'
 *
 * The dispatch guard in auto-dispatch.ts rejects complete-milestone when verdict
 * !== 'pass'. Before this fix, state.ts derived phase:'completing-milestone' for
 * both 'pass' and 'needs-attention' verdicts. Auto-mode then entered the
 * completing-milestone rule on every tick and stopped immediately — a phantom
 * phase that produced no progress (#6137).
 *
 * This test verifies that needs-attention now derives phase:'blocked', mirroring
 * the existing needs-remediation guard in #3670.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  closeDatabase,
  insertAssessment,
  insertMilestone,
  insertSlice,
  openDatabase,
} from '../gsd-db.ts';
import { deriveStateFromDb } from '../state.ts';

describe('needs-attention dead-end guard (#6137)', () => {
  test('needs-attention assessment blocks completion when every slice is done', async () => {
    const base = mkdtempSync(join(tmpdir(), 'gsd-needs-attention-'));
    try {
      openDatabase(':memory:');
      insertMilestone({ id: 'M001', title: 'Needs attention', status: 'active' });
      insertSlice({ id: 'S01', milestoneId: 'M001', title: 'Done slice', status: 'complete' });
      insertAssessment({
        path: join(base, '.gsd', 'milestones', 'M001', 'M001-VALIDATION.md'),
        milestoneId: 'M001',
        status: 'needs-attention',
        scope: 'milestone-validation',
        fullContent: 'Verdict: needs-attention',
      });

      const state = await deriveStateFromDb(base);

      assert.equal(state.phase, 'blocked', 'needs-attention must produce phase:blocked, not completing-milestone');
      assert.match(state.nextAction, /validation findings/i, 'nextAction names the actionable resolution path');
      assert.ok(
        state.blockers.some((blocker) => blocker.includes('needs-attention')),
        'blocker text identifies the verdict',
      );
      assert.ok(
        state.blockers.some((blocker) => /verdict pass --rationale/.test(blocker)),
        'blocker offers the operator override path',
      );
    } finally {
      closeDatabase();
      rmSync(base, { recursive: true, force: true });
    }
  });

  test('needs-remediation still blocks completion (regression guard for #3670)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'gsd-needs-remediation-still-blocks-'));
    try {
      openDatabase(':memory:');
      insertMilestone({ id: 'M002', title: 'Needs remediation', status: 'active' });
      insertSlice({ id: 'S01', milestoneId: 'M002', title: 'Done slice', status: 'complete' });
      insertAssessment({
        path: join(base, '.gsd', 'milestones', 'M002', 'M002-VALIDATION.md'),
        milestoneId: 'M002',
        status: 'needs-remediation',
        scope: 'milestone-validation',
        fullContent: 'Verdict: needs-remediation',
      });

      const state = await deriveStateFromDb(base);

      assert.equal(state.phase, 'blocked');
      assert.match(state.nextAction, /remediation/i);
      assert.ok(
        state.blockers.some((blocker) => blocker.includes('needs-remediation')),
        'needs-remediation guard remains intact',
      );
    } finally {
      closeDatabase();
      rmSync(base, { recursive: true, force: true });
    }
  });

  test('pass verdict still routes to completing-milestone (negative control)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'gsd-pass-routes-completion-'));
    try {
      openDatabase(':memory:');
      insertMilestone({ id: 'M003', title: 'Passing', status: 'active' });
      insertSlice({ id: 'S01', milestoneId: 'M003', title: 'Done slice', status: 'complete' });
      insertAssessment({
        path: join(base, '.gsd', 'milestones', 'M003', 'M003-VALIDATION.md'),
        milestoneId: 'M003',
        status: 'pass',
        scope: 'milestone-validation',
        fullContent: 'Verdict: pass',
      });

      const state = await deriveStateFromDb(base);

      assert.equal(state.phase, 'completing-milestone', 'pass verdict must NOT be blocked by the new guard');
    } finally {
      closeDatabase();
      rmSync(base, { recursive: true, force: true });
    }
  });
});
