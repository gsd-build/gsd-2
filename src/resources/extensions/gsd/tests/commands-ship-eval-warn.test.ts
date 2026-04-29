/**
 * Unit tests for the pre-ship eval-review soft-warning helper.
 *
 * The helper `checkSliceEvalReview` is a pure-data classifier called by
 * `handleShip` for each slice in the active milestone. It must:
 *   - return `absent` on missing file (no exception, no throw)
 *   - tolerate a TOCTOU race where the file is deleted between
 *     resolution and read (regression: prior parser would have crashed on this race)
 *   - report `malformed` on schema-invalid frontmatter (no crash)
 *   - report `ok` with verdict + overall_score on a valid frontmatter
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { checkSliceEvalReview } from "../commands-ship.js";
import { _clearGsdRootCache, resolveSliceFile } from "../paths.js";

describe("checkSliceEvalReview", () => {
  let basePath: string;
  let sliceDir: string;

  beforeEach(() => {
    basePath = join(tmpdir(), `gsd-ship-eval-${randomUUID()}`);
    sliceDir = join(basePath, ".gsd", "milestones", "M001", "slices", "S07");
    mkdirSync(sliceDir, { recursive: true });
  });

  afterEach(() => {
    _clearGsdRootCache();
    rmSync(basePath, { recursive: true, force: true });
  });

  function writeEvalReview(filename: string, content: string): string {
    const path = join(sliceDir, filename);
    writeFileSync(path, content, "utf-8");
    return path;
  }

  function happyFrontmatter(overrides: Record<string, string> = {}): string {
    const fields = {
      schema: "eval-review/v1",
      verdict: "PRODUCTION_READY",
      coverage_score: "85",
      infrastructure_score: "80",
      overall_score: "83",
      generated: "2026-04-28T14:00:00Z",
      slice: "S07",
      milestone: "M001",
      ...overrides,
    };
    const lines = ["---"];
    for (const [k, v] of Object.entries(fields)) lines.push(`${k}: ${v}`);
    lines.push("gaps: []");
    lines.push("counts:");
    lines.push("  blocker: 0");
    lines.push("  major: 0");
    lines.push("  minor: 0");
    lines.push("---");
    lines.push("");
    lines.push("# Body — never parsed");
    return lines.join("\n");
  }

  it("returns absent when EVAL-REVIEW.md is missing", async () => {
    const result = await checkSliceEvalReview(basePath, "M001", "S07");
    assert.equal(result.kind, "absent");
    assert.equal(result.sliceId, "S07");
  });

  it("returns ok with verdict and overall_score when frontmatter is valid (PRODUCTION_READY path)", async () => {
    writeEvalReview("S07-EVAL-REVIEW.md", happyFrontmatter());
    const result = await checkSliceEvalReview(basePath, "M001", "S07");
    assert.equal(result.kind, "ok");
    if (result.kind === "ok") {
      assert.equal(result.verdict, "PRODUCTION_READY");
      assert.equal(result.overall_score, 83);
    }
  });

  it("returns ok with NOT_IMPLEMENTED verdict (warning path)", async () => {
    writeEvalReview(
      "S07-EVAL-REVIEW.md",
      happyFrontmatter({
        verdict: "NOT_IMPLEMENTED",
        coverage_score: "10",
        infrastructure_score: "20",
        overall_score: "14",
      }),
    );
    const result = await checkSliceEvalReview(basePath, "M001", "S07");
    assert.equal(result.kind, "ok");
    if (result.kind === "ok") {
      assert.equal(result.verdict, "NOT_IMPLEMENTED");
      assert.equal(result.overall_score, 14);
    }
  });

  it("returns malformed with a JSON-Pointer when verdict is invalid (regression: malformed verdicts must not parse silently)", async () => {
    writeEvalReview("S07-EVAL-REVIEW.md", happyFrontmatter({ verdict: "MOSTLY_OK" }));
    const result = await checkSliceEvalReview(basePath, "M001", "S07");
    assert.equal(result.kind, "malformed");
    if (result.kind === "malformed") {
      assert.ok(result.pointer.includes("verdict"), `pointer should reference verdict, got ${result.pointer}`);
    }
  });

  it("returns malformed when the file has no frontmatter delimiters at all", async () => {
    writeEvalReview("S07-EVAL-REVIEW.md", "# Just a body, no frontmatter");
    const result = await checkSliceEvalReview(basePath, "M001", "S07");
    assert.equal(result.kind, "malformed");
  });

  it("returns malformed when the YAML is syntactically broken inside the frontmatter block", async () => {
    writeEvalReview("S07-EVAL-REVIEW.md", "---\nfoo: : bar\n---\n");
    const result = await checkSliceEvalReview(basePath, "M001", "S07");
    assert.equal(result.kind, "malformed");
  });

  it("treats a TOCTOU race (file deleted after resolution but before read) as absent without throwing (regression: TOCTOU race must surface as absent, not throw)", async () => {
    const path = writeEvalReview("S07-EVAL-REVIEW.md", happyFrontmatter());
    // Warm the directory-listing cache used inside resolveSliceFile so the
    // resolver still sees the file by name on the next call. Then delete the
    // file. The subsequent checkSliceEvalReview call resolves a path that
    // points to a missing file — exactly the race a prior existsSync +
    // readFileSync sequence panicked on.
    const resolved = resolveSliceFile(basePath, "M001", "S07", "EVAL-REVIEW");
    assert.equal(resolved, path);
    unlinkSync(path);
    const result = await checkSliceEvalReview(basePath, "M001", "S07");
    assert.equal(result.kind, "absent");
  });

  it("does NOT trigger a malformed verdict on bodies with prose, tables, or numbered lists (regression: body is never parsed)", async () => {
    const body = [
      "",
      "## Gap Analysis",
      "1. first numbered item that the previous parser would have grabbed",
      "2. second numbered item",
      "",
      "| dim | sev |",
      "|---|---|",
      "| metrics | major |",
      "",
      "Some prose paragraph describing the audit.",
    ].join("\n");
    writeEvalReview("S07-EVAL-REVIEW.md", happyFrontmatter() + body);
    const result = await checkSliceEvalReview(basePath, "M001", "S07");
    assert.equal(result.kind, "ok");
  });
});
