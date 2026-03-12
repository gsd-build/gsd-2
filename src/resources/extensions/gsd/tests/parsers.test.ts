import { parseRoadmap, parsePlan, parseSummary, parseContinue, parseRequirementCounts } from '../files.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// parseRoadmap tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseRoadmap: full roadmap ===');
{
  const content = `# M001: GSD Extension — Hierarchical Planning

**Vision:** Build a structured planning system for coding agents.

**Success Criteria:**
- All parsers have test coverage
- Round-trip formatting preserves data
- State derivation works correctly

---

## Slices

- [x] **S01: Types + File I/O** \`risk:low\` \`depends:[]\`
  > After this: All types defined and parsers work.

- [ ] **S02: State Derivation** \`risk:medium\` \`depends:[S01]\`
  > After this: Dashboard shows real-time state.

- [ ] **S03: Auto Mode** \`risk:high\` \`depends:[S01, S02]\`
  > After this: Agent can execute tasks automatically.

---

## Boundary Map

### S01 → S02
\`\`\`
Produces:
  types.ts — all type definitions
  files.ts — parser and formatter functions

Consumes from S02:
  nothing
\`\`\`

### S02 → S03
\`\`\`
Produces:
  state.ts — deriveState function

Consumes from S03:
  auto-mode entry points
\`\`\`
`;

  const r = parseRoadmap(content);

  assertEq(r.title, 'M001: GSD Extension — Hierarchical Planning', 'roadmap title');
  assertEq(r.vision, 'Build a structured planning system for coding agents.', 'roadmap vision');
  assertEq(r.successCriteria.length, 3, 'success criteria count');
  assertEq(r.successCriteria[0], 'All parsers have test coverage', 'first success criterion');
  assertEq(r.successCriteria[2], 'State derivation works correctly', 'third success criterion');

  // Slices
  assertEq(r.slices.length, 3, 'slice count');

  assertEq(r.slices[0].id, 'S01', 'S01 id');
  assertEq(r.slices[0].title, 'Types + File I/O', 'S01 title');
  assertEq(r.slices[0].risk, 'low', 'S01 risk');
  assertEq(r.slices[0].depends, [], 'S01 depends');
  assertEq(r.slices[0].done, true, 'S01 done');
  assertEq(r.slices[0].demo, 'All types defined and parsers work.', 'S01 demo');

  assertEq(r.slices[1].id, 'S02', 'S02 id');
  assertEq(r.slices[1].title, 'State Derivation', 'S02 title');
  assertEq(r.slices[1].risk, 'medium', 'S02 risk');
  assertEq(r.slices[1].depends, ['S01'], 'S02 depends');
  assertEq(r.slices[1].done, false, 'S02 done');

  assertEq(r.slices[2].id, 'S03', 'S03 id');
  assertEq(r.slices[2].risk, 'high', 'S03 risk');
  assertEq(r.slices[2].depends, ['S01', 'S02'], 'S03 depends');
  assertEq(r.slices[2].done, false, 'S03 done');

  // Boundary map
  assertEq(r.boundaryMap.length, 2, 'boundary map entry count');
  assertEq(r.boundaryMap[0].fromSlice, 'S01', 'bm[0] from');
  assertEq(r.boundaryMap[0].toSlice, 'S02', 'bm[0] to');
  assert(r.boundaryMap[0].produces.includes('types.ts'), 'bm[0] produces mentions types.ts');
  assertEq(r.boundaryMap[1].fromSlice, 'S02', 'bm[1] from');
  assertEq(r.boundaryMap[1].toSlice, 'S03', 'bm[1] to');
}

console.log('\n=== parseRoadmap: empty slices section ===');
{
  const content = `# M002: Empty Milestone

**Vision:** Nothing yet.

## Slices

## Boundary Map
`;

  const r = parseRoadmap(content);
  assertEq(r.title, 'M002: Empty Milestone', 'title with empty slices');
  assertEq(r.slices.length, 0, 'no slices parsed');
  assertEq(r.boundaryMap.length, 0, 'no boundary map entries');
}

console.log('\n=== parseRoadmap: malformed checkbox lines ===');
{
  // Lines that don't match the expected bold pattern should be skipped
  const content = `# M003: Malformed

**Vision:** Test malformed lines.

## Slices

- [ ] S01: Missing bold markers \`risk:low\` \`depends:[]\`
- [x] **S02: Valid Slice** \`risk:medium\` \`depends:[]\`
  > After this: Works.
- [ ] Not a checkbox at all
  Some random text
- [x] **S03: Another Valid** \`risk:high\` \`depends:[S02]\`
  > After this: Also works.
`;

  const r = parseRoadmap(content);
  // Only S02 and S03 should be parsed (malformed lines without bold markers are skipped)
  assertEq(r.slices.length, 2, 'only valid slices parsed from malformed input');
  assertEq(r.slices[0].id, 'S02', 'first valid slice is S02');
  assertEq(r.slices[0].done, true, 'S02 done');
  assertEq(r.slices[1].id, 'S03', 'second valid slice is S03');
  assertEq(r.slices[1].depends, ['S02'], 'S03 depends on S02');
}

