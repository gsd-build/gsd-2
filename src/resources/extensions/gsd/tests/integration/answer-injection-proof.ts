/**
 * Answer Injection Proof Script — GSD 2 Headless with Pre-Supplied Answers
 *
 * Proves that the answer injection middleware intercepts `ask_user_questions`
 * tool calls at runtime, provides answers from a JSON file, and allows the
 * session to complete without human interaction.
 *
 * Strategy: Create a fixture with a task that explicitly instructs the LLM
 * to call `ask_user_questions` with specific question IDs. The answer injector
 * matches those IDs against the answer file and responds automatically.
 *
 * Auth: Uses OAuth credentials from ~/.gsd/agent/auth.json (Claude Code Max).
 * Falls back to ANTHROPIC_API_KEY env var if OAuth is not configured.
 * See D013 for rationale.
 *
 * Usage:
 *   npx tsx src/resources/extensions/gsd/tests/integration/answer-injection-proof.ts
 *
 *   Add --dry-run to validate imports, answer file, and fixture without
 *   spawning GSD or making API calls.
 */

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { execSync } from "node:child_process";

// ── RpcClient import (per D011) ─────────────────────────────────────────────
import { RpcClient } from "../../../../../../packages/pi-coding-agent/dist/modes/rpc/rpc-client.js";

// ── Answer injection modules from T01 ───────────────────────────────────────
import { loadAnswerFile, parseAnswerFile } from "./answer-schema.js";
import { createAnswerInjector, type InjectorStats } from "./answer-injector.js";

// ── Types ───────────────────────────────────────────────────────────────────

interface ExtensionUIRequest {
  type: "extension_ui_request";
  id: string;
  method: string;
  title?: string;
  options?: string[];
  message?: string;
  timeout?: number;
  allowMultiple?: boolean;
  [key: string]: unknown;
}

interface EventSummary {
  total: number;
  byType: Record<string, number>;
  toolUseCount: number;
  agentEndReceived: boolean;
  extensionUIRequests: number;
  errors: string[];
  lastEvents: Array<{ type: string; timestamp: number; detail?: string }>;
}

// ── JSONL helper ────────────────────────────────────────────────────────────

function serializeJsonLine(obj: Record<string, unknown>): string {
  return JSON.stringify(obj) + "\n";
}

// ── Configuration ───────────────────────────────────────────────────────────

const TIMEOUT_MS = parseInt(process.env.HEADLESS_TIMEOUT_MS ?? "300000", 10); // 5 min
const DRY_RUN = process.argv.includes("--dry-run");

// ── Fixture Data ────────────────────────────────────────────────────────────
// The task explicitly instructs the LLM to use ask_user_questions,
// creating a predictable trigger for the answer injector.

const FIXTURE_PROJECT_MD = `# Project

## What This Is

Answer injection proof project. A test fixture that forces the agent to call
\`ask_user_questions\` so we can verify pre-supplied answers are injected.

## Core Value

Proves answer injection works end-to-end.

## Current State

Executing M001/S01/T01 — the task surveys the user about preferences.

## Architecture / Key Patterns

- Single milestone, single slice, single task

## Capability Contract

None.

## Milestone Sequence

- [ ] M001: Answer Injection Proof
`;

const FIXTURE_STATE_MD = `# GSD State

**Active Milestone:** M001 — Answer Injection Proof
**Active Slice:** S01 — Survey & Configure
**Phase:** executing
**Requirements Status:** 0 active · 0 validated · 0 deferred · 0 out of scope

## Milestone Registry
- 🔄 **M001:** Answer Injection Proof

## Recent Decisions
- None recorded

## Blockers
- None

## Next Action
Execute T01: Survey user preferences and write config.
`;

const FIXTURE_CONTEXT_MD = `# M001: Answer Injection Proof — Context

**Gathered:** 2025-01-01
**Status:** Ready for execution

## Project Description

A test project for proving answer injection in headless GSD mode.

## Why This Milestone

Validates that ask_user_questions tool calls can be intercepted and
answered from a JSON file during headless operation.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run GSD headlessly with a pre-supplied answer file

### Entry point / environment

- Entry point: RPC mode via proof script
- Environment: local dev
- Live dependencies involved: none

## Completion Class

- Contract complete means: agent uses the injected answers
- Integration complete means: not applicable
- Operational complete means: not applicable

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- Agent called ask_user_questions and received pre-supplied answers

## Risks and Unknowns

- None

## Existing Codebase / Prior Art

- None

## Relevant Requirements

- None

## Scope

### In Scope

- Calling ask_user_questions and using the answers

### Out of Scope / Non-Goals

- Everything else

## Technical Constraints

- None

## Integration Points

- None

## Open Questions

- None
`;

