/**
 * Regression tests for parseWorkflowArgs cwd handling:
 *  - Refuses when projectDir resolves to $HOME (defense-in-depth against the
 *    MCP server's process.cwd() falling back to home).
 *  - Routes writes to a sole active auto-worktree when milestoneId is omitted.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { _parseWorkflowArgsForTest } from "./workflow-tools.js";

const minimalSchema = z.object({
  projectDir: z.string().optional(),
  milestoneId: z.string().optional(),
});

describe("parseWorkflowArgs $HOME guard", () => {
  it("throws when projectDir resolves to the user's home directory", () => {
    assert.throws(
      () => _parseWorkflowArgsForTest(minimalSchema, { projectDir: homedir() }),
      /home directory/i,
    );
  });
});

describe("parseWorkflowArgs sole-worktree fallback", () => {
  it("routes writes to the lone auto-worktree when milestoneId is omitted", () => {
    const project = realpathSync(mkdtempSync(join(tmpdir(), "gsd-mcp-wt-")));
    try {
      mkdirSync(join(project, ".gsd"), { recursive: true });
      const wt = join(project, ".gsd", "worktrees", "M001");
      mkdirSync(wt, { recursive: true });
      writeFileSync(join(wt, ".git"), "gitdir: /fake/path/to/git\n");

      const result = _parseWorkflowArgsForTest(minimalSchema, { projectDir: project });
      assert.equal(result.projectDir, wt, "should re-route to the sole worktree");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("stays at project root when multiple worktrees exist (ambiguous)", () => {
    const project = realpathSync(mkdtempSync(join(tmpdir(), "gsd-mcp-wt-multi-")));
    try {
      mkdirSync(join(project, ".gsd"), { recursive: true });
      for (const id of ["M001", "M002"]) {
        const wt = join(project, ".gsd", "worktrees", id);
        mkdirSync(wt, { recursive: true });
        writeFileSync(join(wt, ".git"), "gitdir: /fake/git\n");
      }

      const result = _parseWorkflowArgsForTest(minimalSchema, { projectDir: project });
      assert.equal(result.projectDir, project, "ambiguous → keep project root");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("uses the explicit milestone worktree when milestoneId is provided", () => {
    const project = realpathSync(mkdtempSync(join(tmpdir(), "gsd-mcp-wt-explicit-")));
    try {
      mkdirSync(join(project, ".gsd"), { recursive: true });
      const wt = join(project, ".gsd", "worktrees", "M042");
      mkdirSync(wt, { recursive: true });
      writeFileSync(join(wt, ".git"), "gitdir: /fake/git\n");

      const result = _parseWorkflowArgsForTest(minimalSchema, {
        projectDir: project,
        milestoneId: "M042",
      });
      assert.equal(result.projectDir, wt);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});
