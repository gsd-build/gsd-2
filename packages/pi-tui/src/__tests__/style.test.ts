// GSD2 - Tests for terminal style primitives

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import stripAnsi from "strip-ansi";

import { style, visibleWidth } from "../index.js";

describe("style", () => {
	test("renders rule frames with title, right title, and body gutter", () => {
		const lines = style()
			.border("rule")
			.title("• Tool Bash")
			.titleRight("Running")
			.render(["$ npm test"], 40);

		const plain = lines.map((line) => stripAnsi(line));
		assert.match(plain[0], /^─+$/);
		assert.equal(visibleWidth(plain[0]), 40);
		assert.ok(plain[1].includes("• Tool Bash"));
		assert.ok(plain[1].includes("Running"));
		assert.equal(visibleWidth(plain[1]), 40);
		assert.ok(plain[2].startsWith("│ "));
		assert.ok(plain[2].includes("$ npm test"));
	});

	test("renders boxed rounded borders with padded content", () => {
		const lines = style()
			.border("rounded")
			.paddingX(1)
			.render(["Done"], 12)
			.map((line) => stripAnsi(line));

		assert.equal(lines[0], "╭──────────╮");
		assert.equal(lines[1], "│ Done     │");
		assert.equal(lines[2], "╰──────────╯");
	});

	test("truncates content to the available visible width", () => {
		const plain = style().border("rule").render(["abcdefghij"], 7).map((line) => stripAnsi(line));

		assert.equal(plain[1], "│ abcde");
		assert.equal(visibleWidth(plain[1]), 7);
	});

	test("renders minimal left-rule surfaces", () => {
		const plain = style().border("minimal").title("note").render(["No full card"], 20).map((line) => stripAnsi(line));

		assert.equal(plain[0], "│ note              ");
		assert.equal(plain[1], "│ No full card      ");
	});

	test("applies dashboard density and body gutters", () => {
		const plain = style()
			.border("single")
			.density("dashboard")
			.bodyGutter("· ")
			.render(["body"], 14)
			.map((line) => stripAnsi(line));

		assert.equal(plain[0], "┌────────────┐");
		assert.equal(plain[1], "│            │");
		assert.equal(plain[2], "│·  body     │");
		assert.equal(plain[3], "│            │");
		assert.equal(plain[4], "└────────────┘");
	});

	test("passes tone to toneColor when no explicit border color is set", () => {
		const lines = style()
			.border("minimal")
			.tone("success", (tone, text) => `[${tone}]${text}`)
			.render(["ok"], 8);

		assert.equal(lines[0], "[success]│ ok    ");
	});
});
