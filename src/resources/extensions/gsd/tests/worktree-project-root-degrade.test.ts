// GSD-2 + Worktree dispatch guard: degrade empty worktrees over real project roots.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { shouldDegradeEmptyWorktreeToProjectRoot } from "../auto/phases.ts";
import type { ProjectClassification } from "../detection.ts";

function classification(kind: ProjectClassification["kind"]): ProjectClassification {
  return {
    kind,
    signals: {
      detectedFiles: [],
      isGitRepo: true,
      isMonorepo: false,
      xcodePlatforms: [],
      hasCI: false,
      hasTests: false,
      verificationCommands: [],
    },
    trackedFiles: [],
    untrackedFiles: [],
    contentFiles: [],
    markers: [],
    reason: kind,
  };
}

describe("worktree project-root degradation", () => {
  test("degrades when worktree is greenfield but project root has content", () => {
    assert.equal(
      shouldDegradeEmptyWorktreeToProjectRoot(
        classification("greenfield"),
        classification("typed-existing"),
      ),
      true,
    );
    assert.equal(
      shouldDegradeEmptyWorktreeToProjectRoot(
        classification("greenfield"),
        classification("untyped-existing"),
      ),
      true,
    );
  });

  test("keeps true greenfield worktrees in worktree mode", () => {
    assert.equal(
      shouldDegradeEmptyWorktreeToProjectRoot(
        classification("greenfield"),
        classification("greenfield"),
      ),
      false,
    );
  });

  test("does not degrade when project root classification is invalid", () => {
    assert.equal(
      shouldDegradeEmptyWorktreeToProjectRoot(
        classification("greenfield"),
        classification("invalid-repo"),
      ),
      false,
    );
  });
});
