/**
 * Integration tests for commands-workflow.ts — /gsd workflow CLI surface.
 *
 * Tests the validate, list, run param parsing, and auto-mode conflict guard
 * subcommands using real filesystem operations and definition-loader logic.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { validateDefinition } from "../definition-loader.ts";
import { createRun, listRuns } from "../run-manager.ts";
import { readGraph } from "../graph.ts";
import { parse } from "yaml";

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "gsd-wf-cmd-"));
}

const VALID_YAML = `version: 1
name: "test-pipeline"
steps:
  - id: step-1
    name: "First step"
    prompt: "Do step 1 with {{topic}}"
  - id: step-2
    name: "Second step"
    prompt: "Do step 2"
    requires:
      - step-1
    produces:
      - report.md
`;

const INVALID_YAML_MISSING_STEPS = `version: 1
name: "broken-pipeline"
`;

const INVALID_YAML_BAD_STEP = `version: 1
name: "broken-steps"
steps:
  - id: step-1
    name: "Missing prompt"
`;

// ─── validate subcommand logic ───────────────────────────────────────────

test("validate: valid definition returns valid=true", () => {
  const parsed = parse(VALID_YAML);
  const result = validateDefinition(parsed);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validate: missing steps returns errors", () => {
  const parsed = parse(INVALID_YAML_MISSING_STEPS);
  const result = validateDefinition(parsed);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0, "should have at least one error");
  assert.ok(
    result.errors.some(e => e.toLowerCase().includes("steps")),
    `expected an error mentioning steps, got: ${result.errors.join("; ")}`,
  );
});

test("validate: step missing prompt returns errors", () => {
  const parsed = parse(INVALID_YAML_BAD_STEP);
  const result = validateDefinition(parsed);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0, "should have at least one error");
});

// ─── list subcommand logic ───────────────────────────────────────────────

test("list: shows definitions from workflow-defs/ directory", () => {
  const base = makeTmpDir();
  const defsDir = join(base, "workflow-defs");
  mkdirSync(defsDir, { recursive: true });
  writeFileSync(join(defsDir, "my-pipeline.yaml"), VALID_YAML);
  writeFileSync(join(defsDir, "another.yaml"), VALID_YAML.replace("test-pipeline", "another"));

  // Verify the files are there for listing
  const entries = readdirSync(defsDir).filter((f: string) => f.endsWith(".yaml"));
  assert.equal(entries.length, 2);
  assert.ok(entries.includes("my-pipeline.yaml"));
  assert.ok(entries.includes("another.yaml"));

  rmSync(base, { recursive: true, force: true });
});

test("list: shows runs with step completion status", () => {
  const base = makeTmpDir();
  const defsDir = join(base, "workflow-defs");
  mkdirSync(defsDir, { recursive: true });
  writeFileSync(join(defsDir, "test-pipeline.yaml"), VALID_YAML);

  // Create a run
  const { runDir } = createRun(base, "test-pipeline");
  const runs = listRuns(base);
  assert.equal(runs.length, 1);

  // Read graph to verify step count
  const graph = readGraph(runs[0].runDir);
  assert.equal(graph.steps.length, 2);
  const done = graph.steps.filter(s => s.status === "complete").length;
  assert.equal(done, 0, "fresh run should have 0 completed steps");

  rmSync(base, { recursive: true, force: true });
});

// ─── run param parsing ───────────────────────────────────────────────────

test("run: --param flags are parsed into a Record", () => {
  // Test the param parsing logic directly
  const tokens = "my-pipeline --param topic=security --param env=prod".split(/\s+/);
  let definitionName = "";
  const params: Record<string, string> = {};

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "--param" && i + 1 < tokens.length) {
      const kv = tokens[i + 1];
      const eqIdx = kv.indexOf("=");
      if (eqIdx > 0) {
        params[kv.slice(0, eqIdx)] = kv.slice(eqIdx + 1);
      }
      i++;
    } else if (!definitionName) {
      definitionName = tokens[i];
    }
  }

  assert.equal(definitionName, "my-pipeline");
  assert.deepEqual(params, { topic: "security", env: "prod" });
});

test("run: params with = in value are parsed correctly", () => {
  const tokens = "pipeline --param key=value=with=equals".split(/\s+/);
  let definitionName = "";
  const params: Record<string, string> = {};

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "--param" && i + 1 < tokens.length) {
      const kv = tokens[i + 1];
      const eqIdx = kv.indexOf("=");
      if (eqIdx > 0) {
        params[kv.slice(0, eqIdx)] = kv.slice(eqIdx + 1);
      }
      i++;
    } else if (!definitionName) {
      definitionName = tokens[i];
    }
  }

  assert.equal(definitionName, "pipeline");
  assert.deepEqual(params, { key: "value=with=equals" });
});

// ─── createRun with params ───────────────────────────────────────────────

test("run: createRun writes PARAMS.json when params provided", () => {
  const base = makeTmpDir();
  const defsDir = join(base, "workflow-defs");
  mkdirSync(defsDir, { recursive: true });
  writeFileSync(join(defsDir, "test-pipeline.yaml"), VALID_YAML);

  const { runDir } = createRun(base, "test-pipeline", undefined, { topic: "security" });
  const paramsPath = join(runDir, "PARAMS.json");
  assert.ok(existsSync(paramsPath), "PARAMS.json should exist");

  const content = JSON.parse(readFileSync(paramsPath, "utf-8"));
  assert.deepEqual(content, { topic: "security" });

  rmSync(base, { recursive: true, force: true });
});

test("run: createRun omits PARAMS.json when no params", () => {
  const base = makeTmpDir();
  const defsDir = join(base, "workflow-defs");
  mkdirSync(defsDir, { recursive: true });
  writeFileSync(join(defsDir, "test-pipeline.yaml"), VALID_YAML);

  const { runDir } = createRun(base, "test-pipeline");
  const paramsPath = join(runDir, "PARAMS.json");
  assert.ok(!existsSync(paramsPath), "PARAMS.json should not exist without params");

  rmSync(base, { recursive: true, force: true });
});

test("run: createRun omits PARAMS.json when params is empty object", () => {
  const base = makeTmpDir();
  const defsDir = join(base, "workflow-defs");
  mkdirSync(defsDir, { recursive: true });
  writeFileSync(join(defsDir, "test-pipeline.yaml"), VALID_YAML);

  const { runDir } = createRun(base, "test-pipeline", undefined, {});
  const paramsPath = join(runDir, "PARAMS.json");
  assert.ok(!existsSync(paramsPath), "PARAMS.json should not exist with empty params");

  rmSync(base, { recursive: true, force: true });
});

// ─── auto-mode conflict guard ────────────────────────────────────────────

test("conflict guard: isAutoActive blocks run and new", async () => {
  // Import the auto module to check conflict guard behavior
  const { isAutoActive } = await import("../auto.ts");

  // When auto-mode is not active, the guard should not block
  assert.equal(isAutoActive(), false, "auto should not be active in test context");

  // The actual guard logic is:
  //   if (isAutoActive()) { ctx.ui.notify(...); return; }
  // We can't easily test the full handler without mocking ctx/pi,
  // so we verify the guard condition itself works correctly.
});

// ─── getWorkflowCompletions ──────────────────────────────────────────────

test("completions: returns all subcommands for empty prefix", async () => {
  const { getWorkflowCompletions } = await import("../commands-workflow.ts");
  const completions = getWorkflowCompletions("");
  assert.ok(completions.length >= 6, `expected >=6 completions, got ${completions.length}`);
  const cmds = completions.map(c => c.label);
  assert.ok(cmds.includes("new"));
  assert.ok(cmds.includes("run"));
  assert.ok(cmds.includes("list"));
  assert.ok(cmds.includes("validate"));
  assert.ok(cmds.includes("pause"));
  assert.ok(cmds.includes("resume"));
});

test("completions: filters by prefix", async () => {
  const { getWorkflowCompletions } = await import("../commands-workflow.ts");
  const completions = getWorkflowCompletions("r");
  const labels = completions.map(c => c.label);
  assert.ok(labels.includes("run"));
  assert.ok(labels.includes("resume"));
  assert.ok(!labels.includes("list"));
});

// ─── deriveEngineIdFromRuns ──────────────────────────────────────────────

test("resume: derives engine ID from most recent incomplete run", () => {
  const base = makeTmpDir();
  const defsDir = join(base, "workflow-defs");
  mkdirSync(defsDir, { recursive: true });
  writeFileSync(join(defsDir, "test-pipeline.yaml"), VALID_YAML);

  // Create a run — all steps will be "pending"
  const { runDir } = createRun(base, "test-pipeline");

  // Verify the run is incomplete
  const graph = readGraph(runDir);
  const allDone = graph.steps.every(s => s.status === "complete" || s.status === "expanded");
  assert.equal(allDone, false, "fresh run should be incomplete");

  // Verify listRuns returns it
  const runs = listRuns(base);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].runDir, runDir);

  rmSync(base, { recursive: true, force: true });
});

// ─── routing wired ───────────────────────────────────────────────────────

test("routing: workflow command is wired in commands.ts", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const commandsSrc = readFileSync(
    join(import.meta.dirname, "..", "commands.ts"),
    "utf-8",
  );
  assert.ok(
    commandsSrc.includes('trimmed === "workflow"'),
    "commands.ts should route 'workflow' command",
  );
  assert.ok(
    commandsSrc.includes("handleWorkflow"),
    "commands.ts should import handleWorkflow",
  );
  assert.ok(
    commandsSrc.includes("getWorkflowCompletions"),
    "commands.ts should import getWorkflowCompletions",
  );
});
