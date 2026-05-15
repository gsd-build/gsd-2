import { existsSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { clearParseCache } from "../files.js";
import { isClosedStatus, isDeferredStatus } from "../status-guards.js";
import { isNonEmptyString, validateStringArray } from "../validation.js";
import {
  transaction,
  getMilestone,
  getSlice,
  getSliceTasks,
  insertTask,
  upsertSlicePlanning,
  upsertTaskPlanning,
  insertGateRow,
  updateSliceStatus,
  setSliceSketchFlag,
  deleteTask,
  deleteArtifactByPath,
} from "../gsd-db.js";
import type { GateId } from "../types.js";
import { invalidateStateCache } from "../state.js";
import { renderPlanFromDb } from "../markdown-renderer.js";
import { renderAllProjections } from "../workflow-projections.js";
import { writeManifest } from "../workflow-manifest.js";
import { appendEvent } from "../workflow-events.js";
import { logWarning } from "../workflow-logger.js";
import { validatePlanningPathScope } from "../planning-path-scope.js";
import { checkFilePathConsistency, checkTaskOrdering } from "../pre-execution-checks.js";
import type { TaskRow } from "../db-task-slice-rows.js";
import { buildTaskFileName, gsdProjectionRoot } from "../paths.js";
import { loadEffectiveGSDPreferences } from "../preferences.js";
import { createRepositoryRegistryFromPreferences, type RepositoryRegistry } from "../repository-registry.js";

export interface PlanSliceTaskInput {
  taskId: string;
  title: string;
  description: string;
  estimate: string;
  files: string[];
  verify: string;
  inputs: string[];
  expectedOutput: string[];
  observabilityImpact?: string;
  fullPlanMd?: string;
  targetRepositories?: string[];
}

export interface PlanSliceParams {
  milestoneId: string;
  sliceId: string;
  goal: string;
  tasks: PlanSliceTaskInput[];
  /** @optional — omitted fields render as conservative defaults */
  successCriteria?: string;
  /** @optional — omitted fields render as conservative defaults */
  proofLevel?: string;
  /** @optional — omitted fields render as conservative defaults */
  integrationClosure?: string;
  /** @optional — omitted fields render as conservative defaults */
  observabilityImpact?: string;
  targetRepositories?: string[];
  /** Optional caller-provided identity for audit trail */
  actorName?: string;
  /** Optional caller-provided reason this action was triggered */
  triggerReason?: string;
}

export interface PlanSliceResult {
  milestoneId: string;
  sliceId: string;
  planPath: string;
  taskPlanPaths: string[];
}

function validateRepositoryTargetIds(
  field: string,
  value: unknown,
): string[] | null {
  if (value === undefined) return null;
  const ids = validateStringArray(value, field);
  if (ids.length === 0) throw new Error(`${field} must include at least one repository id when provided`);
  const deduped = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (deduped.length === 0) throw new Error(`${field} must include at least one repository id when provided`);
  return deduped;
}

function validateTasks(value: unknown): PlanSliceTaskInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("tasks must be a non-empty array");
  }

  const seen = new Set<string>();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`tasks[${index}] must be an object`);
    }
    const obj = entry as Record<string, unknown>;
    const taskId = obj.taskId;
    const title = obj.title;
    const description = obj.description;
    const estimate = obj.estimate;
    const files = obj.files;
    const verify = obj.verify;
    const inputs = obj.inputs;
    const expectedOutput = obj.expectedOutput;
    const observabilityImpact = obj.observabilityImpact;
    const targetRepositories = obj.targetRepositories;

    if (!isNonEmptyString(taskId)) throw new Error(`tasks[${index}].taskId must be a non-empty string`);
    if (seen.has(taskId)) throw new Error(`tasks[${index}].taskId must be unique`);
    seen.add(taskId);
    if (!isNonEmptyString(title)) throw new Error(`tasks[${index}].title must be a non-empty string`);
    if (!isNonEmptyString(description)) throw new Error(`tasks[${index}].description must be a non-empty string`);
    if (!isNonEmptyString(estimate)) throw new Error(`tasks[${index}].estimate must be a non-empty string`);
    const validatedFiles = validateStringArray(files, `tasks[${index}].files`);
    if (!isNonEmptyString(verify)) throw new Error(`tasks[${index}].verify must be a non-empty string`);
    const validatedInputs = validateStringArray(inputs, `tasks[${index}].inputs`);
    const validatedExpectedOutput = validateStringArray(expectedOutput, `tasks[${index}].expectedOutput`);
    if (observabilityImpact !== undefined && !isNonEmptyString(observabilityImpact)) {
      throw new Error(`tasks[${index}].observabilityImpact must be a non-empty string when provided`);
    }
    const validatedTargetRepositories = validateRepositoryTargetIds(
      `tasks[${index}].targetRepositories`,
      targetRepositories,
    );

    return {
      taskId,
      title,
      description,
      estimate,
      files: validatedFiles,
      verify,
      inputs: validatedInputs,
      expectedOutput: validatedExpectedOutput,
      observabilityImpact: typeof observabilityImpact === "string" ? observabilityImpact : "",
      targetRepositories: validatedTargetRepositories ?? undefined,
    };
  });
}

