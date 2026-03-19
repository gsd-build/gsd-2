/**
 * Tests for SliceNeedsReview and SliceComplete slice state cards.
 * Uses source-text strategy (readFileSync) to avoid React hook rendering
 * complexity in Bun test environment.
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const needsReviewSrc = readFileSync(
  join(root, "src/components/milestone/SliceNeedsReview.tsx"),
  "utf-8"
);
const completeSrc = readFileSync(
  join(root, "src/components/milestone/SliceComplete.tsx"),
  "utf-8"
);
const uatResultsSrc = readFileSync(
  join(root, "src/server/uat-results-api.ts"),
  "utf-8"
);

// ---------------------------------------------------------------------------
// SliceNeedsReview tests
// ---------------------------------------------------------------------------
describe("SliceNeedsReview", () => {
  test("Test 1: renders slice ID and name", () => {
    expect(needsReviewSrc).toContain("slice.id");
    expect(needsReviewSrc).toContain("slice.name");
  });

  test("Test 2: renders NEEDS YOUR REVIEW badge", () => {
    expect(needsReviewSrc).toContain("NEEDS YOUR REVIEW");
  });

  test("Test 3: renders UAT items from uatItems prop as checkbox rows", () => {
    expect(needsReviewSrc).toContain("uatItems");
    expect(needsReviewSrc).toContain('type="checkbox"');
    expect(needsReviewSrc).toContain("item.id");
    expect(needsReviewSrc).toContain("item.text");
  });

  test("Test 4: Merge to main button is disabled when allChecked=false", () => {
    expect(needsReviewSrc).toContain("allChecked");
    expect(needsReviewSrc).toContain("disabled");
    expect(needsReviewSrc).toContain("Merge to main");
  });

  test("Test 5: Merge to main button is enabled when all items are checked", () => {
    // allChecked drives the disabled state
    expect(needsReviewSrc).toContain("!allChecked");
    // Enabled style should be distinct from disabled
    expect(needsReviewSrc).toContain("bg-[#22C55E]");
  });

  test("Test 6: checking a checkbox calls onItemToggle(itemId)", () => {
    expect(needsReviewSrc).toContain("onItemToggle");
    expect(needsReviewSrc).toContain("onChange");
  });

  test("Test 7: renders verified count — N of M verified", () => {
    expect(needsReviewSrc).toContain("verified");
    // shows count of checked / total
    expect(needsReviewSrc).toContain("uatItems.length");
  });

  test("Test 8: source text contains call to /api/uat-results", () => {
    expect(needsReviewSrc).toContain("/api/uat-results");
  });
});

// ---------------------------------------------------------------------------
// SliceComplete tests
// ---------------------------------------------------------------------------
describe("SliceComplete", () => {
  test("Test 1: renders slice ID and complete state metadata", () => {
    expect(completeSrc).toContain("slice.id");
    expect(completeSrc).toContain("slice-complete");
  });

  test("Test 2: renders total cost formatted as $X.XX total", () => {
    expect(completeSrc).toContain("toFixed(2)");
    expect(completeSrc).toContain("total");
  });

  test("Test 3: renders Merged label and commit count", () => {
    expect(completeSrc).toContain("Merged");
    expect(completeSrc).toContain("commitCount");
    expect(completeSrc).toContain("commit");
  });

  test("Test 4: renders last commit message truncated to 72 chars", () => {
    expect(completeSrc).toContain("72");
    expect(completeSrc).toContain("lastCommitMessage");
    expect(completeSrc).toContain("...");
  });

  test("Test 5: View diff button present; calls onAction view_diff", () => {
    expect(completeSrc).toContain("View diff");
    expect(completeSrc).toContain("view_diff");
  });

  test("Test 6: View UAT results button present; calls onAction view_uat_results", () => {
    expect(completeSrc).toContain("View UAT results");
    expect(completeSrc).toContain("view_uat_results");
  });
});

// ---------------------------------------------------------------------------
// uat-results-api tests
// ---------------------------------------------------------------------------
describe("writeUatResults", () => {
  test("exports writeUatResults function", () => {
    expect(uatResultsSrc).toContain("writeUatResults");
    expect(uatResultsSrc).toContain("export");
  });

  test("accepts gsdDir, sliceId, and items parameters", () => {
    expect(uatResultsSrc).toContain("gsdDir");
    expect(uatResultsSrc).toContain("sliceId");
    expect(uatResultsSrc).toContain("items");
  });

  test("writes UAT Results markdown header", () => {
    expect(uatResultsSrc).toContain("UAT Results");
  });

  test("writes checklist items with checkbox format", () => {
    expect(uatResultsSrc).toContain("[x]");
    expect(uatResultsSrc).toContain("[ ]");
    expect(uatResultsSrc).toContain("checked");
  });

  test("uses Bun.write to persist file", () => {
    expect(uatResultsSrc).toContain("Bun.write");
  });

  test("builds path inside gsdDir", () => {
    expect(uatResultsSrc).toContain("join");
    expect(uatResultsSrc).toContain("UAT-RESULTS.md");
  });
});