console.log('\n=== parseRoadmap: lowercase vs uppercase X for done ===');
{
  const content = `# M004: Case Test

**Vision:** Test X case sensitivity.

## Slices

- [x] **S01: Lowercase x** \`risk:low\` \`depends:[]\`
  > After this: done.

- [X] **S02: Uppercase X** \`risk:low\` \`depends:[]\`
  > After this: also done.

- [ ] **S03: Not Done** \`risk:low\` \`depends:[]\`
  > After this: not yet.
`;

  const r = parseRoadmap(content);
  assertEq(r.slices.length, 3, 'all three slices parsed');
  assertEq(r.slices[0].done, true, 'lowercase x is done');
  assertEq(r.slices[1].done, true, 'uppercase X is done');
  assertEq(r.slices[2].done, false, 'space is not done');
}

console.log('\n=== parseRoadmap: missing boundary map ===');
{
  const content = `# M005: No Boundary Map

**Vision:** A roadmap without a boundary map section.

**Success Criteria:**
- One criterion

---

## Slices

- [ ] **S01: Only Slice** \`risk:low\` \`depends:[]\`
  > After this: Done.
`;

  const r = parseRoadmap(content);
  assertEq(r.title, 'M005: No Boundary Map', 'title');
  assertEq(r.slices.length, 1, 'one slice');
  assertEq(r.boundaryMap.length, 0, 'empty boundary map when section missing');
  assertEq(r.successCriteria.length, 1, 'one success criterion');
}

console.log('\n=== parseRoadmap: no sections at all ===');
{
  const content = `# M006: Bare Minimum

Just a title and nothing else.
`;

  const r = parseRoadmap(content);
  assertEq(r.title, 'M006: Bare Minimum', 'title from bare roadmap');
  assertEq(r.vision, '', 'empty vision');
  assertEq(r.successCriteria.length, 0, 'no success criteria');
  assertEq(r.slices.length, 0, 'no slices');
  assertEq(r.boundaryMap.length, 0, 'no boundary map');
}

console.log('\n=== parseRoadmap: slice with no demo blockquote ===');
{
  const content = `# M007: No Demo

**Vision:** Testing slices without demo lines.

## Slices

- [ ] **S01: No Demo Here** \`risk:medium\` \`depends:[]\`
- [ ] **S02: Also No Demo** \`risk:low\` \`depends:[S01]\`
`;

  const r = parseRoadmap(content);
  assertEq(r.slices.length, 2, 'two slices without demos');
  assertEq(r.slices[0].demo, '', 'S01 demo empty');
  assertEq(r.slices[1].demo, '', 'S02 demo empty');
}

console.log('\n=== parseRoadmap: missing risk defaults to low ===');
{
  const content = `# M008: Default Risk

**Vision:** Test default risk.

## Slices

- [ ] **S01: No Risk Tag** \`depends:[]\`
  > After this: done.
`;

  const r = parseRoadmap(content);
  assertEq(r.slices.length, 1, 'one slice');
  assertEq(r.slices[0].risk, 'low', 'default risk is low');
}

// ═══════════════════════════════════════════════════════════════════════════
// parsePlan tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parsePlan: full plan ===');
{
  const content = `# S01: Parser Test Suite

**Goal:** All 5 parsers have test coverage with edge cases.
**Demo:** \`node --test tests/parsers.test.ts\` passes with zero failures.

## Must-Haves

- parseRoadmap tests cover happy path and edge cases
- parsePlan tests cover happy path and edge cases
- All existing tests still pass

## Tasks

- [ ] **T01: Test parseRoadmap and parsePlan** \`est:45m\`
  Create tests/parsers.test.ts with comprehensive tests for the two most complex parsers.

- [x] **T02: Test parseSummary and parseContinue** \`est:35m\`
  Extend tests/parsers.test.ts with tests for the remaining parsers.

## Files Likely Touched

- \`tests/parsers.test.ts\` — new test file
- \`types.ts\` — add observability_surfaces
- \`files.ts\` — update parseSummary
`;

  const p = parsePlan(content);

  assertEq(p.id, 'S01', 'plan id');
  assertEq(p.title, 'Parser Test Suite', 'plan title');
  assertEq(p.goal, 'All 5 parsers have test coverage with edge cases.', 'plan goal');
  assertEq(p.demo, '`node --test tests/parsers.test.ts` passes with zero failures.', 'plan demo');

  // Must-haves
  assertEq(p.mustHaves.length, 3, 'must-have count');
  assertEq(p.mustHaves[0], 'parseRoadmap tests cover happy path and edge cases', 'first must-have');

  // Tasks
  assertEq(p.tasks.length, 2, 'task count');

  assertEq(p.tasks[0].id, 'T01', 'T01 id');
  assertEq(p.tasks[0].title, 'Test parseRoadmap and parsePlan', 'T01 title');
  assertEq(p.tasks[0].done, false, 'T01 not done');
  assert(p.tasks[0].description.includes('comprehensive tests'), 'T01 description content');

  assertEq(p.tasks[1].id, 'T02', 'T02 id');
  assertEq(p.tasks[1].title, 'Test parseSummary and parseContinue', 'T02 title');
  assertEq(p.tasks[1].done, true, 'T02 done');

  // Files likely touched
  assertEq(p.filesLikelyTouched.length, 3, 'files likely touched count');
  assert(p.filesLikelyTouched[0].includes('tests/parsers.test.ts'), 'first file');
}