function validateParams(params: PlanSliceParams): PlanSliceParams {
  if (!isNonEmptyString(params?.milestoneId)) throw new Error("milestoneId is required");
  if (!isNonEmptyString(params?.sliceId)) throw new Error("sliceId is required");
  if (!isNonEmptyString(params?.goal)) throw new Error("goal is required");

  const validatedTargetRepositories = validateRepositoryTargetIds(
    "targetRepositories",
    params.targetRepositories,
  );

  return {
    ...params,
    // Keep optional enrichment fields empty when omitted. The renderer supplies
    // conservative defaults where needed, without surfacing placeholder prose.
    successCriteria: params.successCriteria ?? "",
    proofLevel: params.proofLevel ?? "",
    integrationClosure: params.integrationClosure ?? "",
    observabilityImpact: params.observabilityImpact ?? "",
    targetRepositories: validatedTargetRepositories ?? undefined,
    tasks: validateTasks(params.tasks),
  };
}

function loadRepositoryRegistry(basePath: string): RepositoryRegistry {
  const loaded = loadEffectiveGSDPreferences(basePath);
  return createRepositoryRegistryFromPreferences(basePath, loaded?.preferences);
}

function validateReferencedRepositories(params: PlanSliceParams, registry: RepositoryRegistry): string | null {
  const known = new Set(registry.repositories.map((repo) => repo.id));

  const missing: string[] = [];
  const noteMissing = (id: string) => {
    if (!known.has(id) && !missing.includes(id)) missing.push(id);
  };

  for (const id of params.targetRepositories ?? []) noteMissing(id);
  for (const task of params.tasks) {
    for (const id of task.targetRepositories ?? []) noteMissing(id);
  }

  if (missing.length === 0) return null;
  return `unknown targetRepositories: ${missing.join(", ")}. Declared repositories: ${Array.from(known).join(", ")}`;
}

function resolveAllowedRootsForPathScope(params: PlanSliceParams, registry: RepositoryRegistry): string[] {
  const requested = new Set<string>();
  for (const id of params.targetRepositories ?? []) requested.add(id);
  for (const task of params.tasks) {
    for (const id of task.targetRepositories ?? []) requested.add(id);
  }
  if (requested.size === 0) return [registry.projectRoot];
  const roots = Array.from(requested)
    .map((id) => registry.byId.get(id)?.root)
    .filter((root): root is string => typeof root === "string");
  return roots.length > 0 ? roots : [registry.projectRoot];
}

