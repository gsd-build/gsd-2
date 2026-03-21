// Milestone-level prompt builders for auto-mode dispatch.

import { loadFile, parseRoadmap, loadActiveOverrides, formatOverridesSection } from "./files.js";
import type { InlineLevel } from "./types.js";
import { loadPrompt, inlineTemplate } from "./prompt-loader.js";
import {
  resolveMilestoneFile, resolveSliceFile, relMilestoneFile, relSliceFile,
  relMilestonePath,
} from "./paths.js";
import { resolveInlineLevel } from "./preferences.js";
import { join } from "node:path";
import { capPreamble, buildSourceFilePaths } from "./auto-prompt-sections.js";
import { inlineFile, inlineFileOptional, inlineGsdRootFile, inlineDecisionsFromDb, inlineRequirementsFromDb, inlineProjectFromDb } from "./auto-file-inlining.js";
import { buildSkillActivationBlock, buildSkillDiscoveryVars } from "./auto-skill-activation.js";

export async function buildResearchMilestonePrompt(mid: string, midTitle: string, base: string): Promise<string> {
  const contextPath = resolveMilestoneFile(base, mid, "CONTEXT");
  const contextRel = relMilestoneFile(base, mid, "CONTEXT");

  const inlined: string[] = [];
  inlined.push(await inlineFile(contextPath, contextRel, "Milestone Context"));
  const projectInline = await inlineProjectFromDb(base);
  if (projectInline) inlined.push(projectInline);
  const requirementsInline = await inlineRequirementsFromDb(base);
  if (requirementsInline) inlined.push(requirementsInline);
  const decisionsInline = await inlineDecisionsFromDb(base, mid);
  if (decisionsInline) inlined.push(decisionsInline);
  const knowledgeInlineRM = await inlineGsdRootFile(base, "knowledge.md", "Project Knowledge");
  if (knowledgeInlineRM) inlined.push(knowledgeInlineRM);
  inlined.push(inlineTemplate("research", "Research"));

  const inlinedContext = capPreamble(`## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`);

  const outputRelPath = relMilestoneFile(base, mid, "RESEARCH");
  return loadPrompt("research-milestone", {
    workingDirectory: base,
    milestoneId: mid, milestoneTitle: midTitle,
    milestonePath: relMilestonePath(base, mid),
    contextPath: contextRel,
    outputPath: join(base, outputRelPath),
    inlinedContext,
    skillActivation: buildSkillActivationBlock({
      base,
      milestoneId: mid,
      milestoneTitle: midTitle,
      extraContext: [inlinedContext],
    }),
    ...buildSkillDiscoveryVars(),
  });
}

