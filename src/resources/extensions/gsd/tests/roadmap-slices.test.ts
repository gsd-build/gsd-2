import test from "node:test";
import assert from "node:assert/strict";
import { parseRoadmap } from "../files.ts";
import { parseRoadmapSlices, expandDependencies } from "../roadmap-slices.ts";

const content = `# M003: Current

**Vision:** Build the thing.

## Slices
- [x] **S01: First Slice** \`risk:low\` \`depends:[]\`
  > After this: First demo works.
- [ ] **S02: Second Slice** \`risk:medium\` \`depends:[S01]\`
- [x] **S03: Third Slice** \`depends:[S01, S02]\`
  > After this: Third demo works.

## Boundary Map
### S01 → S02
Produces:
  foo.ts
`;

test("parseRoadmapSlices extracts slices with dependencies and risk", () => {
  const slices = parseRoadmapSlices(content);
  assert.equal(slices.length, 3);
  assert.equal(slices[0]?.id, "S01");
  assert.equal(slices[0]?.done, true);
  assert.equal(slices[0]?.demo, "First demo works.");
  assert.deepEqual(slices[1]?.depends, ["S01"]);
  assert.equal(slices[1]?.risk, "medium");
  assert.equal(slices[2]?.risk, "low");
  assert.deepEqual(slices[2]?.depends, ["S01", "S02"]);
});

test("parseRoadmap integration: uses extracted slice parser", () => {
  const roadmap = parseRoadmap(content);
  assert.equal(roadmap.title, "M003: Current");
  assert.equal(roadmap.vision, "Build the thing.");
  assert.equal(roadmap.slices.length, 3);
  assert.equal(roadmap.boundaryMap.length, 1);
});

test("expandDependencies: plain IDs, ranges, and edge cases", () => {
  assert.deepEqual(expandDependencies([]), []);
  assert.deepEqual(expandDependencies(["S01"]), ["S01"]);
  assert.deepEqual(expandDependencies(["S01", "S03"]), ["S01", "S03"]);
  assert.deepEqual(expandDependencies(["S01-S04"]), ["S01", "S02", "S03", "S04"]);
  assert.deepEqual(expandDependencies(["S01-S01"]), ["S01"]);
  assert.deepEqual(expandDependencies(["S01..S03"]), ["S01", "S02", "S03"]);
  assert.deepEqual(expandDependencies(["S01-S03", "S05"]), ["S01", "S02", "S03", "S05"]);
  assert.deepEqual(expandDependencies(["S04-S01"]), ["S04-S01"]);
  assert.deepEqual(expandDependencies(["S01-T04"]), ["S01-T04"]);
});

test("parseRoadmapSlices: range syntax in depends expanded", () => {
  const rangeContent = `# M016: Test\n\n## Slices\n- [x] **S01: A** \`risk:low\` \`depends:[]\`\n- [x] **S02: B** \`risk:low\` \`depends:[]\`\n- [x] **S03: C** \`risk:low\` \`depends:[]\`\n- [x] **S04: D** \`risk:low\` \`depends:[]\`\n- [ ] **S05: E** \`risk:low\` \`depends:[S01-S04]\`\n  > After this: all done\n`;
  const slices = parseRoadmapSlices(rangeContent);
  assert.equal(slices.length, 5);
  assert.deepEqual(slices[4]?.depends, ["S01", "S02", "S03", "S04"]);
});

