// Project/App: GSD-2
// File Purpose: Executor for the gsd_exec MCP tool.

import {
  EXEC_DEFAULTS,
  runExecSandbox,
  type ExecSandboxOptions,
  type ExecSandboxRequest,
  type ExecSandboxResult,
} from "../exec-sandbox.js";
import path from "node:path";
import { isContextModeEnabled, type ContextModeConfig } from "../preferences-types.js";
import { contextModeDisabledResult, type ToolExecutionResult } from "./context-mode-tool-result.js";

export interface ExecToolParams {
  runtime: ExecSandboxRequest["runtime"];
  script: string;
  purpose?: string;
  timeout_ms?: number;
}

export interface ExecToolDeps {
  baseDir: string;
  preferences: { context_mode?: ContextModeConfig } | null;
  /** Optional override for testing. */
  run?: (req: ExecSandboxRequest, opts: ExecSandboxOptions) => Promise<ExecSandboxResult>;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  generateId?: () => string;
}

export function buildExecOptions(
  baseDir: string,
  cfg: ContextModeConfig | undefined,
  extras?: Pick<ExecSandboxOptions, "env" | "now" | "generateId">,
): ExecSandboxOptions {
  const allowlist = Array.isArray(cfg?.exec_env_allowlist) ? cfg!.exec_env_allowlist! : EXEC_DEFAULTS.envAllowlist;
  const stdoutCap = clampNumber(
    cfg?.exec_stdout_cap_bytes,
    EXEC_DEFAULTS.stdoutCapBytes,
    4_096,
    16_777_216,
  );
  const defaultTimeout = clampNumber(
    cfg?.exec_timeout_ms,
    EXEC_DEFAULTS.defaultTimeoutMs,
    1_000,
    EXEC_DEFAULTS.clampTimeoutMs,
  );
  const digestChars = clampNumber(cfg?.exec_digest_chars, EXEC_DEFAULTS.digestChars, 0, 4_000);
  return {
    baseDir,
    clamp_timeout_ms: EXEC_DEFAULTS.clampTimeoutMs,
    default_timeout_ms: defaultTimeout,
    stdout_cap_bytes: stdoutCap,
    stderr_cap_bytes: EXEC_DEFAULTS.stderrCapBytes,
    digest_chars: digestChars,
    env_allowlist: allowlist,
    ...extras,
  };
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return Math.floor(value);
}

function isEnabled(prefs: ExecToolDeps["preferences"]): boolean {
  return isContextModeEnabled(prefs);
}

function paramError(message: string): ToolExecutionResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    details: { operation: "gsd_exec", error: "invalid_params", detail: message },
    isError: true,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeScanPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function parseWorktreeBase(baseDir: string): { originalRoot: string; worktreeRoot: string } | null {
  const normalizedBase = normalizeScanPath(baseDir);
  const marker = "/.gsd/worktrees/";
  const markerIndex = normalizedBase.indexOf(marker);
  if (markerIndex <= 0) return null;
  return {
    originalRoot: normalizedBase.slice(0, markerIndex),
    worktreeRoot: normalizedBase,
  };
}

function pathInside(parent: string, target: string): boolean {
  const parentWithSep = parent.endsWith("/") ? parent : `${parent}/`;
  return target === parent || target.startsWith(parentWithSep);
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === "'" || first === '"' || first === "`") && last === first) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function extractPathLikeValues(script: string): string[] {
  const values: string[] = [];
  const push = (candidate: string) => {
    const cleaned = stripWrappingQuotes(candidate).trim();
    if (!cleaned) return;
    values.push(cleaned);
  };
  const pushQuotedLiterals = (source: string, depth = 0) => {
    for (const match of source.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)) {
      push(match[2]);
      if (depth < 2 && /["'`]/.test(match[2])) {
        pushQuotedLiterals(match[2], depth + 1);
      }
    }
  };

  for (const match of script.matchAll(/(?:^|[;\n\r]|\&\&|\|\|)\s*cd\s+([^\n\r;|&]+)/g)) {
    push(match[1]);
  }
  for (const match of script.matchAll(/process\.chdir\(\s*([^\n\r;]+?)\s*\)/g)) {
    push(match[1]);
    pushQuotedLiterals(match[1]);
  }
  pushQuotedLiterals(script);
  return values;
}

