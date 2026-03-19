/**
 * Slice detail component tests (Phase 05-01 Task 2).
 *
 * Pattern: Direct function call on components + JSON.stringify inspection,
 * matching the approach used in milestone.test.tsx and sidebar.test.tsx.
 */
import { describe, expect, it } from "bun:test";
import { ContextBudgetChart } from "../src/components/slice-detail/ContextBudgetChart";
import { BoundaryMap } from "../src/components/slice-detail/BoundaryMap";
import { UatStatus } from "../src/components/slice-detail/UatStatus";
import type { PlanState, PhaseState } from "../src/server/types";

function makePlan(overrides: Partial<PlanState> = {}): PlanState {
  return {
    phase: "05-slice-detail",
    plan: 1,
    wave: 1,
    requirements: [],
    autonomous: true,
    type: "execute",
    files_modified: [],
    depends_on: [],
    task_count: 1,
    ...overrides,
  };
}

function makePhase(overrides: Partial<PhaseState> = {}): PhaseState {
  return {
    number: 1,
    name: "Setup",
    status: "not_started",
    completedPlans: 0,
    plans: [],
    verifications: [],
    ...overrides,
  };
}

// -- ContextBudgetChart --

describe("ContextBudgetChart", () => {
  it("renders bars with green color for low file count (filesPerTask < 4)", () => {
    const plans = [
      makePlan({ plan: 1, files_modified: ["a.ts", "b.ts"], task_count: 2 }),
    ];
    const result = ContextBudgetChart({ plans });
    const json = JSON.stringify(result);
    expect(json).toContain("bg-status-success");
    expect(json).toContain('"Plan ",1');
    expect(json).toContain("Under budget");
  });

  it("renders bars with amber color for medium file count (4-6 filesPerTask)", () => {
    const plans = [
      makePlan({ plan: 1, files_modified: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"], task_count: 1 }),
    ];
    const result = ContextBudgetChart({ plans });
    const json = JSON.stringify(result);
    expect(json).toContain("bg-status-warning");
    expect(json).toContain("Near budget");
  });

  it("renders bars with red color for high file count (filesPerTask > 6)", () => {
    const plans = [
      makePlan({
        plan: 1,
        files_modified: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts", "g.ts", "h.ts"],
        task_count: 1,
      }),
    ];
    const result = ContextBudgetChart({ plans });
    const json = JSON.stringify(result);
    expect(json).toContain("bg-status-error");
    expect(json).toContain("Over budget");
  });

  it("renders empty state when plans array is empty", () => {
    const result = ContextBudgetChart({ plans: [] });
    const json = JSON.stringify(result);
    expect(json).toContain("No plan data");
  });

  it("renders multiple plan bars", () => {
    const plans = [
      makePlan({ plan: 1, files_modified: ["a.ts"], task_count: 1 }),
      makePlan({ plan: 2, files_modified: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"], task_count: 1 }),
    ];
    const result = ContextBudgetChart({ plans });
    const json = JSON.stringify(result);
    expect(json).toContain('"Plan ",1');
    expect(json).toContain('"Plan ",2');
    expect(json).toContain("bg-status-success");
    expect(json).toContain("bg-status-warning");
  });
});

// -- BoundaryMap --

describe("BoundaryMap", () => {
  it("renders PRODUCES with green border from artifacts", () => {
    const plans = [
      makePlan({
        must_haves: {
          truths: ["some truth"],
          artifacts: [
            { path: "src/types.ts", provides: "Types" },
            { path: "src/deriver.ts", provides: "Deriver" },
          ],
          key_links: [],
        },
      }),
    ];
    const result = BoundaryMap({ plans });
    const json = JSON.stringify(result);
    expect(json).toContain("PRODUCES");
    expect(json).toContain("border-status-success");
    expect(json).toContain("src/types.ts");
    expect(json).toContain("src/deriver.ts");
  });

  it("renders CONSUMES with cyan border from key_links", () => {
    const plans = [
      makePlan({
        must_haves: {
          truths: [],
          artifacts: [],
          key_links: [
            { from: "TabLayout.tsx", to: "slice components", via: "import" },
          ],
        },
      }),
    ];
    const result = BoundaryMap({ plans });
    const json = JSON.stringify(result);
    expect(json).toContain("CONSUMES");
    expect(json).toContain("border-cyan-accent");
    expect(json).toContain("slice components");
  });

  it("renders empty state when no boundary data", () => {
    const plans = [makePlan()];
    const result = BoundaryMap({ plans });
    const json = JSON.stringify(result);
    expect(json).toContain("No boundary data");
  });

  it("deduplicates artifact paths", () => {
    const plans = [
      makePlan({
        must_haves: {
          truths: [],
          artifacts: [
            { path: "src/types.ts", provides: "Types" },
            { path: "src/types.ts", provides: "Types again" },
          ],
          key_links: [],
        },
      }),
    ];
    const result = BoundaryMap({ plans });
    const json = JSON.stringify(result);
    // React serializes key + children, so path appears twice per list item (key + text).
    // Deduplication means only one list item, so we expect exactly 2 occurrences (key + children)
    const matches = json.match(/src\/types\.ts/g);
    expect(matches).toHaveLength(2);
  });
});

// -- UatStatus --

describe("UatStatus", () => {
  it("renders phase rows with score bars and status badges", () => {
    const phases = [
      makePhase({
        number: 3,
        verifications: [
          {
            score: 85,
            status: "pass",
            truths: [
              { truth: "Truth 1", status: "pass" },
              { truth: "Truth 2", status: "pass" },
            ],
          },
        ],
      }),
    ];
    const result = UatStatus({ phases });
    const json = JSON.stringify(result);
    // React serializes mixed children as arrays: ["Phase ",3]
    expect(json).toContain('"Phase "');
    expect(json).toContain(",3]");
    expect(json).toContain('"value":85');
    expect(json).toContain("2,\" truths\"");
    expect(json).toContain("PASS");
    expect(json).toContain("text-status-success");
  });

  it("renders fail badge for failed verifications", () => {
    const phases = [
      makePhase({
        number: 2,
        verifications: [
          {
            score: 30,
            status: "fail",
            truths: [{ truth: "Failed truth", status: "fail" }],
          },
        ],
      }),
    ];
    const result = UatStatus({ phases });
    const json = JSON.stringify(result);
    expect(json).toContain("FAIL");
    expect(json).toContain("text-status-error");
  });

  it("renders partial badge for partial status", () => {
    const phases = [
      makePhase({
        number: 1,
        verifications: [
          {
            score: 60,
            status: "partial",
            truths: [
              { truth: "T1", status: "pass" },
              { truth: "T2", status: "fail" },
            ],
          },
        ],
      }),
    ];
    const result = UatStatus({ phases });
    const json = JSON.stringify(result);
    expect(json).toContain("PARTIAL");
    expect(json).toContain("text-status-warning");
  });

  it("renders empty state when no phases have verifications", () => {
    const phases = [
      makePhase({ number: 1, verifications: [] }),
      makePhase({ number: 2, verifications: [] }),
    ];
    const result = UatStatus({ phases });
    const json = JSON.stringify(result);
    expect(json).toContain("No verification data");
  });

  it("filters out phases without verifications", () => {
    const phases = [
      makePhase({
        number: 1,
        name: "Setup",
        verifications: [
          { score: 100, status: "pass", truths: [{ truth: "T1", status: "pass" }] },
        ],
      }),
      makePhase({ number: 2, name: "Pipeline", verifications: [] }),
    ];
    const result = UatStatus({ phases });
    const json = JSON.stringify(result);
    // React serializes mixed children: ["Phase ",1]
    expect(json).toContain('"Phase ",1]');
    expect(json).not.toContain('"Phase ",2]');
  });
});
