/**
 * Sidebar content component tests (Phase 04-01 Task 3).
 *
 * Pattern: Direct function call on components + JSON.stringify inspection,
 * matching the approach used in layout.test.tsx.
 */
import { describe, expect, it } from "bun:test";
import { GsdLogo } from "../src/components/sidebar/GsdLogo";
import { ProjectList } from "../src/components/sidebar/ProjectList";
import { NavItems } from "../src/components/sidebar/NavItems";
import { ConnectionStatus } from "../src/components/sidebar/ConnectionStatus";
import type { ProjectState } from "../src/server/types";

const SAMPLE_PROJECT_STATE: ProjectState = {
  milestone: "v1.0",
  milestone_name: "Mission Control",
  status: "active",
  stopped_at: "",
  last_updated: "",
  last_activity: "",
  branch: "main",
  progress: {
    total_phases: 10,
    completed_phases: 3,
    total_plans: 20,
    completed_plans: 9,
    percent: 45,
  },
};

describe("GsdLogo", () => {
  it("renders an img element pointing to the official GSD logo asset", () => {
    const result = GsdLogo({});
    const json = JSON.stringify(result);
    expect(json).toContain("img");
    expect(json).toContain("gsd-2-mission-control-logo.svg");
  });

  it("has alt text for accessibility", () => {
    const result = GsdLogo({});
    const json = JSON.stringify(result);
    expect(json).toContain("GSD");
  });

  it("accepts className prop", () => {
    const result = GsdLogo({ className: "custom-class" });
    const json = JSON.stringify(result);
    expect(json).toContain("custom-class");
  });
});

describe("ProjectList", () => {
  it("renders project name and status when given valid ProjectState", () => {
    const result = ProjectList({ projectState: SAMPLE_PROJECT_STATE });
    const json = JSON.stringify(result);
    expect(json).toContain("Mission Control");
    expect(json).toContain("Active");
    expect(json).toContain("45%");
  });

  it("renders wrapper but no project info when projectState is null", () => {
    const result = ProjectList({ projectState: null });
    const json = JSON.stringify(result);
    // Should not contain project-specific content
    expect(json).not.toContain("Mission Control");
    expect(json).not.toContain("Active");
    // Should still render the container div
    expect(json).toContain("flex flex-col");
  });

  it("shows fallback name when milestone_name is empty", () => {
    const state = { ...SAMPLE_PROJECT_STATE, milestone_name: "" };
    const result = ProjectList({ projectState: state });
    const json = JSON.stringify(result);
    expect(json).toContain("Current Project");
  });
});

describe("NavItems", () => {
  it("renders 4 navigation items", () => {
    const result = NavItems({});
    const json = JSON.stringify(result);
    expect(json).toContain("Projects");
    expect(json).toContain("Activity");
    expect(json).toContain("Verify");
    expect(json).toContain("History");
  });

  it("highlights the active item with cyan accent", () => {
    const result = NavItems({ activeItem: "projects" });
    const json = JSON.stringify(result);
    expect(json).toContain("text-cyan-accent");
  });
});

describe("ConnectionStatus", () => {
  it("shows ACTIVE label when connected", () => {
    const result = ConnectionStatus({ status: "connected" });
    const json = JSON.stringify(result);
    expect(json).toContain("ACTIVE");
    expect(json).toContain("animate-pulse");
    expect(json).toContain("bg-cyan-accent");
  });

  it("shows CONNECTING label when connecting", () => {
    const result = ConnectionStatus({ status: "connecting" });
    const json = JSON.stringify(result);
    expect(json).toContain("CONNECTING");
    expect(json).toContain("animate-pulse");
    expect(json).toContain("bg-status-warning");
  });

  it("shows DISCONNECTED label when disconnected", () => {
    const result = ConnectionStatus({ status: "disconnected" });
    const json = JSON.stringify(result);
    expect(json).toContain("DISCONNECTED");
    expect(json).toContain("bg-status-error");
    expect(json).not.toContain("animate-pulse");
  });

  it("shows model profile when provided", () => {
    const result = ConnectionStatus({ status: "connected", modelProfile: "opus" });
    const json = JSON.stringify(result);
    expect(json).toContain("opus");
  });

  it("shows 'balanced' as default model profile", () => {
    const result = ConnectionStatus({ status: "connected" });
    const json = JSON.stringify(result);
    expect(json).toContain("balanced");
  });
});
