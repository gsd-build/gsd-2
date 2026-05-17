// Project/App: GSD-2
// File Purpose: Worktree Safety module contract for validating source-writing Unit roots.

import { existsSync, lstatSync, type Stats } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

import { normalizeWorktreePathForCompare } from "./worktree-root.js";
import { listWorktrees } from "./worktree-manager.js";
import { getCurrentBranch } from "./worktree.js";

export type WorktreeSafetyWriteScope = "planning-only" | "source-writing";

export type WorktreeSafetyFailureKind =
  | "milestone-id-invalid"
  | "milestone-id-missing"
  | "invalid-root"
  | "worktree-missing"
  | "worktree-git-marker-missing"
  | "worktree-git-marker-not-file"
  | "worktree-git-probe-failed"
  | "worktree-unregistered"
  | "branch-mismatch"
  | "lease-lost"
  | "empty-worktree-with-project-content";

export type WorktreeSafetyResult =
  | {
      ok: true;
      kind: "not-required";
      reason: string;
    }
  | {
      ok: true;
      kind: "safe";
      projectRoot: string;
      unitRoot: string;
      milestoneId: string;
      branch?: string;
    }
  | {
      ok: false;
      kind: WorktreeSafetyFailureKind;
      reason: string;
      remediation: string;
      details?: Record<string, string | number | boolean | null>;
    };

export interface WorktreeSafetyInput {
  unitType: string;
  unitId: string;
  writeScope: WorktreeSafetyWriteScope;
  projectRoot: string;
  unitRoot: string;
  milestoneId?: string | null;
  isolationMode?: "none" | "branch" | "worktree";
  expectedBranch?: string | null;
  emptyWorktreeWithProjectContent?: boolean;
  lease?: {
    required: boolean;
    held: boolean;
    owner?: string | null;
  };
}

export interface RegisteredWorktree {
  path: string;
  branch?: string | null;
}

export interface WorktreeSafetyDeps {
  existsSync(path: string): boolean;
  lstatSync(path: string): Pick<Stats, "isFile">;
  listRegisteredWorktrees?(projectRoot: string): readonly RegisteredWorktree[];
  pruneRegisteredWorktrees?(projectRoot: string): void;
  getCurrentBranch?(unitRoot: string): string;
}

export interface WorktreeSafetyModule {
  validateUnitRoot(input: WorktreeSafetyInput): WorktreeSafetyResult;
}

const fsOnlyDeps: WorktreeSafetyDeps = {
  existsSync,
  lstatSync,
};

const defaultDeps: WorktreeSafetyDeps = {
  ...fsOnlyDeps,
  listRegisteredWorktrees(projectRoot) {
    return listWorktrees(projectRoot).map((worktree) => ({
      path: worktree.path,
      branch: worktree.branch,
    }));
  },
  pruneRegisteredWorktrees(projectRoot) {
    execFileSync("git", ["worktree", "prune"], {
      cwd: projectRoot,
      stdio: "pipe",
    });
  },
  getCurrentBranch,
};

function isValidMilestoneId(milestoneId: string): boolean {
  return milestoneId.length > 0 && !/[\/\\]|\.\./.test(milestoneId);
}

function samePath(a: string, b: string): boolean {
  return normalizeWorktreePathForCompare(a) === normalizeWorktreePathForCompare(b);
}

