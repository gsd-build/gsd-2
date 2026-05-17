// GSD-2 — Slice parallel orchestrator behavior tests.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { deriveState } from "../state.js";
import { validatePreferences } from "../preferences-validation.ts";
import {
  _buildSliceWorkerEnvForTest,
  _resolveSliceParallelMaxWorkersForTest,
  getSliceOrchestratorState,
  isSliceParallelActive,
  restoreSliceState,
  resetSliceOrchestrator,
  SLICE_WORKER_AUTO_ARGS,
  startSliceParallel,
  stopSliceParallel,
} from "../slice-parallel-orchestrator.ts";

function readLinuxProcessStartFingerprint(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf-8");
    const afterCommand = stat.slice(stat.lastIndexOf(")") + 2).trim();
    const fields = afterCommand.split(/\s+/);
    const startTimeTicks = fields[19];
    return startTimeTicks ? `linux-stat:${startTimeTicks}` : null;
  } catch {
    return null;
  }
}

function readPsProcessStartFingerprint(pid: number): string | null {
  try {
    const raw = execFileSync("ps", ["-p", String(pid), "-o", "lstart="], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
    }).trim().replace(/\s+/g, " ");
    return raw ? `ps-lstart:${raw}` : null;
  } catch {
    return null;
  }
}

function readProcessStartFingerprint(pid: number): string | null {
  return readLinuxProcessStartFingerprint(pid) ?? readPsProcessStartFingerprint(pid);
}

function makeTempProject(): string {
  const basePath = mkdtempSync(join(tmpdir(), "gsd-slice-parallel-"));
  mkdirSync(join(basePath, ".gsd"), { recursive: true });
  return basePath;
}

function runGit(basePath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: basePath,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

function initGitProject(basePath: string): void {
  runGit(basePath, ["init", "--initial-branch=main"]);
  runGit(basePath, ["config", "user.email", "test@example.com"]);
  runGit(basePath, ["config", "user.name", "Test User"]);
  writeFileSync(join(basePath, "README.md"), "initial\n", "utf-8");
  runGit(basePath, ["add", "README.md"]);
  runGit(basePath, ["commit", "-m", "initial"]);
}

function writeSliceOrchestratorState(
  basePath: string,
  worker: {
    pid: number;
    workerToken?: string;
    processStartFingerprint?: string | null;
  },
): void {
  writeFileSync(
    join(basePath, ".gsd", "slice-orchestrator.json"),
    JSON.stringify({
      active: true,
      workers: [{
        milestoneId: "M900",
        sliceId: "S01",
        pid: worker.pid,
        workerToken: worker.workerToken,
        processStartFingerprint: worker.processStartFingerprint,
        worktreePath: join(basePath, ".gsd", "worktrees", "M900-S01"),
        startedAt: Date.now(),
        state: "running",
        completedUnits: 0,
        cost: 0,
      }],
      totalCost: 0,
      maxWorkers: 1,
      startedAt: Date.now(),
      basePath,
    }),
    "utf-8",
  );
}

describe("slice worker launch contract", () => {
  it("uses headless auto instead of print-mode slash commands", () => {
    assert.deepEqual([...SLICE_WORKER_AUTO_ARGS], ["headless", "--json", "auto"]);
    assert.equal(SLICE_WORKER_AUTO_ARGS.includes("--print" as never), false);
  });

  it("builds isolated worker environment", () => {
    const env = _buildSliceWorkerEnvForTest(
      "/repo",
      "M001",
      "S02",
      "worker-token",
      { PATH: "/bin" } as NodeJS.ProcessEnv,
    );

    assert.equal(env.GSD_SLICE_LOCK, "S02");
    assert.equal(env.GSD_MILESTONE_LOCK, "M001");
    assert.equal(env.GSD_PROJECT_ROOT, "/repo");
    assert.equal(env.GSD_PARALLEL_WORKER, "1");
    assert.equal(env.GSD_SLICE_WORKER_TOKEN, "worker-token");
  });

  it("defaults to two workers unless explicitly configured", () => {
    assert.equal(_resolveSliceParallelMaxWorkersForTest(), 2);
    assert.equal(_resolveSliceParallelMaxWorkersForTest(4), 4);
  });
});

describe("slice-parallel stale worktree handling", () => {
  it("replaces a stale slice worktree before spawning the worker", async () => {
    const basePath = makeTempProject();
    const oldGsdBinPath = process.env.GSD_BIN_PATH;
    try {
      initGitProject(basePath);
      const workerBin = join(basePath, "fake-worker.js");
      writeFileSync(
        workerBin,
        [
          "process.on('SIGTERM', () => process.exit(0));",
          "setInterval(() => {}, 1000);",
        ].join("\n"),
        "utf-8",
      );
      process.env.GSD_BIN_PATH = workerBin;

      const staleWorktree = join(basePath, ".gsd", "worktrees", "M900-S01");
      mkdirSync(staleWorktree, { recursive: true });
      writeFileSync(join(staleWorktree, ".git"), "gitdir: /tmp/not-this-repo\n", "utf-8");
      writeFileSync(join(staleWorktree, "stale-marker"), "stale\n", "utf-8");

      const result = await startSliceParallel(basePath, "M900", [{ id: "S01" }], { maxWorkers: 1 });

      assert.deepEqual(result, { started: ["S01"], errors: [] });
      assert.equal(existsSync(join(staleWorktree, "stale-marker")), false);
      assert.equal(lstatSync(join(staleWorktree, ".git")).isFile(), true);
      assert.match(readFileSync(join(staleWorktree, ".git"), "utf-8"), /^gitdir: /);
      assert.equal(getSliceOrchestratorState()?.active, true);
    } finally {
      const child = getSliceOrchestratorState()?.workers.get("S01")?.process;
      if (child && child.exitCode === null) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 500);
          child.once("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
          child.kill("SIGTERM");
        });
      }
      stopSliceParallel();
      resetSliceOrchestrator();
      if (oldGsdBinPath === undefined) delete process.env.GSD_BIN_PATH;
      else process.env.GSD_BIN_PATH = oldGsdBinPath;
      rmSync(basePath, { recursive: true, force: true });
    }
  });
});

