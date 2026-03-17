/**
 * Phase Command Driver — CLI-invocable phase runner for GSD.
 *
 * Composes RpcClient (D011), answer injector (S03), and event tracking (S02)
 * into a standalone phase runner. Supports discuss and plan phases with
 * structured JSON output.
 *
 * The discuss command:
 *   1. Accepts a JSON input file with project description and pre-supplied answers
 *   2. Creates a temp project directory with minimal .gsd/ skeleton
 *   3. Spawns GSD via RPC
 *   4. Sends the discuss prompt directly (GSD-WORKFLOW.md + discuss.md + description)
 *      — bypasses TUI wizard (showSmartEntry) which uses ctx.ui.custom() widgets
 *      that don't work in RPC mode
 *   5. Wires answer injector for ask_user_questions during discuss
 *   6. Detects completion when CONTEXT.md is produced
 *   7. Emits structured PhaseResult JSON to stdout
 *
 * The plan command:
 *   1. Accepts --project-dir pointing to a directory with CONTEXT.md (from discuss)
 *   2. Validates CONTEXT.md exists, ROADMAP.md does not
 *   3. Spawns GSD via RPC with cwd set to the project directory
 *   4. Dispatches `/gsd auto` — auto-mode detects pre-planning state and routes
 *      to research-milestone → plan-milestone
 *   5. Watches for ROADMAP.md on each agent_end event
 *   6. TERMINATION GUARD: kills the RPC session immediately when ROADMAP.md
 *      is detected, preventing auto-mode from continuing to execution
 *   7. Emits structured PhaseResult JSON to stdout
 *
 * Usage:
 *   npx tsx phase-command.ts --phase discuss --input fixtures/discuss-input.json
 *   npx tsx phase-command.ts --phase discuss --input fixtures/discuss-input.json --dry-run
 *   npx tsx phase-command.ts --phase plan --project-dir /path/to/project
 *   npx tsx phase-command.ts --phase plan --project-dir /path/to/project --dry-run
 *
 * Chaining discuss→plan:
 *   result=$(npx tsx phase-command.ts --phase discuss --input fixtures/discuss-input.json)
 *   dir=$(echo "$result" | jq -r '.projectDir')
 *   npx tsx phase-command.ts --phase plan --project-dir "$dir"
 *
 * All diagnostic output goes to stderr. Only the final JSON result goes to stdout.
 */

import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { execSync } from "node:child_process";

// ── RpcClient import (per D011) ─────────────────────────────────────────────
import { RpcClient } from "../../../../../../packages/pi-coding-agent/dist/modes/rpc/rpc-client.js";

// ── Answer injection modules from S03 ───────────────────────────────────────
import { parseAnswerFile } from "./answer-schema.js";
import { createAnswerInjector } from "./answer-injector.js";
import type { AnswerFile } from "./answer-schema.js";

// ── Phase output (T01) ──────────────────────────────────────────────────────
import { printPhaseResult } from "./phase-output.js";
import type { PhaseResult, PhaseArtifact } from "./phase-output.js";

// ── JSONL helper ────────────────────────────────────────────────────────────
function serializeJsonLine(obj: Record<string, unknown>): string {
  return JSON.stringify(obj) + "\n";
}

// ── Logging to stderr (keep stdout clean for JSON result) ───────────────────
function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

// ── Configuration ───────────────────────────────────────────────────────────

const TIMEOUT_MS = parseInt(process.env.PHASE_TIMEOUT_MS ?? "600000", 10); // 10 min default
const EXECUTE_TIMEOUT_MS = parseInt(process.env.EXECUTE_TIMEOUT_MS ?? "3600000", 10); // 60 min default

// ── NDJSON Stderr Streaming ─────────────────────────────────────────────────
// Writes each RPC event as a typed JSON line to stderr during execute/verify/advance.
// Provides real-time progress visibility to the COO orchestrator without
// polluting stdout (reserved for the final PhaseResult JSON).

function streamEventToStderr(event: Record<string, unknown>): void {
  process.stderr.write(JSON.stringify(event) + "\n");
}

// ── Discuss Prompt Builder ──────────────────────────────────────────────────
// Replicates the dispatchWorkflow + buildDiscussPrompt pattern from guided-flow.ts.
// We build the prompt ourselves because showSmartEntry() uses TUI widgets
// (ctx.ui.custom) that block on keyboard input in RPC mode.

function buildDiscussMessage(
  repoRoot: string,
  milestoneId: string,
  description: string,
): string {
  // Load GSD-WORKFLOW.md — same resolution as guided-flow.ts:dispatchWorkflow
  const workflowPath =
    process.env.GSD_WORKFLOW_PATH ??
    join(process.env.HOME ?? "~", ".pi", "GSD-WORKFLOW.md");
  // Fallback: check the repo's own copy
  const repoWorkflowPath = join(repoRoot, "src", "resources", "GSD-WORKFLOW.md");

  let workflow: string;
  if (existsSync(workflowPath)) {
    workflow = readFileSync(workflowPath, "utf-8");
  } else if (existsSync(repoWorkflowPath)) {
    workflow = readFileSync(repoWorkflowPath, "utf-8");
  } else {
    throw new Error(
      `GSD-WORKFLOW.md not found. Checked:\n  ${workflowPath}\n  ${repoWorkflowPath}\nSet GSD_WORKFLOW_PATH env var.`,
    );
  }

  // Load discuss.md prompt template — same as prompt-loader.ts
  const promptsDir = join(
    repoRoot,
    "src",
    "resources",
    "extensions",
    "gsd",
    "prompts",
  );
  const discussTemplatePath = join(promptsDir, "discuss.md");
  if (!existsSync(discussTemplatePath)) {
    throw new Error(`Discuss prompt template not found at ${discussTemplatePath}`);
  }

  let discussPrompt = readFileSync(discussTemplatePath, "utf-8");

  // Substitute template variables (same as prompt-loader.ts)
  const milestoneRel = `.gsd/milestones/${milestoneId}`;
  const vars: Record<string, string> = {
    milestoneId,
    preamble: `New project, milestone ${milestoneId}. Do NOT read or explore .gsd/ — it's empty scaffolding.`,
    contextPath: `${milestoneRel}/${milestoneId}-CONTEXT.md`,
    roadmapPath: `${milestoneRel}/${milestoneId}-ROADMAP.md`,
  };

  for (const [key, value] of Object.entries(vars)) {
    discussPrompt = discussPrompt.replaceAll(`{{${key}}}`, value);
  }

  // Compose the full message: workflow + discuss prompt + project description
  // This matches the dispatchWorkflow pattern from guided-flow.ts:
  //   "Read the following GSD workflow protocol and execute exactly.\n\n{workflow}\n\n## Your Task\n\n{note}"
  // Plus the user's vision/description appended so the agent treats it as the vision input.
  return [
    "Read the following GSD workflow protocol and execute exactly.",
    "",
    workflow,
    "",
    "## Your Task",
    "",
    discussPrompt.trim(),
    "",
    "## Project Vision (provided by user)",
    "",
    description,
  ].join("\n");
}

// ── Types ───────────────────────────────────────────────────────────────────

interface DiscussInput {
  description: string;
  answers: AnswerFile;
}

interface EventSummary {
  total: number;
  byType: Record<string, number>;
  toolUseCount: number;
  agentEndCount: number;
  extensionUIRequests: number;
  errors: string[];
  lastEvents: Array<{ type: string; timestamp: number; detail?: string }>;
}

// ── Event Tracking ──────────────────────────────────────────────────────────
// Reuses the proven S02/S03 pattern with ring buffer diagnostics.

function createEventTracker() {
  const events: Array<Record<string, unknown>> = [];
  const summary: EventSummary = {
    total: 0,
    byType: {},
    toolUseCount: 0,
    agentEndCount: 0,
    extensionUIRequests: 0,
    errors: [],
    lastEvents: [],
  };

  return {
    track(event: Record<string, unknown>) {
      events.push(event);
      summary.total++;

      const type = String(event.type ?? "unknown");
      summary.byType[type] = (summary.byType[type] ?? 0) + 1;

      if (type === "tool_execution_start") {
        summary.toolUseCount++;
      }
      if (type === "agent_end") {
        summary.agentEndCount++;
      }
      if (type === "extension_ui_request") {
        summary.extensionUIRequests++;
      }
      if (type === "error") {
        summary.errors.push(
          String(event.message ?? event.error ?? "unknown error"),
        );
      }

      // Ring buffer of last 20 events for timeout/failure diagnostics
      summary.lastEvents.push({
        type,
        timestamp: Date.now(),
        detail:
          type === "tool_execution_start"
            ? String((event as any).toolName ?? "")
            : type === "message_update"
              ? String(
                  (event as any).assistantMessageEvent?.text ?? "",
                ).slice(0, 80)
              : type === "extension_ui_request"
                ? `${(event as any).method}: ${(event as any).title ?? ""}`
                : undefined,
      });
      if (summary.lastEvents.length > 20) {
        summary.lastEvents.shift();
      }
    },
    getSummary(): EventSummary {
      return { ...summary };
    },
    getEvents() {
      return events;
    },
  };
}

// ── CLI Argument Parsing ────────────────────────────────────────────────────
// Simple loop matching cli.ts pattern.

interface CliArgs {
  phase: "discuss" | "plan" | "execute" | "verify" | "advance";
  inputPath?: string;
  projectDir?: string;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let phase: string | undefined;
  let inputPath: string | undefined;
  let projectDir: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--phase":
        phase = args[++i];
        break;
      case "--input":
        inputPath = args[++i];
        break;
      case "--project-dir":
        projectDir = args[++i];
        break;
      case "--dry-run":
        dryRun = true;
        break;
      default:
        log(`Unknown argument: ${args[i]}`);
        printUsageAndExit(1);
    }
  }

  // Validate required args
  if (!phase) {
    log("Error: --phase is required");
    printUsageAndExit(1);
  }

  if (phase !== "discuss" && phase !== "plan" && phase !== "execute" && phase !== "verify" && phase !== "advance") {
    log(`Error: --phase must be 'discuss', 'plan', 'execute', 'verify', or 'advance', got '${phase}'`);
    printUsageAndExit(1);
  }

  if (phase === "discuss" && !inputPath) {
    log("Error: --input is required for discuss phase");
    printUsageAndExit(1);
  }

  if ((phase === "plan" || phase === "execute" || phase === "verify" || phase === "advance") && !projectDir) {
    log(`Error: --project-dir is required for ${phase} phase`);
    printUsageAndExit(1);
  }

  return {
    phase: phase as "discuss" | "plan" | "execute" | "verify" | "advance",
    inputPath,
    projectDir,
    dryRun,
  };
}

function printUsageAndExit(code: number): never {
  log(`
Usage:
  npx tsx phase-command.ts --phase discuss --input <path> [--project-dir <path>] [--dry-run]
  npx tsx phase-command.ts --phase plan --project-dir <path> [--dry-run]
  npx tsx phase-command.ts --phase execute --project-dir <path> [--dry-run]
  npx tsx phase-command.ts --phase verify --project-dir <path> [--dry-run]
  npx tsx phase-command.ts --phase advance --project-dir <path> [--dry-run]

Options:
  --phase <discuss|plan|execute|verify|advance>  Phase to execute (required)
  --input <path>          JSON input file for discuss phase (required for discuss)
  --project-dir <path>    Project directory (optional for discuss, required for all other phases)
  --dry-run               Validate inputs and imports without spawning the agent

Environment Variables:
  PHASE_TIMEOUT_MS        Timeout for discuss/plan/verify/advance phases (default: 600000 = 10 min)
  EXECUTE_TIMEOUT_MS      Timeout for execute phase (default: 3600000 = 60 min)
`);
  process.exit(code);
}

