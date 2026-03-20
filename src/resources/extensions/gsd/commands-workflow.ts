/**
 * GSD Custom Workflow Commands — /gsd workflow
 *
 * Provides the CLI surface for custom YAML-defined workflows:
 *   new      — Start an LLM-assisted builder conversation
 *   run      — Create a run from a definition and start auto-mode
 *   list     — Show available definitions and active runs
 *   pause    — Pause the active custom workflow
 *   resume   — Resume a paused custom workflow
 *   validate — Check a YAML definition against the V1 schema
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { createRun, listRuns } from "./run-manager.js";
import { validateDefinition } from "./definition-loader.js";
import {
  startAuto,
  pauseAuto,
  isAutoActive,
  isAutoPaused,
  setActiveEngineId,
  getActiveEngineId,
} from "./auto.js";
import { loadPrompt } from "./prompt-loader.js";
import { gsdRoot } from "./paths.js";
import { readGraph } from "./graph.js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parse } from "yaml";
import { getErrorMessage } from "./error-utils.js";

// ─── Subcommand dispatch ─────────────────────────────────────────────────

export async function handleWorkflow(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const [subcommand = "", ...rest] = args.split(/\s+/);
  const subArgs = rest.join(" ");

  switch (subcommand) {
    case "new":
      await handleNew(ctx, pi);
      break;
    case "run":
      await handleRun(subArgs, ctx, pi);
      break;
    case "list":
      handleList(ctx);
      break;
    case "pause":
      await handlePause(ctx, pi);
      break;
    case "resume":
      await handleResume(ctx, pi);
      break;
    case "validate":
      handleValidate(subArgs, ctx);
      break;
    case "":
      showWorkflowUsage(ctx);
      break;
    default:
      ctx.ui.notify(
        `Unknown workflow subcommand "${subcommand}". Run /gsd workflow for usage.`,
        "warning",
      );
  }
}

// ─── /gsd workflow new ───────────────────────────────────────────────────

async function handleNew(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (isAutoActive()) {
    ctx.ui.notify(
      "Cannot start workflow builder while auto-mode is running.\nRun /gsd pause first.",
      "warning",
    );
    return;
  }

  const basePath = process.cwd();
  try {
    const prompt = loadPrompt("workflow-builder", {
      defsDir: join(gsdRoot(basePath), "workflow-defs"),
      schemaVersion: "1",
    });
    pi.sendMessage(
      { customType: "gsd-workflow-builder", content: prompt, display: false },
      { triggerTurn: true },
    );
  } catch (err) {
    ctx.ui.notify(
      `Failed to load workflow-builder prompt: ${getErrorMessage(err)}`,
      "error",
    );
  }
}

// ─── /gsd workflow run ───────────────────────────────────────────────────

async function handleRun(
  subArgs: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (isAutoActive()) {
    ctx.ui.notify(
      "Cannot start a workflow run while auto-mode is running.\nRun /gsd pause first.",
      "warning",
    );
    return;
  }

  // Parse: <name> [--param key=value ...]
  const tokens = subArgs.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    ctx.ui.notify(
      "Usage: /gsd workflow run <name> [--param key=value ...]",
      "warning",
    );
    return;
  }

  // First non-flag token is the definition name
  let definitionName = "";
  const params: Record<string, string> = {};

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "--param" && i + 1 < tokens.length) {
      const kv = tokens[i + 1];
      const eqIdx = kv.indexOf("=");
      if (eqIdx > 0) {
        params[kv.slice(0, eqIdx)] = kv.slice(eqIdx + 1);
      } else {
        ctx.ui.notify(
          `Invalid --param format: "${kv}". Expected key=value.`,
          "warning",
        );
        return;
      }
      i++; // skip the value token
    } else if (!definitionName) {
      definitionName = tokens[i];
    }
  }

  if (!definitionName) {
    ctx.ui.notify(
      "Usage: /gsd workflow run <name> [--param key=value ...]",
      "warning",
    );
    return;
  }

  const basePath = process.cwd();
  const root = gsdRoot(basePath);

  try {
    const hasParams = Object.keys(params).length > 0;
    const { runDir } = createRun(root, definitionName, undefined, hasParams ? params : undefined);

    setActiveEngineId("custom:" + runDir);
    ctx.ui.notify(
      `Created workflow run: ${basename(runDir)}${hasParams ? ` (${Object.keys(params).length} param override(s))` : ""}`,
      "info",
    );

    await startAuto(ctx, pi, basePath, false);
  } catch (err) {
    ctx.ui.notify(
      `Failed to create workflow run for "${definitionName}": ${getErrorMessage(err)}`,
      "error",
    );
  }
}

// ─── /gsd workflow list ──────────────────────────────────────────────────

function handleList(ctx: ExtensionCommandContext): void {
  const basePath = process.cwd();
  const root = gsdRoot(basePath);

  const lines: string[] = ["CUSTOM WORKFLOWS\n"];

  // ── Definitions ──
  const defsDir = join(root, "workflow-defs");
  const definitions: string[] = [];
  if (existsSync(defsDir)) {
    try {
      for (const entry of readdirSync(defsDir)) {
        if (entry.endsWith(".yaml")) {
          definitions.push(entry.replace(/\.yaml$/, ""));
        }
      }
    } catch { /* non-fatal */ }
  }

  if (definitions.length > 0) {
    lines.push("Definitions:");
    for (const name of definitions) {
      lines.push(`  • ${name}`);
    }
  } else {
    lines.push("Definitions: (none)");
  }

  // ── Active Runs ──
  lines.push("");
  const runs = listRuns(root);
  if (runs.length > 0) {
    lines.push("Runs:");
    for (const run of runs) {
      let statusStr = "";
      try {
        const graph = readGraph(run.runDir);
        const total = graph.steps.length;
        const done = graph.steps.filter(s => s.status === "complete").length;
        statusStr = ` — ${done}/${total} steps`;
      } catch {
        statusStr = " — (graph unreadable)";
      }
      lines.push(`  • ${run.runId}${statusStr}`);
    }
  } else {
    lines.push("Runs: (none)");
  }

  ctx.ui.notify(lines.join("\n"), "info");
}

