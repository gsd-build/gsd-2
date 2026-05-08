// Project/App: GSD-2
// File Purpose: System context memory gating regression tests.

import test from "node:test";
import assert from "node:assert/strict";

import { buildContextMessage, isLowEntropyResumePrompt, loadMemoryBlock } from "../bootstrap/system-context.ts";
import { closeDatabase, openDatabase } from "../gsd-db.ts";
import { createMemory } from "../memory-store.ts";

test("buildContextMessage marks hidden guided context when memory is supplied", () => {
  const message = buildContextMessage({
    memoryBlock: "\n\n[MEMORY]\n\n- keep this",
    injection: "[GSD Guided Execute Context]\nUse the task plan.",
    forensicsInjection: null,
  });

  assert.ok(message, "expected hidden context message");
  assert.equal(message.customType, "gsd-guided-context");
  assert.equal(message.display, false);
  assert.match(message.content, /\[GSD Context Metadata\]\n- Memory supplied: yes/);
  assert.ok(
    message.content.indexOf("Memory supplied: yes") < message.content.indexOf("[GSD Guided Execute Context]"),
    "memory marker should appear before guided context",
  );
});

test("buildContextMessage caps hidden context by default", () => {
  const original = process.env.PI_GSD_CONTEXT_MAX_CHARS;
  delete process.env.PI_GSD_CONTEXT_MAX_CHARS;
  try {
    const message = buildContextMessage({
      memoryBlock: "",
      injection: `[GSD Guided Execute Context]\n${"large context\n".repeat(500)}`,
      forensicsInjection: null,
    });

    assert.ok(message, "expected hidden context message");
    assert.equal(message.customType, "gsd-guided-context");
    assert.ok(message.content.length <= 4000);
    assert.match(message.content, /\[GSD Context Truncated\]/);
  } finally {
    if (original === undefined) delete process.env.PI_GSD_CONTEXT_MAX_CHARS;
    else process.env.PI_GSD_CONTEXT_MAX_CHARS = original;
  }
});

test("buildContextMessage supports explicit context cap override", () => {
  const original = process.env.PI_GSD_CONTEXT_MAX_CHARS;
  process.env.PI_GSD_CONTEXT_MAX_CHARS = "1200";
  try {
    const message = buildContextMessage({
      memoryBlock: "",
      injection: `[GSD Guided Execute Context]\n${"large context\n".repeat(200)}`,
      forensicsInjection: null,
    });

    assert.ok(message, "expected hidden context message");
    assert.equal(message.customType, "gsd-guided-context");
    assert.ok(message.content.length <= 1200);
    assert.match(message.content, /\[GSD Context Truncated\]/);
  } finally {
    if (original === undefined) delete process.env.PI_GSD_CONTEXT_MAX_CHARS;
    else process.env.PI_GSD_CONTEXT_MAX_CHARS = original;
  }
});

test("buildContextMessage does not add memory marker when only guided context is supplied", () => {
  const message = buildContextMessage({
    memoryBlock: "",
    injection: "[GSD Guided Execute Context]\nUse the task plan.",
    forensicsInjection: null,
  });

  assert.ok(message, "expected guided context message");
  assert.equal(message.customType, "gsd-guided-context");
  assert.doesNotMatch(message.content, /Memory supplied: yes/);
});

test("loadMemoryBlock keeps critical memories while gating prompt-relevant query hits", async () => {
  closeDatabase();
  assert.equal(openDatabase(":memory:"), true);
  try {
    createMemory({
      category: "gotcha",
      content: "Always preserve critical resume safety context.",
      confidence: 0.95,
    });
    createMemory({
      category: "preference",
      content: "React dashboard preference should only appear for a React prompt query.",
      confidence: 0.95,
    });

    const withPromptRelevant = await loadMemoryBlock("React dashboard", { includePromptRelevant: true });
    assert.match(withPromptRelevant, /critical resume safety context/);
    assert.match(withPromptRelevant, /React dashboard preference/);

    const withoutPromptRelevant = await loadMemoryBlock("React dashboard", { includePromptRelevant: false });
    assert.match(withoutPromptRelevant, /critical resume safety context/);
    assert.doesNotMatch(withoutPromptRelevant, /React dashboard preference/);
  } finally {
    closeDatabase();
  }
});

test("isLowEntropyResumePrompt identifies bare resume prompts only", () => {
  assert.equal(isLowEntropyResumePrompt("continue"), true);
  assert.equal(isLowEntropyResumePrompt("Go ahead."), true);
  assert.equal(isLowEntropyResumePrompt("run the tests"), false);
  assert.equal(isLowEntropyResumePrompt("/gsd auto"), false);
});
