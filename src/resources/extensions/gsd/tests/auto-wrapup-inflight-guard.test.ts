// GSD-2 — Regression tests for #3512: gsd-auto-wrapup mid-turn interruption
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { autoSession } from "../auto-runtime-state.ts";
import { dispatchHookUnit } from "../auto.ts";
import { registerHooks } from "../bootstrap/register-hooks.ts";
import { clearDiscussionFlowState, getPendingGate } from "../bootstrap/write-gate.ts";

const autoTimersPath = join(import.meta.dirname, "..", "auto-timers.ts");
const autoTimersSrc = readFileSync(autoTimersPath, "utf-8");

const autoPath = join(import.meta.dirname, "..", "auto.ts");
const autoSrc = readFileSync(autoPath, "utf-8");

const runUnitPath = join(import.meta.dirname, "..", "auto", "run-unit.ts");
const runUnitSrc = readFileSync(runUnitPath, "utf-8");

const registerHooksPath = join(import.meta.dirname, "..", "bootstrap", "register-hooks.ts");
const registerHooksSrc = readFileSync(registerHooksPath, "utf-8");

function makeHookHarness() {
  const handlers = new Map<string, Array<(event: any, ctx: any) => Promise<any>>>();
  const pi = {
    on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
      const current = handlers.get(name) ?? [];
      current.push(handler);
      handlers.set(name, current);
    },
  };
  const ctx = {
    ui: {
      notify: () => {},
      setStatus: () => {},
      setWidget: () => {},
    },
    modelRegistry: {
      setDisabledModelProviders: () => {},
    },
    setCompactionThresholdOverride: () => {},
  };
  async function emit(name: string, event: any): Promise<any> {
    for (const handler of handlers.get(name) ?? []) {
      const result = await handler(event, ctx);
      if (result?.block) return result;
    }
    return undefined;
  }
  registerHooks(pi as any, []);
  return { emit };
}

describe("#3512: gsd-auto-wrapup must not interrupt in-flight tool calls", () => {
  test("soft timeout wrapup gates triggerTurn on getInFlightToolCount() === 0", () => {
    // The soft timeout sendMessage must NOT use a hardcoded `triggerTurn: true`.
    // It must check getInFlightToolCount() before deciding whether to trigger.
    // Use the section marker comment to isolate the soft timeout block.
    const startMarker = "── 1. Soft timeout warning";
    const endMarker = "── 2. Idle watchdog";
    const softTimeoutSection = autoTimersSrc.slice(
      autoTimersSrc.indexOf(startMarker),
      autoTimersSrc.indexOf(endMarker),
    );
    assert.ok(
      softTimeoutSection.length > 0,
      "Could not locate soft timeout section",
    );

    // Must reference getInFlightToolCount to gate the trigger
    assert.ok(
      softTimeoutSection.includes("getInFlightToolCount"),
      "Soft timeout wrapup must gate triggerTurn behind getInFlightToolCount() check",
    );

    // Must NOT have a hardcoded triggerTurn: true
    assert.ok(
      !softTimeoutSection.includes("triggerTurn: true"),
      "Soft timeout wrapup must not use hardcoded triggerTurn: true",
    );
  });

  test("context-pressure wrapup gates triggerTurn on getInFlightToolCount() === 0", () => {
    // The context budget sendMessage must NOT use a hardcoded `triggerTurn: true`.
    // Use the section marker to isolate the context-pressure block.
    const startMarker = "── 4. Context-pressure continue-here monitor";
    const contextSection = autoTimersSrc.slice(
      autoTimersSrc.indexOf(startMarker),
    );
    assert.ok(
      contextSection.length > 0,
      "Could not locate context budget section",
    );

    // Must reference getInFlightToolCount to gate the trigger
    assert.ok(
      contextSection.includes("getInFlightToolCount"),
      "Context budget wrapup must gate triggerTurn behind getInFlightToolCount() check",
    );

    // Must NOT have a hardcoded triggerTurn: true
    assert.ok(
      !contextSection.includes("triggerTurn: true"),
      "Context budget wrapup must not use hardcoded triggerTurn: true",
    );
  });
});

