// Tests for extractUatType — the core UAT classification primitive — plus
// prompt template loading and dispatch precondition assertions (via
// resolveSliceFile / extractUatType on real fixture files).
//
// Sections:
//   (a)–(j)  extractUatType classification (17 assertions from T01)
//   (k)      run-uat prompt template loading and content integrity (8 assertions)
//   (l)      dispatch precondition assertions via resolveSliceFile (4 assertions)
//   (m)      non-artifact UAT skip: human-experience UATs are not dispatched (1 assertion)
//   (n)      stale replay guard: existing UAT-RESULT never re-dispatches (1 assertion)

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { extractUatType } from '../files.ts';
import { resolveSliceFile } from '../paths.ts';
import { checkNeedsRunUat } from '../auto-prompts.ts';
// ─── Worktree-aware prompt loader ──────────────────────────────────────────
// Resolves prompts relative to this test file so the worktree copy is used
// instead of the main checkout copy (matches complete-milestone.test.ts pattern).

const __dirname = dirname(fileURLToPath(import.meta.url));
const worktreePromptsDir = join(__dirname, '..', 'prompts');

function loadPromptFromWorktree(name: string, vars: Record<string, string> = {}): string {
  const path = join(worktreePromptsDir, `${name}.md`);
  let content = readFileSync(path, 'utf-8');
  const effectiveVars = {
    skillActivation: 'If no installed skill clearly matches this unit, skip explicit skill activation and continue with the required workflow.',
    ...vars,
  };
  for (const [key, value] of Object.entries(effectiveVars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content.trim();
}


// ─── Fixture helpers ───────────────────────────────────────────────────────

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-run-uat-test-'));
  mkdirSync(join(base, '.gsd', 'milestones'), { recursive: true });
  return base;
}

function writeSliceFile(
  base: string,
  mid: string,
  sid: string,
  suffix: string,
  content: string,
): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sid}-${suffix}.md`), content);
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

function makeUatContent(mode: string): string {
  return `# UAT File\n\n## UAT Type\n\n- UAT mode: ${mode}\n- Some other bullet: value\n`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

  // ─── (a) artifact-driven ──────────────────────────────────────────────────

