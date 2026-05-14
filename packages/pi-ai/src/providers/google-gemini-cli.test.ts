import test from "node:test";
import assert from "node:assert/strict";
import type { Context, Model } from "../types.js";
import { streamGoogleGeminiCli } from "./google-gemini-cli.js";

function antigravityModel(): Model<"google-gemini-cli"> {
	return {
		id: "gemini-3-pro-preview",
		name: "Gemini 3 Pro Preview",
		api: "google-gemini-cli",
		provider: "google-antigravity",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 8192,
	};
}

test("Antigravity requests use the supported default User-Agent version", async (t) => {
	const originalFetch = globalThis.fetch;
	const originalVersion = process.env.PI_AI_ANTIGRAVITY_VERSION;
	let headers: Headers | undefined;

	t.after(() => {
		globalThis.fetch = originalFetch;
		if (originalVersion === undefined) {
			delete process.env.PI_AI_ANTIGRAVITY_VERSION;
		} else {
			process.env.PI_AI_ANTIGRAVITY_VERSION = originalVersion;
		}
	});

	delete process.env.PI_AI_ANTIGRAVITY_VERSION;
	globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
		headers = new Headers(init?.headers);
		return new Response(
			`data: ${JSON.stringify({
				response: {
					candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
				},
			})}\n\n`,
			{ headers: { "Content-Type": "text/event-stream" } },
		);
	};

	const context: Context = {
		messages: [{ role: "user", content: "hello", timestamp: Date.now() }],
	};
	const stream = streamGoogleGeminiCli(antigravityModel(), context, {
		apiKey: JSON.stringify({ token: "access-token", projectId: "test-project" }),
	});
	const result = await stream.result();

	assert.equal(result.stopReason, "stop");
	assert.equal(headers?.get("User-Agent"), "antigravity/1.23.0 darwin/arm64");
});
