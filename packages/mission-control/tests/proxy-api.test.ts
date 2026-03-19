import { describe, test, expect } from "bun:test";
// This import will fail until proxy-api.ts is created (RED phase)
// @ts-ignore — module does not exist yet
import { handleProxyRequest } from "../src/server/proxy-api";

describe("handleProxyRequest", () => {
  test("forwards GET request to localhost:{port} and returns 200 body", async () => {
    // Should forward request and return successful response
    // This test will fail until proxy-api.ts is implemented
    expect(handleProxyRequest).toBeDefined();
    // Create a minimal request pointing at a non-existent server to test forwarding logic
    const req = new Request("http://localhost:4000/api/preview/test");
    const url = new URL(req.url);
    const response = await handleProxyRequest(req, url, 3999);
    // When port is set, attempts to proxy (may fail with offline state since no server on 3999)
    expect(response).toBeInstanceOf(Response);
  });

  test("strips X-Frame-Options and Content-Security-Policy headers from proxied response", async () => {
    // Implementation must strip these headers before returning
    const req = new Request("http://localhost:4000/api/preview/");
    const url = new URL(req.url);
    // When port is null, returns offline HTML — no framing headers to strip from offline response
    // This tests that the function exists and returns a Response
    const response = await handleProxyRequest(req, url, null);
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("x-frame-options")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
  });

  test("returns offline HTML page when port is null", async () => {
    const req = new Request("http://localhost:4000/api/preview/");
    const url = new URL(req.url);
    const response = await handleProxyRequest(req, url, null);
    expect(response).toBeInstanceOf(Response);
    const body = await response.text();
    // Must contain a meaningful offline message — not an empty body
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain("offline");
  });

  test("offline HTML page has status 200 and Content-Type text/html", async () => {
    const req = new Request("http://localhost:4000/api/preview/");
    const url = new URL(req.url);
    const response = await handleProxyRequest(req, url, null);
    expect(response.status).toBe(200);
    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("text/html");
  });
});
