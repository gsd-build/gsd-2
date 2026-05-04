import test from "node:test";
import assert from "node:assert/strict";

import { createDismissibleOverlay } from "../ollama-commands.js";

test("createDismissibleOverlay renders with text token and dismiss hint", () => {
	const doneCalls: unknown[] = [];
	const overlay = createDismissibleOverlay(
		{ fg: (token: string, text: string) => `[${token}]${text}` },
		["line one", "line two"],
		(value) => doneCalls.push(value),
		{ includeDismissHint: true },
	);

	const themed = overlay.render(80);

	assert.deepEqual(themed, [
		"[text]line one",
		"[text]line two",
		"",
		"[dim] Press any key to dismiss",
	]);
	assert.equal(doneCalls.length, 0, "overlay should not auto-dismiss");
});

test("createDismissibleOverlay dismisses on key input", () => {
	const doneCalls: unknown[] = [];
	const overlay = createDismissibleOverlay(
		{ fg: (_token: string, text: string) => text },
		["line"],
		(value) => doneCalls.push(value),
	);

	overlay.handleInput("x");

	assert.deepEqual(doneCalls, [undefined]);
});
