// Project/App: GSD-2
// File Purpose: Verifies GSD planning prompt placeholder rendering and DB-backed tool guidance.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const worktreePromptsDir = join(__dirname, "..", "prompts");
const fixtureRoot = process.env.GSD_TEST_WORKSPACE_ROOT ?? process.cwd();

function loadPrompt(name: string, vars: Record<string, string> = {}): string {
  const path = join(worktreePromptsDir, `${name}.md`);
  let content = readFileSync(path, "utf-8");
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content.trim();
}

const BASE_VARS = {
  workingDirectory: fixtureRoot,
  milestoneId: "M001", sliceId: "S01", sliceTitle: "Test Slice",
  slicePath: ".gsd/milestones/M001/slices/S01",
  roadmapPath: ".gsd/milestones/M001/M001-ROADMAP.md",
  researchPath: ".gsd/milestones/M001/slices/S01/S01-RESEARCH.md",
  outputPath: join(fixtureRoot, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md"),
  inlinedContext: "--- test inlined context ---",
  dependencySummaries: "", executorContextConstraints: "",
  sourceFilePaths: "- **Requirements**: `.gsd/REQUIREMENTS.md`",
  templatesDir: join(fixtureRoot, "templates"),
  planTemplatePath: "C:\\Users\\Test\\.gsd\\agent\\extensions\\gsd\\templates\\plan.md",
  taskPlanTemplatePath: "C:\\Users\\Test\\.gsd\\agent\\extensions\\gsd\\templates\\task-plan.md",
  skillActivation: "Load the relevant skills.",
};

const DEFAULT_SKILL_ACTIVATION = "If a `GSD Skill Preferences` block is present in system context, use it and the `<available_skills>` catalog in your system prompt to decide which skills to load and follow for this unit, without relaxing required verification or artifact rules.";

function loadPromptWithDefaultSkillActivation(name: string, vars: Record<string, string> = {}): string {
  return loadPrompt(name, { skillActivation: DEFAULT_SKILL_ACTIVATION, ...vars });
}

function promptUsesSkillActivation(name: string): boolean {
  const path = join(worktreePromptsDir, `${name}.md`);
  const content = readFileSync(path, "utf-8");
  return content.includes("{{skillActivation}}");
}

test("plan-slice prompt: commit instruction says do not commit (external state)", () => {
  const result = loadPrompt("plan-slice", { ...BASE_VARS, commitInstruction: "Do not commit planning artifacts — .gsd/ is managed externally." });
  assert.ok(result.includes("Do not commit planning artifacts"));
  assert.ok(!result.includes("{{commitInstruction}}"));
});

test("plan-slice prompt: all variables substituted", () => {
  const result = loadPrompt("plan-slice", { ...BASE_VARS, commitInstruction: "Commit: `docs(S01): add slice plan`" });
  assert.ok(!result.includes("{{"));
  assert.ok(result.includes("M001"));
  assert.ok(result.includes("S01"));
});

test("plan-slice prompt: DB-backed tool names survive template substitution", () => {
  const result = loadPrompt("plan-slice", { ...BASE_VARS, commitInstruction: "Do not commit." });
  assert.ok(result.includes("gsd_plan_slice"), "gsd_plan_slice should appear in rendered prompt");
  assert.ok(result.includes("gsd_plan_task"), "gsd_plan_task should appear in rendered prompt");
  assert.ok(result.includes("canonical write path"), "canonical write path language should survive substitution");
});

test("plan-slice prompt: compact planning gates survive template substitution", () => {
  const result = loadPrompt("plan-slice", { ...BASE_VARS, commitInstruction: "Do not commit." });
  assert.ok(result.includes("planning-dispatch"), "planning-dispatch policy should remain visible");
  assert.ok(result.includes("Bias toward \"roadmap is fine.\""), "roadmap reassessment brake should remain visible");
  assert.ok(result.includes("Self-audit before finishing"), "self-audit gate should remain visible");
  assert.ok(result.includes("Quality gates: non-trivial slices/tasks include specific Q3-Q7 coverage where applicable."));
  assert.ok(result.includes("C:\\Users\\Test\\.gsd\\agent\\extensions\\gsd\\templates\\plan.md"));
  assert.ok(result.includes("C:\\Users\\Test\\.gsd\\agent\\extensions\\gsd\\templates\\task-plan.md"));
  assert.ok(!result.includes("{{templatesDir}}/plan.md"));
  assert.ok(!result.includes("{{templatesDir}}/task-plan.md"));
  assert.ok(!result.includes("{{"));
});

test("plan-slice prompt: footer references gsd_plan_slice tool, not direct write", () => {
  const result = loadPrompt("plan-slice", { ...BASE_VARS, commitInstruction: "Do not commit." });
  assert.ok(
    result.includes("MUST call `gsd_plan_slice`"),
    "footer should instruct calling gsd_plan_slice tool",
  );
  assert.ok(
    !result.includes("MUST write the file"),
    "footer should not instruct direct file write",
  );
});

test("domain-work prompts use skillActivation placeholder", () => {
  const prompts = [
    "research-milestone",
    "plan-milestone",
    "research-slice",
    "plan-slice",
    "execute-task",
    "guided-research-slice",
    "guided-resume-task",
  ];

  for (const name of prompts) {
    assert.ok(promptUsesSkillActivation(name), `${name}.md should contain {{skillActivation}}`);
  }
});

test("skillActivation default leaves no unresolved placeholder", () => {
  const result = loadPromptWithDefaultSkillActivation("execute-task", {
    workingDirectory: fixtureRoot,
    milestoneId: "M001",
    sliceId: "S01",
    sliceTitle: "Test Slice",
    taskId: "T01",
    taskTitle: "Implement feature",
    planPath: ".gsd/milestones/M001/slices/S01/S01-PLAN.md",
    taskPlanPath: ".gsd/milestones/M001/slices/S01/tasks/T01-PLAN.md",
    taskPlanInline: "Task plan",
    slicePlanExcerpt: "Slice excerpt",
    carryForwardSection: "Carry forward",
    resumeSection: "Resume",
    priorTaskLines: "- (no prior tasks)",
    templatesDir: join(fixtureRoot, "templates"),
    taskSummaryPath: join(fixtureRoot, ".gsd", "milestones", "M001", "slices", "S01", "tasks", "T01-SUMMARY.md"),
    inlinedTemplates: "Template",
    verificationBudget: "~10K chars",
    overridesSection: "",
  });

  assert.ok(!result.includes("{{skillActivation}}"));
  assert.ok(result.includes(DEFAULT_SKILL_ACTIVATION));
});

test("custom skillActivation is substituted into execute-task", () => {
  const result = loadPrompt("execute-task", {
    workingDirectory: fixtureRoot,
    milestoneId: "M001",
    sliceId: "S01",
    sliceTitle: "Test Slice",
    taskId: "T01",
    taskTitle: "Implement feature",
    planPath: ".gsd/milestones/M001/slices/S01/S01-PLAN.md",
    taskPlanPath: ".gsd/milestones/M001/slices/S01/tasks/T01-PLAN.md",
    taskPlanInline: "Task plan",
    slicePlanExcerpt: "Slice excerpt",
    carryForwardSection: "Carry forward",
    resumeSection: "Resume",
    priorTaskLines: "- (no prior tasks)",
    templatesDir: join(fixtureRoot, "templates"),
    taskSummaryPath: join(fixtureRoot, ".gsd", "milestones", "M001", "slices", "S01", "tasks", "T01-SUMMARY.md"),
    inlinedTemplates: "Template",
    verificationBudget: "~10K chars",
    overridesSection: "",
    skillActivation: "Load React and accessibility skills first.",
  });

  assert.ok(result.includes("Load React and accessibility skills first."));
  assert.ok(!result.includes("{{skillActivation}}"));
});

test("guided resume prompt substitutes skillActivation", () => {
  const result = loadPrompt("guided-resume-task", {
    milestoneId: "M001",
    sliceId: "S01",
    skillActivation: "Load debugging skill first.",
  });

  assert.ok(result.includes("Load debugging skill first."));
  assert.ok(!result.includes("{{skillActivation}}"));
});

test("research-milestone prompt substitutes skillActivation", () => {
  const result = loadPrompt("research-milestone", {
    workingDirectory: fixtureRoot,
    milestoneId: "M001",
    milestoneTitle: "Test Milestone",
    milestonePath: ".gsd/milestones/M001",
    contextPath: ".gsd/milestones/M001/M001-CONTEXT.md",
    outputPath: join(fixtureRoot, ".gsd", "milestones", "M001", "M001-RESEARCH.md"),
    inlinedContext: "Context",
    skillDiscoveryMode: "manual",
    skillDiscoveryInstructions: " Discover skills manually.",
    skillActivation: "Load research skills first.",
  });

  assert.ok(result.includes("Load research skills first."));
  assert.ok(!result.includes("{{skillActivation}}"));
});

test("research-milestone prompt references gsd_summary_save, not direct write", () => {
  const result = loadPrompt("research-milestone", {
    workingDirectory: fixtureRoot,
    milestoneId: "M001",
    milestoneTitle: "Test Milestone",
    milestonePath: ".gsd/milestones/M001",
    contextPath: ".gsd/milestones/M001/M001-CONTEXT.md",
    outputPath: join(fixtureRoot, ".gsd", "milestones", "M001", "M001-RESEARCH.md"),
    inlinedContext: "Context",
    skillDiscoveryMode: "manual",
    skillDiscoveryInstructions: " Discover skills manually.",
    skillActivation: "Load research skills first.",
  });

  assert.ok(
    result.includes("gsd_summary_save"),
    "research-milestone should reference gsd_summary_save tool",
  );
  assert.ok(
    result.includes('artifact_type: "RESEARCH"'),
    "research-milestone should specify RESEARCH artifact type",
  );
  assert.ok(
    !result.includes("MUST write the file"),
    "research-milestone should not instruct direct file write",
  );
});

test("research-slice prompt substitutes skillActivation", () => {
  const result = loadPrompt("research-slice", {
    workingDirectory: fixtureRoot,
    milestoneId: "M001",
    sliceId: "S01",
    sliceTitle: "Test Slice",
    slicePath: ".gsd/milestones/M001/slices/S01",
    roadmapPath: ".gsd/milestones/M001/M001-ROADMAP.md",
    contextPath: ".gsd/milestones/M001/M001-CONTEXT.md",
    milestoneResearchPath: ".gsd/milestones/M001/M001-RESEARCH.md",
    outputPath: join(fixtureRoot, ".gsd", "milestones", "M001", "slices", "S01", "S01-RESEARCH.md"),
    inlinedContext: "Context",
    dependencySummaries: "",
    skillDiscoveryMode: "manual",
    skillDiscoveryInstructions: " Discover skills manually.",
    skillActivation: "Load slice research skills first.",
  });

  assert.ok(result.includes("Load slice research skills first."));
  assert.ok(!result.includes("{{skillActivation}}"));
});

test("plan-milestone prompt substitutes skillActivation", () => {
  const result = loadPrompt("plan-milestone", {
    workingDirectory: fixtureRoot,
    milestoneId: "M001",
    milestoneTitle: "Test Milestone",
    milestonePath: ".gsd/milestones/M001",
    contextPath: ".gsd/milestones/M001/M001-CONTEXT.md",
    researchPath: ".gsd/milestones/M001/M001-RESEARCH.md",
    researchOutputPath: join(fixtureRoot, ".gsd", "milestones", "M001", "M001-RESEARCH.md"),
    outputPath: join(fixtureRoot, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    secretsOutputPath: join(fixtureRoot, ".gsd", "milestones", "M001", "M001-SECRETS.md"),
    inlinedContext: "Context",
    sourceFilePaths: "- source",
    skillDiscoveryMode: "manual",
    skillDiscoveryInstructions: " Discover skills manually.",
    skillActivation: "Load milestone planning skills first.",
  });

  assert.ok(result.includes("Load milestone planning skills first."));
  assert.ok(!result.includes("{{skillActivation}}"));
});

test("plan-milestone prompt: compact planning gates survive template substitution", () => {
  const result = loadPrompt("plan-milestone", {
    workingDirectory: fixtureRoot,
    milestoneId: "M001",
    milestoneTitle: "Test Milestone",
    milestonePath: ".gsd/milestones/M001",
    contextPath: ".gsd/milestones/M001/M001-CONTEXT.md",
    researchPath: ".gsd/milestones/M001/M001-RESEARCH.md",
    researchOutputPath: join(fixtureRoot, ".gsd", "milestones", "M001", "M001-RESEARCH.md"),
    outputPath: join(fixtureRoot, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    secretsOutputPath: join(fixtureRoot, ".gsd", "milestones", "M001", "M001-SECRETS.md"),
    inlinedContext: "Context",
    sourceFilePaths: "- source",
    skillDiscoveryMode: "manual",
    skillDiscoveryInstructions: " Discover skills manually.",
    skillActivation: "Load milestone planning skills first.",
  });

  assert.ok(result.includes("Already Planned? Soft Brake"));
  assert.ok(result.includes("gsd_plan_milestone"));
  assert.ok(result.includes("Dependency format is comma-separated"));
  assert.ok(result.includes("phases.progressive_planning"));
  assert.ok(result.includes("Single-Slice Fast Path"));
  assert.ok(result.includes("Secrets Manifest"));
  assert.ok(!result.includes("{{"));
});

test("guided research slice prompt substitutes skillActivation", () => {
  const result = loadPrompt("guided-research-slice", {
    milestoneId: "M001",
    sliceId: "S01",
    sliceTitle: "Test Slice",
    inlinedTemplates: "Templates",
    skillActivation: "Load guided research skills first.",
  });

  assert.ok(result.includes("Load guided research skills first."));
  assert.ok(!result.includes("{{skillActivation}}"));
});
