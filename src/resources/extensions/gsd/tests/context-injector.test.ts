/**
 * Unit tests for context-injector.ts — injectContext() function.
 *
 * Verifies context assembly from prior step artifacts: empty returns,
 * formatted output, missing file handling, truncation, multi-step
 * assembly, and graceful handling of unknown step references.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { injectContext } from "../context-injector.ts";
import type { WorkflowDefinition } from "../definition-loader.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "gsd-ctx-inject-test-"));
}

function makeDefinition(steps: WorkflowDefinition["steps"]): WorkflowDefinition {
  return { version: 1, name: "test-workflow", steps };
}

// ─── injectContext: no contextFrom → empty string ────────────────────────

test("injectContext: step with no contextFrom → returns empty string", () => {
  const def = makeDefinition([
    { id: "step-1", name: "First", prompt: "do it", requires: [], produces: ["out.md"] },
  ]);
  const dir = makeTmpDir();
  try {
    assert.equal(injectContext("step-1", def, dir), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("injectContext: step not found in definition → returns empty string", () => {
  const def = makeDefinition([
    { id: "step-1", name: "First", prompt: "do it", requires: [], produces: [] },
  ]);
  const dir = makeTmpDir();
  try {
    assert.equal(injectContext("nonexistent", def, dir), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── injectContext: contextFrom with existing artifacts ───────────────────

test("injectContext: contextFrom with existing artifacts → returns formatted content", () => {
  const def = makeDefinition([
    { id: "research", name: "Research", prompt: "do research", requires: [], produces: ["research.md"] },
    { id: "outline", name: "Outline", prompt: "make outline", requires: ["research"], produces: ["outline.md"], contextFrom: ["research"] },
  ]);
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, "research.md"), "# Research Findings\n\nSome content here.", "utf-8");
    const result = injectContext("outline", def, dir);

    assert.ok(result.startsWith("## Context from prior steps"));
    assert.ok(result.includes("### Step: Research (research)"));
    assert.ok(result.includes("# Research Findings"));
    assert.ok(result.includes("Some content here."));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── injectContext: missing artifacts → skipped gracefully ────────────────

test("injectContext: missing artifact files → returns empty string", () => {
  const def = makeDefinition([
    { id: "research", name: "Research", prompt: "do research", requires: [], produces: ["research.md"] },
    { id: "outline", name: "Outline", prompt: "make outline", requires: ["research"], produces: [], contextFrom: ["research"] },
  ]);
  const dir = makeTmpDir();
  try {
    // Don't write research.md — file is missing
    const result = injectContext("outline", def, dir);
    assert.equal(result, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── injectContext: truncation ────────────────────────────────────────────

test("injectContext: content exceeding maxChars → truncated with marker", () => {
  const def = makeDefinition([
    { id: "research", name: "Research", prompt: "do research", requires: [], produces: ["big.md"] },
    { id: "outline", name: "Outline", prompt: "make outline", requires: ["research"], produces: [], contextFrom: ["research"] },
  ]);
  const dir = makeTmpDir();
  try {
    // Write a large file that will exceed the budget
    const bigContent = "x".repeat(200);
    writeFileSync(join(dir, "big.md"), bigContent, "utf-8");
    const result = injectContext("outline", def, dir, { maxChars: 100 });

    assert.ok(result.includes("[Context truncated — exceeded budget]"));
    // The result before the truncation marker should be <= maxChars
    const markerIdx = result.indexOf("\n\n[Context truncated");
    assert.ok(markerIdx <= 100, `Expected truncation at or before 100 chars, found at ${markerIdx}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── injectContext: multiple contextFrom steps ───────────────────────────

test("injectContext: multiple contextFrom steps → all assembled in order", () => {
  const def = makeDefinition([
    { id: "research", name: "Research", prompt: "do research", requires: [], produces: ["research.md"] },
    { id: "outline", name: "Outline", prompt: "make outline", requires: ["research"], produces: ["outline.md"] },
    { id: "draft", name: "Draft", prompt: "write draft", requires: ["outline"], produces: ["draft.md"], contextFrom: ["research", "outline"] },
  ]);
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, "research.md"), "Research content", "utf-8");
    writeFileSync(join(dir, "outline.md"), "Outline content", "utf-8");
    const result = injectContext("draft", def, dir);

    assert.ok(result.includes("### Step: Research (research)"));
    assert.ok(result.includes("Research content"));
    assert.ok(result.includes("### Step: Outline (outline)"));
    assert.ok(result.includes("Outline content"));

    // Research should appear before Outline (order matches contextFrom array)
    const researchIdx = result.indexOf("### Step: Research");
    const outlineIdx = result.indexOf("### Step: Outline");
    assert.ok(researchIdx < outlineIdx, "Research should appear before Outline");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── injectContext: referenced step not in definition → skipped ──────────

test("injectContext: referenced step not in definition → skipped gracefully", () => {
  const def = makeDefinition([
    { id: "research", name: "Research", prompt: "do research", requires: [], produces: ["research.md"] },
    { id: "outline", name: "Outline", prompt: "make outline", requires: [], produces: [], contextFrom: ["nonexistent-step"] },
  ]);
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, "research.md"), "Some content", "utf-8");
    const result = injectContext("outline", def, dir);
    assert.equal(result, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
