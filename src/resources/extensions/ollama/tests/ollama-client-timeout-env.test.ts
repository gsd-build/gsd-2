// GSD2 — Tests for OLLAMA_PROBE_TIMEOUT_MS / OLLAMA_REQUEST_TIMEOUT_MS env vars (#5003 / #4982)
//
// Pinned defaults: 1500 ms probe, 10 000 ms request. The defaults must be
// preserved when the env var is unset, empty, non-numeric, zero, or negative
// so a typo or fat-fingered value can't silently disable the timeout. When
// the env var is set to a valid positive integer it overrides the default.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
	envPositiveInt,
	getProbeTimeoutMs,
	getRequestTimeoutMs,
	MAX_TIMER_DELAY_MS,
} from "../ollama-client.js";

const PROBE_VAR = "OLLAMA_PROBE_TIMEOUT_MS";
const REQUEST_VAR = "OLLAMA_REQUEST_TIMEOUT_MS";

function withEnv(name: string, value: string | undefined, run: () => void): void {
	const prior = process.env[name];
	if (value === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = value;
	}
	try {
		run();
	} finally {
		if (prior === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = prior;
		}
	}
}

describe("envPositiveInt — defensive fallback", () => {
	it("returns fallback when var is unset", () => {
		withEnv("__GSD_TEST_INT__", undefined, () => {
			assert.equal(envPositiveInt("__GSD_TEST_INT__", 42), 42);
		});
	});

	it("returns fallback when var is empty string", () => {
		withEnv("__GSD_TEST_INT__", "", () => {
			assert.equal(envPositiveInt("__GSD_TEST_INT__", 42), 42);
		});
	});

	it("returns fallback when var is non-numeric", () => {
		withEnv("__GSD_TEST_INT__", "abc", () => {
			assert.equal(envPositiveInt("__GSD_TEST_INT__", 42), 42);
		});
	});

	it("returns fallback when var is zero (would silently disable timeout)", () => {
		withEnv("__GSD_TEST_INT__", "0", () => {
			assert.equal(envPositiveInt("__GSD_TEST_INT__", 42), 42);
		});
	});

	it("returns fallback when var is negative", () => {
		withEnv("__GSD_TEST_INT__", "-100", () => {
			assert.equal(envPositiveInt("__GSD_TEST_INT__", 42), 42);
		});
	});

	it("returns parsed value when var is a positive integer", () => {
		withEnv("__GSD_TEST_INT__", "5000", () => {
			assert.equal(envPositiveInt("__GSD_TEST_INT__", 42), 5000);
		});
	});

	it("parses leading digits and discards trailing junk (parseInt semantics)", () => {
		withEnv("__GSD_TEST_INT__", "1500ms", () => {
			assert.equal(envPositiveInt("__GSD_TEST_INT__", 42), 1500);
		});
	});

	it("clamps values above MAX_TIMER_DELAY_MS to prevent setTimeout overflow", () => {
		withEnv("__GSD_TEST_INT__", String(MAX_TIMER_DELAY_MS + 1), () => {
			assert.equal(envPositiveInt("__GSD_TEST_INT__", 42), MAX_TIMER_DELAY_MS);
		});
	});

	it("accepts MAX_TIMER_DELAY_MS exactly", () => {
		withEnv("__GSD_TEST_INT__", String(MAX_TIMER_DELAY_MS), () => {
			assert.equal(envPositiveInt("__GSD_TEST_INT__", 42), MAX_TIMER_DELAY_MS);
		});
	});
});

describe("getProbeTimeoutMs — OLLAMA_PROBE_TIMEOUT_MS override", () => {
	beforeEach(() => {
		delete process.env[PROBE_VAR];
	});
	afterEach(() => {
		delete process.env[PROBE_VAR];
	});

	it("defaults to 1500 ms when unset", () => {
		assert.equal(getProbeTimeoutMs(), 1500);
	});

	it("honours a positive override", () => {
		process.env[PROBE_VAR] = "5000";
		assert.equal(getProbeTimeoutMs(), 5000);
	});

	it("falls back to 1500 ms on a zero override (typo guard)", () => {
		process.env[PROBE_VAR] = "0";
		assert.equal(getProbeTimeoutMs(), 1500);
	});

	it("re-reads the env var on every call", () => {
		process.env[PROBE_VAR] = "2000";
		assert.equal(getProbeTimeoutMs(), 2000);
		process.env[PROBE_VAR] = "8000";
		assert.equal(getProbeTimeoutMs(), 8000);
		delete process.env[PROBE_VAR];
		assert.equal(getProbeTimeoutMs(), 1500);
	});
});

describe("getRequestTimeoutMs — OLLAMA_REQUEST_TIMEOUT_MS override", () => {
	beforeEach(() => {
		delete process.env[REQUEST_VAR];
	});
	afterEach(() => {
		delete process.env[REQUEST_VAR];
	});

	it("defaults to 10 000 ms when unset", () => {
		assert.equal(getRequestTimeoutMs(), 10000);
	});

	it("honours a positive override", () => {
		process.env[REQUEST_VAR] = "30000";
		assert.equal(getRequestTimeoutMs(), 30000);
	});

	it("falls back to 10 000 ms on non-numeric input", () => {
		process.env[REQUEST_VAR] = "thirty-seconds";
		assert.equal(getRequestTimeoutMs(), 10000);
	});
});
