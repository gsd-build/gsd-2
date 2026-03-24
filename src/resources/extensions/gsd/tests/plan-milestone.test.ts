// Tests for inlinePriorMilestoneSummary — the cross-milestone context bridging helper.
//
// Scenarios covered:
//   (A) M002 with M001-SUMMARY.md present → returns string containing "Prior Milestone Summary" and summary content
//   (B) M001 (no prior milestone in dir) → returns null
//   (C) M002 with no M001-SUMMARY.md written → returns null
//   (D) M003 with M002 dir present but no M002-SUMMARY.md → returns null

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { inlinePriorMilestoneSummary } from '../files.ts';
// ─── Worktree-aware prompt loader ──────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));


// ─── Fixture helpers ───────────────────────────────────────────────────────

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-plan-ms-test-'));
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { closeDatabase(); } catch { /* noop */ }
  try { rmSync(base, { recursive: true, force: true }); } catch { /* noop */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

  // ─── (A) M002 with M001-SUMMARY.md present ────────────────────────────────

describe('plan-milestone', () => {
test('(A) M002 with M001-SUMMARY.md present → string containing "Prior Milestone Summary"', async () => {
    const base = createFixtureBase();
    try {
      writeMilestoneDir(base, 'M001');
      writeMilestoneDir(base, 'M002');
      writeMilestoneSummary(base, 'M001', '# M001 Summary\n\nKey decisions: used TypeScript throughout.\n');

      const result = await inlinePriorMilestoneSummary('M002', base);

      assert.ok(result !== null, '(A) result is not null when prior milestone has SUMMARY');
      assert.ok(
        typeof result === 'string' && result.includes('Prior Milestone Summary'),
        '(A) result contains "Prior Milestone Summary" label',
      );
      assert.ok(
        typeof result === 'string' && result.includes('Key decisions: used TypeScript throughout.'),
        '(A) result contains the summary file content',
      );
    } finally {
      cleanup(base);
    }
});

  // ─── (B) M001 (no prior milestone in dir) ─────────────────────────────────
test('(B) M001 — first milestone, no prior → null', async () => {
    const base = createFixtureBase();
    try {
      writeMilestoneDir(base, 'M001');

      const result = await inlinePriorMilestoneSummary('M001', base);

      assert.deepStrictEqual(result, null, '(B) M001 with no prior milestone → null');
    } finally {
      cleanup(base);
    }
});

  // ─── (C) M002 with no M001-SUMMARY.md ────────────────────────────────────
test('(C) M002 with M001 dir but no M001-SUMMARY.md → null', async () => {
    const base = createFixtureBase();
    try {
      writeMilestoneDir(base, 'M001');
      writeMilestoneDir(base, 'M002');
      // Intentionally do NOT write M001-SUMMARY.md

      const result = await inlinePriorMilestoneSummary('M002', base);

      assert.deepStrictEqual(result, null, '(C) M002 when M001 has no SUMMARY file → null');
    } finally {
      cleanup(base);
    }
});

  // ─── (D) M003 with M002 dir but no M002-SUMMARY.md ───────────────────────
test('(D) M003, M002 is immediately prior but has no SUMMARY → null', async () => {
    const base = createFixtureBase();
    try {
      writeMilestoneDir(base, 'M001');
      writeMilestoneDir(base, 'M002');
      writeMilestoneDir(base, 'M003');
      // M001 has a summary — but M002 (the immediately prior to M003) does NOT
      writeMilestoneSummary(base, 'M001', '# M001 Summary\n\nOld context.\n');
      // Intentionally do NOT write M002-SUMMARY.md

      const result = await inlinePriorMilestoneSummary('M003', base);

      assert.deepStrictEqual(result, null, '(D) M003 when M002 (immediately prior) has no SUMMARY → null');
    } finally {
      cleanup(base);
    }
});

});