console.log('\n=== parsePlan: multi-line task description concatenation ===');
{
  const content = `# S02: Multi-line Test

**Goal:** Test multi-line descriptions.
**Demo:** Descriptions are concatenated.

## Must-Haves

- Multi-line works

## Tasks

- [ ] **T01: Multi-line Task** \`est:30m\`
  First line of description.
  Second line of description.
  Third line of description.

- [ ] **T02: Single Line** \`est:10m\`
  Just one line.

## Files Likely Touched

- \`foo.ts\`
`;

  const p = parsePlan(content);

  assertEq(p.tasks.length, 2, 'two tasks');
  // Multi-line descriptions should be concatenated with spaces
  assert(p.tasks[0].description.includes('First line'), 'T01 desc has first line');
  assert(p.tasks[0].description.includes('Second line'), 'T01 desc has second line');
  assert(p.tasks[0].description.includes('Third line'), 'T01 desc has third line');
  // Verify concatenation with space separator
  assert(p.tasks[0].description.includes('description. Second'), 'lines joined with space');

  assertEq(p.tasks[1].description, 'Just one line.', 'T02 single-line desc');
}

console.log('\n=== parsePlan: task with missing estimate ===');
{
  const content = `# S03: No Estimate

**Goal:** Handle tasks without estimates.
**Demo:** Parser doesn't crash.

## Tasks

- [ ] **T01: No Estimate Task**
  A task without an estimate backtick.

- [ ] **T02: Has Estimate** \`est:20m\`
  This one has an estimate.
`;

  const p = parsePlan(content);

  assertEq(p.tasks.length, 2, 'two tasks parsed');
  assertEq(p.tasks[0].id, 'T01', 'T01 id');
  assertEq(p.tasks[0].title, 'No Estimate Task', 'T01 title without estimate');
  assertEq(p.tasks[0].done, false, 'T01 not done');
  // The estimate backtick text appears in description if present, but parser doesn't crash without it
  assertEq(p.tasks[1].id, 'T02', 'T02 id');
}

console.log('\n=== parsePlan: empty tasks section ===');
{
  const content = `# S04: Empty Tasks

**Goal:** No tasks yet.
**Demo:** Nothing.

## Must-Haves

- Something

## Tasks

## Files Likely Touched

- \`nothing.ts\`
`;

  const p = parsePlan(content);

  assertEq(p.id, 'S04', 'plan id with empty tasks');
  assertEq(p.tasks.length, 0, 'no tasks');
  assertEq(p.mustHaves.length, 1, 'one must-have');
  assertEq(p.filesLikelyTouched.length, 1, 'one file');
}

console.log('\n=== parsePlan: no H1 ===');
{
  const content = `**Goal:** A plan without a heading.
**Demo:** Still parses.

## Tasks

- [ ] **T01: Orphan Task** \`est:5m\`
  A task in a headingless plan.
`;

  const p = parsePlan(content);

  assertEq(p.id, '', 'empty id without H1');
  assertEq(p.title, '', 'empty title without H1');
  assertEq(p.goal, 'A plan without a heading.', 'goal still parsed');
  assertEq(p.tasks.length, 1, 'task still parsed');
  assertEq(p.tasks[0].id, 'T01', 'task id');
}

console.log('\n=== parsePlan: task estimate backtick in description ===');
{
  // The `est:45m` text appears after the bold closing but before the description lines
  // It should end up as part of the description or be ignored gracefully
  const content = `# S05: Estimate Handling

**Goal:** Test estimate text handling.
**Demo:** Works.

## Tasks

- [ ] **T01: With Estimate** \`est:45m\`
  Main description here.
`;

  const p = parsePlan(content);
  assertEq(p.tasks.length, 1, 'one task');
  assertEq(p.tasks[0].id, 'T01', 'task id');
  assertEq(p.tasks[0].title, 'With Estimate', 'title excludes estimate');
  // The `est:45m` backtick text after ** is not part of the title or description
  // It's on the same line after the regex match captures, so it's in the remainder
  // The description should be the continuation lines
  assert(p.tasks[0].description.includes('Main description'), 'description from continuation line');
}

console.log('\n=== parsePlan: uppercase X for done ===');
{
  const content = `# S06: Case Test

**Goal:** Test case.
**Demo:** Works.

## Tasks

- [X] **T01: Uppercase Done** \`est:5m\`
  Done with uppercase X.

- [x] **T02: Lowercase Done** \`est:5m\`
  Done with lowercase x.
`;

  const p = parsePlan(content);
  assertEq(p.tasks[0].done, true, 'uppercase X is done');
  assertEq(p.tasks[1].done, true, 'lowercase x is done');
}

console.log('\n=== parsePlan: no Must-Haves section ===');
{
  const content = `# S07: No Must-Haves

**Goal:** Test missing must-haves.
**Demo:** Parser handles it.

## Tasks

- [ ] **T01: Only Task** \`est:10m\`
  The only task.
`;

  const p = parsePlan(content);
  assertEq(p.mustHaves.length, 0, 'empty must-haves');
  assertEq(p.tasks.length, 1, 'task still parsed');
}

