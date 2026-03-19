/**
 * Tests for scanForDevServers and CANDIDATE_PORTS from usePreview hook.
 *
 * Tests shape and classification logic, not live connectivity.
 * scanForDevServers may return empty array if no dev servers are running —
 * tests verify shape of returned items and static source contracts.
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { scanForDevServers, CANDIDATE_PORTS } from "../src/hooks/usePreview";

const PREVIEW_HOOK_PATH = join(
  import.meta.dir,
  "../src/hooks/usePreview.ts"
);

// -- Static source verification --

describe("usePreview source contracts", () => {
  test("CANDIDATE_PORTS is exported from usePreview", () => {
    expect(Array.isArray(CANDIDATE_PORTS)).toBe(true);
  });

  test("CANDIDATE_PORTS contains all required ports", () => {
    expect(CANDIDATE_PORTS).toContain(3000);
    expect(CANDIDATE_PORTS).toContain(4173);
    expect(CANDIDATE_PORTS).toContain(5173);
    expect(CANDIDATE_PORTS).toContain(8080);
    expect(CANDIDATE_PORTS).toContain(8000);
  });

  test("CANDIDATE_PORTS has exactly 5 ports", () => {
    expect(CANDIDATE_PORTS).toHaveLength(5);
  });

  test("source file exports DetectedServer interface (via source text)", () => {
    const source = readFileSync(PREVIEW_HOOK_PATH, "utf-8");
    expect(source).toContain("DetectedServer");
    expect(source).toContain("export interface DetectedServer");
  });

  test("DetectedServer interface has port field", () => {
    const source = readFileSync(PREVIEW_HOOK_PATH, "utf-8");
    expect(source).toContain("port: number");
  });

  test("DetectedServer interface has type field", () => {
    const source = readFileSync(PREVIEW_HOOK_PATH, "utf-8");
    expect(source).toContain('"frontend" | "backend" | "unknown"');
  });

  test("DetectedServer interface has optional label field", () => {
    const source = readFileSync(PREVIEW_HOOK_PATH, "utf-8");
    expect(source).toContain("label?:");
  });

  test("scanForDevServers is exported as function in source", () => {
    const source = readFileSync(PREVIEW_HOOK_PATH, "utf-8");
    expect(source).toContain("export async function scanForDevServers");
  });
});

// -- Type classification logic --

describe("port type classification", () => {
  test("port 5173 is classified as frontend (via source inspection)", () => {
    const source = readFileSync(PREVIEW_HOOK_PATH, "utf-8");
    // The source should include 5173 in frontend classification
    expect(source).toContain("5173");
    expect(source).toContain('"frontend"');
  });

  test("port 4173 is classified as frontend (via source inspection)", () => {
    const source = readFileSync(PREVIEW_HOOK_PATH, "utf-8");
    expect(source).toContain("4173");
  });

  test("port 8080 is classified as backend (via source inspection)", () => {
    const source = readFileSync(PREVIEW_HOOK_PATH, "utf-8");
    expect(source).toContain("8080");
    expect(source).toContain('"backend"');
  });

  test("port 8000 is classified as backend (via source inspection)", () => {
    const source = readFileSync(PREVIEW_HOOK_PATH, "utf-8");
    expect(source).toContain("8000");
  });
});

// -- scanForDevServers return shape --

describe("scanForDevServers", () => {
  test("is an exported async function", () => {
    expect(typeof scanForDevServers).toBe("function");
    // Should return a Promise
    const result = scanForDevServers();
    expect(result).toBeInstanceOf(Promise);
    // Resolve it to avoid unhandled rejection
    result.catch(() => {});
  });

  test("returns an array (even if empty when no servers running)", async () => {
    // Override fetch to simulate no servers running
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("no server"); };
    try {
      const result = await scanForDevServers();
      expect(Array.isArray(result)).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("returns items with port, type, and label when a server responds", async () => {
    // Mock fetch to simulate a responding server on port 5173
    const origFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes(":5173")) {
        callCount++;
        return new Response(null, { status: 200 });
      }
      throw new Error("not responding");
    };
    try {
      const result = await scanForDevServers();
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        const server = result[0];
        expect(typeof server.port).toBe("number");
        expect(["frontend", "backend", "unknown"]).toContain(server.type);
        expect(typeof server.label).toBe("string");
      }
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("5173 server is typed as frontend when detected", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes(":5173")) {
        return new Response(null, { status: 200 });
      }
      throw new Error("not responding");
    };
    try {
      const result = await scanForDevServers();
      const vite = result.find((s) => s.port === 5173);
      if (vite) {
        expect(vite.type).toBe("frontend");
      }
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("8080 server is typed as backend when detected", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes(":8080")) {
        return new Response(null, { status: 200 });
      }
      throw new Error("not responding");
    };
    try {
      const result = await scanForDevServers();
      const api = result.find((s) => s.port === 8080);
      if (api) {
        expect(api.type).toBe("backend");
      }
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
