import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildModelNotFoundErrorMessage } from "./google-gemini-cli.js";

describe("buildModelNotFoundErrorMessage", () => {
	it("returns antigravity-specific guidance for antigravity provider", () => {
		const msg = buildModelNotFoundErrorMessage("claude-opus-4-5-thinking", true);
		assert.match(msg, /Antigravity API error \(404\)/);
		assert.match(msg, /removed or renamed in the Antigravity backend/);
		assert.doesNotMatch(msg, /Try using the "google" provider with a GOOGLE_API_KEY/);
	});

	it("returns cloud-code-assist guidance for non-antigravity providers", () => {
		const msg = buildModelNotFoundErrorMessage("gemini-2.0-pro", false);
		assert.match(msg, /Cloud Code Assist API error \(404\)/);
		assert.match(msg, /Try using the "google" provider with a GOOGLE_API_KEY/);
	});
});
