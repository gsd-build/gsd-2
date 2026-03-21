// Task-level prompt builders for auto-mode dispatch (execute, UAT, reassess, reactive, rewrite).

import { loadFile, parsePlan, extractUatType, loadActiveOverrides, formatOverridesSection } from "./files.js";
import type { Override } from "./files.js";
import type { InlineLevel } from "./types.js";
import { loadPrompt, inlineTemplate } from "./prompt-loader.js";
import {
  resolveSliceFile, resolveTaskFile, resolveTasksDir, resolveTaskFiles,
  resolveMilestoneFile, resolveGsdRootFile, resolveSlicePath, resolveRuntimeFile,
  relSliceFile, relSlicePath, relMilestoneFile, relMilestonePath, relGsdRootFile,
} from "./paths.js";
import { resolveInlineLevel, loadEffectiveGSDPreferences } from "./preferences.js";
import { computeBudgets, resolveExecutorContextWindow, truncateAtSectionBoundary } from "./context-budget.js";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { capPreamble, buildResumeSection, buildCarryForwardSection, extractSliceExecutionExcerpt } from "./auto-prompt-sections.js";
import { inlineFile, inlineFileOptional, inlineGsdRootFile, inlineDecisionsFromDb, inlineRequirementsFromDb, inlineProjectFromDb, inlineFileSmart } from "./auto-file-inlining.js";
import { buildSkillActivationBlock } from "./auto-skill-activation.js";
import { getPriorTaskSummaryPaths, getDependencyTaskSummaryPaths } from "./auto-prompt-context.js";

/** Options for customizing execute-task prompt construction. */
export interface ExecuteTaskPromptOptions {
  level?: InlineLevel;
  /** Override carry-forward paths (dependency-based instead of order-based). */
  carryForwardPaths?: string[];
}

