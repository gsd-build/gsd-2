// Project/App: GSD-2
// File Purpose: Tests for trustMcpServer() — the /gsd mcp trust write helper.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { trustMcpServer } from "../commands-mcp-status.ts";

function makeTempConfig(content: unknown): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "mcp-trust-"));
  const path = join(dir, ".mcp.json");
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content, null, 2), "utf-8");
  return { dir, path };
}

test("writes trust:true into an mcpServers-keyed config file", () => {
  const { dir, path } = makeTempConfig({
    mcpServers: { foo: { command: "echo", args: ["hi"] } },
  });
  try {
    const result = trustMcpServer(path, "foo");
    assert.equal(result.level, "info");
    assert.match(result.message, /Trusted MCP server/);

    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    const servers = parsed.mcpServers as Record<string, Record<string, unknown>>;
    assert.equal(servers.foo.trust, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writes trust:true into a servers-keyed config file and preserves the key", () => {
  const { dir, path } = makeTempConfig({
    servers: { foo: { command: "echo" } },
  });
  try {
    const result = trustMcpServer(path, "foo");
    assert.equal(result.level, "info");

    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    assert.ok(parsed.servers, "servers key must be preserved");
    assert.equal(parsed.mcpServers, undefined, "must not create an mcpServers key");
    const servers = parsed.servers as Record<string, Record<string, unknown>>;
    assert.equal(servers.foo.trust, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("is idempotent — an already-trusted server is a no-op", () => {
  const { dir, path } = makeTempConfig({
    mcpServers: { foo: { command: "echo", trust: true } },
  });
  try {
    const before = readFileSync(path, "utf-8");
    const result = trustMcpServer(path, "foo");
    assert.equal(result.level, "info");
    assert.match(result.message, /already trusted/);
    assert.equal(readFileSync(path, "utf-8"), before, "file content must be unchanged");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("warns on an unknown server name", () => {
  const { dir, path } = makeTempConfig({
    mcpServers: { foo: { command: "echo" } },
  });
  try {
    const result = trustMcpServer(path, "bar");
    assert.equal(result.level, "warning");
    assert.match(result.message, /not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("warns and does not write for a non-stdio (HTTP) server", () => {
  const { dir, path } = makeTempConfig({
    mcpServers: { remote: { url: "https://example.com/mcp" } },
  });
  try {
    const before = readFileSync(path, "utf-8");
    const result = trustMcpServer(path, "remote");
    assert.equal(result.level, "warning");
    assert.match(result.message, /non-stdio transport/);
    assert.equal(readFileSync(path, "utf-8"), before, "file content must be unchanged");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("errors on a missing config file", () => {
  const result = trustMcpServer("/tmp/definitely-does-not-exist-mcp-trust.json", "foo");
  assert.equal(result.level, "error");
  assert.match(result.message, /not found/);
});

test("errors on malformed JSON", () => {
  const { dir, path } = makeTempConfig("{ not valid json");
  try {
    const result = trustMcpServer(path, "foo");
    assert.equal(result.level, "error");
    assert.match(result.message, /Failed to parse/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("preserves unrelated keys and other servers", () => {
  const { dir, path } = makeTempConfig({
    $schema: "https://example.com/schema.json",
    mcpServers: {
      foo: { command: "echo", args: ["foo"] },
      bar: { url: "https://example.com/mcp" },
    },
  });
  try {
    const result = trustMcpServer(path, "foo");
    assert.equal(result.level, "info");

    const text = readFileSync(path, "utf-8");
    assert.ok(text.endsWith("\n"), "file must end with a trailing newline");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    assert.equal(parsed.$schema, "https://example.com/schema.json");
    const servers = parsed.mcpServers as Record<string, Record<string, unknown>>;
    assert.equal(servers.foo.trust, true);
    assert.deepEqual(servers.foo.args, ["foo"]);
    assert.equal(servers.bar.url, "https://example.com/mcp");
    assert.equal(servers.bar.trust, undefined, "untargeted server must be untouched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
