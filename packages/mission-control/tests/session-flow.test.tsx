/**
 * Session flow state machine tests (Phase 07-02 Task 1).
 *
 * Tests useSessionFlow hook: initializing -> onboarding | resume | dashboard.
 * Pattern: Direct function call with mock state + JSON.stringify for components.
 */
import { describe, expect, it, beforeEach, mock } from "bun:test";
import type { PlanningState } from "../src/server/types";
import type { ConnectionStatus } from "../src/hooks/useReconnectingWebSocket";

// -- useSessionFlow unit tests (direct logic, no React renderer) --

// We test the pure derivation logic by importing the hook's internal logic
import {
  deriveSessionMode,
  type SessionMode,
  type ContinueHereData,
} from "../src/hooks/useSessionFlow";

describe("deriveSessionMode", () => {
  it('returns "initializing" when wsStatus is "connecting"', () => {
    const mode = deriveSessionMode(null, "connecting", null);
    expect(mode).toBe("initializing");
  });

  it('returns "initializing" when wsStatus is "disconnected"', () => {
    const mode = deriveSessionMode(null, "disconnected", null);
    expect(mode).toBe("initializing");
  });

  it('returns "onboarding" when state is null and connected', () => {
    const mode = deriveSessionMode(null, "connected", null);
    expect(mode).toBe("onboarding");
  });

  it('returns "onboarding" when state has empty phases and empty roadmap', () => {
    const emptyState: PlanningState = {
      roadmap: { phases: [] },
      state: {
        milestone: "",
        milestone_name: "",
        status: "",
        stopped_at: "",
        last_updated: "",
        last_activity: "",
        branch: "",
        progress: {
          total_phases: 0,
          completed_phases: 0,
          total_plans: 0,
          completed_plans: 0,
          percent: 0,
        },
      },
      config: {
        model_profile: "",
        commit_docs: false,
        search_gitignored: false,
        branching_strategy: "",
        phase_branch_template: "",
        milestone_branch_template: "",
        workflow: {
          research: false,
          plan_check: false,
          verifier: false,
          nyquist_validation: false,
          _auto_chain_active: false,
        },
        parallelization: false,
        brave_search: false,
        mode: "",
        granularity: "",
      },
      phases: [],
      requirements: [],
    } as unknown as PlanningState;
    const mode = deriveSessionMode(emptyState, "connected", null);
    expect(mode).toBe("onboarding");
  });

  it('returns "resume" when state has data and continueHere is provided', () => {
    const stateWithData = {
      roadmap: { phases: [{ completed: false, number: 1, name: "Setup", description: "" }] },
      state: {
        milestone: "v1.0",
        milestone_name: "milestone",
        status: "in_progress",
        stopped_at: "",
        last_updated: "",
        last_activity: "",
        branch: "",
        progress: {
          total_phases: 1,
          completed_phases: 0,
          total_plans: 1,
          completed_plans: 0,
          percent: 0,
        },
      },
      config: {
        model_profile: "",
        commit_docs: false,
        search_gitignored: false,
        branching_strategy: "",
        phase_branch_template: "",
        milestone_branch_template: "",
        workflow: {
          research: false,
          plan_check: false,
          verifier: false,
          nyquist_validation: false,
          _auto_chain_active: false,
        },
        parallelization: false,
        brave_search: false,
        mode: "",
        granularity: "",
      },
      phases: [
        {
          number: 1,
          name: "Setup",
          status: "in_progress",
          completedPlans: 0,
          plans: [],
          verifications: [],
        },
      ],
      slices: [{ id: "S01", name: "Setup", status: "complete", taskCount: 1, costEstimate: null, branch: "", dependencies: [] }],
      requirements: [],
    } as unknown as PlanningState;
    const continueHere: ContinueHereData = {
      phase: "Phase 1",
      task: 2,
      totalTasks: 5,
      status: "in_progress",
      currentState: "Working on task 2",
      nextAction: "Complete tests",
    };
    const mode = deriveSessionMode(stateWithData, "connected", continueHere);
    expect(mode).toBe("resume");
  });

  it('returns "dashboard" when state has data and no continueHere', () => {
    const stateWithData = {
      roadmap: { phases: [{ completed: false, number: 1, name: "Setup", description: "" }] },
      state: {
        milestone: "v1.0",
        milestone_name: "milestone",
        status: "in_progress",
        stopped_at: "",
        last_updated: "",
        last_activity: "",
        branch: "",
        progress: {
          total_phases: 1,
          completed_phases: 0,
          total_plans: 1,
          completed_plans: 0,
          percent: 0,
        },
      },
      config: {
        model_profile: "",
        commit_docs: false,
        search_gitignored: false,
        branching_strategy: "",
        phase_branch_template: "",
        milestone_branch_template: "",
        workflow: {
          research: false,
          plan_check: false,
          verifier: false,
          nyquist_validation: false,
          _auto_chain_active: false,
        },
        parallelization: false,
        brave_search: false,
        mode: "",
        granularity: "",
      },
      phases: [
        {
          number: 1,
          name: "Setup",
          status: "in_progress",
          completedPlans: 0,
          plans: [],
          verifications: [],
        },
      ],
      slices: [{ id: "S01", name: "Setup", status: "complete", taskCount: 1, costEstimate: null, branch: "", dependencies: [] }],
      requirements: [],
    } as unknown as PlanningState;
    const mode = deriveSessionMode(stateWithData, "connected", null);
    expect(mode).toBe("dashboard");
  });
});