describe('run-uat', () => {
test('(a) artifact-driven', () => {
  assert.deepStrictEqual(
});

    extractUatType(makeUatContent('artifact-driven')),
    'artifact-driven',
    'plain artifact-driven → artifact-driven',
  );
  assert.deepStrictEqual(
    extractUatType('## UAT Type\n\n- UAT mode: artifact-driven\n'),
    'artifact-driven',
    'minimal content, artifact-driven',
  );
  // ─── (b) live-runtime ─────────────────────────────────────────────────────
test('(b) live-runtime', () => {
  assert.deepStrictEqual(
});

    extractUatType(makeUatContent('live-runtime')),
    'live-runtime',
    'plain live-runtime → live-runtime',
  );
  // ─── (c) human-experience ─────────────────────────────────────────────────
test('(c) human-experience', () => {
  assert.deepStrictEqual(
});

    extractUatType(makeUatContent('human-experience')),
    'human-experience',
    'plain human-experience → human-experience',
  );
  // ─── (d) mixed standalone ─────────────────────────────────────────────────
test('(d) mixed standalone', () => {
  assert.deepStrictEqual(
});

    extractUatType(makeUatContent('mixed')),
    'mixed',
    'plain mixed → mixed',
  );
  // ─── (e) mixed with parenthetical ─────────────────────────────────────────
test('(e) mixed parenthetical', () => {
  assert.deepStrictEqual(
});

    extractUatType(makeUatContent('mixed (artifact-driven + live-runtime)')),
    'mixed',
    'mixed (artifact-driven + live-runtime) → mixed (leading keyword only)',
  );
  assert.deepStrictEqual(
    extractUatType(makeUatContent('mixed (some other description)')),
    'mixed',
    'mixed with arbitrary parenthetical → mixed',
  );
  // ─── (f) missing ## UAT Type section ──────────────────────────────────────
test('(f) missing UAT Type section', () => {
  assert.deepStrictEqual(
});

    extractUatType('# UAT File\n\n## Overview\n\nSome content.\n'),
    undefined,
    'no ## UAT Type section → undefined',
  );
  assert.deepStrictEqual(
    extractUatType(''),
    undefined,
    'empty content → undefined',
  );
  // ─── (g) ## UAT Type present but no UAT mode: bullet ─────────────────────
test('(g) UAT Type section present, no UAT mode: bullet', () => {
  assert.deepStrictEqual(
});

    extractUatType('## UAT Type\n\n- Some other bullet: value\n- Another bullet\n'),
    undefined,
    'section present but no UAT mode: bullet → undefined',
  );
  assert.deepStrictEqual(
    extractUatType('## UAT Type\n\n'),
    undefined,
    'section present but empty → undefined',
  );
  // ─── (h) unknown keyword ──────────────────────────────────────────────────
test('(h) unknown keyword', () => {
  assert.deepStrictEqual(
});

    extractUatType(makeUatContent('automated')),
    undefined,
    'unknown keyword automated → undefined',
  );
  assert.deepStrictEqual(
    extractUatType(makeUatContent('fully-automated')),
    undefined,
    'unknown keyword fully-automated → undefined',
  );
  // ─── (i) extra whitespace around value ────────────────────────────────────
test('(i) extra whitespace', () => {
  assert.deepStrictEqual(
});

    extractUatType('## UAT Type\n\n- UAT mode:   artifact-driven   \n'),
    'artifact-driven',
    'leading/trailing whitespace around value → still classified correctly',
  );
  assert.deepStrictEqual(
    extractUatType('## UAT Type\n\n- UAT mode:  mixed (artifact-driven + live-runtime)  \n'),
    'mixed',
    'whitespace around mixed parenthetical → mixed',
  );
  // ─── (j) case sensitivity ─────────────────────────────────────────────────
test('(j) case sensitivity', () => {
  assert.deepStrictEqual(
});

    extractUatType(makeUatContent('Artifact-Driven')),
    'artifact-driven',
    'Artifact-Driven (title case) → artifact-driven (function lowercases before matching)',
  );
  assert.deepStrictEqual(
    extractUatType(makeUatContent('MIXED')),
    'mixed',
    'MIXED (upper case) → mixed (function lowercases before matching)',
  );
  // ─── (k) prompt template loading and content integrity ────────────────────
test('(k) run-uat prompt template', () => {
  const milestoneId = 'M001';
});

  const sliceId = 'S01';
  const uatPath = '.gsd/milestones/M001/slices/S01/S01-UAT.md';
  const uatResultPath = '.gsd/milestones/M001/slices/S01/S01-UAT-RESULT.md';
  const uatType = 'live-runtime';
  const inlinedContext = '<!-- no context -->';
  let promptResult: string | undefined;
  let promptThrew = false;
  try {
    promptResult = loadPromptFromWorktree('run-uat', {
      workingDirectory: '/tmp/test-project',
      milestoneId,
      sliceId,
      uatPath,
      uatResultPath,
      uatType,
      inlinedContext,
    });
  } catch {
    promptThrew = true;
  }
  assert.ok(!promptThrew, 'loadPromptFromWorktree("run-uat", vars) does not throw');
  assert.ok(
    typeof promptResult === 'string' && promptResult.length > 0,
    'run-uat prompt result is a non-empty string',
  );
  assert.ok(
    promptResult?.includes(milestoneId) ?? false,
    `prompt contains milestoneId value "${milestoneId}" after substitution`,
  );
  assert.ok(
    promptResult?.includes(sliceId) ?? false,
    `prompt contains sliceId value "${sliceId}" after substitution`,
  );
  assert.ok(
    promptResult?.includes(uatResultPath) ?? false,
    `prompt contains uatResultPath value after substitution`,
  );
  assert.ok(
    promptResult?.includes(`Detected UAT mode:** \`${uatType}\``) ?? false,
    `prompt contains detected dynamic uatType value "${uatType}" after substitution`,
  );
  assert.ok(
    promptResult?.includes(`uatType: ${uatType}`) ?? false,
    `prompt contains dynamic uatType frontmatter value "${uatType}" after substitution`,
  );
  assert.ok(
    !/\{\{[^}]+\}\}/.test(promptResult ?? ''),
    'no unreplaced {{...}} tokens remain after variable substitution',
  );
  assert.ok(
    /browser|runtime|execute|run/i.test(promptResult ?? ''),
    'prompt contains runtime execution language (browser/runtime/execute/run)',
  );
  assert.ok(
    !/surfaced for human review/i.test(promptResult ?? ''),
    'prompt does not contain "surfaced for human review" (non-artifact UATs are skipped, not dispatched)',
  );
  // ─── (l) dispatch precondition assertions via resolveSliceFile ────────────
test('(l) dispatch preconditions via resolveSliceFile', () => {
  // State A: UAT file exists, UAT-RESULT file does NOT — triggers dispatch
    const base = createFixtureBase();
    const uatContent = makeUatContent('artifact-driven');
    try {
      writeSliceFile(base, 'M001', 'S01', 'UAT', uatContent);

      const uatFilePath = resolveSliceFile(base, 'M001', 'S01', 'UAT');
      assert.ok(
        uatFilePath !== null,
        'resolveSliceFile(..., "UAT") returns non-null when UAT file exists (dispatch trigger state)',
      );

      const uatResultFilePath = resolveSliceFile(base, 'M001', 'S01', 'UAT-RESULT');
      assert.deepStrictEqual(
        uatResultFilePath,
        null,
        'resolveSliceFile(..., "UAT-RESULT") returns null when result file missing (dispatch trigger state)',
      );

      // End-to-end: file content → parse → classify
      const rawContent = readFileSync(uatFilePath!, 'utf-8');
      assert.deepStrictEqual(
        extractUatType(rawContent),
        'artifact-driven',
        'extractUatType on fixture UAT file returns expected type (end-to-end data flow)',
      );
    } finally {
      cleanup(base);
    }
});

  // State B: UAT-RESULT file exists — dispatch is skipped (idempotent)
test('test block at line 307', () => {
    const base = createFixtureBase();
    try {
      writeSliceFile(base, 'M001', 'S01', 'UAT', makeUatContent('artifact-driven'));
      writeSliceFile(base, 'M001', 'S01', 'UAT-RESULT', '# UAT Result\n\nverdict: PASS\n');

      const uatResultFilePath = resolveSliceFile(base, 'M001', 'S01', 'UAT-RESULT');
      assert.ok(
        uatResultFilePath !== null,
        'resolveSliceFile(..., "UAT-RESULT") returns non-null when result file exists (idempotent skip state)',
      );
    } finally {
      cleanup(base);
    }
});

  // ─── (m) non-artifact UATs are skipped (not dispatched) ─────────────────
test('(m) non-artifact UAT skip', async () => {
    const base = createFixtureBase();
    try {
      const roadmapDir = join(base, '.gsd', 'milestones', 'M001');
      mkdirSync(roadmapDir, { recursive: true });
      writeFileSync(
        join(roadmapDir, 'M001-ROADMAP.md'),
        [
          '# M001: Test roadmap',
          '',
          '## Slices',
          '',
          '- [x] **S01: First slice** `risk:low` `depends:[]`',
          '- [ ] **S02: Next slice** `risk:low` `depends:[S01]`',
          '',
          '## Boundary Map',
          '',
        ].join('\n'),
      );

      // human-experience UAT still dispatches, but auto-mode later pauses for manual review
      writeSliceFile(base, 'M001', 'S01', 'UAT', makeUatContent('human-experience'));

      const state = {
        activeMilestone: { id: 'M001', title: 'Test roadmap' },
        activeSlice: { id: 'S02', title: 'Next slice' },
        activeTask: null,
        phase: 'planning',
        recentDecisions: [],
        blockers: [],
        nextAction: 'Plan S02',
        registry: [],
      } as const;

      const result = await checkNeedsRunUat(base, 'M001', state as any, { uat_dispatch: true } as any);
      assert.deepStrictEqual(
        result,
        { sliceId: 'S01', uatType: 'human-experience' },
        'human-experience UAT dispatches so auto-mode can pause for manual review',
      );
    } finally {
      cleanup(base);
    }
});

  // ─── (n) existing UAT-RESULT never re-dispatches ──────────────────────
test('(n) stale replay guard', async () => {
    const base = createFixtureBase();
    try {
      const roadmapDir = join(base, '.gsd', 'milestones', 'M001');
      mkdirSync(roadmapDir, { recursive: true });
      writeFileSync(
        join(roadmapDir, 'M001-ROADMAP.md'),
        [
          '# M001: Test roadmap',
          '',
          '## Slices',
          '',
          '- [x] **S01: First slice** `risk:low` `depends:[]`',
          '- [ ] **S02: Next slice** `risk:low` `depends:[S01]`',
          '',
          '## Boundary Map',
          '',
        ].join('\n'),
      );

      writeSliceFile(base, 'M001', 'S01', 'UAT', makeUatContent('artifact-driven'));
      writeSliceFile(base, 'M001', 'S01', 'UAT-RESULT', '---\nverdict: FAIL\n---\n');

      const state = {
        activeMilestone: { id: 'M001', title: 'Test roadmap' },
        activeSlice: { id: 'S02', title: 'Next slice' },
        activeTask: null,
        phase: 'planning',
        recentDecisions: [],
        blockers: [],
        nextAction: 'Plan S02',
        registry: [],
      } as const;

      const result = await checkNeedsRunUat(base, 'M001', state as any, { uat_dispatch: true } as any);
      assert.deepStrictEqual(
        result,
        null,
        'existing UAT-RESULT with FAIL verdict does not re-dispatch; verdict gate owns blocking',
      );
    } finally {
      cleanup(base);
    }
});

});