console.log('\n=== parsePlan: no Files Likely Touched section ===');
{
  const content = `# S08: No Files

**Goal:** Test missing files section.
**Demo:** Parser handles it.

## Tasks

- [ ] **T01: Task** \`est:10m\`
  Description.
`;

  const p = parsePlan(content);
  assertEq(p.filesLikelyTouched.length, 0, 'empty files likely touched');
}

console.log('\n=== parsePlan: old-format task entries (no sublines) ===');
{
  const content = `# S09: Old Format

**Goal:** Test old-format compatibility.
**Demo:** Parser handles entries without sublines.

## Tasks

- [ ] **T01: Classic Task** \`est:10m\`
  Just a plain description with no labeled sublines.
`;

  const p = parsePlan(content);
  assertEq(p.tasks.length, 1, 'one task parsed');
  assertEq(p.tasks[0].id, 'T01', 'task id');
  assertEq(p.tasks[0].title, 'Classic Task', 'task title');
  assertEq(p.tasks[0].done, false, 'task not done');
  assertEq(p.tasks[0].files, undefined, 'files is undefined for old-format entry');
  assertEq(p.tasks[0].verify, undefined, 'verify is undefined for old-format entry');
}

console.log('\n=== parsePlan: new-format task entries with Files and Verify sublines ===');
{
  const content = `# S10: New Format

**Goal:** Test new-format subline extraction.
**Demo:** Parser extracts Files and Verify correctly.

## Tasks

- [ ] **T01: Modern Task** \`est:15m\`
  - Why: because we need typed plan entries
  - Files: \`types.ts\`, \`files.ts\`
  - Verify: run the test suite
`;

  const p = parsePlan(content);
  assertEq(p.tasks.length, 1, 'one task parsed');
  assertEq(p.tasks[0].id, 'T01', 'task id');
  assert(Array.isArray(p.tasks[0].files), 'files is an array');
  assertEq(p.tasks[0].files!.length, 2, 'files array has two entries');
  assertEq(p.tasks[0].files![0], 'types.ts', 'first file is types.ts');
  assertEq(p.tasks[0].files![1], 'files.ts', 'second file is files.ts');
  assertEq(p.tasks[0].verify, 'run the test suite', 'verify string extracted correctly');
  assert(p.tasks[0].description.includes('Why: because we need typed plan entries'), 'Why line accumulates into description');
}

// ═══════════════════════════════════════════════════════════════════════════
// parseSummary tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseSummary: full summary with all frontmatter fields ===');
{
  const content = `---
id: T01
parent: S01
milestone: M001
provides:
  - parseRoadmap test coverage
  - parsePlan test coverage
requires:
  - slice: S00
    provides: type definitions
  - slice: S02
    provides: state derivation
affects:
  - auto-mode dispatch
key_files:
  - tests/parsers.test.ts
  - files.ts
key_decisions:
  - Use manual assert pattern
patterns_established:
  - parsers.test.ts is the canonical test location
drill_down_paths:
  - tests/parsers.test.ts for assertion details
observability_surfaces:
  - test pass/fail output from node --test
  - exit code 1 on failure
duration: 23min
verification_result: pass
retries: 0
completed_at: 2025-03-10T08:00:00Z
---

# T01: Test parseRoadmap and parsePlan

**Created parsers.test.ts with 98 assertions across 16 test groups.**

## What Happened

Added comprehensive tests for parseRoadmap and parsePlan.

## Deviations

None.

## Files Created/Modified

- \`tests/parsers.test.ts\` — new test file with 98 assertions
- \`types.ts\` — added observability_surfaces field
- \`files.ts\` — updated parseSummary extraction
`;

  const s = parseSummary(content);

  // Frontmatter fields
  assertEq(s.frontmatter.id, 'T01', 'summary id');
  assertEq(s.frontmatter.parent, 'S01', 'summary parent');
  assertEq(s.frontmatter.milestone, 'M001', 'summary milestone');
  assertEq(s.frontmatter.provides.length, 2, 'provides count');
  assertEq(s.frontmatter.provides[0], 'parseRoadmap test coverage', 'first provides');
  assertEq(s.frontmatter.provides[1], 'parsePlan test coverage', 'second provides');

  // requires (nested objects)
  assertEq(s.frontmatter.requires.length, 2, 'requires count');
  assertEq(s.frontmatter.requires[0].slice, 'S00', 'first requires slice');
  assertEq(s.frontmatter.requires[0].provides, 'type definitions', 'first requires provides');
  assertEq(s.frontmatter.requires[1].slice, 'S02', 'second requires slice');
  assertEq(s.frontmatter.requires[1].provides, 'state derivation', 'second requires provides');

  assertEq(s.frontmatter.affects.length, 1, 'affects count');
  assertEq(s.frontmatter.affects[0], 'auto-mode dispatch', 'affects value');
  assertEq(s.frontmatter.key_files.length, 2, 'key_files count');
  assertEq(s.frontmatter.key_decisions.length, 1, 'key_decisions count');
  assertEq(s.frontmatter.patterns_established.length, 1, 'patterns_established count');
  assertEq(s.frontmatter.drill_down_paths.length, 1, 'drill_down_paths count');

  // observability_surfaces extraction
  assertEq(s.frontmatter.observability_surfaces.length, 2, 'observability_surfaces count');
  assertEq(s.frontmatter.observability_surfaces[0], 'test pass/fail output from node --test', 'first observability surface');
  assertEq(s.frontmatter.observability_surfaces[1], 'exit code 1 on failure', 'second observability surface');

  assertEq(s.frontmatter.duration, '23min', 'duration');
  assertEq(s.frontmatter.verification_result, 'pass', 'verification_result');
  assertEq(s.frontmatter.completed_at, '2025-03-10T08:00:00Z', 'completed_at');

  // Body fields
  assertEq(s.title, 'T01: Test parseRoadmap and parsePlan', 'summary title');
  assertEq(s.oneLiner, 'Created parsers.test.ts with 98 assertions across 16 test groups.', 'one-liner');
  assert(s.whatHappened.includes('comprehensive tests'), 'whatHappened content');
  assertEq(s.deviations, 'None.', 'deviations');

  // Files modified
  assertEq(s.filesModified.length, 3, 'filesModified count');
  assertEq(s.filesModified[0].path, 'tests/parsers.test.ts', 'first file path');
  assert(s.filesModified[0].description.includes('98 assertions'), 'first file description');
  assertEq(s.filesModified[1].path, 'types.ts', 'second file path');
  assertEq(s.filesModified[2].path, 'files.ts', 'third file path');
}

