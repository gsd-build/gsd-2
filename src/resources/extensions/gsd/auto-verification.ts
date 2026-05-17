// Project/App: GSD-2
// File Purpose: Post-unit verification gate for GSD auto-mode units.

/**
 * Post-unit verification gate for auto-mode.
 *
 * Runs typecheck/lint/test checks, captures runtime errors, performs
 * dependency audits, handles auto-fix retry logic, and writes
 * verification evidence JSON.
 *
 * Extracted from the pre-loop agent_end handler in auto.ts. Returns a
 * sentinel value instead of calling return/pauseAuto directly — the
 * caller checks the result and handles control flow.
 */

import type { ExtensionContext, ExtensionAPI } from "@gsd/pi-coding-agent";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolveSliceFile, resolveSlicePath, resolveMilestoneFile } from "./paths.js";
import { parseUnitId } from "./unit-id.js";
import { isDbAvailable, getTask, getSliceTasks, getMilestoneSlices } from "./gsd-db.js";
import type { TaskRow } from "./db-task-slice-rows.js";
import { loadEffectiveGSDPreferences } from "./preferences.js";
import type { GSDPreferences } from "./preferences-types.js";
import { extractVerdict } from "./verdict-parser.js";
import { isClosedStatus } from "./status-guards.js";
import { loadFile } from "./files.js";
import { parseRoadmap } from "./parsers-legacy.js";
import { isMilestoneComplete } from "./state.js";
import {
  runVerificationGate,
  runVerificationGateForTargets,
  formatFailureContext,
  captureRuntimeErrors,
  runDependencyAudit,
} from "./verification-gate.js";
import type { VerificationTarget } from "./verification-gate.js";
import { writeVerificationJSON, type PostExecutionCheckJSON, type EvidenceJSON } from "./verification-evidence.js";
import { logWarning } from "./workflow-logger.js";
import { runPostExecutionChecks, type PostExecutionResult } from "./post-execution-checks.js";
import type { AutoSession } from "./auto/session.js";
import type { VerificationResult as VerificationGateResult } from "./types.js";
import { join } from "node:path";
import { resolveUokFlags } from "./uok/flags.js";
import { UokGateRunner } from "./uok/gate-runner.js";
import { verificationRetryKey } from "./auto/verification-retry-policy.js";
import { decideVerificationVerdict } from "./verification-verdict.js";
import { createRepositoryRegistryFromPreferences } from "./repository-registry.js";
import type { SliceRow } from "./db-task-slice-rows.js";
import { getSlice } from "./gsd-db.js";
import { getLedger } from "./metrics.js";
import { getUnitCostSpikeAction } from "./auto-budget.js";

export interface VerificationContext {
  s: AutoSession;
  ctx: ExtensionContext;
  pi: ExtensionAPI;
}

export type VerificationResult = "continue" | "retry" | "pause";

function getCurrentUnitCostStats(unitId: string): { unitCostUsd: number; rollingAvgUsd: number } {
  const ledger = getLedger();
  if (!ledger || !Array.isArray(ledger.units) || ledger.units.length === 0) {
    return { unitCostUsd: 0, rollingAvgUsd: 0 };
  }
  let unitCostUsd = 0;
  let totalCost = 0;
  let totalUnits = 0;
  for (const unit of ledger.units) {
    const cost = typeof unit?.cost === "number" ? unit.cost : 0;
    if (!Number.isFinite(cost) || cost < 0) continue;
    totalCost += cost;
    totalUnits++;
    if (unit?.id === unitId) unitCostUsd += cost;
  }
  return {
    unitCostUsd,
    rollingAvgUsd: totalUnits > 0 ? totalCost / totalUnits : 0,
  };
}

function resolveVerificationTargets(
  basePath: string,
  prefs: GSDPreferences | undefined,
  task: TaskRow | null,
  slice: SliceRow | null,
): VerificationTarget[] {
  const registry = createRepositoryRegistryFromPreferences(basePath, prefs);
  const explicitIds =
    task?.target_repositories?.length
      ? task.target_repositories
      : slice?.target_repositories?.length
        ? slice.target_repositories
        : null;
  const requestedIds = explicitIds ?? ["project"];

  const targets: VerificationTarget[] = [];
  const seen = new Set<string>();
  for (const id of requestedIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const repo = registry.byId.get(id);
    if (!repo) {
      if (explicitIds) {
        throw new Error(`unknown verification target repository: ${id}`);
      }
      continue;
    }
    targets.push({
      id: repo.id,
      cwd: repo.root,
      // Top-level verification commands override per-repo defaults.
      preferenceCommands: prefs?.verification_commands?.length
        ? undefined
        : repo.verification,
    });
  }

  if (!explicitIds && targets.length === 0) {
    const project = registry.byId.get("project");
    if (project) targets.push({ id: "project", cwd: project.root });
  }
  return targets;
}

