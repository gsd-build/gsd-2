/**
 * Regression test for DB-authoritative rogue detection.
 *
 * A SUMMARY.md on disk is a projection/diagnostic. Runtime post-unit checks
 * must not use it to mark the DB slice complete; explicit import/recovery
 * commands own markdown-to-DB behavior.
 *
 * This structural test verifies the complete-slice rogue branch reports the
 * stale projection without calling updateSliceStatus().
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractSourceRegion } from "./test-helpers.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const source = readFileSync(join(__dirname, '..', 'auto-post-unit.ts'), 'utf-8');

describe('DB-authoritative slice rogue detection', () => {
  test('updateSliceStatus is not imported for post-unit rogue reconciliation', () => {
    assert.doesNotMatch(source, /import\s*\{[^}]*updateSliceStatus[^}]*\}\s*from\s*["']\.\/gsd-db/,
      'auto-post-unit must not import updateSliceStatus for disk-to-DB reconciliation');
  });

  test('complete-slice rogue branch does not mark DB complete from disk', () => {
    assert.doesNotMatch(source, /updateSliceStatus\(mid,\s*sid,\s*["']complete["']/,
      'SUMMARY.md on disk must not mark slice complete in DB');
  });

  test('explicit rogue diagnostic reports stale slice summary projection', () => {
    const branch = extractSourceRegion(source, 'unitType === "complete-slice"', 'unitType === "plan-milestone"');
    assert.match(branch, /rogues\.push\(\{\s*path:\s*summaryPath,\s*unitType,\s*unitId\s*\}\)/,
      'complete-slice branch should report stale SUMMARY.md as rogue');
  });

  test('post-unit runtime does not call rogue diagnostics automatically', () => {
    const postUnit = extractSourceRegion(source, 'export async function postUnitPostVerification');
    assert.doesNotMatch(postUnit, /detectRogueFileWrites\(/,
      'runtime post-unit path must not scan disk projections for rogue files');
  });
});
