/**
 * Unit tests for substituteParams() and substitutePromptString()
 * in definition-loader.ts (S07 — parameter substitution).
 *
 * Covers basic replacement, override precedence, missing params,
 * path-traversal guard, passthrough, and non-mutation guarantee.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  substituteParams,
  substitutePromptString,
} from "../definition-loader.ts";
import type { WorkflowDefinition } from "../definition-loader.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Minimal valid WorkflowDefinition factory. */
function makeDef(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    version: 1,
    name: "test-workflow",
    steps: [
      {
        id: "step1",
        name: "Step One",
        prompt: "Do the thing",
        requires: [],
        produces: [],
      },
    ],
    ...overrides,
  };
}

// ─── substituteParams Tests ──────────────────────────────────────────────

test("substituteParams: basic single-param replacement", () => {
  const def = makeDef({
    params: { topic: "security" },
    steps: [
      {
        id: "research",
        name: "Research",
        prompt: "Research {{topic}} and write findings.",
        requires: [],
        produces: ["research.md"],
      },
    ],
  });

  const result = substituteParams(def);
  assert.equal(result.steps[0].prompt, "Research security and write findings.");
});

test("substituteParams: multiple params in one prompt", () => {
  const def = makeDef({
    params: { topic: "AI", format: "markdown" },
    steps: [
      {
        id: "write",
        name: "Write",
        prompt: "Write about {{topic}} in {{format}} format.",
        requires: [],
        produces: [],
      },
    ],
  });

  const result = substituteParams(def);
  assert.equal(result.steps[0].prompt, "Write about AI in markdown format.");
});

test("substituteParams: CLI overrides take precedence over definition params", () => {
  const def = makeDef({
    params: { topic: "AI", format: "markdown" },
    steps: [
      {
        id: "write",
        name: "Write",
        prompt: "Write about {{topic}} in {{format}}.",
        requires: [],
        produces: [],
      },
    ],
  });

  const result = substituteParams(def, { topic: "security" });
  assert.equal(result.steps[0].prompt, "Write about security in markdown.");
});

test("substituteParams: missing param value throws Error listing the key", () => {
  const def = makeDef({
    steps: [
      {
        id: "research",
        name: "Research",
        prompt: "Research {{topic}} now.",
        requires: [],
        produces: [],
      },
    ],
  });

  assert.throws(
    () => substituteParams(def),
    (err: Error) => {
      assert.match(err.message, /Unresolved parameter/);
      assert.match(err.message, /topic/);
      return true;
    },
  );
});

test("substituteParams: param value containing '..' throws Error", () => {
  const def = makeDef({
    params: { path: "../etc/passwd" },
    steps: [
      {
        id: "read",
        name: "Read",
        prompt: "Read from {{path}}.",
        requires: [],
        produces: [],
      },
    ],
  });

  assert.throws(
    () => substituteParams(def),
    (err: Error) => {
      assert.match(err.message, /path traversal/i);
      assert.match(err.message, /path/);
      return true;
    },
  );
});

test("substituteParams: override value containing '..' also throws", () => {
  const def = makeDef({
    params: { dir: "safe" },
    steps: [
      {
        id: "read",
        name: "Read",
        prompt: "Read from {{dir}}.",
        requires: [],
        produces: [],
      },
    ],
  });

  assert.throws(
    () => substituteParams(def, { dir: "../../root" }),
    (err: Error) => {
      assert.match(err.message, /path traversal/i);
      return true;
    },
  );
});

test("substituteParams: no params and no placeholders — passthrough", () => {
  const def = makeDef({
    steps: [
      {
        id: "simple",
        name: "Simple",
        prompt: "Just do the thing with no variables.",
        requires: [],
        produces: [],
      },
    ],
  });

  const result = substituteParams(def);
  assert.equal(result.steps[0].prompt, "Just do the thing with no variables.");
});

test("substituteParams: prompt has {{key}} but definition has no params and no overrides — throws", () => {
  const def = makeDef({
    // No params field at all
    steps: [
      {
        id: "templated",
        name: "Templated",
        prompt: "Research {{topic}} deeply.",
        requires: [],
        produces: [],
      },
    ],
  });

  assert.throws(
    () => substituteParams(def),
    (err: Error) => {
      assert.match(err.message, /Unresolved parameter/);
      assert.match(err.message, /topic/);
      return true;
    },
  );
});

test("substituteParams: non-mutating — original definition is not modified", () => {
  const def = makeDef({
    params: { topic: "AI" },
    steps: [
      {
        id: "research",
        name: "Research",
        prompt: "Research {{topic}}.",
        requires: [],
        produces: ["research.md"],
      },
    ],
  });

  const originalPrompt = def.steps[0].prompt;
  const result = substituteParams(def);

  // Original untouched
  assert.equal(def.steps[0].prompt, originalPrompt);
  assert.equal(def.steps[0].prompt, "Research {{topic}}.");

  // Result has substitution
  assert.equal(result.steps[0].prompt, "Research AI.");

  // Different step array references
  assert.notEqual(result.steps, def.steps);
  assert.notEqual(result.steps[0], def.steps[0]);
});

test("substituteParams: multiple unresolved keys are all listed in error", () => {
  const def = makeDef({
    steps: [
      {
        id: "multi",
        name: "Multi",
        prompt: "{{alpha}} and {{beta}} and {{gamma}}.",
        requires: [],
        produces: [],
      },
    ],
  });

  assert.throws(
    () => substituteParams(def),
    (err: Error) => {
      assert.match(err.message, /alpha/);
      assert.match(err.message, /beta/);
      assert.match(err.message, /gamma/);
      return true;
    },
  );
});

test("substituteParams: same param used multiple times in one prompt", () => {
  const def = makeDef({
    params: { name: "Claude" },
    steps: [
      {
        id: "greet",
        name: "Greet",
        prompt: "Hello {{name}}, welcome {{name}}!",
        requires: [],
        produces: [],
      },
    ],
  });

  const result = substituteParams(def);
  assert.equal(result.steps[0].prompt, "Hello Claude, welcome Claude!");
});

test("substituteParams: params across multiple steps", () => {
  const def = makeDef({
    params: { topic: "security" },
    steps: [
      {
        id: "research",
        name: "Research",
        prompt: "Research {{topic}}.",
        requires: [],
        produces: ["research.md"],
      },
      {
        id: "write",
        name: "Write",
        prompt: "Write report on {{topic}}.",
        requires: ["research"],
        produces: ["report.md"],
      },
    ],
  });

  const result = substituteParams(def);
  assert.equal(result.steps[0].prompt, "Research security.");
  assert.equal(result.steps[1].prompt, "Write report on security.");
});

// ─── substitutePromptString Tests ────────────────────────────────────────

test("substitutePromptString: replaces params in a standalone string", () => {
  const merged = { topic: "networking", format: "PDF" };
  const result = substitutePromptString("Analyze {{topic}} and output {{format}}.", merged);
  assert.equal(result, "Analyze networking and output PDF.");
});

test("substitutePromptString: leaves unmatched placeholders untouched", () => {
  const merged = { topic: "AI" };
  const result = substitutePromptString("{{topic}} and {{unknown}}.", merged);
  assert.equal(result, "AI and {{unknown}}.");
});
