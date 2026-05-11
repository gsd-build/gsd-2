// Project/App: GSD-2
// File Purpose: Visual contract tests for the recommended indented assistant message rail design.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import stripAnsi from "strip-ansi";
import type { AssistantMessage } from "@gsd/pi-ai";

import { initTheme } from "../../theme/theme.js";
import { AssistantMessageComponent } from "../assistant-message.js";
import { formatTimestamp } from "../timestamp.js";

initTheme("dark", false);

describe("AssistantMessageComponent recommended rail design", () => {
	test("renders assistant content with a lightly indented left rail", () => {
		const message = {
			id: "m1",
			role: "assistant",
			provider: "test",
			model: "gpt-test",
			timestamp: 1,
			content: [{ type: "text", text: "I will update the renderer and run verification." }],
		} as unknown as AssistantMessage;

		const component = new AssistantMessageComponent(message, true);
		const raw = component.render(80);
		const plain = raw.map((line) => stripAnsi(line));
		const joined = plain.join("\n");

		assert.ok(plain.some((line) => line.startsWith("  ┃ ")), `expected indented rail-prefixed lines:\n${joined}`);
		assert.ok(raw.some((line) => line.includes("\x1b[48;")), `expected faint assistant block background:\n${raw.join("\n")}`);
		assert.match(joined, /^\s*┃\s*$/m, "assistant block should include vertical padding rows");
		assert.match(joined, /GSD/);
		assert.match(joined, /gpt-test/);
		assert.match(joined, /update the renderer/);
		assert.doesNotMatch(joined, /^┃/m, "assistant rail should be slightly indented from the left edge");
		assert.doesNotMatch(joined, /^╭/m, "assistant messages should not use rounded card borders");
	});

	test("renders metadata for a zero timestamp", () => {
		const message = {
			id: "m1",
			role: "assistant",
			provider: "test",
			model: "gpt-test",
			timestamp: 0,
			content: [{ type: "text", text: "Finished." }],
		} as unknown as AssistantMessage;

		const component = new AssistantMessageComponent(message, true);
		const joined = component.render(80).map((line) => stripAnsi(line)).join("\n");

		assert.match(joined, new RegExp(formatTimestamp(0)));
	});
});