export async function buildExecuteTaskPrompt(
  mid: string, sid: string, sTitle: string,
  tid: string, tTitle: string, base: string,
  level?: InlineLevel | ExecuteTaskPromptOptions,
): Promise<string> {
  const opts: ExecuteTaskPromptOptions = typeof level === "object" && level !== null && !Array.isArray(level)
    ? level
    : { level: level as InlineLevel | undefined };
  const inlineLevel = opts.level ?? resolveInlineLevel();

  const priorSummaries = opts.carryForwardPaths ?? await getPriorTaskSummaryPaths(mid, sid, tid, base);
  const priorLines = priorSummaries.length > 0
    ? priorSummaries.map(p => `- \`${p}\``).join("\n")
    : "- (no prior tasks)";

  const taskPlanPath = resolveTaskFile(base, mid, sid, tid, "PLAN");
  const taskPlanContent = taskPlanPath ? await loadFile(taskPlanPath) : null;
  const taskPlanRelPath = relSlicePath(base, mid, sid) + `/tasks/${tid}-PLAN.md`;
  const taskPlanInline = taskPlanContent
    ? [
      "## Inlined Task Plan (authoritative local execution contract)",
      `Source: \`${taskPlanRelPath}\``,
      "",
      taskPlanContent.trim(),
    ].join("\n")
    : [
      "## Inlined Task Plan (authoritative local execution contract)",
      `Task plan not found at dispatch time. Read \`${taskPlanRelPath}\` before executing.`,
    ].join("\n");

  const slicePlanPath = resolveSliceFile(base, mid, sid, "PLAN");
  const slicePlanContent = slicePlanPath ? await loadFile(slicePlanPath) : null;
  const slicePlanExcerpt = extractSliceExecutionExcerpt(slicePlanContent, relSliceFile(base, mid, sid, "PLAN"));

  const continueFile = resolveSliceFile(base, mid, sid, "CONTINUE");
  const legacyContinueDir = resolveSlicePath(base, mid, sid);
  const legacyContinuePath = legacyContinueDir ? join(legacyContinueDir, "continue.md") : null;
  const continueContent = continueFile ? await loadFile(continueFile) : null;
  const legacyContinueContent = !continueContent && legacyContinuePath ? await loadFile(legacyContinuePath) : null;
  const continueRelPath = relSliceFile(base, mid, sid, "CONTINUE");
  const resumeSection = buildResumeSection(
    continueContent,
    legacyContinueContent,
    continueRelPath,
    legacyContinuePath ? `${relSlicePath(base, mid, sid)}/continue.md` : null,
  );

  const effectivePriorSummaries = inlineLevel === "minimal" && priorSummaries.length > 1
    ? priorSummaries.slice(-1)
    : priorSummaries;
  const carryForwardSection = await buildCarryForwardSection(effectivePriorSummaries, base);

  const knowledgeAbsPath = resolveGsdRootFile(base, "KNOWLEDGE");
  const knowledgeInlineET = existsSync(knowledgeAbsPath)
    ? await inlineFileSmart(
        knowledgeAbsPath,
        relGsdRootFile("KNOWLEDGE"),
        "Project Knowledge",
        `${tTitle} ${sTitle}`,
      )
    : null;
  const knowledgeContent = knowledgeInlineET && !knowledgeInlineET.includes("not found") ? knowledgeInlineET : null;

  const inlinedTemplates = inlineLevel === "minimal"
    ? inlineTemplate("task-summary", "Task Summary")
    : [
        inlineTemplate("task-summary", "Task Summary"),
        inlineTemplate("decisions", "Decisions"),
        ...(knowledgeContent ? [knowledgeContent] : []),
      ].join("\n\n---\n\n");

  const taskSummaryPath = join(base, `${relSlicePath(base, mid, sid)}/tasks/${tid}-SUMMARY.md`);

  const activeOverrides = await loadActiveOverrides(base);
  const overridesSection = formatOverridesSection(activeOverrides);

  const prefs = loadEffectiveGSDPreferences();
  const contextWindow = resolveExecutorContextWindow(undefined, prefs?.preferences);
  const budgets = computeBudgets(contextWindow);
  const verificationBudget = `~${Math.round(budgets.verificationBudgetChars / 1000)}K chars`;

  const carryForwardBudget = Math.floor(budgets.inlineContextBudgetChars * 0.4);
  let finalCarryForward = carryForwardSection;
  if (carryForwardSection.length > carryForwardBudget) {
    finalCarryForward = truncateAtSectionBoundary(carryForwardSection, carryForwardBudget).content;
  }

  const runtimePath = resolveRuntimeFile(base);
  const runtimeContent = existsSync(runtimePath) ? await loadFile(runtimePath) : null;
  const runtimeContext = runtimeContent
    ? `### Runtime Context\nSource: \`.gsd/RUNTIME.md\`\n\n${runtimeContent.trim()}`
    : "";

  return loadPrompt("execute-task", {
    overridesSection,
    runtimeContext,
    workingDirectory: base,
    milestoneId: mid, sliceId: sid, sliceTitle: sTitle, taskId: tid, taskTitle: tTitle,
    planPath: join(base, relSliceFile(base, mid, sid, "PLAN")),
    slicePath: relSlicePath(base, mid, sid),
    taskPlanPath: taskPlanRelPath,
    taskPlanInline,
    slicePlanExcerpt,
    carryForwardSection: finalCarryForward,
    resumeSection,
    priorTaskLines: priorLines,
    taskSummaryPath,
    inlinedTemplates,
    verificationBudget,
    skillActivation: buildSkillActivationBlock({
      base,
      milestoneId: mid,
      sliceId: sid,
      sliceTitle: sTitle,
      taskId: tid,
      taskTitle: tTitle,
      taskPlanContent,
      extraContext: [taskPlanInline, slicePlanExcerpt, finalCarryForward, resumeSection],
    }),
  });
}

export async function buildRunUatPrompt(
  mid: string, sliceId: string, uatPath: string, uatContent: string, base: string,
): Promise<string> {
  const inlined: string[] = [];
  inlined.push(await inlineFile(resolveSliceFile(base, mid, sliceId, "UAT"), uatPath, `${sliceId} UAT`));

  const summaryPath = resolveSliceFile(base, mid, sliceId, "SUMMARY");
  const summaryRel = relSliceFile(base, mid, sliceId, "SUMMARY");
  if (summaryPath) {
    const summaryInline = await inlineFileOptional(summaryPath, summaryRel, `${sliceId} Summary`);
    if (summaryInline) inlined.push(summaryInline);
  }

  const projectInline = await inlineProjectFromDb(base);
  if (projectInline) inlined.push(projectInline);

  const inlinedContext = capPreamble(`## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`);

  const uatResultPath = join(base, relSliceFile(base, mid, sliceId, "UAT-RESULT"));
  const uatType = extractUatType(uatContent) ?? "artifact-driven";

  return loadPrompt("run-uat", {
    workingDirectory: base,
    milestoneId: mid,
    sliceId,
    uatPath,
    uatResultPath,
    uatType,
    inlinedContext,
  });
}

