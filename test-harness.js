
import { validateFixtureState, loadFixture } from './src/resources/extensions/gsd/tests/fixture-harness.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const d = mkdtempSync(join(tmpdir(), 'missing-test-'));
const m = loadFixture('mixed-confidence', d);
rmSync(join(d, 'state/slices/S01/factcheck/claims/C001.json'));
const r = validateFixtureState(m, d);
console.log('missing:', r.missingFiles.length > 0, 'files:', r.missingFiles.join(','));
rmSync(d, { recursive: true });
