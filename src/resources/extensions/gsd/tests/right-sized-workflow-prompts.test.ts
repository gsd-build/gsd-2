import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildCompleteMilestonePrompt, buildPlanMilestonePrompt } from "../auto-prompts.ts";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    env: { ...process.env, GIT_AUTHOR_NAME: "Test User", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test User", GIT_COMMITTER_EMAIL: "test@example.com" },
  }).trim();
}

function makeRepo(files: Record<string, string>): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-right-size-"));
  git(base, ["init", "-b", "main"]);
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  writeFileSync(join(base, ".gsd", "milestones", "M001", "M001-CONTEXT.md"), "# Context\n\nTest milestone.");
  for (const [path, content] of Object.entries(files)) {
    const abs = join(base, path);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  git(base, ["add", "."]);
  git(base, ["commit", "-m", "init"]);
  return base;
}

function writeCompleteMilestoneFiles(base: string, validation: string): void {
  const dir = join(base, ".gsd", "milestones", "M001");
  mkdirSync(join(dir, "slices", "S01"), { recursive: true });
  writeFileSync(join(dir, "M001-ROADMAP.md"), "# M001\n\n## Slices\n- [x] **S01: One** `risk:low` `depends:[]`\n  > Done\n");
  writeFileSync(join(dir, "M001-VALIDATION.md"), validation);
  writeFileSync(join(dir, "slices", "S01", "S01-SUMMARY.md"), "# S01 Summary\n\n**Verification:** passed\n");
}

function validationMetadata(): string {
  return [
    "validation_metadata:",
    "  covered_artifacts:",
    "    - `.gsd/milestones/M001/M001-VALIDATION.md`",
    "    - `.gsd/milestones/M001/M001-ROADMAP.md`",
    "    - `.gsd/milestones/M001/slices/S01/S01-SUMMARY.md`",
  ].join("\n");
}

