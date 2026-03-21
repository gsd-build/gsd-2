// Reusable section builders and shared utilities for auto-mode prompt construction.

import { loadFile, parseContinue, parseSummary } from "./files.js";
import { resolveExecutorContextWindow, computeBudgets, truncateAtSectionBoundary } from "./context-budget.js";
import { loadEffectiveGSDPreferences } from "./preferences.js";
import {
  resolveGsdRootFile, relGsdRootFile, resolveMilestoneFile, resolveSliceFile,
  resolveSlicePath, relMilestoneFile, relSlicePath, relMilestonePath,
} from "./paths.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ─── Preamble Cap ─────────────────────────────────────────────────────────────

const MAX_PREAMBLE_CHARS = 30_000;

export function capPreamble(preamble: string): string {
  if (preamble.length <= MAX_PREAMBLE_CHARS) return preamble;
  return truncateAtSectionBoundary(preamble, MAX_PREAMBLE_CHARS).content;
}

// ─── Source File Paths ────────────────────────────────────────────────────────

export function buildSourceFilePaths(
  base: string,
  mid: string,
  sid?: string,
): string {
  const paths: string[] = [];

  const projectPath = resolveGsdRootFile(base, "PROJECT");
  if (existsSync(projectPath)) {
    paths.push(`- **Project**: \`${relGsdRootFile("PROJECT")}\``);
  }

  const requirementsPath = resolveGsdRootFile(base, "REQUIREMENTS");
  if (existsSync(requirementsPath)) {
    paths.push(`- **Requirements**: \`${relGsdRootFile("REQUIREMENTS")}\``);
  }

  const decisionsPath = resolveGsdRootFile(base, "DECISIONS");
  if (existsSync(decisionsPath)) {
    paths.push(`- **Decisions**: \`${relGsdRootFile("DECISIONS")}\``);
  }

  const contextPath = resolveMilestoneFile(base, mid, "CONTEXT");
  if (contextPath) {
    paths.push(`- **Milestone Context**: \`${relMilestoneFile(base, mid, "CONTEXT")}\``);
  }

  const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
  if (roadmapPath) {
    paths.push(`- **Roadmap**: \`${relMilestoneFile(base, mid, "ROADMAP")}\``);
  }

  if (sid) {
    const researchPath = resolveSliceFile(base, mid, sid, "RESEARCH");
    if (researchPath) {
      paths.push(`- **Slice Research**: \`${relMilestoneFile(base, mid, "RESEARCH")}\``);
    }
  } else {
    const researchPath = resolveMilestoneFile(base, mid, "RESEARCH");
    if (researchPath) {
      paths.push(`- **Milestone Research**: \`${relMilestoneFile(base, mid, "RESEARCH")}\``);
    }
  }

  return paths.length > 0
    ? paths.join("\n")
    : "- Use `rg --files` and targeted reads to identify the relevant source files before planning.";
}

// ─── Text Helpers ──────────────────────────────────────────────────────────

export function extractMarkdownSection(content: string, heading: string): string | null {
  const match = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m").exec(content);
  if (!match) return null;

  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const nextHeading = rest.match(/^##\s+/m);
  const end = nextHeading?.index ?? rest.length;
  return rest.slice(0, end).trim();
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// ─── Section Builders ──────────────────────────────────────────────────────

export function buildResumeSection(
  continueContent: string | null,
  legacyContinueContent: string | null,
  continueRelPath: string,
  legacyContinueRelPath: string | null,
): string {
  const resolvedContent = continueContent ?? legacyContinueContent;
  const resolvedRelPath = continueContent ? continueRelPath : legacyContinueRelPath;

  if (!resolvedContent || !resolvedRelPath) {
    return ["## Resume State", "- No continue file present. Start from the top of the task plan."].join("\n");
  }

  const cont = parseContinue(resolvedContent);
  const lines = [
    "## Resume State",
    `Source: \`${resolvedRelPath}\``,
    `- Status: ${cont.frontmatter.status || "in_progress"}`,
  ];

  if (cont.frontmatter.step && cont.frontmatter.totalSteps) {
    lines.push(`- Progress: step ${cont.frontmatter.step} of ${cont.frontmatter.totalSteps}`);
  }
  if (cont.completedWork) lines.push(`- Completed: ${oneLine(cont.completedWork)}`);
  if (cont.remainingWork) lines.push(`- Remaining: ${oneLine(cont.remainingWork)}`);
  if (cont.decisions) lines.push(`- Decisions: ${oneLine(cont.decisions)}`);
  if (cont.nextAction) lines.push(`- Next action: ${oneLine(cont.nextAction)}`);

  return lines.join("\n");
}

export async function buildCarryForwardSection(priorSummaryPaths: string[], base: string): Promise<string> {
  if (priorSummaryPaths.length === 0) {
    return ["## Carry-Forward Context", "- No prior task summaries in this slice."].join("\n");
  }

  const items = await Promise.all(priorSummaryPaths.map(async (relPath) => {
    const absPath = join(base, relPath);
    const content = await loadFile(absPath);
    if (!content) return `- \`${relPath}\``;

    const summary = parseSummary(content);
    const provided = summary.frontmatter.provides.slice(0, 2).join("; ");
    const decisions = summary.frontmatter.key_decisions.slice(0, 2).join("; ");
    const patterns = summary.frontmatter.patterns_established.slice(0, 2).join("; ");
    const keyFiles = summary.frontmatter.key_files.slice(0, 3).join("; ");
    const diagnostics = extractMarkdownSection(content, "Diagnostics");

    const parts = [summary.title || relPath];
    if (summary.oneLiner) parts.push(summary.oneLiner);
    if (provided) parts.push(`provides: ${provided}`);
    if (decisions) parts.push(`decisions: ${decisions}`);
    if (patterns) parts.push(`patterns: ${patterns}`);
    if (keyFiles) parts.push(`key_files: ${keyFiles}`);
    if (diagnostics) parts.push(`diagnostics: ${oneLine(diagnostics)}`);

    return `- \`${relPath}\` — ${parts.join(" | ")}`;
  }));

  return ["## Carry-Forward Context", ...items].join("\n");
}

export function extractSliceExecutionExcerpt(content: string | null, relPath: string): string {
  if (!content) {
    return [
      "## Slice Plan Excerpt",
      `Slice plan not found at dispatch time. Read \`${relPath}\` before running slice-level verification.`,
    ].join("\n");
  }

  const lines = content.split("\n");
  const goalLine = lines.find(l => l.startsWith("**Goal:**"))?.trim();
  const demoLine = lines.find(l => l.startsWith("**Demo:**"))?.trim();

  const verification = extractMarkdownSection(content, "Verification");
  const observability = extractMarkdownSection(content, "Observability / Diagnostics");

  const parts = ["## Slice Plan Excerpt", `Source: \`${relPath}\``];
  if (goalLine) parts.push(goalLine);
  if (demoLine) parts.push(demoLine);
  if (verification) {
    parts.push("", "### Slice Verification", verification.trim());
  }
  if (observability) {
    parts.push("", "### Slice Observability / Diagnostics", observability.trim());
  }

  return parts.join("\n");
}
