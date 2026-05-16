/**
 * Resolution chain for the mcp_call timeout:
 *   per-call arg > per-server config > GSD_MCP_CALL_TIMEOUT_MS env > 60_000 default,
 * each layer falling through when its value is invalid, with the final result
 * clamped to the MAX (30 minutes).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { resolveCallTimeoutMs } from "../index.js";

const DEFAULT = 60_000;
const MAX = 30 * 60_000;

test("returns the per-call value when valid", () => {
	assert.equal(resolveCallTimeoutMs(120_000, 90_000, "30000"), 120_000);
});

test("falls through to per-server when per-call is undefined", () => {
	assert.equal(resolveCallTimeoutMs(undefined, 90_000, "30000"), 90_000);
});

test("falls through to env when per-call and per-server are undefined", () => {
	assert.equal(resolveCallTimeoutMs(undefined, undefined, "30000"), 30_000);
});

test("falls through to the built-in default when nothing is configured", () => {
	assert.equal(resolveCallTimeoutMs(undefined, undefined, undefined), DEFAULT);
});

test("falls through past an invalid per-call value (non-number)", () => {
	assert.equal(resolveCallTimeoutMs("five minutes" as unknown, 90_000, undefined), 90_000);
});

test("falls through past a non-positive per-call value", () => {
	assert.equal(resolveCallTimeoutMs(0, 90_000, undefined), 90_000);
	assert.equal(resolveCallTimeoutMs(-1000, 90_000, undefined), 90_000);
});

test("falls through past a non-integer per-call value", () => {
	assert.equal(resolveCallTimeoutMs(1500.5, 90_000, undefined), 90_000);
});

test("falls through past NaN / Infinity", () => {
	assert.equal(resolveCallTimeoutMs(NaN, 90_000, undefined), 90_000);
	assert.equal(resolveCallTimeoutMs(Infinity, 90_000, undefined), 90_000);
});

test("falls through past a non-numeric env value", () => {
	assert.equal(resolveCallTimeoutMs(undefined, undefined, "not a number"), DEFAULT);
});

test("falls through past a non-positive env value", () => {
	assert.equal(resolveCallTimeoutMs(undefined, undefined, "0"), DEFAULT);
	assert.equal(resolveCallTimeoutMs(undefined, undefined, "-5000"), DEFAULT);
});

test("caps the resolved value at MAX_MCP_CALL_TIMEOUT_MS", () => {
	assert.equal(resolveCallTimeoutMs(MAX + 1, undefined, undefined), MAX);
	assert.equal(resolveCallTimeoutMs(undefined, MAX * 2, undefined), MAX);
	assert.equal(resolveCallTimeoutMs(undefined, undefined, String(MAX * 3)), MAX);
});
