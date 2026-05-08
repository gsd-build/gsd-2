// GSD2 - Tests for adaptive TUI mode selection

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import stripAnsi from "strip-ansi";

import { AdaptiveLayoutComponent } from "./components/adaptive-layout.js";
import { initTheme } from "./theme/theme.js";
import { resolveTuiMode } from "./tui-mode.js";

initTheme("dark", false);

describe("resolveTuiMode", () => {
	test("explicit overrides beat auto selection", () => {
		assert.equal(
			resolveTuiMode({ terminalWidth: 60, override: "debug", gsdPhase: "validating-milestone" }),
			"debug",
		);
	});

	test("prioritizes compact layouts on narrow terminals", () => {
		assert.equal(
			resolveTuiMode({ terminalWidth: 60, override: "auto", hasBlockingError: true, gsdPhase: "validating-milestone" }),
			"compact",
		);
	});

	test("uses debug mode for blocking errors on roomy terminals", () => {
		assert.equal(resolveTuiMode({ terminalWidth: 100, hasBlockingError: true }), "debug");
	});

	test("uses validation mode for validation and completion phases", () => {
		assert.equal(resolveTuiMode({ terminalWidth: 100, gsdPhase: "validating-milestone" }), "validation");
		assert.equal(resolveTuiMode({ terminalWidth: 100, gsdPhase: "complete-milestone" }), "validation");
	});

	test("uses workflow mode when tools or non-validation phases are active", () => {
		assert.equal(resolveTuiMode({ terminalWidth: 100, activeToolCount: 1 }), "workflow");
		assert.equal(resolveTuiMode({ terminalWidth: 100, gsdPhase: "execute-phase" }), "workflow");
	});

	test("falls back to chat mode for plain conversation", () => {
		assert.equal(resolveTuiMode({ terminalWidth: 100 }), "chat");
	});
});

describe("AdaptiveLayoutComponent", () => {
	test("renders workflow layout with prototype rule frames", () => {
		const layout = new AdaptiveLayoutComponent(() => ({
			override: "workflow",
			activeToolCount: 2,
			gsdPhase: "execute-task",
			sessionName: "main",
			cwd: "/Users/example/project",
		}));

		const plain = layout.render(120).map(stripAnsi);

		assert.match(plain[0], /^─+/, "workflow layout should start with a rule frame");
		assert.ok(plain.some((line) => line.includes("GSD Command Center")), "workflow title should render");
		assert.ok(plain.some((line) => line.includes("signals")), "inspector title should render");
		assert.ok(plain.some((line) => line.includes("│ Active")), "body rows should keep prototype gutter");
		assert.ok(!plain.some((line) => /[╭╮╰╯]/.test(line)), "workflow layout should not use rounded box corners");
	});
});
