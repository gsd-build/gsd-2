/**
 * Milestone component tests (Phase 04-02 Task 2).
 *
 * Pattern: Direct function call on components + JSON.stringify inspection,
 * matching the approach used in sidebar.test.tsx.
 */
import { describe, expect, it } from "bun:test";
import { ProgressBar } from "../src/components/shared/ProgressBar";
import { MilestoneHeader } from "../src/components/milestone/MilestoneHeader";
import { PhaseRow } from "../src/components/milestone/PhaseRow";
import { CommittedHistory } from "../src/components/milestone/CommittedHistory";
import type { ProjectState, PhaseState, RoadmapState } from "../src/server/types";

const mockProjectState: ProjectState = {
  milestone: "v1.0",
  milestone_name: "Mission Control",
  status: "active",
  branch: "main",
  stopped_at: "",
  last_updated: "",
  last_activity: "",
  progress: {
    total_phases: 10,
    completed_phases: 3,
    total_plans: 10,
    completed_plans: 5,
    percent: 50,
  },
};

const mockRoadmap: RoadmapState = {
  phases: [
    { completed: true, number: 1, name: "Setup", description: "Project setup and config" },
    { completed: false, number: 2, name: "Pipeline", description: "Data pipeline" },
  ],
};

function makePhase(overrides: Partial<PhaseState> = {}): PhaseState {
  return {
    number: 1,
    name: "Setup",
    status: "not_started",
    completedPlans: 0,
    plans: [],
    ...overrides,
  };
}

describe("ProgressBar", () => {
  it("renders correct width percentage", () => {
    const result = ProgressBar({ value: 75 });
    const json = JSON.stringify(result);
    expect(json).toContain("75%");
    expect(json).toContain("bg-cyan-accent");
  });

  it("clamps value to 0-100", () => {
    const over = ProgressBar({ value: 150 });
    const overJson = JSON.stringify(over);
    expect(overJson).toContain("100%");
    expect(overJson).not.toContain("150%");

    const under = ProgressBar({ value: -20 });
    const underJson = JSON.stringify(under);
    expect(underJson).toContain("0%");
    expect(underJson).not.toContain("-20%");
  });
});

describe("MilestoneHeader", () => {
  it("renders branch name, milestone name, and progress when given valid ProjectState", () => {
    const result = MilestoneHeader({ projectState: mockProjectState, roadmap: mockRoadmap });
    const json = JSON.stringify(result);
    expect(json).toContain("main");
    expect(json).toContain("Mission Control");
    // React serializes mixed children as arrays: [5," / ",10," plans complete"]
    expect(json).toContain("plans complete");
    // ProgressBar is a child component, serialized as {"value":50}
    expect(json).toContain('"value":50');
  });

  it("renders placeholder/skeleton when projectState is null", () => {
    const result = MilestoneHeader({ projectState: null, roadmap: null });
    const json = JSON.stringify(result);
    expect(json).toContain("animate-pulse");
    expect(json).not.toContain("Mission Control");
  });
});

describe("PhaseRow", () => {
  it("renders status icon, phase number, description, and progress fraction", () => {
    const phase = makePhase({
      number: 2,
      name: "Pipeline",
      status: "in_progress",
      completedPlans: 1,
      plans: [
        { phase: "02", plan: 1, wave: 1, requirements: [], autonomous: true, type: "execute", files_modified: [], depends_on: [] },
        { phase: "02", plan: 2, wave: 1, requirements: [], autonomous: true, type: "execute", files_modified: [], depends_on: [] },
      ],
    });
    const result = PhaseRow({ phase, description: "Data pipeline" });
    const json = JSON.stringify(result);
    // React serializes mixed children: ["Phase ",2] and [1,"/",2]
    expect(json).toContain('"Phase "');
    expect(json).toContain("Data pipeline");
    expect(json).toContain('1,"/",2');
    expect(json).toContain("text-status-warning");
    expect(json).toContain("animate-spin");
  });

  it("shows commit message area for completed phase", () => {
    const phase = makePhase({
      number: 1,
      status: "complete",
      completedPlans: 2,
      plans: [
        { phase: "01", plan: 1, wave: 1, requirements: [], autonomous: true, type: "execute", files_modified: [], depends_on: [] },
        { phase: "01", plan: 2, wave: 1, requirements: [], autonomous: true, type: "execute", files_modified: [], depends_on: [] },
      ],
    });
    const result = PhaseRow({ phase });
    const json = JSON.stringify(result);
    // React serializes: ["Phase ",1," complete"]
    expect(json).toContain('"Phase "');
    expect(json).toContain('" complete"');
    expect(json).toContain("text-status-success");
  });
});

describe("CommittedHistory", () => {
  it("renders completed phases only", () => {
    const phases: PhaseState[] = [
      makePhase({ number: 1, name: "Setup", status: "complete", completedPlans: 2 }),
      makePhase({ number: 2, name: "Pipeline", status: "in_progress", completedPlans: 1 }),
      makePhase({ number: 3, name: "UI", status: "not_started" }),
    ];
    const result = CommittedHistory({ phases });
    const json = JSON.stringify(result);
    expect(json).toContain("Committed History");
    expect(json).toContain("Setup");
    // React serializes: ["Phase ",1," complete"]
    expect(json).toContain('" complete"');
    expect(json).not.toContain("Pipeline");
    expect(json).not.toContain("UI");
  });

  it("renders nothing when no phases are complete", () => {
    const phases: PhaseState[] = [
      makePhase({ number: 1, status: "in_progress" }),
      makePhase({ number: 2, status: "not_started" }),
    ];
    const result = CommittedHistory({ phases });
    expect(result).toBeNull();
  });
});