/**
 * Post-unit guard for `validate-milestone` units (#4094).
 *
 * When validate-milestone writes verdict=needs-remediation, the agent is
 * expected to also call gsd_reassess_roadmap in the same turn to add
 * remediation slices. If they don't, the state machine re-derives
 * `phase: validating-milestone` indefinitely (all slices still complete +
 * verdict still needs-remediation), wasting ~3 dispatches before the stuck
 * detector fires.
 *
 * This guard fires immediately on the first occurrence: if VALIDATION.md
 * verdict is needs-remediation and no incomplete slices exist for the
 * milestone, pause the auto-loop with a clear blocker.
 */
async function runValidateMilestonePostCheck(
  vctx: VerificationContext,
  pauseAuto: (ctx?: ExtensionContext, pi?: ExtensionAPI) => Promise<void>,
): Promise<VerificationResult> {
  const { s, ctx, pi } = vctx;
  const prefs = loadEffectiveGSDPreferences()?.preferences;
  const uokFlags = resolveUokFlags(prefs);
  const persistMilestoneValidationGate = async (
    outcome: "pass" | "fail" | "retry" | "manual-attention",
    failureClass: "none" | "verification" | "manual-attention",
    rationale: string,
    findings = "",
    milestoneId?: string,
  ): Promise<void> => {
    if (!uokFlags.gates || !s.currentUnit) return;
    const gateRunner = new UokGateRunner();
    gateRunner.register({
      id: "milestone-validation-post-check",
      type: "verification",
      execute: async () => ({
        outcome,
        failureClass,
        rationale,
        findings,
      }),
    });
    await gateRunner.run("milestone-validation-post-check", {
      basePath: s.basePath,
      traceId: `validation-post-check:${s.currentUnit.id}`,
      turnId: s.currentUnit.id,
      milestoneId,
      unitType: s.currentUnit.type,
      unitId: s.currentUnit.id,
    });
  };

  if (!s.currentUnit) return "continue";

  const { milestone: mid } = parseUnitId(s.currentUnit.id);
  if (!mid) return "continue";

  const setToolFailureRetry = (message: string): VerificationResult => {
    const retryKey = verificationRetryKey(s.currentUnit!.type, s.currentUnit!.id);
    const attempt = (s.verificationRetryCount.get(retryKey) ?? 0) + 1;
    s.verificationRetryCount.set(retryKey, attempt);
    s.pendingVerificationRetry = {
      unitId: s.currentUnit!.id,
      failureContext: message,
      attempt,
    };
    return "retry";
  };

  const validationFile = resolveMilestoneFile(s.basePath, mid, "VALIDATION");
  if (!validationFile) {
    return setToolFailureRetry(
      "You must call gsd_validate_milestone to persist the validation results. No VALIDATION.md was created.",
    );
  }

  const validationContent = await loadFile(validationFile);
  if (!validationContent) {
    return setToolFailureRetry(
      "You must call gsd_validate_milestone to persist the validation results. VALIDATION.md exists but is empty.",
    );
  }

  const verdict = extractVerdict(validationContent);
  if (verdict !== "needs-remediation") {
    await persistMilestoneValidationGate(
      "pass",
      "none",
      `milestone validation verdict is ${verdict}; no remediation loop risk`,
      "",
      mid,
    );
    return "continue";
  }

  const incompleteSliceCount = await countIncompleteSlices(s.basePath, mid);

  // If any non-closed slices exist, the agent successfully queued remediation
  // work — proceed normally. The state machine will execute those slices and
  // re-validate per the #3596/#3670 fix.
  if (incompleteSliceCount > 0) {
    await persistMilestoneValidationGate(
      "pass",
      "none",
      `remediation slices present (${incompleteSliceCount}); validation can continue`,
      "",
      mid,
    );
    return "continue";
  }

  ctx.ui.notify(
    `Milestone ${mid} validation returned verdict=needs-remediation but no remediation slices were added. Pausing for human review.`,
    "error",
  );
  process.stderr.write(
    `validate-milestone: pausing — verdict=needs-remediation with no incomplete slices for ${mid}. ` +
      `The agent must call gsd_reassess_roadmap to add remediation slices before re-validation.\n`,
  );
  await persistMilestoneValidationGate(
    "manual-attention",
    "manual-attention",
    "needs-remediation verdict without queued remediation slices",
    `No incomplete slices found for ${mid} while verdict=needs-remediation`,
    mid,
  );
  await pauseAuto(ctx, pi);
  return "pause";
}