function toTaskRows(params: PlanSliceParams): TaskRow[] {
  return params.tasks.map((task, index) => ({
    milestone_id: params.milestoneId,
    slice_id: params.sliceId,
    id: task.taskId,
    title: task.title,
    status: "pending",
    one_liner: "",
    narrative: "",
    verification_result: "",
    duration: "",
    completed_at: null,
    blocker_discovered: false,
    deviations: "",
    known_issues: "",
    key_files: [],
    key_decisions: [],
    full_summary_md: "",
    description: task.description,
    estimate: task.estimate,
    files: task.files,
    verify: task.verify,
    inputs: task.inputs,
    expected_output: task.expectedOutput,
    observability_impact: task.observabilityImpact ?? "",
    full_plan_md: task.fullPlanMd ?? "",
    target_repositories: task.targetRepositories ?? params.targetRepositories ?? ["project"],
    sequence: index + 1,
    blocker_source: "",
    escalation_pending: 0,
    escalation_awaiting_review: 0,
    escalation_artifact_path: null,
    escalation_override_applied_at: null,
  }));
}

function validateTaskPathsBeforePersist(params: PlanSliceParams, basePath: string): string | null {
  const taskRows = toTaskRows(params);
  const checks = [
    ...checkFilePathConsistency(taskRows, basePath),
    ...checkTaskOrdering(taskRows, basePath),
  ];
  const blocking = checks.filter((check) => !check.passed && check.blocking);

  if (blocking.length === 0) return null;

  return blocking
    .map((check) => `[${check.category}] ${check.target}: ${check.message}`)
    .join("\n");
}

