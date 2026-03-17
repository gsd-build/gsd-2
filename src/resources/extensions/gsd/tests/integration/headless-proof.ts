/**
 * Headless Proof Script — GSD 2 Auto-Mode via RPC
 *
 * Proves that GSD's agent loop can run and complete a task without any TUI,
 * using the existing RPC mode infrastructure.
 *
 * What it does:
 *   1. Creates a temp dir with a complete .gsd/ project fixture
 *   2. Spawns GSD via RpcClient with cwd pointing to that dir
 *   3. Sends `/gsd auto` via the prompt command
 *   4. Handles extension_ui_request events (auto-responds)
 *   5. Waits for agent_end with configurable timeout
 *   6. Asserts on the event stream and prints a structured summary
 *
 * Auth: Uses OAuth credentials from ~/.gsd/agent/auth.json (Claude Code Max).
 * Falls back to ANTHROPIC_API_KEY env var if OAuth is not configured (D013).
 *
 * Usage:
 *   npx tsx src/resources/extensions/gsd/tests/integration/headless-proof.ts
 *
 *   Add --dry-run to validate the fixture and imports without running the agent.
 */

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { execSync } from "node:child_process";

// ── RpcClient import ─────────────────────────────────────────────────────────
// The script lives in src/resources/extensions/gsd/tests/integration/.
// RpcClient is not exported from @gsd/pi-coding-agent's main entry point,
// so we import directly from the compiled dist file.
// Path: ../../../../../../packages/pi-coding-agent/dist/modes/rpc/rpc-client.js
import { RpcClient } from "../../../../../../packages/pi-coding-agent/dist/modes/rpc/rpc-client.js";

// Re-export type for extension_ui_request events
interface ExtensionUIRequest {
  type: "extension_ui_request";
  id: string;
  method: string;
  title?: string;
  options?: string[];
  message?: string;
  timeout?: number;
  [key: string]: unknown;
}

// ── JSONL helper (matches rpc-mode's serialization) ──────────────────────────
function serializeJsonLine(obj: Record<string, unknown>): string {
  return JSON.stringify(obj) + "\n";
}

// ── Configuration ────────────────────────────────────────────────────────────

const TIMEOUT_MS = parseInt(process.env.HEADLESS_TIMEOUT_MS ?? "300000", 10); // 5 minutes
const DRY_RUN = process.argv.includes("--dry-run");

// ── Fixture Data ─────────────────────────────────────────────────────────────
// A complete .gsd/ project state that deriveState() can parse.
// The trivial task asks the agent to create a single file — zero questions needed.

const FIXTURE_PROJECT_MD = `# Project

## What This Is

Headless proof test project. A minimal fixture used to validate GSD auto-mode via RPC.

## Core Value

Proves headless auto-mode works end-to-end.

## Current State

Empty project with GSD milestone planned.

## Architecture / Key Patterns

- Single milestone, single slice, single task

## Capability Contract

None.

## Milestone Sequence

- [ ] M001: Headless Proof — Create a test file to prove the agent loop works
`;

const FIXTURE_STATE_MD = `# GSD State

**Active Milestone:** M001 — Headless Proof
**Active Slice:** S01 — Create Test File
**Phase:** executing
**Requirements Status:** 0 active · 0 validated · 0 deferred · 0 out of scope

## Milestone Registry
- 🔄 **M001:** Headless Proof

## Recent Decisions
- None recorded

## Blockers
- None

## Next Action
Execute T01: Create hello.txt in slice S01.
`;