/**
 * Count slices for a milestone that are not in a closed status.
 * DB-backed projects are authoritative (#4094 peer review); falls back to
 * roadmap parsing only when the DB is unavailable.
 */
async function countIncompleteSlices(basePath: string, milestoneId: string): Promise<number> {
  if (isDbAvailable()) {
    const slices = getMilestoneSlices(milestoneId);
    if (slices.length === 0) {
      // No DB rows — treat as "unknown", do not pause.
      return 1;
    }
    return slices.filter((slice) => !isClosedStatus(slice.status)).length;
  }

  // Filesystem fallback: parse the roadmap markdown.
  try {
    const roadmapFile = resolveMilestoneFile(basePath, milestoneId, "ROADMAP");
    if (!roadmapFile) return 1;
    const roadmapContent = await loadFile(roadmapFile);
    if (!roadmapContent) return 1;
    const roadmap = parseRoadmap(roadmapContent);
    if (roadmap.slices.length === 0) return 1;
    return isMilestoneComplete(roadmap) ? 0 : 1;
  } catch {
    // Parsing failures should not cause false-positive pauses.
    return 1;
  }
}

/**
 * Run the verification gate for the current execute-task unit.
 * Returns:
 * - "continue" — host-owned verification passed, proceed normally
 * - "retry" — gate failed with retries remaining, s.pendingVerificationRetry set for loop re-iteration
 * - "pause" — gate failed with retries exhausted, pauseAuto already called
 */
