/**
 * Wave Executor — runs multiple tasks concurrently in isolated git worktrees,
 * then merges results back to the slice branch.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createWorktree, removeWorktree, mergeWorktreeTo, runGit } from "./worktree-manager.js";
import type { TaskPlanEntry } from "./types.js";

export interface TaskResult {
  taskId: string;
  taskTitle: string;
  exitCode: number;
  stderr: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    turns: number;
  };
  merged: boolean;
  error?: string;
}

export interface WaveResult {
  taskResults: TaskResult[];
  failedTasks: TaskPlanEntry[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;
  const workers = new Array(limit).fill(null).map(async () => {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

function writePromptToTempFile(taskId: string, prompt: string): { dir: string; filePath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-wave-"));
  const filePath = path.join(tmpDir, `prompt-${taskId}.md`);
  fs.writeFileSync(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
  return { dir: tmpDir, filePath };
}

// ─── Single Task Runner ────────────────────────────────────────────────────

async function runTaskInWorktree(
  worktreePath: string,
  taskId: string,
  taskTitle: string,
  prompt: string,
  timeoutMs: number,
): Promise<TaskResult> {
  const result: TaskResult = {
    taskId,
    taskTitle,
    exitCode: 0,
    stderr: "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
    merged: false,
  };

  let tmpPromptDir: string | null = null;
  let tmpPromptPath: string | null = null;

  try {
    const args: string[] = ["--mode", "json", "-p", "--no-session"];

    const tmp = writePromptToTempFile(taskId, prompt);
    tmpPromptDir = tmp.dir;
    tmpPromptPath = tmp.filePath;
    args.push("--append-system-prompt", tmpPromptPath);

    args.push(`Task: ${taskTitle}`);

    const exitCode = await new Promise<number>((resolve) => {
      const bundledPaths = (process.env.GSD_BUNDLED_EXTENSION_PATHS ?? "").split(":").filter(Boolean);
      const extensionArgs = bundledPaths.flatMap(p => ["--extension", p]);
      const proc = spawn(
        process.execPath,
        [process.env.GSD_BIN_PATH!, ...extensionArgs, ...args],
        { cwd: worktreePath, shell: false, stdio: ["ignore", "pipe", "pipe"] },
      );

      let buffer = "";
      let killed = false;

      // Timeout: SIGTERM, then SIGKILL after 5s
      const timer = setTimeout(() => {
        killed = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 5000);
      }, timeoutMs);

      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }

        if (event.type === "message_end" && event.message) {
          const msg = event.message;
          if (msg.role === "assistant") {
            result.usage.turns++;
            result.usage.input += msg.usage?.input || 0;
            result.usage.output += msg.usage?.output || 0;
            result.usage.cacheRead += msg.usage?.cacheRead || 0;
            result.usage.cacheWrite += msg.usage?.cacheWrite || 0;
            result.usage.cost += msg.usage?.cost?.total || 0;
          }
        }
      };

      proc.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });

      const MAX_STDERR = 8192;
      proc.stderr.on("data", (data) => {
        result.stderr += data.toString();
        if (result.stderr.length > MAX_STDERR) {
          result.stderr = result.stderr.slice(-MAX_STDERR);
        }
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (buffer.trim()) processLine(buffer);
        if (killed) {
          result.error = `Task ${taskId} timed out after ${timeoutMs}ms`;
        }
        resolve(code ?? 1);
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        result.error = `Failed to spawn process for task ${taskId}: ${err.message}`;
        resolve(1);
      });
    });

    result.exitCode = exitCode;
    return result;
  } catch (err) {
    result.exitCode = 1;
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  } finally {
    if (tmpPromptPath) try { fs.unlinkSync(tmpPromptPath); } catch { /* ignore */ }
    if (tmpPromptDir) try { fs.rmdirSync(tmpPromptDir); } catch { /* ignore */ }
  }
}

// ─── Wave Executor ─────────────────────────────────────────────────────────

interface WorktreeTaskEntry {
  task: TaskPlanEntry;
  wtName: string;
  wt: { name: string; path: string; branch: string; exists: boolean };
  prompt: string;
}

export async function executeWave(
  wave: TaskPlanEntry[],
  basePath: string,
  milestoneId: string,
  sliceId: string,
  sliceBranch: string,
  buildPromptFn: (tid: string, tTitle: string, worktreeBase: string) => Promise<string>,
  timeoutMs: number,
  maxConcurrency: number = 4,
): Promise<WaveResult> {
  const taskEntries: WorktreeTaskEntry[] = [];
  const taskResults: TaskResult[] = [];
  const failedTasks: TaskPlanEntry[] = [];

  try {
    // 1. Create worktrees and build prompts
    for (const task of wave) {
      const wtName = `wave-${milestoneId.toLowerCase()}-${sliceId.toLowerCase()}-${task.id.toLowerCase()}-${process.pid}`;
      const wt = createWorktree(basePath, wtName, sliceBranch);
      // Track worktree immediately so it's cleaned up if buildPromptFn throws
      taskEntries.push({ task, wtName, wt, prompt: "" });
      const prompt = await buildPromptFn(task.id, task.title, wt.path);
      taskEntries[taskEntries.length - 1].prompt = prompt;
    }

    // 2. Run all tasks in parallel with concurrency limit
    const results = await mapWithConcurrencyLimit(taskEntries, maxConcurrency, async (entry) => {
      return runTaskInWorktree(entry.wt.path, entry.task.id, entry.task.title, entry.prompt, timeoutMs);
    });

    // 3. Merge successful worktrees back to slice branch sequentially (in task ID order)
    let onSliceBranch = false;
    for (let i = 0; i < taskEntries.length; i++) {
      const entry = taskEntries[i];
      const result = results[i];

      if (result.exitCode !== 0) {
        failedTasks.push(entry.task);
        taskResults.push(result);
        continue;
      }

      // Check if the worktree branch has commits ahead of the slice branch
      const ahead = runGit(basePath, ["rev-list", "--count", `${sliceBranch}..${entry.wt.branch}`], { allowFailure: true });

      if (!ahead || ahead === "0") {
        result.merged = false;
        if (!ahead) {
          result.error = `Failed to check commits ahead for task ${entry.task.id}`;
          failedTasks.push(entry.task);
        }
        taskResults.push(result);
        continue;
      }

      try {
        if (!onSliceBranch) {
          runGit(basePath, ["checkout", sliceBranch]);
          onSliceBranch = true;
        }

        mergeWorktreeTo(
          basePath,
          entry.wtName,
          sliceBranch,
          `feat(${sliceId}/${entry.task.id}): ${entry.task.title}`,
        );
        result.merged = true;
      } catch (err) {
        result.merged = false;
        result.error = `Merge failed for task ${entry.task.id}: ${err instanceof Error ? err.message : String(err)}`;

        // Abort any in-progress merge and reset the index to avoid contaminating subsequent merges.
        // git merge --squash stages files; merge --abort alone may not clear them.
        runGit(basePath, ["merge", "--abort"], { allowFailure: true });
        runGit(basePath, ["reset", "HEAD"], { allowFailure: true });
        onSliceBranch = false;

        failedTasks.push(entry.task);
      }

      taskResults.push(result);
    }

    return { taskResults, failedTasks };
  } finally {
    // 4. Always clean up worktrees
    for (const entry of taskEntries) {
      try {
        removeWorktree(basePath, entry.wtName, { deleteBranch: true, force: true });
      } catch { /* best-effort cleanup */ }
    }
  }
}