console.log('\n=== parseSummary: one-liner extraction (bold-wrapped line after H1) ===');
{
  const content = `# S01: Parser Test Suite

**All 5 parsers have test coverage with edge cases.**

## What Happened

Things happened.
`;

  const s = parseSummary(content);
  assertEq(s.title, 'S01: Parser Test Suite', 'title');
  assertEq(s.oneLiner, 'All 5 parsers have test coverage with edge cases.', 'bold one-liner');
}

console.log('\n=== parseSummary: non-bold paragraph after H1 (empty one-liner) ===');
{
  const content = `# T02: Some Task

This is just a regular paragraph, not bold.

## What Happened

Did stuff.
`;

  const s = parseSummary(content);
  assertEq(s.title, 'T02: Some Task', 'title');
  assertEq(s.oneLiner, '', 'non-bold line results in empty one-liner');
}

console.log('\n=== parseSummary: files-modified parsing (backtick path — description format) ===');
{
  const content = `# T03: File Changes

**One-liner.**

## Files Created/Modified

- \`src/index.ts\` — main entry point
- \`src/utils.ts\` — utility functions
- \`README.md\` — updated docs
`;

  const s = parseSummary(content);
  assertEq(s.filesModified.length, 3, 'three files');
  assertEq(s.filesModified[0].path, 'src/index.ts', 'first path');
  assertEq(s.filesModified[0].description, 'main entry point', 'first description');
  assertEq(s.filesModified[1].path, 'src/utils.ts', 'second path');
  assertEq(s.filesModified[2].path, 'README.md', 'third path');
}

console.log('\n=== parseSummary: missing frontmatter (safe defaults) ===');
{
  const content = `# T04: No Frontmatter

**Did something.**

## What Happened

No frontmatter at all.
`;

  const s = parseSummary(content);
  assertEq(s.frontmatter.id, '', 'default id empty');
  assertEq(s.frontmatter.parent, '', 'default parent empty');
  assertEq(s.frontmatter.milestone, '', 'default milestone empty');
  assertEq(s.frontmatter.provides.length, 0, 'default provides empty');
  assertEq(s.frontmatter.requires.length, 0, 'default requires empty');
  assertEq(s.frontmatter.affects.length, 0, 'default affects empty');
  assertEq(s.frontmatter.key_files.length, 0, 'default key_files empty');
  assertEq(s.frontmatter.key_decisions.length, 0, 'default key_decisions empty');
  assertEq(s.frontmatter.patterns_established.length, 0, 'default patterns_established empty');
  assertEq(s.frontmatter.drill_down_paths.length, 0, 'default drill_down_paths empty');
  assertEq(s.frontmatter.observability_surfaces.length, 0, 'default observability_surfaces empty');
  assertEq(s.frontmatter.duration, '', 'default duration empty');
  assertEq(s.frontmatter.verification_result, 'untested', 'default verification_result');
  assertEq(s.frontmatter.completed_at, '', 'default completed_at empty');
  assertEq(s.title, 'T04: No Frontmatter', 'title still parsed');
  assertEq(s.oneLiner, 'Did something.', 'one-liner still parsed');
}

console.log('\n=== parseSummary: empty body ===');
{
  const content = `---
id: T05
parent: S01
milestone: M001
---
`;

  const s = parseSummary(content);
  assertEq(s.frontmatter.id, 'T05', 'id from frontmatter');
  assertEq(s.title, '', 'empty title');
  assertEq(s.oneLiner, '', 'empty one-liner');
  assertEq(s.whatHappened, '', 'empty whatHappened');
  assertEq(s.deviations, '', 'empty deviations');
  assertEq(s.filesModified.length, 0, 'no files modified');
}

