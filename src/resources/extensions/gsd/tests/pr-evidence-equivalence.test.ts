// Project/App: GSD-2
// File Purpose: Golden-fixture equivalence tests pinning PR-body output for buildPrEvidence and formatSwarmLanePRBody.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildPrEvidence, type PrEvidenceInput } from "../pr-evidence.ts";
import {
  formatSwarmLanePRBody,
  type SwarmLanePRData,
} from "../../github-sync/templates.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures", "pr-body");

const UPDATE = process.env.UPDATE_GOLDENS === "1";

function compareGolden(name: string, actual: string): void {
  const path = join(FIXTURES_DIR, name);
  if (UPDATE) {
    writeFileSync(path, actual, "utf8");
    return;
  }
  const expected = readFileSync(path, "utf8");
  assert.equal(actual, expected, `golden mismatch for ${name}`);
}

const SHIP_BASIC: PrEvidenceInput = {
  milestoneId: "M001",
  milestoneTitle: "Authentication",
  changeType: "feat",
  linkedIssue: "Closes #123",
  summaries: ["### S01\nImplemented login flow."],
  roadmapItems: ["- [x] **S01: Login**"],
  metrics: ["**Units executed:** 3"],
  testsRun: ["npm test", "npm run typecheck:extensions"],
  why: "Users need to authenticate before accessing protected resources.",
  how: "Added password hash check and session token issuance.",
  rollbackNotes: ["Revert the merge commit."],
};

const SHIP_EMPTY_OPTIONALS: PrEvidenceInput = {
  milestoneId: "M001",
  milestoneTitle: "Authentication",
  changeType: "feat",
};

const SWARM_WITH_BLOCKERS: SwarmLanePRData = {
  lane: {
    id: "writer",
    branch: "lane/single-writer",
    owner: "@owner",
    latestCommit: "abc1234",
    changedContracts: ["WriterToken"],
    testEvidence: ["npm run typecheck:extensions"],
    blockers: ["Awaiting state-lane writer-sequence merge", "Parity report incomplete"],
  },
  impactArea: "Single-writer UOK metadata.",
  transitionRisks: ["Writer token lifecycle regression"],
  rollbackPlan: ["Disable writer sequence enrichment"],
  linkedIssue: 123,
};

const SWARM_NO_BLOCKERS: SwarmLanePRData = {
  lane: {
    id: "writer",
    branch: "lane/single-writer",
    owner: "@owner",
    latestCommit: "abc1234",
    changedContracts: ["WriterToken"],
    testEvidence: ["npm run typecheck:extensions"],
  },
  impactArea: "Single-writer UOK metadata.",
  transitionRisks: ["Writer token lifecycle regression"],
  rollbackPlan: ["Disable writer sequence enrichment"],
  linkedIssue: 123,
};

test("pr-evidence golden: commands-ship basic", () => {
  compareGolden("commands-ship-basic.md", buildPrEvidence(SHIP_BASIC).body);
});

test("pr-evidence golden: commands-ship empty optionals", () => {
  compareGolden("commands-ship-empty-optionals.md", buildPrEvidence(SHIP_EMPTY_OPTIONALS).body);
});

test("pr-evidence golden: swarm-lane with blockers", () => {
  const body = formatSwarmLanePRBody(SWARM_WITH_BLOCKERS);
  compareGolden("swarm-lane-with-blockers.md", body);
  // Cross-check: top-level ## Blockers heading must appear (regression guard
  // for the silent-drop fixed in this PR).
  assert.ok(body.includes("\n## Blockers\n"), "swarm-lane body must emit a top-level ## Blockers heading");
});

test("pr-evidence golden: swarm-lane no blockers (no Blockers heading)", () => {
  const body = formatSwarmLanePRBody(SWARM_NO_BLOCKERS);
  compareGolden("swarm-lane-no-blockers.md", body);
  assert.ok(!body.includes("## Blockers"), "swarm-lane body without blockers must not emit ## Blockers heading");
});