describe("hook dispatch session workspace root", () => {
  test("dispatchHookUnit passes basePath explicitly to newSession", async (t) => {
    const originalCwd = process.cwd();
    const basePath = mkdtempSync(join(tmpdir(), "gsd-hook-cwd-"));
    mkdirSync(join(basePath, ".gsd"), { recursive: true });
    autoSession.reset();
    t.after(() => {
      try {
        process.chdir(originalCwd);
      } catch {
        // best effort cleanup after cwd-sensitive dispatch tests
      }
      autoSession.reset();
      rmSync(basePath, { recursive: true, force: true });
    });

    let newSessionOptions: unknown;
    const ctx = {
      ui: {
        notify: () => {},
        setStatus: () => {},
        setWidget: () => {},
      },
      modelRegistry: {
        getAvailable: () => [],
      },
      sessionManager: {
        getSessionFile: () => join(basePath, "session.jsonl"),
      },
      newSession: async (options?: unknown) => {
        newSessionOptions = options;
        return { cancelled: false };
      },
    };
    const pi = {
      sendMessage: () => {},
      setModel: async () => true,
    };

    const dispatched = await dispatchHookUnit(
      ctx as any,
      pi as any,
      "review",
      "execute-task",
      "M001/S01/T01",
      "review the completed unit",
      undefined,
      basePath,
    );

    assert.equal(dispatched, true);
    assert.deepEqual(newSessionOptions, { workspaceRoot: basePath });
  });
});

describe("#4276: pending/skipped tools stay visible to auto-mode hooks", () => {
  test("tool_call handler marks GSD tools in-flight before execution_start", () => {
    const startMarker = 'pi.on("tool_call", async (event, ctx) => {';
    const endMarker = 'pi.on("tool_result", async (event, ctx) => {';
    const toolCallSection = registerHooksSrc.slice(
      registerHooksSrc.indexOf(startMarker),
      registerHooksSrc.indexOf(endMarker),
    );

    assert.ok(toolCallSection.length > 0, "Could not locate tool_call handler section");
    assert.ok(
      toolCallSection.includes("markToolStart(event.toolCallId, event.toolName)"),
      "tool_call handler must mark tools pending before tool_execution_start fires",
    );
  });

  test("tool_result handler clears pending tools and records queued-skip errors", () => {
    const startMarker = 'pi.on("tool_result", async (event, ctx) => {';
    const endMarker = 'pi.on("tool_execution_start", async (event) => {';
    const toolResultSection = registerHooksSrc.slice(
      registerHooksSrc.indexOf(startMarker),
      registerHooksSrc.indexOf(endMarker),
    );

    assert.ok(toolResultSection.length > 0, "Could not locate tool_result handler section");
    assert.ok(
      toolResultSection.includes("markToolEnd(event.toolCallId)"),
      "tool_result handler must clear pending tool tracking even when execution hooks never fire",
    );
    assert.ok(
      toolResultSection.includes("recordToolInvocationError(event.toolName, errorText)"),
      "tool_result handler must surface queued-skip errors for GSD tools",
    );
  });
});

describe("#3512: pauseAuto and stopAuto must flush queued follow-up messages", () => {
  test("stopAuto calls clearQueue()", () => {
    // stopAuto must flush queued messages to prevent late async_job_result
    // notifications from triggering extra LLM turns after stop.
    const stopAutoSection = autoSrc.slice(
      autoSrc.indexOf("export async function stopAuto("),
      autoSrc.indexOf("export async function pauseAuto("),
    );
    assert.ok(stopAutoSection, "Could not locate stopAuto function");
    assert.ok(
      stopAutoSection.includes("clearQueue"),
      "stopAuto must call clearQueue() to flush queued follow-up messages",
    );
  });

  test("pauseAuto calls clearQueue()", () => {
    // pauseAuto must also flush queued messages — same issue as stopAuto.
    const pauseAutoSection = autoSrc.slice(
      autoSrc.indexOf("export async function pauseAuto("),
    );
    assert.ok(pauseAutoSection, "Could not locate pauseAuto function");
    assert.ok(
      pauseAutoSection.includes("clearQueue"),
      "pauseAuto must call clearQueue() to flush queued follow-up messages",
    );
  });

  test("pauseAuto rebuilds STATE.md before releasing the session lock", () => {
    // pauseAuto must persist the DB-backed state projection so resume/debugging
    // does not see a stale STATE.md after a mid-unit interruption.
    const start = autoSrc.indexOf("export async function pauseAuto(");
    const end = autoSrc.indexOf("/**\n * Build a WorktreeResolverDeps", start);
    const pauseAutoSection = autoSrc.slice(start, end);
    assert.ok(pauseAutoSection.length > 0, "Could not locate pauseAuto function");

    const rebuildIndex = pauseAutoSection.indexOf("await rebuildState(s.basePath)");
    const releaseIndex = pauseAutoSection.indexOf("releaseSessionLock(lockBase())");
    assert.ok(
      rebuildIndex >= 0,
      "pauseAuto must rebuild STATE.md from DB-backed state before pause completes",
    );
    assert.ok(
      releaseIndex >= 0,
      "pauseAuto must still release the session lock",
    );
    assert.ok(
      rebuildIndex < releaseIndex,
      "pauseAuto must rebuild state before releasing the session lock",
    );
  });

  test("run-unit.ts still has its existing clearQueue() call (baseline)", () => {
    // Verify the original clearQueue pattern in run-unit.ts hasn't been removed.
    assert.ok(
      runUnitSrc.includes("clearQueue"),
      "run-unit.ts must retain its clearQueue() call after unit completion",
    );
  });
});

