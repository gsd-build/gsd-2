// Slice-level prompt builders for auto-mode dispatch.

import { loadFile, parseSummary, loadActiveOverrides, formatOverridesSection } from "./files.js";
import type { InlineLevel } from "./types.js";
import { loadPrompt, inlineTemplate } from "./prompt-loader.js";
import {
  resolveMilestoneFile, resolveSliceFile, resolveTasksDir, resolveTaskFiles,
  relMilestoneFile, relSliceFile, relSlicePath,
} from "./paths.js";
import { resolveInlineLevel, loadEffectiveGSDPreferences } from "./preferences.js";
import { computeBudgets, resolveExecutorContextWindow } from "./context-budget.js";
import { join } from "node:path";
import { capPreamble, buildSourceFilePaths } from "./auto-prompt-sections.js";
import { inlineFile, inlineFileOptional, inlineGsdRootFile, inlineDecisionsFromDb, inlineRequirementsFromDb, inlineDependencySummaries } from "./auto-file-inlining.js";
import { buildSkillActivationBlock, buildSkillDiscoveryVars } from "./auto-skill-activation.js";

function formatExecutorConstraints(): string {
  let windowTokens: number;
  try {
    const prefs = loadEffectiveGSDPreferences();
    windowTokens = resolveExecutorContextWindow(undefined, prefs?.preferences);
  } catch {
    windowTokens = 200_000;
  }
  const budgets = computeBudgets(windowTokens);
  const { min, max } = budgets.taskCountRange;
  const execWindowK = Math.round(windowTokens / 1000);
  const perTaskBudgetK = Math.round(budgets.inlineContextBudgetChars / 1000);
  return [
    `## Executor Context Constraints`,
    ``,
    `The agent that executes each task has a **${execWindowK}K token** context window.`,
    `- Recommended task count for this slice: **${min}–${max} tasks**`,
    `- Each task gets ~${perTaskBudgetK}K chars of inline context (plans, code, decisions)`,
    `- Keep individual tasks completable within a single context window — if a task needs more context than fits, split it`,
  ].join("\n");
}

export async function buildResearchSlicePrompt(
  mid: string, _midTitle: string, sid: string, sTitle: string, base: string,
): Promise<string> {
  const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
  const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
  const contextPath = resolveMilestoneFile(base, mid, "CONTEXT");
  const contextRel = relMilestoneFile(base, mid, "CONTEXT");
  const milestoneResearchPath = resolveMilestoneFile(base, mid, "RESEARCH");
  const milestoneResearchRel = relMilestoneFile(base, mid, "RESEARCH");

  const inlined: string[] = [];
  inlined.push(await inlineFile(roadmapPath, roadmapRel, "Milestone Roadmap"));
  const contextInline = await inlineFileOptional(contextPath, contextRel, "Milestone Context");
  if (contextInline) inlined.push(contextInline);
  const researchInline = await inlineFileOptional(milestoneResearchPath, milestoneResearchRel, "Milestone Research");
  if (researchInline) inlined.push(researchInline);
  const decisionsInline = await inlineDecisionsFromDb(base, mid);
  if (decisionsInline) inlined.push(decisionsInline);
  const requirementsInline = await inlineRequirementsFromDb(base, sid);
  if (requirementsInline) inlined.push(requirementsInline);
  const knowledgeInlineRS = await inlineGsdRootFile(base, "knowledge.md", "Project Knowledge");
  if (knowledgeInlineRS) inlined.push(knowledgeInlineRS);
  inlined.push(inlineTemplate("research", "Research"));

  const depContent = await inlineDependencySummaries(mid, sid, base);
  const activeOverrides = await loadActiveOverrides(base);
  const overridesInline = formatOverridesSection(activeOverrides);
  if (overridesInline) inlined.unshift(overridesInline);

  const inlinedContext = capPreamble(`## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`);

  const outputRelPath = relSliceFile(base, mid, sid, "RESEARCH");
  return loadPrompt("research-slice", {
    workingDirectory: base,
    milestoneId: mid, sliceId: sid, sliceTitle: sTitle,
    slicePath: relSlicePath(base, mid, sid),
    roadmapPath: roadmapRel,
    contextPath: contextRel,
    milestoneResearchPath: milestoneResearchRel,
    outputPath: join(base, outputRelPath),
    inlinedContext,
    dependencySummaries: depContent,
    skillActivation: buildSkillActivationBlock({
      base,
      milestoneId: mid,
      sliceId: sid,
      sliceTitle: sTitle,
      extraContext: [inlinedContext, depContent],
    }),
    ...buildSkillDiscoveryVars(),
  });
}