// ── Input Parsing ───────────────────────────────────────────────────────────

function loadDiscussInput(inputPath: string): DiscussInput {
  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  let raw: string;
  try {
    raw = readFileSync(inputPath, "utf-8");
  } catch (err: any) {
    throw new Error(`Failed to read input file: ${err.message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Failed to parse input JSON: ${err.message}`);
  }

  if (parsed == null || typeof parsed !== "object") {
    throw new Error("Input file must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  // Validate description field
  if (!("description" in obj) || typeof obj.description !== "string") {
    throw new Error(
      "Input file must have a 'description' field (string — the project vision)",
    );
  }

  if (!obj.description.trim()) {
    throw new Error("Input file 'description' field must not be empty");
  }

  // Validate answers field using S03's parseAnswerFile
  if (!("answers" in obj) || obj.answers == null || typeof obj.answers !== "object") {
    throw new Error(
      "Input file must have an 'answers' field (answer file format from S03)",
    );
  }

  const answers = parseAnswerFile(obj.answers);

  return {
    description: obj.description as string,
    answers,
  };
}

// ── Fixture Creation ────────────────────────────────────────────────────────
// Creates a minimal .gsd/ project skeleton for the discuss phase.
// No context files — the discuss prompt will create them.

const STUB_PROJECT_MD = `# Project

## What This Is

(Pending — discuss phase will populate this.)

## Core Value

(Pending.)

## Current State

New project. Awaiting discuss phase to gather context.

## Architecture / Key Patterns

(Pending.)

## Capability Contract

None yet.

## Milestone Sequence

(Pending — discuss will create the first milestone.)
`;

function createDiscussFixture(): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "gsd-phase-discuss-"));

  // Initialize git repo (GSD requires it)
  execSync("git init -b main", { cwd: tmpDir, stdio: "pipe" });
  execSync('git config user.email "phase-command@test.com"', {
    cwd: tmpDir,
    stdio: "pipe",
  });
  execSync('git config user.name "Phase Command"', {
    cwd: tmpDir,
    stdio: "pipe",
  });

  // Create minimal .gsd/ structure — just the dir and PROJECT.md stub
  const gsdDir = join(tmpDir, ".gsd");
  const milestonesDir = join(gsdDir, "milestones", "M001");
  mkdirSync(milestonesDir, { recursive: true });

  // PROJECT.md stub so GSD recognizes this as a project
  writeFileSync(join(gsdDir, "PROJECT.md"), STUB_PROJECT_MD);

  // .gitignore for runtime files
  writeFileSync(
    join(tmpDir, ".gitignore"),
    [
      ".gsd/auto.lock",
      ".gsd/completed-units.json",
      ".gsd/metrics.json",
      ".gsd/activity/",
      ".gsd/runtime/",
    ].join("\n") + "\n",
  );

  // Initial commit so GSD has a clean git state
  execSync("git add -A && git commit -m 'init: phase command fixture'", {
    cwd: tmpDir,
    stdio: "pipe",
  });

  return tmpDir;
}

// ── Artifact Collection ─────────────────────────────────────────────────────
// Scans the project directory for artifacts produced by the discuss phase.

function collectDiscussArtifacts(projectDir: string): PhaseArtifact[] {
  const artifacts: PhaseArtifact[] = [];

  // Scan for known discuss outputs in .gsd/
  const gsdDir = join(projectDir, ".gsd");
  const milestonesDir = join(gsdDir, "milestones");

  // Check PROJECT.md (may have been updated)
  const projectMd = join(gsdDir, "PROJECT.md");
  if (existsSync(projectMd)) {
    artifacts.push({
      path: projectMd,
      relativePath: relative(projectDir, projectMd),
    });
  }

  // Check REQUIREMENTS.md
  const requirementsMd = join(gsdDir, "REQUIREMENTS.md");
  if (existsSync(requirementsMd)) {
    artifacts.push({
      path: requirementsMd,
      relativePath: relative(projectDir, requirementsMd),
    });
  }

  // Check DECISIONS.md
  const decisionsMd = join(gsdDir, "DECISIONS.md");
  if (existsSync(decisionsMd)) {
    artifacts.push({
      path: decisionsMd,
      relativePath: relative(projectDir, decisionsMd),
    });
  }

  // Check STATE.md
  const stateMd = join(gsdDir, "STATE.md");
  if (existsSync(stateMd)) {
    artifacts.push({
      path: stateMd,
      relativePath: relative(projectDir, stateMd),
    });
  }

  // Scan milestone directories for CONTEXT.md and ROADMAP.md
  if (existsSync(milestonesDir)) {
    try {
      const milestones = readdirSync(milestonesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const milestoneId of milestones) {
        const mDir = join(milestonesDir, milestoneId);

        // CONTEXT.md
        const contextMd = join(mDir, `${milestoneId}-CONTEXT.md`);
        if (existsSync(contextMd)) {
          artifacts.push({
            path: contextMd,
            relativePath: relative(projectDir, contextMd),
          });
        }

        // ROADMAP.md
        const roadmapMd = join(mDir, `${milestoneId}-ROADMAP.md`);
        if (existsSync(roadmapMd)) {
          artifacts.push({
            path: roadmapMd,
            relativePath: relative(projectDir, roadmapMd),
          });
        }
      }
    } catch {
      // Non-fatal — directory may not exist
    }
  }

  return artifacts;
}

// ── Context File Detection ──────────────────────────────────────────────────
// Checks if any CONTEXT.md file exists in any milestone directory.

function hasContextFile(projectDir: string): boolean {
  const milestonesDir = join(projectDir, ".gsd", "milestones");
  if (!existsSync(milestonesDir)) return false;

  try {
    const milestones = readdirSync(milestonesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const milestoneId of milestones) {
      const contextMd = join(
        milestonesDir,
        milestoneId,
        `${milestoneId}-CONTEXT.md`,
      );
      if (existsSync(contextMd)) return true;
    }
  } catch {
    // Non-fatal
  }

  return false;
}

// ── Roadmap File Detection ──────────────────────────────────────────────────
// Checks if any ROADMAP.md file exists in any milestone directory.

function hasRoadmapFile(projectDir: string): boolean {
  const milestonesDir = join(projectDir, ".gsd", "milestones");
  if (!existsSync(milestonesDir)) return false;

  try {
    const milestones = readdirSync(milestonesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const milestoneId of milestones) {
      const roadmapMd = join(
        milestonesDir,
        milestoneId,
        `${milestoneId}-ROADMAP.md`,
      );
      if (existsSync(roadmapMd)) return true;
    }
  } catch {
    // Non-fatal
  }

  return false;
}

// ── Slice Plan Detection ────────────────────────────────────────────────────
// Checks if any S*-PLAN.md file exists in any slice directory under any milestone.

function hasSlicePlan(projectDir: string): boolean {
  const milestonesDir = join(projectDir, ".gsd", "milestones");
  if (!existsSync(milestonesDir)) return false;

  try {
    const milestones = readdirSync(milestonesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const milestoneId of milestones) {
      const slicesDir = join(milestonesDir, milestoneId, "slices");
      if (!existsSync(slicesDir)) continue;

      const slices = readdirSync(slicesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const sliceId of slices) {
        const planMd = join(slicesDir, sliceId, `${sliceId}-PLAN.md`);
        if (existsSync(planMd)) return true;
      }
    }
  } catch {
    // Non-fatal
  }

  return false;
}

// ── Active Slice Detection ──────────────────────────────────────────────────
// Finds the first incomplete slice from ROADMAP.md (first `- [ ]` slice entry).
// Returns the slice ID (e.g., "S01") or null if none found.

function getActiveSliceId(projectDir: string): string | null {
  const milestonesDir = join(projectDir, ".gsd", "milestones");
  if (!existsSync(milestonesDir)) return null;

  try {
    const milestones = readdirSync(milestonesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const milestoneId of milestones) {
      const roadmapMd = join(milestonesDir, milestoneId, `${milestoneId}-ROADMAP.md`);
      if (!existsSync(roadmapMd)) continue;

      const content = readFileSync(roadmapMd, "utf-8");
      // Match incomplete slice entries: `- [ ] **S01: ...`
      const incompleteMatch = content.match(/^- \[ \] \*\*(S\d+):/m);
      if (incompleteMatch) return incompleteMatch[1];
    }
  } catch {
    // Non-fatal
  }

  return null;
}

// ── Active Milestone Detection ──────────────────────────────────────────────
// Finds the first milestone directory that has a ROADMAP.md.

function getActiveMilestoneId(projectDir: string): string | null {
  const milestonesDir = join(projectDir, ".gsd", "milestones");
  if (!existsSync(milestonesDir)) return null;

  try {
    const milestones = readdirSync(milestonesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const milestoneId of milestones) {
      const roadmapMd = join(milestonesDir, milestoneId, `${milestoneId}-ROADMAP.md`);
      if (existsSync(roadmapMd)) return milestoneId;
    }
  } catch {
    // Non-fatal
  }

  return null;
}

// ── Active Slice Plan Path ──────────────────────────────────────────────────
// Returns the path to the active slice's PLAN.md, or null.

function getActiveSlicePlanPath(projectDir: string): string | null {
  const milestoneId = getActiveMilestoneId(projectDir);
  if (!milestoneId) return null;

  const sliceId = getActiveSliceId(projectDir);
  if (!sliceId) return null;

  const planPath = join(
    projectDir, ".gsd", "milestones", milestoneId, "slices", sliceId, `${sliceId}-PLAN.md`,
  );
  return existsSync(planPath) ? planPath : null;
}

// ── Slice Summary Detection ─────────────────────────────────────────────────
// Checks if S*-SUMMARY.md exists for the active slice.

function hasSliceSummary(projectDir: string): boolean {
  const milestoneId = getActiveMilestoneId(projectDir);
  if (!milestoneId) return false;

  const sliceId = getActiveSliceId(projectDir);
  // If no incomplete slice, check the last completed one
  const milestonesDir = join(projectDir, ".gsd", "milestones");

  try {
    if (sliceId) {
      const summaryMd = join(
        milestonesDir, milestoneId, "slices", sliceId, `${sliceId}-SUMMARY.md`,
      );
      return existsSync(summaryMd);
    }

    // No incomplete slice — check if the last slice has a summary
    const slicesDir = join(milestonesDir, milestoneId, "slices");
    if (!existsSync(slicesDir)) return false;

    const slices = readdirSync(slicesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const sid of slices.reverse()) {
      const summaryMd = join(slicesDir, sid, `${sid}-SUMMARY.md`);
      if (existsSync(summaryMd)) return true;
    }
  } catch {
    // Non-fatal
  }

  return false;
}

// ── Slice Summary Detection (for specific slice) ────────────────────────────

