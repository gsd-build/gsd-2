import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import claudeCodeCli from "../index.ts";

describe("claude-code provider registration", () => {
	test("registers as externalCli with readiness gate", () => {
		const calls: Array<{ name: string; config: Record<string, unknown> }> = [];
		const pi = {
			registerProvider(name: string, config: Record<string, unknown>) {
				calls.push({ name, config });
			},
		} as unknown as ExtensionAPI;

		claudeCodeCli(pi);

		assert.equal(calls.length, 1);
		assert.equal(calls[0].name, "claude-code");
		assert.equal(calls[0].config.authMode, "externalCli");
		assert.equal(typeof calls[0].config.isReady, "function");
		assert.equal(calls[0].config.baseUrl, "local://claude-code");
		assert.equal(calls[0].config.api, "anthropic-messages");
		assert.equal(typeof calls[0].config.streamSimple, "function");
		assert.ok(Array.isArray(calls[0].config.models));
		assert.ok((calls[0].config.models as unknown[]).length > 0);
	});
});