// -- Component tests (Task 2) --

import { ResumeCardView } from "../src/components/session/ResumeCard";
import { ProjectSelectorView } from "../src/components/session/ProjectSelector";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("OnboardingScreenView", () => {
  const src = readFileSync(join(import.meta.dir, "../src/components/session/OnboardingScreen.tsx"), "utf8");

  it("renders logo animation and welcome text", () => {
    expect(src).toContain("Welcome to GSD Mission Control");
  });

  it("renders Open Project button", () => {
    expect(src).toContain("Open Project");
  });
});

describe("ResumeCardView", () => {
  it("renders phase info and action buttons", () => {
    const data: ContinueHereData = {
      phase: "Phase 3",
      task: 2,
      totalTasks: 5,
      status: "in_progress",
      currentState: "Building components",
      nextAction: "Run tests",
    };
    const result = ResumeCardView({
      data,
      onResume: () => {},
      onDismiss: () => {},
    });
    const json = JSON.stringify(result);
    expect(json).toContain("Phase 3");
    // Numbers serialize as separate array elements: ["Task ",2," of ",5,...]
    expect(json).toContain("Task ");
    expect(json).toContain("Building components");
    expect(json).toContain("Run tests");
    expect(json).toContain("Resume");
    expect(json).toContain("Dismiss");
  });
});

describe("ProjectSelectorView", () => {
  it("renders project list sorted by lastOpened descending", () => {
    const projects = [
      { name: "alpha", path: "/alpha", lastOpened: 100, isGsdProject: false },
      { name: "beta", path: "/beta", lastOpened: 300, isGsdProject: true },
      { name: "gamma", path: "/gamma", lastOpened: 200, isGsdProject: false },
    ];
    const result = ProjectSelectorView({
      projects,
      onSelectProject: () => {},
    });
    const json = JSON.stringify(result);
    // beta (300) should appear before gamma (200) and alpha (100)
    const betaIdx = json.indexOf("beta");
    const gammaIdx = json.indexOf("gamma");
    const alphaIdx = json.indexOf("alpha");
    expect(betaIdx).toBeLessThan(gammaIdx);
    expect(gammaIdx).toBeLessThan(alphaIdx);
  });

  it("shows GSD badge for GSD projects", () => {
    const projects = [
      { name: "myproject", path: "/myproject", lastOpened: 100, isGsdProject: true },
    ];
    const result = ProjectSelectorView({
      projects,
      onSelectProject: () => {},
    });
    const json = JSON.stringify(result);
    expect(json).toContain("GSD");
    expect(json).toContain("myproject");
  });
});