// ─── /gsd workflow pause ─────────────────────────────────────────────────

async function handlePause(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (!isAutoActive() && !isAutoPaused()) {
    ctx.ui.notify("No active workflow to pause.", "info");
    return;
  }
  if (isAutoPaused()) {
    ctx.ui.notify("Workflow is already paused. /gsd workflow resume to continue.", "info");
    return;
  }
  await pauseAuto(ctx, pi);
}

// ─── /gsd workflow resume ────────────────────────────────────────────────

async function handleResume(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const basePath = process.cwd();

  if (isAutoActive()) {
    ctx.ui.notify("Workflow is already running.", "info");
    return;
  }

  if (isAutoPaused()) {
    // If we have a custom engine ID, just resume
    const engineId = getActiveEngineId();
    if (engineId?.startsWith("custom:")) {
      await startAuto(ctx, pi, basePath, false);
      return;
    }

    // Re-derive engine ID from most recent incomplete run
    const derivedId = deriveEngineIdFromRuns(basePath);
    if (derivedId) {
      setActiveEngineId(derivedId);
      ctx.ui.notify(`Re-derived workflow run: ${derivedId.replace("custom:", "")}`, "info");
      await startAuto(ctx, pi, basePath, false);
      return;
    }

    // Paused but no custom workflow found — might be standard auto-mode
    ctx.ui.notify(
      "No custom workflow run found to resume. Use /gsd auto to resume standard auto-mode.",
      "info",
    );
    return;
  }

  // Not paused and not active — try starting from the most recent incomplete run
  const derivedId = deriveEngineIdFromRuns(basePath);
  if (derivedId) {
    setActiveEngineId(derivedId);
    ctx.ui.notify(`Resuming workflow run: ${derivedId.replace("custom:", "")}`, "info");
    await startAuto(ctx, pi, basePath, false);
    return;
  }

  ctx.ui.notify("No active or paused workflow to resume.", "info");
}

// ─── /gsd workflow validate ──────────────────────────────────────────────

