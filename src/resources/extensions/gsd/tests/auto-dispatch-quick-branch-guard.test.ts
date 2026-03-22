/**
 * Test: auto-mode dispatch refuses to dispatch on gsd/quick/* branches.
 *
 * Reproduces #2086 — auto-mode commits milestone work onto a quick-task
 * branch because resolveDispatch has no branch awareness.
 *
 * The fix adds a "quick-branch-guard" dispatch rule that fires first and
 * returns a "stop" action when the current branch matches gsd/quick/*.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { createTestContext } from "./test-helpers.ts";
import { resolveDispatch, DISPATCH_RULES } from "../auto-dispatch.ts";
import type { DispatchContext } from "../auto-dispatch.ts";
import type { GSDState } from "../types.ts";

const { assertEq, assertTrue, report } = createTestContext();

function run(command: string, cwd: string): string {
  return execSync(command, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

function createTestRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "gsd-quick-dispatch-guard-"));
  run("git init -b main", repo);
  run(`git config user.name "GSD Test"`, repo);
  run(`git config user.email "test@gsd.dev"`, repo);
  mkdirSync(join(repo, ".gsd", "milestones", "M001"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "init\n");
  run("git add -A", repo);
  run(`git commit -m "init"`, repo);
  return repo;
}

function makeState(phase: string): GSDState {
  return {
    phase,
    activeMilestone: { id: "M001", title: "Test milestone", status: "active" },
    activeSlice: { id: "S01", title: "Test slice", status: "active" },
    activeTask: { id: "T01", title: "Test task", status: "active" },
    registry: [],
  } as unknown as GSDState;
}

async function main(): Promise<void> {
  // ═══════════════════════════════════════════════════════════════════════
  // quick-branch-guard rule exists in DISPATCH_RULES
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== DISPATCH_RULES includes quick-branch-guard ===");

  const guardRule = DISPATCH_RULES.find((r) => r.name === "quick-branch-guard");
  assertTrue(!!guardRule, "quick-branch-guard rule exists");
  assertEq(DISPATCH_RULES[0].name, "quick-branch-guard", "quick-branch-guard is the first rule");

  // ═══════════════════════════════════════════════════════════════════════
  // resolveDispatch stops on gsd/quick/* branch
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== resolveDispatch: stops on quick branch ===");

  {
    const repo = createTestRepo();

    // Switch to a quick-task branch
    run("git checkout -b gsd/quick/1-fix-typo", repo);

    const ctx: DispatchContext = {
      basePath: repo,
      mid: "M001",
      midTitle: "Test milestone",
      state: makeState("executing"),
      prefs: undefined,
    };

    const result = await resolveDispatch(ctx);

    assertEq(result.action, "stop", "dispatch returns stop on quick branch");
    assertTrue(
      (result as any).reason?.includes("quick"),
      "stop reason mentions quick branch",
    );

    rmSync(repo, { recursive: true, force: true });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // resolveDispatch proceeds normally on non-quick branch
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== resolveDispatch: proceeds on main branch ===");

  {
    const repo = createTestRepo();

    // Stay on main — dispatch should NOT stop
    const ctx: DispatchContext = {
      basePath: repo,
      mid: "M001",
      midTitle: "Test milestone",
      state: makeState("complete"),
      prefs: undefined,
    };

    const result = await resolveDispatch(ctx);

    // "complete" phase dispatches a stop, but it's the "All milestones complete"
    // stop, NOT the quick-branch guard stop.
    assertEq(result.action, "stop", "complete phase stops");
    assertTrue(
      !(result as any).reason?.includes("quick"),
      "stop reason is NOT about quick branch",
    );

    rmSync(repo, { recursive: true, force: true });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Guard fires for any gsd/quick/ prefix
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== resolveDispatch: guards various quick branch patterns ===");

  {
    const repo = createTestRepo();

    for (const branch of [
      "gsd/quick/1-fix-typo",
      "gsd/quick/42-some-long-slug-name",
      "gsd/quick/99-a",
    ]) {
      // Create branch if it doesn't exist
      try {
        run(`git checkout -b ${branch}`, repo);
      } catch {
        run(`git checkout ${branch}`, repo);
      }

      const ctx: DispatchContext = {
        basePath: repo,
        mid: "M001",
        midTitle: "Test milestone",
        state: makeState("executing"),
        prefs: undefined,
      };

      const result = await resolveDispatch(ctx);
      assertEq(result.action, "stop", `stop on ${branch}`);

      // Return to main for next iteration
      run("git checkout main", repo);
    }

    rmSync(repo, { recursive: true, force: true });
  }

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
