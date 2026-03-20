/**
 * custom-verification.ts — Verification policy handlers for custom workflow steps.
 *
 * Dispatches to one of four policy handlers based on the VerifyPolicy discriminated
 * union. Each handler is a pure function that receives the policy config, the run
 * directory, and the step's produces paths, and returns a structured result.
 *
 * No engine dependencies — consumed by `CustomExecutionPolicy.verify()` in T03.
 *
 * Results are one of:
 *   - "continue" — verification passed, proceed to next step
 *   - "retry"    — verification failed, step should be retried
 *   - "pause"    — verification requires external input (human or LLM)
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { VerifyPolicy } from "./definition-loader.ts";

// ─── Types ───────────────────────────────────────────────────────────────

export interface VerificationResult {
  result: "continue" | "retry" | "pause";
  reason?: string;
}

// ─── Main Dispatcher ─────────────────────────────────────────────────────

/**
 * Run the verification policy for a step.
 *
 * @param policy — The VerifyPolicy from the step definition, or undefined if none.
 * @param runDir — The run directory for artifact resolution.
 * @param produces — Artifact paths (relative to runDir) produced by this step.
 * @returns VerificationResult indicating whether to continue, retry, or pause.
 */
export function runVerification(
  policy: VerifyPolicy | undefined,
  runDir: string,
  produces: string[],
): VerificationResult {
  if (policy === undefined) {
    return { result: "continue" };
  }

  switch (policy.policy) {
    case "content-heuristic":
      return verifyContentHeuristic(policy, runDir, produces);
    case "shell-command":
      return verifyShellCommand(policy, runDir);
    case "prompt-verify":
      return verifyPrompt(policy);
    case "human-review":
      return verifyHumanReview();
  }
}

// ─── Policy Handlers ─────────────────────────────────────────────────────

function verifyContentHeuristic(
  policy: { policy: "content-heuristic"; minSize?: number; pattern?: string },
  runDir: string,
  produces: string[],
): VerificationResult {
  for (const path of produces) {
    const fullPath = join(runDir, path);

    // Check existence
    if (!existsSync(fullPath)) {
      return { result: "retry", reason: `Artifact missing: ${path}` };
    }

    // Check minimum size
    if (policy.minSize !== undefined) {
      const actual = statSync(fullPath).size;
      if (actual < policy.minSize) {
        return {
          result: "retry",
          reason: `Artifact too small: ${path} (${actual} < ${policy.minSize} bytes)`,
        };
      }
    }

    // Check pattern
    if (policy.pattern !== undefined) {
      const content = readFileSync(fullPath, "utf-8");
      if (!content.includes(policy.pattern)) {
        return {
          result: "retry",
          reason: `Pattern not found in ${path}: ${policy.pattern}`,
        };
      }
    }
  }

  return { result: "continue" };
}

function verifyShellCommand(
  policy: { policy: "shell-command"; command: string },
  runDir: string,
): VerificationResult {
  // Security guard: reject commands containing path traversal
  if (policy.command.includes("..")) {
    return { result: "retry", reason: "Command rejected: contains '..'" };
  }

  try {
    const result = spawnSync(policy.command, {
      cwd: runDir,
      shell: true,
      timeout: 30_000,
      stdio: "pipe",
    });

    if (result.error) {
      return { result: "retry", reason: `Command failed: ${result.error.message}` };
    }

    if (result.status === 0) {
      return { result: "continue" };
    }

    return { result: "retry", reason: `Command exited with code ${result.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { result: "retry", reason: `Command failed: ${msg}` };
  }
}

function verifyPrompt(
  policy: { policy: "prompt-verify"; prompt: string },
): VerificationResult {
  return { result: "pause", reason: `Verification prompt: ${policy.prompt}` };
}

function verifyHumanReview(): VerificationResult {
  return { result: "pause", reason: "Human review required for this step" };
}