export async function buildPlanSlicePrompt(
  mid: string, _midTitle: string, sid: string, sTitle: string, base: string, level?: InlineLevel,
): Promise<string> {
  const inlineLevel = level ?? resolveInlineLevel();
  const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
  const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
  const researchPath = resolveSliceFile(base, mid, sid, "RESEARCH");
  const researchRel = relSliceFile(base, mid, sid, "RESEARCH");

  const inlined: string[] = [];
  inlined.push(await inlineFile(roadmapPath, roadmapRel, "Milestone Roadmap"));
  const researchInline = await inlineFileOptional(researchPath, researchRel, "Slice Research");
  if (researchInline) inlined.push(researchInline);
  if (inlineLevel !== "minimal") {
    const decisionsInline = await inlineDecisionsFromDb(base, mid, undefined, inlineLevel);
    if (decisionsInline) inlined.push(decisionsInline);
    const requirementsInline = await inlineRequirementsFromDb(base, sid, inlineLevel);
    if (requirementsInline) inlined.push(requirementsInline);
  }
  const knowledgeInlinePS = await inlineGsdRootFile(base, "knowledge.md", "Project Knowledge");
  if (knowledgeInlinePS) inlined.push(knowledgeInlinePS);
  inlined.push(inlineTemplate("plan", "Slice Plan"));
  if (inlineLevel === "full") {
    inlined.push(inlineTemplate("task-plan", "Task Plan"));
  }

  const depContent = await inlineDependencySummaries(mid, sid, base);
  const planActiveOverrides = await loadActiveOverrides(base);
  const planOverridesInline = formatOverridesSection(planActiveOverrides);
  if (planOverridesInline) inlined.unshift(planOverridesInline);

  const inlinedContext = capPreamble(`## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`);

  const executorContextConstraints = formatExecutorConstraints();

  const outputRelPath = relSliceFile(base, mid, sid, "PLAN");
  const prefs = loadEffectiveGSDPreferences();
  const commitDocsEnabled = prefs?.preferences?.git?.commit_docs !== false;
  const commitInstruction = commitDocsEnabled
    ? `Commit the plan files only: \`git add ${relSlicePath(base, mid, sid)}/ .gsd/DECISIONS.md .gitignore && git commit -m "docs(${sid}): add slice plan"\`. Do not stage .gsd/STATE.md or other runtime files — the system manages those.`
    : "Do not commit — planning docs are not tracked in git for this project.";
  return loadPrompt("plan-slice", {
    workingDirectory: base,
    milestoneId: mid, sliceId: sid, sliceTitle: sTitle,
    slicePath: relSlicePath(base, mid, sid),
    roadmapPath: roadmapRel,
    researchPath: researchRel,
    outputPath: join(base, outputRelPath),
    inlinedContext,
    dependencySummaries: depContent,
    sourceFilePaths: buildSourceFilePaths(base, mid, sid),
    executorContextConstraints,
    commitInstruction,
    skillActivation: buildSkillActivationBlock({
      base,
      milestoneId: mid,
      sliceId: sid,
      sliceTitle: sTitle,
      extraContext: [inlinedContext, depContent],
    }),
  });
}