function failure(
  kind: WorktreeSafetyFailureKind,
  reason: string,
  remediation: string,
  details?: Record<string, string | number | boolean | null>,
): WorktreeSafetyResult {
  return { ok: false, kind, reason, remediation, details };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createWorktreeSafetyModule(
  deps: WorktreeSafetyDeps = defaultDeps,
): WorktreeSafetyModule {
  const unregisteredRecoveryFailed = new Set<string>();

  return {
    validateUnitRoot(input) {
      if (input.writeScope === "planning-only") {
        return {
          ok: true,
          kind: "not-required",
          reason: "planning-only Units may write GSD artifacts without a source worktree",
        };
      }

      const milestoneId = input.milestoneId?.trim();
      if (!milestoneId) {
        return failure(
          "milestone-id-missing",
          `Source-writing Unit ${input.unitType} ${input.unitId} has no milestone id.`,
          "Resolve the Unit milestone before preparing a worktree root.",
        );
      }
      if (!isValidMilestoneId(milestoneId)) {
        return failure(
          "milestone-id-invalid",
          `Milestone id "${milestoneId}" is not safe for worktree path resolution.`,
          "Use a milestone id without path separators or traversal segments.",
          { milestoneId },
        );
      }

      const projectRoot = resolve(input.projectRoot);
      const unitRoot = resolve(input.unitRoot);
      const isolationMode = input.isolationMode ?? "worktree";
      const expectedRoot = isolationMode === "worktree"
        ? join(projectRoot, ".gsd", "worktrees", milestoneId)
        : projectRoot;
      if (!samePath(unitRoot, expectedRoot)) {
        return failure(
          "invalid-root",
          isolationMode === "worktree"
            ? `Unit root ${unitRoot} is not the expected worktree root for ${milestoneId}.`
            : `Unit root ${unitRoot} is not the project root while isolation mode is ${isolationMode}.`,
          isolationMode === "worktree"
            ? "Prepare the Unit in its canonical milestone worktree before allowing source writes."
            : "Run the Unit from the project root when worktree isolation is disabled.",
          { expectedRoot, unitRoot },
        );
      }

      if (!deps.existsSync(unitRoot)) {
        return failure(
          "worktree-missing",
          `Worktree root ${unitRoot} does not exist.`,
          "Create or recover the milestone worktree before dispatching the source-writing Unit.",
          { unitRoot },
        );
      }

      const gitMarker = join(unitRoot, ".git");
      if (!deps.existsSync(gitMarker)) {
        return failure(
          "worktree-git-marker-missing",
          `Worktree root ${unitRoot} has no .git marker.`,
          "Recover or recreate the milestone worktree before dispatching the source-writing Unit.",
          { gitMarker },
        );
      }

      let gitMarkerStat: Pick<Stats, "isFile">;
      try {
        gitMarkerStat = deps.lstatSync(gitMarker);
      } catch (error) {
        return failure(
          "worktree-git-probe-failed",
          `Unable to inspect .git marker for worktree root ${unitRoot}.`,
          "Recover or recreate the milestone worktree before dispatching the source-writing Unit.",
          { gitMarker, error: errorMessage(error) },
        );
      }

      if (isolationMode === "worktree" && !gitMarkerStat.isFile()) {
        return failure(
          "worktree-git-marker-not-file",
          `Worktree root ${unitRoot} has a .git directory, not a registered worktree .git file.`,
          "Use a registered GSD worktree instead of a copied or nested repository.",
          { gitMarker },
        );
      }

      let registered: readonly RegisteredWorktree[] | undefined;
      try {
        registered = deps.listRegisteredWorktrees?.(projectRoot);
      } catch (error) {
        return failure(
          "worktree-git-probe-failed",
          `Unable to list registered worktrees for project root ${projectRoot}.`,
          "Recover or recreate the milestone worktree before dispatching the source-writing Unit.",
          { projectRoot, error: errorMessage(error) },
        );
      }
      if (registered && !registered.some((worktree) => samePath(worktree.path, unitRoot))) {
        const wasPreviouslyTracked = unregisteredRecoveryFailed.has(unitRoot);
        let attemptedPrune = false;

        if (!wasPreviouslyTracked && deps.pruneRegisteredWorktrees) {
          attemptedPrune = true;
          try {
            deps.pruneRegisteredWorktrees(projectRoot);
            const rechecked = deps.listRegisteredWorktrees?.(projectRoot);
            if (rechecked?.some((worktree) => samePath(worktree.path, unitRoot))) {
              unregisteredRecoveryFailed.delete(unitRoot);
              registered = rechecked;
            } else {
              unregisteredRecoveryFailed.add(unitRoot);
            }
          } catch (error) {
            unregisteredRecoveryFailed.add(unitRoot);
            return failure(
              "worktree-git-probe-failed",
              `Unable to recover unregistered worktree root ${unitRoot}.`,
              "Run 'git worktree prune', then recreate the milestone worktree before dispatching the source-writing Unit.",
              { projectRoot, unitRoot, error: errorMessage(error) },
            );
          }
        }

        if (!registered?.some((worktree) => samePath(worktree.path, unitRoot))) {
          return failure(
            "worktree-unregistered",
            `Worktree root ${unitRoot} is not registered with git worktree list.`,
            attemptedPrune || wasPreviouslyTracked
              ? "Worktree recovery was attempted but the root is still unregistered. Recreate or re-register the milestone worktree before dispatching the source-writing Unit."
              : "Run 'git worktree prune'. If still unregistered, recreate or re-register the milestone worktree before dispatching the source-writing Unit.",
            { unitRoot, attemptedPrune, trackedAsFailed: unregisteredRecoveryFailed.has(unitRoot) },
          );
        }
      }

      if (input.emptyWorktreeWithProjectContent) {
        return failure(
          "empty-worktree-with-project-content",
          `Worktree root ${unitRoot} has no project content, but the project root does.`,
          "Resolve untracked project-root content or recreate the worktree so source writes stay isolated.",
          { unitRoot, projectRoot },
        );
      }

      const expectedBranch = input.expectedBranch?.trim();
      let branch: string | undefined;
      if (expectedBranch) {
        if (!deps.getCurrentBranch) {
          return failure(
            "worktree-git-probe-failed",
            `Branch verification requested for ${unitRoot} but no getCurrentBranch dependency is configured.`,
            "Recover or recreate the milestone worktree before dispatching the source-writing Unit.",
            { unitRoot, expectedBranch, error: "getCurrentBranch dep not provided" },
          );
        }
        try {
          branch = deps.getCurrentBranch(unitRoot);
        } catch (error) {
          return failure(
            "worktree-git-probe-failed",
            `Unable to resolve current branch for worktree root ${unitRoot}.`,
            "Recover or recreate the milestone worktree before dispatching the source-writing Unit.",
            { unitRoot, expectedBranch, error: errorMessage(error) },
          );
        }
        if (branch !== expectedBranch) {
          return failure(
            "branch-mismatch",
            `Worktree root ${unitRoot} is on branch ${branch}, expected ${expectedBranch}.`,
            "Switch to the expected milestone branch or recover the worktree before dispatching the Unit.",
            { branch, expectedBranch },
          );
        }
      }

      if (input.lease?.required && !input.lease.held) {
        return failure(
          "lease-lost",
          `Milestone lease for ${milestoneId} is not held by the current worker.`,
          "Reclaim the milestone lease before dispatching the source-writing Unit.",
          { owner: input.lease.owner ?? null },
        );
      }

      return {
        ok: true,
        kind: "safe",
        projectRoot,
        unitRoot,
        milestoneId,
        branch,
      };
    },
  };
}

export function createFsOnlyWorktreeSafetyModule(): WorktreeSafetyModule {
  return createWorktreeSafetyModule(fsOnlyDeps);
}
