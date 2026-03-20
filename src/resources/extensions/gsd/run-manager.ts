/**
 * run-manager.ts — Run lifecycle manager for YAML-defined workflows.
 *
 * Creates immutable run directories by snapshotting a source YAML definition
 * (exact byte copy via copyFileSync per R007) and generating an initial
 * GRAPH.yaml with all steps in "pending" status.
 *
 * Also provides `listRuns()` to enumerate existing runs with metadata.
 *
 * Storage namespace: `workflow-runs/` under basePath (D005).
 */

import { loadDefinition } from "./definition-loader.js";
import type { WorkflowDefinition } from "./definition-loader.js";
import { graphFromDefinition, writeGraph } from "./graph.js";
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { randomBytes } from "node:crypto";

// ─── Types ───────────────────────────────────────────────────────────────

export interface RunInfo {
  /** Unique run identifier (directory name). */
  runId: string;
  /** Absolute path to the run directory. */
  runDir: string;
  /** Name from the workflow definition. */
  definitionName: string;
  /** ISO 8601 creation timestamp extracted from the runId. */
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const RUNS_DIR = "workflow-runs";

/**
 * Generate a compact ISO timestamp suitable for directory naming.
 * Format: 20260319T194500 (no colons, no dashes in time portion).
 */
function compactTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");
}

/**
 * Generate 4 random hex characters for collision avoidance.
 */
function randomSuffix(): string {
  return randomBytes(2).toString("hex");
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Create a new workflow run from a YAML definition.
 *
 * 1. Loads and validates the definition via `loadDefinition()`
 * 2. Creates a unique run directory under `<basePath>/workflow-runs/`
 * 3. Snapshots the source YAML as DEFINITION.yaml (exact byte copy — R007)
 * 4. Generates GRAPH.yaml with all steps in "pending" status
 *
 * @param basePath — root directory (e.g. `.gsd/`)
 * @param definitionName — definition filename without `.yaml` extension
 * @param defsDir — directory containing definitions (default: `<basePath>/workflow-defs`)
 * @returns RunInfo with the created run's ID and directory path
 * @throws Error if definition is missing, invalid, or directory creation fails
 */
export function createRun(
  basePath: string,
  definitionName: string,
  defsDir?: string,
  params?: Record<string, string>,
): { runId: string; runDir: string } {
  const resolvedDefsDir = defsDir ?? join(basePath, "workflow-defs");

  // Parse + validate
  const definition: WorkflowDefinition = loadDefinition(resolvedDefsDir, definitionName);

  // Generate unique run ID: <name>-<compact ISO>-<4 hex>
  const runId = `${definition.name}-${compactTimestamp()}-${randomSuffix()}`;
  const runsBase = join(basePath, RUNS_DIR);
  const runDir = join(runsBase, runId);

  // Create the run directory
  mkdirSync(runDir, { recursive: true });

  // Snapshot: exact byte copy of the source YAML (R007)
  const sourceFile = join(resolvedDefsDir, `${definitionName}.yaml`);
  copyFileSync(sourceFile, join(runDir, "DEFINITION.yaml"));

  // Generate initial GRAPH.yaml with all steps pending
  const graph = graphFromDefinition(definition);
  writeGraph(runDir, graph);

  // Persist CLI param overrides for dispatch-time substitution (R007: DEFINITION.yaml stays byte-exact)
  if (params && Object.keys(params).length > 0) {
    writeFileSync(join(runDir, "PARAMS.json"), JSON.stringify(params, null, 2) + "\n");
  }

  return { runId, runDir };
}

/**
 * List existing workflow runs under `<basePath>/workflow-runs/`.
 *
 * For each subdirectory containing a DEFINITION.yaml, parses the definition
 * to extract the workflow name and derives creation time from the runId.
 *
 * @param basePath — root directory (e.g. `.gsd/`)
 * @returns Array of RunInfo sorted by creation time (newest first).
 *          Returns empty array if `workflow-runs/` doesn't exist.
 */
export function listRuns(basePath: string): RunInfo[] {
  const runsBase = join(basePath, RUNS_DIR);

  if (!existsSync(runsBase)) {
    return [];
  }

  const entries = readdirSync(runsBase, { withFileTypes: true });
  const runs: RunInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const runDir = join(runsBase, entry.name);
    const defPath = join(runDir, "DEFINITION.yaml");

    if (!existsSync(defPath)) continue;

    try {
      const raw = readFileSync(defPath, "utf-8");
      const parsed = parse(raw) as { name?: string };
      const definitionName = typeof parsed?.name === "string" ? parsed.name : "unknown";

      // Extract timestamp from runId: <name>-<YYYYMMDDTHHMMSS>-<hex>
      // The timestamp is the second-to-last segment when split by the last two dashes.
      const parts = entry.name.split("-");
      let createdAt = new Date().toISOString();
      // Find the compact timestamp segment (format: YYYYMMDDTHHMMSS)
      for (const part of parts) {
        if (/^\d{8}T\d{6}$/.test(part)) {
          // Parse compact timestamp back to ISO
          const y = part.slice(0, 4);
          const mo = part.slice(4, 6);
          const d = part.slice(6, 8);
          const h = part.slice(9, 11);
          const mi = part.slice(11, 13);
          const s = part.slice(13, 15);
          createdAt = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
          break;
        }
      }

      runs.push({
        runId: entry.name,
        runDir,
        definitionName,
        createdAt,
      });
    } catch {
      // Skip directories with unparseable DEFINITION.yaml
      continue;
    }
  }

  // Sort newest first
  runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return runs;
}