function hasSliceSummaryForSlice(projectDir: string, milestoneId: string, sliceId: string): boolean {
  const summaryMd = join(
    projectDir, ".gsd", "milestones", milestoneId, "slices", sliceId, `${sliceId}-SUMMARY.md`,
  );
  return existsSync(summaryMd);
}

// ── UAT File Detection ──────────────────────────────────────────────────────

function hasUatFile(projectDir: string, milestoneId: string, sliceId: string): boolean {
  const uatMd = join(
    projectDir, ".gsd", "milestones", milestoneId, "slices", sliceId, `${sliceId}-UAT.md`,
  );
  return existsSync(uatMd);
}

// ── All Tasks Done Detection ────────────────────────────────────────────────
// Parses the active slice's PLAN.md checkboxes.
// Returns true if no `- [ ]` task entries remain (all are `- [x]`).

function allTasksDone(projectDir: string): boolean {
  const planPath = getActiveSlicePlanPath(projectDir);
  if (!planPath) return false;

  try {
    const content = readFileSync(planPath, "utf-8");

    // Find the Tasks section
    const tasksMatch = content.match(/^## Tasks\s*$/m);
    if (!tasksMatch) return false;

    const tasksSection = content.slice(tasksMatch.index!);

    // Check for any incomplete task checkbox: `- [ ] **T`
    const hasIncomplete = /^- \[ \] \*\*T\d+:/m.test(tasksSection);
    // Must have at least one task entry
    const hasAnyTask = /^- \[.\] \*\*T\d+:/m.test(tasksSection);

    return hasAnyTask && !hasIncomplete;
  } catch {
    return false;
  }
}

// ── Assessment File Detection ───────────────────────────────────────────────
// Checks if any S*-ASSESSMENT.md exists in any slice directory.

function hasAssessmentFile(projectDir: string): boolean {
  const milestonesDir = join(projectDir, ".gsd", "milestones");
  if (!existsSync(milestonesDir)) return false;

  try {
    const milestones = readdirSync(milestonesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const milestoneId of milestones) {
      const slicesDir = join(milestonesDir, milestoneId, "slices");
      if (!existsSync(slicesDir)) continue;

      const slices = readdirSync(slicesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const sliceId of slices) {
        const assessmentMd = join(slicesDir, sliceId, `${sliceId}-ASSESSMENT.md`);
        if (existsSync(assessmentMd)) return true;
      }
    }
  } catch {
    // Non-fatal
  }

  return false;
}

// ── Auth Validation ─────────────────────────────────────────────────────────

function validateAuth(): boolean {
  const authJsonPath = join(homedir(), ".gsd", "agent", "auth.json");
  let hasOAuth = false;

  if (existsSync(authJsonPath)) {
    try {
      const authData = JSON.parse(readFileSync(authJsonPath, "utf-8"));
      hasOAuth = authData?.anthropic?.type === "oauth";
    } catch {
      // Non-fatal
    }
  }

  if (hasOAuth) {
    log("  ✓ OAuth credentials found in ~/.gsd/agent/auth.json");
    return true;
  }

  if (process.env.ANTHROPIC_API_KEY) {
    log("  ✓ ANTHROPIC_API_KEY present (env var fallback)");
    return true;
  }

  return false;
}

// ── Discuss Phase ───────────────────────────────────────────────────────────

async function runDiscussPhase(
  input: DiscussInput,
  projectDir: string,
  repoRoot: string,
): Promise<PhaseResult> {
  const startTime = Date.now();

  log("\n[discuss] Starting discuss phase...");
  log(`  Project dir: ${projectDir}`);
  log(`  Description: ${input.description.slice(0, 100)}...`);

  // Resolve CLI path
  const cliPath = join(repoRoot, "dist", "cli.js");
  if (!existsSync(cliPath)) {
    return {
      phase: "discuss",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: [`CLI not found at ${cliPath}. Run 'npm run build' first.`],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
  log(`  ✓ CLI found at ${cliPath}`);

  // Build the discuss prompt message (workflow + discuss template + description)
  let discussMessage: string;
  try {
    discussMessage = buildDiscussMessage(repoRoot, "M001", input.description);
    log(`  ✓ Discuss prompt built (${discussMessage.length} chars)`);
  } catch (err: any) {
    return {
      phase: "discuss",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: [`Failed to build discuss prompt: ${err.message}`],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }

  // Create answer injector from input
  const injector = createAnswerInjector(input.answers);
  const tracker = createEventTracker();

  // Spawn RpcClient
  const client = new RpcClient({
    cliPath,
    cwd: projectDir,
  });

  let stdinWriter: ((data: string) => void) | null = null;

  // Wire event handlers
  client.onEvent((event: any) => {
    const eventObj = event as Record<string, unknown>;
    tracker.track(eventObj);

    // Wire answer injector for extension_ui_request
    if (eventObj.type === "extension_ui_request" && stdinWriter) {
      const consumed = injector.handleEvent(eventObj, stdinWriter);
      if (!consumed) {
        // Fallback: respond to avoid hanging
        log(
          `  [WARN] Unhandled extension_ui_request method=${eventObj.method}, sending empty response`,
        );
        stdinWriter(
          serializeJsonLine({
            type: "extension_ui_response",
            id: eventObj.id,
            value: "",
          }),
        );
      }
    }

    // Let injector observe tool_execution_start for phase-1 correlation
    if (eventObj.type === "tool_execution_start" && stdinWriter) {
      injector.handleEvent(eventObj, stdinWriter);
    }
  });

  try {
    await client.start();
    log("  ✓ RPC session started");

    // Access stdin writer via internal process (per D012)
    const internalProcess = (client as any).process as import("node:child_process").ChildProcess;
    if (!internalProcess?.stdin) {
      throw new Error(
        "Cannot access child process stdin for extension_ui_response",
      );
    }
    stdinWriter = (data: string) => {
      internalProcess.stdin!.write(data);
    };

    // Dispatch the discuss prompt directly as a user message.
    // This bypasses showSmartEntry/showNextAction (TUI widgets that block in RPC mode)
    // and sends the composed workflow + discuss.md + project description as one message.
    // The agent processes the discuss prompt with the vision already included,
    // so it can proceed directly to reflection + questioning without waiting for vision input.
    log("  Dispatching discuss prompt directly...");

    let completionResolve: (() => void) | null = null;
    let completionReject: ((err: Error) => void) | null = null;

    const completionPromise = new Promise<void>((resolve, reject) => {
      completionResolve = resolve;
      completionReject = reject;
    });

    // Timeout handler
    const timeoutTimer = setTimeout(() => {
      const summary = tracker.getSummary();
      log(`\n  TIMEOUT after ${TIMEOUT_MS / 1000}s`);
      log("  Last events:");
      for (const e of summary.lastEvents) {
        log(`    ${e.type}${e.detail ? `: ${e.detail}` : ""}`);
      }
      log(`\n  Stderr (last 2000 chars):\n${client.getStderr().slice(-2000)}`);
      completionReject!(
        new Error(`Timeout after ${TIMEOUT_MS / 1000}s waiting for discuss completion`),
      );
    }, TIMEOUT_MS);

    // Watch for agent_end events and check if CONTEXT.md was produced.
    // The discuss prompt is conversational — the agent may take multiple turns:
    //   Turn 1: Reflection (summarizes understanding, asks "Did I get that right?")
    //   Turn N: Questions via ask_user_questions (handled by injector)
    //   Final turn: Writes CONTEXT.md, ROADMAP.md, PROJECT.md
    // We detect completion when CONTEXT.md appears after an agent_end.
    let agentEndCount = 0;

    client.onEvent((event: any) => {
      if (event.type === "agent_end") {
        agentEndCount++;
        log(`  [info] agent_end #${agentEndCount} received`);

        // After each agent_end, check if CONTEXT.md was produced.
        // Give a brief moment for file writes to flush.
        setTimeout(() => {
          if (hasContextFile(projectDir)) {
            log("  ✓ CONTEXT.md detected — discuss phase complete");
            clearTimeout(timeoutTimer);
            completionResolve!();
          } else {
            log(`  [info] CONTEXT.md not yet produced after agent_end #${agentEndCount}`);

            // For multi-turn discuss, the agent asks "Did I get that right?"
            // as plain text (not ask_user_questions). We need to send a
            // confirmation as the next user message to continue the conversation.
            if (agentEndCount === 1) {
              // First agent_end is likely the reflection turn asking for confirmation.
              // Send a confirmation to proceed.
              log("  Sending confirmation to continue discuss flow...");
              setTimeout(async () => {
                try {
                  await client.prompt(
                    "Yes, that's right. Proceed with your questions and then write the context files.",
                  );
                  log("  ✓ Confirmation sent");
                } catch (err: any) {
                  log(`  [WARN] Failed to send confirmation: ${err.message}`);
                }
              }, 500);
            } else if (agentEndCount >= 2) {
              // Subsequent turns: agent may have asked more questions or
              // needs another nudge. If no CONTEXT.md yet after turn 2+,
              // the agent might be waiting for freeform input or presenting
              // a roadmap preview for approval.
              log("  Sending approval to finalize...");
              setTimeout(async () => {
                try {
                  await client.prompt(
                    "Looks good. Please write all the files now.",
                  );
                  log("  ✓ Approval sent");
                } catch (err: any) {
                  log(`  [WARN] Failed to send approval: ${err.message}`);
                }
              }, 500);
            }
          }
        }, 1500);
      }
    });

    await client.prompt(discussMessage);
    log("  ✓ Discuss prompt dispatched");

    // Wait for completion or timeout
    log("  Waiting for discuss phase to complete...");
    await completionPromise;

    // Collect artifacts
    const artifacts = collectDiscussArtifacts(projectDir);
    const summary = tracker.getSummary();
    const stats = injector.getStats();

    log("\n  --- Discuss Phase Summary ---");
    log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    log(`  Events: ${summary.total}`);
    log(`  Tool calls: ${summary.toolUseCount}`);
    log(`  Agent turns: ${agentEndCount}`);
    log(`  Artifacts: ${artifacts.map((a) => a.relativePath).join(", ")}`);
    log(`  Injector: ${stats.questionsAnswered} answered, ${stats.questionsDefaulted} defaulted`);

    await client.stop();

    return {
      phase: "discuss",
      status: "success",
      artifacts,
      events: {
        total: summary.total,
        byType: summary.byType,
      },
      errors: summary.errors,
      durationMs: Date.now() - startTime,
      projectDir,
    };
  } catch (error) {
    const summary = tracker.getSummary();
    const stats = injector.getStats();

    log("\n  --- Discuss Phase FAILED ---");
    log(
      `  Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    log(`  Injector stats: ${JSON.stringify(stats)}`);
    log(`  Last events:`);
    for (const e of summary.lastEvents) {
      log(`    ${e.type}${e.detail ? `: ${e.detail}` : ""}`);
    }
    log(`  Stderr (last 2000 chars):\n${client.getStderr().slice(-2000)}`);

    try {
      await client.stop();
    } catch {
      // Best effort
    }

    // Determine status based on error type
    const isTimeout =
      error instanceof Error && error.message.includes("Timeout");

    return {
      phase: "discuss",
      status: isTimeout ? "timeout" : "failure",
      artifacts: collectDiscussArtifacts(projectDir),
      events: {
        total: summary.total,
        byType: summary.byType,
      },
      errors: [error instanceof Error ? error.message : String(error)],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
}

// ── Artifact Collection (Plan) ───────────────────────────────────────────────
// Collects plan-phase artifacts: ROADMAP.md, RESEARCH.md, and any other
// milestone-level files produced during auto-mode's research→plan flow.

function collectPlanArtifacts(projectDir: string): PhaseArtifact[] {
  const artifacts: PhaseArtifact[] = [];
  const milestonesDir = join(projectDir, ".gsd", "milestones");

  if (!existsSync(milestonesDir)) return artifacts;

  try {
    const milestones = readdirSync(milestonesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const milestoneId of milestones) {
      const mDir = join(milestonesDir, milestoneId);

      // ROADMAP.md — the primary plan output
      const roadmapMd = join(mDir, `${milestoneId}-ROADMAP.md`);
      if (existsSync(roadmapMd)) {
        artifacts.push({
          path: roadmapMd,
          relativePath: relative(projectDir, roadmapMd),
        });
      }

      // RESEARCH.md — produced by research-milestone before plan
      const researchMd = join(mDir, `${milestoneId}-RESEARCH.md`);
      if (existsSync(researchMd)) {
        artifacts.push({
          path: researchMd,
          relativePath: relative(projectDir, researchMd),
        });
      }

      // SECRETS.md — plan-milestone may produce this
      const secretsMd = join(mDir, `${milestoneId}-SECRETS.md`);
      if (existsSync(secretsMd)) {
        artifacts.push({
          path: secretsMd,
          relativePath: relative(projectDir, secretsMd),
        });
      }
    }
  } catch {
    // Non-fatal
  }

  // Also check for updated PROJECT.md, STATE.md, DECISIONS.md
  const gsdDir = join(projectDir, ".gsd");
  for (const fileName of ["PROJECT.md", "STATE.md", "DECISIONS.md"]) {
    const filePath = join(gsdDir, fileName);
    if (existsSync(filePath)) {
      artifacts.push({
        path: filePath,
        relativePath: relative(projectDir, filePath),
      });
    }
  }

  return artifacts;
}

// ── Plan Phase ──────────────────────────────────────────────────────────────
// Dispatches `/gsd auto` and watches for ROADMAP.md. Auto-mode routes
// pre-planning → research-milestone → plan-milestone. After ROADMAP.md
// appears, the session is terminated immediately to prevent auto-mode
// from continuing to execution.

async function runPlanPhase(
  projectDir: string,
  repoRoot: string,
  answers?: AnswerFile,
): Promise<PhaseResult> {
  const startTime = Date.now();

  log("\n[plan] Starting plan phase...");
  log(`  Project dir: ${projectDir}`);

  // ── Pre-flight validation ──────────────────────────────────────────────

  // Validate CONTEXT.md exists
  if (!hasContextFile(projectDir)) {
    const result: PhaseResult = {
      phase: "plan",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: [
        "No CONTEXT.md found in any milestone directory. The discuss phase must run first to produce context files.",
        `Checked: ${join(projectDir, ".gsd", "milestones", "*", "*-CONTEXT.md")}`,
      ],
      durationMs: Date.now() - startTime,
      projectDir,
    };
    return result;
  }
  log("  ✓ CONTEXT.md found");

  // Check ROADMAP.md doesn't already exist (no-op guard)
  if (hasRoadmapFile(projectDir)) {
    log("  ⚠ ROADMAP.md already exists — plan phase may already be complete");
    const artifacts = collectPlanArtifacts(projectDir);
    return {
      phase: "plan",
      status: "success",
      artifacts,
      events: { total: 0, byType: {} },
      errors: [],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
  log("  ✓ No ROADMAP.md yet — ready for planning");

  // Resolve CLI path
  const cliPath = join(repoRoot, "dist", "cli.js");
  if (!existsSync(cliPath)) {
    return {
      phase: "plan",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: [`CLI not found at ${cliPath}. Run 'npm run build' first.`],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
  log(`  ✓ CLI found at ${cliPath}`);

  // ── RPC session ────────────────────────────────────────────────────────

  const tracker = createEventTracker();

  // Create answer injector if answers provided (plan usually doesn't
  // trigger questions, but may on ambiguity)
  const injector = answers
    ? createAnswerInjector(answers)
    : createAnswerInjector({
        questions: {},
        secrets: {},
        defaults: { strategy: "first_option" },
      });

  // Spawn RpcClient with cwd pointing to the project directory
  const client = new RpcClient({
    cliPath,
    cwd: projectDir,
  });

  let stdinWriter: ((data: string) => void) | null = null;

  // Wire event handlers
  client.onEvent((event: any) => {
    const eventObj = event as Record<string, unknown>;
    tracker.track(eventObj);

    // Wire answer injector for extension_ui_request
    if (eventObj.type === "extension_ui_request" && stdinWriter) {
      const consumed = injector.handleEvent(eventObj, stdinWriter);
      if (!consumed) {
        log(
          `  [WARN] Unhandled extension_ui_request method=${eventObj.method}, sending empty response`,
        );
        stdinWriter(
          serializeJsonLine({
            type: "extension_ui_response",
            id: eventObj.id,
            value: "",
          }),
        );
      }
    }

    // Let injector observe tool_execution_start for phase-1 correlation
    if (eventObj.type === "tool_execution_start" && stdinWriter) {
      injector.handleEvent(eventObj, stdinWriter);
    }
  });

  try {
    await client.start();
    log("  ✓ RPC session started");

    // Access stdin writer via internal process (per D012)
    const internalProcess = (client as any).process as import("node:child_process").ChildProcess;
    if (!internalProcess?.stdin) {
      throw new Error(
        "Cannot access child process stdin for extension_ui_response",
      );
    }
    stdinWriter = (data: string) => {
      internalProcess.stdin!.write(data);
    };

    // ── Dispatch /gsd auto ─────────────────────────────────────────────
    // Auto-mode detects pre-planning state and routes to:
    //   1. research-milestone (if no RESEARCH.md)
    //   2. plan-milestone (produces ROADMAP.md)
    // We dispatch the command and watch for ROADMAP.md.

    log("  Dispatching /gsd auto...");

    let completionResolve: (() => void) | null = null;
    let completionReject: ((err: Error) => void) | null = null;
    let sessionTerminated = false;

    const completionPromise = new Promise<void>((resolve, reject) => {
      completionResolve = resolve;
      completionReject = reject;
    });

    // Timeout handler
    const timeoutTimer = setTimeout(() => {
      if (sessionTerminated) return;
      const summary = tracker.getSummary();
      log(`\n  [plan] TIMEOUT after ${TIMEOUT_MS / 1000}s`);
      log("  Last events:");
      for (const e of summary.lastEvents) {
        log(`    ${e.type}${e.detail ? `: ${e.detail}` : ""}`);
      }
      log(`\n  Stderr (last 2000 chars):\n${client.getStderr().slice(-2000)}`);
      completionReject!(
        new Error(`Timeout after ${TIMEOUT_MS / 1000}s waiting for plan completion`),
      );
    }, TIMEOUT_MS);

    // Watch for agent_end events and check if ROADMAP.md was produced.
    // Auto-mode fires agent_end after each unit:
    //   - agent_end #1: research-milestone completes
    //   - agent_end #2: plan-milestone completes (ROADMAP.md appears)
    // CRITICAL: We MUST terminate the session after ROADMAP.md is detected,
    // before auto-mode's handleAgentEnd dispatches the next unit (execution).
    let planAgentEndCount = 0;

    client.onEvent((event: any) => {
      if (event.type === "agent_end" && !sessionTerminated) {
        planAgentEndCount++;
        log(`  [plan] agent_end #${planAgentEndCount} received`);

        // Check for ROADMAP.md after a brief delay for file flush
        setTimeout(async () => {
          if (sessionTerminated) return;

          if (hasRoadmapFile(projectDir)) {
            // ── TERMINATION GUARD ────────────────────────────────────
            // ROADMAP.md detected. Kill the session immediately to
            // prevent auto-mode from dispatching execution units.
            sessionTerminated = true;
            log("  [plan] ROADMAP.md detected — terminating session before execution");
            clearTimeout(timeoutTimer);

            try {
              await client.stop();
              log("  [plan] ✓ Session terminated cleanly");
            } catch (stopErr: any) {
              log(`  [plan] [WARN] Session stop error (non-fatal): ${stopErr.message}`);
            }

            completionResolve!();
          } else {
            log(`  [plan] ROADMAP.md not yet produced after agent_end #${planAgentEndCount}`);
          }
        }, 1500);
      }
    });

    // Send /gsd auto as a command prompt
    // The RpcClient sends this as a user message; the GSD extension's
    // command handler intercepts /gsd and dispatches startAuto().
    await client.prompt("/gsd auto");
    log("  ✓ /gsd auto dispatched");

    // Wait for completion (ROADMAP.md detected) or timeout
    log("  Waiting for plan phase to complete (research → plan)...");
    await completionPromise;

    // Collect artifacts
    const artifacts = collectPlanArtifacts(projectDir);
    const summary = tracker.getSummary();
    const stats = injector.getStats();

    log("\n  --- Plan Phase Summary ---");
    log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    log(`  Events: ${summary.total}`);
    log(`  Tool calls: ${summary.toolUseCount}`);
    log(`  Agent turns: ${planAgentEndCount}`);
    log(`  Artifacts: ${artifacts.map((a) => a.relativePath).join(", ")}`);
    log(`  Injector: ${stats.questionsAnswered} answered, ${stats.questionsDefaulted} defaulted`);

    return {
      phase: "plan",
      status: "success",
      artifacts,
      events: {
        total: summary.total,
        byType: summary.byType,
      },
      errors: summary.errors,
      durationMs: Date.now() - startTime,
      projectDir,
    };
  } catch (error) {
    const summary = tracker.getSummary();
    const stats = injector.getStats();

    log("\n  --- Plan Phase FAILED ---");
    log(
      `  Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    log(`  Injector stats: ${JSON.stringify(stats)}`);
    log(`  Last events:`);
    for (const e of summary.lastEvents) {
      log(`    ${e.type}${e.detail ? `: ${e.detail}` : ""}`);
    }
    log(`  Stderr (last 2000 chars):\n${client.getStderr().slice(-2000)}`);

    if (!sessionTerminated) {
      try {
        await client.stop();
      } catch {
        // Best effort
      }
    }

    // Determine status based on error type
    const isTimeout =
      error instanceof Error && error.message.includes("Timeout");

    return {
      phase: "plan",
      status: isTimeout ? "timeout" : "failure",
      artifacts: collectPlanArtifacts(projectDir),
      events: {
        total: summary.total,
        byType: summary.byType,
      },
      errors: [error instanceof Error ? error.message : String(error)],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
}

// ── Artifact Collection (Execute) ────────────────────────────────────────────
// Scans active slice's tasks/ for T*-SUMMARY.md files, plus slice SUMMARY.md and UAT.md.

function collectExecuteArtifacts(projectDir: string): PhaseArtifact[] {
  const artifacts: PhaseArtifact[] = [];
  const milestoneId = getActiveMilestoneId(projectDir);
  if (!milestoneId) return artifacts;

  const sliceId = getActiveSliceId(projectDir);
  const milestonesDir = join(projectDir, ".gsd", "milestones");

  // Determine which slice to collect from — active or last completed
  const slicesDir = join(milestonesDir, milestoneId, "slices");
  if (!existsSync(slicesDir)) return artifacts;

  const allSlices = readdirSync(slicesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  // Use active slice, or fall back to the last slice
  const targetSlice = sliceId ?? allSlices[allSlices.length - 1];
  if (!targetSlice) return artifacts;

  const sliceDir = join(slicesDir, targetSlice);

  // Task summaries
  const tasksDir = join(sliceDir, "tasks");
  if (existsSync(tasksDir)) {
    try {
      const taskFiles = readdirSync(tasksDir)
        .filter((f) => /^T\d+-SUMMARY\.md$/.test(f))
        .sort();

      for (const taskFile of taskFiles) {
        const taskPath = join(tasksDir, taskFile);
        artifacts.push({
          path: taskPath,
          relativePath: relative(projectDir, taskPath),
        });
      }
    } catch {
      // Non-fatal
    }
  }

  // Slice SUMMARY.md
  const summaryMd = join(sliceDir, `${targetSlice}-SUMMARY.md`);
  if (existsSync(summaryMd)) {
    artifacts.push({
      path: summaryMd,
      relativePath: relative(projectDir, summaryMd),
    });
  }

  // Slice UAT.md
  const uatMd = join(sliceDir, `${targetSlice}-UAT.md`);
  if (existsSync(uatMd)) {
    artifacts.push({
      path: uatMd,
      relativePath: relative(projectDir, uatMd),
    });
  }

  // STATE.md
  const stateMd = join(projectDir, ".gsd", "STATE.md");
  if (existsSync(stateMd)) {
    artifacts.push({
      path: stateMd,
      relativePath: relative(projectDir, stateMd),
    });
  }

  return artifacts;
}

// ── Artifact Collection (Verify) ─────────────────────────────────────────────
// Collects SUMMARY.md, UAT.md, UAT-RESULT.md from the active slice.

function collectVerifyArtifacts(projectDir: string): PhaseArtifact[] {
  const artifacts: PhaseArtifact[] = [];
  const milestoneId = getActiveMilestoneId(projectDir);
  if (!milestoneId) return artifacts;

  const sliceId = getActiveSliceId(projectDir);
  const milestonesDir = join(projectDir, ".gsd", "milestones");
  const slicesDir = join(milestonesDir, milestoneId, "slices");
  if (!existsSync(slicesDir)) return artifacts;

  const allSlices = readdirSync(slicesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const targetSlice = sliceId ?? allSlices[allSlices.length - 1];
  if (!targetSlice) return artifacts;

  const sliceDir = join(slicesDir, targetSlice);

  for (const suffix of ["SUMMARY.md", "UAT.md", "UAT-RESULT.md"]) {
    const filePath = join(sliceDir, `${targetSlice}-${suffix}`);
    if (existsSync(filePath)) {
      artifacts.push({
        path: filePath,
        relativePath: relative(projectDir, filePath),
      });
    }
  }

  return artifacts;
}

// ── Artifact Collection (Advance) ────────────────────────────────────────────
// Collects ASSESSMENT.md and updated ROADMAP.md.

function collectAdvanceArtifacts(projectDir: string): PhaseArtifact[] {
  const artifacts: PhaseArtifact[] = [];
  const milestoneId = getActiveMilestoneId(projectDir);
  if (!milestoneId) return artifacts;

  const milestonesDir = join(projectDir, ".gsd", "milestones");

  // ROADMAP.md (updated after reassess)
  const roadmapMd = join(milestonesDir, milestoneId, `${milestoneId}-ROADMAP.md`);
  if (existsSync(roadmapMd)) {
    artifacts.push({
      path: roadmapMd,
      relativePath: relative(projectDir, roadmapMd),
    });
  }

  // Scan slices for ASSESSMENT.md
  const slicesDir = join(milestonesDir, milestoneId, "slices");
  if (existsSync(slicesDir)) {
    try {
      const slices = readdirSync(slicesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();

      for (const sliceId of slices) {
        const assessmentMd = join(slicesDir, sliceId, `${sliceId}-ASSESSMENT.md`);
        if (existsSync(assessmentMd)) {
          artifacts.push({
            path: assessmentMd,
            relativePath: relative(projectDir, assessmentMd),
          });
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // STATE.md
  const stateMd = join(projectDir, ".gsd", "STATE.md");
  if (existsSync(stateMd)) {
    artifacts.push({
      path: stateMd,
      relativePath: relative(projectDir, stateMd),
    });
  }

  return artifacts;
}

// ── Execute Phase ────────────────────────────────────────────────────────────
// Dispatches `/gsd auto` and watches for slice SUMMARY.md. Auto-mode routes
// executing state to execute-task units → complete-slice. After SUMMARY.md
// appears, the session is terminated.

async function runExecutePhase(
  projectDir: string,
  repoRoot: string,
  answers?: AnswerFile,
): Promise<PhaseResult> {
  const startTime = Date.now();
  const timeoutMs = EXECUTE_TIMEOUT_MS;

  log("\n[execute] Starting execute phase...");
  log(`  Project dir: ${projectDir}`);
  log(`  Timeout: ${timeoutMs / 1000}s`);

  // ── Pre-flight validation ──────────────────────────────────────────────

  const milestoneId = getActiveMilestoneId(projectDir);
  if (!milestoneId) {
    return {
      phase: "execute",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: [
        "No milestone with ROADMAP.md found. The plan phase must run first.",
        `Checked: ${join(projectDir, ".gsd", "milestones", "*", "*-ROADMAP.md")}`,
      ],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }

  const sliceId = getActiveSliceId(projectDir);
  if (!sliceId) {
    return {
      phase: "execute",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: [
        "No incomplete slice found in ROADMAP.md. All slices may already be complete.",
      ],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }

  // Verify PLAN.md exists for the active slice
  const planPath = getActiveSlicePlanPath(projectDir);
  if (!planPath) {
    return {
      phase: "execute",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: [
        `No PLAN.md found for active slice ${sliceId} in milestone ${milestoneId}. The plan phase must produce a slice plan first.`,
        `Expected: ${join(projectDir, ".gsd", "milestones", milestoneId, "slices", sliceId, `${sliceId}-PLAN.md`)}`,
      ],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
  log(`  ✓ PLAN.md found for slice ${sliceId}: ${planPath}`);

  // Verify incomplete tasks exist
  if (allTasksDone(projectDir)) {
    log("  ⚠ All tasks already done — execute phase may route to complete-slice");
  } else {
    log("  ✓ Incomplete tasks found — ready for execution");
  }

  // Check if SUMMARY.md already exists (idempotent guard)
  if (hasSliceSummaryForSlice(projectDir, milestoneId, sliceId)) {
    log("  ⚠ SUMMARY.md already exists for active slice — returning success");
    return {
      phase: "execute",
      status: "success",
      artifacts: collectExecuteArtifacts(projectDir),
      events: { total: 0, byType: {} },
      errors: [],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }

  // Resolve CLI path
  const cliPath = join(repoRoot, "dist", "cli.js");
  if (!existsSync(cliPath)) {
    return {
      phase: "execute",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: [`CLI not found at ${cliPath}. Run 'npm run build' first.`],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
  log(`  ✓ CLI found at ${cliPath}`);

  // ── RPC session ────────────────────────────────────────────────────────

  const tracker = createEventTracker();
  const injector = answers
    ? createAnswerInjector(answers)
    : createAnswerInjector({
        questions: {},
        secrets: {},
        defaults: { strategy: "first_option" },
      });

  const client = new RpcClient({
    cliPath,
    cwd: projectDir,
  });

  let stdinWriter: ((data: string) => void) | null = null;

  // Wire event handlers — includes NDJSON stderr streaming
  client.onEvent((event: any) => {
    const eventObj = event as Record<string, unknown>;
    tracker.track(eventObj);

    // NDJSON stderr streaming — every event as a typed JSON line
    streamEventToStderr(eventObj);

    // Wire answer injector for extension_ui_request
    if (eventObj.type === "extension_ui_request" && stdinWriter) {
      const consumed = injector.handleEvent(eventObj, stdinWriter);
      if (!consumed) {
        log(
          `  [WARN] Unhandled extension_ui_request method=${eventObj.method}, sending empty response`,
        );
        stdinWriter(
          serializeJsonLine({
            type: "extension_ui_response",
            id: eventObj.id,
            value: "",
          }),
        );
      }
    }

    // Let injector observe tool_execution_start for phase-1 correlation
    if (eventObj.type === "tool_execution_start" && stdinWriter) {
      injector.handleEvent(eventObj, stdinWriter);
    }
  });

  try {
    await client.start();
    log("  ✓ RPC session started");

    const internalProcess = (client as any).process as import("node:child_process").ChildProcess;
    if (!internalProcess?.stdin) {
      throw new Error(
        "Cannot access child process stdin for extension_ui_response",
      );
    }
    stdinWriter = (data: string) => {
      internalProcess.stdin!.write(data);
    };

    // ── Dispatch /gsd auto ─────────────────────────────────────────────

    log("  Dispatching /gsd auto...");

    let completionResolve: (() => void) | null = null;
    let completionReject: ((err: Error) => void) | null = null;
    let sessionTerminated = false;

    const completionPromise = new Promise<void>((resolve, reject) => {
      completionResolve = resolve;
      completionReject = reject;
    });

    // Timeout handler
    const timeoutTimer = setTimeout(() => {
      if (sessionTerminated) return;
      const summary = tracker.getSummary();
      log(`\n  [execute] TIMEOUT after ${timeoutMs / 1000}s`);
      log("  Last events:");
      for (const e of summary.lastEvents) {
        log(`    ${e.type}${e.detail ? `: ${e.detail}` : ""}`);
      }
      log(`\n  Stderr (last 2000 chars):\n${client.getStderr().slice(-2000)}`);
      completionReject!(
        new Error(`Timeout after ${timeoutMs / 1000}s waiting for execute completion`),
      );
    }, timeoutMs);

    // TERMINATION GUARD: Watch for slice SUMMARY.md on each agent_end.
    // Execute phase completes when complete-slice produces SUMMARY.md.
    let executeAgentEndCount = 0;

    client.onEvent((event: any) => {
      if (event.type === "agent_end" && !sessionTerminated) {
        executeAgentEndCount++;
        log(`  [execute] agent_end #${executeAgentEndCount} received`);

        setTimeout(async () => {
          if (sessionTerminated) return;

          if (hasSliceSummaryForSlice(projectDir, milestoneId, sliceId)) {
            sessionTerminated = true;
            log("  [execute] SUMMARY.md detected — terminating session");
            clearTimeout(timeoutTimer);

            try {
              await client.stop();
              log("  [execute] ✓ Session terminated cleanly");
            } catch (stopErr: any) {
              log(`  [execute] [WARN] Session stop error (non-fatal): ${stopErr.message}`);
            }

            completionResolve!();
          } else {
            log(`  [execute] SUMMARY.md not yet produced after agent_end #${executeAgentEndCount}`);
          }
        }, 1500);
      }
    });

    await client.prompt("/gsd auto");
    log("  ✓ /gsd auto dispatched");

    log("  Waiting for execute phase to complete (tasks → complete-slice)...");
    await completionPromise;

    // Collect artifacts
    const artifacts = collectExecuteArtifacts(projectDir);
    const summary = tracker.getSummary();
    const stats = injector.getStats();

    log("\n  --- Execute Phase Summary ---");
    log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    log(`  Events: ${summary.total}`);
    log(`  Tool calls: ${summary.toolUseCount}`);
    log(`  Agent turns: ${executeAgentEndCount}`);
    log(`  Artifacts: ${artifacts.map((a) => a.relativePath).join(", ")}`);
    log(`  Injector: ${stats.questionsAnswered} answered, ${stats.questionsDefaulted} defaulted`);

    return {
      phase: "execute",
      status: "success",
      artifacts,
      events: {
        total: summary.total,
        byType: summary.byType,
      },
      errors: summary.errors,
      durationMs: Date.now() - startTime,
      projectDir,
    };
  } catch (error) {
    const summary = tracker.getSummary();
    const stats = injector.getStats();

    log("\n  --- Execute Phase FAILED ---");
    log(
      `  Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    log(`  Injector stats: ${JSON.stringify(stats)}`);
    log(`  Last events:`);
    for (const e of summary.lastEvents) {
      log(`    ${e.type}${e.detail ? `: ${e.detail}` : ""}`);
    }
    log(`  Stderr (last 2000 chars):\n${client.getStderr().slice(-2000)}`);

    if (!sessionTerminated) {
      try {
        await client.stop();
      } catch {
        // Best effort
      }
    }

    const isTimeout =
      error instanceof Error && error.message.includes("Timeout");

    return {
      phase: "execute",
      status: isTimeout ? "timeout" : "failure",
      artifacts: collectExecuteArtifacts(projectDir),
      events: {
        total: summary.total,
        byType: summary.byType,
      },
      errors: [error instanceof Error ? error.message : String(error)],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
}

// ── Verify Phase ─────────────────────────────────────────────────────────────
// Dispatches `/gsd auto` when tasks are done — auto-mode routes to
// complete-slice. Terminates when SUMMARY.md + UAT.md appear.

async function runVerifyPhase(
  projectDir: string,
  repoRoot: string,
  answers?: AnswerFile,
): Promise<PhaseResult> {
  const startTime = Date.now();

  log("\n[verify] Starting verify phase...");
  log(`  Project dir: ${projectDir}`);

  // ── Pre-flight validation ──────────────────────────────────────────────

  const milestoneId = getActiveMilestoneId(projectDir);
  if (!milestoneId) {
    return {
      phase: "verify",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: ["No milestone with ROADMAP.md found."],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }

  const sliceId = getActiveSliceId(projectDir);
  if (!sliceId) {
    return {
      phase: "verify",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: ["No incomplete slice found in ROADMAP.md."],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }

  // SUMMARY.md already exists → return success immediately (idempotent)
  if (
    hasSliceSummaryForSlice(projectDir, milestoneId, sliceId) &&
    hasUatFile(projectDir, milestoneId, sliceId)
  ) {
    log("  ⚠ SUMMARY.md + UAT.md already exist — returning success");
    return {
      phase: "verify",
      status: "success",
      artifacts: collectVerifyArtifacts(projectDir),
      events: { total: 0, byType: {} },
      errors: [],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }

  // All tasks must be done for verify to proceed
  if (!allTasksDone(projectDir)) {
    return {
      phase: "verify",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: [
        `Not all tasks are complete in slice ${sliceId}. The execute phase must finish all tasks first.`,
        `Check: ${join(projectDir, ".gsd", "milestones", milestoneId, "slices", sliceId, `${sliceId}-PLAN.md`)}`,
      ],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
  log(`  ✓ All tasks done in slice ${sliceId}`);

  // Resolve CLI path
  const cliPath = join(repoRoot, "dist", "cli.js");
  if (!existsSync(cliPath)) {
    return {
      phase: "verify",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: [`CLI not found at ${cliPath}. Run 'npm run build' first.`],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
  log(`  ✓ CLI found at ${cliPath}`);

  // ── RPC session ────────────────────────────────────────────────────────

  const tracker = createEventTracker();
  const injector = answers
    ? createAnswerInjector(answers)
    : createAnswerInjector({
        questions: {},
        secrets: {},
        defaults: { strategy: "first_option" },
      });

  const client = new RpcClient({
    cliPath,
    cwd: projectDir,
  });

  let stdinWriter: ((data: string) => void) | null = null;

  // Wire event handlers — includes NDJSON stderr streaming
  client.onEvent((event: any) => {
    const eventObj = event as Record<string, unknown>;
    tracker.track(eventObj);

    // NDJSON stderr streaming
    streamEventToStderr(eventObj);

    if (eventObj.type === "extension_ui_request" && stdinWriter) {
      const consumed = injector.handleEvent(eventObj, stdinWriter);
      if (!consumed) {
        log(
          `  [WARN] Unhandled extension_ui_request method=${eventObj.method}, sending empty response`,
        );
        stdinWriter(
          serializeJsonLine({
            type: "extension_ui_response",
            id: eventObj.id,
            value: "",
          }),
        );
      }
    }

    if (eventObj.type === "tool_execution_start" && stdinWriter) {
      injector.handleEvent(eventObj, stdinWriter);
    }
  });

  try {
    await client.start();
    log("  ✓ RPC session started");

    const internalProcess = (client as any).process as import("node:child_process").ChildProcess;
    if (!internalProcess?.stdin) {
      throw new Error(
        "Cannot access child process stdin for extension_ui_response",
      );
    }
    stdinWriter = (data: string) => {
      internalProcess.stdin!.write(data);
    };

    log("  Dispatching /gsd auto...");

    let completionResolve: (() => void) | null = null;
    let completionReject: ((err: Error) => void) | null = null;
    let sessionTerminated = false;

    const completionPromise = new Promise<void>((resolve, reject) => {
      completionResolve = resolve;
      completionReject = reject;
    });

    const timeoutTimer = setTimeout(() => {
      if (sessionTerminated) return;
      const summary = tracker.getSummary();
      log(`\n  [verify] TIMEOUT after ${TIMEOUT_MS / 1000}s`);
      log("  Last events:");
      for (const e of summary.lastEvents) {
        log(`    ${e.type}${e.detail ? `: ${e.detail}` : ""}`);
      }
      log(`\n  Stderr (last 2000 chars):\n${client.getStderr().slice(-2000)}`);
      completionReject!(
        new Error(`Timeout after ${TIMEOUT_MS / 1000}s waiting for verify completion`),
      );
    }, TIMEOUT_MS);

    // TERMINATION GUARD: Watch for SUMMARY.md + UAT.md
    let verifyAgentEndCount = 0;

    client.onEvent((event: any) => {
      if (event.type === "agent_end" && !sessionTerminated) {
        verifyAgentEndCount++;
        log(`  [verify] agent_end #${verifyAgentEndCount} received`);

        setTimeout(async () => {
          if (sessionTerminated) return;

          const hasSummary = hasSliceSummaryForSlice(projectDir, milestoneId, sliceId);
          const hasUat = hasUatFile(projectDir, milestoneId, sliceId);

          if (hasSummary && hasUat) {
            sessionTerminated = true;
            log("  [verify] SUMMARY.md + UAT.md detected — terminating session");
            clearTimeout(timeoutTimer);

            try {
              await client.stop();
              log("  [verify] ✓ Session terminated cleanly");
            } catch (stopErr: any) {
              log(`  [verify] [WARN] Session stop error (non-fatal): ${stopErr.message}`);
            }

            completionResolve!();
          } else {
            log(`  [verify] Waiting — SUMMARY.md: ${hasSummary}, UAT.md: ${hasUat}`);
          }
        }, 1500);
      }
    });

    await client.prompt("/gsd auto");
    log("  ✓ /gsd auto dispatched");

    log("  Waiting for verify phase to complete (complete-slice)...");
    await completionPromise;

    const artifacts = collectVerifyArtifacts(projectDir);
    const summary = tracker.getSummary();
    const stats = injector.getStats();

    log("\n  --- Verify Phase Summary ---");
    log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    log(`  Events: ${summary.total}`);
    log(`  Tool calls: ${summary.toolUseCount}`);
    log(`  Agent turns: ${verifyAgentEndCount}`);
    log(`  Artifacts: ${artifacts.map((a) => a.relativePath).join(", ")}`);
    log(`  Injector: ${stats.questionsAnswered} answered, ${stats.questionsDefaulted} defaulted`);

    return {
      phase: "verify",
      status: "success",
      artifacts,
      events: {
        total: summary.total,
        byType: summary.byType,
      },
      errors: summary.errors,
      durationMs: Date.now() - startTime,
      projectDir,
    };
  } catch (error) {
    const summary = tracker.getSummary();
    const stats = injector.getStats();

    log("\n  --- Verify Phase FAILED ---");
    log(
      `  Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    log(`  Injector stats: ${JSON.stringify(stats)}`);
    log(`  Last events:`);
    for (const e of summary.lastEvents) {
      log(`    ${e.type}${e.detail ? `: ${e.detail}` : ""}`);
    }
    log(`  Stderr (last 2000 chars):\n${client.getStderr().slice(-2000)}`);

    if (!sessionTerminated) {
      try {
        await client.stop();
      } catch {
        // Best effort
      }
    }

    const isTimeout =
      error instanceof Error && error.message.includes("Timeout");

    return {
      phase: "verify",
      status: isTimeout ? "timeout" : "failure",
      artifacts: collectVerifyArtifacts(projectDir),
      events: {
        total: summary.total,
        byType: summary.byType,
      },
      errors: [error instanceof Error ? error.message : String(error)],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
}

// ── Advance Phase ────────────────────────────────────────────────────────────
// Dispatches `/gsd auto` after slice completion. Auto-mode handles
// merge + reassess-roadmap. Terminates when ASSESSMENT.md appears.

async function runAdvancePhase(
  projectDir: string,
  repoRoot: string,
  answers?: AnswerFile,
): Promise<PhaseResult> {
  const startTime = Date.now();

  log("\n[advance] Starting advance phase...");
  log(`  Project dir: ${projectDir}`);

  // ── Pre-flight validation ──────────────────────────────────────────────

  const milestoneId = getActiveMilestoneId(projectDir);
  if (!milestoneId) {
    return {
      phase: "advance",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: ["No milestone with ROADMAP.md found."],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }

  const sliceId = getActiveSliceId(projectDir);

  // For advance, we need SUMMARY.md to exist. Check the active slice
  // or the last slice if all are complete.
  let summarySliceId = sliceId;
  if (!summarySliceId) {
    // All slices might be marked complete — find the last one
    const slicesDir = join(projectDir, ".gsd", "milestones", milestoneId, "slices");
    if (existsSync(slicesDir)) {
      const allSlices = readdirSync(slicesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
      summarySliceId = allSlices[allSlices.length - 1] ?? null;
    }
  }

  if (!summarySliceId) {
    return {
      phase: "advance",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: ["No slices found in the milestone."],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }

  if (!hasSliceSummaryForSlice(projectDir, milestoneId, summarySliceId)) {
    return {
      phase: "advance",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: [
        `No SUMMARY.md found for slice ${summarySliceId} in milestone ${milestoneId}. The verify/execute phase must produce a summary first.`,
        `Expected: ${join(projectDir, ".gsd", "milestones", milestoneId, "slices", summarySliceId, `${summarySliceId}-SUMMARY.md`)}`,
      ],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
  log(`  ✓ SUMMARY.md found for slice ${summarySliceId}`);

  // Idempotent guard: if ASSESSMENT.md already exists, return success
  if (hasAssessmentFile(projectDir)) {
    log("  ⚠ ASSESSMENT.md already exists — returning success");
    return {
      phase: "advance",
      status: "success",
      artifacts: collectAdvanceArtifacts(projectDir),
      events: { total: 0, byType: {} },
      errors: [],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }

  // Resolve CLI path
  const cliPath = join(repoRoot, "dist", "cli.js");
  if (!existsSync(cliPath)) {
    return {
      phase: "advance",
      status: "failure",
      artifacts: [],
      events: { total: 0, byType: {} },
      errors: [`CLI not found at ${cliPath}. Run 'npm run build' first.`],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
  log(`  ✓ CLI found at ${cliPath}`);

  // ── RPC session ────────────────────────────────────────────────────────

  const tracker = createEventTracker();
  const injector = answers
    ? createAnswerInjector(answers)
    : createAnswerInjector({
        questions: {},
        secrets: {},
        defaults: { strategy: "first_option" },
      });

  const client = new RpcClient({
    cliPath,
    cwd: projectDir,
  });

  let stdinWriter: ((data: string) => void) | null = null;

  // Wire event handlers — includes NDJSON stderr streaming
  client.onEvent((event: any) => {
    const eventObj = event as Record<string, unknown>;
    tracker.track(eventObj);

    // NDJSON stderr streaming
    streamEventToStderr(eventObj);

    if (eventObj.type === "extension_ui_request" && stdinWriter) {
      const consumed = injector.handleEvent(eventObj, stdinWriter);
      if (!consumed) {
        log(
          `  [WARN] Unhandled extension_ui_request method=${eventObj.method}, sending empty response`,
        );
        stdinWriter(
          serializeJsonLine({
            type: "extension_ui_response",
            id: eventObj.id,
            value: "",
          }),
        );
      }
    }

    if (eventObj.type === "tool_execution_start" && stdinWriter) {
      injector.handleEvent(eventObj, stdinWriter);
    }
  });

  try {
    await client.start();
    log("  ✓ RPC session started");

    const internalProcess = (client as any).process as import("node:child_process").ChildProcess;
    if (!internalProcess?.stdin) {
      throw new Error(
        "Cannot access child process stdin for extension_ui_response",
      );
    }
    stdinWriter = (data: string) => {
      internalProcess.stdin!.write(data);
    };

    log("  Dispatching /gsd auto...");

    let completionResolve: (() => void) | null = null;
    let completionReject: ((err: Error) => void) | null = null;
    let sessionTerminated = false;

    const completionPromise = new Promise<void>((resolve, reject) => {
      completionResolve = resolve;
      completionReject = reject;
    });

    const timeoutTimer = setTimeout(() => {
      if (sessionTerminated) return;
      const summary = tracker.getSummary();
      log(`\n  [advance] TIMEOUT after ${TIMEOUT_MS / 1000}s`);
      log("  Last events:");
      for (const e of summary.lastEvents) {
        log(`    ${e.type}${e.detail ? `: ${e.detail}` : ""}`);
      }
      log(`\n  Stderr (last 2000 chars):\n${client.getStderr().slice(-2000)}`);
      completionReject!(
        new Error(`Timeout after ${TIMEOUT_MS / 1000}s waiting for advance completion`),
      );
    }, TIMEOUT_MS);

    // TERMINATION GUARD: Watch for ASSESSMENT.md
    let advanceAgentEndCount = 0;

    client.onEvent((event: any) => {
      if (event.type === "agent_end" && !sessionTerminated) {
        advanceAgentEndCount++;
        log(`  [advance] agent_end #${advanceAgentEndCount} received`);

        setTimeout(async () => {
          if (sessionTerminated) return;

          if (hasAssessmentFile(projectDir)) {
            sessionTerminated = true;
            log("  [advance] ASSESSMENT.md detected — terminating session");
            clearTimeout(timeoutTimer);

            try {
              await client.stop();
              log("  [advance] ✓ Session terminated cleanly");
            } catch (stopErr: any) {
              log(`  [advance] [WARN] Session stop error (non-fatal): ${stopErr.message}`);
            }

            completionResolve!();
          } else {
            log(`  [advance] ASSESSMENT.md not yet produced after agent_end #${advanceAgentEndCount}`);
          }
        }, 1500);
      }
    });

    await client.prompt("/gsd auto");
    log("  ✓ /gsd auto dispatched");

    log("  Waiting for advance phase to complete (merge + reassess)...");
    await completionPromise;

    const artifacts = collectAdvanceArtifacts(projectDir);
    const summary = tracker.getSummary();
    const stats = injector.getStats();

    log("\n  --- Advance Phase Summary ---");
    log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    log(`  Events: ${summary.total}`);
    log(`  Tool calls: ${summary.toolUseCount}`);
    log(`  Agent turns: ${advanceAgentEndCount}`);
    log(`  Artifacts: ${artifacts.map((a) => a.relativePath).join(", ")}`);
    log(`  Injector: ${stats.questionsAnswered} answered, ${stats.questionsDefaulted} defaulted`);

    return {
      phase: "advance",
      status: "success",
      artifacts,
      events: {
        total: summary.total,
        byType: summary.byType,
      },
      errors: summary.errors,
      durationMs: Date.now() - startTime,
      projectDir,
    };
  } catch (error) {
    const summary = tracker.getSummary();
    const stats = injector.getStats();

    log("\n  --- Advance Phase FAILED ---");
    log(
      `  Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    log(`  Injector stats: ${JSON.stringify(stats)}`);
    log(`  Last events:`);
    for (const e of summary.lastEvents) {
      log(`    ${e.type}${e.detail ? `: ${e.detail}` : ""}`);
    }
    log(`  Stderr (last 2000 chars):\n${client.getStderr().slice(-2000)}`);

    if (!sessionTerminated) {
      try {
        await client.stop();
      } catch {
        // Best effort
      }
    }

    const isTimeout =
      error instanceof Error && error.message.includes("Timeout");

    return {
      phase: "advance",
      status: isTimeout ? "timeout" : "failure",
      artifacts: collectAdvanceArtifacts(projectDir),
      events: {
        total: summary.total,
        byType: summary.byType,
      },
      errors: [error instanceof Error ? error.message : String(error)],
      durationMs: Date.now() - startTime,
      projectDir,
    };
  }
}

// ── Dry Run ─────────────────────────────────────────────────────────────────

async function runDryRun(args: CliArgs): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const repoRoot = join(__dirname, "..", "..", "..", "..", "..", "..");

  log("=== Phase Command — Dry Run ===\n");

  // Validate imports
  log("[1/4] Validating imports...");
  log("  ✓ RpcClient imported");
  log("  ✓ parseAnswerFile imported");
  log("  ✓ createAnswerInjector imported");
  log("  ✓ PhaseResult / printPhaseResult imported");

  if (args.phase === "discuss") {
    // Validate input file
    log("\n[2/4] Validating input file...");
    const inputPath = resolve(args.inputPath!);
    const input = loadDiscussInput(inputPath);
    log(`  ✓ Input file loaded: ${inputPath}`);
    log(`  ✓ Description: "${input.description.slice(0, 80)}..."`);
    log(
      `  ✓ Answer questions defined: ${Object.keys(input.answers.questions).length}`,
    );
    log(
      `  ✓ Answer secrets defined: ${Object.keys(input.answers.secrets).length} (key names only)`,
    );
    log(`  ✓ Default strategy: ${input.answers.defaults.strategy}`);

    // Validate answer file with parseAnswerFile
    log("\n[3/4] Validating answer file schema...");
    const rawInput = JSON.parse(readFileSync(inputPath, "utf-8"));
    parseAnswerFile(rawInput.answers);
    log("  ✓ parseAnswerFile() validation passed");

    // Test injector creation
    const injector = createAnswerInjector(input.answers);
    const stats = injector.getStats();
    log("  ✓ createAnswerInjector() created successfully");
    log(`  ✓ Initial stats: ${JSON.stringify(stats)}`);

    // Validate fixture creation
    log("\n[4/4] Validating fixture creation...");
    const fixtureDir = createDiscussFixture();
    log(`  ✓ Temp fixture created: ${fixtureDir}`);

    // Check fixture structure
    const expectedDirs = [".gsd", ".gsd/milestones/M001"];
    for (const dir of expectedDirs) {
      const fullPath = join(fixtureDir, dir);
      if (existsSync(fullPath)) {
        log(`  ✓ ${dir}/`);
      } else {
        log(`  ✗ Missing: ${dir}/`);
      }
    }

    const expectedFiles = [".gsd/PROJECT.md"];
    for (const file of expectedFiles) {
      const fullPath = join(fixtureDir, file);
      if (existsSync(fullPath)) {
        log(`  ✓ ${file}`);
      } else {
        log(`  ✗ Missing: ${file}`);
      }
    }

    // Check CLI exists
    const cliPath = join(repoRoot, "dist", "cli.js");
    if (existsSync(cliPath)) {
      log(`  ✓ CLI found at ${cliPath}`);
    } else {
      log(`  ⚠ CLI not found at ${cliPath} (needed for live run)`);
    }

    // Cleanup
    try {
      rmSync(fixtureDir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  } else if (args.phase === "plan") {
    // Plan phase dry run
    log("\n[2/4] Validating project directory...");
    const projectDir = resolve(args.projectDir!);
    if (!existsSync(projectDir)) {
      log(`  ✗ Project directory not found: ${projectDir}`);
      process.exit(1);
    }
    log(`  ✓ Project directory exists: ${projectDir}`);

    // Check for CONTEXT.md
    if (hasContextFile(projectDir)) {
      log("  ✓ CONTEXT.md found (ready for planning)");
    } else {
      log("  ✗ No CONTEXT.md found (discuss phase must run first)");
    }

    // Check for existing ROADMAP.md (already planned?)
    if (hasRoadmapFile(projectDir)) {
      log("  ⚠ ROADMAP.md already exists (plan phase may already be complete)");
    } else {
      log("  ✓ No ROADMAP.md yet (plan phase will produce one)");
    }

    log("\n[3/4] Validating answer injector...");
    if (args.inputPath) {
      const inputPath = resolve(args.inputPath);
      const input = loadDiscussInput(inputPath);
      const injector = createAnswerInjector(input.answers);
      const stats = injector.getStats();
      log(`  ✓ Answer injector created from ${inputPath}`);
      log(`  ✓ Initial stats: ${JSON.stringify(stats)}`);
    } else {
      // Create default injector (plan usually doesn't need answers)
      const injector = createAnswerInjector({
        questions: {},
        secrets: {},
        defaults: { strategy: "first_option" },
      });
      const stats = injector.getStats();
      log("  ✓ Default answer injector created (first_option fallback)");
      log(`  ✓ Initial stats: ${JSON.stringify(stats)}`);
    }

    log("\n[4/4] CLI check...");
    const cliPath = join(repoRoot, "dist", "cli.js");
    if (existsSync(cliPath)) {
      log(`  ✓ CLI found at ${cliPath}`);
    } else {
      log(`  ⚠ CLI not found at ${cliPath} (needed for live run)`);
    }
  } else if (args.phase === "execute") {
    // Execute phase dry run
    log("\n[2/4] Validating project directory & pre-flight...");
    const projectDir = resolve(args.projectDir!);
    if (!existsSync(projectDir)) {
      log(`  ✗ Project directory not found: ${projectDir}`);
      process.exit(1);
    }
    log(`  ✓ Project directory exists: ${projectDir}`);

    const milestoneId = getActiveMilestoneId(projectDir);
    if (milestoneId) {
      log(`  ✓ Active milestone: ${milestoneId}`);
    } else {
      log("  ✗ No milestone with ROADMAP.md found");
      process.exit(1);
    }

    const sliceId = getActiveSliceId(projectDir);
    if (sliceId) {
      log(`  ✓ Active slice: ${sliceId}`);
    } else {
      log("  ✗ No incomplete slice found in ROADMAP.md");
      process.exit(1);
    }

    const planPath = getActiveSlicePlanPath(projectDir);
    if (planPath) {
      log(`  ✓ Slice PLAN.md found: ${planPath}`);
    } else {
      log(`  ✗ No PLAN.md found for slice ${sliceId}`);
      process.exit(1);
    }

    if (allTasksDone(projectDir)) {
      log("  ⚠ All tasks already done (execute will route to complete-slice)");
    } else {
      log("  ✓ Incomplete tasks found — ready for execution");
    }

    if (hasSliceSummaryForSlice(projectDir, milestoneId!, sliceId!)) {
      log("  ⚠ SUMMARY.md already exists (execute phase already complete)");
    } else {
      log("  ✓ No SUMMARY.md yet (execute phase will produce one)");
    }

    log("\n[3/4] Validating NDJSON streaming...");
    // Verify streamEventToStderr works by writing a test event
    const testEvent = { type: "dry_run_test", phase: "execute", timestamp: Date.now() };
    streamEventToStderr(testEvent);
    log("  ✓ NDJSON streaming function operational (test event written to stderr)");

    log("\n[4/4] CLI check...");
    const cliPath = join(repoRoot, "dist", "cli.js");
    if (existsSync(cliPath)) {
      log(`  ✓ CLI found at ${cliPath}`);
    } else {
      log(`  ⚠ CLI not found at ${cliPath} (needed for live run)`);
    }
  } else if (args.phase === "verify") {
    // Verify phase dry run
    log("\n[2/4] Validating project directory & pre-flight...");
    const projectDir = resolve(args.projectDir!);
    if (!existsSync(projectDir)) {
      log(`  ✗ Project directory not found: ${projectDir}`);
      process.exit(1);
    }
    log(`  ✓ Project directory exists: ${projectDir}`);

    const milestoneId = getActiveMilestoneId(projectDir);
    if (milestoneId) {
      log(`  ✓ Active milestone: ${milestoneId}`);
    } else {
      log("  ✗ No milestone with ROADMAP.md found");
      process.exit(1);
    }

    const sliceId = getActiveSliceId(projectDir);
    if (sliceId) {
      log(`  ✓ Active slice: ${sliceId}`);
    } else {
      log("  ✗ No incomplete slice found in ROADMAP.md");
      process.exit(1);
    }

    if (allTasksDone(projectDir)) {
      log("  ✓ All tasks done — ready for verification");
    } else {
      log("  ✗ Not all tasks are complete (execute phase must finish first)");
      process.exit(1);
    }

    log("\n[3/4] Validating NDJSON streaming...");
    const testEvent = { type: "dry_run_test", phase: "verify", timestamp: Date.now() };
    streamEventToStderr(testEvent);
    log("  ✓ NDJSON streaming function operational (test event written to stderr)");

    log("\n[4/4] CLI check...");
    const cliPath = join(repoRoot, "dist", "cli.js");
    if (existsSync(cliPath)) {
      log(`  ✓ CLI found at ${cliPath}`);
    } else {
      log(`  ⚠ CLI not found at ${cliPath} (needed for live run)`);
    }
  } else if (args.phase === "advance") {
    // Advance phase dry run
    log("\n[2/4] Validating project directory & pre-flight...");
    const projectDir = resolve(args.projectDir!);
    if (!existsSync(projectDir)) {
      log(`  ✗ Project directory not found: ${projectDir}`);
      process.exit(1);
    }
    log(`  ✓ Project directory exists: ${projectDir}`);

    const milestoneId = getActiveMilestoneId(projectDir);
    if (milestoneId) {
      log(`  ✓ Active milestone: ${milestoneId}`);
    } else {
      log("  ✗ No milestone with ROADMAP.md found");
      process.exit(1);
    }

    // Find the relevant slice for SUMMARY.md check
    const sliceId = getActiveSliceId(projectDir);
    let summarySliceId = sliceId;
    if (!summarySliceId) {
      const slicesDir = join(projectDir, ".gsd", "milestones", milestoneId!, "slices");
      if (existsSync(slicesDir)) {
        const allSlices = readdirSync(slicesDir, { withFileTypes: true })
          .filter((d: any) => d.isDirectory())
          .map((d: any) => d.name)
          .sort();
        summarySliceId = allSlices[allSlices.length - 1] ?? null;
      }
    }

    if (summarySliceId) {
      log(`  ✓ Checking slice: ${summarySliceId}`);
      if (hasSliceSummaryForSlice(projectDir, milestoneId!, summarySliceId)) {
        log("  ✓ SUMMARY.md found — ready for advance");
      } else {
        log(`  ✗ No SUMMARY.md found for slice ${summarySliceId} (verify/execute must run first)`);
        process.exit(1);
      }
    } else {
      log("  ✗ No slices found in milestone");
      process.exit(1);
    }

    if (hasAssessmentFile(projectDir)) {
      log("  ⚠ ASSESSMENT.md already exists (advance phase already complete)");
    } else {
      log("  ✓ No ASSESSMENT.md yet (advance phase will produce one)");
    }

    log("\n[3/4] Validating NDJSON streaming...");
    const testEvent = { type: "dry_run_test", phase: "advance", timestamp: Date.now() };
    streamEventToStderr(testEvent);
    log("  ✓ NDJSON streaming function operational (test event written to stderr)");

    log("\n[4/4] CLI check...");
    const cliPath = join(repoRoot, "dist", "cli.js");
    if (existsSync(cliPath)) {
      log(`  ✓ CLI found at ${cliPath}`);
    } else {
      log(`  ⚠ CLI not found at ${cliPath} (needed for live run)`);
    }
  }

  log("\n[dry-run] All checks passed.\n");
  process.exit(0);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Resolve gsd-2 repo root (6 levels up from tests/integration/)
  const repoRoot = join(__dirname, "..", "..", "..", "..", "..", "..");

  const args = parseArgs();

  // Dry run mode
  if (args.dryRun) {
    await runDryRun(args);
    return;
  }

  log("=== Phase Command ===\n");
  log(`Phase: ${args.phase}`);

  // Validate auth
  log("\nValidating environment...");
  if (!validateAuth()) {
    log("  FAIL: No auth available. Need either:");
    log("    - OAuth credentials in ~/.gsd/agent/auth.json");
    log("    - ANTHROPIC_API_KEY environment variable");
    log("  Hint: use --dry-run to validate without auth.");
    process.exit(1);
  }

  if (args.phase === "discuss") {
    // Load and validate input
    const inputPath = resolve(args.inputPath!);
    const input = loadDiscussInput(inputPath);

    // Create or use project directory
    let projectDir: string;
    let ownsProjectDir = false;

    if (args.projectDir) {
      projectDir = resolve(args.projectDir);
      if (!existsSync(projectDir)) {
        log(
          `Error: Project directory not found: ${projectDir}`,
        );
        process.exit(1);
      }
    } else {
      // Create temp directory with fixture
      projectDir = createDiscussFixture();
      ownsProjectDir = true;
      log(`  Created temp project dir: ${projectDir}`);
    }

    // Run discuss phase
    const result = await runDiscussPhase(input, projectDir, repoRoot);

    // Emit structured JSON to stdout
    printPhaseResult(result);

    // On failure and if we own the temp dir, report but don't cleanup
    // so artifacts can be inspected
    if (result.status !== "success" && ownsProjectDir) {
      log(
        `\n  [info] Temp project dir preserved for inspection: ${projectDir}`,
      );
    }

    process.exit(result.status === "success" ? 0 : 1);
  } else if (args.phase === "plan") {
    // Plan phase — validate project directory and run planning
    const projectDir = resolve(args.projectDir!);
    if (!existsSync(projectDir)) {
      log(`Error: Project directory not found: ${projectDir}`);

      const result: PhaseResult = {
        phase: "plan",
        status: "failure",
        artifacts: [],
        events: { total: 0, byType: {} },
        errors: [`Project directory not found: ${projectDir}`],
        durationMs: 0,
        projectDir,
      };

      printPhaseResult(result);
      process.exit(1);
    }

    // Load answer file if provided via --input (optional for plan)
    let answers: AnswerFile | undefined;
    if (args.inputPath) {
      const inputPath = resolve(args.inputPath);
      const input = loadDiscussInput(inputPath);
      answers = input.answers;
    }

    // Run plan phase
    const result = await runPlanPhase(projectDir, repoRoot, answers);

    // Emit structured JSON to stdout
    printPhaseResult(result);

    process.exit(result.status === "success" ? 0 : 1);
  } else if (args.phase === "execute" || args.phase === "verify" || args.phase === "advance") {
    // Execute/Verify/Advance phases — all require --project-dir
    const projectDir = resolve(args.projectDir!);
    if (!existsSync(projectDir)) {
      log(`Error: Project directory not found: ${projectDir}`);

      const result: PhaseResult = {
        phase: args.phase,
        status: "failure",
        artifacts: [],
        events: { total: 0, byType: {} },
        errors: [`Project directory not found: ${projectDir}`],
        durationMs: 0,
        projectDir,
      };

      printPhaseResult(result);
      process.exit(1);
    }

    // Load answer file if provided via --input (optional)
    let answers: AnswerFile | undefined;
    if (args.inputPath) {
      const inputPath = resolve(args.inputPath);
      const input = loadDiscussInput(inputPath);
      answers = input.answers;
    }

    // Dispatch to the appropriate phase runner
    let result: PhaseResult;
    if (args.phase === "execute") {
      result = await runExecutePhase(projectDir, repoRoot, answers);
    } else if (args.phase === "verify") {
      result = await runVerifyPhase(projectDir, repoRoot, answers);
    } else {
      result = await runAdvancePhase(projectDir, repoRoot, answers);
    }

    // Emit structured JSON to stdout
    printPhaseResult(result);

    process.exit(result.status === "success" ? 0 : 1);
  }
}

main().catch((err) => {
  log(`Unhandled error: ${err}`);
  process.exit(1);
});