console.log('\n=== parseSummary: summary with requires array (nested objects) ===');
{
  const content = `---
id: T06
parent: S02
milestone: M001
requires:
  - slice: S01
    provides: parser functions
  - slice: S00
    provides: core types
  - slice: S03
    provides: state engine
provides: []
affects: []
key_files: []
key_decisions: []
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: 10min
verification_result: pass
retries: 1
completed_at: 2025-03-10T09:00:00Z
---

# T06: Nested Requires

**Test nested requires parsing.**

## What Happened

Tested.
`;

  const s = parseSummary(content);
  assertEq(s.frontmatter.requires.length, 3, 'three requires entries');
  assertEq(s.frontmatter.requires[0].slice, 'S01', 'first requires slice');
  assertEq(s.frontmatter.requires[0].provides, 'parser functions', 'first requires provides');
  assertEq(s.frontmatter.requires[1].slice, 'S00', 'second requires slice');
  assertEq(s.frontmatter.requires[2].slice, 'S03', 'third requires slice');
  assertEq(s.frontmatter.requires[2].provides, 'state engine', 'third requires provides');
}

// ═══════════════════════════════════════════════════════════════════════════
// parseContinue tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseContinue: full continue file with all frontmatter fields ===');
{
  const content = `---
milestone: M001
slice: S01
task: T02
step: 3
total_steps: 5
status: in_progress
saved_at: 2025-03-10T08:30:00Z
---

## Completed Work

Steps 1-3 are done. Created test file and wrote assertions.

## Remaining Work

Steps 4-5: run tests and check regressions.

## Decisions Made

Used manual assert pattern instead of node:assert.

## Context

Working in the gsd-s01 worktree. All imports use .ts extensions.

## Next Action

Run the full test suite with node --test.
`;

  const c = parseContinue(content);

  // Frontmatter
  assertEq(c.frontmatter.milestone, 'M001', 'continue milestone');
  assertEq(c.frontmatter.slice, 'S01', 'continue slice');
  assertEq(c.frontmatter.task, 'T02', 'continue task');
  assertEq(c.frontmatter.step, 3, 'continue step');
  assertEq(c.frontmatter.totalSteps, 5, 'continue totalSteps');
  assertEq(c.frontmatter.status, 'in_progress', 'continue status');
  assertEq(c.frontmatter.savedAt, '2025-03-10T08:30:00Z', 'continue savedAt');

  // Body sections
  assert(c.completedWork.includes('Steps 1-3 are done'), 'completedWork content');
  assert(c.remainingWork.includes('Steps 4-5'), 'remainingWork content');
  assert(c.decisions.includes('manual assert pattern'), 'decisions content');
  assert(c.context.includes('gsd-s01 worktree'), 'context content');
  assert(c.nextAction.includes('node --test'), 'nextAction content');
}

console.log('\n=== parseContinue: string step/totalSteps parsed as integers ===');
{
  const content = `---
milestone: M002
slice: S03
task: T01
step: 7
total_steps: 12
status: in_progress
saved_at: 2025-03-10T10:00:00Z
---

## Completed Work

Some work.

## Remaining Work

More work.

## Decisions Made

None.

## Context

None.

## Next Action

Continue.
`;

  const c = parseContinue(content);
  assertEq(c.frontmatter.step, 7, 'step parsed as integer 7');
  assertEq(c.frontmatter.totalSteps, 12, 'totalSteps parsed as integer 12');
  assertEq(typeof c.frontmatter.step, 'number', 'step is number type');
  assertEq(typeof c.frontmatter.totalSteps, 'number', 'totalSteps is number type');
}

console.log('\n=== parseContinue: NaN step values (non-numeric strings) ===');
{
  const content = `---
milestone: M001
slice: S01
task: T01
step: abc
total_steps: xyz
status: in_progress
saved_at: 2025-03-10T10:00:00Z
---

## Completed Work

Work.

## Remaining Work

Work.

## Decisions Made

None.

## Context

None.

## Next Action

Do things.
`;

  const c = parseContinue(content);
  // parseInt("abc") returns NaN; the parser || 0 fallback should give 0
  // Actually, looking at parser: typeof fm.step === 'string' ? parseInt(fm.step) : ...
  // parseInt("abc") = NaN, and NaN || 0 doesn't work because NaN is falsy only in boolean context
  // But the parser uses: typeof fm.step === 'string' ? parseInt(fm.step) : (fm.step as number) || 0
  // parseInt returns NaN which is a number, not 0 — let's verify
  const stepIsNaN = Number.isNaN(c.frontmatter.step);
  const totalIsNaN = Number.isNaN(c.frontmatter.totalSteps);
  // The parser does parseInt which returns NaN for non-numeric strings
  // There's no || 0 fallback on the parseInt path, so NaN is expected
  assert(stepIsNaN, 'NaN step when non-numeric string');
  assert(totalIsNaN, 'NaN totalSteps when non-numeric string');
}

console.log('\n=== parseContinue: all three status variants ===');
{
  for (const status of ['in_progress', 'interrupted', 'compacted'] as const) {
    const content = `---
milestone: M001
slice: S01
task: T01
step: 1
total_steps: 3
status: ${status}
saved_at: 2025-03-10T10:00:00Z
---

## Completed Work

Work.
`;

    const c = parseContinue(content);
    assertEq(c.frontmatter.status, status, `status variant: ${status}`);
  }
}

