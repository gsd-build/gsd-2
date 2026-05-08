// Project/App: GSD-2
// File Purpose: Shared capped workflow protocol and doctor-heal prompt payload helpers.

const DEFAULT_WORKFLOW_PROTOCOL_EXCERPT_CHARS = 4_000;
const MIN_WORKFLOW_PROTOCOL_EXCERPT_CHARS = 1_000;
const DEFAULT_DOCTOR_SUMMARY_CHARS = 2_400;
const DEFAULT_DOCTOR_ISSUE_CHARS = 300;
const DEFAULT_DOCTOR_MAX_ISSUES = 12;
const DEFAULT_DOCTOR_ISSUES_CHARS = 4_000;

export function buildWorkflowProtocolExcerpt(
  workflow: string,
  workflowPath: string,
  opts: { maxChars?: number } = {},
): string {
  const limit = opts.maxChars ?? getWorkflowProtocolExcerptLimit();
  const trimmed = workflow.trim();
  const excerpt = buildPrioritizedWorkflowExcerpt(trimmed, limit);
  const truncated = trimmed.length > limit;
  const lines = [
    "## GSD Workflow Protocol Excerpt",
    `Source: \`${workflowPath}\``,
    "",
    excerpt,
  ];
  if (truncated) {
    lines.push(
      "",
      "[Workflow Protocol Truncated]",
      "The full workflow protocol remains available at the source path above. Read it only if this excerpt lacks a rule required for the dispatched task.",
    );
  }
  return lines.join("\n");
}

export function buildWorkflowDispatchContent(opts: {
  workflow: string;
  workflowPath: string;
  task: string;
  maxProtocolChars?: number;
}): string {
  return [
    "Read the following GSD workflow protocol excerpt and execute exactly. Use the source path for a full protocol read only if the excerpt lacks a required rule.",
    "",
    buildWorkflowProtocolExcerpt(opts.workflow, opts.workflowPath, { maxChars: opts.maxProtocolChars }),
    "",
    "## Your Task",
    "",
    opts.task.trim(),
  ].join("\n");
}

export function buildDoctorHealSummary(reportText: string, opts: { maxChars?: number } = {}): string {
  const limit = opts.maxChars ?? DEFAULT_DOCTOR_SUMMARY_CHARS;
  const lines = reportText.split(/\r?\n/).map((line) => line.trimEnd());
  const summaryLines = lines.filter((line) =>
    line.length > 0 && (
      /^#/.test(line) ||
      /^(scope|status|summary|checks?|errors?|warnings?|fixes?|issues?)\b/i.test(line) ||
      /doctor/i.test(line)
    ),
  );
  const selected = summaryLines.length > 0 ? summaryLines : lines.filter((line) => line.trim()).slice(0, 24);
  return capText(selected.join("\n"), limit, "Full doctor report is available in the command output; use the structured issue list below for repairs.");
}

export function buildDoctorHealIssuePayload(
  structuredIssues: string,
  opts: { maxIssues?: number; maxIssueChars?: number; maxChars?: number } = {},
): string {
  const maxIssues = opts.maxIssues ?? DEFAULT_DOCTOR_MAX_ISSUES;
  const maxIssueChars = opts.maxIssueChars ?? DEFAULT_DOCTOR_ISSUE_CHARS;
  const maxChars = opts.maxChars ?? DEFAULT_DOCTOR_ISSUES_CHARS;
  const blocks = splitIssueBlocks(structuredIssues);
  const topBlocks = blocks.slice(0, maxIssues).map((block) =>
    capText(block, maxIssueChars, "Issue details truncated; inspect the relevant artifact before editing."),
  );
  if (blocks.length > maxIssues) {
    topBlocks.push(`[${blocks.length - maxIssues} additional actionable issue(s) omitted from prompt. Re-run /gsd doctor heal after this repair pass.]`);
  }
  return capText(topBlocks.join("\n\n"), maxChars, "Structured issue list truncated; repair top actionable issues first and re-run doctor heal.");
}

function getWorkflowProtocolExcerptLimit(): number {
  const raw = process.env.PI_GSD_WORKFLOW_PROTOCOL_MAX_CHARS;
  if (!raw) return DEFAULT_WORKFLOW_PROTOCOL_EXCERPT_CHARS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < MIN_WORKFLOW_PROTOCOL_EXCERPT_CHARS) {
    return DEFAULT_WORKFLOW_PROTOCOL_EXCERPT_CHARS;
  }
  return Math.floor(parsed);
}

function buildPrioritizedWorkflowExcerpt(workflow: string, limit: number): string {
  if (workflow.length <= limit) return workflow;
  const sections = splitMarkdownSections(workflow);
  const wanted = [
    /^# /,
    /^## Quick Start\b/i,
    /^## The Hierarchy\b/i,
    /^## The Phases\b/i,
    /^### Phase 4: Execute\b/i,
    /^### Phase 5: Verify\b/i,
    /^### Observable Truths\b/i,
    /^### Artifacts\b/i,
    /^### Key Links\b/i,
    /^### Phase 6: Summarize\b/i,
    /^### Phase 7: Advance\b/i,
  ];
  const selected: string[] = [];
  const used = new Set<number>();
  for (const pattern of wanted) {
    const index = sections.findIndex((section, sectionIndex) =>
      !used.has(sectionIndex) && pattern.test(section.heading),
    );
    if (index >= 0) {
      used.add(index);
      selected.push(sections[index].text);
    }
  }
  const body = selected.length > 0 ? selected.join("\n\n") : workflow;
  return capText(body, limit, "Workflow protocol excerpt capped; read the source path for omitted details.");
}

function splitMarkdownSections(markdown: string): Array<{ heading: string; text: string }> {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<{ heading: string; text: string }> = [];
  let currentHeading = lines[0]?.startsWith("#") ? lines[0] : "# Preamble";
  let current: string[] = [];
  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line) && current.length > 0) {
      sections.push({ heading: currentHeading, text: current.join("\n").trim() });
      currentHeading = line;
      current = [line];
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) currentHeading = line;
    current.push(line);
  }
  if (current.length > 0) {
    sections.push({ heading: currentHeading, text: current.join("\n").trim() });
  }
  return sections.filter((section) => section.text.length > 0);
}

function splitIssueBlocks(structuredIssues: string): string[] {
  const trimmed = structuredIssues.trim();
  if (!trimmed) return ["No structured issue details were provided."];
  const split = trimmed.split(/\n(?=(?:#{2,6}\s+|\d+\.\s+|- \*\*|- \[[ x]\]))/i)
    .map((block) => block.trim())
    .filter(Boolean);
  return split.length > 0 ? split : [trimmed];
}

function capText(text: string, limit: number, notice: string): string {
  if (text.length <= limit) return text;
  const suffix = `\n\n[Truncated]\n${notice}`;
  const headBudget = Math.max(0, limit - suffix.length);
  return `${text.slice(0, headBudget).trimEnd()}${suffix}`;
}