const FIXTURE_CONTEXT_MD = `# M001: Headless Proof — Context

**Gathered:** 2025-01-01
**Status:** Ready for planning

## Project Description

A minimal test project for validating GSD auto-mode in headless/RPC mode.

## Why This Milestone

Proves that the agent loop can complete a task without a TUI attached.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run GSD in headless mode and have it complete a trivial task

### Entry point / environment

- Entry point: RPC mode via headless-proof.ts
- Environment: local dev
- Live dependencies involved: none

## Completion Class

- Contract complete means: agent creates the requested file
- Integration complete means: not applicable
- Operational complete means: not applicable

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- Agent creates hello.txt with the correct content

## Risks and Unknowns

- None — this is a trivial proof task

## Existing Codebase / Prior Art

- None

## Relevant Requirements

- None

## Scope

### In Scope

- Creating a single file

### Out of Scope / Non-Goals

- Everything else

## Technical Constraints

- None

## Integration Points

- None

## Open Questions

- None
`;

const FIXTURE_ROADMAP_MD = `# M001: Headless Proof

**Vision:** Prove GSD auto-mode works headlessly.

## Success Criteria

- Agent creates hello.txt with content "Hello from headless GSD"

## Key Risks / Unknowns

- None

## Slices

- [ ] **S01: Create Test File** \`risk:low\` \`depends:[]\`
  > After this: hello.txt exists in the project root

## Boundary Map

### S01

Produces:
- hello.txt file in project root

Consumes:
- nothing (first slice)
`;

const FIXTURE_PLAN_MD = `# S01: Create Test File

**Goal:** Create a single file to prove the agent loop works headlessly.
**Demo:** hello.txt exists with the correct content after the agent runs.

## Must-Haves

- hello.txt created with content "Hello from headless GSD"

## Verification

- File hello.txt exists in project root with content "Hello from headless GSD"

## Tasks

- [ ] **T01: Create hello.txt** \`est:5m\`
  - Why: Proves the agent can execute a tool call and produce an artifact
  - Files: \`hello.txt\`
  - Do: Create a file called hello.txt in the project root with the content "Hello from headless GSD"
  - Verify: File exists with correct content
  - Done when: hello.txt exists with content "Hello from headless GSD"

## Files Likely Touched

- \`hello.txt\`
`;

const FIXTURE_TASK_PLAN_MD = `---
estimated_steps: 1
estimated_files: 1
---

# T01: Create hello.txt

**Slice:** S01 — Create Test File
**Milestone:** M001

## Description

Create a file called hello.txt in the project root with the content "Hello from headless GSD".

## Steps

1. Create the file hello.txt with the content "Hello from headless GSD"

## Must-Haves

- [ ] hello.txt created with content "Hello from headless GSD"

## Verification

- File hello.txt exists in project root with content "Hello from headless GSD"

## Expected Output

- \`hello.txt\` — file containing "Hello from headless GSD"
`;

// ── Fixture Creation ─────────────────────────────────────────────────────────

function createFixture(): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "gsd-headless-proof-"));

  // Initialize git repo (GSD requires it for branch-per-slice)
  execSync("git init -b main", { cwd: tmpDir, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: "pipe" });

  // Create .gsd/ structure
  const gsdDir = join(tmpDir, ".gsd");
  const milestonesDir = join(gsdDir, "milestones");
  const m001Dir = join(milestonesDir, "M001");
  const slicesDir = join(m001Dir, "slices");
  const s01Dir = join(slicesDir, "S01");
  const tasksDir = join(s01Dir, "tasks");

  mkdirSync(tasksDir, { recursive: true });

  // Write fixture files
  writeFileSync(join(gsdDir, "PROJECT.md"), FIXTURE_PROJECT_MD);
  writeFileSync(join(gsdDir, "STATE.md"), FIXTURE_STATE_MD);
  writeFileSync(join(m001Dir, "M001-CONTEXT.md"), FIXTURE_CONTEXT_MD);
  writeFileSync(join(m001Dir, "M001-ROADMAP.md"), FIXTURE_ROADMAP_MD);
  writeFileSync(join(s01Dir, "S01-PLAN.md"), FIXTURE_PLAN_MD);
  writeFileSync(join(tasksDir, "T01-PLAN.md"), FIXTURE_TASK_PLAN_MD);

  // Add .gitignore for runtime files
  writeFileSync(join(tmpDir, ".gitignore"), [
    ".gsd/auto.lock",
    ".gsd/completed-units.json",
    ".gsd/metrics.json",
    ".gsd/activity/",
    ".gsd/runtime/",
  ].join("\n") + "\n");

  // Initial commit so GSD has a clean git state
  execSync("git add -A && git commit -m 'init: headless proof fixture'", {
    cwd: tmpDir,
    stdio: "pipe",
  });

  return tmpDir;
}

