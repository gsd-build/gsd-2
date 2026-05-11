// Project/App: GSD-2
// File Purpose: Tests for safe terminal syntax highlighting fallback.

import test from "node:test";
import assert from "node:assert/strict";
import stripAnsi from "strip-ansi";

import { highlightCode, initTheme } from "./theme.js";

initTheme("dark", false);

test("highlightCode applies lightweight syntax colors when native highlighting is disabled", () => {
	const [line] = highlightCode("const answer = 42 // meaning", "typescript");

	assert.ok(line.includes("\x1b["), "expected ANSI color output");
	assert.equal(stripAnsi(line), "const answer = 42 // meaning");
});

test("highlightCode keeps plain text unstyled when no language is known", () => {
	const [line] = highlightCode("const answer = 42");

	assert.equal(line, "const answer = 42");
});
