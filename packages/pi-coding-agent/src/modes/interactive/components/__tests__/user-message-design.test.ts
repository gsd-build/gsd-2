// Project/App: GSD-2
// File Purpose: Visual contract tests for left-edge user chat rails.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import type { AssistantMessage } from "@gsd/pi-ai";

import { initTheme } from "../../theme/theme.js";
import { AssistantMessageComponent } from "../assistant-message.js";
import { UserMessageComponent } from "../user-message.js";

initTheme("dark", false);

describe("UserMessageComponent chat rail design", () => {
	test("renders user messages against the left edge", () => {
		const component = new UserMessageComponent("Can we make the transcript feel like chat?", undefined, 1, "date-time-iso");
		const raw = component.render(100);
		const plain = raw.map((line) => stripVTControlCharacters(line));
		const joined = plain.join("\n");

		assert.ok(plain.some((line) => /^┃ You/.test(line)), `expected left-edge user rail header:\n${joined}`);
		assert.ok(plain.some((line) => /^┃ Can we make the transcript feel like chat\?/.test(line)), `expected left-edge user rail body:\n${joined}`);
		assert.ok(raw.some((line) => line.includes("\x1b[48;")), `expected faint user block background:\n${raw.join("\n")}`);
		assert.match(joined, /^┃\s*$/m, "user block should include vertical padding rows");
		assert.match(joined, /feel like chat/);
		assert.doesNotMatch(joined, /[╭╮╰╯]/, "user rail should not use boxed bubble corners");
		assert.doesNotMatch(joined, /^  ┃ You/m, "user rail should not be indented like GSD messages");
	});

	test("uses a different faint background than GSD messages", () => {
		const user = new UserMessageComponent("Use a distinct user color.");
		const assistant = new AssistantMessageComponent({
			id: "m1",
			role: "assistant",
			provider: "test",
			model: "gpt-test",
			content: [{ type: "text", text: "GSD message." }],
		} as unknown as AssistantMessage);

		const userBg = user.render(100).join("\n").match(/\x1b\[48;[^m]+m/)?.[0];
		const assistantBg = assistant.render(100).join("\n").match(/\x1b\[48;[^m]+m/)?.[0];

		assert.ok(userBg, "expected user message background color");
		assert.ok(assistantBg, "expected assistant message background color");
		assert.notEqual(userBg, assistantBg, "user and GSD message backgrounds should be distinct");
	});
});
