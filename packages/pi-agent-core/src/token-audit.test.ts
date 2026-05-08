// Project/App: GSD-2
// File Purpose: Tests for provider-boundary token payload audit helpers.

import assert from "node:assert/strict";
import test from "node:test";
import { Type } from "@sinclair/typebox";
import type { Context } from "@gsd/pi-ai";
import type { AgentMessage } from "./types.js";
import {
	buildProviderPayloadAuditSummary,
	buildTokenAuditSummary,
	maybeLogProviderPayloadAudit,
	maybeLogTokenAudit,
} from "./token-audit.js";

test("buildTokenAuditSummary reports payload section sizes without content fields", () => {
	const context: Context = {
		systemPrompt: "system prompt",
		tools: [
			{
				name: "read",
				description: "Read a file",
				parameters: Type.Object({ path: Type.String() }),
			},
			{
				name: "large_tool",
				description: "Large schema".repeat(20),
				parameters: Type.Object({ value: Type.String() }),
			},
		],
		messages: [
			{ role: "user", content: [{ type: "text", text: "hello" }], timestamp: 1 },
			{
				role: "toolResult",
				toolCallId: "call-1",
				toolName: "read",
				content: [{ type: "text", text: "tool output" }],
				isError: false,
				timestamp: 2,
			},
			{ role: "user", content: [{ type: "image", data: "abc123", mimeType: "image/png" }], timestamp: 3 },
		],
	};
	const sourceMessages = [
		...context.messages,
		{
			role: "custom",
			customType: "gsd-memory",
			content: "memory block",
			display: false,
			timestamp: 4,
		} as AgentMessage,
	];

	const summary = buildTokenAuditSummary(context, sourceMessages);

	assert.equal(summary.systemChars, "system prompt".length);
	assert.equal(summary.toolCount, 2);
	assert.equal(summary.messageCount, 3);
	assert.equal(summary.toolResultChars, "tool output".length);
	assert.equal(summary.imageCount, 1);
	assert.ok(summary.toolSchemaChars > 0);
	assert.ok(summary.customMessageChars > 0);
	assert.ok(summary.estimatedInputTokens > 0);
	assert.deepEqual(
		summary.largestMessages.map((message) => Object.keys(message).sort()),
		summary.largestMessages.map(() => ["chars", "index", "role", "type"]),
	);
	assert.equal(summary.largestTools[0].name, "large_tool");
	assert.deepEqual(
		summary.largestTools.map((tool) => Object.keys(tool).sort()),
		summary.largestTools.map(() => ["chars", "name"]),
	);
	assert.deepEqual(summary.largestCustomMessages, [
		{ index: 3, role: "custom", customType: "gsd-memory", chars: summary.largestCustomMessages[0].chars },
	]);
	assert.ok(!JSON.stringify(summary).includes("tool output"));
	assert.ok(!JSON.stringify(summary).includes("memory block"));
});

test("maybeLogTokenAudit is opt-in and emits metadata only", () => {
	const original = process.env.PI_TOKEN_AUDIT;
	const originalWrite = process.stderr.write;
	let written = "";
	process.stderr.write = ((chunk: string | Uint8Array) => {
		written += chunk.toString();
		return true;
	}) as typeof process.stderr.write;

	try {
		delete process.env.PI_TOKEN_AUDIT;
		maybeLogTokenAudit({ messages: [{ role: "user", content: "secret prompt", timestamp: 1 }] }, []);
		assert.equal(written, "");

		process.env.PI_TOKEN_AUDIT = "1";
		maybeLogTokenAudit({ systemPrompt: "hidden system", messages: [{ role: "user", content: "secret prompt", timestamp: 1 }] }, []);
		assert.match(written, /"type":"token_audit"/);
		assert.doesNotMatch(written, /secret prompt/);
		assert.doesNotMatch(written, /hidden system/);
	} finally {
		process.stderr.write = originalWrite;
		if (original === undefined) delete process.env.PI_TOKEN_AUDIT;
		else process.env.PI_TOKEN_AUDIT = original;
	}
});

test("provider payload audit summarizes post-hook payload without raw content", () => {
	const payload = {
		system: "secret system content",
		tools: [{
			type: "function",
			function: {
				name: "read",
				description: "secret tool description",
				parameters: { type: "object" },
			},
		}],
		messages: [
			{ role: "user", content: "secret user content" },
			{ role: "assistant", content: [{ type: "text", text: "secret assistant content" }] },
		],
	};

	const summary = buildProviderPayloadAuditSummary(payload);

	assert.equal(summary.messageCount, 2);
	assert.equal(summary.toolCount, 1);
	assert.ok(summary.payloadChars > 0);
	assert.ok(summary.toolSchemaChars > 0);
	assert.deepEqual(summary.largestTools.map((tool) => tool.name), ["read"]);
	assert.equal(JSON.stringify(summary).includes("secret"), false);
});

test("provider payload audit recognizes Gemini and Bedrock payload shapes", () => {
	const gemini = buildProviderPayloadAuditSummary({
		contents: [{ role: "user", parts: [{ text: "hidden gemini prompt" }] }],
		config: {
			tools: [{
				functionDeclarations: [
					{ name: "gsd_exec", description: "hidden declaration", parameters: { type: "object" } },
				],
			}],
		},
	});
	const bedrock = buildProviderPayloadAuditSummary({
		messages: [{ role: "user", content: [{ text: "hidden bedrock prompt" }] }],
		toolConfig: {
			tools: [
				{ toolSpec: { name: "gsd_resume", description: "hidden tool", inputSchema: { json: {} } } },
			],
		},
	});

	assert.equal(gemini.messageCount, 1);
	assert.equal(gemini.toolCount, 1);
	assert.deepEqual(gemini.largestTools.map((tool) => tool.name), ["gsd_exec"]);
	assert.equal(JSON.stringify(gemini).includes("hidden"), false);

	assert.equal(bedrock.messageCount, 1);
	assert.equal(bedrock.toolCount, 1);
	assert.deepEqual(bedrock.largestTools.map((tool) => tool.name), ["gsd_resume"]);
	assert.equal(JSON.stringify(bedrock).includes("hidden"), false);
});

test("provider payload audit logging is metadata-only", () => {
	const original = process.env.PI_TOKEN_AUDIT;
	const originalWrite = process.stderr.write;
	let written = "";
	process.env.PI_TOKEN_AUDIT = "1";
	process.stderr.write = ((chunk: string | Uint8Array) => {
		written += chunk.toString();
		return true;
	}) as typeof process.stderr.write;

	try {
		maybeLogProviderPayloadAudit({
			messages: [{ role: "user", content: "raw prompt text must not log" }],
			tools: [{ name: "bash", description: "raw tool description must not log" }],
		}, "after");
		assert.match(written, /"type":"token_audit_provider_payload"/);
		assert.match(written, /"phase":"after"/);
		assert.doesNotMatch(written, /raw prompt text/);
		assert.doesNotMatch(written, /raw tool description/);
	} finally {
		process.stderr.write = originalWrite;
		if (original === undefined) delete process.env.PI_TOKEN_AUDIT;
		else process.env.PI_TOKEN_AUDIT = original;
	}
});