console.log('\n=== parseContinue: missing frontmatter ===');
{
  const content = `## Completed Work

Some work done.

## Remaining Work

More to do.

## Decisions Made

A decision.

## Context

Some context.

## Next Action

Next thing.
`;

  const c = parseContinue(content);
  assertEq(c.frontmatter.milestone, '', 'default milestone empty');
  assertEq(c.frontmatter.slice, '', 'default slice empty');
  assertEq(c.frontmatter.task, '', 'default task empty');
  assertEq(c.frontmatter.step, 0, 'default step 0');
  assertEq(c.frontmatter.totalSteps, 0, 'default totalSteps 0');
  assertEq(c.frontmatter.status, 'in_progress', 'default status in_progress');
  assertEq(c.frontmatter.savedAt, '', 'default savedAt empty');

  // Body sections still parse
  assert(c.completedWork.includes('Some work done'), 'completedWork without frontmatter');
  assert(c.remainingWork.includes('More to do'), 'remainingWork without frontmatter');
  assert(c.decisions.includes('A decision'), 'decisions without frontmatter');
  assert(c.context.includes('Some context'), 'context without frontmatter');
  assert(c.nextAction.includes('Next thing'), 'nextAction without frontmatter');
}

console.log('\n=== parseContinue: body section extraction ===');
{
  const content = `---
milestone: M001
slice: S01
task: T03
step: 2
total_steps: 4
status: interrupted
saved_at: 2025-03-10T11:00:00Z
---

## Completed Work

First paragraph of completed work.
Second paragraph continuing the explanation.

## Remaining Work

Need to finish step 3 and step 4.

## Decisions Made

Decided to use approach A over approach B because of performance.

## Context

Running in worktree. Node 22 required. TypeScript strict mode.

## Next Action

Pick up at step 3: run the integration tests.
`;

  const c = parseContinue(content);
  assert(c.completedWork.includes('First paragraph'), 'completedWork first paragraph');
  assert(c.completedWork.includes('Second paragraph'), 'completedWork second paragraph');
  assert(c.remainingWork.includes('step 3 and step 4'), 'remainingWork detail');
  assert(c.decisions.includes('approach A over approach B'), 'decisions detail');
  assert(c.context.includes('Node 22 required'), 'context detail');
  assert(c.nextAction.includes('step 3: run the integration tests'), 'nextAction detail');
}

console.log('\n=== parseContinue: total_steps vs totalSteps key support ===');
{
  // Test total_steps (snake_case) — the primary format
  const content1 = `---
milestone: M001
slice: S01
task: T01
step: 2
total_steps: 8
status: in_progress
saved_at: 2025-03-10T12:00:00Z
---

## Completed Work

Work.
`;

  const c1 = parseContinue(content1);
  assertEq(c1.frontmatter.totalSteps, 8, 'total_steps snake_case works');

  // Test totalSteps (camelCase) — the fallback
  const content2 = `---
milestone: M001
slice: S01
task: T01
step: 2
totalSteps: 6
status: in_progress
saved_at: 2025-03-10T12:00:00Z
---

## Completed Work

Work.
`;

  const c2 = parseContinue(content2);
  assertEq(c2.frontmatter.totalSteps, 6, 'totalSteps camelCase works');
}

// ═══════════════════════════════════════════════════════════════════════════
// parseRequirementCounts tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseRequirementCounts: full requirements file ===');
{
  const content = `# Requirements

## Active

### R001 — User authentication
- Status: active

### R002 — Dashboard rendering
- Status: blocked

### R003 — API rate limiting
- Status: active

## Validated

### R010 — Parser test coverage
- Status: validated

### R011 — Type system
- Status: validated

## Deferred

### R020 — Admin panel
- Status: deferred

## Out of Scope

### R030 — Mobile app
- Status: out-of-scope

### R031 — Desktop app
- Status: out-of-scope
`;

  const counts = parseRequirementCounts(content);
  assertEq(counts.active, 3, 'active count');
  assertEq(counts.validated, 2, 'validated count');
  assertEq(counts.deferred, 1, 'deferred count');
  assertEq(counts.outOfScope, 2, 'outOfScope count');
  assertEq(counts.blocked, 1, 'blocked count');
  assertEq(counts.total, 8, 'total is sum of active+validated+deferred+outOfScope');
}

console.log('\n=== parseRequirementCounts: null input returns all zeros ===');
{
  const counts = parseRequirementCounts(null);
  assertEq(counts.active, 0, 'null active');
  assertEq(counts.validated, 0, 'null validated');
  assertEq(counts.deferred, 0, 'null deferred');
  assertEq(counts.outOfScope, 0, 'null outOfScope');
  assertEq(counts.blocked, 0, 'null blocked');
  assertEq(counts.total, 0, 'null total');
}

console.log('\n=== parseRequirementCounts: empty sections return zero counts ===');
{
  const content = `# Requirements

## Active

## Validated

## Deferred

## Out of Scope
`;

  const counts = parseRequirementCounts(content);
  assertEq(counts.active, 0, 'empty active');
  assertEq(counts.validated, 0, 'empty validated');
  assertEq(counts.deferred, 0, 'empty deferred');
  assertEq(counts.outOfScope, 0, 'empty outOfScope');
  assertEq(counts.blocked, 0, 'empty blocked');
  assertEq(counts.total, 0, 'empty total');
}