const FIXTURE_ROADMAP_MD = `# M001: Answer Injection Proof

**Vision:** Prove that GSD can operate headlessly with pre-supplied answers.

## Success Criteria

- Agent calls ask_user_questions, receives answers from the injector, writes a config file

## Key Risks / Unknowns

- None

## Slices

- [ ] **S01: Survey & Configure** \`risk:low\` \`depends:[]\`
  > After this: config.json exists with user-selected preferences

## Boundary Map

### S01

Produces:
- config.json in project root

Consumes:
- nothing (first slice)
`;

const FIXTURE_PLAN_MD = `# S01: Survey & Configure

**Goal:** Ask the user about their project preferences and write a config file.
**Demo:** config.json exists with the user's choices.

## Must-Haves

- config.json created with user-selected preferences from ask_user_questions

## Verification

- File config.json exists in project root with preference values

## Tasks

- [ ] **T01: Survey preferences and write config** \`est:5m\`
  - Why: Forces the agent to call ask_user_questions, proving injection works
  - Files: \`config.json\`
  - Do: Use ask_user_questions to ask the user about preferences, then write config.json
  - Verify: config.json exists with values from the survey
  - Done when: config.json exists with preference values

## Files Likely Touched

- \`config.json\`
`;

// The task plan explicitly tells the LLM to call ask_user_questions.
// This is the key fixture — it creates a predictable trigger.
const FIXTURE_TASK_PLAN_MD = `---
estimated_steps: 2
estimated_files: 1
---

# T01: Survey preferences and write config

**Slice:** S01 — Survey & Configure
**Milestone:** M001

## Description

Survey the user about their project preferences using ask_user_questions,
then write a config.json file with their answers.

## Steps

1. Call ask_user_questions with a single question asking about the user's preferred
   programming language. Use question id "language_preference", header "Language",
   and provide these options:
   - TypeScript (Recommended)
   - Python
   - Go

2. Write config.json in the project root with the survey results:
   \`\`\`json
   {
     "language": "<selected language>"
   }
   \`\`\`

## Must-Haves

- [ ] ask_user_questions called with question id "language_preference"
- [ ] config.json written with the selected language

## Verification

- config.json exists in project root with a language field

## Expected Output

- \`config.json\` — configuration file with survey results
`;

// ── Fixture Creation ────────────────────────────────────────────────────────

function createFixture(): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "gsd-answer-injection-proof-"));

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

  // .gitignore for runtime files
  writeFileSync(join(tmpDir, ".gitignore"), [
    ".gsd/auto.lock",
    ".gsd/completed-units.json",
    ".gsd/metrics.json",
    ".gsd/activity/",
    ".gsd/runtime/",
  ].join("\n") + "\n");

  // Initial commit
  execSync("git add -A && git commit -m 'init: answer injection proof fixture'", {
    cwd: tmpDir,
    stdio: "pipe",
  });

  return tmpDir;
}

// ── Event Tracking ──────────────────────────────────────────────────────────
// Extends S02's tracker with injector-aware tracking.

