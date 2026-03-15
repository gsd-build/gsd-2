import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getEnvApiKey } from "@gsd/pi-ai";
import { SNAPSHOT } from "@gsd/pi-ai";

describe("ZAI Integration", () => {
	it("resolves ZHIPU_API_KEY from environment using models.dev fallback", () => {
		// Mock the environment. ZHIPU_API_KEY is mapped via SNAPSHOT for 'zai'.
		const originalEnv = process.env.ZHIPU_API_KEY;
		const originalZai = process.env.ZAI_API_KEY;
		process.env.ZHIPU_API_KEY = "test-zhipu-key-123";
		delete process.env.ZAI_API_KEY;

		try {
			// This tests if the ZHIPU_API_KEY environment variable is correctly mapped via the 'env' list
			// from the models.dev provider data for 'zai'.
			const key = getEnvApiKey("zai");
			assert.equal(key, "test-zhipu-key-123", "Should resolve ZHIPU_API_KEY correctly via fallback");
		} finally {
			// Restore the environment
			if (originalEnv === undefined) {
				delete process.env.ZHIPU_API_KEY;
			} else {
				process.env.ZHIPU_API_KEY = originalEnv;
			}
			if (originalZai !== undefined) {
				process.env.ZAI_API_KEY = originalZai;
			}
		}
	});

	it("contains zai models in the models.dev snapshot", () => {
		const zaiProvider = SNAPSHOT["zai"];
		assert.ok(zaiProvider, "ZAI provider should exist in models.dev snapshot");
		assert.ok(Object.keys(zaiProvider.models).length > 0, "ZAI provider should have models");

		const envVars = zaiProvider.env;
		assert.ok(envVars && envVars.includes("ZHIPU_API_KEY"), "ZAI provider should contain ZHIPU_API_KEY in its env mapping");
	});
});