describe("#4365: tool_execution_start hook must pass toolName to markToolStart", () => {
  test("tool_execution_start handler passes event.toolName to markToolStart", () => {
    // The tool_execution_start handler must forward toolName so that
    // hasInteractiveToolInFlight() can correctly identify ask_user_questions
    // and prevent the idle watchdog from firing during interactive tool calls.
    const startMarker = 'pi.on("tool_execution_start", async (event) => {';
    const endMarker = 'pi.on("tool_execution_end", async (event) => {';
    const toolExecutionStartSection = registerHooksSrc.slice(
      registerHooksSrc.indexOf(startMarker),
      registerHooksSrc.indexOf(endMarker),
    );

    assert.ok(
      toolExecutionStartSection.length > 0,
      "Could not locate tool_execution_start handler section",
    );
    assert.ok(
      toolExecutionStartSection.includes("markToolStart(event.toolCallId, event.toolName)"),
      "tool_execution_start handler must pass event.toolName to markToolStart so hasInteractiveToolInFlight() works correctly",
    );
  });
});

describe("deep setup approval questions pause immediately", () => {
  test("register-hooks defers the pending gate during message_update without aborting the stream", () => {
    const startMarker = 'pi.on("message_update"';
    const endMarker = 'pi.on("session_shutdown"';
    const messageUpdateSection = registerHooksSrc.slice(
      registerHooksSrc.indexOf(startMarker),
      registerHooksSrc.indexOf(endMarker),
    );

    assert.ok(
      messageUpdateSection.length > 0,
      "Could not locate message_update approval pause handler",
    );
    assert.ok(
      messageUpdateSection.includes("shouldPauseForUserApprovalQuestion"),
      "message_update must detect approval/question boundaries",
    );
    assert.ok(
      messageUpdateSection.includes("approvalGateIdForUnit") && messageUpdateSection.includes("deferApprovalGate"),
      "plain-text approval questions must defer the durable write gate until same-turn draft persistence can finish",
    );
    assert.ok(
      messageUpdateSection.includes("getDiscussionMilestoneIdFor") && messageUpdateSection.includes('"discuss-milestone"'),
      "foreground milestone discussion questions must also set the durable write gate",
    );
    assert.ok(
      !messageUpdateSection.includes("ctx.abort()"),
      "message_update must NOT abort the stream — aborting eats the model's question text on external CLI providers; the pending gate set above blocks subsequent tool calls instead",
    );
  });

  test("plain-text approval boundary defers durable gate until same-turn CONTEXT-DRAFT can save", async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-deferred-approval-")));
    const previousCwd = process.cwd();
    try {
      mkdirSync(join(base, ".gsd", "milestones", "M003"), { recursive: true });
      process.chdir(base);
      clearDiscussionFlowState(base);
      autoSession.reset();
      autoSession.basePath = base;
      autoSession.currentUnit = {
        type: "discuss-milestone",
        id: "M003",
        startedAt: Date.now(),
      };

      const { emit } = makeHookHarness();
      await emit("message_update", {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Did I capture that correctly? If not, tell me what I missed." }],
        },
      });

      assert.equal(
        getPendingGate(base),
        null,
        "approval text should not install the durable pending gate until the assistant turn ends",
      );

      const draftResult = await emit("tool_call", {
        toolCallId: "draft-save",
        toolName: "gsd_summary_save",
        input: {
          milestone_id: "M003",
          artifact_type: "CONTEXT-DRAFT",
          content: "# M003 Draft\n",
        },
      });
      assert.equal(
        draftResult?.block,
        undefined,
        "same-turn CONTEXT-DRAFT persistence should remain allowed after the approval text streams",
      );

      const finalContextResult = await emit("tool_call", {
        toolCallId: "final-context",
        toolName: "gsd_summary_save",
        input: {
          milestone_id: "M003",
          artifact_type: "CONTEXT",
          content: "# M003 Context\n",
        },
      });
      assert.equal(finalContextResult?.block, true, "final CONTEXT must still wait for approval");
      assert.match(finalContextResult.reason, /Approval question "depth_verification_M003_confirm"/);

      await emit("agent_end", { messages: [] });
      assert.equal(
        getPendingGate(base),
        "depth_verification_M003_confirm",
        "agent_end should activate the durable pending gate for the next turn",
      );
    } finally {
      process.chdir(previousCwd);
      autoSession.reset();
      clearDiscussionFlowState(base);
      rmSync(base, { recursive: true, force: true });
    }
  });
});
