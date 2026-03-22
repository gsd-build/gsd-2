/**
 * Regression test for #2039: /gsd discuss dead-ends when active milestone
 * slices are all discussed — never offers pending milestones.
 *
 * Validates that:
 * 1. The allDiscussed block in showDiscuss checks state.registry for pending milestones
 * 2. deriveState reports pending milestones alongside an active one
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { deriveState } = await import("../state.js");

// ─── Structural: showDiscuss has pending-milestone fallthrough ───────────────

test("showDiscuss: allDiscussed block checks registry for pending milestones (#2039)", () => {
  const src = readFileSync(join(import.meta.dirname, "..", "guided-flow.ts"), "utf-8");

  // Find the allDiscussed guard
  const allDiscussedIdx = src.indexOf("const allDiscussed = pendingSlices.every");
  assert.ok(allDiscussedIdx > -1, "guided-flow.ts should have the allDiscussed guard");

  // Extract the block from allDiscussed to the end of the if-block (generous window)
  const blockChunk = src.slice(allDiscussedIdx, allDiscussedIdx + 2500);

  // The fix should check state.registry for pending milestones before returning
  assert.match(
    blockChunk,
    /state\.registry\.filter/,
    "allDiscussed block should filter state.registry for pending milestones",
  );

  assert.match(
    blockChunk,
    /["']pending["']/,
    "allDiscussed block should filter for pending status",
  );

  // Should present a picker when undiscussed pending milestones exist
  assert.match(
    blockChunk,
    /showNextAction\(/,
    "allDiscussed block should show a picker for pending milestones",
  );

  // Should dispatch discussion for chosen pending milestone
  assert.match(
    blockChunk,
    /dispatchWorkflow\(/,
    "allDiscussed block should dispatch a discuss workflow for chosen milestone",
  );
});

// ─── Functional: deriveState reports pending milestones alongside active ─────

test("deriveState includes pending milestones in registry when active milestone exists", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-discuss-pending-"));

  try {
    // Active milestone M001 with roadmap and all slices (will be "active")
    const m001Dir = join(base, ".gsd", "milestones", "M001");
    mkdirSync(m001Dir, { recursive: true });
    writeFileSync(
      join(m001Dir, "M001-CONTEXT.md"),
      "# M001 Context\n\nActive milestone.",
    );
    writeFileSync(
      join(m001Dir, "M001-ROADMAP.md"),
      [
        "# M001: Active Milestone",
        "",
        "## Slices",
        "- [ ] **S01: First slice** `risk:low` `depends:[]`",
        "  > Do something.",
      ].join("\n"),
    );

    // Pending milestone M002 with only CONTEXT (no roadmap)
    const m002Dir = join(base, ".gsd", "milestones", "M002");
    mkdirSync(m002Dir, { recursive: true });
    writeFileSync(
      join(m002Dir, "M002-CONTEXT.md"),
      "# M002 Context\n\nQueued milestone needing discussion.",
    );

    // Pending milestone M003 with only CONTEXT (no roadmap)
    const m003Dir = join(base, ".gsd", "milestones", "M003");
    mkdirSync(m003Dir, { recursive: true });
    writeFileSync(
      join(m003Dir, "M003-CONTEXT.md"),
      "# M003 Context\n\nAnother queued milestone.",
    );

    const state = await deriveState(base);

    // Registry should have all three milestones
    assert.ok(state.registry.length >= 3, `registry should have at least 3 entries, got ${state.registry.length}`);

    // M001 should be active
    const m001Entry = state.registry.find(m => m.id === "M001");
    assert.ok(m001Entry, "M001 should be in the registry");
    assert.equal(m001Entry.status, "active", "M001 should be active");

    // M002 and M003 should be pending (they have CONTEXT but no ROADMAP)
    const m002Entry = state.registry.find(m => m.id === "M002");
    assert.ok(m002Entry, "M002 should be in the registry");
    assert.equal(m002Entry.status, "pending", "M002 should be pending");

    const m003Entry = state.registry.find(m => m.id === "M003");
    assert.ok(m003Entry, "M003 should be in the registry");
    assert.equal(m003Entry.status, "pending", "M003 should be pending");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
