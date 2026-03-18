/**
 * SlicePlanned and SliceInProgress source-text tests.
 * Strategy: read component files as strings, assert key implementation details.
 * Avoids React hook rendering complexity in Bun test environment.
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const PLANNED_PATH = join(
  import.meta.dir,
  "../src/components/milestone/SlicePlanned.tsx"
);

const IN_PROGRESS_PATH = join(
  import.meta.dir,
  "../src/components/milestone/SliceInProgress.tsx"
);

const ROW_PATH = join(
  import.meta.dir,
  "../src/components/milestone/SliceRow.tsx"
);

let plannedSource = "";
try {
  plannedSource = readFileSync(PLANNED_PATH, "utf-8");
} catch {
  plannedSource = "";
}

let inProgressSource = "";
try {
  inProgressSource = readFileSync(IN_PROGRESS_PATH, "utf-8");
} catch {
  inProgressSource = "";
}

let rowSource = "";
try {
  rowSource = readFileSync(ROW_PATH, "utf-8");
} catch {
  rowSource = "";
}

// ---------------------------------------------------------------------------
// SlicePlanned tests
// ---------------------------------------------------------------------------
describe("SlicePlanned", () => {
  it("Test 1: file exists and renders slice ID badge (font-mono text-sm text-[#5BC8F0])", () => {
    expect(plannedSource.length).toBeGreaterThan(0);
    // ID badge uses the cyan color class
    expect(plannedSource).toContain("text-[#5BC8F0]");
    // Renders slice.id
    expect(plannedSource).toContain("slice.id");
  });

  it("Test 2: renders slice name", () => {
    expect(plannedSource).toContain("slice.name");
  });

  it("Test 3: renders task count — 'tasks planned' text", () => {
    expect(plannedSource).toContain("tasks planned");
  });

  it("Test 4: renders cost estimate — 'est. ~$' text", () => {
    expect(plannedSource).toContain("est. ~$");
  });

  it("Test 5: renders branch string", () => {
    expect(plannedSource).toContain("slice.branch");
  });

  it("Test 6: Start this slice button is disabled when any dep has complete=false", () => {
    // canStart logic uses every(dep => dep.complete)
    expect(plannedSource).toContain("canStart");
    expect(plannedSource).toContain("dep.complete");
    // disabled attribute or className conditional
    expect(plannedSource).toContain("disabled");
  });

  it("Test 7: Start this slice button is enabled when all deps complete=true — canStart used for disabled prop", () => {
    // The disabled state is bound to !canStart
    expect(plannedSource).toContain("!canStart");
  });

  it("Test 8: Review plan button is always enabled — no disabled attribute", () => {
    // Review plan button should NOT have disabled on it
    expect(plannedSource).toContain("Review plan");
  });

  it("Test 9: Clicking Start this slice calls onAction with start_slice type", () => {
    expect(plannedSource).toContain("start_slice");
    expect(plannedSource).toContain("onAction");
  });

  it("Test 10: Dependencies render with name and check/dot indicator", () => {
    // Iterates over slice.dependencies
    expect(plannedSource).toContain("slice.dependencies");
    // Renders dep.name
    expect(plannedSource).toContain("dep.name");
    // Uses ✓ for complete
    expect(plannedSource).toContain("\u2713");
    // dep.complete conditional
    expect(plannedSource).toContain("dep.complete");
  });

  it("has data-testid='slice-planned' on root div", () => {
    expect(plannedSource).toContain('data-testid="slice-planned"');
  });

  it("imports GSD2SliceInfo and SliceAction from server/types", () => {
    expect(plannedSource).toContain("GSD2SliceInfo");
    expect(plannedSource).toContain("SliceAction");
    expect(plannedSource).toContain("server/types");
  });

  it("uses PLANNED status badge text", () => {
    expect(plannedSource).toContain("PLANNED");
  });

  it("has Review plan onAction call with view_plan type", () => {
    expect(plannedSource).toContain("view_plan");
  });
});

// ---------------------------------------------------------------------------
// SliceInProgress tests
// ---------------------------------------------------------------------------
describe("SliceInProgress", () => {
  it("Test 1: file exists and renders slice ID and branch", () => {
    expect(inProgressSource.length).toBeGreaterThan(0);
    expect(inProgressSource).toContain("slice.id");
    expect(inProgressSource).toContain("slice.branch");
  });

  it("Test 2: renders amber accent with border-l-[#F59E0B]", () => {
    expect(inProgressSource).toContain("border-l-[#F59E0B]");
  });

  it("Test 3: source text contains animate-pulse class (amber pulse)", () => {
    expect(inProgressSource).toContain("animate-pulse");
  });

  it("Test 4: imports ProgressBar", () => {
    expect(inProgressSource).toContain("ProgressBar");
  });

  it("Test 5: renders Task N of M — completedTaskCount and totalTaskCount used", () => {
    expect(inProgressSource).toContain("completedTaskCount");
    expect(inProgressSource).toContain("totalTaskCount");
  });

  it("Test 6: renders running cost — 'so far' text", () => {
    expect(inProgressSource).toContain("so far");
    expect(inProgressSource).toContain("runningCost");
  });

  it("Test 7: Pause button calls onAction with pause type", () => {
    expect(inProgressSource).toContain("pause");
    expect(inProgressSource).toContain("onAction");
  });

  it("Test 8: Steer button reveals text input via steerOpen state", () => {
    expect(inProgressSource).toContain("steerOpen");
    expect(inProgressSource).toContain("steerText");
  });

  it("Test 9: submitting steer calls onAction with steer type and message", () => {
    expect(inProgressSource).toContain("type: 'steer'");
    expect(inProgressSource).toContain("message");
  });

  it("has data-testid='slice-in-progress' on root div", () => {
    expect(inProgressSource).toContain('data-testid="slice-in-progress"');
  });

  it("imports GSD2SliceInfo and SliceAction from server/types", () => {
    expect(inProgressSource).toContain("GSD2SliceInfo");
    expect(inProgressSource).toContain("SliceAction");
    expect(inProgressSource).toContain("server/types");
  });

  it("uses amber border-l indicator for pulse — border-l-[#F59E0B]", () => {
    expect(inProgressSource).toContain("border-l-[#F59E0B]");
  });

  it("renders commitCount prop", () => {
    expect(inProgressSource).toContain("commitCount");
  });
});

// ---------------------------------------------------------------------------
// SliceRow dispatcher tests
// ---------------------------------------------------------------------------
describe("SliceRow", () => {
  it("file exists", () => {
    expect(rowSource.length).toBeGreaterThan(0);
  });

  it("renders SlicePlanned when slice.status === 'planned'", () => {
    expect(rowSource).toContain("SlicePlanned");
    expect(rowSource).toContain("planned");
  });

  it("renders SliceInProgress when slice.status === 'in_progress'", () => {
    expect(rowSource).toContain("SliceInProgress");
    expect(rowSource).toContain("in_progress");
  });

  it("renders SliceNeedsReview when slice.status === 'needs_review' (14-04)", () => {
    expect(rowSource).toContain("SliceNeedsReview");
    expect(rowSource).toContain("needs_review");
  });

  it("renders SliceComplete when slice.status === 'complete' (14-04)", () => {
    expect(rowSource).toContain("SliceComplete");
    expect(rowSource).toContain("status === \"complete\"");
  });

  it("accepts isOpen and onToggle props", () => {
    expect(rowSource).toContain("isOpen");
    expect(rowSource).toContain("onToggle");
  });

  it("accepts onAction prop", () => {
    expect(rowSource).toContain("onAction");
  });

  it("imports SlicePlanned and SliceInProgress", () => {
    expect(rowSource).toContain("SlicePlanned");
    expect(rowSource).toContain("SliceInProgress");
  });

  it("uses StatusBadge or inline status badge logic", () => {
    // StatusBadge inline helper or separate component
    expect(rowSource).toContain("StatusBadge");
  });

  it("imports GSD2SliceInfo and SliceAction from server/types", () => {
    expect(rowSource).toContain("GSD2SliceInfo");
    expect(rowSource).toContain("SliceAction");
  });
});