export async function buildReassessRoadmapPrompt(
  mid: string, midTitle: string, completedSliceId: string, base: string, level?: InlineLevel,
): Promise<string> {
  const inlineLevel = level ?? resolveInlineLevel();
  const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
  const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
  const summaryPath = resolveSliceFile(base, mid, completedSliceId, "SUMMARY");
  const summaryRel = relSliceFile(base, mid, completedSliceId, "SUMMARY");

  const inlined: string[] = [];
  inlined.push(await inlineFile(roadmapPath, roadmapRel, "Current Roadmap"));
  inlined.push(await inlineFile(summaryPath, summaryRel, `${completedSliceId} Summary`));
  if (inlineLevel !== "minimal") {
    const projectInline = await inlineProjectFromDb(base);
    if (projectInline) inlined.push(projectInline);
    const requirementsInline = await inlineRequirementsFromDb(base, undefined, inlineLevel);
    if (requirementsInline) inlined.push(requirementsInline);
    const decisionsInline = await inlineDecisionsFromDb(base, mid, undefined, inlineLevel);
    if (decisionsInline) inlined.push(decisionsInline);
  }
  const knowledgeInlineRA = await inlineGsdRootFile(base, "knowledge.md", "Project Knowledge");
  if (knowledgeInlineRA) inlined.push(knowledgeInlineRA);

  const inlinedContext = capPreamble(`## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`);

  const assessmentPath = join(base, relSliceFile(base, mid, completedSliceId, "ASSESSMENT"));

  let deferredCaptures = "(none)";
  try {
    const { loadDeferredCaptures } = await import("./triage-resolution.js");
    const deferred = loadDeferredCaptures(base);
    if (deferred.length > 0) {
      deferredCaptures = deferred.map(c =>
        `- **${c.id}**: "${c.text}" — ${c.rationale ?? "deferred during triage"}`
      ).join("\n");
    }
  } catch {
    // Non-fatal — captures module may not be available
  }

  const reassessPrefs = loadEffectiveGSDPreferences();
  const reassessCommitDocsEnabled = reassessPrefs?.preferences?.git?.commit_docs !== false;
  const reassessCommitInstruction = reassessCommitDocsEnabled
    ? `Commit: \`docs(${mid}): reassess roadmap after ${completedSliceId}\`. Stage only the .gsd/milestones/ files you changed — do not stage .gsd/STATE.md or other runtime files.`
    : "Do not commit — planning docs are not tracked in git for this project.";

  return loadPrompt("reassess-roadmap", {
    workingDirectory: base,
    milestoneId: mid,
    milestoneTitle: midTitle,
    completedSliceId,
    roadmapPath: roadmapRel,
    completedSliceSummaryPath: summaryRel,
    assessmentPath,
    inlinedContext,
    deferredCaptures,
    commitInstruction: reassessCommitInstruction,
  });
}

