/**
 * MilestoneView — handleViewTasks behavior tests (source-text strategy).
 *
 * Verifies the new handleViewTasks logic in MilestoneView.tsx:
 *   - handleViewTasks function defined
 *   - milestoneId included in fetch URL
 *   - Per-milestone closure pattern for handleMilestoneAction
 *   - done === 0 branch (fetches plan)
 *   - done > 0 branch (formats completed tasks inline)
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const viewPath = resolve(ROOT, "src/components/views/MilestoneView.tsx");
let src: string;

describe("MilestoneView.tsx — handleViewTasks logic", () => {
  test("handleViewTasks function is defined", () => {
    src = readFileSync(viewPath, "utf-8");
    expect(src).toContain("handleViewTasks");
    // Must be an async function accepting sliceId and milestone params
    expect(src).toMatch(/async\s+function\s+handleViewTasks\s*\(/);
  });

  test("milestoneId is included in the fetch URL", () => {
    src = src ?? readFileSync(viewPath, "utf-8");
    // The fetch URL includes milestoneId query param
    expect(src).toMatch(/milestoneId=\$\{milestone\.milestoneId\}/);
  });

  test("per-milestone closure pattern: handleMilestoneAction defined inside allMilestones.map", () => {
    src = src ?? readFileSync(viewPath, "utf-8");
    // handleMilestoneAction is defined as an async function inside the map callback
    expect(src).toContain("async function handleMilestoneAction");
    // It references the milestone closure variable and dispatches to handleViewTasks
    expect(src).toContain("handleViewTasks");
    expect(src).toContain("view_tasks");
  });

  test("done === 0 branch fetches PLAN.md content via /api/gsd-file", () => {
    src = src ?? readFileSync(viewPath, "utf-8");
    // The done === 0 branch: fetch plan when no completed tasks
    expect(src).toMatch(/done\s*===\s*0/);
    // It fetches with type=plan
    expect(src).toContain("type=plan");
    // The fetch URL includes both sliceId and milestoneId
    expect(src).toMatch(/sliceId=\$\{sliceId\}/);
  });

  test("done > 0 branch formats completed tasks inline without fetch", () => {
    src = src ?? readFileSync(viewPath, "utf-8");
    // The else branch (done > 0): formats completed tasks inline
    expect(src).toContain("completedTasks");
    // Maps tasks to "[x] T01: Name" format
    expect(src).toMatch(/\[x\]\s*\$\{t\.id\}/);
    // Sets panel content without fetching — isLoading: false
    expect(src).toMatch(/isLoading:\s*false/);
  });

  test("handleViewTasks filters tasks by status === 'complete'", () => {
    src = src ?? readFileSync(viewPath, "utf-8");
    // Counts completed tasks
    expect(src).toMatch(/filter\(\s*\(?t\)?\s*=>\s*t\.status\s*===\s*['"]complete['"]\)/);
  });
});
