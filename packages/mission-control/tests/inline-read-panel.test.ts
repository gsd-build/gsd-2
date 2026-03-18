/**
 * Inline Read Panel tests — source-text strategy.
 *
 * Tests 1-8: gsd-file-api.ts handler + server.ts registration
 * Tests 9-16: InlineReadPanel component + MilestoneView wiring
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const ROOT = resolve(import.meta.dir, "..");

// ── Task 1: gsd-file-api.ts ──────────────────────────────────────────────────

describe("gsd-file-api.ts — source-text checks", () => {
  const apiPath = resolve(ROOT, "src/server/gsd-file-api.ts");
  let src: string;

  test("Test 1: file exports handleGsdFileRequest", () => {
    src = readFileSync(apiPath, "utf-8");
    expect(src).toContain("export");
    expect(src).toContain("handleGsdFileRequest");
  });

  test("Test 2: handles type=plan (S{NN}-PLAN.md path pattern)", () => {
    src = src ?? readFileSync(apiPath, "utf-8");
    expect(src).toMatch(/PLAN\.md/);
    expect(src).toMatch(/sliceId/);
  });

  test("Test 3: handles type=uat_results (UAT-RESULTS.md path pattern)", () => {
    src = src ?? readFileSync(apiPath, "utf-8");
    expect(src).toContain("UAT-RESULTS.md");
  });

  test("Test 4: validates sliceId param — returns 400 if missing", () => {
    src = src ?? readFileSync(apiPath, "utf-8");
    expect(src).toContain("sliceId");
    expect(src).toContain("400");
  });

  test("Test 5: validates type param — returns 400 for invalid type", () => {
    src = src ?? readFileSync(apiPath, "utf-8");
    // Must have validation for the type param
    expect(src).toMatch(/plan.*task.*diff.*uat_results|uat_results.*diff.*task.*plan/s);
    expect(src).toContain("400");
  });

  test("Test 6: handles missing file with '(file not found)' fallback", () => {
    src = src ?? readFileSync(apiPath, "utf-8");
    expect(src).toContain("file not found");
  });
});

describe("server.ts — gsd-file route registration", () => {
  const serverPath = resolve(ROOT, "src/server.ts");
  let src: string;

  test("Test 7: server.ts imports handleGsdFileRequest", () => {
    src = readFileSync(serverPath, "utf-8");
    expect(src).toContain("handleGsdFileRequest");
  });

  test("Test 8: server.ts has /api/gsd-file route block", () => {
    src = src ?? readFileSync(serverPath, "utf-8");
    expect(src).toContain("/api/gsd-file");
  });
});

// ── Task 2: InlineReadPanel + MilestoneView ──────────────────────────────────

describe("InlineReadPanel.tsx — source-text checks", () => {
  const panelPath = resolve(ROOT, "src/components/milestone/InlineReadPanel.tsx");
  let src: string;

  test("Test 9: InlineReadPanel.tsx exists and has data-testid='inline-read-panel'", () => {
    src = readFileSync(panelPath, "utf-8");
    expect(src).toContain('data-testid="inline-read-panel"');
  });

  test("Test 10: has isOpen, title, content, onClose, isLoading props in interface", () => {
    src = src ?? readFileSync(panelPath, "utf-8");
    expect(src).toContain("isOpen");
    expect(src).toContain("title");
    expect(src).toContain("content");
    expect(src).toContain("onClose");
    expect(src).toContain("isLoading");
  });

  test("Test 11: renders close button with aria-label='Close'", () => {
    src = src ?? readFileSync(panelPath, "utf-8");
    expect(src).toContain('aria-label="Close"');
  });

  test("Test 12: has font-mono text-xs for content display", () => {
    src = src ?? readFileSync(panelPath, "utf-8");
    expect(src).toContain("font-mono");
    expect(src).toContain("text-xs");
  });
});

describe("MilestoneView.tsx — InlineReadPanel wiring", () => {
  const viewPath = resolve(ROOT, "src/components/views/MilestoneView.tsx");
  let src: string;

  test("Test 13: MilestoneView imports InlineReadPanel", () => {
    src = readFileSync(viewPath, "utf-8");
    expect(src).toContain("InlineReadPanel");
  });

  test("Test 14: MilestoneView has no console.log stub for view actions", () => {
    src = src ?? readFileSync(viewPath, "utf-8");
    expect(src).not.toContain("[MilestoneView] view action deferred");
  });

  test("Test 15: MilestoneView fetches /api/gsd-file for view_plan case", () => {
    src = src ?? readFileSync(viewPath, "utf-8");
    expect(src).toContain("/api/gsd-file");
    expect(src).toContain("view_plan");
  });

  test("Test 16: MilestoneView fetches /api/gsd-file for view_diff case", () => {
    src = src ?? readFileSync(viewPath, "utf-8");
    expect(src).toContain("view_diff");
    expect(src).toContain("/api/gsd-file");
  });
});

// ── Task 3: gsd-file-api.ts — milestoneId & dual-path fallback ──────────────

describe("gsd-file-api.ts — milestoneId and dual-path fallback", () => {
  const apiPath = resolve(ROOT, "src/server/gsd-file-api.ts");
  let src: string;

  test("Test 17: milestoneId query param is accepted without error", () => {
    src = readFileSync(apiPath, "utf-8");
    expect(src).toContain("milestoneId");
    expect(src).toMatch(/searchParams\.get\(["']milestoneId["']\)/);
  });

  test("Test 18: type=plan tries root path, falls back to milestone subdir when root returns '(file not found)'", () => {
    src = src ?? readFileSync(apiPath, "utf-8");
    // Root path: join(gsdDir, `${sliceId}-PLAN.md`)
    expect(src).toMatch(/join\(gsdDir,\s*`\$\{sliceId\}-PLAN\.md`\)/);
    // Fallback check: content === "(file not found)" && milestoneId
    expect(src).toMatch(/content\s*===\s*["']\(file not found\)["']\s*&&\s*milestoneId/);
    // Subdir path: milestones/{milestoneId}/slices/{sliceId}
    expect(src).toContain("milestones");
    expect(src).toMatch(/join\(gsdDir,\s*["']milestones["']/);
  });

  test("Test 19: type=task tries root path, falls back with milestoneId", () => {
    src = src ?? readFileSync(apiPath, "utf-8");
    // Root path for task: join(gsdDir, `${taskId}-SUMMARY.md`)
    expect(src).toMatch(/join\(gsdDir,\s*`\$\{taskId\}-SUMMARY\.md`\)/);
    // Fallback path includes milestones + slices + tasks subdirectories
    expect(src).toMatch(/["']tasks["']/);
    expect(src).toMatch(/SUMMARY\.md/);
  });

  test("Test 20: type=uat_results tries root path, falls back with milestoneId", () => {
    src = src ?? readFileSync(apiPath, "utf-8");
    // Root path: join(gsdDir, `${sliceId}-UAT-RESULTS.md`)
    expect(src).toMatch(/join\(gsdDir,\s*`\$\{sliceId\}-UAT-RESULTS\.md`\)/);
    // Fallback: milestones/{milestoneId}/slices/{sliceId}/{sliceId}-UAT-RESULTS.md
    // The case "uat_results" block has both root and subdir path attempts
    expect(src).toMatch(/case\s*["']uat_results["']/);
    expect(src).toContain("UAT-RESULTS.md");
  });
});
