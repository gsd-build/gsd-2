/**
 * Auto-mode Prompt Builders — re-exports from focused modules.
 *
 * Pure async functions that load templates and inline file content. No module-level
 * state, no globals — every dependency is passed as a parameter or imported as a
 * utility.
 */

export { inlineFile, inlineFileOptional, inlineFileSmart, inlineDependencySummaries, inlineGsdRootFile, inlineDecisionsFromDb, inlineRequirementsFromDb, inlineProjectFromDb } from "./auto-file-inlining.js";
export { buildSkillActivationBlock, buildSkillDiscoveryVars } from "./auto-skill-activation.js";
export { extractMarkdownSection, escapeRegExp, buildResumeSection, buildCarryForwardSection, extractSliceExecutionExcerpt, capPreamble, buildSourceFilePaths } from "./auto-prompt-sections.js";
export { getPriorTaskSummaryPaths, getDependencyTaskSummaryPaths, checkNeedsReassessment, checkNeedsRunUat } from "./auto-prompt-context.js";
export { buildResearchMilestonePrompt, buildPlanMilestonePrompt, buildCompleteMilestonePrompt, buildValidateMilestonePrompt } from "./auto-milestone-prompts.js";
export { buildResearchSlicePrompt, buildPlanSlicePrompt, buildCompleteSlicePrompt, buildReplanSlicePrompt } from "./auto-slice-prompts.js";
export type { ExecuteTaskPromptOptions } from "./auto-task-prompts.js";
export { buildExecuteTaskPrompt, buildRunUatPrompt, buildReassessRoadmapPrompt, buildReactiveExecutePrompt, buildRewriteDocsPrompt } from "./auto-task-prompts.js";