export async function buildPlanMilestonePrompt(mid: string, midTitle: string, base: string, level?: InlineLevel): Promise<string> {
  const inlineLevel = level ?? resolveInlineLevel();
  const contextPath = resolveMilestoneFile(base, mid, "CONTEXT");
  const contextRel = relMilestoneFile(base, mid, "CONTEXT");
  const researchPath = resolveMilestoneFile(base, mid, "RESEARCH");
  const researchRel = relMilestoneFile(base, mid, "RESEARCH");

  const inlined: string[] = [];
  inlined.push(await inlineFile(contextPath, contextRel, "Milestone Context"));
  const researchInline = await inlineFileOptional(researchPath, researchRel, "Milestone Research");
  if (researchInline) inlined.push(researchInline);
  const { inlinePriorMilestoneSummary } = await import("./files.js");
  const priorSummaryInline = await inlinePriorMilestoneSummary(mid, base);
  if (priorSummaryInline) inlined.push(priorSummaryInline);
  if (inlineLevel !== "minimal") {
    const projectInline = await inlineProjectFromDb(base);
    if (projectInline) inlined.push(projectInline);
    const requirementsInline = await inlineRequirementsFromDb(base, undefined, inlineLevel);
    if (requirementsInline) inlined.push(requirementsInline);
    const decisionsInline = await inlineDecisionsFromDb(base, mid, undefined, inlineLevel);
    if (decisionsInline) inlined.push(decisionsInline);
  }
  const knowledgeInlinePM = await inlineGsdRootFile(base, "knowledge.md", "Project Knowledge");
  if (knowledgeInlinePM) inlined.push(knowledgeInlinePM);
  inlined.push(inlineTemplate("roadmap", "Roadmap"));
  if (inlineLevel === "full") {
    inlined.push(inlineTemplate("decisions", "Decisions"));
    inlined.push(inlineTemplate("plan", "Slice Plan"));
    inlined.push(inlineTemplate("task-plan", "Task Plan"));
    inlined.push(inlineTemplate("secrets-manifest", "Secrets Manifest"));
  } else if (inlineLevel === "standard") {
    inlined.push(inlineTemplate("decisions", "Decisions"));
    inlined.push(inlineTemplate("plan", "Slice Plan"));
    inlined.push(inlineTemplate("task-plan", "Task Plan"));
  }

  const inlinedContext = capPreamble(`## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`);

  const outputRelPath = relMilestoneFile(base, mid, "ROADMAP");
  const researchOutputPath = join(base, relMilestoneFile(base, mid, "RESEARCH"));
  const secretsOutputPath = join(base, relMilestoneFile(base, mid, "SECRETS"));
  return loadPrompt("plan-milestone", {
    workingDirectory: base,
    milestoneId: mid, milestoneTitle: midTitle,
    milestonePath: relMilestonePath(base, mid),
    contextPath: contextRel,
    researchPath: researchRel,
    researchOutputPath,
    outputPath: join(base, outputRelPath),
    secretsOutputPath,
    inlinedContext,
    sourceFilePaths: buildSourceFilePaths(base, mid),
    skillActivation: buildSkillActivationBlock({
      base,
      milestoneId: mid,
      milestoneTitle: midTitle,
      extraContext: [inlinedContext],
    }),
    ...buildSkillDiscoveryVars(),
  });
}

export async function buildCompleteMilestonePrompt(
  mid: string, midTitle: string, base: string, level?: InlineLevel,
): Promise<string> {
  const inlineLevel = level ?? resolveInlineLevel();
  const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
  const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");

  const inlined: string[] = [];
  inlined.push(await inlineFile(roadmapPath, roadmapRel, "Milestone Roadmap"));

  const roadmapContent = roadmapPath ? await loadFile(roadmapPath) : null;
  if (roadmapContent) {
    const roadmap = parseRoadmap(roadmapContent);
    const seenSlices = new Set<string>();
    for (const slice of roadmap.slices) {
      if (seenSlices.has(slice.id)) continue;
      seenSlices.add(slice.id);
      const summaryPath = resolveSliceFile(base, mid, slice.id, "SUMMARY");
      const summaryRel = relSliceFile(base, mid, slice.id, "SUMMARY");
      inlined.push(await inlineFile(summaryPath, summaryRel, `${slice.id} Summary`));
    }
  }

  if (inlineLevel !== "minimal") {
    const requirementsInline = await inlineRequirementsFromDb(base, undefined, inlineLevel);
    if (requirementsInline) inlined.push(requirementsInline);
    const decisionsInline = await inlineDecisionsFromDb(base, mid, undefined, inlineLevel);
    if (decisionsInline) inlined.push(decisionsInline);
    const projectInline = await inlineProjectFromDb(base);
    if (projectInline) inlined.push(projectInline);
  }
  const knowledgeInlineCM = await inlineGsdRootFile(base, "knowledge.md", "Project Knowledge");
  if (knowledgeInlineCM) inlined.push(knowledgeInlineCM);
  const contextPath = resolveMilestoneFile(base, mid, "CONTEXT");
  const contextRel = relMilestoneFile(base, mid, "CONTEXT");
  const contextInline = await inlineFileOptional(contextPath, contextRel, "Milestone Context");
  if (contextInline) inlined.push(contextInline);
  inlined.push(inlineTemplate("milestone-summary", "Milestone Summary"));

  const inlinedContext = capPreamble(`## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`);

  const milestoneSummaryPath = join(base, `${relMilestonePath(base, mid)}/${mid}-SUMMARY.md`);

  return loadPrompt("complete-milestone", {
    workingDirectory: base,
    milestoneId: mid,
    milestoneTitle: midTitle,
    roadmapPath: roadmapRel,
    inlinedContext,
    milestoneSummaryPath,
  });
}

