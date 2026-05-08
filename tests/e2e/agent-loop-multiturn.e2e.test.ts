/**
 * GSD-2 multi-iteration agent-loop e2e.
 *
 * Drives a 3-LLM-turn loop through the fake provider to prove the agent
 * sustains repeated tool_use → tool_result → next-turn cycles. Phase 1b
 * verified a *single* tool-use cycle works; this verifies the loop
 * doesn't degrade or short-circuit across multiple iterations.
 *
 * Transcript shape:
 *   turn 1: model emits tool_use #1
 *   turn 2: after tool_result lands, model emits tool_use #2
 *   turn 3: after tool_result lands, model emits final text
 *
 * Note: print mode does not register file-edit tools by default, so the
 * scripted tool calls return "Tool not found" toolResults. That's exactly
 * the value of this test at the e2e layer — we verify the agent loop
 * dispatches and threads the failed-tool results through into subsequent
 * turns regardless of tool implementation. The real product safeguard
 * that halts the loop after 3 *consecutive* failed tool calls is
 * intentionally NOT tripped here (we only emit 2 failed tool turns
 * before the final text turn).
 *
 * Subagent / nested fake-LLM coverage is intentionally deferred: that
 * would require either a multi-cursor transcript or per-call transcript
 * targeting, which is more infrastructure than this PR justifies.
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
	if (!bin) return { ok: false, reason: "GSD_SMOKE_BINARY not set; build with `npm run build:core`" };
	if (!existsSync(bin)) return { ok: false, reason: `binary not found at ${bin}` };
	return { ok: true };
}

describe("agent loop e2e — multi-iteration", () => {
	const avail = binaryAvailable();
	const skipReason = avail.ok ? null : avail.reason;

	test("2 tool iterations + final text turn complete in order", { skip: skipReason ?? false, timeout: 60_000 }, (t) => {
		const project = createTmpProject();
		t.after(project.cleanup);

		const transcript = writeTranscript([
			// Iteration 1: agent calls a tool.
			{
				turn: 1,
				expect: { modelId: "gsd-fake-model", lastUserText: "do two steps" },
				emit: {
					kind: "tool_use",
					calls: [{ id: "step-1", name: "read_file", input: { file_path: "/dev/null" } }],
				},
			},
			// Iteration 2: previous tool returned, agent calls another tool.
			{
				turn: 2,
				expect: { hasToolResultFor: "read_file" },
				emit: {
					kind: "tool_use",
					calls: [{ id: "step-2", name: "list_directory", input: { path: "/dev/null" } }],
				},
			},
			// Final turn: text wrap-up. The fact that this turn fires (and
			// fires with `hasToolResultFor` matching the prior iteration)
			// proves the loop sustained both prior tool cycles.
			{
				turn: 3,
				expect: { hasToolResultFor: "list_directory" },
				emit: { kind: "text", text: "two steps done" },
			},
		]);

		const result = runWithFakeLlm(transcript, {
			cwd: project.dir,
			prompt: "do two steps",
			mode: "json",
			timeoutMs: 45_000,
			extraEnv: { GSD_TOOL_APPROVAL: "auto" },
		});

		const events = parseJsonEvents(result.stdoutClean);

		// Two tool_execution_start events — one per iteration.
		const toolStarts = events.filter((e) => e.type === "tool_execution_start");
		assert.equal(
			toolStarts.length,
			2,
			`expected 2 tool_execution_start events (one per iteration), got ${toolStarts.length}`,
		);
		const toolEnds = events.filter((e) => e.type === "tool_execution_end");
		assert.equal(
			toolEnds.length,
			2,
			`expected 2 tool_execution_end events, got ${toolEnds.length}`,
		);

		// The toolCallIds should map 1:1 with the scripted ids — proves the
		// agent loop dispatched each call faithfully and didn't merge / dedupe.
		const observedIds = toolStarts
			.map((e) => (e as { toolCallId?: string }).toolCallId)
			.filter(Boolean);
		assert.deepEqual(
			observedIds.sort(),
			["step-1", "step-2"],
			`expected scripted ids step-1/2, got ${JSON.stringify(observedIds)}`,
		);

		// Final assistant turn fired with the wrap-up text.
		assert.equal(lastAssistantText(events), "two steps done");
		assert.equal(lastAssistantStopReason(events), "stop");
	});

	test("3 consecutive failed tool calls trip the agent loop's safeguard", { skip: skipReason ?? false, timeout: 60_000 }, (t) => {
		// This is a real production safeguard worth pinning: after 3 turns
		// where every tool call fails (e.g. the model is hallucinating
		// arguments), the agent halts with a clear message rather than
		// looping forever. Surfaced organically while writing the
		// multi-iteration test above.
		const project = createTmpProject();
		t.after(project.cleanup);

		const transcript = writeTranscript([
			{
				turn: 1,
				expect: { lastUserText: "loop forever" },
				emit: { kind: "tool_use", calls: [{ id: "a", name: "NoSuchTool", input: {} }] },
			},
			{
				turn: 2,
				expect: { hasToolResultFor: "NoSuchTool" },
				emit: { kind: "tool_use", calls: [{ id: "b", name: "NoSuchTool", input: {} }] },
			},
			{
				turn: 3,
				expect: { hasToolResultFor: "NoSuchTool" },
				emit: { kind: "tool_use", calls: [{ id: "c", name: "NoSuchTool", input: {} }] },
			},
			// We also have a 4th turn so the fake provider doesn't run out
			// if the safeguard fires on a different boundary than expected
			// — but if the safeguard works, this turn never executes.
			{
				turn: 4,
				expect: { hasToolResultFor: "NoSuchTool" },
				emit: { kind: "text", text: "should not be reached" },
			},
		]);

		const result = runWithFakeLlm(transcript, {
			cwd: project.dir,
			prompt: "loop forever",
			mode: "json",
			timeoutMs: 45_000,
			extraEnv: { GSD_TOOL_APPROVAL: "auto" },
		});

		const events = parseJsonEvents(result.stdoutClean);
		const finalText = lastAssistantText(events);

		// Safeguard fired: must mention the consecutive-failure threshold.
		assert.match(
			finalText,
			/consecutive turns with all tool calls failing|stopped/i,
			`expected safeguard message in final assistant text, got: ${finalText.slice(0, 400)}`,
		);
		// Agent must NOT have reached the 4th scripted text turn.
		assert.notEqual(
			finalText,
			"should not be reached",
			"safeguard did not fire — agent ran past the 3-failure boundary",
		);
	});
});