export async function buildCompleteSlicePrompt(
  mid: string, _midTitle: string, sid: string, sTitle: string, base: string, level?: InlineLevel,
): Promise<string> {
  const inlineLevel = level ?? resolveInlineLevel();

  const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
  const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
  const slicePlanPath = resolveSliceFile(base, mid, sid, "PLAN");
  const slicePlanRel = relSliceFile(base, mid, sid, "PLAN");

  const inlined: string[] = [];
  inlined.push(await inlineFile(roadmapPath, roadmapRel, "Milestone Roadmap"));
  inlined.push(await inlineFile(slicePlanPath, slicePlanRel, "Slice Plan"));
  if (inlineLevel !== "minimal") {
    const requirementsInline = await inlineRequirementsFromDb(base, sid, inlineLevel);
    if (requirementsInline) inlined.push(requirementsInline);
  }
  const knowledgeInlineCS = await inlineGsdRootFile(base, "knowledge.md", "Project Knowledge");
  if (knowledgeInlineCS) inlined.push(knowledgeInlineCS);

  const tDir = resolveTasksDir(base, mid, sid);
  if (tDir) {
    const summaryFiles = resolveTaskFiles(tDir, "SUMMARY").sort();
    for (const file of summaryFiles) {
      const absPath = join(tDir, file);
      const content = await loadFile(absPath);
      const sRel = relSlicePath(base, mid, sid);
      const relPath = `${sRel}/tasks/${file}`;
      if (content) {
        inlined.push(`### Task Summary: ${file.replace(/-SUMMARY\.md$/i, "")}\nSource: \`${relPath}\`\n\n${content.trim()}`);
      }
    }
  }
  inlined.push(inlineTemplate("slice-summary", "Slice Summary"));
  if (inlineLevel !== "minimal") {
    inlined.push(inlineTemplate("uat", "UAT"));
  }
  const completeActiveOverrides = await loadActiveOverrides(base);
  const completeOverridesInline = formatOverridesSection(completeActiveOverrides);
  if (completeOverridesInline) inlined.unshift(completeOverridesInline);

  const inlinedContext = capPreamble(`## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`);

  const sliceRel = relSlicePath(base, mid, sid);
  const sliceSummaryPath = join(base, `${sliceRel}/${sid}-SUMMARY.md`);
  const sliceUatPath = join(base, `${sliceRel}/${sid}-UAT.md`);

  return loadPrompt("complete-slice", {
    workingDirectory: base,
    milestoneId: mid, sliceId: sid, sliceTitle: sTitle,
    slicePath: sliceRel,
    roadmapPath: join(base, roadmapRel),
    inlinedContext,
    sliceSummaryPath,
    sliceUatPath,
  });
}

export async function buildReplanSlicePrompt(
  mid: string, midTitle: string, sid: string, sTitle: string, base: string,
): Promise<string> {
  const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
  const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
  const slicePlanPath = resolveSliceFile(base, mid, sid, "PLAN");
  const slicePlanRel = relSliceFile(base, mid, sid, "PLAN");

  const inlined: string[] = [];
  inlined.push(await inlineFile(roadmapPath, roadmapRel, "Milestone Roadmap"));
  inlined.push(await inlineFile(slicePlanPath, slicePlanRel, "Current Slice Plan"));

  let blockerTaskId = "";
  const tDir = resolveTasksDir(base, mid, sid);
  if (tDir) {
    const summaryFiles = resolveTaskFiles(tDir, "SUMMARY").sort();
    for (const file of summaryFiles) {
      const absPath = join(tDir, file);
      const content = await loadFile(absPath);
      if (!content) continue;
      const summary = parseSummary(content);
      const sRel = relSlicePath(base, mid, sid);
      const relPath = `${sRel}/tasks/${file}`;
      if (summary.frontmatter.blocker_discovered) {
        blockerTaskId = summary.frontmatter.id || file.replace(/-SUMMARY\.md$/i, "");
        inlined.push(`### Blocker Task Summary: ${blockerTaskId}\nSource: \`${relPath}\`\n\n${content.trim()}`);
      }
    }
  }

  const decisionsInline = await inlineDecisionsFromDb(base, mid);
  if (decisionsInline) inlined.push(decisionsInline);
  const replanActiveOverrides = await loadActiveOverrides(base);
  const replanOverridesInline = formatOverridesSection(replanActiveOverrides);
  if (replanOverridesInline) inlined.unshift(replanOverridesInline);

  const inlinedContext = capPreamble(`## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`);

  const replanPath = join(base, `${relSlicePath(base, mid, sid)}/${sid}-REPLAN.md`);

  let captureContext = "(none)";
  try {
    const { loadReplanCaptures } = await import("./triage-resolution.js");
    const replanCaptures = loadReplanCaptures(base);
    if (replanCaptures.length > 0) {
      captureContext = replanCaptures.map(c =>
        `- **${c.id}**: "${c.text}" — ${c.rationale ?? "no rationale"}`
      ).join("\n");
    }
  } catch {
    // Non-fatal — captures module may not be available
  }

  return loadPrompt("replan-slice", {
    workingDirectory: base,
    milestoneId: mid,
    sliceId: sid,
    sliceTitle: sTitle,
    slicePath: relSlicePath(base, mid, sid),
    planPath: join(base, slicePlanRel),
    blockerTaskId,
    inlinedContext,
    replanPath,
    captureContext,
    skillActivation: buildSkillActivationBlock({
      base,
      milestoneId: mid,
      milestoneTitle: midTitle,
      sliceId: sid,
      sliceTitle: sTitle,
      extraContext: [inlinedContext, captureContext],
    }),
  });
}
