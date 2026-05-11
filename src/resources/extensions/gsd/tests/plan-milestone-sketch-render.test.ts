// ADR-011 #5750: ROADMAP.md renders sketch slices with a `[sketch]` badge.
//
// Locks in the visual distinction so an auditor scanning the rendered roadmap
// can tell which slices are sketches awaiting refine-slice expansion vs which
// already carry a full plan. Sits alongside `plan-milestone.test.ts` which
// covers the full-plan render path.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { openDatabase, closeDatabase } from "../gsd-db.ts";
import { handlePlanMilestone, type PlanMilestoneParams } from "../tools/plan-milestone.ts";

function makeTmpBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-plan-sketch-render-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  openDatabase(join(base, ".gsd", "gsd.db"));
  return base;
}

function cleanup(base: string): void {
  try {
    closeDatabase();
  } catch {
    /* noop */
  }
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

function planMilestoneWithSketches(): PlanMilestoneParams {
  return {
    milestoneId: "M001",
    title: "Progressive Planning Demo",
    vision: "Demonstrate sketch slices in ROADMAP rendering.",
    successCriteria: ["S01 full, S02 sketch", "ROADMAP distinguishes them"],
    keyRisks: [{ risk: "Visual collision", whyItMatters: "Auditors need to spot sketches." }],
    proofStrategy: [{ riskOrUnknown: "Render correctness", retireIn: "S01", whatWillBeProven: "Roadmap shows the badge." }],
    verificationContract: "Contract verification text",
    verificationIntegration: "Integration verification text",
    verificationOperational: "Operational verification text",
    verificationUat: "UAT verification text",
    definitionOfDone: ["Renderer emits badge", "Test asserts it"],
    requirementCoverage: "Covers ADR-011 #5750.",
    boundaryMapMarkdown: "| From | To | Produces | Consumes |\n|------|----|----------|----------|\n| S01 | S02 | scaffold | nothing |",
    slices: [
      {
        sliceId: "S01",
        title: "Fully planned scaffold",
        risk: "medium" as const,
        depends: [],
        demo: "Scaffold is in place.",
        goal: "Lay down the structural foundation.",
        successCriteria: "Scaffold tests pass.",
        proofLevel: "integration" as const,
        integrationClosure: "Downstream slices depend on this scaffold.",
        observabilityImpact: "No new telemetry.",
        // No isSketch flag — defaults to full plan.
      },
      {
        sliceId: "S02",
        title: "Refinement candidate",
        risk: "low" as const,
        depends: ["S01"],
        demo: "Sketched until S01 ships.",
        goal: "Refine into a full plan after S01 lands.",
        successCriteria: "",
        proofLevel: "",
        integrationClosure: "",
        observabilityImpact: "",
        isSketch: true,
        sketchScope: "Pick up the scaffold from S01 and add the demo behavior. Stay inside the existing module boundaries.",
      },
    ],
  };
}

test("ROADMAP renders sketch slices with [sketch] badge and full slices without", async () => {
  const base = makeTmpBase();
  try {
    const params = planMilestoneWithSketches();
    const result = await handlePlanMilestone(params, base);
    if ("error" in result) {
      assert.fail(`handlePlanMilestone failed: ${result.error}`);
    }

    const roadmapPath = join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md");
    const roadmap = readFileSync(roadmapPath, "utf-8");

    // S01 is a full slice — no sketch badge.
    const s01Line = roadmap.split("\n").find((line) => line.includes("**S01:"));
    assert.ok(s01Line, "S01 slice line must exist in roadmap");
    assert.equal(
      s01Line.includes("`[sketch]`"),
      false,
      "fully-planned S01 must NOT carry the sketch badge",
    );
    assert.match(s01Line, /`risk:medium`/);

    // S02 is a sketch — badge required, positioned before risk.
    const s02Line = roadmap.split("\n").find((line) => line.includes("**S02:"));
    assert.ok(s02Line, "S02 slice line must exist in roadmap");
    assert.ok(
      s02Line.includes("`[sketch]`"),
      `sketch slice S02 must carry the sketch badge, got: ${s02Line}`,
    );
    // Badge sits before risk so it stays visible if the line truncates.
    const sketchIdx = s02Line.indexOf("`[sketch]`");
    const riskIdx = s02Line.indexOf("`risk:");
    assert.ok(
      sketchIdx >= 0 && riskIdx >= 0 && sketchIdx < riskIdx,
      "sketch badge must appear before the risk tag",
    );
  } finally {
    cleanup(base);
  }
});

test("ROADMAP omits sketch badge when no slices are sketches", async () => {
  const base = makeTmpBase();
  try {
    const params = planMilestoneWithSketches();
    // Strip the sketch designation from S02 so both slices are fully planned.
    params.slices[1] = {
      ...params.slices[1],
      isSketch: false,
      successCriteria: "Demo behavior works.",
      proofLevel: "unit" as const,
      integrationClosure: "S02 closes the demo behavior.",
      observabilityImpact: "No new telemetry.",
    };

    const result = await handlePlanMilestone(params, base);
    if ("error" in result) {
      assert.fail(`handlePlanMilestone failed: ${result.error}`);
    }

    const roadmap = readFileSync(
      join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
      "utf-8",
    );

    assert.equal(
      roadmap.includes("`[sketch]`"),
      false,
      "roadmap must not carry the sketch badge when no slice is a sketch",
    );
  } finally {
    cleanup(base);
  }
});