function resolvesToOriginalRootOutsideWorktree(script: string, baseDir: string): boolean {
  const parsed = parseWorktreeBase(baseDir);
  if (!parsed) return false;

  const normalizedWorktree = normalizeScanPath(path.resolve(parsed.worktreeRoot));
  const normalizedOriginalRoot = normalizeScanPath(path.resolve(parsed.originalRoot));
  for (const value of extractPathLikeValues(script)) {
    const resolved = normalizeScanPath(path.resolve(normalizedWorktree, value));
    if (pathInside(normalizedOriginalRoot, resolved) && !pathInside(normalizedWorktree, resolved)) {
      return true;
    }
  }
  return false;
}

function scriptReferencesOriginalRootFromWorktree(script: string, baseDir: string): boolean {
  const parsed = parseWorktreeBase(baseDir);
  if (!parsed) return false;
  const normalizedScript = script.replace(/\\/g, "/");
  const originalRootPattern = new RegExp(
    `${escapeRegExp(parsed.originalRoot)}(?=$|[\\s'"\\\`;)&|<>]|/(?!\\.gsd/worktrees(?:/|$)))`,
  );
  return originalRootPattern.test(normalizedScript);
}

export async function executeGsdExec(
  params: ExecToolParams,
  deps: ExecToolDeps,
): Promise<ToolExecutionResult> {
  if (!isEnabled(deps.preferences)) return contextModeDisabledResult("gsd_exec");

  const runtime = params.runtime;
  if (runtime !== "bash" && runtime !== "node" && runtime !== "python") {
    return paramError(`invalid runtime "${String(runtime)}" — must be bash | node | python`);
  }
  const script = typeof params.script === "string" ? params.script : "";
  if (script.trim().length === 0) {
    return paramError("script is required and must be a non-empty string");
  }
  if (Buffer.byteLength(script, "utf8") > 200_000) {
    return paramError("script exceeds the 200 KB length limit");
  }
  if (
    resolvesToOriginalRootOutsideWorktree(script, deps.baseDir)
    || scriptReferencesOriginalRootFromWorktree(script, deps.baseDir)
  ) {
    return paramError(
      "script references the original project root while running inside a milestone worktree; use the active worktree path or relative paths",
    );
  }

  const opts = buildExecOptions(
    deps.baseDir,
    deps.preferences?.context_mode,
    { env: deps.env, now: deps.now, generateId: deps.generateId },
  );
  const run = deps.run ?? runExecSandbox;

  try {
    const result = await run(
      {
        runtime,
        script,
        ...(typeof params.purpose === "string" ? { purpose: params.purpose } : {}),
        ...(typeof params.timeout_ms === "number" ? { timeout_ms: params.timeout_ms } : {}),
      },
      opts,
    );
    return formatResult(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: gsd_exec failed — ${message}` }],
      details: { operation: "gsd_exec", error: message },
      isError: true,
    };
  }
}

function formatResult(result: ExecSandboxResult): ToolExecutionResult {
  const headerLines = [
    `gsd_exec[${result.id}] runtime=${result.runtime} exit=${formatExit(result)} duration=${result.duration_ms}ms`,
    `  stdout: ${result.stdout_bytes}B${result.stdout_truncated ? " (truncated)" : ""} → ${result.stdout_path}`,
    `  stderr: ${result.stderr_bytes}B${result.stderr_truncated ? " (truncated)" : ""} → ${result.stderr_path}`,
  ];
  const summary = `${headerLines.join("\n")}\n--- digest ---\n${result.digest}`.trimEnd();
  return {
    content: [{ type: "text", text: summary }],
    details: {
      operation: "gsd_exec",
      id: result.id,
      runtime: result.runtime,
      exit_code: result.exit_code,
      signal: result.signal,
      timed_out: result.timed_out,
      duration_ms: result.duration_ms,
      stdout_bytes: result.stdout_bytes,
      stderr_bytes: result.stderr_bytes,
      stdout_truncated: result.stdout_truncated,
      stderr_truncated: result.stderr_truncated,
      stdout_path: result.stdout_path,
      stderr_path: result.stderr_path,
      meta_path: result.meta_path,
    },
    isError: result.timed_out || result.signal !== null || result.exit_code !== 0,
  };
}

function formatExit(result: ExecSandboxResult): string {
  if (result.timed_out) return "timeout";
  if (result.signal) return `signal:${result.signal}`;
  if (result.exit_code === null) return "null";
  return String(result.exit_code);
}
