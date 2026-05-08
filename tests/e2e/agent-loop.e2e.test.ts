/**
 * GSD-2 agent-loop e2e tests.
 *
 * Drives the real `gsd` binary through scripted prompt → tool → response
 * cycles using the fake LLM provider (packages/pi-ai/src/providers/fake.ts).
 * Three vertical slices in this first cut, per peer review:
 *   T1 - simple text response (happy path)
 *   T2 - tool-use cycle: model calls read_file, gets result, returns text
 *   T3 - error path: provider emits a 429-shaped error, agent loop exits
 *        cleanly with stopReason=error (NOT a retry — no retry loop exists)
 *
 * Failure modes "malformed" and "timeout" are deferred to a follow-up to
 * keep the first PR scoped.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import {
	createTmpProject,
	lastAssistantStopReason,
	lastAssistantText,
	parseJsonEvents,
	runWithFakeLlm,
	writeTranscript,
} from "./_shared/index.ts";

function binaryAvailable(): { ok: boolean; reason?: string } {
	const bin = process.env.GSD_SMOKE_BINARY;
	if (!bin) return { ok: false, reason: "GSD_SMOKE_BINARY not set; build with `npm run build:core` and re-export." };
	if (!existsSync(bin)) return { ok: false, reason: `binary not found at ${bin}` };
	return { ok: true };
}

describe("agent loop e2e (fake LLM)", () => {
	const avail = binaryAvailable();
	const skipReason = avail.ok ? null : avail.reason;

	test("T1: 1-turn text response is replayed end-to-end", { skip: skipReason ?? false }, (t) => {
		const project = createTmpProject();
		t.after(project.cleanup);

		const transcript = writeTranscript([
			{
				turn: 1,
				expect: { modelId: "gsd-fake-model", lastUserText: "ping" },
				emit: { kind: "text", text: "pong from fake" },
			},
		]);

		const result = runWithFakeLlm(transcript, {
			cwd: project.dir,
			prompt: "ping",
			mode: "json",
			timeoutMs: 30_000,
		});

		assert.equal(
			result.code,
			0,
			`expected exit 0, got ${result.code}. stderr=${result.stderrClean.slice(0, 800)}`,
		);
		const events = parseJsonEvents(result.stdoutClean);
		assert.equal(lastAssistantText(events), "pong from fake");
		assert.equal(lastAssistantStopReason(events), "stop");
	});

	test("T2: tool-use cycle traverses both turns with toolResult feedback", { skip: skipReason ?? false }, (t) => {
		// Verifies the multi-turn agent loop:
		//   1. Model emits tool_use
		//   2. Agent loop dispatches tool execution
		//   3. toolResult message lands back in context
		//   4. Model receives the toolResult and produces final text
		//
		// We use a tool name (`read_file`) that is not registered in print
		// mode — the loop still produces a toolResult (with an error
		// payload), which is exactly what we need to verify the LOOP
		// behavior. The fake provider's `hasToolResultFor` expectation on
		// turn 2 fails loudly if the toolResult never arrives.
		const project = createTmpProject();
		t.after(project.cleanup);

		const transcript = writeTranscript([
			{
				turn: 1,
				expect: { modelId: "gsd-fake-model", lastUserText: "use a tool" },
				emit: {
					kind: "tool_use",
					calls: [
						{
							id: "call-1",
							name: "read_file",
							input: { file_path: "/dev/null" },
						},
					],
				},
			},
			{
				turn: 2,
				expect: { hasToolResultFor: "read_file" },
				emit: { kind: "text", text: "tool cycle completed" },
			},
		]);

		const result = runWithFakeLlm(transcript, {
			cwd: project.dir,
			prompt: "use a tool",
			mode: "json",
			timeoutMs: 60_000,
			extraEnv: { GSD_TOOL_APPROVAL: "auto" },
		});

		const events = parseJsonEvents(result.stdoutClean);
		// Tool execution lifecycle events both fire — proves the loop
		// dispatched the tool call into the executor.
		assert.ok(
			events.some((e) => e.type === "tool_execution_start"),
			"expected a tool_execution_start event (loop did not dispatch the tool)",
		);
		assert.ok(
			events.some((e) => e.type === "tool_execution_end"),
			"expected a tool_execution_end event (loop did not complete tool dispatch)",
		);
		// Final assistant text comes from turn 2 — proves the second turn
		// fired with the toolResult in context (else the fake provider's
		// `hasToolResultFor` expectation would have thrown).
		assert.equal(lastAssistantText(events), "tool cycle completed");
		assert.equal(lastAssistantStopReason(events), "stop");
	});

	test("T3: provider error_429 produces stopReason=error, no retry", { skip: skipReason ?? false }, (t) => {
		const project = createTmpProject();
		t.after(project.cleanup);

		const transcript = writeTranscript([
			{
				turn: 1,
				expect: { lastUserText: "trigger 429" },
				emit: { kind: "error_429", message: "rate_limit_exceeded", retryAfterMs: 500 },
			},
		]);

		const result = runWithFakeLlm(transcript, {
			cwd: project.dir,
			prompt: "trigger 429",
			mode: "json",
			// Print mode currently hangs after an error path instead of
			// exiting (separate product issue worth a follow-up). The agent
			// stream emits everything we need before that, so we cap the
			// wait at 8s — enough for the loop to drain, fast enough that
			// CI doesn't pay 30s per run.
			timeoutMs: 8_000,
		});

		// Exit code may be non-zero on error path or null if we timed the
		// hung process out — fine. We assert via the stream that the loop
		// saw the error and reported stopReason=error.
		const events = parseJsonEvents(result.stdoutClean);
		assert.equal(
			lastAssistantStopReason(events),
			"error",
			`expected stopReason=error, got ${lastAssistantStopReason(events)}. stderr=${result.stderrClean.slice(0, 800)}`,
		);

		// errorMessage should round-trip from the fake transcript so tests can
		// verify that providers' rate-limit info is preserved through the loop.
		const found = events.find(
			(ev) =>
				ev.type === "agent_end" &&
				Array.isArray((ev as { messages?: Array<Record<string, unknown>> }).messages),
		);
		assert.ok(found, "expected an agent_end event");
		const messages = (found as { messages: Array<Record<string, unknown>> }).messages;
		const lastAssistant = [...messages]
			.reverse()
			.find((m) => (m as { role?: string }).role === "assistant") as
			| { errorMessage?: string }
			| undefined;
		assert.equal(lastAssistant?.errorMessage, "rate_limit_exceeded");
	});

	test("transcript drift: mismatched expect{} fails loudly", { skip: skipReason ?? false }, (t) => {
		// Sanity check: if the request shape doesn't match the transcript's
		// expect{}, the fake provider must throw a clear error rather than
		// silently consuming. This is what guards against prompt-template
		// drift sneaking past structural assertions.
		const project = createTmpProject();
		t.after(project.cleanup);

		const transcript = writeTranscript([
			{
				turn: 1,
				expect: { lastUserText: "this will not match" },
				emit: { kind: "text", text: "should never be emitted" },
			},
		]);

		const result = runWithFakeLlm(transcript, {
			cwd: project.dir,
			prompt: "different prompt",
			mode: "json",
			// Same hang-after-error caveat as T3.
			timeoutMs: 8_000,
		});

		// Expect a stopReason=error path because the fake provider threw
		// during stream() — agent loop catches and reports the error.
		const events = parseJsonEvents(result.stdoutClean);
		assert.equal(
			lastAssistantStopReason(events),
			"error",
			`expected stopReason=error from drift mismatch, got ${lastAssistantStopReason(events)}`,
		);
	});
});
