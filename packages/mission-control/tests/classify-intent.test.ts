/**
 * classify-intent.test.ts — tests for classifyIntent (BUILDER-04, BUILDER-07)
 *
 * Tests:
 * 1. mock fetch returning GSD_COMMAND → returns 'GSD_COMMAND'
 * 2. mock fetch returning 400 → returns 'GENERAL_CODING' (fail open)
 * 3. mock fetch that throws → returns 'GENERAL_CODING' (fail open)
 * 4. provider 'anthropic' in auth → returns 'GENERAL_CODING' without fetch (OAuth skip)
 * 5. provider 'github-copilot' → returns 'GENERAL_CODING' without fetch
 * 6. provider 'openrouter' → makes fetch call to api.anthropic.com
 * 7. provider 'api-key' → makes fetch call
 * 8. malformed JSON response → returns 'GENERAL_CODING'
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { classifyIntent, _setAuthOverride } from "../src/server/classify-intent-api";

// Helper to build a mock fetch that returns a successful Anthropic response
function mockSuccessFetch(intentValue: string) {
  return async (_url: string, _opts?: RequestInit) => {
    return {
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify({ intent: intentValue }) }],
      }),
    } as unknown as Response;
  };
}

// Helper to build a mock fetch that returns a non-ok response
function mockErrorFetch(status: number) {
  return async (_url: string, _opts?: RequestInit) => {
    return {
      ok: false,
      status,
      json: async () => ({}),
    } as unknown as Response;
  };
}

// Helper to build a mock fetch that records calls (for verifying it was/wasn't called)
function mockTrackingFetch(intentValue: string) {
  let callCount = 0;
  const fn = async (_url: string, _opts?: RequestInit) => {
    callCount++;
    return {
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify({ intent: intentValue }) }],
      }),
    } as unknown as Response;
  };
  return { fn, getCallCount: () => callCount };
}

beforeEach(() => {
  // Reset auth override before each test
  _setAuthOverride(null);
});

afterEach(() => {
  _setAuthOverride(null);
});

describe("classifyIntent", () => {
  it("Test 1: returns GSD_COMMAND when fetch returns { intent: 'GSD_COMMAND' }", async () => {
    _setAuthOverride({ provider: "api-key", api_key: "test-key" });
    const result = await classifyIntent("build a feature", "", mockSuccessFetch("GSD_COMMAND"));
    expect(result).toBe("GSD_COMMAND");
  });

  it("Test 2: returns GENERAL_CODING when fetch returns 400 (fail open)", async () => {
    _setAuthOverride({ provider: "api-key", api_key: "test-key" });
    const result = await classifyIntent("build a feature", "", mockErrorFetch(400));
    expect(result).toBe("GENERAL_CODING");
  });

  it("Test 3: returns GENERAL_CODING when fetch throws (fail open)", async () => {
    _setAuthOverride({ provider: "api-key", api_key: "test-key" });
    const throwingFetch = async () => { throw new Error("network error"); };
    const result = await classifyIntent("build a feature", "", throwingFetch as unknown as typeof fetch);
    expect(result).toBe("GENERAL_CODING");
  });

  it("Test 4: provider 'anthropic' → returns GENERAL_CODING without calling fetch", async () => {
    _setAuthOverride({ provider: "anthropic", access_token: "oauth-token" });
    const { fn, getCallCount } = mockTrackingFetch("GSD_COMMAND");
    const result = await classifyIntent("build a feature", "", fn as unknown as typeof fetch);
    expect(result).toBe("GENERAL_CODING");
    expect(getCallCount()).toBe(0); // fetch must NOT be called
  });

  it("Test 5: provider 'github-copilot' → returns GENERAL_CODING without calling fetch", async () => {
    _setAuthOverride({ provider: "github-copilot", access_token: "copilot-token" });
    const { fn, getCallCount } = mockTrackingFetch("GSD_COMMAND");
    const result = await classifyIntent("build a feature", "", fn as unknown as typeof fetch);
    expect(result).toBe("GENERAL_CODING");
    expect(getCallCount()).toBe(0);
  });

  it("Test 6: provider 'openrouter' → makes fetch call to api.anthropic.com", async () => {
    _setAuthOverride({ provider: "openrouter", api_key: "openrouter-key" });
    let calledUrl = "";
    const trackingFetch = async (url: string, _opts?: RequestInit) => {
      calledUrl = url;
      return {
        ok: true,
        json: async () => ({
          content: [{ text: JSON.stringify({ intent: "PHASE_QUESTION" }) }],
        }),
      } as unknown as Response;
    };
    const result = await classifyIntent("build a feature", "", trackingFetch as unknown as typeof fetch);
    expect(result).toBe("PHASE_QUESTION");
    expect(calledUrl).toContain("api.anthropic.com");
  });

  it("Test 7: provider 'api-key' → makes fetch call", async () => {
    _setAuthOverride({ provider: "api-key", api_key: "my-api-key" });
    let called = false;
    const trackingFetch = async (_url: string, _opts?: RequestInit) => {
      called = true;
      return {
        ok: true,
        json: async () => ({
          content: [{ text: JSON.stringify({ intent: "GENERAL_CODING" }) }],
        }),
      } as unknown as Response;
    };
    const result = await classifyIntent("write some code", "", trackingFetch as unknown as typeof fetch);
    expect(result).toBe("GENERAL_CODING");
    expect(called).toBe(true);
  });

  it("Test 8: malformed JSON response → returns GENERAL_CODING", async () => {
    _setAuthOverride({ provider: "api-key", api_key: "test-key" });
    const malformedFetch = async (_url: string, _opts?: RequestInit) => {
      return {
        ok: true,
        json: async () => ({
          content: [{ text: "this is not valid JSON {{{" }],
        }),
      } as unknown as Response;
    };
    const result = await classifyIntent("build a feature", "", malformedFetch as unknown as typeof fetch);
    expect(result).toBe("GENERAL_CODING");
  });
});
