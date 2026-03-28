import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { KNOWN_PREFERENCE_KEYS } from "../preferences-types.js";
import { DEDUP_PROMPT_SECTION, resolveDedupSection } from "../forensics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("forensics dedup (#2096)", () => {
  it("forensics_dedup is in KNOWN_PREFERENCE_KEYS", () => {
    assert.ok(
      KNOWN_PREFERENCE_KEYS.has("forensics_dedup"),
      "KNOWN_PREFERENCE_KEYS must contain forensics_dedup",
    );
  });

  it("forensics prompt contains {{dedupSection}} placeholder", () => {
    const prompt = readFileSync(join(__dirname, "..", "prompts", "forensics.md"), "utf-8");
    assert.ok(prompt.includes("{{dedupSection}}"), "forensics.md must contain {{dedupSection}} placeholder");
  });

  it("DEDUP_PROMPT_SECTION contains required search commands", () => {
    assert.ok(DEDUP_PROMPT_SECTION.includes("gh issue list --repo gsd-build/gsd-2 --state closed"));
    assert.ok(DEDUP_PROMPT_SECTION.includes("gh pr list --repo gsd-build/gsd-2 --state open"));
    assert.ok(DEDUP_PROMPT_SECTION.includes("gh pr list --repo gsd-build/gsd-2 --state merged"));
  });

  it("resolveDedupSection returns prompt section when enabled", () => {
    const section = resolveDedupSection(true);
    assert.strictEqual(section, DEDUP_PROMPT_SECTION);
  });

  it("resolveDedupSection returns empty string when disabled", () => {
    assert.strictEqual(resolveDedupSection(false), "");
  });

  it("resolveDedupSection returns empty string when preference is undefined (first-time opt-in not yet answered)", () => {
    assert.strictEqual(resolveDedupSection(undefined), "");
  });
});

describe("forensics dedup ordering (#2704)", () => {
  it("{{dedupSection}} appears before Investigation Protocol in the prompt template", () => {
    const prompt = readFileSync(join(gsdDir, "prompts", "forensics.md"), "utf-8");
    const dedupIndex = prompt.indexOf("{{dedupSection}}");
    const investigationIndex = prompt.indexOf("## Investigation Protocol");
    assert.ok(dedupIndex !== -1, "prompt must contain {{dedupSection}}");
    assert.ok(investigationIndex !== -1, "prompt must contain ## Investigation Protocol");
    assert.ok(
      dedupIndex < investigationIndex,
      `{{dedupSection}} (index ${dedupIndex}) must appear before Investigation Protocol (index ${investigationIndex}) — dedup should run before expensive investigation to avoid wasting tokens on already-fixed bugs`,
    );
  });

  it("DEDUP_PROMPT_SECTION contains a decision gate to skip investigation", () => {
    const source = readFileSync(join(gsdDir, "forensics.ts"), "utf-8");
    // The dedup section must instruct the agent to skip investigation when a match is found
    assert.ok(
      source.includes("Skip full investigation") || source.includes("skip full investigation") || source.includes("Skip investigation"),
      "DEDUP_PROMPT_SECTION must contain a decision gate telling the agent to skip full investigation when a duplicate is found",
    );
  });

  it("DEDUP_PROMPT_SECTION heading reflects pre-investigation role", () => {
    const source = readFileSync(join(gsdDir, "forensics.ts"), "utf-8");
    assert.ok(
      source.includes("Pre-Investigation") || source.includes("pre-investigation"),
      "DEDUP_PROMPT_SECTION heading must indicate it runs before investigation, not just before issue creation",
    );
  });
});
