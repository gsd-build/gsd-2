import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("scanForDevServers", () => {
  test("usePreview exports scanForDevServers", () => {
    const src = readFileSync(join(import.meta.dir, "../src/hooks/usePreview.ts"), "utf8");
    expect(src).toContain("export async function scanForDevServers");
  });
  test("CANDIDATE_PORTS includes standard dev ports", () => {
    const src = readFileSync(join(import.meta.dir, "../src/hooks/usePreview.ts"), "utf8");
    expect(src).toContain("3000");
    expect(src).toContain("5173");
    expect(src).toContain("8080");
  });
  test("DetectedServer type has port, type, label", () => {
    const src = readFileSync(join(import.meta.dir, "../src/hooks/usePreview.ts"), "utf8");
    expect(src).toContain("DetectedServer");
    expect(src).toContain("port: number");
    expect(src).toContain('type: "frontend" | "backend" | "unknown"');
  });
});
