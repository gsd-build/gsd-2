// GSD2 - Tests for adaptive TUI mode selection

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { resolveTuiMode } from "./tui-mode.js";

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
