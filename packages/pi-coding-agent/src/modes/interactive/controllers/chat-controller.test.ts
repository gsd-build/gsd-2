import assert from "node:assert/strict";
import test from "node:test";
import { Container } from "@gsd/pi-tui";
import stripAnsi from "strip-ansi";

import { findLatestPinnableText, handleAgentEvent } from "./chat-controller.js";
import { initTheme } from "../theme/theme.js";

test("findLatestPinnableText: empty content returns empty string", () => {
	assert.equal(findLatestPinnableText([]), "");
});

test("findLatestPinnableText: no tool calls returns empty string", () => {
	const blocks = [
		{ type: "text", text: "hello" },
		{ type: "text", text: "world" },
	];
	assert.equal(findLatestPinnableText(blocks), "");
});

test("findLatestPinnableText: returns text preceding a tool call", () => {
	const blocks = [
		{ type: "text", text: "doing the thing" },
		{ type: "toolCall", id: "1", name: "Read" },
	];
	assert.equal(findLatestPinnableText(blocks), "doing the thing");
});

test("findLatestPinnableText: ignores trailing streaming text after the last tool call (regression: pinned mirror duplicated chat-container tokens)", () => {
	const blocks = [
		{ type: "text", text: "first prose" },
		{ type: "toolCall", id: "1", name: "Read" },
		{ type: "text", text: "second prose still streaming" },
	];
	assert.equal(findLatestPinnableText(blocks), "first prose");
});

test("findLatestPinnableText: with multiple tools, picks text before the most recent tool call", () => {
	const blocks = [
		{ type: "text", text: "first" },
		{ type: "toolCall", id: "1", name: "Read" },
		{ type: "text", text: "second" },
		{ type: "toolCall", id: "2", name: "Grep" },
		{ type: "text", text: "third streaming" },
	];
	assert.equal(findLatestPinnableText(blocks), "second");
});

test("findLatestPinnableText: treats serverToolUse the same as toolCall", () => {
	const blocks = [
		{ type: "text", text: "before web search" },
		{ type: "serverToolUse", id: "ws1", name: "web_search" },
		{ type: "text", text: "answer streaming" },
	];
	assert.equal(findLatestPinnableText(blocks), "before web search");
});

test("findLatestPinnableText: skips empty/whitespace-only text blocks", () => {
	const blocks = [
		{ type: "text", text: "real prose" },
		{ type: "text", text: "   " },
		{ type: "text", text: "" },
		{ type: "toolCall", id: "1", name: "Read" },
	];
	assert.equal(findLatestPinnableText(blocks), "real prose");
});

test("findLatestPinnableText: thinking blocks are not pinnable", () => {
	const blocks = [
		{ type: "thinking", thinking: "internal" },
		{ type: "toolCall", id: "1", name: "Read" },
	];
	assert.equal(findLatestPinnableText(blocks), "");
});

test("handleAgentEvent: agent_start clears stale adaptive blocking error", async () => {
	initTheme("dark", false);
	let cleared = false;
	let requestedRender = false;
	const host = {
		isInitialized: true,
		clearBlockingError: () => {
			cleared = true;
		},
		retryEscapeHandler: undefined,
		retryLoader: undefined,
		loadingAnimation: undefined,
		statusContainer: {
			clear() {},
			addChild() {},
		},
		ui: {
			requestRender() {
				requestedRender = true;
			},
		},
		defaultEditor: {},
		footer: {
			invalidate() {},
		},
		settingsManager: {
			getTimestampFormat() {
				return "date-time-iso";
			},
		},
		defaultWorkingMessage: "Working...",
		pendingWorkingMessage: undefined,
	} as any;

	await handleAgentEvent(host, { type: "agent_start" } as any);
	host.loadingAnimation?.stop();

	assert.equal(cleared, true);
	assert.equal(requestedRender, true);
});

test("handleAgentEvent: standalone completed tool events roll up incrementally", async () => {
	initTheme("dark", false);
	const chatContainer = new Container();
	let renderCount = 0;
	const host = {
		isInitialized: true,
		footer: { invalidate() {} },
		settingsManager: {
			getTimestampFormat() {
				return "date-time-iso";
			},
			getShowImages() {
				return false;
			},
		},
		getRegisteredToolDefinition() {
			return undefined;
		},
		chatContainer,
		pendingTools: new Map(),
		ui: {
			requestRender() {
				renderCount++;
			},
		},
	} as any;

	for (const [toolCallId, toolName] of [
		["read-1", "read"],
		["read-2", "read"],
		["edit-1", "edit"],
	] as const) {
		await handleAgentEvent(host, {
			type: "tool_execution_start",
			toolCallId,
			toolName,
			args: { path: `/tmp/${toolCallId}.txt` },
		} as any);
		await handleAgentEvent(host, {
			type: "tool_execution_end",
			toolCallId,
			toolName,
			result: { content: [], isError: false },
			isError: false,
		} as any);
	}

	const rendered = stripAnsi(chatContainer.render(100).join("\n"));
	assert.match(rendered, /Context reads 2 actions\s+success · \d+(ms|s)/);
	assert.match(rendered, /File changes 1 action\s+success · \d+(ms|s)/);
	assert.doesNotMatch(rendered, /\bread\s+success ·/);
	assert.ok(renderCount > 0);
});
