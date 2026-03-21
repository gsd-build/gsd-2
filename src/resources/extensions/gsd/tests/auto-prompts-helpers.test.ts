import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractMarkdownSection, escapeRegExp, buildSkillDiscoveryVars } from "../auto-prompts.ts";

// ─── extractMarkdownSection ────────────────────────────────────────────────

test("extractMarkdownSection returns content of matching section", () => {
  const content = "# Title\n\n## Goals\n\nBe good.\n\n## Steps\n\nDo stuff.\n";
  const result = extractMarkdownSection(content, "Goals");
  assert.equal(result, "Be good.");
});

test("extractMarkdownSection returns null when heading not found", () => {
  const result = extractMarkdownSection("# Title\n\n## Other\n\nStuff.\n", "Missing");
  assert.equal(result, null);
});

test("extractMarkdownSection returns content up to next ## heading", () => {
  const content = "## Section A\n\nContent A.\n\n## Section B\n\nContent B.\n";
  const result = extractMarkdownSection(content, "Section A");
  assert.equal(result, "Content A.");
});

test("extractMarkdownSection returns content when section is at end of file", () => {
  const content = "## First\n\nStuff.\n\n## Last\n\nTrailing content.";
  const result = extractMarkdownSection(content, "Last");
  assert.equal(result, "Trailing content.");
});

test("extractMarkdownSection handles section with special regex characters in heading", () => {
  const content = "## C++ Build\n\nCompile flags here.\n\n## Other\n\nIgnored.\n";
  const result = extractMarkdownSection(content, "C++ Build");
  assert.equal(result, "Compile flags here.");
});

test("extractMarkdownSection returns empty string for empty section", () => {
  const content = "## Section\n\n## Next\n\nContent.\n";
  const result = extractMarkdownSection(content, "Section");
  // trim() of empty/whitespace-only body → empty string, not null
  assert.equal(result, "");
});

// ─── escapeRegExp ──────────────────────────────────────────────────────────

test("escapeRegExp escapes all special regex characters", () => {
  const special = ".*+?^${}()|[]\\";
  const escaped = escapeRegExp(special);
  // If properly escaped, new RegExp(escaped) should match the literal string
  const re = new RegExp(escaped);
  assert.ok(re.test(special));
});

test("escapeRegExp leaves plain strings unchanged", () => {
  const plain = "hello world 123";
  assert.equal(escapeRegExp(plain), plain);
});

test("escapeRegExp escapes dot so it matches literal dot only", () => {
  const version = "1.2.3";
  const escaped = escapeRegExp(version);
  const re = new RegExp(`^${escaped}$`);
  assert.ok(re.test("1.2.3"));
  assert.ok(!re.test("1X2Y3"));
});

test("escapeRegExp escapes brackets so they match literals", () => {
  const input = "[T01]";
  const escaped = escapeRegExp(input);
  const re = new RegExp(escaped);
  assert.ok(re.test("[T01]"));
});

// ─── buildSkillDiscoveryVars ───────────────────────────────────────────────

test("buildSkillDiscoveryVars mode:off — returns disabled instructions", () => {
  const tmpGSDHome = mkdtempSync(join(tmpdir(), "gsd-test-"));
  const originalGSDHome = process.env.GSD_HOME;
  try {
    process.env.GSD_HOME = tmpGSDHome;
    writeFileSync(join(tmpGSDHome, "preferences.md"), [
      "---",
      "version: 1",
      'skill_discovery: "off"',
      "---",
    ].join("\n"));
    const result = buildSkillDiscoveryVars();
    assert.equal(result.skillDiscoveryMode, "off");
    assert.ok(result.skillDiscoveryInstructions.includes("disabled"), "instructions should mention disabled");
  } finally {
    process.env.GSD_HOME = originalGSDHome;
    rmSync(tmpGSDHome, { recursive: true, force: true });
  }
});

test("buildSkillDiscoveryVars mode:suggest — identifies skills but does not install", () => {
  const tmpGSDHome = mkdtempSync(join(tmpdir(), "gsd-test-"));
  const originalGSDHome = process.env.GSD_HOME;
  try {
    process.env.GSD_HOME = tmpGSDHome;
    writeFileSync(join(tmpGSDHome, "preferences.md"), [
      "---",
      "version: 1",
      'skill_discovery: "suggest"',
      "---",
    ].join("\n"));
    const result = buildSkillDiscoveryVars();
    assert.equal(result.skillDiscoveryMode, "suggest");
    assert.ok(result.skillDiscoveryInstructions.includes("npx skills find"), "instructions should include find command");
    assert.ok(!result.skillDiscoveryInstructions.includes("Install"), "suggest mode should not include Install instructions");
  } finally {
    process.env.GSD_HOME = originalGSDHome;
    rmSync(tmpGSDHome, { recursive: true, force: true });
  }
});

test("buildSkillDiscoveryVars mode:auto — includes auto-install instructions", () => {
  const tmpGSDHome = mkdtempSync(join(tmpdir(), "gsd-test-"));
  const originalGSDHome = process.env.GSD_HOME;
  try {
    process.env.GSD_HOME = tmpGSDHome;
    writeFileSync(join(tmpGSDHome, "preferences.md"), [
      "---",
      "version: 1",
      'skill_discovery: "auto"',
      "---",
    ].join("\n"));
    const result = buildSkillDiscoveryVars();
    assert.equal(result.skillDiscoveryMode, "auto");
    assert.ok(result.skillDiscoveryInstructions.includes("Install"), "auto mode should include Install instructions");
  } finally {
    process.env.GSD_HOME = originalGSDHome;
    rmSync(tmpGSDHome, { recursive: true, force: true });
  }
});
