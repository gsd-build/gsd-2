// Project/App: GSD-2
// File Purpose: Regression tests for canonical issue triage label normalization.

import assert from "node:assert/strict";
import test from "node:test";

import {
  TRIAGE_LABEL_COLORS,
  TRIAGE_LABEL_DESCRIPTIONS,
  normalizeTriageResult,
  normalizeTriageStatus,
} from "../ai-triage-policy.mjs";

test("normalizeTriageStatus accepts canonical triage statuses", () => {
  assert.equal(normalizeTriageStatus("ready-for-agent", [], null), "ready-for-agent");
  assert.equal(normalizeTriageStatus("ready-for-human", [], null), "ready-for-human");
});

test("normalizeTriageStatus normalizes status casing and whitespace", () => {
  assert.equal(normalizeTriageStatus(" Ready-For-Human ", [], null), "ready-for-human");
});

test("normalizeTriageStatus falls back to needs-info for missing-info results", () => {
  assert.equal(normalizeTriageStatus(undefined, [], "missing-info"), "needs-info");
});

test("normalizeTriageResult keeps one canonical triage status and removes stale statuses", () => {
  const result = normalizeTriageResult(
    {
      labels: ["bug", "unknown-label", "needs-info"],
      triage_status: "ready-for-agent",
    },
    ["needs-triage", "needs-info"],
  );

  assert.deepEqual(result.labels, ["bug", "ready-for-agent"]);
  assert.equal(result.triageStatus, "ready-for-agent");
  assert.deepEqual(result.labelsToRemove, ["needs-triage", "needs-info"]);
});

test("normalizeTriageResult maps off-topic findings to wontfix", () => {
  const result = normalizeTriageResult({
    labels: ["question"],
    violation_type: "off-topic",
  });

  assert.deepEqual(result.labels, ["question", "wontfix"]);
});

test("canonical labels carry creation metadata for first use", () => {
  assert.equal(TRIAGE_LABEL_DESCRIPTIONS["ready-for-agent"], "Fully specified, ready for an AFK agent");
  assert.equal(TRIAGE_LABEL_COLORS["ready-for-human"], "1D76DB");
});