describe("slice-parallel-orchestrator recovery identity", () => {
  it("rejects a live PID when the process start fingerprint does not match", () => {
    const basePath = makeTempProject();
    try {
      writeSliceOrchestratorState(basePath, {
        pid: process.pid,
        processStartFingerprint: "mismatched-fingerprint",
      });

      const restored = restoreSliceState(basePath);
      assert.equal(restored, null, "mismatched fingerprint is treated as a dead worker");
      assert.equal(
        existsSync(join(basePath, ".gsd", "slice-orchestrator.json")),
        false,
        "state file is removed when no recovered worker identity validates",
      );
    } finally {
      rmSync(basePath, { recursive: true, force: true });
    }
  });

  it("keeps a recovered worker when PID, token, and process start fingerprint match", async () => {
    const basePath = makeTempProject();
    const token = `test-token-${Date.now()}`;
    const child = spawn(
      process.execPath,
      ["-e", "setTimeout(() => {}, 30000)"],
      {
        env: { ...process.env, GSD_SLICE_WORKER_TOKEN: token },
        stdio: "ignore",
      },
    );

    try {
      assert.ok(child.pid, "child process has a pid");
      await new Promise((resolve) => setTimeout(resolve, 50));
      const fingerprint = readProcessStartFingerprint(child.pid!);
      if (!fingerprint) return;

      writeSliceOrchestratorState(basePath, {
        pid: child.pid!,
        workerToken: token,
        processStartFingerprint: fingerprint,
      });

      const restored = restoreSliceState(basePath);
      assert.ok(restored, "matching worker identity is restored");
      assert.equal(restored.workers.length, 1);
      assert.equal(restored.workers[0].pid, child.pid);
    } finally {
      child.kill("SIGTERM");
      rmSync(basePath, { recursive: true, force: true });
    }
  });

  it("treats persisted non-running workers as inactive and clears stale state file", () => {
    const basePath = makeTempProject();
    try {
      writeFileSync(
        join(basePath, ".gsd", "slice-orchestrator.json"),
        JSON.stringify({
          active: true,
          workers: [{
            milestoneId: "M900",
            sliceId: "S01",
            pid: 0,
            workerToken: "done-worker",
            processStartFingerprint: null,
            worktreePath: join(basePath, ".gsd", "worktrees", "M900-S01"),
            startedAt: Date.now(),
            state: "stopped",
            completedUnits: 1,
            cost: 0,
          }],
          totalCost: 0,
          maxWorkers: 1,
          startedAt: Date.now(),
          basePath,
        }),
        "utf-8",
      );

      assert.equal(isSliceParallelActive(basePath), false);
      assert.equal(
        existsSync(join(basePath, ".gsd", "slice-orchestrator.json")),
        false,
        "stale non-running persisted state should be removed",
      );
    } finally {
      resetSliceOrchestrator();
      rmSync(basePath, { recursive: true, force: true });
    }
  });
});

describe("slice_parallel preference and state gating", () => {
  it("validates slice_parallel preferences", () => {
    const result = validatePreferences({
      slice_parallel: { enabled: true, max_workers: 3 },
    });

    assert.equal(result.errors.length, 0);
    assert.deepEqual(result.preferences.slice_parallel, {
      enabled: true,
      max_workers: 3,
    });
  });

  it("derives the locked slice for parallel workers", async () => {
    const basePath = makeTempProject();
    const oldWorker = process.env.GSD_PARALLEL_WORKER;
    const oldSlice = process.env.GSD_SLICE_LOCK;
    try {
      const msDir = join(basePath, ".gsd", "milestones", "M001");
      mkdirSync(msDir, { recursive: true });
      writeFileSync(
        join(msDir, "M001-ROADMAP.md"),
        [
          "# M001",
          "",
          "## Slices",
          "- [ ] **S01: First** `risk:low` `depends:[]`",
          "- [ ] **S02: Second** `risk:low` `depends:[]`",
        ].join("\n"),
      );
      process.env.GSD_PARALLEL_WORKER = "1";
      process.env.GSD_SLICE_LOCK = "S02";

      const state = await deriveState(basePath);
      assert.equal(state.activeSlice?.id, "S02");
    } finally {
      if (oldWorker === undefined) delete process.env.GSD_PARALLEL_WORKER;
      else process.env.GSD_PARALLEL_WORKER = oldWorker;
      if (oldSlice === undefined) delete process.env.GSD_SLICE_LOCK;
      else process.env.GSD_SLICE_LOCK = oldSlice;
      rmSync(basePath, { recursive: true, force: true });
    }
  });
});
