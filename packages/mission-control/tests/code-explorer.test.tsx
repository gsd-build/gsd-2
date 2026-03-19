import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("Code Explorer", () => {
  test("useCodeExplorer hook file exists", () => {
    expect(existsSync(join(import.meta.dir, "../src/components/code-explorer/useCodeExplorer.ts"))).toBe(true);
  });
  test("CodeExplorer modal component exists", () => {
    expect(existsSync(join(import.meta.dir, "../src/components/code-explorer/CodeExplorer.tsx"))).toBe(true);
  });
  test("FileTree component exists", () => {
    expect(existsSync(join(import.meta.dir, "../src/components/code-explorer/FileTree.tsx"))).toBe(true);
  });
  test("Sidebar has Code Explorer button", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/layout/Sidebar.tsx"), "utf8");
    expect(src).toContain("Code Explorer");
    expect(src).toContain("onOpenCodeExplorer");
  });
});
