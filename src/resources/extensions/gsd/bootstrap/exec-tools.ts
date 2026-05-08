// GSD2 — Exec (context-mode) tool registration.
//
// Exposes the Context Mode runtime tools in-process. Default-on; opt out with
// `context_mode.enabled: false` in preferences.

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@gsd/pi-coding-agent";

function toolWorkspaceRoot(ctx: unknown): string {
  if (ctx && typeof ctx === "object" && typeof (ctx as { cwd?: unknown }).cwd === "string") {
    return (ctx as { cwd: string }).cwd;
  }
  return process.cwd();
}

async function loadContextModePreferences(baseDir: string) {
  const [{ loadEffectiveGSDPreferences }, { logWarning }] = await Promise.all([
    import("../preferences.js"),
    import("../workflow-logger.js"),
  ]);
  try {
    return loadEffectiveGSDPreferences(baseDir)?.preferences ?? null;
  } catch (err) {
    logWarning("tool", `Context Mode tool could not load preferences: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function registerExecTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gsd_exec",
    label: "Exec (Sandboxed)",
    description:
      "Run a short script (bash/node/python) in a subprocess. Capped stdout/stderr and metadata persist to " +
      ".gsd/exec/<id>.{stdout,stderr,meta.json}; only a short digest returns in context. Use " +
      "this instead of reading many files or emitting large tool outputs — e.g. have the script " +
      "count/grep/summarize and log the finding. Enabled by default; opt out via " +
      "preferences.context_mode.enabled=false.",
    promptSnippet:
      "Run a bash/node/python script in a sandbox; capped output is saved to disk and only a digest returns",
    promptGuidelines: [
      "Prefer gsd_exec for analyses that would otherwise read >3 files or produce large tool output.",
      "Write scripts that log the finding (counts, matches, summaries) rather than raw dumps.",
      "The digest is the last ~300 chars of stdout — size your log output accordingly.",
      "Need persisted output? Read the stdout_path returned in details (file on local disk).",
    ],
    parameters: Type.Object({
      runtime: Type.Union(
        [Type.Literal("bash"), Type.Literal("node"), Type.Literal("python")],
        { description: "Interpreter: bash (-c), node (-e), or python3 (-c)." },
      ),
      script: Type.String({ description: "Script body. Keep output small (log the finding, not the data)." }),
      purpose: Type.Optional(Type.String({ description: "Short label recorded in meta.json for later review." })),
      timeout_ms: Type.Optional(
        Type.Number({
          description: "Per-invocation timeout (ms). Capped at 600000. Default from preferences.",
          minimum: 1_000,
          maximum: 600_000,
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { executeGsdExec } = await import("../tools/exec-tool.js");
      const baseDir = toolWorkspaceRoot(_ctx);
      return executeGsdExec(params as Parameters<typeof executeGsdExec>[0], {
        baseDir,
        preferences: await loadContextModePreferences(baseDir),
      });
    },
  });

  pi.registerTool({
    name: "gsd_exec_search",
    label: "Search gsd_exec History",
    description:
      "List prior gsd_exec runs (most recent first) from .gsd/exec/*.meta.json. Useful for " +
      "rediscovering the stdout_path of an earlier run without re-executing it. Read-only.",
    promptSnippet: "Search prior gsd_exec runs by substring, runtime, or failing-only filter",
    promptGuidelines: [
      "Use this before re-running an expensive analysis — the prior run's stdout file may still answer.",
      "The preview shows the trailing ~300 chars of stdout; read stdout_path for persisted output.",
    ],
    parameters: Type.Object({
      query: Type.Optional(Type.String({ description: "Substring matched against id and purpose (case-insensitive)." })),
      runtime: Type.Optional(
        Type.Union([Type.Literal("bash"), Type.Literal("node"), Type.Literal("python")], {
          description: "Restrict to one runtime.",
        }),
      ),
      failing_only: Type.Optional(Type.Boolean({ description: "Only non-zero exit codes and timeouts." })),
      limit: Type.Optional(Type.Number({ description: "Max results (default 20, cap 200)", minimum: 1, maximum: 200 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { executeExecSearch } = await import("../tools/exec-search-tool.js");
      const baseDir = toolWorkspaceRoot(_ctx);
      return executeExecSearch(params as Parameters<typeof executeExecSearch>[0], {
        baseDir,
        preferences: await loadContextModePreferences(baseDir),
      });
    },
  });

  pi.registerTool({
    name: "gsd_resume",
    label: "Resume (Read Snapshot)",
    description:
      "Return the contents of .gsd/last-snapshot.md — a ≤2 KB digest of top memories, recent " +
      "gsd_exec runs, and active context, written automatically on session_before_compact. Use " +
      "this after compaction or session resume to re-orient quickly.",
    promptSnippet: "Read the pre-compaction snapshot to re-orient after context loss",
    promptGuidelines: [
      "Call this right after a session resumes if you feel you've lost durable context.",
      "The snapshot is a summary — use memory_query or gsd_exec_search for detail.",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { executeResume } = await import("../tools/resume-tool.js");
      const baseDir = toolWorkspaceRoot(_ctx);
      return executeResume(params as Parameters<typeof executeResume>[0], {
        baseDir,
        preferences: await loadContextModePreferences(baseDir),
      });
    },
  });
}
