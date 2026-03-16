import { createTestContext } from './test-helpers.ts';
import {
  openDatabase,
  closeDatabase,
  isDbAvailable,
  insertDecision,
  insertRequirement,
  insertArtifact,
} from '../gsd-db.ts';
import {
  inlineDecisionsFromDb,
  inlineRequirementsFromDb,
  inlineProjectFromDb,
} from '../auto-prompts.ts';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { assertEq, assertTrue, assertMatch, report } = createTestContext();

// Create a temp directory with .gsd structure for filesystem fallback testing
const tmpBase = join(tmpdir(), `prompt-db-test-${Date.now()}`);
const gsdDir = join(tmpBase, '.gsd');
mkdirSync(gsdDir, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════════
// inlineDecisionsFromDb: falls back to filesystem when DB unavailable
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== inlineDecisionsFromDb: filesystem fallback when DB closed ===');
{
  closeDatabase();
  assertTrue(!isDbAvailable(), 'DB should not be available');

  // No file exists → returns null
  const result = await inlineDecisionsFromDb(tmpBase);
  assertEq(result, null, 'returns null when DB closed and no file');

  // Create decisions file for fallback
  writeFileSync(join(gsdDir, 'DECISIONS.md'), '# Decisions\n\n| # | test |');
  const withFile = await inlineDecisionsFromDb(tmpBase);
  assertTrue(withFile !== null, 'returns content when DB closed but file exists');
  assertMatch(withFile!, /### Decisions/, 'fallback wraps with Decisions heading');
  assertMatch(withFile!, /test/, 'fallback includes file content');
}

// ═══════════════════════════════════════════════════════════════════════════
// inlineDecisionsFromDb: returns DB content when available
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== inlineDecisionsFromDb: returns scoped DB content ===');
{
  openDatabase(':memory:');
  assertTrue(isDbAvailable(), 'DB should be available');

  insertDecision({
    id: 'D001', when_context: 'M001/S01', scope: 'arch',
    decision: 'use SQLite', choice: 'node:sqlite', rationale: 'built-in',
    revisable: 'yes', superseded_by: null,
  });
  insertDecision({
    id: 'D002', when_context: 'M002/S01', scope: 'arch',
    decision: 'use REST', choice: 'REST', rationale: 'simple',
    revisable: 'no', superseded_by: null,
  });

  // Unscoped — returns all
  const all = await inlineDecisionsFromDb(tmpBase);
  assertTrue(all !== null, 'returns content from DB');
  assertMatch(all!, /### Decisions/, 'DB result has Decisions heading');
  assertMatch(all!, /D001/, 'contains D001');
  assertMatch(all!, /D002/, 'contains D002');
  assertMatch(all!, /Source:.*DECISIONS\.md/, 'has source path');

  // Scoped by milestone — returns only matching
  const scoped = await inlineDecisionsFromDb(tmpBase, 'M001');
  assertTrue(scoped !== null, 'scoped result is not null');
  assertMatch(scoped!, /D001/, 'scoped contains D001');
  // D002 is M002 so should not match M001 scope
  assertTrue(!scoped!.includes('D002'), 'scoped does not contain D002');

  closeDatabase();
}

// ═══════════════════════════════════════════════════════════════════════════
// inlineRequirementsFromDb: filesystem fallback and DB modes
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== inlineRequirementsFromDb: filesystem fallback ===');
{
  closeDatabase();

  const noFile = await inlineRequirementsFromDb(tmpBase);
  assertEq(noFile, null, 'returns null when DB closed and no file');

  writeFileSync(join(gsdDir, 'REQUIREMENTS.md'), '# Requirements\n\n### R001: test');
  const withFile = await inlineRequirementsFromDb(tmpBase);
  assertTrue(withFile !== null, 'returns content from file fallback');
  assertMatch(withFile!, /### Requirements/, 'fallback has Requirements heading');
}

console.log('\n=== inlineRequirementsFromDb: returns DB content with slice scoping ===');
{
  openDatabase(':memory:');

  insertRequirement({
    id: 'R001', class: 'functional', status: 'active',
    description: 'auth flow', why: 'security', source: 'user',
    primary_owner: 'M001/S01', supporting_slices: '',
    validation: 'test', notes: '', full_content: 'R001 content',
    superseded_by: null,
  });
  insertRequirement({
    id: 'R002', class: 'non-functional', status: 'active',
    description: 'perf target', why: 'speed', source: 'user',
    primary_owner: 'M001/S02', supporting_slices: 'M001/S01',
    validation: 'benchmark', notes: '', full_content: 'R002 content',
    superseded_by: null,
  });

  // Unscoped — returns all
  const all = await inlineRequirementsFromDb(tmpBase);
  assertTrue(all !== null, 'returns content from DB');
  assertMatch(all!, /R001/, 'contains R001');
  assertMatch(all!, /R002/, 'contains R002');

  // Scoped by slice S01 — returns R001 (primary) and R002 (supporting)
  const s01 = await inlineRequirementsFromDb(tmpBase, 'S01');
  assertTrue(s01 !== null, 'S01 scoped is not null');
  assertMatch(s01!, /R001/, 'S01 scope matches R001 primary owner');
  assertMatch(s01!, /R002/, 'S01 scope matches R002 supporting_slices');

  // Scoped by slice S02 — returns only R002
  const s02 = await inlineRequirementsFromDb(tmpBase, 'S02');
  assertTrue(s02 !== null, 'S02 scoped is not null');
  assertMatch(s02!, /R002/, 'S02 scope matches R002 primary owner');
  assertTrue(!s02!.includes('R001'), 'S02 scope does not match R001');

  closeDatabase();
}

// ═══════════════════════════════════════════════════════════════════════════
// inlineProjectFromDb: filesystem fallback and DB modes
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== inlineProjectFromDb: filesystem fallback ===');
{
  closeDatabase();

  const noFile = await inlineProjectFromDb(tmpBase);
  assertEq(noFile, null, 'returns null when DB closed and no file');

  writeFileSync(join(gsdDir, 'PROJECT.md'), '# My Project\n\nDescription here');
  const withFile = await inlineProjectFromDb(tmpBase);
  assertTrue(withFile !== null, 'returns content from file fallback');
  assertMatch(withFile!, /### Project/, 'fallback has Project heading');
  assertMatch(withFile!, /Description here/, 'fallback includes file content');
}

console.log('\n=== inlineProjectFromDb: returns DB content ===');
{
  openDatabase(':memory:');

  insertArtifact({
    path: 'PROJECT.md',
    artifact_type: 'project',
    milestone_id: null,
    slice_id: null,
    task_id: null,
    full_content: '# My Project from DB\n\nDB content here',
  });

  const result = await inlineProjectFromDb(tmpBase);
  assertTrue(result !== null, 'returns content from DB');
  assertMatch(result!, /### Project/, 'DB result has Project heading');
  assertMatch(result!, /DB content here/, 'DB result has artifact content');
  assertMatch(result!, /Source:.*PROJECT\.md/, 'has source path');

  closeDatabase();
}

// ═══════════════════════════════════════════════════════════════════════════
// inlineDecisionsFromDb: falls back to file when DB has empty results
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== inlineDecisionsFromDb: file fallback when DB has no matching rows ===');
{
  openDatabase(':memory:');
  // DB is open but has no decisions → should fall back to file
  const result = await inlineDecisionsFromDb(tmpBase);
  assertTrue(result !== null, 'falls back to file when DB returns empty');
  assertMatch(result!, /test/, 'fallback content from DECISIONS.md');

  closeDatabase();
}

// Cleanup
rmSync(tmpBase, { recursive: true, force: true });

report();