export async function runPostUnitVerification(
  vctx: VerificationContext,
  pauseAuto: (ctx?: ExtensionContext, pi?: ExtensionAPI) => Promise<void>,
): Promise<VerificationResult> {
  const { s, ctx, pi } = vctx;

  if (!s.currentUnit) {
    return "continue";
  }

  if (s.currentUnit.type === "validate-milestone") {
    return await runValidateMilestonePostCheck(vctx, pauseAuto);
  }

  if (s.currentUnit.type !== "execute-task") {
    return "continue";
  }

  try {
    const effectivePrefs = loadEffectiveGSDPreferences();
    const prefs = effectivePrefs?.preferences;
    const uokFlags = resolveUokFlags(prefs);

    // Read task plan verify field
    const { milestone: mid, slice: sid, task: tid } = parseUnitId(s.currentUnit.id);
    let taskPlanVerify: string | undefined;
    let taskRow: TaskRow | null = null;
    let sliceRow: SliceRow | null = null;
    if (mid && sid && tid) {
      if (isDbAvailable()) {
        taskRow = getTask(mid, sid, tid);
        sliceRow = getSlice(mid, sid);
        taskPlanVerify = taskRow?.verify;
      }
      // When DB unavailable, taskPlanVerify stays undefined — gate runs without task-specific checks
    }

    const verificationTargets = resolveVerificationTargets(s.basePath, prefs, taskRow, sliceRow);
    const result = verificationTargets.length <= 1
      ? runVerificationGate({
        cwd: verificationTargets[0]?.cwd ?? s.basePath,
        preferenceCommands: prefs?.verification_commands ?? verificationTargets[0]?.preferenceCommands,
        taskPlanVerify,
      })
      : runVerificationGateForTargets({
        targets: verificationTargets,
        preferenceCommands: prefs?.verification_commands,
        taskPlanVerify,
      });

    // Capture runtime errors
    const runtimeErrors = await captureRuntimeErrors();
    if (runtimeErrors.length > 0) {
      result.runtimeErrors = runtimeErrors;
      if (runtimeErrors.some((e) => e.blocking)) {
        result.passed = false;
      }
    }

    // Dependency audit
    const auditWarnings = runDependencyAudit(s.basePath);
    if (auditWarnings.length > 0) {
      result.auditWarnings = auditWarnings;
      process.stderr.write(
        `verification-gate: ${auditWarnings.length} audit warning(s)\n`,
      );
      for (const w of auditWarnings) {
        process.stderr.write(`  [${w.severity}] ${w.name}: ${w.title}\n`);
      }
    }

    const verdict = decideVerificationVerdict(s.currentUnit.type, result);
    if (!verdict.passed) {
      result.passed = false;
    }

    if (uokFlags.gates) {
      const gateRunner = new UokGateRunner();
      gateRunner.register({
        id: "verification-gate",
        type: "verification",
        execute: async () => ({
          outcome: result.passed ? "pass" : "fail",
          failureClass: result.runtimeErrors?.some((e) => e.blocking)
            ? "execution"
            : "verification",
          rationale: result.passed
            ? "verification checks passed"
            : verdict.reason === "no-host-checks"
              ? "no runnable host-owned verification checks discovered"
              : "verification checks failed",
          findings: result.passed
            ? ""
            : verdict.failureContext || formatFailureContext(result),
        }),
      });

      await gateRunner.run("verification-gate", {
        basePath: s.basePath,
        traceId: `verification:${s.currentUnit.id}`,
        turnId: s.currentUnit.id,
        milestoneId: mid ?? undefined,
        sliceId: sid ?? undefined,
        taskId: tid ?? undefined,
        unitType: s.currentUnit.type,
        unitId: s.currentUnit.id,
      });
    }

    // Auto-fix retry preferences
    const autoFixEnabled = prefs?.verification_auto_fix !== false;
    const maxRetries =
      typeof prefs?.verification_max_retries === "number"
        ? prefs.verification_max_retries
        : 2;

    if (result.checks.length > 0) {
      const passCount = result.checks.filter((c) => c.exitCode === 0).length;
      const total = result.checks.length;
      if (result.passed) {
        ctx.ui.notify(`Verification gate: ${passCount}/${total} checks passed`);
      } else {
        const failures = result.checks.filter((c) => c.exitCode !== 0);
        const failNames = failures.map((f) => f.command).join(", ");
        ctx.ui.notify(`Verification gate: FAILED — ${failNames}`);
        process.stderr.write(
          `verification-gate: ${total - passCount}/${total} checks failed\n`,
        );
        for (const f of failures) {
          process.stderr.write(`  ${f.command} exited ${f.exitCode}\n`);
          if (f.stderr)
            process.stderr.write(`  stderr: ${f.stderr.slice(0, 500)}\n`);
        }
      }
    }

    // Log blocking runtime errors
    if (result.runtimeErrors?.some((e) => e.blocking)) {
      const blockingErrors = result.runtimeErrors.filter((e) => e.blocking);
      process.stderr.write(
        `verification-gate: ${blockingErrors.length} blocking runtime error(s) detected\n`,
      );
      for (const err of blockingErrors) {
        process.stderr.write(
          `  [${err.source}] ${err.severity}: ${err.message.slice(0, 200)}\n`,
        );
      }
    }

    // Write verification evidence JSON
    const retryKey = verificationRetryKey(s.currentUnit.type, s.currentUnit.id);
    const attempt = s.verificationRetryCount.get(retryKey) ?? 0;
    if (mid && sid && tid) {
      try {
        const sDir = resolveSlicePath(s.basePath, mid, sid);
        if (sDir) {
          const tasksDir = join(sDir, "tasks");
          if (result.passed) {
            writeVerificationJSON(result, tasksDir, tid, s.currentUnit.id);
          } else {
            const nextAttempt = attempt + 1;
            const includeRetryMetadata =
              !result.passed &&
              verdict.retryable &&
              autoFixEnabled &&
              nextAttempt <= maxRetries;
            writeVerificationJSON(
              result,
              tasksDir,
              tid,
              s.currentUnit.id,
              includeRetryMetadata ? nextAttempt : undefined,
              includeRetryMetadata ? maxRetries : undefined,
            );
          }
        }
      } catch (evidenceErr) {
        logWarning("engine", `verification-evidence write error: ${(evidenceErr as Error).message}`);
      }
    }

    // ── Post-execution checks (run after main verification passes for execute-task units) ──
    let postExecChecks: PostExecutionCheckJSON[] | undefined;
    let postExecBlockingFailure = false;

    if (result.passed && mid && sid && tid) {
      // Check preferences — respect enhanced_verification and enhanced_verification_post
      const enhancedEnabled = prefs?.enhanced_verification !== false; // default true
      const postEnabled = prefs?.enhanced_verification_post !== false; // default true

      if (enhancedEnabled && postEnabled && isDbAvailable()) {
        try {
          // Reuse the already-loaded task row for post-execution checks.
          if (taskRow && taskRow.key_files && taskRow.key_files.length > 0) {
            // Get all tasks in the slice
            const allTasks = getSliceTasks(mid, sid);
            // Filter to prior completed tasks (status = 'complete' or 'done', before current task)
            const priorTasks = allTasks.filter(
              (t: TaskRow) =>
                (t.status === "complete" || t.status === "done") &&
                t.id !== tid &&
                t.sequence < taskRow.sequence
            );

            // Run post-execution checks
            const postExecResult: PostExecutionResult = runPostExecutionChecks(
              taskRow,
              priorTasks,
              s.basePath
            );

            // Store checks for evidence JSON
            postExecChecks = postExecResult.checks;

            // Log summary to stderr with gsd-post-exec: prefix
            const emoji =
              postExecResult.status === "pass"
                ? "✅"
                : postExecResult.status === "warn"
                  ? "⚠️"
                  : "❌";
            process.stderr.write(
              `gsd-post-exec: ${emoji} Post-execution checks ${postExecResult.status} for ${mid}/${sid}/${tid} (${postExecResult.durationMs}ms)\n`
            );

            // Log individual check results
            for (const check of postExecResult.checks) {
              const checkEmoji = check.passed
                ? "✓"
                : check.blocking
                  ? "✗"
                  : "⚠";
              process.stderr.write(
                `gsd-post-exec:   ${checkEmoji} [${check.category}] ${check.target}: ${check.message}\n`
              );
            }

            if (uokFlags.gates) {
              const strictMode = prefs?.enhanced_verification_strict === true;
              const warnEscalated = postExecResult.status === "warn" && strictMode;
              const blockingFailure = postExecResult.status === "fail" || warnEscalated;
              const findings = postExecResult.checks
                .filter((check) => !check.passed)
                .map((check) => `[${check.category}] ${check.target}: ${check.message}`)
                .join("\n");
              const gateRunner = new UokGateRunner();
              gateRunner.register({
                id: "post-execution-checks",
                type: "artifact",
                execute: async () => ({
                  outcome: blockingFailure ? "fail" : "pass",
                  failureClass: postExecResult.status === "fail"
                    ? "artifact"
                    : warnEscalated
                      ? "policy"
                      : "none",
                  rationale: blockingFailure
                    ? `post-execution checks ${postExecResult.status}${warnEscalated ? " (strict)" : ""}`
                    : "post-execution checks passed",
                  findings,
                }),
              });
              await gateRunner.run("post-execution-checks", {
                basePath: s.basePath,
                traceId: `verification:${s.currentUnit.id}`,
                turnId: s.currentUnit.id,
                milestoneId: mid,
                sliceId: sid,
                taskId: tid,
                unitType: s.currentUnit.type,
                unitId: s.currentUnit.id,
              });
            }

            // Check for blocking failures
            if (postExecResult.status === "fail") {
              postExecBlockingFailure = true;
              const blockingCount = postExecResult.checks.filter(
                (c) => !c.passed && c.blocking
              ).length;
              ctx.ui.notify(
                `Post-execution checks failed: ${blockingCount} blocking issue${blockingCount === 1 ? "" : "s"} found`,
                "error"
              );
            } else if (postExecResult.status === "warn") {
              ctx.ui.notify(
                `Post-execution checks passed with warnings`,
                "warning"
              );
              // Strict mode: treat warnings as blocking
              if (prefs?.enhanced_verification_strict === true) {
                postExecBlockingFailure = true;
              }
            }
          }
        } catch (postExecErr) {
          // Post-execution check errors are non-fatal — log and continue
          logWarning("engine", `gsd-post-exec: error — ${(postExecErr as Error).message}`);
        }
      }
    }

    // Re-write verification evidence JSON with post-execution checks
    if (postExecChecks && postExecChecks.length > 0 && mid && sid && tid) {
      try {
        const sDir = resolveSlicePath(s.basePath, mid, sid);
        if (sDir) {
          const tasksDir = join(sDir, "tasks");
          // Add postExecutionChecks to the result for the JSON write
          const resultWithPostExec = {
            ...result,
            // Mark as failed if there was a blocking post-exec failure
            passed: result.passed && !postExecBlockingFailure,
          };
          // Manually write with postExecutionChecks field
          writeVerificationJSONWithPostExec(
            resultWithPostExec,
            tasksDir,
            tid,
            s.currentUnit.id,
            postExecChecks,
            postExecBlockingFailure ? attempt + 1 : undefined,
            postExecBlockingFailure ? maxRetries : undefined
          );
        }
      } catch (evidenceErr) {
        logWarning("engine", `verification-evidence: post-exec write error — ${(evidenceErr as Error).message}`);
      }
    }

    // Update result.passed based on post-execution checks
    if (postExecBlockingFailure) {
      result.passed = false;
    }

    // Emit Layer 2 verify_result event with the final, post-exec verdict so hooks
    // see the authoritative pass/fail and the complete set of failures.
    try {
      const { emitVerifyResult } = await import("./hook-emitter.js");
      const checkFailures = result.checks
        .filter((c) => c.exitCode !== 0)
        .map((c) => ({
          kind: "gate" as const,
          message: `${c.command} exited ${c.exitCode}${c.stderr ? `: ${c.stderr.slice(0, 200)}` : ""}`,
        }));
      const runtimeFailures = (result.runtimeErrors ?? [])
        .filter((e) => e.blocking)
        .map((e) => ({
          kind: "other" as const,
          message: `[${e.source}] ${e.message.slice(0, 200)}`,
        }));
      const postExecFailures = (postExecChecks ?? [])
        .filter((c) => !c.passed)
        .map((c) => ({
          kind: "other" as const,
          message: `[${c.category}] ${c.target}: ${c.message}`,
        }));
      await emitVerifyResult({
        passed: result.passed,
        failures: [...checkFailures, ...runtimeFailures, ...postExecFailures],
        unitType: s.currentUnit.type,
        unitId: s.currentUnit.id,
        cwd: s.basePath,
      });
    } catch (hookErr) {
      logWarning("engine", `verify_result hook emission failed: ${(hookErr as Error).message}`);
    }

    // ── Auto-fix retry logic ──
    if (result.passed) {
      s.verificationRetryCount.delete(retryKey);
      s.verificationRetryFailureHashes.delete(retryKey);
      s.pendingVerificationRetry = null;
      return "continue";
    } else if (verdict.reason === "no-host-checks") {
      s.verificationRetryCount.delete(retryKey);
      s.verificationRetryFailureHashes.delete(retryKey);
      s.pendingVerificationRetry = null;
      ctx.ui.notify(
        "Verification gate FAILED — no runnable host-owned verification checks were discovered. Pausing for human review.",
        "error",
      );
      process.stderr.write(`verification-gate: ${verdict.failureContext}\n`);
      await pauseAuto(ctx, pi);
      return "pause";
    } else if (postExecBlockingFailure) {
      // Post-execution failures are cross-task consistency issues — retrying the same task won't fix them.
      // Skip retry and pause immediately for human review.
      s.verificationRetryCount.delete(retryKey);
      s.verificationRetryFailureHashes.delete(retryKey);
      s.pendingVerificationRetry = null;
      ctx.ui.notify(
        `Post-execution checks failed — cross-task consistency issue detected, pausing for human review`,
        "error",
      );
      await pauseAuto(ctx, pi);
      return "pause";
    } else if (autoFixEnabled && attempt + 1 <= maxRetries) {
      const { unitCostUsd, rollingAvgUsd } = getCurrentUnitCostStats(s.currentUnit.id);
      const perUnitCapUsd =
        typeof prefs?.per_unit_cost_cap_usd === "number" && Number.isFinite(prefs.per_unit_cost_cap_usd) && prefs.per_unit_cost_cap_usd > 0
          ? prefs.per_unit_cost_cap_usd
          : 5.0;
      if (unitCostUsd >= perUnitCapUsd) {
        s.verificationRetryCount.delete(retryKey);
        s.verificationRetryFailureHashes.delete(retryKey);
        s.pendingVerificationRetry = null;
        ctx.ui.notify(
          `Unit ${s.currentUnit.id} hit per-unit cap $${perUnitCapUsd.toFixed(2)} — pausing auto-mode.`,
          "error",
        );
        await pauseAuto(ctx, pi);
        return "pause";
      }
      if (getUnitCostSpikeAction(unitCostUsd, rollingAvgUsd, 3.0) === "pause") {
        s.verificationRetryCount.delete(retryKey);
        s.verificationRetryFailureHashes.delete(retryKey);
        s.pendingVerificationRetry = null;
        ctx.ui.notify(
          `Unit ${s.currentUnit.id} cost spike detected (${unitCostUsd.toFixed(2)} vs avg ${rollingAvgUsd.toFixed(2)}) — pausing auto-mode.`,
          "error",
        );
        await pauseAuto(ctx, pi);
        return "pause";
      }
      const nextAttempt = attempt + 1;
      s.verificationRetryCount.set(retryKey, nextAttempt);
      s.pendingVerificationRetry = {
        unitId: s.currentUnit.id,
        failureContext: verdict.failureContext || formatFailureContext(result),
        attempt: nextAttempt,
      };
      const failedCmds = result.checks
        .filter((c) => c.exitCode !== 0)
        .map((c) => c.command);
      const cmdSummary = failedCmds.length <= 3
        ? failedCmds.join(", ")
        : `${failedCmds.slice(0, 3).join(", ")}... and ${failedCmds.length - 3} more`;
      ctx.ui.notify(
        `Verification failed (${cmdSummary}) — auto-fix attempt ${nextAttempt}/${maxRetries}`,
        "warning",
      );
      // Return "retry" — the autoLoop while loop will re-iterate with the retry context
      return "retry";
    } else {
      // Gate failed, retries exhausted
      s.verificationRetryCount.delete(retryKey);
      s.verificationRetryFailureHashes.delete(retryKey);
      s.pendingVerificationRetry = null;
      const exhaustedFails = result.checks
        .filter((c) => c.exitCode !== 0)
        .map((c) => c.command);
      const exhaustedSummary = exhaustedFails.length <= 3
        ? exhaustedFails.join(", ")
        : `${exhaustedFails.slice(0, 3).join(", ")}... and ${exhaustedFails.length - 3} more`;
      ctx.ui.notify(
        `Verification gate FAILED after ${attempt} ${attempt === 1 ? "retry" : "retries"} (${exhaustedSummary}) — pausing for human review`,
        "error",
      );
      await pauseAuto(ctx, pi);
      return "pause";
    }
  } catch (err) {
    logWarning("engine", `verification-gate error: ${(err as Error).message}`);
    ctx.ui.notify(
      `Verification gate errored before producing an authoritative verdict: ${(err as Error).message}`,
      "error",
    );
    await pauseAuto(ctx, pi);
    return "pause";
  }
}

