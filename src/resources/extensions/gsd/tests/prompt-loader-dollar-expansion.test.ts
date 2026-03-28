/**
 * Regression test for prompt template variable expansion with special
 * replacement patterns ($', $`, $&) in values.
 *
 * Bug: String.replaceAll() interprets $' as "insert text after match",
 * causing exponential expansion when user content (e.g. bash commands
 * like `grep -q '^0$'`) flows through template variables.
 *
 * See: https://github.com/gsd-build/gsd-2/issues/2968
 */
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Minimal reproduction of the loadPrompt substitution logic.
 * We test the core algorithm in isolation since loadPrompt is tightly
 * coupled to its module-level cache and directory resolution.
 */

/** Buggy version — uses replaceAll directly */
function substituteVarsBuggy(content: string, vars: Record<string, string>): string {
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
}

/** Fixed version — uses split/join to avoid special replacement patterns */
function substituteVarsFixed(content: string, vars: Record<string, string>): string {
  for (const [key, value] of Object.entries(vars)) {
    content = content.split(`{{${key}}}`).join(value);
  }
  return content;
}

describe("prompt template variable substitution", () => {
  test("buggy replaceAll expands $' in values (demonstrates the bug)", () => {
    // $' in replaceAll inserts the portion of the string AFTER the match.
    // With a single variable, the expansion is modest. With multiple variables
    // processed sequentially, the expansion cascades. This test demonstrates
    // the basic mechanism: $' injects trailing content.
    const template = "Run: {{command}}\nMore content here.\nAnd more.";
    const vars = { command: "grep -q '^0$'" };

    const buggyResult = substituteVarsBuggy(template, vars);
    const fixedResult = substituteVarsFixed(template, vars);

    // The buggy result should differ from the fixed result because $' injects
    // the text after the match ("\nMore content here.\nAnd more.")
    assert.notEqual(buggyResult, fixedResult,
      "Buggy replaceAll should produce different output due to $' expansion");

    // The fixed result should be exactly what we expect
    assert.equal(fixedResult, "Run: grep -q '^0$'\nMore content here.\nAnd more.");
  });

  test("split/join substitution handles $' without expansion", () => {
    const template = "Run: {{command}}\nDone.";
    const vars = { command: "grep -q '^0$'" };

    const result = substituteVarsFixed(template, vars);

    const expected = "Run: grep -q '^0$'\nDone.";
    assert.equal(result, expected);
  });

  test("split/join substitution handles $` without expansion", () => {
    const template = "Check: {{verify}}";
    const vars = { verify: "echo $`hostname`" };

    const result = substituteVarsFixed(template, vars);

    assert.equal(result, "Check: echo $`hostname`");
  });

  test("split/join substitution handles $& without expansion", () => {
    const template = "Value: {{val}}";
    const vars = { val: "price is $&tax" };

    const result = substituteVarsFixed(template, vars);

    assert.equal(result, "Value: price is $&tax");
  });

  test("split/join substitution handles $$ without consuming it", () => {
    const template = "Cost: {{amount}}";
    const vars = { amount: "$$100" };

    const result = substituteVarsFixed(template, vars);

    assert.equal(result, "Cost: $$100");
  });

  test("multiple variables with dollar signs all substitute correctly", () => {
    const template = [
      "## Verification",
      "```bash",
      "{{step1}}",
      "{{step2}}",
      "```",
    ].join("\n");
    const vars = {
      step1: "grep -c 'foo' file.txt | grep -q '^0$' && echo 'PASS'",
      step2: "test $(wc -l < out.txt) -eq 5",
    };

    const result = substituteVarsFixed(template, vars);

    const expected = [
      "## Verification",
      "```bash",
      "grep -c 'foo' file.txt | grep -q '^0$' && echo 'PASS'",
      "test $(wc -l < out.txt) -eq 5",
      "```",
    ].join("\n");
    assert.equal(result, expected);
  });

  test("cascading expansion bug with multiple variables (demonstrates severity)", () => {
    // This simulates a realistic prompt template with slice plan content
    const template = [
      "## Task",
      "{{taskPlan}}",
      "",
      "## Slice Context",
      "{{slicePlanExcerpt}}",
      "",
      "## Instructions",
      "Execute the task above.",
    ].join("\n");

    const slicePlan = [
      "### Verification",
      "```bash",
      "grep -c 'error' log.txt | grep -q '^0$' && echo PASS",
      "```",
    ].join("\n");

    const vars = {
      taskPlan: "Do something simple.",
      slicePlanExcerpt: slicePlan,
    };

    const buggyResult = substituteVarsBuggy(template, vars);
    const fixedResult = substituteVarsFixed(template, vars);

    // Fixed result should be a reasonable size
    assert.ok(
      fixedResult.length < template.length + slicePlan.length + 100,
      `Fixed result should be reasonably sized, got ${fixedResult.length}`,
    );

    // Buggy result expands due to $' injecting the template remainder
    assert.ok(
      buggyResult.length > fixedResult.length,
      `Buggy result (${buggyResult.length}) should be larger than fixed (${fixedResult.length})`,
    );
  });
});
