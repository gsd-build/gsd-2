// Project/App: GSD-2
// File Purpose: Shared pull request evidence generator for GSD shipping paths.

export type PrChangeType = "feat" | "fix" | "refactor" | "test" | "docs" | "chore";

export interface PrEvidenceInput {
  milestoneId: string;
  subjectId?: string;
  subjectKind?: "milestone" | "slice" | "workflow";
  milestoneTitle?: string;
  changeType?: PrChangeType;
  linkedIssue?: string;
  summaries?: string[];
  blockers?: string[];
  roadmapItems?: string[];
  metrics?: string[];
  testsRun?: string[];
  why?: string;
  how?: string;
  rollbackNotes?: string[];
  aiAssisted?: boolean;
}

export interface PrEvidence {
  title: string;
  body: string;
}

const CHANGE_TYPE_LABELS: Record<PrChangeType, string> = {
  feat: "New feature or capability",
  fix: "Bug fix",
  refactor: "Code restructuring",
  test: "Adding or updating tests",
  docs: "Documentation only",
  chore: "Build, CI, or tooling changes",
};

// Per-item cap for user-supplied content. 2 KB gives slice titles plus
// descriptions room while still bounding malicious DoS-via-PR-body input.
const USER_CONTENT_CAP_BYTES = 2048;
const TRUNCATION_SUFFIX = " … [truncated]";

// Strips HTML comments, fake commit trailers (Co-Authored-By, Signed-off-by —
// case-insensitive on the trailer name), and caps total length. Designed to
// be a no-op for well-formed input; golden fixtures must remain byte-stable.
// Trailer lines are removed (not rejected) so that a single bad line in an
// otherwise legitimate description does not block the entire PR.
function sanitizeUserContent(s: string): string {
  if (!s) return s;
  // Strip HTML comments greedily across newlines.
  let out = s.replace(/<!--[\s\S]*?-->/g, "");
  // Drop lines that look like commit trailers we do not want forged.
  out = out
    .split("\n")
    .filter((line) => !/^\s*(co-authored-by|signed-off-by)\s*:/i.test(line))
    .join("\n");
  if (Buffer.byteLength(out, "utf8") > USER_CONTENT_CAP_BYTES) {
    const budget = USER_CONTENT_CAP_BYTES - Buffer.byteLength(TRUNCATION_SUFFIX, "utf8");
    // Truncate by code units to stay safely under the byte budget for ASCII;
    // for multibyte content we conservatively walk back until under budget.
    let sliced = out.slice(0, Math.max(0, budget));
    while (Buffer.byteLength(sliced, "utf8") > budget && sliced.length > 0) {
      sliced = sliced.slice(0, -1);
    }
    out = sliced + TRUNCATION_SUFFIX;
  }
  return out;
}

// Strips HTML comments and fake trailers without applying the length cap.
// Used for short fields like linkedIssue where truncation would be confusing.
function sanitizeIssueRef(s: string): string {
  if (!s) return s;
  let out = s.replace(/<!--[\s\S]*?-->/g, "");
  out = out
    .split("\n")
    .filter((line) => !/^\s*(co-authored-by|signed-off-by)\s*:/i.test(line))
    .join("\n");
  return out;
}

function normalizeList(values: readonly string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => sanitizeUserContent(value).trim())
    .filter(Boolean);
}

function changeTypeChecklist(selected: PrChangeType): string[] {
  return (Object.keys(CHANGE_TYPE_LABELS) as PrChangeType[]).map((type) => {
    const checked = type === selected ? "x" : " ";
    return `- [${checked}] \`${type}\` - ${CHANGE_TYPE_LABELS[type]}`;
  });
}

function bulletList(values: readonly string[], fallback: string): string {
  if (values.length === 0) return `- ${fallback}`;
  return values.map((value) => `- ${value}`).join("\n");
}

export function buildPrEvidence(input: PrEvidenceInput): PrEvidence {
  const subjectId = input.subjectId?.trim() || input.milestoneId;
  const subjectKind = input.subjectKind ?? "milestone";
  const subjectTitle = input.milestoneTitle?.trim() || subjectId;
  const changeType = input.changeType ?? "feat";
  const summaries = normalizeList(input.summaries);
  const blockers = normalizeList(input.blockers);
  const roadmapItems = normalizeList(input.roadmapItems);
  const metrics = normalizeList(input.metrics);
  const testsRun = normalizeList(input.testsRun);
  const rollbackNotes = normalizeList(input.rollbackNotes);
  // linkedIssue is sanitized but not length-capped: legitimate issue refs
  // are short by nature, and truncating "Closes #123" would be unhelpful.
  const linkedIssueRaw = input.linkedIssue ? sanitizeIssueRef(input.linkedIssue).trim() : "";
  const linkedIssue = linkedIssueRaw || "Not specified. Add an issue link before marking this PR ready if CONTRIBUTING.md requires one.";
  const why = (input.why ? sanitizeUserContent(input.why).trim() : "") || `${capitalize(subjectKind)} work is complete and ready for review.`;
  const how = (input.how ? sanitizeUserContent(input.how).trim() : "") || "Generated from GSD evidence and local workflow artifacts.";
  const title = `${changeType}: ${subjectTitle}`;

  const sections: string[] = [
    "## TL;DR",
    "",
    `**What:** Ship ${subjectKind} ${subjectId} - ${subjectTitle}`,
    `**Why:** ${why}`,
    `**How:** ${how}`,
    "",
    "## What",
    "",
    summaries.length > 0 ? summaries.join("\n\n") : `${capitalize(subjectKind)} ${subjectId} completed.`,
  ];

  if (blockers.length > 0) {
    sections.push("", "## Blockers", "", blockers.map((blocker) => `- ${blocker}`).join("\n"));
  }

  sections.push(
    "",
    "## Why",
    "",
    why,
    "",
    "## How",
    "",
    how,
    "",
    "## Linked Issue",
    "",
    linkedIssue,
  );

  if (roadmapItems.length > 0) {
    sections.push("", "## Roadmap", "", roadmapItems.join("\n"));
  }

  if (metrics.length > 0) {
    sections.push("", "## Metrics", "", bulletList(metrics, "No metrics recorded."));
  }

  sections.push(
    "",
    "## Tests Run",
    "",
    bulletList(testsRun, "Not specified. Add exact verification commands before requesting review."),
    "",
    "## Change Type",
    "",
    ...changeTypeChecklist(changeType),
    "",
    "## Rollback And Compatibility",
    "",
    bulletList(rollbackNotes, "No behavior-changing rollback notes recorded."),
  );

  if (input.aiAssisted !== false) {
    sections.push("", "## AI Assistance Disclosure", "", "This PR was prepared with AI assistance.");
  }

  return { title, body: sections.join("\n") };
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
