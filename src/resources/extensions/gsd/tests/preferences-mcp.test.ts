import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveModelMcpConfig } from "../preferences-mcp.ts";
import { validatePreferences } from "../preferences-validation.ts";
import type { ClaudeCodeMcpConfig } from "../preferences-types.ts";

// ─── resolveModelMcpConfig ──────────────────────────────────────────────────

describe("resolveModelMcpConfig", () => {
  it("returns entry when modelId starts with configured prefix", () => {
    const config: ClaudeCodeMcpConfig = {
      per_model: {
        "claude-haiku": { allowed_servers: ["a"] },
      },
    };
    const result = resolveModelMcpConfig("claude-haiku-4-5-20251001", config);
    assert.deepEqual(result, { allowed_servers: ["a"] });
  });

  it("longest-prefix-wins when multiple prefixes match", () => {
    const config: ClaudeCodeMcpConfig = {
      per_model: {
        "claude-haiku": { allowed_servers: ["short"] },
        "claude-haiku-4-5": { allowed_servers: ["long"] },
      },
    };
    const result = resolveModelMcpConfig("claude-haiku-4-5-20251001", config);
    assert.deepEqual(result, { allowed_servers: ["long"] });
  });

  it("returns undefined when no prefix matches", () => {
    const config: ClaudeCodeMcpConfig = {
      per_model: {
        "claude-haiku": { allowed_servers: ["a"] },
      },
    };
    const result = resolveModelMcpConfig("claude-opus-4-7", config);
    assert.equal(result, undefined);
  });

  it("returns undefined for empty per_model", () => {
    const config: ClaudeCodeMcpConfig = { per_model: {} };
    const result = resolveModelMcpConfig("claude-sonnet-4-6", config);
    assert.equal(result, undefined);
  });

  it("returns entry when modelId exactly equals key", () => {
    const config: ClaudeCodeMcpConfig = {
      per_model: {
        "claude-haiku-4-5-20251001": { blocked_servers: ["x"] },
      },
    };
    const result = resolveModelMcpConfig("claude-haiku-4-5-20251001", config);
    assert.deepEqual(result, { blocked_servers: ["x"] });
  });

  it("returns entry with both allowed_servers and blocked_servers", () => {
    const config: ClaudeCodeMcpConfig = {
      per_model: {
        "claude-sonnet": { allowed_servers: ["a", "b"], blocked_servers: ["c"] },
      },
    };
    const result = resolveModelMcpConfig("claude-sonnet-4-6", config);
    assert.deepEqual(result, { allowed_servers: ["a", "b"], blocked_servers: ["c"] });
  });
});

// ─── validatePreferences — claude_code_mcp ─────────────────────────────────

describe("validatePreferences — claude_code_mcp", () => {
  it("passes with a valid claude_code_mcp block", () => {
    const { errors, warnings, preferences } = validatePreferences({
      claude_code_mcp: {
        per_model: {
          "claude-haiku": { allowed_servers: ["mcp-a"], blocked_servers: ["mcp-b"] },
        },
      },
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
    assert.deepEqual(preferences.claude_code_mcp, {
      per_model: {
        "claude-haiku": { allowed_servers: ["mcp-a"], blocked_servers: ["mcp-b"] },
      },
    });
  });

  it("warns and ignores when claude_code_mcp is not an object", () => {
    const { errors, warnings } = validatePreferences({
      claude_code_mcp: "bad-value" as unknown as object,
    });
    assert.deepEqual(errors, []);
    assert.ok(
      warnings.some((w) => w.includes("claude_code_mcp must be an object")),
      `expected warning about non-object, got: ${JSON.stringify(warnings)}`,
    );
  });

  it("warns when per_model entry has non-array allowed_servers", () => {
    const { errors, warnings } = validatePreferences({
      claude_code_mcp: {
        per_model: {
          "claude-haiku": { allowed_servers: "not-an-array" as unknown as string[] },
        },
      },
    });
    assert.deepEqual(errors, []);
    assert.ok(
      warnings.some((w) => w.includes("allowed_servers")),
      `expected warning about allowed_servers, got: ${JSON.stringify(warnings)}`,
    );
  });

  it("warns when per_model entry has non-array blocked_servers", () => {
    const { errors, warnings } = validatePreferences({
      claude_code_mcp: {
        per_model: {
          "claude-haiku": { blocked_servers: 42 as unknown as string[] },
        },
      },
    });
    assert.deepEqual(errors, []);
    assert.ok(
      warnings.some((w) => w.includes("blocked_servers")),
      `expected warning about blocked_servers, got: ${JSON.stringify(warnings)}`,
    );
  });
});
