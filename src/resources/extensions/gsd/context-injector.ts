/**
 * context-injector.ts — Assemble context from prior step artifacts for prompt injection.
 *
 * Pure function that reads artifacts produced by prior steps (referenced via
 * `contextFrom`) and formats them into a context string. Used by the engine
 * to prepend prior-step output to the current step's dispatch prompt.
 *
 * Leaf module — depends only on definition-loader types and node:fs/node:path.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { WorkflowDefinition } from "./definition-loader.ts";

const DEFAULT_MAX_CHARS = 50_000;

/**
 * Build a formatted context string from artifacts produced by prior steps.
 *
 * For each step ID listed in the current step's `contextFrom`, reads all
 * artifact files listed in that step's `produces` from the run directory.
 * Missing files are silently skipped. Returns an empty string when no
 * context is available (no contextFrom, missing step, no readable files).
 *
 * @param stepId    — ID of the current step whose context_from to resolve
 * @param definition — the full workflow definition (needed for step lookup)
 * @param runDir    — directory where step artifacts are written at runtime
 * @param opts      — optional config: maxChars budget (default 50 000)
 * @returns Formatted context string, or "" if nothing to inject
 */
export function injectContext(
  stepId: string,
  definition: WorkflowDefinition,
  runDir: string,
  opts?: { maxChars?: number },
): string {
  const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS;

  const currentStep = definition.steps.find((s) => s.id === stepId);
  if (!currentStep || !currentStep.contextFrom || currentStep.contextFrom.length === 0) {
    return "";
  }

  const blocks: string[] = [];

  for (const sourceStepId of currentStep.contextFrom) {
    const sourceStep = definition.steps.find((s) => s.id === sourceStepId);
    if (!sourceStep) continue;

    const fileContents: string[] = [];
    for (const producesPath of sourceStep.produces) {
      const fullPath = join(runDir, producesPath);
      if (!existsSync(fullPath)) continue;
      try {
        fileContents.push(readFileSync(fullPath, "utf-8"));
      } catch {
        // Skip unreadable files silently
      }
    }

    if (fileContents.length === 0) continue;

    blocks.push(
      `### Step: ${sourceStep.name} (${sourceStep.id})\n${fileContents.join("\n")}`,
    );
  }

  if (blocks.length === 0) return "";

  let result = `## Context from prior steps\n\n${blocks.join("\n\n---\n\n")}\n\n---\n\n`;

  if (result.length > maxChars) {
    result = result.slice(0, maxChars) + "\n\n[Context truncated — exceeded budget]";
  }

  return result;
}
