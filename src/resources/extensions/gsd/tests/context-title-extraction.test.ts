// Regression tests for #1725: milestone title extraction from CONTEXT.md
// and CONTEXT-DRAFT.md when no ROADMAP.md or SUMMARY.md exists.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { deriveState, extractContextTitle } from '../state.ts';
import { createTestContext } from './test-helpers.ts';

const { assertEq, report } = createTestContext();

// ─── Fixture Helpers ───────────────────────────────────────────────────────

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-ctx-title-test-'));
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true });
  return base;
}

function writeContext(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-CONTEXT.md`), content);
}

function writeContextDraft(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-CONTEXT-DRAFT.md`), content);
}

function writeRoadmap(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-ROADMAP.md`), content);
}

function writeMilestoneSummary(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-SUMMARY.md`), content);
}

function writeMilestoneValidation(base: string, mid: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-VALIDATION.md`), `---\nverdict: pass\nremediation_round: 0\n---\n\n# Validation\nPassed.`);
}

function writeParked(base: string, mid: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-PARKED.md`), '# Parked\n\nParked for now.');
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Unit tests for extractContextTitle()
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {

  // ─── extractContextTitle unit tests ────────────────────────────────────
  console.log('\n=== extractContextTitle unit tests ===');

  assertEq(
    extractContextTitle(null, 'M005'),
    'M005',
    'null content returns fallback'
  );

  assertEq(
    extractContextTitle('', 'M005'),
    'M005',
    'empty content returns fallback'
  );

  assertEq(
    extractContextTitle('No heading here\nJust text.', 'M005'),
    'M005',
    'no h1 heading returns fallback'
  );

  assertEq(
    extractContextTitle('# M005: Platform Foundation & Separation', 'M005'),
    'Platform Foundation & Separation',
    'strips milestone ID prefix from h1'
  );

  assertEq(
    extractContextTitle('# M005-abc123: Platform Foundation & Separation', 'M005'),
    'Platform Foundation & Separation',
    'strips milestone ID with hash suffix from h1'
  );

  assertEq(
    extractContextTitle('# Just a Title', 'M005'),
    'Just a Title',
    'h1 without milestone prefix is returned as-is'
  );

  assertEq(
    extractContextTitle('---\ntitle: FM Title\n---\n\n# M005: Real Title', 'M005'),
    'Real Title',
    'extracts from h1 even with frontmatter present'
  );

  assertEq(
    extractContextTitle('## Not an H1\n\n# M005: Actual Title\n\nBody text.', 'M005'),
    'Actual Title',
    'finds first h1 even if h2 appears first'
  );

  // ═══════════════════════════════════════════════════════════════════════
  // Integration tests: deriveState with CONTEXT-only milestones
  // ═══════════════════════════════════════════════════════════════════════

  // ─── Test: CONTEXT.md only milestone uses title from heading ──────────
  console.log('\n=== CONTEXT.md only → title extracted from heading ===');
  {
    const base = createFixtureBase();
    try {
      writeContext(base, 'M005', '# M005: Platform Foundation & Separation\n\nContext body.');

      const state = await deriveState(base);

      assertEq(state.activeMilestone?.id, 'M005', 'activeMilestone id is M005');
      assertEq(
        state.activeMilestone?.title,
        'Platform Foundation & Separation',
        'activeMilestone title extracted from CONTEXT.md'
      );
      assertEq(
        state.registry[0]?.title,
        'Platform Foundation & Separation',
        'registry title extracted from CONTEXT.md'
      );
    } finally {
      cleanup(base);
    }
  }

  // ─── Test: CONTEXT-DRAFT.md only milestone uses title from heading ────
  console.log('\n=== CONTEXT-DRAFT.md only → title extracted from heading ===');
  {
    const base = createFixtureBase();
    try {
      writeContextDraft(base, 'M005', '# M005: Draft Platform Title\n\nDraft body.');

      const state = await deriveState(base);

      assertEq(state.activeMilestone?.id, 'M005', 'activeMilestone id is M005');
      assertEq(
        state.activeMilestone?.title,
        'Draft Platform Title',
        'activeMilestone title extracted from CONTEXT-DRAFT.md'
      );
      assertEq(
        state.registry[0]?.title,
        'Draft Platform Title',
        'registry title extracted from CONTEXT-DRAFT.md'
      );
    } finally {
      cleanup(base);
    }
  }

  // ─── Test: CONTEXT.md takes precedence over CONTEXT-DRAFT.md ──────────
  console.log('\n=== CONTEXT.md title takes precedence over CONTEXT-DRAFT.md ===');
  {
    const base = createFixtureBase();
    try {
      writeContext(base, 'M005', '# M005: Context Title\n\nContext body.');
      writeContextDraft(base, 'M005', '# M005: Draft Title\n\nDraft body.');

      const state = await deriveState(base);

      assertEq(
        state.activeMilestone?.title,
        'Context Title',
        'CONTEXT.md title wins over CONTEXT-DRAFT.md'
      );
      assertEq(
        state.registry[0]?.title,
        'Context Title',
        'registry uses CONTEXT.md title'
      );
    } finally {
      cleanup(base);
    }
  }

  // ─── Test: Pending milestone (not active) also gets title ─────────────
  console.log('\n=== pending milestone also gets context title ===');
  {
    const base = createFixtureBase();
    try {
      // M001: blank → becomes active
      mkdirSync(join(base, '.gsd', 'milestones', 'M001'), { recursive: true });

      // M005: has CONTEXT.md with title → should be pending with extracted title
      writeContext(base, 'M005', '# M005: Pending Feature\n\nFuture work.');

      const state = await deriveState(base);

      assertEq(state.activeMilestone?.id, 'M001', 'M001 is active');
      assertEq(
        state.registry[1]?.title,
        'Pending Feature',
        'pending milestone title extracted from CONTEXT.md'
      );
      assertEq(state.registry[1]?.status, 'pending', 'M005 is pending');
    } finally {
      cleanup(base);
    }
  }

  // ─── Test: Parked milestone without roadmap gets context title ─────────
  console.log('\n=== parked milestone without roadmap → context title ===');
  {
    const base = createFixtureBase();
    try {
      writeContext(base, 'M003', '# M003: Parked Feature\n\nParked context.');
      writeParked(base, 'M003');

      // Need at least one active milestone for valid state
      mkdirSync(join(base, '.gsd', 'milestones', 'M001'), { recursive: true });

      const state = await deriveState(base);

      const parkedEntry = state.registry.find(e => e.id === 'M003');
      assertEq(parkedEntry?.status, 'parked', 'M003 is parked');
      assertEq(
        parkedEntry?.title,
        'Parked Feature',
        'parked milestone title extracted from CONTEXT.md'
      );
    } finally {
      cleanup(base);
    }
  }

  // ─── Test: No heading in CONTEXT.md falls back to bare ID ─────────────
  console.log('\n=== CONTEXT.md without heading → falls back to bare ID ===');
  {
    const base = createFixtureBase();
    try {
      writeContext(base, 'M005', 'No heading here.\n\nJust body text.');

      const state = await deriveState(base);

      assertEq(
        state.activeMilestone?.title,
        'M005',
        'falls back to bare ID when no h1 heading'
      );
      assertEq(
        state.registry[0]?.title,
        'M005',
        'registry falls back to bare ID'
      );
    } finally {
      cleanup(base);
    }
  }

  // ─── Test: Multi-milestone with mixed title sources ────────────────────
  console.log('\n=== multi-milestone: complete + context-only + pending ===');
  {
    const base = createFixtureBase();
    try {
      // M001: complete (roadmap + summary)
      writeRoadmap(base, 'M001', `# M001: First Milestone

**Vision:** Done.

## Slices

- [x] **S01: Done** \`risk:low\` \`depends:[]\`
  > After this: Done.
`);
      writeMilestoneValidation(base, 'M001');
      writeMilestoneSummary(base, 'M001', '# M001 Summary\n\nComplete.');

      // M005: CONTEXT.md only → should be active with extracted title
      writeContext(base, 'M005', '# M005: Platform Foundation\n\nContext body.');

      // M010: CONTEXT-DRAFT only → should be pending with extracted title
      writeContextDraft(base, 'M010', '# M010: Future Work\n\nDraft body.');

      const state = await deriveState(base);

      assertEq(state.activeMilestone?.id, 'M005', 'M005 is active');
      assertEq(
        state.activeMilestone?.title,
        'Platform Foundation',
        'active milestone title from CONTEXT.md'
      );
      assertEq(state.registry[0]?.status, 'complete', 'M001 is complete');

      const m010 = state.registry.find(e => e.id === 'M010');
      assertEq(m010?.status, 'pending', 'M010 is pending');
      assertEq(
        m010?.title,
        'Future Work',
        'pending milestone title extracted from CONTEXT-DRAFT.md'
      );
    } finally {
      cleanup(base);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  report();
}

main().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
