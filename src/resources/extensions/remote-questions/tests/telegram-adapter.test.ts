/**
 * Tests for TelegramAdapter proxy behavior.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("TelegramAdapter getProxyAgent", () => {
  it("respects proxyTlsRejectUnauthorized=false", async () => {
    const { TelegramAdapter } = await import("../telegram-adapter.js");
    const adapter = new TelegramAdapter(
      "token",
      "123",
      "/path",
      "http://proxy:8080",
      false,
    );

    // Should not throw when proxyTlsRejectUnauthorized=false
    const agent = (adapter as unknown as Record<string, () => unknown>).getProxyAgent();
    assert.ok(agent, "expected agent to be created");

    await adapter.close();
  });

  it("close() clears the cached agent so getProxyAgent() creates a new one", async () => {
    const { TelegramAdapter } = await import("../telegram-adapter.js");
    const adapter = new TelegramAdapter("token", "123", "/path", "http://proxy:8080");

    const agent1 = (adapter as unknown as Record<string, () => unknown>).getProxyAgent();
    assert.ok(agent1, "expected first agent to be created");

    await adapter.close();

    const agent2 = (adapter as unknown as Record<string, () => unknown>).getProxyAgent();
    assert.ok(agent2, "expected second agent to be created after close");
    assert.notStrictEqual(agent1, agent2, "expected a new agent instance after close");

    await adapter.close();
  });
});