console.log('\n=== parseRequirementCounts: blocked status counting ===');
{
  const content = `# Requirements

## Active

### R001 — Blocked thing
- Status: blocked

### R002 — Another blocked thing
- Status: blocked

### R003 — Active thing
- Status: active

## Validated

## Deferred

### R020 — Blocked deferred
- Status: blocked

## Out of Scope
`;

  const counts = parseRequirementCounts(content);
  assertEq(counts.active, 3, 'active includes blocked items in Active section');
  assertEq(counts.blocked, 3, 'blocked counts all blocked statuses across sections');
  assertEq(counts.deferred, 1, 'deferred section count');
}

console.log('\n=== parseRequirementCounts: total is sum of all section counts ===');
{
  const content = `# Requirements

## Active

### R001 — One
- Status: active

## Validated

### R010 — Two
- Status: validated

### R011 — Three
- Status: validated

## Deferred

### R020 — Four
- Status: deferred

### R021 — Five
- Status: deferred

### R022 — Six
- Status: deferred

## Out of Scope

### R030 — Seven
- Status: out-of-scope
`;

  const counts = parseRequirementCounts(content);
  assertEq(counts.active, 1, 'one active');
  assertEq(counts.validated, 2, 'two validated');
  assertEq(counts.deferred, 3, 'three deferred');
  assertEq(counts.outOfScope, 1, 'one outOfScope');
  assertEq(counts.total, 7, 'total = 1 + 2 + 3 + 1');
  assertEq(counts.total, counts.active + counts.validated + counts.deferred + counts.outOfScope, 'total is exact sum');
}

// ═══════════════════════════════════════════════════════════════════════════
// parseSummary: bare scalar frontmatter fields (regression test for #91)
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n=== parseSummary: bare scalar "none" coerced to string array (#91) ===');
{
  const content = `---
id: T04
parent: S03
milestone: M001
provides:
  - iOS rules
key_files:
  - .claude/rules/swift-style.md
key_decisions: none
patterns_established: none
drill_down_paths: none
observability_surfaces: none — static reference files
affects: single-value
---

# T04: iOS Rules

**Created iOS-specific rules.**

## What Happened

Added rules.

## Deviations

None.
`;

  const s = parseSummary(content);

  // Array fields should remain arrays
  assertEq(s.frontmatter.provides.length, 1, '#91: provides array preserved');
  assertEq(s.frontmatter.provides[0], 'iOS rules', '#91: provides value');
  assertEq(s.frontmatter.key_files.length, 1, '#91: key_files array preserved');

  // Bare scalar "none" must be coerced to ["none"], not crash
  assertEq(Array.isArray(s.frontmatter.key_decisions), true, '#91: key_decisions is array');
  assertEq(s.frontmatter.key_decisions.length, 1, '#91: key_decisions has 1 element');
  assertEq(s.frontmatter.key_decisions[0], 'none', '#91: key_decisions[0] is "none"');

  assertEq(Array.isArray(s.frontmatter.patterns_established), true, '#91: patterns_established is array');
  assertEq(s.frontmatter.patterns_established.length, 1, '#91: patterns_established coerced');

  assertEq(Array.isArray(s.frontmatter.drill_down_paths), true, '#91: drill_down_paths is array');
  assertEq(s.frontmatter.drill_down_paths.length, 1, '#91: drill_down_paths coerced');

  // Scalar with spaces: "none — static reference files"
  assertEq(Array.isArray(s.frontmatter.observability_surfaces), true, '#91: observability_surfaces is array');
  assertEq(s.frontmatter.observability_surfaces.length, 1, '#91: observability_surfaces coerced');
  assertEq(s.frontmatter.observability_surfaces[0], 'none — static reference files', '#91: full scalar preserved');

  // Single value (not "none") also coerced
  assertEq(Array.isArray(s.frontmatter.affects), true, '#91: affects is array');
  assertEq(s.frontmatter.affects.length, 1, '#91: affects single value coerced');
  assertEq(s.frontmatter.affects[0], 'single-value', '#91: affects value');

  // .slice().join() must not crash (the original bug)
  const decisions = s.frontmatter.key_decisions.slice(0, 2).join('; ');
  assertEq(decisions, 'none', '#91: .slice().join() works on coerced array');
}

console.log('\n=== parseSummary: missing/empty frontmatter fields yield empty arrays ===');
{
  const content = `---
id: T05
parent: S04
milestone: M001
---

# T05: Minimal Summary

**Minimal.**

## What Happened

Nothing.
`;

  const s = parseSummary(content);
  assertEq(s.frontmatter.provides.length, 0, 'missing provides = empty array');
  assertEq(s.frontmatter.key_decisions.length, 0, 'missing key_decisions = empty array');
  assertEq(s.frontmatter.affects.length, 0, 'missing affects = empty array');
  assertEq(s.frontmatter.key_files.length, 0, 'missing key_files = empty array');
  assertEq(s.frontmatter.patterns_established.length, 0, 'missing patterns_established = empty array');
  assertEq(s.frontmatter.drill_down_paths.length, 0, 'missing drill_down_paths = empty array');
  assertEq(s.frontmatter.observability_surfaces.length, 0, 'missing observability_surfaces = empty array');
}

// ═══════════════════════════════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All tests passed ✓');