function handleValidate(subArgs: string, ctx: ExtensionCommandContext): void {
  const name = subArgs.trim();
  if (!name) {
    ctx.ui.notify(
      "Usage: /gsd workflow validate <name|path.yaml>",
      "warning",
    );
    return;
  }

  const basePath = process.cwd();
  let yamlContent: string;

  try {
    if (name.endsWith(".yaml")) {
      // Treat as a file path
      const filePath = existsSync(name) ? name : join(basePath, name);
      yamlContent = readFileSync(filePath, "utf-8");
    } else {
      // Look in workflow-defs/
      const defsDir = join(gsdRoot(basePath), "workflow-defs");
      const filePath = join(defsDir, `${name}.yaml`);
      yamlContent = readFileSync(filePath, "utf-8");
    }
  } catch (err) {
    ctx.ui.notify(
      `Cannot read definition: ${getErrorMessage(err)}`,
      "error",
    );
    return;
  }

  let parsed: unknown;
  try {
    parsed = parse(yamlContent);
  } catch (err) {
    ctx.ui.notify(
      `YAML parse error: ${getErrorMessage(err)}`,
      "error",
    );
    return;
  }

  const result = validateDefinition(parsed);
  if (result.valid) {
    ctx.ui.notify(`✓ Definition "${name}" is valid.`, "info");
  } else {
    const errLines = result.errors.map(e => `  • ${e}`);
    ctx.ui.notify(
      `✗ Definition "${name}" has ${result.errors.length} error(s):\n${errLines.join("\n")}`,
      "error",
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Scan workflow-runs/ for the most recent incomplete run and return
 * a "custom:<runDir>" engine ID, or null if none found.
 */
function deriveEngineIdFromRuns(basePath: string): string | null {
  const root = gsdRoot(basePath);
  const runs = listRuns(root);

  for (const run of runs) {
    try {
      const graph = readGraph(run.runDir);
      const allDone = graph.steps.every(s => s.status === "complete" || s.status === "expanded");
      if (!allDone) {
        return "custom:" + run.runDir;
      }
    } catch {
      // Skip unreadable runs
    }
  }

  return null;
}

function showWorkflowUsage(ctx: ExtensionCommandContext): void {
  ctx.ui.notify(
    [
      "Usage: /gsd workflow <subcommand>\n",
      "  new           Build a workflow definition via LLM conversation",
      "  run <name>    Start a workflow run  [--param key=value]",
      "  list          Show definitions and active runs",
      "  validate <n>  Check a YAML definition against the schema",
      "  pause         Pause the active workflow run",
      "  resume        Resume a paused workflow run",
    ].join("\n"),
    "info",
  );
}

// ─── Completions ─────────────────────────────────────────────────────────

export function getWorkflowCompletions(
  prefix: string,
): Array<{ value: string; label: string; description: string }> {
  const subcommands = [
    { cmd: "new", desc: "Build a workflow definition via LLM conversation" },
    { cmd: "run", desc: "Start a workflow run" },
    { cmd: "list", desc: "Show definitions and active runs" },
    { cmd: "validate", desc: "Check a YAML definition against the schema" },
    { cmd: "pause", desc: "Pause the active workflow run" },
    { cmd: "resume", desc: "Resume a paused workflow run" },
  ];

  const parts = prefix.trim().split(/\s+/);

  // Sub-subcommand completions for run/validate: show definition names
  if (parts.length >= 1 && (parts[0] === "run" || parts[0] === "validate")) {
    const namePrefix = parts[1] ?? "";
    return listDefinitionNames()
      .filter(n => n.startsWith(namePrefix))
      .map(n => ({
        value: `${parts[0]} ${n}`,
        label: n,
        description: `${parts[0] === "run" ? "Run" : "Validate"} ${n}`,
      }));
  }

  // Top-level subcommand completions
  const firstWord = parts[0] ?? "";
  return subcommands
    .filter(s => s.cmd.startsWith(firstWord))
    .map(s => ({
      value: s.cmd,
      label: s.cmd,
      description: s.desc,
    }));
}

/**
 * List .yaml definition names from workflow-defs/ for completions.
 */
function listDefinitionNames(): string[] {
  try {
    const basePath = process.cwd();
    const defsDir = join(gsdRoot(basePath), "workflow-defs");
    if (!existsSync(defsDir)) return [];
    return readdirSync(defsDir)
      .filter(f => f.endsWith(".yaml"))
      .map(f => f.replace(/\.yaml$/, ""));
  } catch {
    return [];
  }
}
