/**
 * Session flow performance tests (SESS-04 coverage).
 *
 * Verifies first render mode resolution completes under 800ms
 * and synchronous derivation under 50ms.
 */
import { describe, expect, it } from "bun:test";
import { deriveSessionMode } from "../src/hooks/useSessionFlow";
import type { PlanningState } from "../src/server/types";

const MOCK_STATE: PlanningState = {
  roadmap: {
    phases: [{ completed: false, number: 1, name: "Setup", description: "" }],
  },
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
  requirements: [],
};

describe("session flow performance", () => {
  it("first render initialization with mocked fetch completes under 800ms", async () => {
    // Simulate the full flow: deriveSessionMode + fetch mock + mode resolution
    const start = performance.now();

    // Step 1: Initial derivation (synchronous — should be near-instant)
    const initialMode = deriveSessionMode(MOCK_STATE, "connected", null);

    // Step 2: Simulate fetch to /api/session/status returning no continue-here
    const mockResponse = { continueHere: null };
    const fetchResult = await Promise.resolve(mockResponse);

    // Step 3: Final derivation with fetched data
    const finalMode = deriveSessionMode(
      MOCK_STATE,
      "connected",
      fetchResult.continueHere
    );

    const elapsed = performance.now() - start;

    expect(initialMode).toBe("dashboard");
    expect(finalMode).toBe("dashboard");
    expect(elapsed).toBeLessThan(800);
  });

  it("session mode derivation without fetch completes under 50ms", () => {
    // Initializing mode — synchronous, no fetch needed
    const start1 = performance.now();
    const mode1 = deriveSessionMode(null, "connecting", null);
    const elapsed1 = performance.now() - start1;

    expect(mode1).toBe("initializing");
    expect(elapsed1).toBeLessThan(50);

    // Onboarding mode — synchronous, no fetch needed
    const start2 = performance.now();
    const mode2 = deriveSessionMode(null, "connected", null);
    const elapsed2 = performance.now() - start2;

    expect(mode2).toBe("onboarding");
    expect(elapsed2).toBeLessThan(50);
  });

  it("mode derivation with continue-here data completes under 50ms", () => {
    const continueHere = {
      phase: "Phase 1",
      task: 2,
      totalTasks: 5,
      status: "in_progress",
      currentState: "Working",
      nextAction: "Test",
    };

    const start = performance.now();
    const mode = deriveSessionMode(MOCK_STATE, "connected", continueHere);
    const elapsed = performance.now() - start;

    expect(mode).toBe("resume");
    expect(elapsed).toBeLessThan(50);
  });
});
