# S03: Fixture Harness — UAT

**Milestone:** M007
**Written:** 2026-03-19

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: The fixture harness is verified through automated tests that exercise all three fixtures through load → validate state → verify telemetry shape. No live runtime required - all verification is deterministic code execution.

## Preconditions

- Node.js 22+ with TypeScript and tsx installed
- No external services required - all tests use in-memory temp directories

## Smoke Test

```bash
npx tsx --test src/resources/extensions/gsd/tests/fixture-e2e.test.ts
```

Expected: 9/9 tests pass (3 fixtures × 3 test cases each)

## Test Cases

### 1. Fixture loading and state integrity

1. Run: `npx tsx --test src/resources/extensions/gsd/tests/fixture-e2e.test.ts`
2. Look for: "should load fixture and validate state integrity" passes for all 3 fixtures (low-unknown, high-unknown, mixed-confidence)
3. **Expected:** All 3 fixture groups report state validity

### 2. Claim mix consistency

1. Run: `npx tsx --test src/resources/extensions/gsd/tests/fixture-e2e.test.ts`
2. Look for: "should have consistent claim mix" passes for all 3 fixtures
3. **Expected:** Manifest claimMix.total matches claims array length for each fixture

### 3. Metrics extraction round-trip

1. Run: `npx tsx --test src/resources/extensions/gsd/tests/fixture-e2e.test.ts`
2. Look for: "should support synthetic metrics round-trip" passes for all 3 fixtures
3. **Expected:** Synthetic dispatch-metrics.jsonl written, read back with readMetricsJsonl, telemetry shape matches manifest expectedTelemetryShape

### 4. Third fixture (mixed-confidence) exists

1. Run: `test -f src/resources/extensions/gsd/tests/fixtures/concepts/mixed-confidence/FIXTURE-MANIFEST.json && echo PASS`
2. **Expected:** PASS

### 5. Failure path - missing file detection

1. Run:
```bash
npx tsx -e "
import { validateFixtureState, loadFixture } from './src/resources/extensions/gsd/tests/fixture-harness.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const d = mkdtempSync(join(tmpdir(), 'missing-test-'));
const m = loadFixture('mixed-confidence', d);
rmSync(join(d, 'state/slices/S01/factcheck/claims/C001.json'));
const r = validateFixtureState(m, d);
console.log('missing:', r.missingFiles.length > 0, 'files:', r.missingFiles.join(','));
rmSync(d, { recursive: true, force: true });
"
```

2. **Expected:** `missing: true files: state/slices/S01/factcheck/claims/C001.json`

### 6. Valid state returns true

1. Run:
```bash
npx tsx -e "
import { validateFixtureState, loadFixture } from './src/resources/extensions/gsd/tests/fixture-harness.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const d = mkdtempSync(join(tmpdir(), 'valid-test-'));
const m = loadFixture('mixed-confidence', d);
const r = validateFixtureState(m, d);
console.log('valid:', r.valid, 'missing count:', r.missingFiles.length);
rmSync(d, { recursive: true, force: true });
"
```

2. **Expected:** `valid: true missing count: 0`

## Edge Cases

### Empty fixture directory

1. Create an empty temp directory
2. Try to load a non-existent fixture: `loadFixture('nonexistent', '/tmp/empty-dir')`
3. **Expected:** Throws error with fixture ID

### Corrupted manifest JSON

1. Write a fixture manifest with invalid JSON
2. Try to read it: `readFixtureManifest('corrupted')`
3. **Expected:** Throws JSON parse error

## Failure Signals

- Test failures in fixture-e2e.test.ts indicate fixture loading or validation issues
- validateFixtureState returning valid: false with missingFiles array indicates incomplete fixture state
- Metrics extraction failures indicate readMetricsJsonl or expectedTelemetryShape mismatch

## Not Proven By This UAT

- Live runtime execution with actual auto-dispatch - the fixture harness provides deterministic test fixtures, but doesn't execute the full dispatch pipeline
- Performance under load - fixture harness is tested for correctness, not throughput

## Notes for Tester

- The test runner must be `npx tsx --test` (not `node --test`) due to module resolution requirements (K007)
- All fixtures use synthetic data - no real project or external services involved
- The three fixtures represent different claim mix profiles:
  - low-unknown: mostly confirmed claims
  - high-unknown: mostly refuted claims
  - mixed-confidence: balanced mix (2 confirmed, 1 refuted, 1 inconclusive)