test("plan-milestone prompt includes tiny untyped project classification and one-slice guidance", async () => {
  const base = makeRepo({ "index.html": "<!doctype html>\n<title>Test</title>\n" });
  try {
    const prompt = await buildPlanMilestonePrompt("M001", "Polish static page", base, "minimal");
    assert.match(prompt, /\*\*Kind:\*\* untyped-existing/);
    assert.match(prompt, /\*\*Content files:\*\* 1/);
    assert.match(prompt, /`index\.html`/);
    assert.match(prompt, /Prefer exactly one slice/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("plan-milestone prompt includes small untyped project 1-2 slice guidance", async () => {
  const base = makeRepo({
    "index.html": "html",
    "README.md": "readme",
    "styles.css": "body {}",
  });
  try {
    const prompt = await buildPlanMilestonePrompt("M001", "Polish static files", base, "minimal");
    assert.match(prompt, /\*\*Kind:\*\* untyped-existing/);
    assert.match(prompt, /\*\*Content files:\*\* 3/);
    assert.match(prompt, /Prefer 1-2 slices/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("plan-milestone prompt keeps normal guidance for typed projects", async () => {
  const base = makeRepo({
    "package.json": "{\"scripts\":{\"test\":\"node --test\"}}\n",
    "src/index.js": "console.log('ok');\n",
  });
  try {
    const prompt = await buildPlanMilestonePrompt("M001", "Update app", base, "minimal");
    assert.match(prompt, /\*\*Kind:\*\* typed-existing/);
    assert.match(prompt, /Use normal ecosystem-aware planning guidance/);
    assert.doesNotMatch(prompt, /Prefer exactly one slice/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("workflow docs no longer contain blanket 4-10 slice guidance", () => {
  const docs = readFileSync(join(process.cwd(), "src", "resources", "GSD-WORKFLOW.md"), "utf-8");
  assert.doesNotMatch(docs, /4-10 slices/);
  assert.match(docs, /1-10 slices/);
  assert.match(docs, /single-file/);
});

test("prompt templates carry right-sized planning and closeout mode guidance", () => {
  const planTemplate = readFileSync(join(process.cwd(), "src", "resources", "extensions", "gsd", "prompts", "plan-milestone.md"), "utf-8");
  const completeTemplate = readFileSync(join(process.cwd(), "src", "resources", "extensions", "gsd", "prompts", "complete-milestone.md"), "utf-8");

  assert.match(planTemplate, /Use 1-10 slices, sized to the work/);
  assert.match(planTemplate, /tiny\/single-file\/static work should usually be one slice/);
  assert.match(planTemplate, /untyped-existing/);
  assert.match(completeTemplate, /Closeout Review Mode/);
  assert.match(completeTemplate, /passing validation artifact is present/);
  assert.doesNotMatch(completeTemplate, /^### Delegate Review Work/m);
});

test("complete-milestone prompt trusts passing validation artifact", async () => {
  const base = makeRepo({ "index.html": "<!doctype html>\n<title>Test</title>\n" });
  try {
    writeCompleteMilestoneFiles(base, `---\nverdict: pass\nremediation_round: 0\n---\n\n# Validation\n${validationMetadata()}\n\nAll checks passed.`);
    const prompt = await buildCompleteMilestonePrompt("M001", "Polish static page", base, "minimal");
    assert.match(prompt, /Passing Validation Artifact/);
    assert.match(prompt, /Treat it as authoritative/);
    assert.match(prompt, /Do not delegate fresh reviewer\/security\/tester audits/);
    assert.match(prompt, /All checks passed/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("complete-milestone prompt trusts centralized markdown body pass verdict", async () => {
  const base = makeRepo({ "index.html": "<!doctype html>\n<title>Test</title>\n" });
  try {
    writeCompleteMilestoneFiles(base, `# Validation\n\n**Verdict:** PASS\n\n${validationMetadata()}\n\nAll checks passed.`);
    const prompt = await buildCompleteMilestonePrompt("M001", "Polish static page", base, "minimal");
    assert.match(prompt, /Passing Validation Artifact/);
    assert.match(prompt, /Treat it as authoritative/);
    assert.match(prompt, /Do not delegate fresh reviewer\/security\/tester audits/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("complete-milestone prompt does not trust stale pass validation without metadata", async () => {
  const base = makeRepo({ "index.html": "<!doctype html>\n<title>Test</title>\n" });
  try {
    writeCompleteMilestoneFiles(base, "---\nverdict: pass\nremediation_round: 0\n---\n\n# Validation\nAll checks passed.");
    const prompt = await buildCompleteMilestonePrompt("M001", "Polish static page", base, "minimal");
    assert.match(prompt, /Validation Requires Attention/);
    assert.match(prompt, /missing freshness metadata/);
    assert.doesNotMatch(prompt, /Passing Validation Artifact/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("complete-milestone prompt does not trust pass validation missing current summary coverage", async () => {
  const base = makeRepo({ "index.html": "<!doctype html>\n<title>Test</title>\n" });
  try {
    writeCompleteMilestoneFiles(base, [
      "---",
      "verdict: pass",
      "remediation_round: 0",
      "---",
      "",
      "# Validation",
      "validation_metadata:",
      "  covered_artifacts:",
      "    - `.gsd/milestones/M001/M001-VALIDATION.md`",
      "    - `.gsd/milestones/M001/M001-ROADMAP.md`",
      "",
      "All checks passed.",
    ].join("\n"));
    const prompt = await buildCompleteMilestonePrompt("M001", "Polish static page", base, "minimal");
    assert.match(prompt, /Validation Requires Attention/);
    assert.match(prompt, /does not cover current milestone artifacts/);
    assert.doesNotMatch(prompt, /Passing Validation Artifact/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("complete-milestone prompt keeps deeper review path without passing validation", async () => {
  const base = makeRepo({ "index.html": "<!doctype html>\n<title>Test</title>\n" });
  try {
    writeCompleteMilestoneFiles(base, "---\nverdict: needs-attention\nremediation_round: 0\n---\n\n# Validation\nFix gaps.");
    const prompt = await buildCompleteMilestonePrompt("M001", "Polish static page", base, "minimal");
    assert.match(prompt, /Validation Requires Attention/);
    assert.match(prompt, /verdict `needs-attention`/);
    assert.match(prompt, /Use `subagent` for review work needing fresh context/i);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
