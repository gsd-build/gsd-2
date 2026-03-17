import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("ErrorBoundaryFrame", () => {
  test("ErrorBoundaryFrame.tsx exists", () => {
    expect(existsSync(join(import.meta.dir, "../src/components/preview/ErrorBoundaryFrame.tsx"))).toBe(true);
  });
  test("uses getDerivedStateFromError", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/preview/ErrorBoundaryFrame.tsx"), "utf8");
    expect(src).toContain("getDerivedStateFromError");
  });
  test("has fallback UI", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/preview/ErrorBoundaryFrame.tsx"), "utf8");
    expect(src).toContain("Preview unavailable");
  });
});