test("parseRoadmapSlices: comma-separated depends still works", () => {
  const commaContent = `# M001: Test\n\n## Slices\n- [ ] **S05: E** \`risk:low\` \`depends:[S01,S02,S03,S04]\`\n  > After this: done\n`;
  const slices = parseRoadmapSlices(commaContent);
  assert.deepEqual(slices[0]?.depends, ["S01", "S02", "S03", "S04"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// Regression #1736: Table format parsing
// ═══════════════════════════════════════════════════════════════════════════

test("parseRoadmapSlices: table format under ## Slices heading (#1736)", () => {
  const tableContent = [
    "# M001: Test Project", "", "## Slices", "",
    "| Slice | Title | Risk | Status |",
    "| --- | --- | --- | --- |",
    "| S01 | Setup Foundation | Low | [x] Done |",
    "| S02 | Core Features | High | [ ] Pending |",
    "| S03 | Polish | Medium | [x] Done |",
    "", "## Boundary Map",
  ].join("\n");
  const slices = parseRoadmapSlices(tableContent);
  assert.equal(slices.length, 3, "should parse 3 slices from table");
  assert.equal(slices[0]?.id, "S01");
  assert.equal(slices[0]?.done, true);
  assert.equal(slices[1]?.id, "S02");
  assert.equal(slices[1]?.done, false);
  assert.equal(slices[2]?.done, true);
});

test("parseRoadmapSlices: table format under ## Slice Overview heading (#1736)", () => {
  const tableContent = [
    "# M002: Another Project", "", "## Slice Overview", "",
    "| ID | Description | Risk | Done |", "|---|---|---|---|",
    "| S01 | Foundation Work | High | [x] |",
    "| S02 | API Layer | Medium | [ ] |", "",
  ].join("\n");
  const slices = parseRoadmapSlices(tableContent);
  assert.equal(slices.length, 2);
  assert.equal(slices[0]?.done, true);
  assert.equal(slices[1]?.done, false);
});

test("parseRoadmapSlices: table with Status Done/Complete text (#1736)", () => {
  const tableContent = [
    "# M003: Status Text", "", "## Slices", "",
    "| Slice | Title | Risk | Status |", "|---|---|---|---|",
    "| S01 | First | Low | Done |",
    "| S02 | Second | High | Pending |",
    "| S03 | Third | Medium | Completed |", "",
  ].join("\n");
  const slices = parseRoadmapSlices(tableContent);
  assert.equal(slices.length, 3);
  assert.equal(slices[0]?.done, true);
  assert.equal(slices[1]?.done, false);
  assert.equal(slices[2]?.done, true);
});

test("parseRoadmapSlices: table with dependencies column (#1736)", () => {
  const tableContent = [
    "# M004: Deps", "", "## Slices", "",
    "| Slice | Title | Risk | Depends | Status |", "|---|---|---|---|---|",
    "| S01 | First | Low | None | Done |",
    "| S02 | Second | High | S01 | Pending |",
    "| S03 | Third | Medium | S01, S02 | [ ] |", "",
  ].join("\n");
  const slices = parseRoadmapSlices(tableContent);
  assert.equal(slices.length, 3);
  assert.deepEqual(slices[0]?.depends, []);
  assert.deepEqual(slices[1]?.depends, ["S01"]);
  assert.deepEqual(slices[2]?.depends, ["S01", "S02"]);
});

test("parseRoadmapSlices: standard checkbox format still works (#1736)", () => {
  const checkboxContent = [
    "# M005: Unchanged", "", "## Slices", "",
    "- [x] **S01: First Slice** `risk:low` `depends:[]`",
    "  > After this: First demo works.",
    "- [ ] **S02: Second Slice** `risk:medium` `depends:[S01]`", "",
  ].join("\n");
  const slices = parseRoadmapSlices(checkboxContent);
  assert.equal(slices.length, 2);
  assert.equal(slices[0]?.done, true);
  assert.equal(slices[1]?.done, false);
});

// --- Prose slice header completion marker tests (#1803) ---

test("parseRoadmapSlices: prose headers with ✓ marker detected as done", () => {
  const proseContent = `# M010: Prose Roadmap

## S01: ✓ First Feature
Some description.

## S02: Second Feature
Not done yet.

## S03: ✓ Third Feature
Also done.
`;
  const slices = parseRoadmapSlices(proseContent);
  assert.equal(slices.length, 3);
  assert.equal(slices[0]?.id, "S01");
  assert.equal(slices[0]?.done, true);
  assert.equal(slices[0]?.title, "First Feature");
  assert.equal(slices[1]?.done, false);
  assert.equal(slices[2]?.done, true);
});

test("parseRoadmapSlices: prose headers with (Complete) marker detected as done", () => {
  const proseContent = `# M011: Prose Roadmap

## S01: First Feature (Complete)
Done slice.

## S02: Second Feature
In progress.
`;
  const slices = parseRoadmapSlices(proseContent);
  assert.equal(slices.length, 2);
  assert.equal(slices[0]?.done, true);
  assert.equal(slices[0]?.title, "First Feature");
  assert.equal(slices[1]?.done, false);
});

test("parseRoadmapSlices: prose headers with ✓ prefix before title", () => {
  const proseContent = `# M012: Prose

## ✓ S01: Done Slice
Complete.

## S02: Pending Slice
Not done.
`;
  const slices = parseRoadmapSlices(proseContent);
  assert.equal(slices.length, 2);
  assert.equal(slices[0]?.done, true);
  assert.equal(slices[0]?.title, "Done Slice");
  assert.equal(slices[1]?.done, false);
});

// ── Regression tests for #1711 ─────────────────────────────────────────────

test("parseRoadmapSlices: H3 prose headers under ## Slices section triggers prose fallback (#1711)", () => {
  const proseUnderSlices = `# M010: My Milestone

**Vision:** Ship it.

## Slices

### S01 — Setup Environment
Set up the dev environment and tooling.

### S02 — Build Core
Implement the core logic.
**Depends on:** S01

### S03 — Polish UI
Final polish and theming.
**Depends on:** S01, S02
`;
  const slices = parseRoadmapSlices(proseUnderSlices);
  assert.equal(slices.length, 3, "should find 3 slices from H3 prose headers under ## Slices");
  assert.equal(slices[0]?.id, "S01");
  assert.equal(slices[0]?.title, "Setup Environment");
  assert.equal(slices[1]?.id, "S02");
  assert.deepEqual(slices[1]?.depends, ["S01"]);
  assert.equal(slices[2]?.id, "S03");
  assert.deepEqual(slices[2]?.depends, ["S01", "S02"]);
});

test("parseRoadmapSlices: ## Slices with valid checkboxes does NOT invoke prose fallback", () => {
  const slices = parseRoadmapSlices(content);
  assert.equal(slices.length, 3);
  assert.equal(slices[0]?.id, "S01");
  assert.equal(slices[0]?.done, true);
});

test("parseRoadmapSlices: ## Slices with only non-matching lines returns prose fallback results", () => {
  const weirdContent = `# M020: Odd

## Slices
Some introductory text that is not a checkbox or a slice header.

### S01: First Thing
Do the first thing.

### S02: Second Thing
Do the second thing.
`;
  const slices = parseRoadmapSlices(weirdContent);
  assert.equal(slices.length, 2, "should fall through to prose parser");
  assert.equal(slices[0]?.id, "S01");
  assert.equal(slices[1]?.id, "S02");
});

// ── Regression tests for #2022 ─────────────────────────────────────────────

test("parseRoadmapSlices: HTML comments with checkbox examples do not corrupt slice parsing (#2022)", () => {
  const roadmapWithComment = `# M004: Milestone Four

**Vision:** Ship the feature.

## Slices

- [x] **S01: Dependency Updates** \`risk:low\` \`depends:[]\`
  > After this: All deps updated.
- [ ] **S02: Core Implementation** \`risk:medium\` \`depends:[S01]\`
  > After this: Core works.

<!--
  Format rules (parsers depend on this exact structure):
  - Checkbox line: - [ ] **S01: Title** \`risk:high|medium|low\` \`depends:[S01,S02]\`
  - Demo line:     > After this: what the user can see or do
-->

## Boundary Map
### S01 → S02
Produces: deps.json
`;
  const slices = parseRoadmapSlices(roadmapWithComment);
  assert.equal(slices.length, 2, "should find exactly 2 real slices, ignoring comment content");
  assert.equal(slices[0]?.id, "S01");
  assert.equal(slices[0]?.done, true, "S01 should be done (checked [x])");
  assert.equal(slices[0]?.title, "Dependency Updates");
  assert.equal(slices[1]?.id, "S02");
  assert.equal(slices[1]?.done, false);
});

test("parseRoadmapSlices: HTML comment before real slices does not shadow them (#2022)", () => {
  const roadmapCommentFirst = `# M005: Comment First

## Slices

<!--
  - [ ] **S01: Fake Entry** \`risk:high\` \`depends:[]\`
  - [ ] **S02: Another Fake** \`risk:low\` \`depends:[S01]\`
-->

- [x] **S01: Real Entry** \`risk:low\` \`depends:[]\`
- [x] **S02: Also Real** \`risk:medium\` \`depends:[S01]\`

## Boundary Map
`;
  const slices = parseRoadmapSlices(roadmapCommentFirst);
  assert.equal(slices.length, 2, "should parse only real slices outside comment");
  assert.equal(slices[0]?.id, "S01");
  assert.equal(slices[0]?.done, true, "real S01 should be done");
  assert.equal(slices[0]?.title, "Real Entry");
  assert.equal(slices[1]?.id, "S02");
  assert.equal(slices[1]?.done, true, "real S02 should be done");
  assert.equal(slices[1]?.title, "Also Real");
});

test("parseRoadmapSlices: multiline HTML comment spanning multiple lines stripped (#2022)", () => {
  const roadmapMultilineComment = `# M006: Multiline

## Slices

- [x] **S01: Done** \`risk:low\` \`depends:[]\`
<!-- This is a
multi-line comment
- [ ] **S01: Ghost** \`risk:high\` \`depends:[]\`
that should be ignored -->
- [ ] **S02: Pending** \`risk:medium\` \`depends:[S01]\`
`;
  const slices = parseRoadmapSlices(roadmapMultilineComment);
  assert.equal(slices.length, 2);
  assert.equal(slices[0]?.id, "S01");
  assert.equal(slices[0]?.done, true);
  assert.equal(slices[0]?.title, "Done");
  assert.equal(slices[1]?.id, "S02");
  assert.equal(slices[1]?.done, false);
});
