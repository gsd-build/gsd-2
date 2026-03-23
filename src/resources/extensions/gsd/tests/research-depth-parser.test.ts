/**
 * Tests for parseResearchDepth() — CONTEXT.md frontmatter parser.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { parseResearchDepth, parseContextDependsOn } from "../files.ts";

// ── Full frontmatter ─────────────────────────────────────────────────────────

test("parses full research frontmatter with all fields", () => {
  const content = `---
research_depth: deep
research_signals:
  - term1
  - term2
research_focus: API compatibility
---

# M001: My Milestone

Some body content.
`;
  const result = parseResearchDepth(content);
  assert.equal(result.depth, "deep");
  assert.deepEqual(result.signals, ["term1", "term2"]);
  assert.equal(result.focus, "API compatibility");
});

// ── Partial frontmatter ──────────────────────────────────────────────────────

test("parses partial frontmatter — only research_depth", () => {
  const content = `---
research_depth: light
---

# M001: My Milestone
`;
  const result = parseResearchDepth(content);
  assert.equal(result.depth, "light");
  assert.equal(result.signals, null);
  assert.equal(result.focus, null);
});

// ── No frontmatter ───────────────────────────────────────────────────────────

test("returns all null for plain markdown without frontmatter", () => {
  const content = `# M001: My Milestone

Just body content, no frontmatter.
`;
  const result = parseResearchDepth(content);
  assert.equal(result.depth, null);
  assert.equal(result.signals, null);
  assert.equal(result.focus, null);
});

// ── Null content ─────────────────────────────────────────────────────────────

test("returns all null for null content", () => {
  const result = parseResearchDepth(null);
  assert.equal(result.depth, null);
  assert.equal(result.signals, null);
  assert.equal(result.focus, null);
});

// ── research_depth: skip (valid string, not filtered) ────────────────────────

test("research_depth: skip is parsed as-is", () => {
  const content = `---
research_depth: skip
---

# M001: Milestone
`;
  const result = parseResearchDepth(content);
  assert.equal(result.depth, "skip");
  assert.equal(result.signals, null);
  assert.equal(result.focus, null);
});

// ── Inline array syntax ──────────────────────────────────────────────────────

test("parses inline array syntax for research_signals", () => {
  const content = `---
research_depth: moderate
research_signals:
  - a
  - b
  - c
---

# M001: Milestone
`;
  const result = parseResearchDepth(content);
  assert.equal(result.depth, "moderate");
  assert.deepEqual(result.signals, ["a", "b", "c"]);
  assert.equal(result.focus, null);
});

// ── Non-interference with depends_on ─────────────────────────────────────────

test("research fields coexist with depends_on — both parse correctly", () => {
  const content = `---
depends_on:
  - M001
  - M002
research_depth: deep
research_signals:
  - performance
research_focus: latency reduction
---

# M003: Follow-up Milestone
`;
  const researchResult = parseResearchDepth(content);
  assert.equal(researchResult.depth, "deep");
  assert.deepEqual(researchResult.signals, ["performance"]);
  assert.equal(researchResult.focus, "latency reduction");

  // Verify depends_on also parses correctly from the same content
  const deps = parseContextDependsOn(content);
  assert.deepEqual(deps, ["M001", "M002"]);
});

// ── Empty string content ─────────────────────────────────────────────────────

test("returns all null for empty string content", () => {
  const result = parseResearchDepth("");
  assert.equal(result.depth, null);
  assert.equal(result.signals, null);
  assert.equal(result.focus, null);
});

// ── Frontmatter with only non-research fields ────────────────────────────────

test("returns all null when frontmatter has no research fields", () => {
  const content = `---
depends_on:
  - M001
---

# M002: Some Milestone
`;
  const result = parseResearchDepth(content);
  assert.equal(result.depth, null);
  assert.equal(result.signals, null);
  assert.equal(result.focus, null);
});

// ── Quoted focus value ───────────────────────────────────────────────────────

test("parses quoted research_focus value", () => {
  const content = `---
research_depth: deep
research_focus: "API compatibility"
---

# M001: Milestone
`;
  const result = parseResearchDepth(content);
  assert.equal(result.depth, "deep");
  assert.equal(result.focus, "API compatibility");
});
