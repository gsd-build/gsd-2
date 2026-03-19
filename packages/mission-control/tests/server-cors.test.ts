/**
 * B6: CORS headers use Response reconstruction (not mutation).
 * Origin is http://127.0.0.1:4200 (not localhost:4000).
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const serverTs = readFileSync(
  resolve(import.meta.dir, "../src/server.ts"),
  "utf-8"
);

describe("B6: CORS — addCorsHeaders uses Response reconstruction", () => {
  it("creates new Headers from response.headers", () => {
    expect(serverTs).toContain("new Headers(response.headers)");
  });

  it("constructs a new Response with body and status", () => {
    expect(serverTs).toContain("new Response(response.body, { status: response.status, headers })");
  });

  it("does NOT mutate response.headers directly", () => {
    // The old pattern: response.headers.set("Access-Control-Allow-Origin", ...)
    // Should no longer exist — only headers.set(...) on the new Headers object
    expect(serverTs).not.toContain('response.headers.set("Access-Control-Allow-Origin"');
  });

  it("uses http://127.0.0.1 as CORS origin (not localhost)", () => {
    expect(serverTs).toContain("http://127.0.0.1:");
    expect(serverTs).not.toContain('"http://localhost:4000"');
  });

  it("includes X-Window-Id in allowed headers", () => {
    expect(serverTs).toContain("X-Window-Id");
  });
});
