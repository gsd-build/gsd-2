#!/usr/bin/env node
// Project/App: GSD-2
// File Purpose: Normalize automated issue and pull request triage labels.

export const CANONICAL_TRIAGE_LABELS = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
];

export const TRIAGE_LABEL_DESCRIPTIONS = {
  "needs-triage": "Maintainer needs to evaluate this issue",
  "needs-info": "Waiting for reporter information",
  "ready-for-agent": "Fully specified, ready for an AFK agent",
  "ready-for-human": "Requires human implementation",
  wontfix: "Will not be actioned",
};

export const TRIAGE_LABEL_COLORS = {
  "needs-triage": "D93F0B",
  "needs-info": "FBCA04",
  "ready-for-agent": "0E8A16",
  "ready-for-human": "1D76DB",
  wontfix: "CCCCCC",
};

const CLASSIFICATION_LABELS = new Set([
  "bug",
  "enhancement",
  "documentation",
  "performance",
  "refactor",
  "tech-debt",
  "question",
  "good first issue",
  "High Priority",
  "Medium Priority",
  "Low Priority",
  "needs-review",
  ...CANONICAL_TRIAGE_LABELS,
]);

export function normalizeTriageStatus(rawStatus, labels, violationType) {
  if (typeof rawStatus === "string") {
    const normalizedStatus = rawStatus.trim().toLowerCase();
    const canonicalMatch = CANONICAL_TRIAGE_LABELS.find((label) => label === normalizedStatus);
    if (canonicalMatch) return canonicalMatch;
  }
  if (labels.includes("needs-info") || violationType === "missing-info") return "needs-info";
  if (violationType === "off-topic") return "wontfix";
  return "needs-triage";
}

export function normalizeTriageResult(rawResult, existingLabels = []) {
  const rawLabels = Array.isArray(rawResult?.labels) ? rawResult.labels : [];
  const labels = [];

  for (const label of rawLabels) {
    if (typeof label !== "string") continue;
    const normalized = label.trim();
    if (!CLASSIFICATION_LABELS.has(normalized)) continue;
    if (!labels.includes(normalized)) labels.push(normalized);
  }

  const triageStatus = normalizeTriageStatus(
    rawResult?.triage_status,
    labels,
    rawResult?.violation_type,
  );

  const labelsWithoutOldStatus = labels.filter(
    (label) => !CANONICAL_TRIAGE_LABELS.includes(label),
  );
  labelsWithoutOldStatus.push(triageStatus);

  return {
    labels: labelsWithoutOldStatus,
    triageStatus,
    labelsToRemove: CANONICAL_TRIAGE_LABELS.filter(
      (label) => label !== triageStatus && existingLabels.includes(label),
    ),
  };
}
