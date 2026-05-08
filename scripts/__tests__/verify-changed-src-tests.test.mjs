// Project/App: GSD-2
// File Purpose: Unit tests for changed-source focused test selection.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNodeTestArgs,
  candidateTestsForSource,
  isSourceCandidate,
  isTestFile,
  parseArgs,
  selectChangedSrcTests,
} from '../verify-changed-src-tests.mjs';

test('isSourceCandidate accepts source files and skips integration and declarations', () => {
  assert.equal(isSourceCandidate('src/foo.ts'), true);
  assert.equal(isSourceCandidate('src/resources/extensions/gsd/auto-prompts.ts'), true);
  assert.equal(isSourceCandidate('src/tests/integration/web.test.ts'), false);
  assert.equal(isSourceCandidate('src/foo.d.ts'), false);
  assert.equal(isSourceCandidate('web/lib/store.ts'), false);
});

test('isTestFile recognizes node test naming', () => {
  assert.equal(isTestFile('src/tests/foo.test.ts'), true);
  assert.equal(isTestFile('src/resources/extensions/gsd/tests/foo.test.mjs'), true);
  assert.equal(isTestFile('src/foo.ts'), false);
});

test('candidateTestsForSource prefers nearby extension and root src test candidates', () => {
  assert.deepEqual(
    candidateTestsForSource('src/resources/extensions/gsd/auto-prompts.ts'),
    [
      'src/resources/extensions/gsd/tests/auto-prompts.test.ts',
      'src/resources/extensions/gsd/tests/auto-prompts.test.mjs',
      'src/resources/extensions/gsd/auto-prompts.test.ts',
      'src/resources/extensions/gsd/auto-prompts.test.mjs',
      'src/tests/auto-prompts.test.ts',
      'src/tests/auto-prompts.test.mjs',
    ],
  );
});

test('selectChangedSrcTests returns existing focused tests and uncovered source files', () => {
  const existing = new Set([
    'src/resources/extensions/gsd/tests/auto-prompts.test.ts',
    'src/tests/token-counter.test.ts',
  ]);
  const exists = (path) => {
    const normalized = path.replaceAll('\\', '/');
    return [...existing].some(file => normalized.endsWith(file));
  };

  const selection = selectChangedSrcTests([
    'src/resources/extensions/gsd/auto-prompts.ts',
    'src/token-counter.ts',
    'src/no-direct-test.ts',
    'src/tests/already.test.ts',
    'README.md',
  ], exists);

  assert.deepEqual(selection.tests, [
    'src/resources/extensions/gsd/tests/auto-prompts.test.ts',
    'src/tests/token-counter.test.ts',
  ]);
  assert.deepEqual(selection.uncovered, ['src/no-direct-test.ts']);
});

test('buildNodeTestArgs keeps the shared TypeScript loader', () => {
  assert.deepEqual(
    buildNodeTestArgs(['dist-test/src/tests/token-counter.test.js']),
    [
      '--import',
      './src/resources/extensions/gsd/tests/resolve-ts.mjs',
      '--experimental-strip-types',
      '--test',
      'dist-test/src/tests/token-counter.test.js',
    ],
  );
});

test('parseArgs treats --since as a base revision alias', () => {
  assert.deepEqual(
    parseArgs(['--since', 'HEAD~2', '--files', 'src/token-counter.ts,src/tests/token-counter.test.ts']),
    {
      files: ['src/token-counter.ts', 'src/tests/token-counter.test.ts'],
      list: false,
      base: 'HEAD~2',
    },
  );
  assert.equal(parseArgs(['--since=origin/main']).base, 'origin/main');
});
