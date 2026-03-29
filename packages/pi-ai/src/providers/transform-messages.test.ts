// GSD-2 — Tests for transformMessages ProviderSwitchReport (ADR-005 Phase 5)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { transformMessages, type ProviderSwitchReport } from "./transform-messages.js";
import type { AssistantMessage, Message, Model, UserMessage, ToolResultMessage } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeModel(overrides?: Partial<Model<any>>): Model<any> {
	return {
		id: "claude-sonnet-4-6",
		provider: "anthropic",
		api: "anthropic-messages",
		name: "Claude Sonnet",
		contextWindow: 200000,
		...overrides,
	} as Model<any>;
}

function makeUserMessage(text: string): UserMessage {
	return { role: "user", content: text, timestamp: Date.now() };
}

function makeAssistantMessage(
	text: string,
	overrides?: Partial<AssistantMessage>,
): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4-6",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "stop",
		timestamp: Date.now(),
		...overrides,
	};
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("transformMessages — ProviderSwitchReport (ADR-005)", () => {

	test("same-provider messages produce no switchReport (Pitfall 7 — early exit)", () => {
		const model = makeModel();
		const messages: Message[] = [
			makeUserMessage("Hello"),
			makeAssistantMessage("Hi there"),
			makeUserMessage("How are you?"),
			makeAssistantMessage("Doing well"),
		];

		const result = transformMessages(messages, model);
		assert.equal(result.switchReport, undefined, "same-provider should produce no report");
		assert.equal(result.messages.length, 4);
	});

	test("cross-provider messages produce a switchReport", () => {
		// Target model is Anthropic, but conversation has messages from OpenAI
		const model = makeModel({ api: "anthropic-messages", provider: "anthropic", id: "claude-sonnet-4-6" });
		const messages: Message[] = [
			makeUserMessage("Hello"),
			makeAssistantMessage("Hi from OpenAI", {
				api: "openai-responses",
				provider: "openai",
				model: "gpt-4o",
				content: [{ type: "text", text: "Hi from OpenAI" }],
			}),
			makeUserMessage("Follow up"),
		];

		const result = transformMessages(messages, model);
		assert.ok(result.switchReport, "cross-provider should produce a report");
		assert.equal(result.switchReport!.fromApi, "openai-responses");
		assert.equal(result.switchReport!.toApi, "anthropic-messages");
	});

	test("cross-provider report counts thinking blocks downgraded to text", () => {
		const model = makeModel({ api: "openai-responses", provider: "openai", id: "gpt-4o" });
		const messages: Message[] = [
			makeUserMessage("Think about this"),
			makeAssistantMessage("thought result", {
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude-sonnet-4-6",
				content: [
					{ type: "thinking", thinking: "Deep analysis here", redacted: false },
					{ type: "text", text: "My conclusion" },
				],
			}),
		];

		const result = transformMessages(messages, model);
		assert.ok(result.switchReport, "should produce report");
		assert.equal(result.switchReport!.thinkingBlocksDowngraded, 1, "one thinking block should be downgraded");
		assert.equal(result.switchReport!.thinkingBlocksDropped, 0, "no blocks should be dropped");
	});

	test("cross-provider report counts redacted thinking blocks dropped", () => {
		const model = makeModel({ api: "openai-responses", provider: "openai", id: "gpt-4o" });
		const messages: Message[] = [
			makeUserMessage("Think about this"),
			makeAssistantMessage("result", {
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude-sonnet-4-6",
				content: [
					{ type: "thinking", thinking: "", redacted: true },
					{ type: "text", text: "My conclusion" },
				],
			}),
		];

		const result = transformMessages(messages, model);
		assert.ok(result.switchReport, "should produce report");
		assert.equal(result.switchReport!.thinkingBlocksDropped, 1, "one redacted block should be dropped");
	});

	test("cross-provider report counts tool call ID remapping", () => {
		const model = makeModel({ api: "anthropic-messages", provider: "anthropic", id: "claude-sonnet-4-6" });
		let remapCalled = 0;
		const normalizer = (id: string) => {
			remapCalled++;
			return `remapped-${id.substring(0, 8)}`;
		};

		const messages: Message[] = [
			makeUserMessage("Run a tool"),
			makeAssistantMessage("running", {
				api: "openai-responses",
				provider: "openai",
				model: "gpt-4o",
				content: [
					{ type: "toolCall", id: "call_abc123456789", name: "Bash", arguments: { command: "echo hi" } },
				],
			}),
			{
				role: "toolResult",
				toolCallId: "call_abc123456789",
				toolName: "Bash",
				content: [{ type: "text", text: "hi" }],
				isError: false,
				timestamp: Date.now(),
			} as ToolResultMessage,
		];

		const result = transformMessages(messages, model, normalizer);
		assert.ok(result.switchReport, "should produce report");
		assert.equal(result.switchReport!.toolCallIdsRemapped, 1, "one tool call ID should be remapped");
	});

	test("cross-provider report counts thought signatures dropped", () => {
		const model = makeModel({ api: "anthropic-messages", provider: "anthropic", id: "claude-sonnet-4-6" });
		const messages: Message[] = [
			makeUserMessage("Run a tool"),
			makeAssistantMessage("running", {
				api: "google-generative-ai",
				provider: "google",
				model: "gemini-2.5-pro",
				content: [
					{
						type: "toolCall",
						id: "tc-1",
						name: "Read",
						arguments: { path: "/tmp/test" },
						thoughtSignature: "opaque-google-signature-abc123",
					},
				],
			}),
			{
				role: "toolResult",
				toolCallId: "tc-1",
				toolName: "Read",
				content: [{ type: "text", text: "file contents" }],
				isError: false,
				timestamp: Date.now(),
			} as ToolResultMessage,
		];

		const result = transformMessages(messages, model);
		assert.ok(result.switchReport, "should produce report");
		assert.equal(result.switchReport!.thoughtSignaturesDropped, 1, "one thought signature should be dropped");
	});

	test("report aggregates counts across multiple cross-provider messages", () => {
		const model = makeModel({ api: "anthropic-messages", provider: "anthropic", id: "claude-sonnet-4-6" });
		const messages: Message[] = [
			makeUserMessage("multi-turn"),
			makeAssistantMessage("turn 1", {
				api: "openai-responses",
				provider: "openai",
				model: "gpt-4o",
				content: [
					{ type: "thinking", thinking: "thought 1", redacted: false },
					{ type: "text", text: "response 1" },
				],
			}),
			makeUserMessage("continue"),
			makeAssistantMessage("turn 2", {
				api: "openai-responses",
				provider: "openai",
				model: "gpt-4o",
				content: [
					{ type: "thinking", thinking: "thought 2", redacted: false },
					{ type: "thinking", thinking: "", redacted: true },
					{ type: "text", text: "response 2" },
				],
			}),
		];

		const result = transformMessages(messages, model);
		assert.ok(result.switchReport, "should produce report");
		assert.equal(result.switchReport!.thinkingBlocksDowngraded, 2, "two thinking blocks downgraded");
		assert.equal(result.switchReport!.thinkingBlocksDropped, 1, "one redacted block dropped");
		assert.equal(result.switchReport!.fromApi, "openai-responses");
		assert.equal(result.switchReport!.toApi, "anthropic-messages");
	});

	test("errored/aborted assistant messages are dropped entirely", () => {
		const model = makeModel();
		const messages: Message[] = [
			makeUserMessage("Hello"),
			makeAssistantMessage("partial", {
				stopReason: "error",
				content: [{ type: "text", text: "partial response" }],
			}),
			makeUserMessage("retry"),
			makeAssistantMessage("success"),
		];

		const result = transformMessages(messages, model);
		// Errored message should be skipped
		assert.equal(result.messages.length, 3, "errored message should be dropped");
		assert.equal(result.switchReport, undefined, "same-provider, no report");
	});

	test("zero-count report still produced for cross-provider with only text", () => {
		// Cross-provider but no thinking, no tool calls — report should still be produced
		const model = makeModel({ api: "anthropic-messages", provider: "anthropic", id: "claude-sonnet-4-6" });
		const messages: Message[] = [
			makeUserMessage("Hello"),
			makeAssistantMessage("Hi from GPT", {
				api: "openai-responses",
				provider: "openai",
				model: "gpt-4o",
			}),
		];

		const result = transformMessages(messages, model);
		assert.ok(result.switchReport, "cross-provider should still produce report even with no transformations");
		assert.equal(result.switchReport!.thinkingBlocksDropped, 0);
		assert.equal(result.switchReport!.thinkingBlocksDowngraded, 0);
		assert.equal(result.switchReport!.toolCallIdsRemapped, 0);
		assert.equal(result.switchReport!.syntheticToolResultsInserted, 0);
		assert.equal(result.switchReport!.thoughtSignaturesDropped, 0);
	});
});