function createEventTracker() {
  const events: Array<Record<string, unknown>> = [];
  const summary: EventSummary = {
    total: 0,
    byType: {},
    toolUseCount: 0,
    agentEndReceived: false,
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
        summary.agentEndReceived = true;
      }
      if (type === "extension_ui_request") {
        summary.extensionUIRequests++;
      }
      if (type === "error") {
        summary.errors.push(String(event.message ?? event.error ?? "unknown error"));
      }

      // Ring buffer of last 20 events for diagnostics
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

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Resolve gsd-2 repo root (6 levels up from tests/integration/)
  const repoRoot = join(__dirname, "..", "..", "..", "..", "..", "..");

  // Resolve answer file path
  const answerFilePath = join(__dirname, "fixtures", "answer-file.json");

  console.log("=== GSD Answer Injection Proof Script ===\n");

  // ── Step 1: Load and validate answer file ───────────────────────────────
  console.log("[1/6] Loading answer file...");

  if (!existsSync(answerFilePath)) {
    console.error(`  FAIL: Answer file not found at ${answerFilePath}`);
    process.exit(1);
  }

  const answerFile = await loadAnswerFile(answerFilePath);
  console.log(`  ✓ Answer file loaded and validated`);
  console.log(`  ✓ Questions defined: ${Object.keys(answerFile.questions).length}`);
  console.log(`  ✓ Secrets defined: ${Object.keys(answerFile.secrets).length} (keys only: ${Object.keys(answerFile.secrets).join(", ")})`);
  console.log(`  ✓ Default strategy: ${answerFile.defaults.strategy}`);

  // ── Step 2: Create fixture ──────────────────────────────────────────────
  console.log("\n[2/6] Creating fixture...");
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
      cleanup(fixtureDir);
      process.exit(1);
    }
    console.log(`  ✓ ${file}`);
  }

  // ── Step 3: Create answer injector ──────────────────────────────────────
  console.log("\n[3/6] Creating answer injector...");
  const injector = createAnswerInjector(answerFile);
  console.log("  ✓ Answer injector created");

  // Validate injector interface
  const initialStats = injector.getStats();
  if (typeof initialStats.questionsAnswered !== "number") {
    console.error("  FAIL: Injector getStats() doesn't return expected shape");
    cleanup(fixtureDir);
    process.exit(1);
  }
  console.log("  ✓ Injector stats interface verified");

  // Also verify parseAnswerFile works for inline validation
  try {
    parseAnswerFile(JSON.parse(readFileSync(answerFilePath, "utf8")));
    console.log("  ✓ parseAnswerFile() inline validation works");
  } catch (err: any) {
    console.error(`  FAIL: parseAnswerFile() threw: ${err.message}`);
    cleanup(fixtureDir);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\n[dry-run] All imports validated:");
    console.log("  ✓ RpcClient imported");
    console.log("  ✓ loadAnswerFile imported and works");
    console.log("  ✓ parseAnswerFile imported and works");
    console.log("  ✓ createAnswerInjector imported and works");
    console.log("  ✓ Fixture created and validated");
    console.log("\n[dry-run] Answer file validation (reject malformed):");

    // Test reject malformed
    const malformedCases: Array<{ name: string; data: unknown }> = [
      { name: "missing defaults", data: { questions: {}, secrets: {} } },
      { name: "wrong type in questions", data: { questions: { a: 123 }, secrets: {}, defaults: { strategy: "first_option" } } },
      { name: "invalid strategy", data: { questions: {}, secrets: {}, defaults: { strategy: "yolo" } } },
      { name: "missing secrets", data: { questions: {}, defaults: { strategy: "first_option" } } },
    ];

    for (const { name, data } of malformedCases) {
      try {
        parseAnswerFile(data);
        console.error(`  ✗ ${name}: should have thrown`);
      } catch (err: any) {
        console.log(`  ✓ ${name}: rejected — ${err.message.slice(0, 60)}`);
      }
    }

    console.log("\n[dry-run] All checks passed.\n");
    cleanup(fixtureDir);
    process.exit(0);
  }

  // ── Step 4: Validate environment ────────────────────────────────────────
  console.log("\n[4/6] Validating environment...");

  // Auth: prefer OAuth credentials from ~/.gsd/agent/auth.json (D013).
  // Fall back to ANTHROPIC_API_KEY env var if present.
  const authJsonPath = join(homedir(), ".gsd", "agent", "auth.json");
  let hasOAuth = false;
  if (existsSync(authJsonPath)) {
    try {
      const authData = JSON.parse(readFileSync(authJsonPath, "utf-8"));
      hasOAuth = authData?.anthropic?.type === "oauth";
    } catch {
      // Non-fatal — fall through to API key check
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
    console.error("  Hint: use --dry-run to validate without auth.");
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

  // ── Step 5: Run RPC session with answer injection ─────────────────────
  console.log("\n[5/6] Starting RPC session with answer injection...");

  const startTime = Date.now();
  // Don't override env — child inherits process.env which includes HOME
  // for OAuth credential discovery via ~/.gsd/agent/auth.json (D013).
  // If ANTHROPIC_API_KEY is set in env, it also gets inherited as fallback.
  const client = new RpcClient({
    cliPath,
    cwd: fixtureDir,
  });

  const tracker = createEventTracker();

  // Access internal process for writing extension_ui_response (per D012)
  let stdinWriter: ((data: string) => void) | null = null;

  client.onEvent((event) => {
    const eventObj = event as unknown as Record<string, unknown>;
    tracker.track(eventObj);

    // Wire answer injector for extension_ui_request events
    if (eventObj.type === "extension_ui_request" && stdinWriter) {
      const consumed = injector.handleEvent(eventObj, stdinWriter);
      if (!consumed) {
        // Fallback: respond to unhandled events to avoid hanging
        console.warn(`  [WARN] Unhandled extension_ui_request, sending empty response`);
        stdinWriter(serializeJsonLine({
          type: "extension_ui_response",
          id: eventObj.id,
          value: "",
        }));
      }
    }

    // Also let the injector observe tool_execution_start events
    // (it needs these for phase-1 correlation — may arrive AFTER
    // the corresponding extension_ui_request due to async queue)
    if (eventObj.type === "tool_execution_start") {
      injector.handleEvent(eventObj, stdinWriter ?? (() => {}));
    }
  });

  try {
    await client.start();
    console.log("  ✓ RPC session started");

    // Get access to stdin writer via internal process (per D012)
    const internalProcess = (client as any).process as import("node:child_process").ChildProcess;
    if (!internalProcess?.stdin) {
      throw new Error("Cannot access child process stdin for extension_ui_response");
    }
    stdinWriter = (data: string) => {
      internalProcess.stdin!.write(data);
    };

    // Dispatch /gsd auto
    console.log("  Dispatching /gsd auto...");

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

      // Wait for tool execution followed by agent_end (same pattern as S02)
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
    const stats = injector.getStats();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.error("\n=== FAILURE ===");
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`Duration: ${duration}s`);
    console.error(`\nInjector stats: ${JSON.stringify(stats, null, 2)}`);
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

  // ── Step 6: Verify and summarize ────────────────────────────────────────
  console.log("\n[6/6] Verifying results...");

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = tracker.getSummary();
  const stats = injector.getStats();
  let allPassed = true;

  // Check 1: At least one question answered from file (not just defaulted)
  const questionsCheck = stats.questionsAnswered >= 1;
  console.log(`  ${questionsCheck ? "✓" : "✗"} questions_answered: ${stats.questionsAnswered} (need >= 1)`);
  if (!questionsCheck) allPassed = false;

  // Check 2: Session completed (agent_end received)
  const sessionCheck = summary.agentEndReceived;
  console.log(`  ${sessionCheck ? "✓" : "✗"} session_completed: ${sessionCheck}`);
  if (!sessionCheck) allPassed = false;

  // Check 3: Tool calls occurred
  const toolCheck = summary.toolUseCount > 0;
  console.log(`  ${toolCheck ? "✓" : "✗"} tool_calls: ${summary.toolUseCount}`);
  if (!toolCheck) allPassed = false;

  // Check 4: No critical errors
  const noErrors = summary.errors.length === 0;
  console.log(`  ${noErrors ? "✓" : "~"} errors: ${summary.errors.length === 0 ? "none" : summary.errors.join(", ")}`);

  // Check 5: config.json exists (task artifact)
  const configPath = join(fixtureDir, "config.json");
  const configExists = existsSync(configPath);
  console.log(`  ${configExists ? "✓" : "~"} config.json exists: ${configExists}`);
  if (configExists) {
    try {
      const configContent = readFileSync(configPath, "utf-8");
      console.log(`  ✓ config.json content: ${configContent.trim().slice(0, 100)}`);
    } catch {
      console.log(`  ~ config.json: could not read`);
    }
  }

  // ── Structured Summary ────────────────────────────────────────────────
  console.log("\n=== Structured Summary ===");
  console.log(`  duration: ${duration}s`);
  console.log(`  session_completed: ${summary.agentEndReceived}`);

  console.log("\n  --- Injector Stats ---");
  console.log(`  questions_answered: ${stats.questionsAnswered}`);
  console.log(`  questions_defaulted: ${stats.questionsDefaulted}`);
  console.log(`  secrets_provided: ${stats.secretsProvided}`);
  console.log(`  secrets_missing: ${stats.secretsMissing}`);
  console.log(`  fire_and_forget_consumed: ${stats.fireAndForgetConsumed}`);
  console.log(`  confirmations_handled: ${stats.confirmationsHandled}`);

  console.log("\n  --- Event Histogram ---");
  console.log(`  total_events: ${summary.total}`);
  for (const [type, count] of Object.entries(summary.byType).sort()) {
    console.log(`  ${type}: ${count}`);
  }

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
    console.warn(`  [warn] Failed to clean up temp dir: ${dir}`);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
