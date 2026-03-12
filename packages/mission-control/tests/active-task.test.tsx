/**
 * Active task component tests (Phase 05-02 Task 1).
 *
 * Pattern: Direct function call on components + JSON.stringify inspection,
 * matching the approach used in slice-detail.test.tsx.
 */
import { describe, expect, it } from "bun:test";
import { TaskExecuting } from "../src/components/active-task/TaskExecuting";
import { TaskWaiting } from "../src/components/active-task/TaskWaiting";
import { MustHavesList } from "../src/components/active-task/MustHavesList";
import { TargetFiles } from "../src/components/active-task/TargetFiles";
import { CheckpointRef } from "../src/components/active-task/CheckpointRef";
import type { MustHaves } from "../src/server/types";

// -- TaskExecuting --

describe("TaskExecuting", () => {
  it("renders pulsing amber dot and EXECUTING label", () => {
    const result = TaskExecuting({
      taskId: "05-02",
      wave: 1,
      planNumber: 2,
      filesCount: 3,
      taskCount: 2,
      mustHaves: undefined,
      filesModified: ["a.ts", "b.ts", "c.ts"],
    });
    const json = JSON.stringify(result);
    expect(json).toContain("bg-status-warning");
    expect(json).toContain("animate-pulse");
    expect(json).toContain("Executing");
  });

  it("renders task ID and wave number", () => {
    const result = TaskExecuting({
      taskId: "05-02",
      wave: 2,
      planNumber: 2,
      filesCount: 1,
      taskCount: 1,
      mustHaves: undefined,
      filesModified: ["a.ts"],
    });
    const json = JSON.stringify(result);
    expect(json).toContain("05-02");
    // React serializes mixed children as arrays: ["Wave ",2]
    expect(json).toContain('"Wave ",2]');
  });

  it("renders context budget meter with green for low ratio", () => {
    const result = TaskExecuting({
      taskId: "05-02",
      wave: 1,
      planNumber: 2,
      filesCount: 2,
      taskCount: 2,
      mustHaves: undefined,
      filesModified: ["a.ts", "b.ts"],
    });
    const json = JSON.stringify(result);
    expect(json).toContain("Context Budget");
    expect(json).toContain("bg-status-success");
    // React serializes mixed children: [2," files / ",2," tasks"]
    expect(json).toContain('2," files / ",2," tasks"');
  });

  it("renders context budget meter with red for high ratio", () => {
    const result = TaskExecuting({
      taskId: "05-02",
      wave: 1,
      planNumber: 2,
      filesCount: 14,
      taskCount: 2,
      mustHaves: undefined,
      filesModified: Array.from({ length: 14 }, (_, i) => `file${i}.ts`),
    });
    const json = JSON.stringify(result);
    expect(json).toContain("bg-status-error");
  });

  it("composes MustHavesList and TargetFiles via props", () => {
    const mustHaves: MustHaves = {
      truths: ["renders correctly"],
      artifacts: [],
      key_links: [],
    };
    const result = TaskExecuting({
      taskId: "05-02",
      wave: 1,
      planNumber: 2,
      filesCount: 2,
      taskCount: 1,
      mustHaves,
      filesModified: ["src/app.ts"],
    });
    const json = JSON.stringify(result);
    // Child components are serialized with their props (not expanded)
    expect(json).toContain('"mustHaves"');
    expect(json).toContain("renders correctly");
    expect(json).toContain('"files":["src/app.ts"]');
  });
});

// -- TaskWaiting --

describe("TaskWaiting", () => {
  it("renders WAITING label with slate dot", () => {
    const result = TaskWaiting({});
    const json = JSON.stringify(result);
    expect(json).toContain("bg-slate-500");
    expect(json).toContain("Waiting");
  });

  it("renders last completed info", () => {
    const result = TaskWaiting({ lastCompleted: "Completed 04-02-PLAN.md" });
    const json = JSON.stringify(result);
    expect(json).toContain("Last: Completed 04-02-PLAN.md");
  });

  it("renders next task info", () => {
    const result = TaskWaiting({ nextPlanNumber: 3 });
    const json = JSON.stringify(result);
    expect(json).toContain("Next: Plan 3");
  });

  it("renders run prompt", () => {
    const result = TaskWaiting({});
    const json = JSON.stringify(result);
    expect(json).toContain("Run /gsd:progress to continue");
    expect(json).toContain("text-cyan-accent");
  });

  it("handles undefined props with fallback messages", () => {
    const result = TaskWaiting({});
    const json = JSON.stringify(result);
    expect(json).toContain("No completed tasks");
    expect(json).toContain("No pending tasks");
  });
});

// -- MustHavesList --

describe("MustHavesList", () => {
  it("renders truths with tier badges", () => {
    const mustHaves: MustHaves = {
      truths: [
        "renders the component correctly",
        "file exists at the correct path",
        "command runs successfully",
        "user can verify the output",
      ],
      artifacts: [],
      key_links: [],
    };
    const result = MustHavesList({ mustHaves });
    const json = JSON.stringify(result);
    expect(json).toContain("BEHAVIORAL");
    expect(json).toContain("STATIC");
    expect(json).toContain("COMMAND");
    expect(json).toContain("HUMAN");
  });

  it("renders cyan badge for BEHAVIORAL tier", () => {
    const mustHaves: MustHaves = {
      truths: ["displays the dashboard"],
      artifacts: [],
      key_links: [],
    };
    const result = MustHavesList({ mustHaves });
    const json = JSON.stringify(result);
    expect(json).toContain("bg-cyan-accent/20");
    expect(json).toContain("text-cyan-accent");
    expect(json).toContain("BEHAVIORAL");
  });

  it("renders empty state when must_haves is undefined", () => {
    const result = MustHavesList({ mustHaves: undefined });
    const json = JSON.stringify(result);
    expect(json).toContain("No must-haves defined");
  });

  it("renders empty state when truths array is empty", () => {
    const result = MustHavesList({
      mustHaves: { truths: [], artifacts: [], key_links: [] },
    });
    const json = JSON.stringify(result);
    expect(json).toContain("No must-haves defined");
  });
});

// -- TargetFiles --

describe("TargetFiles", () => {
  it("renders file paths with FileCode icons", () => {
    const result = TargetFiles({ files: ["src/app.ts", "src/utils.ts"] });
    const json = JSON.stringify(result);
    expect(json).toContain("Target Files");
    expect(json).toContain("src/app.ts");
    expect(json).toContain("src/utils.ts");
    expect(json).toContain("FileCode");
  });

  it("renders empty state when files array is empty", () => {
    const result = TargetFiles({ files: [] });
    const json = JSON.stringify(result);
    expect(json).toContain("No target files");
  });
});

// -- CheckpointRef --

describe("CheckpointRef", () => {
  it("renders checkpoint string with GitCommit icon", () => {
    const result = CheckpointRef({ checkpoint: "abc1234" });
    const json = JSON.stringify(result);
    // React serializes mixed children: ["Checkpoint: ","abc1234"]
    expect(json).toContain('"Checkpoint: ","abc1234"');
    expect(json).toContain("GitCommit");
  });

  it("returns null when checkpoint is undefined", () => {
    const result = CheckpointRef({ checkpoint: undefined });
    expect(result).toBeNull();
  });
});