// ── Event Tracking ───────────────────────────────────────────────────────────

interface EventSummary {
  total: number;
  byType: Record<string, number>;
  toolUseCount: number;
  agentEndReceived: boolean;
  extensionUIRequests: number;
  extensionUIResponses: number;
  errors: string[];
  lastEvents: Array<{ type: string; timestamp: number; detail?: string }>;
}

function createEventTracker() {
  const events: Array<Record<string, unknown>> = [];
  const summary: EventSummary = {
    total: 0,
    byType: {},
    toolUseCount: 0,
    agentEndReceived: false,
    extensionUIRequests: 0,
    extensionUIResponses: 0,
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
        summary.agentEndReceived = true;
      }
      if (type === "extension_ui_request") {
        summary.extensionUIRequests++;
      }
      if (type === "error") {
        summary.errors.push(String(event.message ?? event.error ?? "unknown error"));
      }

      // Keep last 20 events for diagnostics
      summary.lastEvents.push({
        type,
        timestamp: Date.now(),
        detail: type === "tool_execution_start"
          ? String((event as any).toolName ?? "")
          : type === "message_update"
            ? String((event as any).assistantMessageEvent?.text ?? "").slice(0, 80)
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

// ── Extension UI Auto-Responder ──────────────────────────────────────────────

function handleExtensionUIRequest(
  event: ExtensionUIRequest,
  writeToStdin: (data: string) => void,
): void {
  const { id, method } = event;

  let response: Record<string, unknown>;

  switch (method) {
    case "select":
      // Auto-select the first option
      response = {
        type: "extension_ui_response",
        id,
        value: event.options?.[0] ?? "",
      };
      break;

    case "confirm":
      // Auto-confirm
      response = {
        type: "extension_ui_response",
        id,
        confirmed: true,
      };
      break;

    case "input":
      // Auto-respond with empty string
      response = {
        type: "extension_ui_response",
        id,
        value: "",
      };
      break;

    case "editor":
      // Auto-respond with prefill or empty
      response = {
        type: "extension_ui_response",
        id,
        value: (event as any).prefill ?? "",
      };
      break;

    case "notify":
    case "setStatus":
    case "setWidget":
    case "setTitle":
    case "set_editor_text":
      // These are fire-and-forget notifications — no response needed.
      // But the RPC mode still expects a response to resolve the promise.
      response = {
        type: "extension_ui_response",
        id,
        value: "",
      };
      break;

    default:
      // Unknown method — respond with cancel to avoid hanging
      console.warn(`  [warn] Unknown extension_ui_request method: ${method}, cancelling`);
      response = {
        type: "extension_ui_response",
        id,
        cancelled: true,
      };
      break;
  }

  writeToStdin(serializeJsonLine(response));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Resolve gsd-2 repo root (6 levels up from tests/integration/)
  const repoRoot = join(__dirname, "..", "..", "..", "..", "..", "..");

  console.log("=== GSD Headless Proof Script ===\n");

  // ── Step 1: Create fixture ──────────────────────────────────────────────
  console.log("[1/5] Creating fixture...");
  const fixtureDir = createFixture();
  console.log(`  Fixture created at: ${fixtureDir}`);

  // Validate fixture structure
  const requiredFiles = [
    ".gsd/PROJECT.md",
    ".gsd/STATE.md",
    ".gsd/milestones/M001/M001-CONTEXT.md",
    ".gsd/milestones/M001/M001-ROADMAP.md",
    ".gsd/milestones/M001/slices/S01/S01-PLAN.md",
    ".gsd/milestones/M001/slices/S01/tasks/T01-PLAN.md",
  ];

  for (const file of requiredFiles) {
    const fullPath = join(fixtureDir, file);
    if (!existsSync(fullPath)) {
      console.error(`  FAIL: Missing fixture file: ${file}`);
      process.exit(1);
    }
    console.log(`  ✓ ${file}`);
  }

  if (DRY_RUN) {
    console.log("\n[dry-run] Fixture validated. Skipping RPC session.");
    console.log("[dry-run] Import of RpcClient: OK");
    console.log("[dry-run] All checks passed.\n");
    cleanup(fixtureDir);
    process.exit(0);
  }

  // ── Step 2: Validate environment ────────────────────────────────────────
  console.log("\n[2/5] Validating environment...");

  // Auth: prefer OAuth credentials from ~/.gsd/agent/auth.json (D013).
  // Fall back to ANTHROPIC_API_KEY env var if present.
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
    console.log("  ✓ OAuth credentials found in ~/.gsd/agent/auth.json (Claude Code Max)");
  } else if (process.env.ANTHROPIC_API_KEY) {
    console.log("  ✓ ANTHROPIC_API_KEY present (env var fallback)");
  } else {
    console.error("  FAIL: No auth available. Need either:");
    console.error("    - OAuth credentials in ~/.gsd/agent/auth.json (Claude Code Max)");
    console.error("    - ANTHROPIC_API_KEY environment variable");
    cleanup(fixtureDir);
    process.exit(1);
  }

  const cliPath = join(repoRoot, "dist", "cli.js");
  if (!existsSync(cliPath)) {
    console.error(`  FAIL: CLI not found at ${cliPath}. Run 'npm run build' first.`);
    cleanup(fixtureDir);
    process.exit(1);
  }
  console.log(`  ✓ CLI found at ${cliPath}`);

  // ── Step 3: Spawn GSD via RpcClient ─────────────────────────────────────
  console.log("\n[3/5] Starting RPC session...");

  // Don't override env — child inherits process.env which includes HOME
  // for OAuth credential discovery via ~/.gsd/agent/auth.json (D013).
  const client = new RpcClient({
    cliPath,
    cwd: fixtureDir,
  });

  const tracker = createEventTracker();

  // Access the internal process for writing extension_ui_response
  // RpcClient doesn't expose this, so we use a controlled access pattern
  let stdinWriter: ((data: string) => void) | null = null;

  client.onEvent((event) => {
    const eventObj = event as unknown as Record<string, unknown>;
    tracker.track(eventObj);

    // Handle extension_ui_request events
    if (eventObj.type === "extension_ui_request" && stdinWriter) {
      handleExtensionUIRequest(
        eventObj as unknown as ExtensionUIRequest,
        stdinWriter,
      );
    }
  });

  try {
    await client.start();
    console.log("  ✓ RPC session started");

    // Get access to stdin writer via the internal process
    // We access this through the client's private field — acceptable for a test script
    const internalProcess = (client as any).process as import("node:child_process").ChildProcess;
    if (!internalProcess?.stdin) {
      throw new Error("Cannot access child process stdin for extension_ui_response");
    }
    stdinWriter = (data: string) => {
      internalProcess.stdin!.write(data);
    };

    // ── Step 4: Send /gsd auto ──────────────────────────────────────────
    console.log("\n[4/5] Dispatching /gsd auto...");

    // The agent expects a user message. /gsd auto is a slash command,
    // so we send it as a prompt and the command router handles it.
    const eventsPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const summary = tracker.getSummary();
        console.error(`\n  TIMEOUT after ${TIMEOUT_MS / 1000}s`);
        console.error("  Last events:");
        for (const e of summary.lastEvents) {
          console.error(`    ${e.type}${e.detail ? `: ${e.detail}` : ""}`);
        }
        console.error(`\n  Stderr:\n${client.getStderr().slice(-2000)}`);
        reject(new Error(`Timeout after ${TIMEOUT_MS / 1000}s waiting for agent_end`));
      }, TIMEOUT_MS);

      // Track agent_end across potentially multiple turns.
      // Auto-mode dispatches a fresh session per unit. The first agent_end
      // after we send /gsd auto might just be the command handler finishing.
      // The real task execution happens in a subsequent session.
      // We wait until we see a tool_execution_start followed by an agent_end.
      let sawToolExecution = false;

      client.onEvent((event) => {
        if (event.type === "tool_execution_start") {
          sawToolExecution = true;
        }
        if (event.type === "agent_end" && sawToolExecution) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    await client.prompt("/gsd auto");
    console.log("  ✓ /gsd auto dispatched");

    console.log("  Waiting for task completion...");
    await eventsPromise;
    console.log("  ✓ agent_end received (with tool_use)");

  } catch (error) {
    const summary = tracker.getSummary();
    console.error("\n=== FAILURE ===");
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`\nEvent summary: ${JSON.stringify(summary.byType, null, 2)}`);
    console.error(`Tool calls: ${summary.toolUseCount}`);
    console.error(`Errors: ${summary.errors.join(", ") || "none"}`);
    console.error(`\nLast events:`);
    for (const e of summary.lastEvents) {
      console.error(`  ${e.type}${e.detail ? `: ${e.detail}` : ""}`);
    }
    console.error(`\nStderr (last 2000 chars):\n${client.getStderr().slice(-2000)}`);

    await client.stop();
    cleanup(fixtureDir);
    process.exit(1);
  }

  // ── Step 5: Verify and summarize ────────────────────────────────────────
  console.log("\n[5/5] Verifying results...");

  const summary = tracker.getSummary();
  let allPassed = true;

  // Check 1: tool_use events occurred
  const toolCheck = summary.toolUseCount > 0;
  console.log(`  ${toolCheck ? "✓" : "✗"} Tool calls: ${summary.toolUseCount}`);
  if (!toolCheck) allPassed = false;

  // Check 2: agent_end received
  const endCheck = summary.agentEndReceived;
  console.log(`  ${endCheck ? "✓" : "✗"} agent_end received: ${endCheck}`);
  if (!endCheck) allPassed = false;

  // Check 3: Task artifact exists (hello.txt)
  const helloPath = join(fixtureDir, "hello.txt");
  const artifactExists = existsSync(helloPath);
  console.log(`  ${artifactExists ? "✓" : "✗"} hello.txt exists: ${artifactExists}`);
  if (!artifactExists) allPassed = false;

  if (artifactExists) {
    const content = readFileSync(helloPath, "utf-8").trim();
    const contentMatch = content === "Hello from headless GSD";
    console.log(`  ${contentMatch ? "✓" : "~"} hello.txt content: "${content.slice(0, 60)}"`);
  }

  // Check 4: No critical errors
  const noErrors = summary.errors.length === 0;
  console.log(`  ${noErrors ? "✓" : "~"} Errors: ${summary.errors.length === 0 ? "none" : summary.errors.join(", ")}`);

  // ── Structured Summary ──────────────────────────────────────────────────
  console.log("\n=== Event Summary ===");
  console.log(`  Total events: ${summary.total}`);
  console.log(`  Event types: ${JSON.stringify(summary.byType)}`);
  console.log(`  Tool calls: ${summary.toolUseCount}`);
  console.log(`  Extension UI requests: ${summary.extensionUIRequests}`);
  console.log(`  agent_end received: ${summary.agentEndReceived}`);

  // Stop client
  await client.stop();

  // Cleanup
  cleanup(fixtureDir);

  // Exit
  if (allPassed) {
    console.log("\n=== PASSED ===\n");
    process.exit(0);
  } else {
    console.log("\n=== FAILED ===\n");
    process.exit(1);
  }
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort
    console.warn(`  [warn] Failed to clean up temp dir: ${dir}`);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