export async function buildReactiveExecutePrompt(
  mid: string, midTitle: string, sid: string, sTitle: string,
  readyTaskIds: string[], base: string,
): Promise<string> {
  const { loadSliceTaskIO, deriveTaskGraph, graphMetrics } = await import("./reactive-graph.js");

  const taskIO = await loadSliceTaskIO(base, mid, sid);
  const graph = deriveTaskGraph(taskIO);
  const metrics = graphMetrics(graph);

  const graphLines: string[] = [];
  for (const node of graph) {
    const status = node.done ? "✅ done" : readyTaskIds.includes(node.id) ? "🟢 ready" : "⏳ waiting";
    const deps = node.dependsOn.length > 0 ? ` (depends on: ${node.dependsOn.join(", ")})` : "";
    graphLines.push(`- **${node.id}: ${node.title}** — ${status}${deps}`);
    if (node.outputFiles.length > 0) {
      graphLines.push(`  - Outputs: ${node.outputFiles.map(f => `\`${f}\``).join(", ")}`);
    }
  }
  const graphContext = [
    `Tasks: ${metrics.taskCount}, Edges: ${metrics.edgeCount}, Ready: ${metrics.readySetSize}`,
    "",
    ...graphLines,
  ].join("\n");

  const subagentSections: string[] = [];
  const readyTaskListLines: string[] = [];

  for (const tid of readyTaskIds) {
    const node = graph.find((n) => n.id === tid);
    const tTitle = node?.title ?? tid;
    readyTaskListLines.push(`- **${tid}: ${tTitle}**`);

    const depPaths = await getDependencyTaskSummaryPaths(
      mid, sid, tid, node?.dependsOn ?? [], base,
    );

    const taskPrompt = await buildExecuteTaskPrompt(
      mid, sid, sTitle, tid, tTitle, base,
      { carryForwardPaths: depPaths },
    );

    subagentSections.push([
      `### ${tid}: ${tTitle}`,
      "",
      "Use this as the prompt for a `subagent` call:",
      "",
      "```",
      taskPrompt,
      "```",
    ].join("\n"));
  }

  const inlinedTemplates = inlineTemplate("task-summary", "Task Summary");

  return loadPrompt("reactive-execute", {
    workingDirectory: base,
    milestoneId: mid,
    milestoneTitle: midTitle,
    sliceId: sid,
    sliceTitle: sTitle,
    graphContext,
    readyTaskCount: String(readyTaskIds.length),
    readyTaskList: readyTaskListLines.join("\n"),
    subagentPrompts: subagentSections.join("\n\n---\n\n"),
    inlinedTemplates,
  });
}

export async function buildRewriteDocsPrompt(
  mid: string, midTitle: string,
  activeSlice: { id: string; title: string } | null,
  base: string,
  overrides: Override[],
): Promise<string> {
  const sid = activeSlice?.id;
  const sTitle = activeSlice?.title ?? "";
  const docList: string[] = [];

  if (sid) {
    const slicePlanPath = resolveSliceFile(base, mid, sid, "PLAN");
    const slicePlanRel = relSliceFile(base, mid, sid, "PLAN");
    if (slicePlanPath) {
      docList.push(`- Slice plan: \`${slicePlanRel}\``);
      const tDir = resolveTasksDir(base, mid, sid);
      if (tDir) {
        const planContent = await loadFile(slicePlanPath);
        if (planContent) {
          const plan = parsePlan(planContent);
          for (const task of plan.tasks) {
            if (!task.done) {
              const taskPlanPath = resolveTaskFile(base, mid, sid, task.id, "PLAN");
              if (taskPlanPath) {
                const taskRelPath = `${relSlicePath(base, mid, sid)}/tasks/${task.id}-PLAN.md`;
                docList.push(`- Task plan: \`${taskRelPath}\``);
              }
            }
          }
        }
      }
    }
  }

  const decisionsPath = resolveGsdRootFile(base, "DECISIONS");
  if (existsSync(decisionsPath)) docList.push(`- Decisions: \`${relGsdRootFile("DECISIONS")}\``);
  const requirementsPath = resolveGsdRootFile(base, "REQUIREMENTS");
  if (existsSync(requirementsPath)) docList.push(`- Requirements: \`${relGsdRootFile("REQUIREMENTS")}\``);
  const projectPath = resolveGsdRootFile(base, "PROJECT");
  if (existsSync(projectPath)) docList.push(`- Project: \`${relGsdRootFile("PROJECT")}\``);
  const contextPath = resolveMilestoneFile(base, mid, "CONTEXT");
  const contextRel = relMilestoneFile(base, mid, "CONTEXT");
  if (contextPath) docList.push(`- Milestone context (reference only): \`${contextRel}\``);
  const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
  const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
  if (roadmapPath) docList.push(`- Roadmap: \`${roadmapRel}\``);

  const overrideContent = overrides.map((o, i) => [
    `### Override ${i + 1}`,
    `**Change:** ${o.change}`,
    `**Issued:** ${o.timestamp}`,
    `**During:** ${o.appliedAt}`,
  ].join("\n")).join("\n\n");

  const documentList = docList.length > 0 ? docList.join("\n") : "- No active plan documents found.";

  return loadPrompt("rewrite-docs", {
    milestoneId: mid,
    milestoneTitle: midTitle,
    sliceId: sid ?? "none",
    sliceTitle: sTitle,
    overrideContent,
    documentList,
    overridesPath: relGsdRootFile("OVERRIDES"),
  });
}