export async function buildValidateMilestonePrompt(
  mid: string, midTitle: string, base: string, level?: InlineLevel,
): Promise<string> {
  const inlineLevel = level ?? resolveInlineLevel();
  const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
  const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");

  const inlined: string[] = [];
  inlined.push(await inlineFile(roadmapPath, roadmapRel, "Milestone Roadmap"));

  const roadmapContent = roadmapPath ? await loadFile(roadmapPath) : null;
  if (roadmapContent) {
    const roadmap = parseRoadmap(roadmapContent);
    const seenSlices = new Set<string>();
    for (const slice of roadmap.slices) {
      if (seenSlices.has(slice.id)) continue;
      seenSlices.add(slice.id);
      const summaryPath = resolveSliceFile(base, mid, slice.id, "SUMMARY");
      const summaryRel = relSliceFile(base, mid, slice.id, "SUMMARY");
      inlined.push(await inlineFile(summaryPath, summaryRel, `${slice.id} Summary`));

      const uatPath = resolveSliceFile(base, mid, slice.id, "UAT-RESULT");
      const uatRel = relSliceFile(base, mid, slice.id, "UAT-RESULT");
      const uatInline = await inlineFileOptional(uatPath, uatRel, `${slice.id} UAT Result`);
      if (uatInline) inlined.push(uatInline);
    }
  }

  const validationPath = resolveMilestoneFile(base, mid, "VALIDATION");
  const validationRel = relMilestoneFile(base, mid, "VALIDATION");
  const validationContent = validationPath ? await loadFile(validationPath) : null;
  let remediationRound = 0;
  if (validationContent) {
    const roundMatch = validationContent.match(/remediation_round:\s*(\d+)/);
    remediationRound = roundMatch ? parseInt(roundMatch[1], 10) + 1 : 1;
    inlined.push(`### Previous Validation (re-validation round ${remediationRound})\nSource: \`${validationRel}\`\n\n${validationContent.trim()}`);
  }

  if (inlineLevel !== "minimal") {
    const requirementsInline = await inlineRequirementsFromDb(base, undefined, inlineLevel);
    if (requirementsInline) inlined.push(requirementsInline);
    const decisionsInline = await inlineDecisionsFromDb(base, mid, undefined, inlineLevel);
    if (decisionsInline) inlined.push(decisionsInline);
    const projectInline = await inlineProjectFromDb(base);
    if (projectInline) inlined.push(projectInline);
  }
  const knowledgeInline = await inlineGsdRootFile(base, "knowledge.md", "Project Knowledge");
  if (knowledgeInline) inlined.push(knowledgeInline);
  const contextPath = resolveMilestoneFile(base, mid, "CONTEXT");
  const contextRel = relMilestoneFile(base, mid, "CONTEXT");
  const contextInline = await inlineFileOptional(contextPath, contextRel, "Milestone Context");
  if (contextInline) inlined.push(contextInline);

  const inlinedContext = capPreamble(`## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`);

  const validationOutputPath = join(base, `${relMilestonePath(base, mid)}/${mid}-VALIDATION.md`);
  const roadmapOutputPath = `${relMilestonePath(base, mid)}/${mid}-ROADMAP.md`;

  return loadPrompt("validate-milestone", {
    workingDirectory: base,
    milestoneId: mid,
    milestoneTitle: midTitle,
    roadmapPath: roadmapOutputPath,
    inlinedContext,
    validationPath: validationOutputPath,
    remediationRound: String(remediationRound),
  });
}