export async function handlePlanSlice(
  rawParams: PlanSliceParams,
  basePath: string,
): Promise<PlanSliceResult | { error: string }> {
  let params: PlanSliceParams;
  try {
    params = validateParams(rawParams);
  } catch (err) {
    return { error: `validation failed: ${(err as Error).message}` };
  }

  const repositoryRegistry = loadRepositoryRegistry(basePath);
  const repoValidationError = validateReferencedRepositories(params, repositoryRegistry);
  if (repoValidationError) {
    return { error: `validation failed: ${repoValidationError}` };
  }

  const allowedAbsoluteRoots = resolveAllowedRootsForPathScope(params, repositoryRegistry);

  const pathScopeError = validatePlanningPathScope(
    basePath,
    params.tasks.flatMap((task, index) => [
      { field: `tasks[${index}].files`, values: task.files },
      { field: `tasks[${index}].inputs`, values: task.inputs },
      { field: `tasks[${index}].expectedOutput`, values: task.expectedOutput },
    ]),
    allowedAbsoluteRoots,
  );
  if (pathScopeError) {
    return { error: `validation failed: ${pathScopeError}` };
  }

  const pathError = validateTaskPathsBeforePersist(params, basePath);
  if (pathError) {
    return { error: `pre-execution validation failed:\n${pathError}` };
  }

  // ── Guards + DB writes inside a single transaction (prevents TOCTOU) ───
  // Guards must be inside the transaction so the state they check cannot
  // change between the read and the write (#2723).
  let guardError: string | null = null;
  let omittedTaskIds: string[] = [];

  try {
    transaction(() => {
      const parentMilestone = getMilestone(params.milestoneId);
      if (!parentMilestone) {
        guardError = `milestone not found: ${params.milestoneId}`;
        return;
      }
      if (isClosedStatus(parentMilestone.status)) {
        guardError = `cannot plan slice in a closed milestone: ${params.milestoneId} (status: ${parentMilestone.status})`;
        return;
      }

      const parentSlice = getSlice(params.milestoneId, params.sliceId);
      if (!parentSlice) {
        guardError = `missing parent slice: ${params.milestoneId}/${params.sliceId}`;
        return;
      }
      if (isClosedStatus(parentSlice.status)) {
        guardError = `cannot re-plan slice ${params.sliceId}: it is already complete — use gsd_slice_reopen first`;
        return;
      }

      const newTaskIds = new Set(params.tasks.map((task) => task.taskId));
      const existingTasks = getSliceTasks(params.milestoneId, params.sliceId);
      omittedTaskIds = existingTasks
        .filter((task) => !newTaskIds.has(task.id))
        .map((task) => task.id);

      for (const task of existingTasks) {
        if (!newTaskIds.has(task.id) && isClosedStatus(task.status)) {
          guardError = `cannot remove completed task ${task.id}`;
          return;
        }
      }

      if (isDeferredStatus(parentSlice.status)) {
        updateSliceStatus(params.milestoneId, params.sliceId, "pending");
      }
      setSliceSketchFlag(params.milestoneId, params.sliceId, false);

      upsertSlicePlanning(params.milestoneId, params.sliceId, {
        goal: params.goal,
        successCriteria: params.successCriteria,
        proofLevel: params.proofLevel,
        integrationClosure: params.integrationClosure,
        observabilityImpact: params.observabilityImpact,
        targetRepositories: params.targetRepositories ?? ["project"],
      });

      for (const taskId of omittedTaskIds) {
        deleteTask(params.milestoneId, params.sliceId, taskId);
      }

      for (const task of params.tasks) {
        insertTask({
          id: task.taskId,
          sliceId: params.sliceId,
          milestoneId: params.milestoneId,
          title: task.title,
          status: "pending",
        });
        upsertTaskPlanning(params.milestoneId, params.sliceId, task.taskId, {
          title: task.title,
          description: task.description,
          estimate: task.estimate,
          files: task.files,
          verify: task.verify,
          inputs: task.inputs,
          expectedOutput: task.expectedOutput,
          observabilityImpact: task.observabilityImpact ?? "",
          fullPlanMd: task.fullPlanMd,
          targetRepositories: task.targetRepositories ?? params.targetRepositories ?? ["project"],
        });
      }

      // Seed quality gate rows inside the transaction — all-or-nothing with
      // the plan data so a crash can't leave orphaned gates without tasks.
      const sliceGates: GateId[] = ["Q3", "Q4"];
      for (const gid of sliceGates) {
        insertGateRow({ milestoneId: params.milestoneId, sliceId: params.sliceId, gateId: gid, scope: "slice" });
      }
      const taskGates: GateId[] = ["Q5", "Q6", "Q7"];
      for (const task of params.tasks) {
        for (const gid of taskGates) {
          insertGateRow({ milestoneId: params.milestoneId, sliceId: params.sliceId, gateId: gid, scope: "task", taskId: task.taskId });
        }
      }
      insertGateRow({ milestoneId: params.milestoneId, sliceId: params.sliceId, gateId: "Q8", scope: "slice" });
    });
  } catch (err) {
    return { error: `db write failed: ${(err as Error).message}` };
  }

  if (guardError) {
    return { error: guardError };
  }

  try {
    const tasksDir = join(gsdProjectionRoot(basePath), "milestones", params.milestoneId, "slices", params.sliceId, "tasks");
    for (const taskId of omittedTaskIds) {
      const taskPlanPath = join(tasksDir, buildTaskFileName(taskId, "PLAN"));
      if (existsSync(taskPlanPath)) rmSync(taskPlanPath, { force: true });
      const artifactPath = relative(gsdProjectionRoot(basePath), taskPlanPath).replace(/\\/g, "/");
      deleteArtifactByPath(artifactPath);
    }

    const renderResult = await renderPlanFromDb(basePath, params.milestoneId, params.sliceId);
    invalidateStateCache();
    clearParseCache();

    // ── Post-mutation hook: projections, manifest, event log ─────────────
    try {
      await renderAllProjections(basePath, params.milestoneId);
      writeManifest(basePath);
      appendEvent(basePath, {
        cmd: "plan-slice",
        params: { milestoneId: params.milestoneId, sliceId: params.sliceId },
        ts: new Date().toISOString(),
        actor: "agent",
        actor_name: params.actorName,
        trigger_reason: params.triggerReason,
      });
    } catch (hookErr) {
      logWarning("tool", `plan-slice post-mutation hook warning: ${(hookErr as Error).message}`);
    }

    return {
      milestoneId: params.milestoneId,
      sliceId: params.sliceId,
      planPath: renderResult.planPath,
      taskPlanPaths: renderResult.taskPlanPaths,
    };
  } catch (renderErr) {
    logWarning("tool", `plan_slice — render failed (DB rows preserved for debugging): ${(renderErr as Error).message}`);
    invalidateStateCache();
    return { error: `render failed: ${(renderErr as Error).message}` };
  }
}