/**
 * Write verification evidence JSON with post-execution checks included.
 * This is a variant of writeVerificationJSON that adds the postExecutionChecks field.
 */
function writeVerificationJSONWithPostExec(
  result: VerificationGateResult,
  tasksDir: string,
  taskId: string,
  unitId: string,
  postExecutionChecks: PostExecutionCheckJSON[],
  retryAttempt?: number,
  maxRetries?: number,
): void {
  mkdirSync(tasksDir, { recursive: true });

  const evidence: EvidenceJSON = {
    schemaVersion: 1,
    taskId,
    unitId: unitId ?? taskId,
    timestamp: result.timestamp,
    passed: result.passed,
    discoverySource: result.discoverySource,
    checks: result.checks.map((check) => ({
      command: check.command,
      exitCode: check.exitCode,
      durationMs: check.durationMs,
      verdict: check.exitCode === 0 ? "pass" : "fail",
    })),
    ...(retryAttempt !== undefined ? { retryAttempt } : {}),
    ...(maxRetries !== undefined ? { maxRetries } : {}),
    postExecutionChecks,
  };

  if (result.runtimeErrors && result.runtimeErrors.length > 0) {
    evidence.runtimeErrors = result.runtimeErrors.map(e => ({
      source: e.source,
      severity: e.severity,
      message: e.message,
      blocking: e.blocking,
    }));
  }

  if (result.auditWarnings && result.auditWarnings.length > 0) {
    evidence.auditWarnings = result.auditWarnings.map(w => ({
      name: w.name,
      severity: w.severity,
      title: w.title,
      url: w.url,
      fixAvailable: w.fixAvailable,
    }));
  }

  const filePath = join(tasksDir, `${taskId}-VERIFY.json`);
  writeFileSync(filePath, JSON.stringify(evidence, null, 2) + "\n", "utf-8");
}
